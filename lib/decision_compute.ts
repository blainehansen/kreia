import '@ts-std/extensions/dist/array'
import { tuple as t } from '@ts-std/types'

import { PathBuilder } from './decision'
import { Data, exhaustive, IterWrapper } from './utils'
import {
	registered_tokens, registered_rules, resolve_rule, resolve_macro,
	TokenDef, Arg, Var, Rule, Macro, Subrule, Maybe, Many, Or, MacroCall, Consume, Node, Definition,
} from './ast'

export function gather_branches(current: Definition[], next: Definition) {
	const branches = current.slice()

	let node
	while (node = next.shift()) switch (node.type) {
	case 'Maybe':
		branches.push(node.definition)
		continue

	case 'Or':
		branches.push_all(node.choices)
		break
	case 'Consume':
		branches.push([node as Node])
		break
	case 'Many':
		branches.push(node.definition)
		break
	case 'Subrule':
		const rule_definition = resolve_rule(node.rule_name)
		branches.push(rule_definition)
		break
	case 'MacroCall':
		const call_definition = resolve_macro(node.macro_name, node.args)
		branches.push(call_definition)
		break
	case 'Var':
		throw new Error(`unexpected Var: ${node}`)
	case 'LockingVar':
		throw new Error(`unexpected LockingVar: ${node}`)
	default: return exhaustive(node)
	}

	return branches
}

const Continue = Data((continue_definition: Definition) => {
	return { type: 'Continue' as const, continue_definition }
})
type Continue = ReturnType<typeof Continue>

function is_continue(item: TokenDef | Continue): item is Continue {
	return 'type' in item && item.type === 'Continue'
}


type AstIterItem = TokenDef | Definition[] | Continue
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
		const rule_definition = resolve_rule(node.rule_name)
		yield* iterate_definition(rule_definition)
		continue
	case 'MacroCall':
		const call_definition = resolve_macro(node.macro_name, node.args)
		yield* iterate_definition(call_definition)
		continue
	case 'Var':
		throw new Error(`unexpected Var ${node}`)
	case 'LockingVar':
		throw new Error(`unexpected LockingVar ${node}`)
	default: return exhaustive(node)
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
