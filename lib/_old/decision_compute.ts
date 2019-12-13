import '@ts-std/extensions/dist/array'
import { tuple as t } from '@ts-std/types'
import { Data, exhaustive, IterWrapper } from '../utils'

import { PathBuilder } from './decision'
import {
	get_token, get_rule, get_macro,
	Node, Definition,
	Scope, ScopeStack, DefinitionTuple, push_scope, pop_scope, in_scope,
} from './ast'


export function gather_branches(next: Definition, scope: ScopeStack): [DefinitionTuple[], boolean] {
	const branches = []
	// console.log('next', next)

	let all_maybe = true

	let node
	node_loop: while (node = next.shift()) {
		// console.log('node', node)
		switch (node.type) {
		case 'Maybe':
			branches.push(t(node.definition, scope))
			continue
		case 'Or':
			branches.push_all(in_scope(node.choices, scope))
			all_maybe = false
			break node_loop
		case 'Many':
			branches.push(t(node.definition, scope))
			all_maybe = false
			break node_loop

		case 'Subrule': {
			const rule = get_rule(node.rule_name).unwrap()
			const rule_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
			const [gathered, rule_all_maybe] = gather_branches(rule.definition.slice(), rule_scope)
			if (rule_all_maybe) {
				branches.push_all(gathered)
				continue
			}
			branches.push(t([node as Node], scope))
			all_maybe = false
			break node_loop
		}

		case 'MacroCall': {
			const macro = get_macro(node.macro_name).unwrap()
			const macro_scope = push_scope(scope, macro.locking_args, node.args)
			const [gathered, macro_all_maybe] = gather_branches(macro.definition.slice(), macro_scope)
			if (macro_all_maybe) {
				branches.push_all(gathered)
				continue
			}
			branches.push(t([node as Node], scope))
			all_maybe = false
			break node_loop
		}

		case 'Var': {
			const arg_definition = scope.current.args.get_by_name(node.arg_name).unwrap()
			const var_scope = pop_scope(scope)
			const [gathered, var_all_maybe] = gather_branches(arg_definition.slice(), var_scope)
			if (var_all_maybe) {
				branches.push_all(gathered)
				continue
			}
			branches.push(t([node as Node], scope))
			all_maybe = false
			break node_loop
		}

		default:
			branches.push(t([node as Node], scope))
			all_maybe = false
			break node_loop
		}
	}

	// console.log('branches', branches)
	return [branches, all_maybe]
}
