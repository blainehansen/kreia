import '@ts-std/extensions/dist/array'
import { Dict } from '@ts-std/types'
import { Maybe as Option } from '@ts-std/monads'
import { OrderedDict } from '@ts-std/collections'

import { TokenOptions } from '../lexer'
import { Data, exhaustive, debug, exec, array_of, empty_ordered_dict } from '../utils'

import { AstDecidable } from './decision'
import { gather_branches, compute_decidable } from './decision_compute'


export type RegexSpec =
	| { type: 'regex', source: string }
	| { type: 'string', value: string }

export type MatchSpec =
	| RegexSpec
	| { type: 'array', items: RegexSpec[] }

export type TokenSpec =
	| MatchSpec
	| { type: 'options', match: MatchSpec } & TokenOptions

export const TokenDef = Data((name: string, def: TokenSpec) => {
	return { type: 'TokenDef' as const, name, def }
})
export type TokenDef = ReturnType<typeof TokenDef>

export const Arg = Data((name: string) => {
	return { type: 'Arg' as const, name }
})
export type Arg = ReturnType<typeof Arg>

export const Var = Data((arg_name: string): Node => {
	return { type: 'Var' as const, arg_name }
})
export type Var = Readonly<{ type: 'Var', arg_name: string }>


export const LockingArg = Data((name: string, token_name: string) => {
	return { type: 'LockingArg' as const, name, token_name }
})
export type LockingArg = ReturnType<typeof LockingArg>

export const LockingVar = Data((locking_arg_name: string) => {
	return { type: 'LockingVar' as const, locking_arg_name }
})
export type LockingVar = ReturnType<typeof LockingVar>

export const Rule = Data((name: string, definition: Definition, locking_args?: OrderedDict<LockingArg>) => {
	return { type: 'Rule' as const, name, definition, locking_args }
})
export type Rule = ReturnType<typeof Rule>


export const Macro = Data((name: string, args: OrderedDict<Arg>, definition: Definition, locking_args?: OrderedDict<LockingArg>) => {
	return { type: 'Macro' as const, name, args, definition, locking_args }
})
export type Macro = ReturnType<typeof Macro>


export const Subrule = Data((rule_name: string): Node => {
	return { type: 'Subrule' as const, rule_name }
})
export type Subrule = Readonly<{ type: 'Subrule', rule_name: string }>

export const Maybe = Data((definition: Definition): Node => {
	return { type: 'Maybe' as const, definition }
})
export type Maybe = Readonly<{ type: 'Maybe', definition: Definition }>

export const Many = Data((definition: Definition): Node => {
	return { type: 'Many' as const, definition }
})
export type Many = Readonly<{ type: 'Many', definition: Definition }>

export const Or = Data((choices: Definition[]): Node => {
	return { type: 'Or' as const, choices }
})
export type Or = Readonly<{ type: 'Or', choices: Definition[] }>

export const MacroCall = Data((macro_name: string, args: OrderedDict<Definition>): Node => {
	return { type: 'MacroCall' as const, macro_name, args }
})
export type MacroCall = Readonly<{ type: 'MacroCall', macro_name: string, args: OrderedDict<Definition> }>

export const Consume = Data((token_names: string[]): Node => {
	return { type: 'Consume' as const, token_names }
})
export type Consume = Readonly<{ type: 'Consume', token_names: string[] }>

type NodesManifest = {
	Consume: Consume,
	Maybe: Maybe,
	Many: Many,
	Or: Or,
	Subrule: Subrule,
	MacroCall: MacroCall,
	Var: Var,
	LockingVar: LockingVar,
}

export type Node = NodesManifest[keyof NodesManifest]

export interface Definition extends Array<Node> {}

export type GrammarItem =
	| TokenDef
	| Rule
	| Macro

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

export function get_token(token_name: string): Option<TokenDef> {
	return Option.from_nillable(registered_tokens[token_name])
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


export type Scope = Readonly<{ locking_args: OrderedDict<LockingArg>, args: OrderedDict<Definition> }>
export function Scope(locking_args: OrderedDict<LockingArg> | undefined, args: OrderedDict<Definition> | undefined): Scope {
	return { locking_args: locking_args || empty_ordered_dict, args: args || empty_ordered_dict }
}

export type ScopeStack = { current: Scope, previous: Scope[] }
export function push_scope({ current, previous }: ScopeStack, ...[locking_args, args]: Parameters<typeof Scope>): ScopeStack {
	return { current: Scope(locking_args, args), previous: [...previous, current] }
}
export function pop_scope({ current, previous }: ScopeStack): ScopeStack {
	return {
		current: previous.maybe_get(-1).unwrap(),
		previous: previous.slice(0, previous.length - 1),
	}
}

export type DefinitionTuple = [Definition, ScopeStack]

export type VisitorParams = [Node[], ScopeStack, ('maybe' | 'many' | 'maybe_many')?]
export type VisitingFunctions<T> = { [K in keyof NodesManifest]: (node: NodesManifest[K], ...args: VisitorParams) => T }

export function visit_definition<T>(
	node_visitors: VisitingFunctions<T>,
	definition: Definition,
	...[next, scope, wrapping_function_name]: VisitorParams
): T[] {
	const results = [] as T[]
	for (const [node_index, node] of definition.entries()) {
		const result = visit_node(node_visitors, node, definition.slice(node_index + 1), scope, wrapping_function_name)
		results.push(result)
	}
	return results
}

export function visit_node<T>(
	node_visitors: VisitingFunctions<T>,
	node: Node,
	...[next, scope, wrapping_function_name]: VisitorParams
): T {
	switch (node.type) {
	case 'Or':
		return node_visitors.Or(node, next, scope, wrapping_function_name)

	case 'Maybe':
		if (node.definition.length === 1) {
			if (wrapping_function_name !== undefined)
				throw new Error(`a Maybe is the only child of something`)
			return visit_node(node_visitors, node.definition[0], next, scope, 'maybe')
		}

		return node_visitors.Maybe(node, next, scope, wrapping_function_name)

	case 'Many':
		if (node.definition.length === 1) {
			const lone = node.definition[0]
			switch (wrapping_function_name) {
			case 'maybe':
				return visit_node(node_visitors, lone, next, scope, 'maybe_many')
			case undefined:
				return visit_node(node_visitors, lone, next, scope, 'many')
			default:
				throw new Error('a Many is nested directly inside another Many or a Maybe then a Many')
			}
		}

		return node_visitors.Many(node, next, scope, wrapping_function_name)

	case 'Consume':
		return node_visitors.Consume(node, next, scope, wrapping_function_name)

	case 'Subrule':
		const rule = get_rule(node.rule_name).unwrap()
		const new_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
		return node_visitors.Subrule(node, next, new_scope, wrapping_function_name)

	case 'MacroCall':
		return node_visitors.MacroCall(node, next, scope, wrapping_function_name)

	case 'Var':
		return node_visitors.Var(node, next, scope, wrapping_function_name)

	case 'LockingVar':
		return node_visitors.LockingVar(node, next, scope, wrapping_function_name)
	}
}
