import { Result, Ok, Err } from '@ts-std/monads'

import { Data } from './utils'
import * as gen from './ast_gen'
// import { TokenDefinition, regulate_regex, match_token } from './states_lexer'

export namespace ast {
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
}

function finalize_grammar(grammar: ast.Grammar): gen.Grammar {
	const token_definitions = {} as Dict<TokenDefinition>
	const macros = {} as Dict<Macro>
	const rules = {} as Dict<Rule>

	for (const grammar_item of Grammar) {
		switch (grammar_item.type) {
		case 'Token':
			token_definitions[grammar_item.name] = grammar_item
		case 'Rule':
			rules[grammar_item.name] = grammar_item
		case 'Macro':
			rules[grammar_item.name] = grammar_item
		}
	}

	for (const rule of Object.values(rules)) {
		// rule.definition
		// we go along each node, computing its lookahead path
		// if the node is a maybe, bundle its definition as well as all the next definitions we can find that are optional
		// basically we lump together branches
		// encountering a Maybe means we lump it together with all next Maybes, stopping when we include either a non-Maybe or an Or

		// we do something similar for an Or, we grab and lump together all the Maybes

		// we also do something similar for a Many, but it's a little more complicated
		// the first iteration isn't optional by definition, but we need to compute it's lookahead based on it's definition and the next things

		// for (const node of rule.definition)
	}
}

function finalize_node(
	node: ast.Node,
	token_definitions: Dict<TokenDefinition>,
	rules: Dict<gen.Rule>,
	macros: Dict<gen.Macro>,
): Result<gen.Node> {
	switch (node.type) {
	case 'Subrule':
		return result_get(rules, node.rule_name)
			.change(gen.Subrule)
	case 'Or':
		return node.choices
			.map(choice => choice.try_map(node => finalize_node(node, token_definitions, rules, macros)))
	case 'MacroCall':
		return result_get(macros, node.macro_name)
			.change(gen.MacroCall)
	case 'Consume':
		return node.token_names
			.try_map(token_name => result_get(token_definitions, token_name))
			.change(gen.Consume)
	case 'Maybe':
		return node.definition.try_map(node => finalize_node(node, token_definitions, rules, macros))
	case 'Many':
		return node.definition.try_map(node => finalize_node(node, token_definitions, rules, macros))
	}
}

function finalize_rule(rule: ast.Rule) {
	if (rule.is_locking)
		return definition
			.try_map(
				node => node.type === 'LockingVar'
					?
					: finalize_node(node, token_definitions, rules, macros)
			)
			.change()

		return gen.LockingRule(name, rule.lockers, )
	else
		return rule.definition
			.try_map(node => finalize_node(node, token_definitions, rules, macros))
			.change(definition => gen.Rule(rule.name, definition))
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


function exhaustive(): never {
	throw new Error()
}

function lump_branches(found_branch: Or | Maybe | Many, next: Node[]): DecisionBranch | undefined {
	const branch = new BranchBuilder()

	// the type of the found_branch only determines how we push to the builder
	switch (found_branch.type) {
	case 'Or':
		branch.push_all(found_branch.choices)
		break
	case 'Maybe':
		branch.push(found_branch.definition)
		break
	case 'Many':
		branch.push(found_branch.definition)
		break
	default:
		return exhaustive()
	}

	let node
	while (node = nodes.shift()) {
		// if the node is also branching, push it
		if (node.type === 'Or')
			branch.push_all(found_branch.choices)
		else if (node.type === 'Maybe')
			branch.push(found_branch.definition)
		else if (node.type === 'Many')
			branch.push(found_branch.definition)
		else {
			branch.push_required(node)
			break
		}
	}

	return branch.try_build().to_undef()
}
