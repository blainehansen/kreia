import '@ts-std/extensions/dist/array'

import { Dict } from '@ts-std/types'
// import { Result, Ok, Err } from '@ts-std/monads'
// import { DefaultDict } from '@ts-std/collections'

import { TokenDefinition } from './lexer'
import { Data, exhaustive } from './utils'

// export const Arg = Data((name: string) => {
// 	return { type: 'Arg' as const, name }
// })
// export type Arg = ReturnType<typeof Arg>

// export const Var = Data((arg_name: string) => {
// 	return { type: 'Var' as const, arg_name }
// })
// export type Var = ReturnType<typeof Var>


// export const Rule = Data((name: string, definition: Definition) => {
// 	return { type: 'Rule' as const, name, definition, is_locking: false as const }
// })

// export const LockingArg = Data((name: string, definition: Definition) => {
// 	return { type: 'LockingArg' as const, name, definition }
// })
// export type LockingArg = ReturnType<typeof LockingArg>

// export const LockingVar = Data((name: string) => {
// 	return { type: 'LockingVar' as const, name }
// })
// export type LockingVar = ReturnType<typeof LockingVar>

// export const LockingRule = Data((name: string, lockers: LockingArg[], definition: (Node | LockingVar)[]) => {
// 	return { type: 'Rule' as const, name, definition, is_locking: true as const, lockers }
// })
// export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

// export const Macro = Data((name: string, args: Arg[], definition: (Node | Var)[]) => {
// 	return { type: 'Macro' as const, name, args, definition }
// })
// export type Macro = ReturnType<typeof Macro>


// export const Subrule = Data((rule_name: string) => {
// 	return { type: 'Subrule' as const, rule_name }
// })
// export type Subrule = ReturnType<typeof Subrule>

export const Maybe = Data((definition: Definition) => {
	return { type: 'Maybe' as const, definition }
})
export type Maybe = Readonly<{ type: 'Maybe', definition: Definition }>

export const Many = Data((definition: Definition) => {
	return { type: 'Many' as const, definition }
})
export type Many = Readonly<{ type: 'Many', definition: Definition }>

export const Or = Data((choices: Definition[]) => {
	return { type: 'Or' as const, choices }
})
export type Or = Readonly<{ type: 'Or', choices: Definition[] }>

// export const MacroCall = Data((macro_name: string, args: Definition[]) => {
// 	return { type: 'MacroCall' as const, macro_name, args }
// })
// export type MacroCall = ReturnType<typeof MacroCall>

export const Consume = Data((token_names: string[]) => {
	return { type: 'Consume' as const, token_names }
})
export type Consume = ReturnType<typeof Consume>

export type Node =
	// | Subrule
	| Maybe
	| Many
	| Or
	// | MacroCall
	| Consume

export interface Definition extends Array<Node> {}

// export type GrammarItem =
// 	| TokenDefinition
// 	| Rule
// 	| Macro

// export type Grammar = GrammarItem[]


import { PathBuilder } from './decision'

const registered_tokens = {} as Dict<TokenDefinition>

export function register_tokens(token_definitions: TokenDefinition[]) {
	for (const token_definition of token_definitions) {
		registered_tokens[token_definition.name] = token_definition
	}
}


function gather_branches(current: Definition[], next: Definition) {
	const branches = current.slice()

	let node
	while (node = next.shift()) switch (node.type) {
	case 'Or':
		Array.prototype.push.apply(branches, node.choices)
		continue
	case 'Maybe':
		branches.push(node.definition)
		continue

	case 'Consume':
		branches.push([node])
		break
	default:
		// TODO this is overly simplified, Many needs some more thought
		branches.push(node.definition)
		break
	}

	return branches
}

function* into_branch_iter(definition: Definition): Generator<TokenDefinition | Definition[], void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		yield gather_branches(node.choices, nodes_to_visit)
		continue
	case 'Maybe':
		yield gather_branches([node.definition], nodes_to_visit)
		continue
	case 'Many':
		throw new Error()
		// yield* into_branch_iter(node.definition)
		// // in this situation we only have to check for one unambiguous match
		// // if the lookahead doesn't resolve by this point, for now we have to throw an error
		// // and until we have some sort of DecisionWhile concept, we can't do better
		// return
	case 'Consume':
		yield* node.token_names.map(token_name => registered_tokens[token_name]!)
		continue
	// case 'Subrule':
	// 	yield* into_branch_iter(resolve_subrule(rules, node))
	// 	continue
	// case 'MacroCall':
	// 	yield* into_branch_iter(resolve_macro(macros, node))
	// 	continue
	}
}

// this is to simultaneously iterate over the path and the next gathered branches
function* multi_iter(current: Definition[], next: Definition) {
	const iters = gather_branches(current, next)
		.map(definition => new IterWrapper(into_iter(definition)))

	let sub_array = iters.flat_map(i => i.next() || [])
	while (sub_array.length > 0) {
		yield sub_array
		sub_array = iters.flat_map(i => i.next() || [])
	}
}

function* into_iter(definition: Definition): Generator<TokenDefinition[], void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		yield* multi_iter(node.choices, nodes_to_visit)
		continue
	case 'Maybe':
		yield* multi_iter([node.definition], nodes_to_visit)
		continue
	case 'Many':
		throw new Error()
	case 'Consume':
		yield* node.token_names.map(token_name => [registered_tokens[token_name]!])
		continue
	}
}

import { IterWrapper } from './utils'

export function compute_decidable(main: Definition, against: Definition[]) {
	return _compute_decidable(
		new IterWrapper(into_branch_iter(main)),
		against.map(a => new IterWrapper(into_iter(a))),
		new PathBuilder(),
	)
}

function _compute_decidable(
	main: IterWrapper<TokenDefinition | Definition[]>,
	input_against: IterWrapper<TokenDefinition[]>[],
	builder: PathBuilder,
) {
	let against = input_against.slice()

	let item: TokenDefinition | Definition[]
	while (item = main.next()!) {
		// this next call will already mutate the underlying definition in gather_branches
		// so we could have entered this iteration of the loop with many things ahead
		// but the next will have none left

		if (Array.isArray(item)) {
			const new_against = [] as IterWrapper<TokenDefinition[]>[]
			const decision_paths = []

			for (const definition of item) {
				// it seems that *all* the exit states of the clone against iters of each definition
				// must be added to the new list of against
				const path_against = against.map(a => a.clone())
				Array.prototype.push.apply(new_against, path_against)

				decision_paths.push(_compute_decidable(
					new IterWrapper(into_branch_iter(definition)),
					path_against,
					new PathBuilder(),
				))
			}

			against = new_against
			builder.push_branch(decision_paths)
			continue
		}


		const against_items = [] as TokenDefinition[]
		const new_against = []
		for (const against_iter of against) {
			const against_item = against_iter.next()
			if (against_item === undefined)
				continue

			Array.prototype.push.apply(against_items, against_item)
			new_against.push(against_iter)
		}
		against = new_against

		const same = against_items.filter(a => a.name === (item as TokenDefinition).name)

		// if (same.length >= against.length)
		// 	throw new Error("all branches have the same stem")

		builder.push(item)
		if (same.length === 0)
			break
	}

	return builder.build()
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

// export class DecidableBuilder {
// 	private branches: Node[][] = []

// 	push(definitions: Node[][]) {
// 		for (const definition of definitions) {
// 			// filter out empty ones?
// 			if (definition.length === 0)
// 				continue
// 			this.branches.push(definition)
// 		}
// 	}

// 	try_build(last_branch: Node): Decidable | undefined {
// 		// it seems that if we end up in this state and there are zero or one branches,
// 		// then this is a truly superfluous thing and we should do nothing
// 		if (this.branches.length === 0)
// 			return undefined
// 		return compute_path(this.branches[0], this.branches.slice(1))
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
// 	// index, then recursively lookup, pushing to a list of errors
// 	// once you've done that, just ! assert all lookups at the codegen stage

// 	// check for left recursion or anything else

// 	// do codegen

// 	const token_definitions = new UniqueDict<TokenDefinition>()
// 	const macros = new UniqueDict<Macro>()
// 	const rules = new UniqueDict<Rule>()

// 	const conflict_errors = [] as string[]

// 	const matcher = {
// 		ok: () => {},
// 		err: (e: [string, unknown, unknown]) => {
// 			conflict_errors.push(`there are conflicting definitions for: ${e[0]}`)
// 		},
// 	}

// 	for (const grammar_item of Grammar) {
// 		switch (grammar_item.type) {
// 		case 'Token':
// 			token_definitions.set(grammar_item.name, grammar_item).match(matcher)
// 		case 'Rule':
// 			rules.set(grammar_item.name, grammar_item).match(matcher)
// 		case 'Macro':
// 			// TODO add a condition here to treat many_separated specially
// 			// maybe seed the macros UniqueDict with its base definition
// 			rules.set(grammar_item.name, grammar_item).match(matcher)
// 		}
// 	}

// 	if (conflict_errors.length > 0)
// 		throw new Error()

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
// // 		Array.prototype.push.apply(stack, node.content.nodes.slice().reverse())
// // 		continue

// // 	case 'Consume':
// // 		return undefined

// // 	case 'Or':
// // 	case 'MacroCall':

// // 	// here in the case of a Maybe, it can't prevent the top-level rule from being left-recursive, but it can still produce a left-recursive call

// // 	default:
// // 		Array.prototype.push.apply(stack, node.content.slice().reverse())
// // 		continue
// // 	}

// // 	return undefined
// // }
