import '@ts-std/extensions/dist/array'
import { tuple as t } from '@ts-std/types'
import { Data, exhaustive, IterWrapper } from '../utils'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 4 } })

import { PathBuilder } from './decision'
import {
	get_token, get_rule, get_macro,
	Arg, Var, Rule, Macro, Subrule, Maybe, Many, Or, MacroCall, Consume, Node, Definition,
	Scope, ScopeStack, DefinitionTuple, push_scope, pop_scope, in_scope,
} from './ast'

type NonEmpty<T> = [T, ...T[]]


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

const Continue = Data((...definition_tuple: DefinitionTuple) => {
	return { type: 'Continue' as const, definition_tuple }
})
type Continue = ReturnType<typeof Continue>

function is_continue(item: string | Continue): item is Continue {
	return typeof item !== 'string'
}

type AstIterItem = string | DefinitionTuple[] | Continue
type AstIter = IterWrapper<AstIterItem>

function* iterate_definition(
	...[definition, scope]: DefinitionTuple
): Generator<AstIterItem, void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		const [gathered, ] = gather_branches(nodes_to_visit, scope)[0]
		yield [...in_scope(node.choices, scope), ...gathered]
		continue
	case 'Maybe': {
		yield [t(node.definition, scope), ...gather_branches(nodes_to_visit, scope)[0]]
		continue
	}
	case 'Many':
		yield* iterate_definition(node.definition, scope)
		yield Continue(node.definition, scope)
		continue
	case 'Consume':
		yield* node.token_names.map(token_name => get_token(token_name).unwrap())
		continue

	case 'Subrule': {
		const rule = get_rule(node.rule_name).unwrap()
		const rule_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
		const [gathered, all_maybe] = gather_branches(rule.definition.slice(), rule_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(rule.definition, rule_scope)

		continue
	}

	case 'MacroCall': {
		const macro = get_macro(node.macro_name).unwrap()
		const macro_scope = push_scope(scope, macro.locking_args, node.args)
		const [gathered, all_maybe] = gather_branches(macro.definition.slice(), macro_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(macro.definition, macro_scope)

		continue
	}

	case 'Var': {
		// Vars use the parent_scope
		const arg_definition = scope.current.args.get_by_name(node.arg_name).unwrap()
		const var_scope = pop_scope(scope)
		// const [gathered, all_maybe] = gather_branches(arg_definition.slice(), var_scope)
		const [gathered, all_maybe] = gather_branches([...arg_definition, ...nodes_to_visit], var_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(arg_definition, var_scope)

		continue
	}

	case 'LockingVar':
		const locking_arg = scope.current.locking_args.get_by_name(node.locking_arg_name).unwrap()
		yield get_token(locking_arg.token_name).unwrap()
		continue

	default: return exhaustive(node)
	}
}

function AstIter(definition_tuple: DefinitionTuple): AstIter {
	return IterWrapper.create(() => iterate_definition(...definition_tuple))
}
function EternalAstIter(definition_tuple: DefinitionTuple): AstIter {
	return IterWrapper.create_eternal(() => iterate_definition(...definition_tuple))
}

export function compute_decidable(main: DefinitionTuple, against: DefinitionTuple[]) {
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
		// console.log('beginning iteration')
		// console.log('item', item)
		// console.log('against.length', against.length)

		// this next call will already mutate the underlying definition in gather_branches
		// so we could have entered this iteration of the loop with many things ahead
		// but the next will have none left

		if (Array.isArray(item)) {
			if (item.length === 0)
				throw new Error('empty definition')

			// console.log('recursing')

			const new_against = [] as AstIter[]
			const decision_paths = []

			for (const definition_tuple of item) {
				// console.log('definition_tuple[0]', definition_tuple[0])
				// it seems that *all* the exit states of the clone against iters of each definition
				// must be added to the new list of against
				const [decision_path, continued_against] = _compute_decidable(
					AstIter(definition_tuple),
					against.map(a => a.clone()),
					new PathBuilder(),
				)
				new_against.push_all(continued_against)
				decision_paths.push(decision_path)
			}
			against = new_against

			// console.log('decision_paths', decision_paths)
			builder.push_branch(decision_paths)
			if (against.length === 0)
				break
			continue
		}

		if (is_continue(item))
			// since we've placed an against.length check before this,
			// hitting here means this thing is undecidable, at least for now
			throw new Error('undecidable')


		const new_against = [] as AstIter[]
		const against_iters = against.slice()

		let against_iter: AstIter
		while (against_iter = against_iters.shift()!) {
			const against_item = against_iter.next()
			if (against_item === undefined)
				continue

			// console.log('against_item', against_item)

			if (Array.isArray(against_item)) {
				const child_iters = against_item.map(
					definition_tuple => IterWrapper.chain_iters(AstIter(definition_tuple), against_iter.clone()),
				)
				against_iters.push_all(child_iters)
				continue
			}

			if (is_continue(against_item)) {
				// we'll just keep cycling this iterator over and over
				// that's a safe choice since the main loop will die if it also has one
				against_iters.push(EternalAstIter(against_item.definition_tuple))
				continue
			}

			if (item !== against_item)
				continue

			new_against.push(against_iter)
		}
		against = new_against

		builder.push(item)
		if (against.length === 0)
			break
	}


	// against.length being non-zero here means that we exhausted the main branch before the others
	// we could choose to make that an error condition, but it seems too picky
	// for example, what about this: (A, B, C)? (A, B, C, D)
	// that's a situation that might make perfect sense,
	// since the Maybe only happens once, the next could definitely happen
	// it definitely means you need to warn people that the first matched rule in an Or will be taken,
	// so they should put longer ones first if they share stems

	// console.log('returning')
	// console.log('against.length', against.length)
	// console.log()
	return t(builder.build(), against)
}
