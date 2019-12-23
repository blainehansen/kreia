import { Dict, tuple as t } from '@ts-std/types'
import { Result, Ok, Err, Maybe, Some, None } from '@ts-std/monads'

import { debug, LogError, NonEmpty, NonLone } from '../utils'
import { TokenSpec } from '../runtime/lexer'

export enum BaseModifier {
	Many = '+',
	Maybe = '?',
	MaybeMany = '*',
	// NotEnough = '&',
	// ManyNotEnough = '&+',
}

export type Modifier = BaseModifier | undefined
export namespace Modifier {
	export function is_optional(modifier: Modifier) {
		switch (modifier) {
			case '+': return false
			case '?': return true
			case '*': return true
			default: return false
		}
	}
}


abstract class BaseNode {
	readonly is_optional: boolean
	readonly needs_decidable: boolean
	constructor(readonly modifier: Modifier) {
		this.is_optional = Modifier.is_optional(modifier)
		this.needs_decidable = modifier !== undefined
	}
}

export type Node =
	| Consume
	| Or
	| Subrule
	| MacroCall
	| Var
	| LockingVar
	| Paren


function zip_args(macro: Macro, call: MacroCall): Result<Dict<Definition>> {
	const args = macro.args.slice()
	const definitions = call.args.slice()

	const zipped = {} as Dict<Definition>
	let arg
	while (arg = args.shift()) {
		const definition = definitions.shift()
		if (definition === undefined)
			return Err(`not enough args: macro has ${debug(macro.args)}, but was given ${debug(call.args)}`)
		zipped[arg.name] = definition
	}

	if (definitions.length !== 0)
		return Err(`too many args: macro has ${debug(macro.args)}, but was given ${debug(call.args)}`)

	return Ok(zipped)
}

export type Definition = NonEmpty<Node>
export namespace Definition {
	export function all_optional(nodes: Definition) {
		return nodes.every(node => node.is_optional)
	}

	export function screen_all_optional<A extends Definition[]>(
		definitions: A,
	): Result<A, Definition[]> {
		const empty_definitions = definitions.filter(all_optional)
		return empty_definitions.length === 0
			? Ok(definitions)
			: Err(empty_definitions)
	}

	export function flatten(nodes: Definition) {
		return NonLone.from_array(nodes).match({
			some: non_lone => non_lone as Node | Definition,
			none: () => nodes[0],
		})
	}
}

export class Paren extends BaseNode {
	readonly type: 'Paren' = 'Paren'
	constructor(
		readonly modifier: BaseModifier,
		readonly nodes: NonLone<Node>,
	) { super(modifier) }

	purify() {
		return this.nodes.slice() as Definition
	}
}
export function many(...nodes: NonLone<Node>) { return new Paren(BaseModifier.Many, nodes) }
export function maybe(...nodes: NonLone<Node>) { return new Paren(BaseModifier.Maybe, nodes) }
export function maybe_many(...nodes: NonLone<Node>) { return new Paren(BaseModifier.MaybeMany, nodes) }

export class Consume extends BaseNode {
	readonly type: 'Consume' = 'Consume'
	constructor(
		readonly modifier: Modifier,
		readonly token_names: NonEmpty<string>,
	) { super(modifier) }

	purify() {
		return [new Consume(undefined, this.token_names)] as Definition
	}
}
export function consume(...token_names: NonEmpty<string>) { return new Consume(undefined, token_names) }
export function many_consume(...token_names: NonEmpty<string>) { return new Consume(BaseModifier.Many, token_names) }
export function maybe_consume(...token_names: NonEmpty<string>) { return new Consume(BaseModifier.Maybe, token_names) }
export function maybe_many_consume(...token_names: NonEmpty<string>) { return new Consume(BaseModifier.MaybeMany, token_names) }

export class Or extends BaseNode {
	readonly type: 'Or' = 'Or'
	readonly choices: NonLone<Definition>
	constructor(
		readonly modifier: Modifier,
		choices: NonLone<Definition>,
	) {
		super(modifier)
		this.choices = Definition.screen_all_optional(choices).match({
			ok: choices => choices,
			err: empty_definitions => {
				throw new LogError([
					`these choices in an Or node had only optional nodes:\n`,
					empty_definitions,
					'',
					`it doesn't make a lot of sense to have a branch of an Or node be all optional, and this is probably a mistake`,
					`consider moving this optional item out of the Or node, or making the Or node itself optional`,
				], 4)
			}
		})
	}

	purify() {
		return [new Or(undefined, this.choices)] as Definition
	}
}
export function or(...choices: NonLone<Definition>) { return new Or(undefined, choices) }
export function many_or(...choices: NonLone<Definition>) { return new Or(BaseModifier.Many, choices) }
export function maybe_or(...choices: NonLone<Definition>) { return new Or(BaseModifier.Maybe, choices) }
export function maybe_many_or(...choices: NonLone<Definition>) { return new Or(BaseModifier.MaybeMany, choices) }

export class Subrule extends BaseNode {
	readonly type: 'Subrule' = 'Subrule'
	constructor(
		readonly modifier: Modifier,
		readonly rule_name: string,
	) { super(modifier) }

	purify() {
		return [new Subrule(undefined, this.rule_name)] as Definition
	}
}
export function subrule(rule_name: string) { return new Subrule(undefined, rule_name) }
export function many_subrule(rule_name: string) { return new Subrule(BaseModifier.Many, rule_name) }
export function maybe_subrule(rule_name: string) { return new Subrule(BaseModifier.Maybe, rule_name) }
export function maybe_many_subrule(rule_name: string) { return new Subrule(BaseModifier.MaybeMany, rule_name) }

export class MacroCall extends BaseNode {
	readonly type: 'MacroCall' = 'MacroCall'
	readonly args: NonEmpty<Definition>
	constructor(
		readonly modifier: Modifier,
		readonly macro_name: string,
		args: NonEmpty<Definition>,
	) {
		super(modifier)
		this.args = Definition.screen_all_optional(args).unwrap()
	}

	purify() {
		return [new MacroCall(undefined, this.macro_name, this.args)] as Definition
	}
}
export function macro_call(macro_name: string, ...args: NonEmpty<Definition>) { return new MacroCall(undefined, macro_name, args) }
export function many_macro_call(macro_name: string, ...args: NonEmpty<Definition>) { return new MacroCall(BaseModifier.Many, macro_name, args) }
export function maybe_macro_call(macro_name: string, ...args: NonEmpty<Definition>) { return new MacroCall(BaseModifier.Maybe, macro_name, args) }
export function maybe_many_macro_call(macro_name: string, ...args: NonEmpty<Definition>) { return new MacroCall(BaseModifier.MaybeMany, macro_name, args) }
export function many_separated(body: Definition, separator: Definition) {
	return new MacroCall(undefined, 'many_separated', [body, separator])
}
export function maybe_many_separated(body: Definition, separator: Definition) {
	return new MacroCall(BaseModifier.Maybe, 'many_separated', [body, separator])
}

export class Var extends BaseNode {
	readonly type: 'Var' = 'Var'
	constructor(
		readonly modifier: Modifier,
		readonly arg_name: string,
	) { super(modifier) }

	purify() {
		return [new Var(undefined, this.arg_name)] as Definition
	}
}
export function _var(arg_name: string) { return new Var(undefined, arg_name) }
export function many_var(arg_name: string) { return new Var(BaseModifier.Many, arg_name) }
export function maybe_var(arg_name: string) { return new Var(BaseModifier.Maybe, arg_name) }
export function maybe_many_var(arg_name: string) { return new Var(BaseModifier.MaybeMany, arg_name) }

export class LockingVar extends BaseNode {
	readonly type: 'LockingVar' = 'LockingVar'
	constructor(
		readonly modifier: Modifier,
		readonly locking_arg_name: string,
	) { super(modifier) }

	purify() {
		return [new LockingVar(undefined, this.locking_arg_name)] as Definition
	}
}
export function locking_var(locking_arg_name: string) { return new LockingVar(undefined, locking_arg_name) }
export function many_locking_var(locking_arg_name: string) { return new LockingVar(BaseModifier.Many, locking_arg_name) }
export function maybe_locking_var(locking_arg_name: string) { return new LockingVar(BaseModifier.Maybe, locking_arg_name) }
export function maybe_many_locking_var(locking_arg_name: string) { return new LockingVar(BaseModifier.MaybeMany, locking_arg_name) }


export class Arg {
	constructor(readonly name: string) {}
}

export class LockingArg {
	constructor(readonly name: string, readonly token_name: string) {}
}

function index_locking_args(input_locking_args: LockingArg[] | undefined):  Dict<LockingArg> {
	const locking_args = input_locking_args || []
	return locking_args.unique_index_by('name').match({
		ok: locking_args => locking_args,
		err: ([name,]) => { throw new Error(`some locking tokens have the same name: ${name}`) }
	})
}


export class TokenDef {
	readonly type: 'TokenDef' = 'TokenDef'
	constructor(readonly name: string, readonly def: TokenSpec) {}
}

export class Rule {
	readonly type: 'Rule' = 'Rule'
	// readonly always_optional: boolean
	readonly definition: Definition
	readonly locking_args: Dict<LockingArg>
	readonly ordered_locking_args: LockingArg[]
	constructor(
		readonly name: string,
		definition: Definition,
		locking_args?: LockingArg[],
	) {
		// this.always_optional = Definition.all_optional(definition)
		this.definition = Definition.screen_all_optional(t(definition)).unwrap()[0]
		this.locking_args = index_locking_args(locking_args)
		this.ordered_locking_args = locking_args || []
	}
}

export class Macro {
	readonly type: 'Macro' = 'Macro'
	// readonly always_optional: boolean
	readonly definition: Definition
	readonly locking_args: Dict<LockingArg>
	readonly ordered_locking_args: LockingArg[]
	constructor(
		readonly name: string,
		readonly args: NonEmpty<Arg>,
		definition: Definition,
		locking_args?: LockingArg[],
	) {
		// this.always_optional = Definition.all_optional(definition)
		this.definition = Definition.screen_all_optional(t(definition)).unwrap()[0]
		this.locking_args = index_locking_args(locking_args)
		this.ordered_locking_args = locking_args || []
	}
}

export class VirtualLexerUsage {
	readonly type: 'VirtualLexerUsage' = 'VirtualLexerUsage'
	constructor(
		readonly virtual_lexer_name: string,
		readonly path: string,
		readonly args: TokenSpec[],
		readonly exposed_tokens: Dict<true>,
	) {}
}

export type GrammarItem =
	| TokenDef
	| Rule
	| Macro
	| VirtualLexerUsage

export type Grammar = GrammarItem[]


export namespace Registry {
	let registered_tokens = {} as Dict<TokenDef>
	export function set_registered_tokens(new_registered_tokens: Dict<TokenDef>) {
		registered_tokens = new_registered_tokens
	}
	let registered_rules = {} as Dict<Rule>
	export function set_registered_rules(new_registered_rules: Dict<Rule>) {
		registered_rules = new_registered_rules
	}
	let registered_macros = {} as Dict<Macro>
	export function set_registered_macros(new_registered_macros: Dict<Macro>) {
		registered_macros = new_registered_macros
	}
	let registered_virtual_lexers = {} as Dict<VirtualLexerUsage>
	export function set_registered_virtual_lexers(new_registered_virtual_lexers: Dict<VirtualLexerUsage>) {
		registered_virtual_lexers = new_registered_virtual_lexers
	}

	export function get_token(token_name: string): Maybe<string> {
		if (token_name in registered_tokens)
			return Some(token_name)

		for (const virtual_lexer of Object.values(registered_virtual_lexers))
			if (token_name in virtual_lexer.exposed_tokens)
				return Some(token_name)

		return None
	}
	export function get_rule(rule_name: string): Maybe<Rule> {
		return Maybe.from_nillable(registered_rules[rule_name])
	}
	export function get_macro(macro_name: string): Maybe<Macro> {
		return Maybe.from_nillable(registered_macros[macro_name])
	}

	export function register_tokens(token_defs: TokenDef[]) {
		registered_tokens = token_defs.unique_index_by('name').unwrap()
	}
	export function register_rules(rules: Rule[]) {
		registered_rules = rules.unique_index_by('name').unwrap()
	}
	export function register_macros(macros: Macro[]) {
		registered_macros = macros.unique_index_by('name').unwrap()
	}
	export function register_virtual_lexers(virtual_lexers: VirtualLexerUsage[]) {
		registered_virtual_lexers = virtual_lexers.unique_index_by('virtual_lexer_name').unwrap()
	}
}


export type Scope<P = {}> = Readonly<{ locking_args: Dict<LockingArg>, args: Dict<Definition> }> & P

export function Scope<P = {}>(
	locking_args: Dict<LockingArg> | undefined,
	args: Dict<Definition> | undefined,
	payload?: P,
): Scope {
	return { locking_args: locking_args || {}, args: args || {}, ...(payload || {} as P) }
}
export type ScopeStack<P = {}> = { current: Scope<P>, previous: Scope<P>[] }
export namespace Scope {
	export function for_rule<P = {}>(rule: Rule, payload?: P): ScopeStack<P> {
		return { current: Scope(rule.locking_args, undefined, payload) as Scope<P>, previous: [] }
	}
	export function for_macro<P = {}>(macro: Macro, payload?: P): ScopeStack<P> {
		return { current: Scope(macro.locking_args, undefined, payload) as Scope<P>, previous: [] }
	}
	export function for_macro_call<P = {}>(
		{ current, previous }: ScopeStack<P>,
		macro: Macro,
		call: MacroCall,
		payload?: P,
	): ScopeStack<P> {
		const args = zip_args(macro, call).unwrap()
		return {
			current: Scope(macro.locking_args, args, payload) as Scope<P>,
			previous: [...previous, current],
		}
	}
	export function for_var<P = {}>(
		{ current, previous }: ScopeStack<P>,
		var_node: Var,
		payload?: P,
	): [Definition, ScopeStack<P>] {
		return t(
			Maybe.from_nillable(current.args[var_node.arg_name]).unwrap(),
			{
				current: { ...previous.maybe_get(-1).unwrap(), ...(payload || {} as P) },
				previous: previous.slice(0, previous.length - 1),
			},
		)
	}
	export function for_locking_var<P = {}>(
		{ current }: ScopeStack<P>,
		locking_var: LockingVar,
	): string {
		return Maybe.from_nillable(current.locking_args[locking_var.locking_arg_name]).unwrap().token_name
	}

	export function zip_definitions<L extends Definition[], P = {}>(
		definitions: L, scope: ScopeStack<P>,
	): TForL<[Definition, ScopeStack<P>], L> {
		return definitions.map(d => t(d, scope)) as TForL<[Definition, ScopeStack<P>], L>
	}
	export function zip_nodes<L extends Node[], P = {}>(
		nodes: L, scope: ScopeStack<P>,
	): TForL<[Node, ScopeStack<P>], L> {
		return nodes.map(node => t(node, scope)) as TForL<[Node, ScopeStack<P>], L>
	}
}


type TForL<T, L extends any[]> = { [K in keyof L]: T }

