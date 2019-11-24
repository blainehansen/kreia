import { Dict } from '@ts-std/types'
import '@ts-std/extensions/dist/array'
import { Enum, empty, variant } from '@ts-std/enum'
// import { Result, Ok, Err } from '@ts-std/monads'
import '@ts-std/collections/dist/impl.Hashable.string'
import { OrderedDict, UniqueDict, HashSet } from '@ts-std/collections'


import { TokenDefinition } from './lexer'
import { Data, exhaustive } from './utils'



export const VirtualLexerDirective = Data((virtual_lexer_name: string, destructure: (Token | Subrule)[]) => {
	return { type: 'VirtualLexerDirective' as const,  }
})



// export const LexerState = Data((state_name: string) => {
// 	return { type: 'LexerState' as const, state_name }
// })
// export type LexerState = ReturnType<typeof LexerState>

// const StateTransform = Enum({
// 	Push: variant<LexerState>(),
// 	Pop: empty(),
// })
// type StateTransform = Enum<typeof StateTransform> | undefined

// export const Token = Data((
// 	name: string, spec: string | string[],
// 	options: { ignore?: true, state_transform?: StateTransform },
// ) => {
// 	//
})


export const Arg = Data((name: string) => {
	return { type: 'Arg' as const, name }
})
export type Arg = ReturnType<typeof Arg>

export const Var = Data((arg_name: string): Node => {
	return { type: 'Var' as const, arg_name }
})
export type Var = Readonly<{ type: 'Var', arg_name: string }>


export const Rule = Data((name: string, definition: Definition) => {
	return { type: 'Rule' as const, name, definition, is_locking: false as const }
})

// export const LockingArg = Data((name: string, definition: Definition) => {
// 	return { type: 'LockingArg' as const, name, definition }
// })
// export type LockingArg = ReturnType<typeof LockingArg>

// export const LockingVar = Data((name: string) => {
// 	return { type: 'LockingVar' as const, name }
// })
// export type LockingVar = Readonly<{ type: 'LockingVar', name: string }>

// export const LockingRule = Data((name: string, lockers: LockingArg[], definition: Definition) => {
// 	return { type: 'Rule' as const, name, definition, is_locking: true as const, lockers }
// })
// export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>
export type Rule = ReturnType<typeof Rule>


export const Macro = Data((name: string, args: OrderedDict<Arg>, definition: Definition) => {
	return { type: 'Macro' as const, name, args, definition }
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
	// | LockingVar

export interface Definition extends Array<Node> {}

export type GrammarItem =
	| TokenDefinition
	| Rule
	| Macro

export type Grammar = GrammarItem[]


export let registered_tokens = {} as Dict<TokenDefinition>
export let registered_rules = {} as Dict<Rule>
export let registered_macros = {} as Dict<Macro>

export function register_tokens(token_definitions: TokenDefinition[]) {
	registered_tokens = token_definitions.unique_index_by('name').expect('')
}
export function register_rules(rules: Rule[]) {
	registered_rules = rules.unique_index_by('name').expect('')
}
export function register_macros(macros: Macro[]) {
	registered_macros = macros.unique_index_by('name').expect('')
}

export function resolve_macro(macro_name: string, args: OrderedDict<Definition>) {
	const macro = registered_macros[macro_name]!
	return _resolve_macro(args, macro.definition)
}
function _resolve_macro(args: OrderedDict<Definition>, definition: Definition) {
	const resolved = [] as Definition
	for (const node of definition) switch (node.type) {
	case 'Var':
		const arg_def = args.get_by_name(node.arg_name).to_undef()
		if (arg_def === undefined)
			throw new Error(`invalid arg: ${node.arg_name}`)
		resolved.push_all(arg_def)
		continue
	case 'Or':
		resolved.push(Or(node.choices.map(choice => _resolve_macro(args, choice))))
		continue
	case 'Maybe':
		resolved.push(Maybe(_resolve_macro(args, node.definition)))
		continue
	case 'Many':
		resolved.push(Many(_resolve_macro(args, node.definition)))
		continue
	case 'MacroCall':
		const new_args = node.args.map(arg_def => _resolve_macro(args, arg_def))
		resolved.push(MacroCall(node.macro_name, new_args))
		continue
	// Consume, Subrule
	default:
		resolved.push(node)
		continue
	}

	return resolved
}


// import ts = require('typescript')

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

	default: return exhaustive(node)
	}

	return validation_errors
}


export function render_grammar(grammar: Grammar) {
	const token_definitions = new UniqueDict<TokenDefinition>()
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
		case 'Token':
			return token_definitions.set(grammar_item.name, grammar_item).match(matcher)
		case 'Rule':
			return rules.set(grammar_item.name, grammar_item).match(matcher)
		case 'Macro':
			return macros.set(grammar_item.name, grammar_item).match(matcher)
		}
	})

	if (conflict_errors.length > 0)
		throw new Error(conflict_errors.join('\n\n'))

	registered_tokens = token_definitions.into_dict()
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

	const rendered_tokens = token_definitions.values().map(token_definition => {
		return ts.createExpressionStatement(
			ts.createCall(ts.createIdentifier('Token'), undefined, [
				ts.createStringLiteral(token_definition.name),
				// ts.createRegularExpressionLiteral('/\\s+/'),
				ts.createRegularExpressionLiteral(token_definition.regex.source),
				ts.createObjectLiteral(
					[
						ts.createPropertyAssignment(
							ts.createIdentifier('ignore'),
							ts.createTrue(),
						),
					],
					false,
				),
			]),
		)
	})

	const rendered_macros = macros.values.map(macro => {
		// the macro arguments are always going to be represented at runtime as ParseEntity
		return ts.createFunctionDeclaration(
			undefined, undefined, undefined,
			// function name
			ts.createIdentifier(macro.name),
			// generics
			macro.args.map(arg => ts.createTypeParameterDeclaration(
				ts.createIdentifier(arg.name.toUpperCase()),
				ts.createTypeReferenceNode(ts.createIdentifier('ParseEntity'), undefined), undefined,
			)),
			// actual args
			macro.args.map(arg => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(arg.name), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier(arg.name.toUpperCase()), undefined), undefined,
			)),
			undefined,
			// render_definition has to return ts.createExpressionStatement[]
			ts.createBlock(render_definition(macro.definition), true),
		)
	})

	const rendered_rules = rules.values.map(rule => {
		// rules are always just functions that at least initially take no parameters
		return ts.createFunctionDeclaration(
			undefined, undefined, undefined,
			ts.createIdentifier(rule.name),
			[], [], undefined,
			ts.createBlock(render_definition(rule.definition), true),
		)
	})
}




// // let global_lookaheads = [] as (ReturnType<typeof ts.createVariableDeclarationList>)[]
// let global_lookaheads = [] as (ReturnType<typeof ts.createCall>)[]

// function render_global_lookaheads() {
// 	return ts.createVariableStatement(
// 		undefined,
// 		ts.createVariableDeclarationList(
// 			[
// 				ts.createVariableDeclaration(
// 					ts.createArrayBindingPattern(global_lookaheads.map((_lookahead, index) => ts.createBindingElement(
// 						undefined, undefined,
// 						ts.createIdentifier(`_${index}`),
// 						undefined,
// 					))),
// 					undefined,
// 					ts.createArrayLiteral(
// 						global_lookaheads,
// 						false,
// 					),
// 				),
// 			],
// 			ts.NodeFlags.Const,
// 		),
// 	)
// }

// function render(definition: Definition, variation: 'atom' | 'spread') {
// 	if (definition.length === 1) {
// 		//
// 	}

// 	// this is the only function that actually has to use ts.createExpressionStatement

// 	switch (variation) {
// 	case 'atom':
// 		return ts.createCall(ts.createIdentifier(is_consume ? 't' : 'f'), undefined, [])
// 	case 'spread':
// 		return ts.createCall(ts.createIdentifier(is_consume ? 't' : 'f'), undefined, [])
// 	}
// }


// function render_lookahead(current: Node[][], next: Node[]) {
// 	const builder = new DecidableBuilder()
// 	builder.push(current)

// 	const nodes = next.slice()
// 	let node
// 	while (node = nodes.shift()) {
// 		if (node.type === 'Or')
// 			builder.push(found_branch.choices)
// 		else if (node.type === 'Maybe')
// 			builder.push([found_branch.definition])
// 		// else if (node.type === 'Many')
// 		// 	builder.push(found_branch.definition)
// 		else
// 			break
// 	}

// 	const lookahead_definition = builder.try_build(node)
// 	const lookahead_number = global_lookaheads.length
// 	global_lookaheads.push(lookahead_definition)

// 	// ts.createVariableStatement(
// 	// 	undefined,
// 	// 	ts.createVariableDeclarationList(
// 	// 		[
// 	// 			ts.createVariableDeclaration(
// 	// 				ts.createIdentifier('a'),
// 	// 				undefined,
// 	// 				ts.createNew(ts.createIdentifier('DecisionPath'), undefined, [
// 	// 					ts.createArrayLiteral([ts.createIdentifier('Whitespace')], false),
// 	// 				]),
// 	// 			),
// 	// 		],
// 	// 		ts.NodeFlags.Const,
// 	// 	),
// 	// )

// 	return ts.createIdentifier(`_${lookahead_number}`)
// 	// return ts.createExpressionStatement(ts.createCall(
// 	// 	ts.createIdentifier('f'), undefined,
// 	// 	[render(current[0]!), ts.createIdentifier(lookahead_ident)],
// 	// ))
// }

// function render_node(
// 	node: Node,
// 	next: Node[],
// 	required = true,
// ) {
// 	switch (node.type) {
// 	case 'Or':
// 		const choices = []
// 		for (let choice_index = 0; choice_index < node.choices.length; choice_index++) {
// 			const choice = node.choices[choice_index]
// 			// in this case we need both the rendered definition and the lookahead for each one
// 			const rendered = render_with_lookahead([choice].concat(node.choices.slice(choice_index + 1)), next)
// 			choices.push(rendered)
// 		}
// 		return ts.createExpressionStatement(ts.createCall(
// 			ts.createIdentifier(required ? 'or' : 'maybe_or'), undefined, choices,
// 		))

// 	case 'Maybe':
// 		if (node.definition.length === 1)
// 			return render_node(node.definition, next, false)

// 		return render_with_lookahead([node.definition], next)

// 	case 'Many':
// 		const [spread, lookahead] = render(node.definition, next, 'spread')
// 		const many = ts.createCall(
// 			ts.createIdentifier(required ? 'many' : 'maybe_many'), undefined, spread,
// 		)
// 		return wrap_function_maybe(required, many, node, next, lookahead)

// 	case 'Subrule':
// 		const subrule = ts.createCall(
// 			ts.createIdentifier(node.rule_name), undefined, [],
// 		)
// 		return wrap_function_maybe(required, subrule, node, next)

// 	case 'MacroCall':
// 		const macro_call = ts.createCall(
// 			ts.createIdentifier(node.macro_name), undefined,
// 			node.args.map(render),
// 		)
// 		return wrap_function_maybe(required, macro_call, node, next)

// 	case 'Consume':
// 		return ts.createExpressionStatement(ts.createCall(
// 			ts.createIdentifier(required ? 'maybe' : 'consume'), undefined,
// 			node.token_names.map(token_name => ts.createIdentifier(token_name))
// 		))
// 	}
// }

// function wrap_function_maybe(
// 	required: boolean,
// 	wrapping: ReturnType<typeof ts.createCall>,
// 	node: Node,
// 	next: Node[],
// 	already_rendered_lookahead?: ReturnType<typeof ts.createIdentifier> = undefined,
// ) {
// 	const item = required
// 		? wrapping
// 		: ts.createCall(
// 			ts.createIdentifier('maybe'), undefined,
// 			[wrapping, already_rendered_lookahead || render_lookahead([node.definition], next)],
// 		)
// 	return ts.createExpressionStatement(item)
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
