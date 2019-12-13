import ts = require('typescript')
import { Dict, tuple as t } from '@ts-std/types'
import { NonEmpty } from '../utils'

import { Scope, Node, Rule, Macro } as ast from './ast_new'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 5 } })

function create_call(function_name: string, args: ts.Expression[]) {
	return ts.createCall(ts.createIdentifier(function_name), undefined, args)
}

function create_arrow(statements: ts.ExpressionStatement[]) {
	return ts.createArrowFunction(
		undefined, undefined, [], undefined,
		ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		ts.createBlock(statements, true),
	)
}

function create_statement(expression: ts.Expression) {
	return ts.createExpressionStatement(expression)
}

function wrapping_name(modifier: Modifer) {
	switch (modifier) {
		case '+': return 'many' as const
		case '?': return 'maybe' as const
		case '*': return 'maybe_many' as const
		default: return undefined
	}
}

// function count_decidables(definition: Definition): number {
// 	let count = 0
// 	for (const node of definition.nodes) {
// 		if (node.needs_decidable)
// 			count++
// 		if (node.type === 'Wrap')
// 			count += count_decidables(node.nodes)
// 		if (node.type === 'Or')
// 			for (const choice of node.choices) {
// 				// one for the the choice itself, and one
// 				count++
// 				count += count_decidables(node.nodes)
// 			}
// 		// if (node.type === 'Subrule' && node.needs_tail_decidable)
// 		// 	count++
// 		if (node.type === 'MacroCall') {
// 			const macro = get_macro(node.macro_name).unwrap()
// 			count += count_decidables(macro.definition)
// 		}
// 	}

// 	return count
// }

// function gather_decidables(definition: Definition, scope: ScopeStack, parent_next: DefinitionTuple[]): ts.Identifier[] {
// 	const decidables = []
// 	for (const [node_index, node] of definition.nodes.entries()) {
// 		const next = [Scope.in_scope(definition.nodes.slice(node_index + 1)), ...parent_next]

// 		if (node.needs_decidable) {
// 			const decidable = generate_decidable(node, scope, next)
// 			decidables.push(decidable)
// 		}

// 		if (node.type === 'Wrap') {
// 			const child_decidables = gather_decidables(node.nodes, scope, next)
// 			decidables.push_all(child_decidables)
// 		}

// 		if (node.type === 'Or')
// 			for (const [choice_index, choice] of node.choices.entries()) {
// 				const against = Scope.in_scope(node.choices.slice(choice_index + 1), scope)
// 				decidables.push()
// 				const child_decidables = gather_decidables(choice, scope, next, existing_against)
// 				decidables.push_all(child_decidables)
// 			}

// 		// if (node.type === 'Subrule' && node.needs_tail_decidable) {
// 		// 	const rule = get_rule(node.rule_name).unwrap()
// 		// 	// const tail_decidable = generate_tail_decidable(rule, scope, next)
// 		// 	const tail_decision_points = gather_branches(rule.definition.slice().reverse()).reverse()
// 		// 	generate_decidable()
// 		// }

// 		if (node.type === 'MacroCall') {
// 			const macro = get_macro(node.macro_name).unwrap()
// 			const macro_scope = Scope.for_macro(scope, macro, node)
// 			const child_decidables = gather_decidables(macro.definition, scope, next)
// 		}
// 	}

// 	return decidables
// }

// type RenderContext =
// 	| { type: 'definition', count: number }
// 	| { type: 'call', decidables: ts.Identifier[] }

// let global_render_context = undefined as undefined | RenderContext
// function with_render_context<T>(render_context: RenderContext, fn: () => T): T {
// 	const saved = global_render_context
// 	global_render_context = render_context
// 	const result = fn()
// 	global_render_context = saved
// 	return result
// }

// let global_decidables = [] as ReturnType<typeof ts.createCall>[]


function render_rule(rule: Rule) {
	// const lockers = (rule.locking_args !== undefined ? rule.locking_args.to_array() : []).map(render_locking_arg)

	// if (global_render_context !== undefined)
	// 	throw new Error('global_render_context should be undefined')

	const scope = Scope.for_rule(rule)
	return render_definition(rule.definition, scope, [] as Definition)
	// const render_context: RenderContext = { type: 'definition', count: 0 }
	// const rendered_definition = with_render_context(render_context, () => {
	// 	return render_definition(rule.definition, scope, [] as Definition)
	// })

	return ts.createFunctionDeclaration(
		undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], undefined,
		ts.createIdentifier(rule.name), [],

		array_of(render_context.count).map((_, index) => ts.createParameter(
			undefined, undefined, undefined,
			ts.createIdentifier(`_d${index + 1}`), undefined,
			ts.createTypeReferenceNode(ts.createIdentifier('Decidable'), undefined), undefined,
		)), undefined,

		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}

function render_definition(nodes: NonEmpty<Node>, scope: ScopeStack, parent_next: Node[]) {
	const rendered = []
	for (const [index, node] of nodes.entries()) {
		const next = [...nodes.slice(index + 1), ...parent_next]
		rendered.push(render_node(node, scope, next))
	}
	return rendered
}


function render_node(node: Node, scope: ScopeStack, next: Node[]) {
	switch (node.type) {

	case 'Wrap': {
		const function_name = exec(() => {
			switch (node.modifier) {
				case '+': return 'many' as const
				case '?': return 'maybe' as const
				case '*': return 'maybe_many' as const
			}
		})
		// render_entity will do the work of calling gather_branches
		return create_call(function_name, render_entity(node, scope, [], false, next))
	}
	case 'Or': {
		const or_next = node.modifier !== undefined ? next : []
		for (const [index, choice] of node.choices.entries()) {
			const choice = or.choices[choice_index]
			const against = or.choices.slice(choice_index + 1)

			choices.push(render_entity(choice, scope, in_scope(against, scope), true, or_next))
		}

		const maybe_function_name = wrapping_name(node.modifier)
		if (maybe_function_name === undefined)
			return create_call('or', choices)
		if (maybe_function_name === 'maybe')
			return create_call('maybe_or', choices)

		return create_call(maybe_function_name, create_arrow(create_statement(create_call('or', choices))))
	}
	case 'Subrule': {
		const rule = get_rule(node.rule_name).unwrap()
		const gathered_decidables: RenderContext = { type: 'call', decidables: [] }
		const rule_scope = Scope.for_rule(rule)
		with_render_context(gathered_decidables, () => {
			render_definition(rule.definition, rule_scope, next)
		})

		const { decidables } = gathered_decidables
		const maybe_function_name = wrapping_name(node.modifier)
		if (maybe_function_name === undefined)
			return create_call(rule.name, decidables)

		const decidable
		return create_call(maybe_function_name, [ts.createIdentifier(rule.name), ...decidables])
	}
	case 'MacroCall': {
		const macro = get_macro(node.macro_name).unwrap()
		const gathered_decidables: RenderContext = { type: 'call', decidables: [] }
		const macro_scope = Scope.for_macro(macro)
		with_render_context(gathered_decidables, () => {
			render_definition(macro.definition, macro_scope, next)
		})

		const { decidables } = gathered_decidables
		const maybe_function_name = wrapping_name(node.modifier)
		// TODO
	}
	case 'Var': {
		const [var_definition, var_scope] = Scope.for_var(node, scope)
	}
	// these two are the simplest
	// they never need a decidable
	case 'Consume': {
		const function_name = wrapping_name(node.modifier) || 'consume'
		return create_call(function_name, node.token_names.map(render_token_reference))
	}
	case 'LockingVar': {
		//
	}
	}
}
