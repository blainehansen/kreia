import { Result, Ok, Err } from '@ts-std/monads'
import { DefaultDict } from '@ts-std/collections'

import { TokenDefinition } from './lexer'
import { Data, exhaustive } from './utils'

export const Arg = Data((name: string) => {
	return { type: 'Arg' as const, name }
})
export type Arg = ReturnType<typeof Arg>

export const Var = Data((arg_name: string) => {
	return { type: 'Var' as const, arg_name }
})
export type Var = ReturnType<typeof Var>


export const Rule = Data((name: string, definition: Definition) => {
	return { type: 'Rule' as const, name, definition, is_locking: false as const }
})

export const LockingArg = Data((name: string, definition: Definition) => {
	return { type: 'LockingArg' as const, name, definition }
})
export type LockingArg = ReturnType<typeof LockingArg>

export const LockingVar = Data((name: string) => {
	return { type: 'LockingVar' as const, name }
})
export type LockingVar = ReturnType<typeof LockingVar>

export const LockingRule = Data((name: string, lockers: LockingArg[], definition: (Node | LockingVar)[]) => {
	return { type: 'Rule' as const, name, definition, is_locking: true as const, lockers }
})
export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

export const Macro = Data((name: string, args: Arg[], definition: (Node | Var)[]) => {
	return { type: 'Macro' as const, name, args, definition }
})
export type Macro = ReturnType<typeof Macro>


export const Subrule = Data((rule_name: string) => {
	return { type: 'Subrule' as const, rule_name }
})
export type Subrule = ReturnType<typeof Subrule>

export const Maybe = Data((definition: Definition) => {
	return { type: 'Maybe' as const, definition }
})
export type Maybe = ReturnType<typeof Maybe>

export const Many = Data((definition: Definition) => {
	return { type: 'Many' as const, definition }
})
export type Many = ReturnType<typeof Many>

export const Or = Data((choices: Definition[]) => {
	return { type: 'Or' as const, choices }
})
export type Or = ReturnType<typeof Or>

export const MacroCall = Data((macro_name: string, args: Definition[]) => {
	return { type: 'MacroCall' as const, macro_name, args }
})
export type MacroCall = ReturnType<typeof MacroCall>

export const Consume = Data((token_names: string[]) => {
	return { type: 'Consume' as const, token_names }
})
export type Consume = ReturnType<typeof Consume>

export type Node =
	| Subrule
	| Maybe
	| Many
	| Or
	| MacroCall
	| Consume

export type Definition = Node[]

export type GrammarItem =
	| TokenDefinition
	| Rule
	| Macro

export type Grammar = GrammarItem[]


import ts = require('typescript')

function render(definition: Definition) {
	// if it's a consume you
	if (definition.length === 1 && definition[0].type)
}

function render_with_lookahead(current: Node[][], next: Node[]) {
	const builder = new BranchBuilder()
	builder.push_all(current)

	let node
	while (node = nodes.shift()) {
		// if the node is also branching, push it
		if (node.type === 'Or')
			builder.push_all(found_branch.choices)
		else if (node.type === 'Maybe')
			builder.push(found_branch.definition)
		else if (node.type === 'Many')
			builder.push(found_branch.definition)
		else {
			builder.push_required(node)
			break
		}
	}

	const branch = builder.try_build()
	const [lookahead_ident, lookahead_definition] = branch
		? compute_path(branch[0]!, branch.slice(1))
		: t(undefined, undefined)

	// ts.createVariableStatement(
	// 	undefined,
	// 	ts.createVariableDeclarationList(
	// 		[
	// 			ts.createVariableDeclaration(
	// 				ts.createIdentifier('a'),
	// 				undefined,
	// 				ts.createNew(ts.createIdentifier('DecisionPath'), undefined, [
	// 					ts.createArrayLiteral([ts.createIdentifier('Whitespace')], false),
	// 				]),
	// 			),
	// 		],
	// 		ts.NodeFlags.Const,
	// 	),
	// )

	global_lookaheads.push(lookahead_definition)

	return ts.createExpressionStatement(ts.createCall(
		ts.createIdentifier('func'), undefined,
		[render(current[0]!), ts.createIdentifier(lookahead_ident)],
	))
}

function render_node(
	node: Node,
	next: Node[],
) {
	switch (node.type) {
	case 'Or':
		const choices = []
		for (let choice_index = 0; choice_index < node.choices.length; choice_index++) {
			const choice = node.choices[choice_index]
			const rendered = render_with_lookahead([choice].concat(node.choices.slice(choice_index + 1)), next)
			choices.push(rendered)
		}
		return ts.createExpressionStatement(ts.createCall(
			ts.createIdentifier('or'), undefined, choices,
		))

	case 'Maybe':
		// TODO all of these could have little optimizations to have maybe versions of all nodes and flatten things
		return render_with_lookahead([node.definition], next)

	case 'Many':
		return render_with_lookahead([node.definition], next)

	case 'Subrule':
		return ts.createExpressionStatement(ts.createCall(
			ts.createIdentifier(node.rule_name), undefined, [],
		))

	case 'MacroCall':
		return ts.createExpressionStatement(ts.createCall(
			ts.createIdentifier(node.macro_name), undefined,
			node.args.map(render),
		))

	case 'Consume':
		return ts.createExpressionStatement(ts.createCall(
			ts.createIdentifier('consume'), undefined,
			node.token_names.map(token_name => ts.createIdentifier(token_name))
		))
	}
}


function render_grammar(grammar: Grammar) {
	// index, then recursively lookup, pushing to a list of errors
	// once you've done that, just ! assert all lookups at the codegen stage

	// check for left recursion or anything else

	// do codegen

	const token_definitions = new DefaultDict<TokenDefinition>()
	const macros = new DefaultDict<Macro>()
	const rules = new DefaultDict<Rule>()

	const conflict_errors = [] as string[]

	const matcher = {
		ok: () => {},
		err: (e: [string, unknown, unknown]) => {
			conflict_errors.push(`there are conflicting definitions for: ${e[0]}`)
		},
	}

	for (const grammar_item of Grammar) {
		switch (grammar_item.type) {
		case 'Token':
			token_definitions.set(grammar_item.name, grammar_item).match(matcher)
		case 'Rule':
			rules.set(grammar_item.name, grammar_item).match(matcher)
		case 'Macro':
			rules.set(grammar_item.name, grammar_item).match(matcher)
		}
	}

	if (conflict_errors.length > 0)
		throw new Error()

	// const rendered_tokens = token_definitions.values.map(token_definition => {
	// 	return ts.createExpressionStatement(
	// 		ts.createCall(ts.createIdentifier('Token'), undefined, [
	// 			ts.createStringLiteral(token_definition.name),
	// 			ts.createRegularExpressionLiteral('/\\s+/'),
	// 			ts.createObjectLiteral(
	// 				[
	// 					ts.createPropertyAssignment(
	// 						ts.createIdentifier('ignore'),
	// 						ts.createTrue(),
	// 					),
	// 				],
	// 				false,
	// 			),
	// 		]),
	// 	)
	// })

	const rendered_macros = macros.values.map(macro => {
		//
	})

	const rendered_rules = rules.values.map(rule => {
		//
	})


	// basically at the end we have a list of lookaheads with sequential index based identifiers
	// then some statements for creating all the lexer definition stuff
	// then all the function declarations for subrules and macros
}


// const Padded = Macro(
// 	'padded', [Arg('body')],
// 	Maybe(Consume('Whitespace')),
// 	Var('body'),
// 	Maybe(Consume('Whitespace')),
// )

const ManySeparated = Macro(
	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
	Var('body_rule'),
	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
)

const Grammar: Grammar = [
	Token('LeftParen', '('),
	Token('RightParen', ')'),
	Token('Num', /[0-9]+/),
	Token('Nil', 'nil'),
	Token('Comma', ','),
	Token('Whitespace', /\s+/, { ignore: true }),

	Rule('lists',
		Many(Subrule('parenthesized_number_list')),
	),
	Rule('parenthesized_number_list',
		Consume('LeftParen'),
		Maybe(Subrule('number_list'))
		Consume('RightParen'),
	),
	Rule('number_list',
		MacroCall('many_separated',
			[Or(
				[Subrule('parenthesized_number_list')],
				[Or([Consume('Num')], [Consume('Nil')])],
			)],
			[Consume('Comma')],
		),
	),
]





// a few things have to happen

// # validate the ast
// go through every item in the grammar, and check that it is valid
// there are a few requirements
// - all references to tokens (consume), macros (macrocall), and rules (subrule) must actually exist (create a lookup map for each variety, and recursively check all grammar nodes. there will also be a step of some sort to convert abstract ast subrules into resolved ones) actually this whole step might be unwise. it might be a good idea to simply look things up as you go through the validation and generation steps, using a monad.Maybe to unwrap things.
// - rules must not be left-recursive (every rule must descend to a non-optional consume before it can call itself in a subrule. when recursing into a maybe, consumes within the non-optional path of the maybe only terminate the maybe, not the whole rule)

// # figure out unambiguous lookaheads
// traverse the tree, and at every decision point (a Maybe, Or, Many), follow this algorithm:
// - gather all differentiatable paths
// -- (for a Maybe, it's the Maybe path as well as all next paths including the first mandatory path)
// -- (for an Or, it's all the branches of the Or)
// -- (for a Many, the branch is the continuation point after the body_rule, including all next paths like Maybe)
// - traverse all differentiatable paths at the same time. you keep all paths that have an identical sibling. so every time a path has a mandatory consume that's different than all the others, you can remove it from consideration and give it the lookahead branch you've calculated so far. a path requires a so-far-possibly-identical sibling to be kept, so by definition if there's only one left, we're done.
// - if you reach the end of the branches and there are more than one remaining, the grammar is redundant or undecidable

// function check_lr_rules(rules: Rule[]) {
// 	const lr_rules = [] as Rule[]
// 	for (const rule of rules) {
// 		const lr_name = check_lr_rule(rule)
// 		if (lr_name !== undefined)
// 			lr_rules.push(lr_name)
// 	}

// 	if (lr_rules.length > 0)
// 		throw new Error(`There are rules which are left-recursive: ${lr_rules.join(', ')}`)
// }

// function check_lr_rule(rule: Rule): string | undefined {
// 	const stack = rule.nodes.slice()
// 	let node
// 	while (node = stack.pop()) switch (node.key) {
// 	case 'Subrule':
// 		if (node.content.name === rule.name)
// 			return rule.name
// 		Array.prototype.push.apply(stack, node.content.nodes.slice().reverse())
// 		continue

// 	case 'Consume':
// 		return undefined

// 	case 'Or':
// 	case 'MacroCall':

// 	// here in the case of a Maybe, it can't prevent the top-level rule from being left-recursive, but it can still produce a left-recursive call

// 	default:
// 		Array.prototype.push.apply(stack, node.content.slice().reverse())
// 		continue
// 	}

// 	return undefined
// }

// function analyze_and_render_rules(rules: RuleDefinition[]) {
// 	const rules = {} as { [rule_name: string]: Rule }
// 	const macros = {} as { [macro_name: string]: Macro }

// 	for (const rule of rules) {
// 		switch (rule.type) {
// 		case 'Rule':
// 			rules[rule.name] = rule
// 		case 'Macro':
// 			macros[rule.name] = rule
// 		}
// 	}
// }
