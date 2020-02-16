import shorthash from './_shorthash'
import { tuple as t } from '@ts-std/types'
import { Data, NonEmpty, IterWrapper, exhaustive } from '../utils'

import { compute_path_test_length } from '../runtime/decision'
import { Node, Definition, ScopeStack, Scope, Registry } from './ast'

// import { Console } from 'console'
// const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 5 } })


class _AstDecisionPath {
	readonly type: 'AstDecisionPath' = 'AstDecisionPath'
	readonly test_length: number
	constructor(readonly path: readonly (string[] | AstDecisionBranch)[]) {
		this.test_length = compute_path_test_length(path)
	}

	to_hash(): string {
		const child_string = this.path.map(item => {
			return Array.isArray(item)
				? item.join('+')
				: item.to_hash()
		}).join(' ')
		return shorthash(child_string)
	}
}
export function AstDecisionPath(...path: (string[] | AstDecisionBranch)[]) {
	return new _AstDecisionPath(path)
}
export type AstDecisionPath = _AstDecisionPath

class _AstDecisionBranch {
	readonly type: 'AstDecisionBranch' = 'AstDecisionBranch'
	readonly is_optional: boolean
	readonly test_length: number
	readonly paths: readonly AstDecisionPath[]
	constructor(paths: AstDecisionPath[]) {
		this.is_optional = paths.length === 1
		this.test_length = Math.max(...paths.map(p => p.test_length))
		this.paths = paths.slice()
	}

	to_hash(): string {
		const child_string = this.paths.map(path => path.to_hash()).join('|')
		return shorthash(child_string)
	}
}
export function AstDecisionBranch(...paths: AstDecisionPath[]) {
	return new _AstDecisionBranch(paths)
}
export type AstDecisionBranch = _AstDecisionBranch


export type AstDecidable = AstDecisionPath | AstDecisionBranch
export class PathBuilder {
	private items = [] as (string[] | AstDecisionBranch)[]

	push_branch(paths: AstDecisionPath[]) {
		this.items.push(AstDecisionBranch(
			...paths.filter(path => path.test_length > 0)
		))
	}

	concat_path(path: AstDecisionPath) {
		for (const item of path.path) {
			if (Array.isArray(item))
				for (const tok of item)
					this.push(tok)
			else
				this.items.push(item)
		}
	}

	// concat_path(decidable: AstDecidable) {
	// 	switch (decidable.type) {
	// 	case 'AstDecisionPath':
	// 		this.items.push_all(decidable.items)
	// 	case 'AstDecisionBranch':
	// 		this.items.push(decidable)
	// 	default: return exhaustive(decidable)
	// 	}
	// }

	push(def: string) {
		const last_index = this.items.length - 1
		const last = this.items[last_index]
		if (this.items.length === 0 || !Array.isArray(last)) {
			this.items.push([def])
			return
		}
		last.push(def)
	}

	build() {
		const last_index = this.items.length - 1
		const last = this.items.maybe_get(-1)
		if (last.is_some() && !Array.isArray(last.value)) {
			// if (this.items.length === 1)
			// 	return last.value

			// if (last.value.is_optional)
			if (last.value.is_optional && this.items.length !== 1)
				this.items.splice(last_index, 1)
		}

		return AstDecisionPath(...this.items)
	}
}



function gather_branches(
	next: [Node, ScopeStack][],
): [Definition, ScopeStack][] {
	const mut_next = next.slice()
	return mut_gather_branches(mut_next)
}

function mut_gather_branches(
	next: [Node, ScopeStack][],
): [Definition, ScopeStack][] {
	let tuple
	const branches = []
	while (tuple = next.shift()) {
		const [node, scope] = tuple

		// if (must_gather || node.needs_decidable)
		branches.push(t(t(node), scope))
		if (node.is_optional)
			continue
		else
			break
	}

	return branches
}


const Continue = Data((definition_tuple: [Definition, ScopeStack]) => {
	return { type: 'Continue' as const, definition_tuple }
})
type Continue = ReturnType<typeof Continue>

const Simultaneous = Data((...definition_tuples: NonEmpty<[Definition, ScopeStack]>) => {
	return { type: 'Simultaneous' as const, definition_tuples }
})
type Simultaneous = ReturnType<typeof Simultaneous>

const MainAgainst = Data((main: [Definition, ScopeStack], against: [Definition, ScopeStack][]) => {
	return { type: 'MainAgainst' as const, main, against }
})
type MainAgainst = ReturnType<typeof MainAgainst>

const NotEnough = Data((token_name: string) => {
	return { type: 'NotEnough' as const, token_name }
})
type NotEnough = ReturnType<typeof NotEnough>

function flatten_not_enough(value: string | NotEnough): string {
	return typeof value === 'string'
		? value
		: value.token_name
}

type ComplexItems = {
	Simultaneous: Simultaneous,
	MainAgainst: MainAgainst,
	Continue: Continue,
	NotEnough: NotEnough,
}
type ComplexItem = ComplexItems[keyof ComplexItems]

function item_is<K extends keyof ComplexItems>(item: string | ComplexItem, type: K): item is ComplexItems[K] {
	return typeof item !== 'string' && item.type === type
}

type AstIterItem = string | ComplexItem
type AstIter = IterWrapper<AstIterItem>

function* iterate_definition(
	definition: Definition, scope: ScopeStack,
): Generator<AstIterItem, void, undefined> {
	const tuples_to_visit = Scope.zip_nodes(definition, scope)
	let tuple
	while (tuple = tuples_to_visit.shift()) {
		const [node, scope] = tuple

		switch (node.modifier) {
		case '?':
			// should a ? node be weighed against other needs_decidable nodes?
			// a case: (A B C)? (A B)+
			// in this situation, a non-gathering strategy would lead to a lookahead of merely A
			// when in fact A B C is necessary not to erroneously enter
			// when we're simply given (A B)+ in the parse input
			// console.log('performing Simultaneous')
			// console.log('tuples_to_visit', tuples_to_visit)
			yield Simultaneous(t(node.purify(), scope), ...mut_gather_branches(tuples_to_visit))
			continue
		case '+':
			// should a + node be weighed against other needs_decidable nodes?
			// a case: (A B C)+ (A B)+
			// same as the last one, if we don't gather, we'll only grab A
			// when A B C is necessary not to erroneously continue
			// against a node that doesn't need_decidable:
			// a case: (A B C)+ A B
			// again the same. only using A would erroneously continue
			const many_tuple = t(node.purify(), scope)
			// console.log('performing MainAgainst')
			// console.log('tuples_to_visit', tuples_to_visit)
			yield MainAgainst(many_tuple, gather_branches(tuples_to_visit))
			yield Continue(many_tuple)
			continue
		case '*':
			// a case: (A B C)* (A B)+
			// both to enter and continue we need A B C
			const maybe_many_tuple = t(node.purify(), scope)
			yield Simultaneous(maybe_many_tuple, ...mut_gather_branches(tuples_to_visit))
			yield Continue(maybe_many_tuple)
			continue
		}
		// thinking about the NotEnough:
		// a case (A B)+ (A& C)
		// this is redundant, we would already do that
		// a case (A B)+ (B& C)
		// this is also redundant
		// however:
		// a case (A& B)+ (A, C)
		// with the inclusion of a NotEnough system, we should get A, B instead of simply A


		// now we move forward assuming that there's no modifier
		// the recurse will see the node without one

		switch (node.type) {
		case 'Consume':
			yield* node.token_names
			continue

		case 'Paren':
			throw new Error("encountered a Paren, which should be impossible since it always has a modifier")
			// hopefully typescript is able to refine and know that since modifier is undefined,
			// this can't possibly be Paren

		case 'Or':
			// should this gather now that the modifier is gone?
			// a case (A B D | A C D) (A (B | C))+
			// no the + shouldn't have any effect, since one of these choices must be taken,
			// it can't conflict with the upcoming +
			// without gathering the +, we would end up with A B | A C
			// that's appropriate still

			yield Simultaneous(...Scope.zip_definitions(node.choices, scope) as NonEmpty<[Definition, ScopeStack]>)
			continue

		case 'Subrule':
			const rule = Registry.get_rule(node.rule_name).unwrap()
			const rule_scope = Scope.for_rule(rule)
			// if (rule.always_optional) {
			// 	yield Simultaneous(t(rule.definition, rule_scope), ...mut_gather_branches(tuples_to_visit))
			// 	continue
			// }
			yield* iterate_definition(rule.definition, rule_scope)
			continue

		case 'MacroCall':
			const macro = Registry.get_macro(node.macro_name).unwrap()
			const macro_scope = Scope.for_macro_call(scope, macro, node)
			// if (macro.always_optional) {
			// 	yield Simultaneous(t(macro.definition, macro_scope), ...mut_gather_branches(tuples_to_visit))
			// 	continue
			// }
			yield* iterate_definition(macro.definition, macro_scope)
			continue

		case 'Var':
			const [arg_definition, arg_scope] = Scope.for_var(scope, node)
			yield* iterate_definition(arg_definition, arg_scope)
			continue

		case 'LockingVar':
			// yield Scope.for_locking_var(scope, node)
			// console.log(node)
			yield NotEnough(Scope.for_locking_var(scope, node))
			continue

		default: return exhaustive(node)
		}
	}
}

function AstIter(definition_tuple: [Definition, ScopeStack]): AstIter {
	return IterWrapper.create(() => iterate_definition(...definition_tuple))
}
function EternalAstIter(definition_tuple: [Definition, ScopeStack]): AstIter {
	return IterWrapper.create_eternal(() => iterate_definition(...definition_tuple))
}

// let call_count = 0
export function compute_decidable(
	main: [Definition, ScopeStack],
	known_against: [Definition, ScopeStack][],
	next: [Node, ScopeStack][],
	should_gather: boolean,
): AstDecidable {
	// call_count = 0

	const against = should_gather
		? [...known_against, ...gather_branches(next)]
		: known_against

	// console.log('main[0]', main[0])
	// console.log('against.map(tuple => tuple[0])', against.map(tuple => tuple[0]))

	const [path, ] = _compute_decidable(
		AstIter(main),
		against.map(AstIter),
		new PathBuilder(),
	)
	// console.log()
	// console.log()
	// console.log()
	// console.log()
	// console.log()
	// console.log()
	// console.log()
	// console.log()
	return path.path.length === 1 && !Array.isArray(path.path[0])
		? path.path[0]
		: path
}


function _compute_decidable(
	main: AstIter,
	input_against: AstIter[],
	builder: PathBuilder,
) {
	// if (++call_count > 8) throw new Error()
	let against = input_against.slice()

	let item
	let push_regardless = false
	while (item = main.next()) {
		// console.log('beginning iteration')
		// console.log('item', item)
		// console.log('against.length', against.length)

		// this next call will already mutate the underlying definition in gather_branches
		// so we could have entered this iteration of the loop with many things ahead
		// but the next will have none left
		push_regardless = false

		if (item_is(item, 'Simultaneous')) {
			// console.log('recursing Simultaneous')
			const new_against = [] as AstIter[]
			const decision_paths = []

			for (const definition_tuple of item.definition_tuples) {
				// console.log('definition_tuple[0]', definition_tuple[0])
				// it seems that *all* the exit states of the clone against iters of each definition
				// must be added to the new list of against
				const [decision_path, continued_against] = _compute_decidable(
					AstIter(definition_tuple),
					against.map(a => a.clone()),
					new PathBuilder(),
				)
				// console.log('emerged from Simultaneous with decision_path', decision_path)
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
		if (item_is(item, 'MainAgainst')) {
			// console.log('recursing MainAgainst')
			// compute a decidable for main
			// don't use or preserve any of the against, we'll see them in a moment
			const [decision_path, ignored_against] = _compute_decidable(
				AstIter(item.main),
				[...item.against.map(AstIter), ...against],
				new PathBuilder(),
			)
			// console.log('emerged from MainAgainst, doing concat_path decision_path', decision_path)
			builder.concat_path(decision_path)
			if (ignored_against.length === 0)
				break
			continue
		}
		if (item_is(item, 'Continue'))
			// since we've placed an against.length check before this,
			// hitting here means this thing is undecidable, at least for now
			throw new Error('undecidable')
		push_regardless = item_is(item, 'NotEnough')
		item = flatten_not_enough(item)


		const new_against = [] as AstIter[]
		const against_iters = against.slice()

		let against_iter: AstIter
		while (against_iter = against_iters.shift()!) {
			const against_item = against_iter.next()
			if (against_item === undefined)
				// against_iter is exhausted, toss it and move on
				continue

			// console.log('against_item', against_item)
			if (item_is(against_item, 'Simultaneous')) {
				const child_iters = against_item.definition_tuples.map(
					definition_tuple => IterWrapper.chain_iters(AstIter(definition_tuple), against_iter.clone()),
				)
				against_iters.push_all(child_iters)
				continue
			}
			if (item_is(against_item, 'MainAgainst')) {
				// similarly here, don't consider or worry about the against
				against_iters.push(IterWrapper.chain_iters(AstIter(against_item.main), against_iter.clone()))
				continue
			}
			if (item_is(against_item, 'Continue')) {
				// we'll just keep cycling this iterator over and over
				// that's a safe choice since the main loop will die if it also has one
				against_iters.push(EternalAstIter(against_item.definition_tuple))
				continue
			}
			// in this situation we do nothing differently
			// we don't care about an against having NotEnough
			const final_against_item = flatten_not_enough(against_item)

			// console.log('item !== final_against_item', item !== final_against_item)
			if (!push_regardless && item !== final_against_item)
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
	return t(builder.build(), against)
}
