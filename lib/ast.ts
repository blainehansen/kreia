import '@ts-std/extensions/dist/array'
import '@ts-std/collections/dist/impl.Hashable.string'
import { Dict, tuple as t } from '@ts-std/types'
import { OrderedDict, UniqueDict, HashSet } from '@ts-std/collections'

import { TokenOptions } from './lexer'
import { Data, exhaustive, debug, ex, array_of, empty_ordered_dict } from './utils'

import { AstDecidable } from './decision'
import { gather_branches, compute_decidable } from './decision_compute'


// export const VirtualLexerDirective = Data((virtual_lexer_name: string, destructure: (Token | Subrule)[]) => {
// 	return { type: 'VirtualLexerDirective' as const,  }
// })


type RegexSpec =
	| { type: 'regex', source: string }
	| { type: 'string', value: string }

type MatchSpec =
	| RegexSpec
	| { type: 'array', items: RegexSpec[] }

type TokenSpec =
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
export type NodeTypes = keyof NodesManifest

export interface Definition extends Array<Node> {}

export type GrammarItem =
	| TokenDef
	| Rule
	| Macro

export type Grammar = GrammarItem[]

export type Scope = Readonly<{ locking_args: OrderedDict<LockingArg>, args: OrderedDict<Definition> }>
export function Scope(locking_args: OrderedDict<LockingArg> | undefined, args: OrderedDict<Definition> | undefined): Scope {
	return { locking_args: locking_args || empty_ordered_dict, args: args: || empty_ordered_dict }
}
export const empty_scope = Scope(undefined, undefined)
export type DefinitionTuple = [Definition, Scope, Scope]


export let registered_tokens = {} as Dict<TokenDef>
export let registered_rules = {} as Dict<Rule>
export let registered_macros = {} as Dict<Macro>

export function register_tokens(token_defs: TokenDef[]) {
	registered_tokens = token_defs.unique_index_by('name').unwrap()
}
export function register_rules(rules: Rule[]) {
	registered_rules = rules.unique_index_by('name').unwrap()
}
export function register_macros(macros: Macro[]) {
	registered_macros = macros.unique_index_by('name').unwrap()
}


type MacroRenderContext =
	| { type: 'definition', count: number }
	| { type: 'call', decidables: AstDecidable[] }
	// | { type: 'call', args: OrderedDict<Definition>, decidables: AstDecidable[] }

export let macro_context = undefined as MacroRenderContext | undefined
export let locking_context = empty_ordered_dict as OrderedDict<LockingArg>

export function reset_macro_context() {
	macro_context = undefined
}
export function set_macro_context(new_macro_context: MacroRenderContext) {
	const current = macro_context
	macro_context = new_macro_contex
	return macro_context
}

export function reset_locking_context() {
	locking_context = empty_ordered_dict
}
export function set_locking_context(new_locking_context?: OrderedDict<LockingArg>) {
	const current = locking_context
	locking_context = new_macro_contex || empty_ordered_dict
	return locking_context
}

export function get_rule(rule_name: string): Maybe<Rule> {
	return Maybe.from_nillable(registered_rules[rule_name])
}
export function get_macro(macro_name: string): Maybe<Macro> {
	return Maybe.from_nillable(registered_macros[macro_name])
}


type ScopeStack = { current: Scope, previous: Scope[] }

type VisitorParams = [Node[], ScopeStack, ('maybe' | 'many' | 'maybe_many')?]
type VisitingFunctions<T> = { [K in keyof NodesManifest]: (node: NodesManifest[K], ...args: VisitorParams) => T }

function visit_definition<T>(
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

function visit_node<T>(
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

	case 'Subrule': {
		const rule = get_rule(node.rule_name).unwrap()
		const new_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
		return node_visitors.Subrule(node, next, new_scope, wrapping_function_name)
	}

	case 'MacroCall': {
		const macro = get_macro(node.macro_name).unwrap()
		const new_scope = { current: Scope(macro.locking_args, node.args), previous: [...scope.previous, scope.current] }
		return node_visitors.MacroCall(node, next, new_scope, wrapping_function_name)
	}

	case 'Var': {
		const new_scope = {
			current: scope.previous.maybe_get(-1).unwrap(),
			previous: scope.previous.slice(0, scope.previous.length - 1),
		}
		return node_visitors.Var(node, next, new_scope, wrapping_function_name)
	}

	case 'LockingVar':
		return node_visitors.LockingVar(node, next, scope, wrapping_function_name)
	}
}




import ts = require('typescript')

export function render_grammar(grammar: Grammar) {
	const token_defs = new UniqueDict<TokenDef>()
	const rules = new UniqueDict<Rule>()
	const macros = new UniqueDict<Macro>()
	macros.set('many_separated', Macro(
		'many_separated',
		OrderedDict.create_unique('name', [Arg('body_rule'), Arg('separator_rule')]).unwrap(),
		[Var('body_rule'), Maybe([Many([Var('separator_rule'), Var('body_rule')])])],
	)).unwrap()

	const matcher = {
		ok: () => undefined,
		err: (e: [string, unknown, unknown]) =>
			`there are conflicting definitions for: ${e[0]}`,
	}

	const conflict_errors = grammar.filter_map(grammar_item => {
		switch (grammar_item.type) {
		case 'TokenDef':
			return token_defs.set(grammar_item.name, grammar_item).match(matcher)
		case 'Rule':
			return rules.set(grammar_item.name, grammar_item).match(matcher)
		case 'Macro':
			return macros.set(grammar_item.name, grammar_item).match(matcher)
		}
	})

	if (conflict_errors.length > 0)
		throw new Error(conflict_errors.join('\n\n'))

	registered_tokens = token_defs.into_dict()
	registered_rules = rules.into_dict()
	registered_macros = macros.into_dict()

	const rules_macros: (Rule | Macro)[] = [...rules.values(), ...macros.values()]
	const validation_errors = rules_macros
		.flat_map(validate_references)
	if (validation_errors.length > 0)
		throw new Error(validation_errors.join('\n\n'))

	const left_recursive_rules = rules_macros
		.filter(check_left_recursive)
	if (left_recursive_rules.length > 0)
		throw new Error(`There are left recursive rules: ${left_recursive_rules.join('\n\n')}`)

	const rendered_tokens = token_defs.values().map(render_token_def)
	const rendered_macros = macros.values().filter_map(render_macro)
	const rendered_rules = rules.values().map(render_rule)
}

function render_regex_spec(regex_spec: RegexSpec) {
	switch (regex_spec.type) {
	case 'regex':
		return ts.createRegularExpressionLiteral(`/${regex_spec.source}/`)
	case 'string':
		return ts.createStringLiteral(regex_spec.value)
	}
}

function render_match_spec(match_spec: MatchSpec) {
	switch (match_spec.type) {
	case 'array':
		return ts.createArrayLiteral(match_spec.items.map(render_regex_spec), false)
	default:
		return render_regex_spec(match_spec)
	}
}

function render_token_def(token_def: TokenDef) {
	switch (token_def.def.type) {
	case 'options': {
		const assigments = [
			ts.createPropertyAssignment(
				ts.createIdentifier('match'),
				render_match_spec(token_def.def.match),
			),
		]
		if (token_def.def.ignore)
			assigments.push(ts.createPropertyAssignment(
				ts.createIdentifier('ignore'),
				ts.createTrue(),
			))

		const body = ts.createObjectLiteral(assigments, false)
		return wrap_token_def(token_def.name, body)
	}
	default:
		const body = render_match_spec(token_def.def)
		return wrap_token_def(token_def.name, body)
	}
}

function wrap_token_def(name: string, expression: ts.Expression) {
	return ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(name), undefined,
				ts.createCall(ts.createIdentifier('Token'), undefined, [
					ts.createStringLiteral(name),
					expression,
				]),
			)], ts.NodeFlags.Const,
		),
	)
}


function render_macro(macro: Macro) {
	if (macro.name === 'many_separated')
		return undefined

	const lockers = (macro.locking_args !== undefined ? macro.locking_args.to_array() : []).map(render_locking_arg)
	const args = macro.args.to_array()

	const rendered_definition = render_definition(macro.definition, Scope(macro.locking_args, empty_ordered_dict), empty_scope)

	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		ts.createIdentifier(macro.name),
		// generics
		args.map(arg => ts.createTypeParameterDeclaration(
			ts.createIdentifier(arg.name.toUpperCase()),
			ts.createTypeReferenceNode(ts.createIdentifier('ArgBody'), undefined), undefined,
		)),
		// actual args
		[
			...args.map(arg => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(arg.name), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier(arg.name.toUpperCase()), undefined), undefined,
			)),
			...array_of(macro_context.count).map((_, index) => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(`_d${index + 1}`), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier('Decidable'), undefined), undefined,
			))),
		],
		undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}

function render_rule(rule: Rule) {
	// rules are always just functions that at least initially take no parameters
	const lockers = (rule.locking_args !== undefined ? rule.locking_args.to_array() : []).map(render_locking_arg)

	const rendered_definition = render_definition(rule.definition, Scope(rule.locking_args, empty_ordered_dict), empty_scope)

	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		ts.createIdentifier(rule.name),
		[], [], undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}

function render_locking_arg(arg: LockingArg) {
	return ts.createVariableStatement(
		undefined,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(arg.name), undefined,
				ts.createCall(ts.createIdentifier('lock'), undefined, [
					ts.createIdentifier(arg.token_name),
				]),
			),
		], ts.NodeFlags.Const),
	)
}



// visit_definition(render_visitor)

function render_definition(definition: Definition, macro_context?: MacroRenderContext) {
	const rendered = [] as ts.ExpressionStatement[]
	for (let node_index = 0; node_index < definition.length; node_index++) {
		const node = definition[node_index]
		const next = definition.slice(node_index + 1)
		rendered.push(ts.createExpressionStatement(render_node(node, next, macro_context)))
	}

	return rendered
}

function render_arrow(definition: Definition) {
	return ts.createArrowFunction(
		undefined, undefined, [], undefined,
		ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		ts.createBlock(render_definition(definition), true),
	)
}

let global_decidables = [] as ReturnType<typeof ts.createCall>[]

function generate_decidable(main: DefinitionTuple, against: DefinitionTuple[]) {
	const decidable = compute_decidable(main, against)
	const lookahead_definition = render_decidable(decidable)
	const lookahead_number = global_decidables.length
	global_decidables.push(lookahead_definition)
	const lookahead_ident = ts.createIdentifier(`_${lookahead_number}`)
	return lookahead_ident
}

function render_global_decidables() {
	return ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList(
		[ts.createVariableDeclaration(
			ts.createArrayBindingPattern(array_of(global_decidables.length).map((_, index) => ts.createBindingElement(
				undefined, undefined,
				ts.createIdentifier(`_${index}`), undefined,
			))),
			undefined,
			ts.createArrayLiteral(global_decidables, false),
		)], ts.NodeFlags.Const),
	)
}

function render_entity<B extends boolean>(
	target: Definition[] | Subrule | MacroCall,
	input_next: Definition,
	gather_more: boolean,
	atom_style: B
): B extends true ? Call : ts.Expression[] {
	if (
		Array.isArray(target)
		&& target[0]!.length === 1
		&& target[0][0].type === 'Consume'
	) {
		const c = target[0][0]
		return atom_style
			? ts.createCall(
				ts.createIdentifier('t'), undefined,
				c.token_names.map(ts.createIdentifier),
			) as B extends true ? Call : ts.Expression[]
			: c.token_names.map(ts.createIdentifier) as unknown as B extends true ? Call : ts.Expression[]
	}

	if (
		Array.isArray(target)
		&& target[0]!.length === 1
		&& (
			target[0][0].type === 'Subrule'
			|| target[0][0].type === 'MacroCall'
		)
	)
		return render_entity(target[0][0], input_next, gather_more, atom_style)

	const next = input_next.slice()

	// const [current, rendered_entity rendered_args] = Array.isArray(target)
	// 	?
	// 	: ex(() => {
	// 		switch (target.type) {
	// 		case 'Subrule':
	// 		case 'MacroCall':
	// 		}
	// 		return t()
	// 	})

	const [current, rendered_entity, rendered_args] = Array.isArray(target)
		? t(target, render_arrow(target[0]), [])
		: target.type === 'Subrule'
			? t([resolve_rule(target.rule_name)], ts.createIdentifier(target.rule_name), [])
			: t(
				[resolve_macro(target.macro_name, target.args)],
				ts.createIdentifier(target.macro_name),
				target.args.to_array().map(arg => render_entity([arg], [] as Definition, false, true)),
			)

	const final = gather_more
		? gather_branches(current, next)
		: current

	const lookahead_ident = generate_decidable(final[0], final.slice(1))

	return atom_style
		? ts.createCall(
			ts.createIdentifier('f'), undefined,
			[rendered_entity, lookahead_ident, ...rendered_args],
		) as B extends true ? Call : ts.Expression[]
		: [rendered_entity, lookahead_ident, ...rendered_args] as unknown as B extends true ? Call : ts.Expression[]
}



type Call = ReturnType<typeof ts.createCall>

function render_decidable(decidable: AstDecidable): Call {
	switch (decidable.type) {
	case 'AstDecisionPath':
		return ts.createCall(
			ts.createIdentifier('path'), undefined,
			decidable.path.map(item =>
				Array.isArray(item)
					? item.map(token_def => ts.createIdentifier(token_def.name))
					: render_decidable(item)
			) as ts.Expression[],
		)
	case 'AstDecisionBranch':
		return ts.createCall(
			ts.createIdentifier('branch'), undefined,
			decidable.paths.map(render_decidable) as ts.Expression[],
		)
	}
}


// when rendering a macro definition, we need to traverse the definition and render the entities with numbers decision instead of newly computed ones.
// when rendering macro calls we need to traverse the definition only to gather the final computed values of those decisions.

// when counting decision points to render a macro definition, you don't have to iterate vars and macro calls, beacuse in fact you can't. in fact you shouldn't recurse beyond the current definition at all. when gathering the finalized decision points at render time, the same is true that you don't recurse beyond the macro definition as you gather them, but you will have to recurse beyond in order to compute the decision points. you do have to render the provided vars themselves though

const count_decidables: VisitingFunctions<void> = {
	Or(or, next, scope, wrapping_function_name) {
		if (wrapping_function_name !== 'maybe')
			count++
		for (const choice of or.choices)
			visit_definition(count_decidables, choice.definition, next, scope, undefined)
	},
	Maybe(maybe, next, scope, wrapping_function_name) {
		count++
		visit_definition(count_decidables, maybe.definition, next, scope, undefined)
	},
	Many(many, next, scope, wrapping_function_name) {
		count++
		visit_definition(count_decidables, many.definition, next, scope, undefined)
	},
	Consume(consume, next, scope, wrapping_function_name) {
		// this is always
	},
	Subrule(subrule, next, scope, wrapping_function_name) {
		if (wrapping_function_name !== 'maybe')
			count++
	},
	MacroCall(macro_call, next, scope, wrapping_function_name) {
		if (wrapping_function_name !== 'maybe')
			count++
		// TODO all of these args have the parent_scope,
		// which unfortunately has already been buried in previous
		for (const arg_definition of macro_call.args.to_array())
			visit_definition(count_decidables, arg_definition, next, scope, undefined)
	},
	Var(var, next, scope, wrapping_function_name) {
		// TODO we might want to see in all of these if the resolved definition is only a Consume
		scope.current.get_by_name(var.arg_name).unwrap()
		if (wrapping_function_name !== 'maybe')
			count++
	},
	LockingVar(locking_var, next, scope, wrapping_function_name) {
		// this is always a token, so it never needs a decidable
	},
}

const render_visitor: VisitingFunctions<ts.Expression> = {
	Or(or, next, scope, wrapping_function_name) {
		const choices = [] as ts.Expression[]
		for (let choice_index = 0; choice_index < node.choices.length; choice_index++) {
			const choice = node.choices[choice_index]
			const main = [choice].concat(node.choices.slice(choice_index + 1))
			// these choice decidables should never gather_more
			// once we've entered the many or maybe or maybe_many that may be wrapping this or,
			// the choice has already been made to enter, with a decidable that has that higher viewpoint
			choices.push(render_entity(main, next, false, true))
		}
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_or' : 'or'), undefined, choices,
		)
	},
	Maybe(maybe, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier('maybe'), undefined,
			render_entity([maybe.definition], next, true, false),
		)
	},
	Many(many, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_many' : 'many'), undefined,
			// Many always needs to be able to distinguish between continuing and stopping
			render_entity([node.definition], next, true, false),
		)
	},
	Consume(consume, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name || 'consume'), undefined,
			node.token_names.map(ts.createIdentifier),
		)
	},
	Subrule(subrule, next, scope, wrapping_function_name) {
		return wrapping_function_name === undefined
			? ts.createCall(ts.createIdentifier(node.rule_name), undefined, [])
			: ts.createCall(
				ts.createIdentifier(wrapping_function_name), undefined,
				render_entity(node, next, true, false),
			)
	},
	MacroCall(macro_call, next, scope, wrapping_function_name) {
		const macro = get_macro(node.macro_name)
		if (macro_render_context !== undefined)
			return undefined as unknown as Call

		const rendered_args = node.args.to_array().map(arg_definition => {
			// return render_definition(arg_definition, args_context.for_args.locking_context, args_context.for_args.args)
			return render_definition(arg_definition, locking_context, args_context.body_args)
		})


		const gathered_decidables = gather_decidables(macro, node.args, scope)
		const final_args = [...rendered_args, ...gathered_decidables]
		return wrapping_function_name === undefined
			? ts.createCall(ts.createIdentifier(node.macro_name), undefined, final_args)
			: ts.createCall(
				ts.createIdentifier(wrapping_function_name), undefined,
				render_entity(node, next, true, false, final_args),
			)
	},
	Var(var, next, scope, wrapping_function_name) {
		return wrapping_function_name === undefined
			?
			: ts.createCall(
				ts.createIdentifier(wrapping_function_name), undefined,
				[ts.createSpread(ts.createIdentifier(node.arg_name))],
			)
	},
	LockingVar(locking_var, next, scope, wrapping_function_name) {
		return ts.createCall(ts.createIdentifier(node.locking_arg_name), undefined, [])
	},
}

// function render_node(
// 	node: Node,
// 	next: Node[],
// 	scope: Scope,
// 	wrapping_function_name?: 'maybe' | 'many' | 'maybe_many',
// ): ts.Expression {
// 	switch (node.type) {
// 	case 'Or':
// 		const choices = [] as ts.Expression[]
// 		for (let choice_index = 0; choice_index < node.choices.length; choice_index++) {
// 			const choice = node.choices[choice_index]
// 			const main = [choice].concat(node.choices.slice(choice_index + 1))
// 			// these choice decidables should never gather_more
// 			// once we've entered the many or maybe or maybe_many that may be wrapping this or,
// 			// the choice has already been made to enter, with a decidable that has that higher viewpoint
// 			choices.push(render_entity(main, next, false, true))
// 		}
// 		return ts.createCall(
// 			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_or' : 'or'), undefined, choices,
// 		)

// 	case 'Maybe':
// 		if (node.definition.length === 1) {
// 			if (wrapping_function_name !== undefined)
// 				throw new Error(`a Maybe is the only child of something`)
// 			return render_node(node.definition[0], next, macro_context, 'maybe')
// 		}

// 		return ts.createCall(
// 			ts.createIdentifier('maybe'), undefined,
// 			render_entity([node.definition], next, true, false),
// 		)

// 	case 'Many':
// 		if (node.definition.length === 1) {
// 			const lone = node.definition[0]
// 			switch (wrapping_function_name) {
// 			case 'maybe':
// 				return render_node(lone, next, macro_context, 'maybe_many')
// 			case undefined:
// 				return render_node(lone, next, macro_context, 'many')
// 			default:
// 				throw new Error('a Many is nested directly inside another Many or a Maybe then a Many')
// 			}
// 		}

// 		return ts.createCall(
// 			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_many' : 'many'), undefined,
// 			// Many always needs to be able to distinguish between continuing and stopping
// 			render_entity([node.definition], next, true, false),
// 		)

// 	case 'Consume':
// 		return ts.createCall(
// 			ts.createIdentifier(wrapping_function_name || 'consume'), undefined,
// 			node.token_names.map(ts.createIdentifier),
// 		)

// 	case 'Subrule':
// 		return wrapping_function_name === undefined
// 			? ts.createCall(ts.createIdentifier(node.rule_name), undefined, [])
// 			: ts.createCall(
// 				ts.createIdentifier(wrapping_function_name), undefined,
// 				render_entity(node, next, true, false),
// 			)

// 	case 'MacroCall':
// 		// in order to render the macro call, we need to render the provided args
// 		// to do so is basically to set whatever context is necessary so we can collect the decidables
// 		// and then provide them at this call site
// 		// the args provided here have to be rendered with our current locking_context and args_context.body_args

// 		// there's nothing for us to do here if we're just gathering decision points or decidables
// 		// a bare macro call
// 		const macro = get_macro(node.macro_name)
// 		if (macro_render_context !== undefined)
// 			return undefined as unknown as Call

// 		const rendered_args = node.args.to_array().map(arg_definition => {
// 			// return render_definition(arg_definition, args_context.for_args.locking_context, args_context.for_args.args)
// 			return render_definition(arg_definition, locking_context, args_context.body_args)
// 		})


// 		const gathered_decidables = gather_decidables(macro, node.args, current_scope, parent_scope)




// 		const final_args = [...rendered_args, ...gathered_decidables]
// 		return wrapping_function_name === undefined
// 			? ts.createCall(ts.createIdentifier(node.macro_name), undefined, final_args)
// 			: ts.createCall(
// 				ts.createIdentifier(wrapping_function_name), undefined,
// 				render_entity(node, next, true, false, final_args),
// 			)

// 	case 'Var':
// 		// const arg_definition = args_context.body_args.get_by_name(node.arg_name).unwrap()
// 		// // the items in this sub Var are resolved with the args_context for_args info
// 		// yield* iterate_definition(arg_definition, args_context.for_args.locking_context, args_context.for_args.args)

// 		// if (wrapping_function_name === undefined)
// 		// 	return ts.createCall(ts.createIdentifier('arg'), undefined, [ts.createIdentifier(node.arg_name)])

// 		// switch (macro_context.type) {
// 		// case 'definition':
// 		// 	macro_context.count++
// 		// 	// TODO continue?
// 		// case 'call':
// 		// 	const arg_definition = macro_context.args.get_by_name(node.arg_name).unwrap()
// 		// 	const var_main = [arg_definition]
// 		// 	// const decidable = generate_decidable(var_main, gather_branches(var_main, next.slice()))
// 		// 	t(var_main, locking_context, args_context)
// 		// 	gather_branches([node.definition], nodes_to_visit)
// 		// 		.map(branch => t(branch, locking_context, args_context))

// 		// 	const decidable = generate_decidable(, gather_branches(var_main, next.slice()))
// 		// 	macro_context.decidables.push(decidable)
// 		// }

// 		return wrapping_function_name === undefined
// 			?
// 			: ts.createCall(
// 				ts.createIdentifier(wrapping_function_name), undefined,
// 				[ts.createSpread(ts.createIdentifier(node.arg_name))],
// 			)

// 	case 'LockingVar':
// 		return ts.createCall(ts.createIdentifier(node.locking_arg_name), undefined, [])
// 	}
// }


// function gather_macro_decidables(macro: Macro, calling_args: OrderedDict<Definition>, parent_scope: Scope) {
// 	const decidables = []
// 	_gather_macro_decidables(macro.definition, Scope(macro.locking_args, calling_args), parent_scope, false, decidables)
// 	return decidables
// }
// function _gather_macro_decidables(
// 	definition: Definition,
// 	calling_scope: Scope, parent_scope: Scope,
// 	could_be_decidable: boolean,
// 	decidables: AstDecidable,
// ) {
// 	if (definition.length === 1)
// 		if (definition[0].type === )

// 	for (const [node_index, node] of definition.entries()) switch (node.type) {
// 	case 'Or':
// 		for (const [choice_index, choice] of choices.entries()) {
// 			const branches = gather_branches([choice], choices.slice(1))
// 				.map(choice => t(choice, calling_scope, parent_scope))
// 			decidables.push(generate_decidable(branches[0]!, branches.slice(1)))
// 			_gather_macro_decidables(node.definition, calling_scope, parent_scope, true, decidables)
// 		}
// 	case 'Maybe':
// 		const branches = gather_branches([node.definition], definition.slice(node_index + 1))
// 			.map(branch => t(branch, calling_scope, parent_scope))
// 		decidables.push(generate_decidable(branches[0]!, branches.slice(1)))
// 		_gather_macro_decidables(node.definition, calling_scope, parent_scope, true, decidables)
// 		continue

// 	case 'Many':
// 		const branches = gather_branches([node.definition], definition.slice(node_index + 1))
// 			.map(branch => t(branch, calling_scope, parent_scope))
// 		decidables.push(generate_decidable(branches[0]!, branches.slice(1)))
// 		_gather_macro_decidables(node.definition, calling_scope, parent_scope, true, decidables)
// 		continue

// 	case 'Consume':
// 		continue
// 	case 'Subrule':
// 		continue
// 	case 'MacroCall':
// 		//
// 	case 'Var':
// 		//
// 	case 'LockingVar':
// 		//
// 	default: return exhaustive(node)
// 	}
// }




// // const Padded = Macro(
// // 	'padded', [Arg('body')],
// // 	Maybe(Consume('Whitespace')),
// // 	Var('body'),
// // 	Maybe(Consume('Whitespace')),
// // )

// const ManySeparated = Macro(
// 	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
// 	Var('body_rule'),
// 	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
// )

// const Grammar: Grammar = [
// 	Token('LeftParen', '('),
// 	Token('RightParen', ')'),
// 	Token('Num', /[0-9]+/),
// 	Token('Nil', 'nil'),
// 	Token('Comma', ','),
// 	Token('Whitespace', /\s+/, { ignore: true }),

// 	Rule('lists',
// 		Many(Subrule('parenthesized_number_list')),
// 	),
// 	Rule('parenthesized_number_list',
// 		Consume('LeftParen'),
// 		Maybe(Subrule('number_list'))
// 		Consume('RightParen'),
// 	),
// 	Rule('number_list',
// 		MacroCall('many_separated',
// 			[Or(
// 				[Subrule('parenthesized_number_list')],
// 				[Or([Consume('Num')], [Consume('Nil')])],
// 			)],
// 			[Consume('Comma')],
// 		),
// 	),
// ]
