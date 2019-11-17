import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
// import { Result, Ok, Err } from '@ts-std/monads'
import { OrderedDict, UniqueDict } from '@ts-std/collections'

import { PathBuilder } from './decision'
import { TokenDefinition } from './lexer'
import { Data, exhaustive, IterWrapper } from './utils'


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

// export type Grammar = GrammarItem[]


const registered_tokens = {} as Dict<TokenDefinition>
const registered_rules = {} as Dict<Rule>
const registered_macros = {} as Dict<Macro>

export function register_tokens(token_definitions: TokenDefinition[]) {
	for (const token_definition of token_definitions) {
		registered_tokens[token_definition.name] = token_definition
	}
}
export function register_rules(rules: Rule[]) {
	for (const rule of rules) {
		registered_rules[rule.name] = rule
	}
}
export function register_macros(macros: Macro[]) {
	for (const macro of macros) {
		registered_macros[macro.name] = macro
	}
}

function resolve_macro(macro_name: string, args: OrderedDict<Definition>) {
	const macro = registered_macros[macro_name]!
	return _resolve_macro(args, macro.definition)
}
export function _resolve_macro(args: OrderedDict<Definition>, definition: Definition) {
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




function gather_branches(current: Definition[], next: Definition) {
	const branches = current.slice()

	let node
	while (node = next.shift()) switch (node.type) {
	case 'Or':
		branches.push_all(node.choices)
		continue
	case 'Maybe':
		branches.push(node.definition)
		continue

	case 'Consume':
		branches.push([node as Node])
		break
	case 'Many':
		branches.push(node.definition)
		break
	case 'Subrule':
		const rule = registered_rules[node.rule_name]!
		branches.push(rule.definition)
		break
	case 'MacroCall':
		const resolved = resolve_macro(node.macro_name, node.args)
		branches.push(resolved)
		break
	case 'Var':
		throw new Error(`unexpected Var: ${node}`)
	}

	return branches
}

const Continue = Data((continue_definition: Definition) => {
	return { type: 'Continue' as const, continue_definition }
})
type Continue = ReturnType<typeof Continue>

function is_continue(item: TokenDefinition | Continue): item is Continue {
	return 'type' in item && item.type === 'Continue'
}


type AstIterItem = TokenDefinition | Definition[] | Continue
type AstIter = IterWrapper<AstIterItem>

function* iterate_definition(definition: Definition): Generator<AstIterItem, void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		yield node.choices
		continue
	case 'Maybe':
		yield gather_branches([node.definition], nodes_to_visit)
		continue
	case 'Many':
		yield* iterate_definition(node.definition)
		yield Continue(node.definition)
		continue
	case 'Consume':
		yield* node.token_names.map(token_name => registered_tokens[token_name]!)
		continue
	case 'Subrule':
		const rule = registered_rules[node.rule_name]!
		yield* iterate_definition(rule.definition)
		continue
	case 'MacroCall':
		const resolved = resolve_macro(node.macro_name, node.args)
		yield* iterate_definition(resolved)
		continue
	case 'Var':
		throw new Error(`unexpected Var ${node}`)
	}
}

function AstIter(definition: Definition): AstIter {
	return IterWrapper.create(() => iterate_definition(definition))
}
function EternalAstIter(definition: Definition): AstIter {
	return IterWrapper.create_eternal(() => iterate_definition(definition))
}

export function compute_decidable(main: Definition, against: Definition[]) {
	const [path, _] = _compute_decidable(
		AstIter(main),
		against.map(AstIter),
		new PathBuilder(),
	)
	return path
}

function _compute_decidable(
	main: AstIter,
	input_against: AstIter[],
	builder: PathBuilder,
) {
	let against = input_against.slice()

	let item
	while (item = main.next()) {
		// console.log()
		// console.log()
		// console.log('beginning iteration')
		// console.log(item)
		// console.log('against.length')
		// console.log(against.length)

		if (against.length === 0)
			break

		// this next call will already mutate the underlying definition in gather_branches
		// so we could have entered this iteration of the loop with many things ahead
		// but the next will have none left

		if (Array.isArray(item)) {
			if (item.length === 0)
				throw new Error('empty definition')

			// console.log('branching')
			const new_against = [] as AstIter[]
			const decision_paths = []

			for (const definition of item) {
				// console.log('recursing on item')
				// console.log(item)
				// console.log()
				// it seems that *all* the exit states of the clone against iters of each definition
				// must be added to the new list of against
				const [decision_path, continued_against] = _compute_decidable(
					AstIter(definition),
					against.map(a => a.clone()),
					new PathBuilder(),
				)
				new_against.push_all(continued_against)
				decision_paths.push(decision_path)
			}
			against = new_against

			// console.log('finished with recursion')
			// console.log()

			builder.push_branch(decision_paths)
			continue
		}

		if (is_continue(item))
			// since we've placed an against.length check before this,
			// hitting here means this thing is undecidable, at least for now
			throw new Error('undecidable')

		// console.log('NOT branching')

		const new_against = [] as AstIter[]
		const against_iters = against.slice()

		let against_iter: AstIter
		while (against_iter = against_iters.shift()!) {
			// console.log()
			// console.log('against_iter')
			// console.log(against_iter)
			const against_item = against_iter.next()
			// console.log('against_item')
			// console.log(against_item)
			if (against_item === undefined)
				continue

			if (Array.isArray(against_item)) {
				// const child_iters = against_item.map(AstIter)
				const child_iters = against_item.map(
					definition => IterWrapper.chain_iters(AstIter(definition), against_iter.clone()),
				)
				against_iters.push_all(child_iters)
				continue
			}

			if (is_continue(against_item)) {
				// we'll just keep cycling this iterator over and over
				// that's a safe choice since the main loop will die if it also has one
				// new_against.push(EternalAstIter(against_item.continue_definition))
				against_iters.push(EternalAstIter(against_item.continue_definition))
				continue
			}

			if (item.name !== against_item.name)
				continue

			new_against.push(against_iter)
		}
		// console.log('new_against')
		// console.log(new_against)
		against = new_against

		// if (same >= against.length)
		// 	throw new Error("all branches have the same stem")

		builder.push(item)
	}

	// against.length being non-zero here means that we exhausted the main branch before the others
	// we could choose to make that an error condition, but it seems too picky
	// for example, what about this: (A, B, C)? (A, B, C, D)
	// that's a situation that might make perfect sense,
	// since the Maybe only happens once, the next could definitely happen
	// it definitely means you need to warn people that the first matched rule in an Or will be taken,
	// so they should put longer ones first if they share stems

	return t(builder.build(), against)
}

// import ts = require('typescript')

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


// function render_grammar(grammar: Grammar) {
// 	const token_definitions = new UniqueDict<TokenDefinition>()
// 	const macros = new UniqueDict<Macro>()
// 	macros.set('many_separated', Macro(
// 		'many_separated', [Arg('body_rule'), Arg('separator_rule')],
// 		[Var('body_rule'), Maybe(Many(Var('separator_rule'), Var('body_rule')))],
// 	))
// 	const rules = new UniqueDict<Rule>()

// 	const conflict_errors = [] as string[]

// 	const matcher = {
// 		ok: () => {},
// 		err: (e: [string, unknown, unknown]) => {
// 			conflict_errors.push(`there are conflicting definitions for: ${e[0]}`)
// 		},
// 	}

// 	for (const grammar_item of grammar) {
// 		switch (grammar_item.type) {
// 		case 'Token':
// 			token_definitions.set(grammar_item.name, grammar_item).match(matcher)
// 		case 'Rule':
// 			rules.set(grammar_item.name, grammar_item).match(matcher)
// 		case 'Macro':
// 			macros.set(grammar_item.name, grammar_item).match(matcher)
// 		}
// 	}

// 	if (conflict_errors.length > 0)
// 		throw new Error()

// 	// check for left recursion or anything else

// 	// const rendered_tokens = token_definitions.values.map(token_definition => {
// 	// 	return ts.createExpressionStatement(
// 	// 		ts.createCall(ts.createIdentifier('Token'), undefined, [
// 	// 			ts.createStringLiteral(token_definition.name),
// 	// 			ts.createRegularExpressionLiteral('/\\s+/'),
// 	// 			ts.createObjectLiteral(
// 	// 				[
// 	// 					ts.createPropertyAssignment(
// 	// 						ts.createIdentifier('ignore'),
// 	// 						ts.createTrue(),
// 	// 					),
// 	// 				],
// 	// 				false,
// 	// 			),
// 	// 		]),
// 	// 	)
// 	// })

// 	const rendered_macros = macros.values.map(macro => {
// 		// the macro arguments are always going to be represented at runtime as ParseEntity
// 		return ts.createFunctionDeclaration(
// 			undefined, undefined, undefined,
// 			// function name
// 			ts.createIdentifier(macro.name),
// 			// generics
// 			macro.args.map(arg => ts.createTypeParameterDeclaration(
// 				ts.createIdentifier(arg.name.toUpperCase()),
// 				ts.createTypeReferenceNode(ts.createIdentifier('ParseEntity'), undefined), undefined,
// 			)),
// 			// actual args
// 			macro.args.map(arg => ts.createParameter(
// 				undefined, undefined, undefined,
// 				ts.createIdentifier(arg.name), undefined,
// 				ts.createTypeReferenceNode(ts.createIdentifier(arg.name.toUpperCase()), undefined), undefined,
// 			)),
// 			undefined,
// 			ts.createBlock(
// 				// these all have to be ts.createExpressionStatement
// 				render_definition(macro.definition),
// 				// multiline
// 				true,
// 			),
// 		)
// 	})

// 	const rendered_rules = rules.values.map(rule => {
// 		// rules are always just functions that at least initially take no parameters
// 		return ts.createFunctionDeclaration(
// 			undefined, undefined, undefined,
// 			ts.createIdentifier(rule.name),
// 			[], [], undefined,
// 			ts.createBlock(render_definition(rule.definition), true),
// 		)
// 	})
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





// // a few things have to happen

// // # validate the ast
// // go through every item in the grammar, and check that it is valid
// // there are a few requirements
// // - all references to tokens (consume), macros (macrocall), and rules (subrule) must actually exist (create a lookup map for each variety, and recursively check all grammar nodes. there will also be a step of some sort to convert abstract ast subrules into resolved ones) actually this whole step might be unwise. it might be a good idea to simply look things up as you go through the validation and generation steps, using a monad.Maybe to unwrap things.
// // - rules must not be left-recursive (every rule must descend to a non-optional consume before it can call itself in a subrule. when recursing into a maybe, consumes within the non-optional path of the maybe only terminate the maybe, not the whole rule)

// // # figure out unambiguous lookaheads
// // traverse the tree, and at every decision point (a Maybe, Or, Many), follow this algorithm:
// // - gather all differentiatable paths
// // -- (for a Maybe, it's the Maybe path as well as all next paths including the first mandatory path)
// // -- (for an Or, it's all the branches of the Or)
// // -- (for a Many, the branch is the continuation point after the body_rule, including all next paths like Maybe)
// // - traverse all differentiatable paths at the same time. you keep all paths that have an identical sibling. so every time a path has a mandatory consume that's different than all the others, you can remove it from consideration and give it the lookahead branch you've calculated so far. a path requires a so-far-possibly-identical sibling to be kept, so by definition if there's only one left, we're done.
// // - if you reach the end of the branches and there are more than one remaining, the grammar is redundant or undecidable

// // function check_lr_rules(rules: Rule[]) {
// // 	const lr_rules = [] as Rule[]
// // 	for (const rule of rules) {
// // 		const lr_name = check_lr_rule(rule)
// // 		if (lr_name !== undefined)
// // 			lr_rules.push(lr_name)
// // 	}

// // 	if (lr_rules.length > 0)
// // 		throw new Error(`There are rules which are left-recursive: ${lr_rules.join(', ')}`)
// // }

// // function check_lr_rule(rule: Rule): string | undefined {
// // 	const stack = rule.nodes.slice()
// // 	let node
// // 	while (node = stack.pop()) switch (node.key) {
// // 	case 'Subrule':
// // 		if (node.content.name === rule.name)
// // 			return rule.name
// // 		stack.push_all(node.content.nodes.slice().reverse())
// // 		continue

// // 	case 'Consume':
// // 		return undefined

// // 	case 'Or':
// // 	case 'MacroCall':

// // 	// here in the case of a Maybe, it can't prevent the top-level rule from being left-recursive, but it can still produce a left-recursive call

// // 	default:
// // 		stack.push_all(node.content.slice().reverse())
// // 		continue
// // 	}

// // 	return undefined
// // }
