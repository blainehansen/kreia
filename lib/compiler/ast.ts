import { Dict, tuple as t } from '@ts-std/types'
import { Maybe, Some, None } from '@ts-std/monads'

import { debug, LogError, NonEmpty, NonLone } from '../utils'

export enum BaseModifier {
	Many = '+',
	Maybe = '?',
	MaybeMany = '*',
}

export type Modifier = BaseModifier | undefined
export namespace Modifier {
	export function is_optional(modifer: Modifier) {
		switch (modifer) {
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
	constructor(readonly modifer: Modifier) {
		this.is_optional = Modifier.is_optional(modifer)
		this.needs_decidable = modifer !== undefined
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

export namespace Node {
	export function flatten(nodes: NonEmpty<Node>): Node {
		return NonLone.from_array(nodes).match({
			some: non_lone => new Paren(non_lone, undefined),
			none: () => nodes[0]
		})
	}
}

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
		return nodes.all(node => node.is_optional)
	}

	export function screen_definitions(definitions: NonLone<Definition>) {
		const empty_definitions = definitions.filter(all_optional)
		return empty_definitions.length === 0
			? Ok(definitions)
			: Err(empty_definitions)
	}
}

export class Paren extends BaseNode {
	readonly type: 'Paren' = 'Paren'
	constructor(
		readonly modifer: BaseModifier,
		readonly nodes: NonLone<Node>,
	) { super(modifier) }
}
export function many(...nodes: NonLone<Node>) { return new Paren(Modifier.Many, nodes) }
export function maybe(...nodes: NonLone<Node>) { return new Paren(Modifier.Maybe, nodes) }
export function maybe_many(...nodes: NonLone<Node>) { return new Paren(Modifier.MaybeMany, nodes) }

export class Consume extends BaseNode {
	readonly type: 'Consume' = 'Consume'
	constructor(
		readonly modifer: Modifier,
		readonly token_names: NonEmpty<string>,
	) { super(modifier) }
}
export function consume(...token_names: NonEmpty<string>) { return new Consume(undefined, token_names) }
export function many_consume(...token_names: NonEmpty<string>) { return new Consume(Modifier.Many, token_names) }
export function maybe_consume(...token_names: NonEmpty<string>) { return new Consume(Modifier.Maybe, token_names) }
export function maybe_many_consume(...token_names: NonEmpty<string>) { return new Consume(Modifier.MaybeMany, token_names) }

export class Or extends BaseNode {
	readonly type: 'Or' = 'Or'
	readonly choices: NonLone<Definition>
	constructor(
		readonly modifer: Modifier,
		choices: NonLone<Definition>,
	) {
		super(modifier)
		this.choices = Definition.screen_definitions(choices).match({
			ok: choices => choices,
			err: empty_definitions => {
				throw new LogError([
					`these choices in an Or node had only optional nodes:\n`,
					empty_definitions
					'',
					`it doesn't make a lot of sense to have a branch of an Or node be all optional, and this is probably a mistake`,
					`consider moving this optional item out of the Or node, or making the Or node optional`,
				], 4)
			}
		})
	}
}
export function or(...choices: NonLone<Definition>) { return new Or(undefined, choices) }
export function many_or(...choices: NonLone<Definition>) { return new Or(Modifier.Many, choices) }
export function maybe_or(...choices: NonLone<Definition>) { return new Or(Modifier.Maybe, choices) }
export function maybe_many_or(...choices: NonLone<Definition>) { return new Or(Modifier.MaybeMany, choices) }

export class Subrule extends BaseNode {
	readonly type: 'Subrule' = 'Subrule'
	readonly always_optional: boolean
	constructor(
		readonly modifer: Modifier,
		readonly rule_name: string,
	) { super(modifier) }
}
export function subrule(rule_name: string) { return new Subrule(undefined, rule_name) }
export function many_subrule(rule_name: string) { return new Subrule(Modifier.Many, rule_name) }
export function maybe_subrule(rule_name: string) { return new Subrule(Modifier.Maybe, rule_name) }
export function maybe_many_subrule(rule_name: string) { return new Subrule(Modifier.MaybeMany, rule_name) }

export class MacroCall extends BaseNode {
	readonly type: 'MacroCall' = 'MacroCall'
	readonly args: NonLone<Definition>
	constructor(
		readonly modifer: Modifier,
		readonly macro_name: string,
		args: NonLone<Definition>,
	) {
		super(modifier)
		this.args = Definition.screen_definitions(args)
	}
}
export function macro_call(macro_name: string, ...args: NonLone<Definition>) { return new MacroCall(undefined, macro_name, args) }
export function many_macro_call(macro_name: string, ...args: NonLone<Definition>) { return new MacroCall(Modifier.Many, macro_name, args) }
export function maybe_macro_call(macro_name: string, ...args: NonLone<Definition>) { return new MacroCall(Modifier.Maybe, macro_name, args) }
export function maybe_many_macro_call(macro_name: string, ...args: NonLone<Definition>) { return new MacroCall(Modifier.MaybeMany, macro_name, args) }
export function many_separated(body: Definition, separator: Definition) {
	return new MacroCall(undefined, 'many_separated', body, separator)
}
export function maybe_many_separated(body: Definition, separator: Definition) {
	return new MacroCall(Modifier.Maybe, 'many_separated', body, separator)
}

export class Var extends BaseNode {
	readonly type: 'Var' = 'Var'
	constructor(
		readonly modifer: Modifier,
		readonly arg_name: string,
	) { super(modifier) }
}
export function _var(arg_name: string) { return new Var(undefined, arg_name) }
export function many_var(arg_name: string) { return new Var(Modifier.Many, arg_name) }
export function maybe_var(arg_name: string) { return new Var(Modifier.Maybe, arg_name) }
export function maybe_many_var(arg_name: string) { return new Var(Modifier.MaybeMany, arg_name) }

export class LockingVar extends BaseNode {
	readonly type: 'LockingVar' = 'LockingVar'
	constructor(
		readonly modifer: Modifier,
		readonly locking_arg_name: string,
	) { super(modifier) }
}
export function locking_var(locking_arg_name: string) { return new LockingVar(undefined, locking_arg_name) }
export function many_locking_var(locking_arg_name: string) { return new LockingVar(Modifier.Many, locking_arg_name) }
export function maybe_locking_var(locking_arg_name: string) { return new LockingVar(Modifier.Maybe, locking_arg_name) }
export function maybe_many_locking_var(locking_arg_name: string) { return new LockingVar(Modifier.MaybeMany, locking_arg_name) }


export class Arg {
	constructor(readonly name: string) {}
}

export class LockingArg {
	constructor(readonly name: string, readonly token_name: string) {}
}

function index_locking_args(input_locking_args: LockingArg[] | undefined) {
	const locking_args = input_locking_args || []
	return locking_args.unique_index_by('name').match({
		ok: locking_args => locking_args,
		err: ([name,]) => { throw new Error(`some locking tokens have the same name: ${name}`) }
	})
}


class TokenDef {
	readonly type: 'TokenDef' = 'TokenDef'
	constructor(readonly name: string, readonly def: TokenSpec) {}
}
export function TokenDef(name: string, def: TokenSpec) {
	return new TokenDef(name, def)
}

class Rule {
	readonly type: 'Rule' = 'Rule'
	readonly always_optional: boolean
	constructor(
		readonly name: string,
		readonly definition: Definition,
		readonly locking_args?: LockingArg[],
	) {
		this.locking_args = index_locking_args(locking_args)
		this.always_optional = Definition.all_optional(definition)
	}
}
export function Rule(name: string, definition: Definition, locking_args?: LockingArg[]) {
	return new Rule(name, definition, locking_args)
}

class Macro {
	readonly type: 'Macro' = 'Macro'
	readonly always_optional: boolean
	constructor(
		readonly name: string,
		readonly args: NonEmpty<Arg>,
		readonly definition: Definition,
		readonly locking_args?: LockingArg[],
	) {
		this.locking_args = index_locking_args(locking_args)
		this.always_optional = Definition.all_optional(definition)
	}
}
export function Macro(name: string, args: NonEmpty<Arg>, definition: Definition, locking_args?: LockingArg[]) {
	return new Macro(name, args, definition, locking_args)
}

class VirtualLexerUsage {
	readonly type: 'VirtualLexerUsage' = 'VirtualLexerUsage'
	constructor(
		readonly virtual_lexer_name: string,
		readonly path: string,
		readonly args: TokenSpec[],
		readonly exposed_tokens: Dict<true>,
	) {}
}
export function VirtualLexerUsage(virtual_lexer_name: string, path: string, args: TokenSpec[], exposed_tokens: Dict<true>) {
	return new VirtualLexerUsage(virtual_lexer_name, path, args, exposed_tokens)
}

export type GrammarItem =
	| TokenDef
	| Rule
	| Macro
	| VirtualLexerUsage

export type Grammar = GrammarItem[]

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



export type Scope = Readonly<{ locking_args: Dict<LockingArg>, args: Dict<Definition> }>
export function Scope(locking_args: Dict<LockingArg> | undefined, args: Dict<Definition> | undefined): Scope {
	return {
		locking_args: locking_args || {},
		args: args || {},
	}
}
export type ScopeStack = { current: Scope, previous: Scope[] }
export namespace Scope {
	export function for_rule(rule: Rule): ScopeStack {
		return { current: Scope(rule.locking_args, undefined), previous: [] }
	}
	export function for_macro({ current, previous }: ScopeStack, macro: Macro, call: MacroCall): ScopeStack {
		const args = zip_args(macro, call).unwrap()
		return { current: Scope(macro.locking_args, args), previous: [...previous, current] }
	}
	export function for_var({ current, previous }: ScopeStack, var_node: Var): [Node, ScopeStack] {
		return t(
			Maybe.from_nillable(current[var_node.arg_name]).unwrap()
			{
				current: previous.maybe_get(-1).unwrap(),
				previous: previous.slice(0, previous.length - 1),
			},
		)
	}
	export function in_scope(definitions: Node[], scope: ScopeStack): DefinitionTuple[] {
		return definitions.map(d => t(d, scope))
	}
}
export type DefinitionTuple = [Node, ScopeStack]
