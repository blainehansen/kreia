import { Dict, tuple as t } from '@ts-std/types'
import { Maybe as Option, Some, None } from '@ts-std/monads'

import { Data } from '../utils'

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
	abstract readonly modifer: Modifier

	get is_optional() {
		return Modifier.is_optional(this.modifer)
	}
	get needs_decidable() {
		return this.modifer !== undefined
	}
}

export type Node =
	| Consume
	| Or
	| Subrule
	| MacroCall
	| Var
	| LockingVar
	| Wrap

export namespace Node {
	export function flatten(nodes: NonEmpty<Node>): Node {
		return NonLone.from_array(nodes).match({
			some: non_lone => new Wrap(non_lone, undefined),
			none: () => nodes[0]
		})
	}

	export function zip_args(macro: Macro, call: MacroCall): Result<Dict<Definition>> {
		const def_args = macro.args.slice()
		const args = call.args.slice()
		let a, b
		const zipped = {} as Dict<Definition>
		while (a = def_args.shift()) {
			b = args.shift()
			if (b === undefined)
				return Err(`not enough args: have ${macro.args}, but have ${call.args}`)
			zipped[a.name] = b
		}

		if (args.length !== 0)
			return Err(`too many args: have ${macro.args}, have have ${call.args}`)

		return Ok(zipped)
	}
}

export class Definition {
	readonly all_optional: boolean
	constructor(readonly nodes: NonEmpty<Node>) {
		this.all_optional = nodes.all(node => node.is_optional)
	}

	static screen_definitions(definitions: NonLone<Definition>): Result<NonLone<Definition>, Definition[]> {
		const empty_definitions = definitions.filter(definition => definition.all_optional)
		return empty_definitions.length === 0
			? Ok(definitions)
			: Err(empty_definitions)
	}
}

export class Wrap extends BaseNode {
	readonly type: 'Wrap' = 'Wrap'
	constructor(readonly modifer: BaseModifier, readonly nodes: NonLone<Node>) { super() }
}
export function many(nodes: NonLone<Node>) { return new Wrap(Modifier.Many, nodes) }
export function maybe(nodes: NonLone<Node>) { return new Wrap(Modifier.Maybe, nodes) }
export function maybe_many(nodes: NonLone<Node>) { return new Wrap(Modifier.MaybeMany, nodes) }

export class Consume extends BaseNode {
	readonly type: 'Consume' = 'Consume'
	constructor(readonly modifer: Modifier, readonly token_names: NonEmpty<string>) { super() }
}
export function consume(token_names: NonEmpty<string>) { return new Consume(undefined, token_names) }
export function many_consume(token_names: NonEmpty<string>) { return new Consume(Modifier.Many, token_names) }
export function maybe_consume(token_names: NonEmpty<string>) { return new Consume(Modifier.Maybe, token_names) }
export function maybe_many_consume(token_names: NonEmpty<string>) { return new Consume(Modifier.MaybeMany, token_names) }

export class Or extends BaseNode {
	readonly type: 'Or' = 'Or'
	readonly choices: Result<NonLone<Definition>, Definition[]>
	constructor(readonly modifer: Modifier, choices: NonLone<Definition>) {
		super()
		this.choices = Definition.screen_definitions(choices)
	}
}
export function or(choices: NonLone<Definition>) { return new Or(undefined, choices) }
export function many_or(choices: NonLone<Definition>) { return new Or(Modifier.Many, choices) }
export function maybe_or(choices: NonLone<Definition>) { return new Or(Modifier.Maybe, choices) }
export function maybe_many_or(choices: NonLone<Definition>) { return new Or(Modifier.MaybeMany, choices) }

export class Subrule extends BaseNode {
	readonly type: 'Subrule' = 'Subrule'
	constructor(readonly modifer: Modifier, readonly rule_name: string) { super() }
}
export function subrule(rule_name: string) { return new Subrule(undefined, rule_name) }
export function many_subrule(rule_name: string) { return new Subrule(Modifier.Many, rule_name) }
export function maybe_subrule(rule_name: string) { return new Subrule(Modifier.Maybe, rule_name) }
export function maybe_many_subrule(rule_name: string) { return new Subrule(Modifier.MaybeMany, rule_name) }

export class MacroCall extends BaseNode {
	readonly type: 'MacroCall' = 'MacroCall'
	readonly args: Result<NonLone<Definition>, Definition[]>
	constructor(readonly modifer: Modifier, readonly macro_name: string, args: NonLone<Definition>) {
		super()
		this.args = Definition.screen_definitions(args)
	}
}
export function macro_call(macro_name: string, args: NonLone<Definition>) { return new Subrule(undefined, macro_name, args) }
export function many_macro_call(macro_name: string, args: NonLone<Definition>) { return new Subrule(Modifier.Many, macro_name, args) }
export function maybe_macro_call(macro_name: string, args: NonLone<Definition>) { return new Subrule(Modifier.Maybe, macro_name, args) }
export function maybe_many_macro_call(macro_name: string, args: NonLone<Definition>) { return new Subrule(Modifier.MaybeMany, macro_name, args) }

export class Var extends BaseNode {
	readonly type: 'Var' = 'Var'
	constructor(readonly modifer: Modifier, readonly arg_name: string) { super() }
}
export function _var(arg_name: string) { return new Var(undefined, arg_name) }
export function many_var(arg_name: string) { return new Var(Modifier.Many, arg_name) }
export function maybe_var(arg_name: string) { return new Var(Modifier.Maybe, arg_name) }
export function maybe_many_var(arg_name: string) { return new Var(Modifier.MaybeMany, arg_name) }

export class LockingVar extends BaseNode {
	readonly type: 'LockingVar' = 'LockingVar'
	constructor(readonly modifer: Modifier, readonly locking_arg_name: string) { super() }
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
		err: ([name,]) => { throw new Error(`some locking_args have the same name: ${name}`) }
	})
}


export class TokenDef {
	readonly type: 'TokenDef' = 'TokenDef'
	constructor(readonly name: string, def: TokenSpec) {}
}

export class Rule {
	readonly type: 'Rule' = 'Rule'
	constructor(
		readonly name: string,
		readonly definition: NonEmpty<Definition>,
		readonly locking_args?: LockingArg[],
	) {
		this.locking_args = index_locking_args(locking_args)
	}
}

export class Macro {
	readonly type: 'Macro' = 'Macro'
	constructor(
		readonly name: string,
		readonly args: NonEmpty<Arg>,
		readonly definition: NonEmpty<Definition>,
		readonly locking_args?: LockingArg[],
	) {
		this.locking_args = index_locking_args(locking_args)
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

export function get_token(token_name: string): Option<string> {
	if (token_name in registered_tokens)
		return Some(token_name)

	for (const virtual_lexer of Object.values(registered_virtual_lexers))
		if (token_name in virtual_lexer.exposed_tokens)
			return Some(token_name)

	return None
}
export function get_rule(rule_name: string): Option<Rule> {
	return Option.from_nillable(registered_rules[rule_name])
}
export function get_macro(macro_name: string): Option<Macro> {
	return Option.from_nillable(registered_macros[macro_name])
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



export type Scope = Readonly<{ locking_args: LockingArg[], args: NonEmpty<Definition> }>
export function Scope(locking_args: LockingArg[] | undefined, args: NonEmpty<Definition> | undefined): Scope {
	return { locking_args: locking_args || empty_ordered_dict, args: args || empty_ordered_dict }
}
export type ScopeStack = { current: Scope, previous: Scope[] }
export namespace Scope {
	export function for_rule(rule: Rule): ScopeStack {
		return { current: Scope(rule.locking_args, undefined), previous: [] }
	}
	export function for_macro({ current, previous }: ScopeStack, macro: Macro, call: MacroCall): ScopeStack {
		return { current: Scope(macro.locking_args, call.args), previous: [...previous, current] }
	}
	export function for_var({ current, previous }: ScopeStack, var_node: Var): [Node, ScopeStack] {
		return t(
			current.get_by_name(var_node.arg_name).unwrap(),
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



type AstIterItem = string | DefinitionTuple[] | Continue
type AstIter = IterWrapper<AstIterItem>

function* iterate_definition(
	...[definition, scope]: DefinitionTuple
): Generator<AstIterItem, void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {

	case 'Or':
		const [gathered, ] = gather_branches(nodes_to_visit, scope)[0]
		yield [...in_scope(node.choices, scope), ...gathered]
		continue
	case 'Consume':
		yield* node.token_names.map(token_name => get_token(token_name).unwrap())
		continue

	case 'Subrule': {
		const rule = get_rule(node.rule_name).unwrap()
		const rule_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
		const [gathered, all_maybe] = gather_branches(rule.definition.slice(), rule_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(rule.definition, rule_scope)

		continue
	}

	case 'MacroCall': {
		const macro = get_macro(node.macro_name).unwrap()
		const macro_scope = push_scope(scope, macro.locking_args, node.args)
		const [gathered, all_maybe] = gather_branches(macro.definition.slice(), macro_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(macro.definition, macro_scope)

		continue
	}

	case 'Var': {
		// Vars use the parent_scope
		const arg_definition = scope.current.args.get_by_name(node.arg_name).unwrap()
		const var_scope = pop_scope(scope)
		// const [gathered, all_maybe] = gather_branches(arg_definition.slice(), var_scope)
		const [gathered, all_maybe] = gather_branches([...arg_definition, ...nodes_to_visit], var_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(arg_definition, var_scope)

		continue
	}

	case 'LockingVar':
		const locking_arg = scope.current.locking_args.get_by_name(node.locking_arg_name).unwrap()
		yield get_token(locking_arg.token_name).unwrap()
		continue

	default: return exhaustive(node)
	}
}
