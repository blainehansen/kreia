import { Dict, tuple as t } from '@ts-std/types'
import '@ts-std/extensions/dist/array'
import '@ts-std/collections/dist/impl.Hashable.string'
import { OrderedDict, UniqueDict, HashSet } from '@ts-std/collections'

import { TokenOptions } from './lexer'
import { Data, exhaustive } from './utils'

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

export type Node =
	| Consume
	| Maybe
	| Many
	| Or
	| Subrule
	| MacroCall
	| Var
	| LockingVar

export interface Definition extends Array<Node> {}

export type GrammarItem =
	| TokenDef
	| Rule
	| Macro

export type Grammar = GrammarItem[]


export let registered_tokens = {} as Dict<TokenDef>
export let registered_rules = {} as Dict<Rule>
export let registered_macros = {} as Dict<Macro>

export function register_tokens(token_defs: TokenDef[]) {
	registered_tokens = token_defs.unique_index_by('name').expect('')
}
export function register_rules(rules: Rule[]) {
	registered_rules = rules.unique_index_by('name').expect('')
}
export function register_macros(macros: Macro[]) {
	registered_macros = macros.unique_index_by('name').expect('')
}

const empty_ordered_dict = OrderedDict.create<any>(t => '', [])
export function resolve_rule(rule_name: string) {
	const rule = registered_rules[rule_name]!
	return _resolve(empty_ordered_dict, rule.locking_args || empty_ordered_dict, rule.definition)
}

export function resolve_macro(macro_name: string, args: OrderedDict<Definition>) {
	const macro = registered_macros[macro_name]!
	return _resolve(args, macro.locking_args || empty_ordered_dict, macro.definition)
}
function _resolve(
	args: OrderedDict<Definition>,
	locking_args: OrderedDict<LockingArg>,
	definition: Definition,
) {
	const resolved = [] as Definition
	for (const node of definition) switch (node.type) {
	case 'Var':
		const arg_def = args.get_by_name(node.arg_name).to_undef()!
		resolved.push_all(arg_def)
		continue
	case 'LockingVar':
		const locking_arg_def = locking_args.get_by_name(node.locking_arg_name).to_undef()!
		resolved.push(Consume([locking_arg_def.token_name]))
		continue
	case 'Or':
		resolved.push(Or(node.choices.map(choice => _resolve(args, locking_args, choice))))
		continue
	case 'Maybe':
		resolved.push(Maybe(_resolve(args, locking_args, node.definition)))
		continue
	case 'Many':
		resolved.push(Many(_resolve(args, locking_args, node.definition)))
		continue
	case 'MacroCall':
		const new_args = node.args.map(arg_def => _resolve(args, locking_args, arg_def))
		resolved.push(MacroCall(node.macro_name, new_args))
		continue
	// Consume, Subrule
	default:
		resolved.push(node)
		continue
	}

	return resolved
}


export function check_left_recursive(thing: Rule | Macro) {
	const seen_rules = {} as Dict<true>
	const seen_macros = {} as Dict<true>
	const one_to_add = thing.type === 'Rule' ? seen_rules : seen_macros
	one_to_add[thing.name] = true
	return _check_left_recursive(seen_rules, seen_macros, thing.definition)
}
function _check_left_recursive(
	seen_rules: Dict<true>,
	seen_macros: Dict<true>,
	definition: Definition,
): boolean {
	for (const node of definition) switch (node.type) {
	case 'Consume':
		return false
	case 'Maybe':
		if (_check_left_recursive(seen_rules, seen_macros, node.definition))
			return true
		continue
	case 'Or':
		for (const choice of node.choices)
			if (_check_left_recursive(seen_rules, seen_macros, choice))
				return true
		return false
	case 'Many':
		if (_check_left_recursive(seen_rules, seen_macros, node.definition))
			return true
		return false

	case 'Subrule':
		if (seen_rules[node.rule_name])
			return true
		const subrule = registered_rules[node.rule_name]!
		if (_check_left_recursive({ [node.rule_name]: true, ...seen_rules }, seen_macros, subrule.definition))
			return true
		return false

	case 'MacroCall':
		if (seen_macros[node.macro_name])
			return true
		const call_definition = resolve_macro(node.macro_name, node.args)
		if (_check_left_recursive(seen_rules, { [node.macro_name]: true, ...seen_macros }, call_definition))
			return true
		return false

	case 'Var':
		continue
	case 'LockingVar':
		continue

	default: return exhaustive(node)
	}

	return false
}


export function validate_references(thing: Rule | Macro) {
	const validation_errors = [] as string[]

	const nodes_to_visit = thing.definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		nodes_to_visit.push_all(...node.choices)
		continue
	case 'Many':
	case 'Maybe':
		nodes_to_visit.push_all(node.definition)
		continue

	case 'Consume':
		for (const token_name of node.token_names)
			if (!(token_name in registered_tokens))
				validation_errors.push(`Token ${token_name} couldn't be found.`)
		continue

	case 'Subrule':
		if (!(node.rule_name in registered_rules))
			validation_errors.push(`Rule ${node.rule_name} couldn't be found.`)
		continue

	case 'MacroCall':
		const macro = registered_macros[node.macro_name]
		if (macro === undefined) {
			validation_errors.push(`Macro ${node.macro_name} couldn't be found.`)
			continue
		}

		const macro_keys = HashSet.from(macro.args.keys())
		const node_keys = HashSet.from(node.args.keys())
		if (!macro_keys.equal(node_keys)) {
			validation_errors.push(`Macro ${node.macro_name} called with invalid arguments: ${node_keys.values().join(', ')}`)
			continue
		}

		nodes_to_visit.push_all(...node.args.values())
		continue

	case 'Var':
		// a var is only valid if we're in a Macro
		if (thing.type === 'Rule') {
			validation_errors.push(`unexpected variable: ${node}`)
			continue
		}

		if (thing.args.get_by_name(node.arg_name).is_none())
			validation_errors.push(`variable ${node.arg_name} is invalid in this macro`)
		continue

	case 'LockingVar':
		if (thing.locking_args === undefined) {
			validation_errors.push(`unexpected locking variable: ${node}`)
			continue
		}

		const locking_arg = thing.locking_args.get_by_name(node.locking_arg_name)
		if (locking_arg.is_none()) {
			validation_errors.push(`locking variable ${node.locking_arg_name} is invalid in this rule`)
			continue
		}
		if(!(locking_arg.value.token_name in registered_tokens))
			validation_errors.push(`Token ${locking_arg.value.token_name} couldn't be found.`)
		continue

	default: return exhaustive(node)
	}

	return validation_errors
}


import ts = require('typescript')

export function render_grammar(grammar: Grammar) {
	const token_defs = new UniqueDict<TokenDef>()
	const rules = new UniqueDict<Rule>()
	const macros = new UniqueDict<Macro>()
	macros.set('many_separated', Macro(
		'many_separated',
		OrderedDict.create_unique('name', [Arg('body_rule'), Arg('separator_rule')]).expect(''),
		[Var('body_rule'), Maybe([Many([Var('separator_rule'), Var('body_rule')])])],
	)).expect('')

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

	const rendered_tokens = token_defs.values().map(token_def => render_token_def(token_def))
	const rendered_macros = macros.values().map(macro => render_macro(macro))
	const rendered_rules = rules.values().map(rule => render_rule(rule))
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
	// the macro arguments are always going to be represented at runtime as ParseEntity
	const lockers = (macro.locking_args !== undefined ? macro.locking_args.values() : []).map(render_locking_arg)
	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		// function name
		ts.createIdentifier(macro.name),
		// generics
		macro.args.values().map(arg => ts.createTypeParameterDeclaration(
			ts.createIdentifier(arg.name.toUpperCase()),
			ts.createTypeReferenceNode(ts.createIdentifier('ParseEntity'), undefined), undefined,
		)),
		// actual args
		macro.args.values().map(arg => ts.createParameter(
			undefined, undefined, undefined,
			ts.createIdentifier(arg.name), undefined,
			ts.createTypeReferenceNode(ts.createIdentifier(arg.name.toUpperCase()), undefined), undefined,
		)),
		undefined,
		// render_definition has to return ts.createExpressionStatement[]
		ts.createBlock([...lockers, ...render_definition(macro.definition as Definition)], true),
	)
}

function render_rule(rule: Rule) {
	// rules are always just functions that at least initially take no parameters
	const lockers = (rule.locking_args !== undefined ? rule.locking_args.values() : []).map(render_locking_arg)
	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		ts.createIdentifier(rule.name),
		[], [], undefined,
		ts.createBlock([...lockers, ...render_definition(rule.definition)], true),
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



function render_definition(definition: Definition) {
	// each node in a definition needs to simply be createExpressionStatement, since it does nothing at first
	// some of those nodes require function calls, and their arguments are ParseEntities,
	// which require a special render in either atom or spread style

	const rendered = [] as ts.ExpressionStatement[]
	for (let node_index = 0; node_index < definition.length; node_index++) {
		const node = definition[node_index]
		const next = definition.slice(node_index + 1)
		// rendered.push(render_node(node, next))
		rendered.push(ts.createExpressionStatement(render_node(node, next)))
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

let global_lookaheads = [] as ReturnType<typeof ts.createCall>[]

function render_global_lookaheads() {
	return ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList(
		[ts.createVariableDeclaration(
			ts.createArrayBindingPattern(global_lookaheads.map((_lookahead, index) => ts.createBindingElement(
				undefined, undefined,
				ts.createIdentifier(`_${index}`), undefined,
			))),
			undefined,
			ts.createArrayLiteral(global_lookaheads, false),
		)], ts.NodeFlags.Const),
	)
}

function render_entity<B extends boolean>(
	target: Definition[] | Subrule | MacroCall,
	input_next: Definition,
	gather_more: boolean,
	atom_style: B
): B extends true ? Call : ts.Expression[] {
	if (Array.isArray(target) && target[0]!.length === 1 && target[0][0].type === 'Consume') {
		const c = target[0][0]
		return atom_style
			? ts.createCall(
				ts.createIdentifier('t'), undefined,
				c.token_names.map(ts.createIdentifier),
			) as B extends true ? Call : ts.Expression[]
			: c.token_names.map(ts.createIdentifier) as unknown as B extends true ? Call : ts.Expression[]
	}

	const next = input_next.slice()
	const [current, rendered_entity, rendered_args] = Array.isArray(target)
		? t(target, render_arrow(target[0]), [])
		: target.type === 'Subrule'
			? t([resolve_rule(target.rule_name)], ts.createIdentifier(target.rule_name), [])
			: t(
				[resolve_macro(target.macro_name, target.args)],
				ts.createIdentifier(target.macro_name),
				target.args.values().map(arg => render_entity([arg], [] as Definition, false, true)),
			)

	const final = gather_more
		? gather_branches(current, next)
		: current

	const decidable = compute_decidable(final[0], final.slice(1))
	const lookahead_definition = render_decidable(decidable)
	const lookahead_number = global_lookaheads.length
	global_lookaheads.push(lookahead_definition)
	const lookahead_ident = ts.createIdentifier(`_${lookahead_number}`)

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


function render_node(
	node: Node,
	next: Node[],
	required = true,
): ts.Expression {
	switch (node.type) {
	case 'Or':
		const choices = [] as ts.Expression[]
		for (let choice_index = 0; choice_index < node.choices.length; choice_index++) {
			const choice = node.choices[choice_index]
			const main = [choice].concat(node.choices.slice(choice_index + 1))
			choices.push(render_entity(main, next, !required, true))
		}
		return ts.createCall(
			ts.createIdentifier(required ? 'or' : 'maybe_or'), undefined, choices,
		)

	case 'Maybe':
		if (node.definition.length === 1)
			return render_node(node.definition[0], next, false)

		return ts.createCall(
			ts.createIdentifier('maybe'), undefined,
			render_entity([node.definition], next, true, false),
		)

	case 'Many':
		return ts.createCall(
			ts.createIdentifier(required ? 'many' : 'maybe_many'), undefined,
			render_entity([node.definition], next, !required, false),
		)

	case 'Subrule':
		return required
			? ts.createCall(ts.createIdentifier(node.rule_name), undefined, [])
			: ts.createCall(
				ts.createIdentifier('maybe'), undefined,
				render_entity(node, next, true, false),
			)

	case 'MacroCall':
		return required
			? ts.createCall(
				ts.createIdentifier(node.macro_name), undefined,
				node.args.values().map(arg => render_entity([arg], [] as Definition, false, true)),
			)
			: ts.createCall(
				ts.createIdentifier('maybe'), undefined,
				render_entity(node, next, true, false),
			)

	case 'Consume':
		return ts.createCall(
			ts.createIdentifier(required ? 'consume' : 'maybe'), undefined,
			node.token_names.map(ts.createIdentifier)
		)

	case 'Var':
		return ts.createCall(ts.createIdentifier('arg'), undefined, [ts.createIdentifier(node.arg_name)])
	case 'LockingVar':
		return ts.createCall(ts.createIdentifier(node.locking_arg_name), undefined, [])
	}
}




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
