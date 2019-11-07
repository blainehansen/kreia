import { log } from './utils'
import { TokenDefinition, Token } from './states_lexer'
import { Decidable, path, DecisionPath, branch, DecisionBranch } from './decision'

class LookaheadBuilder {
	private items = [] as (TokenDefinition[] | DecisionBranch)[]

	push(def: TokenDefinition | DecisionBranch) {
		if (is_branch(def)) {
			this.items.push(def)
			return
		}

		const last_index = this.items.length - 1
		const last = this.items[last_index]
		if (this.items.length === 0 || is_branch(last)) {
			this.items.push([def])
			return
		}
		last.push(def)
	}

	build(): Decidable {
		const last_index = this.items.length - 1
		const last = this.items[last_index]
		if (is_branch(last) && last.is_optional)
			this.items.splice(last_index, 1)
		return new DecisionPath([this.items], this.items.length)
	}
}

function is_branch(item: TokenDefinition | DecisionBranch): item is DecisionBranch {
	return 'type' in item && item.type === 'DecisionBranch'
}

type DecisionPathIter = ReturnType<DecisionPath['iter']>
type DecisionPathBranchIter = ReturnType<DecisionPath['branch_iter']>

function _compute_path(main: DecisionPathBranchIter, input_against: DecisionPathIter[], lookahead: LookaheadBuilder) {
	let against = input_against.slice()

	let item: TokenDefinition | DecisionBranch
	while (item = main.next()!) {
		const against_items = [] as TokenDefinition[]

		// we're going to simplify things so that a DecisionPathIter always returns just arrays of concurrent tokens
		// the iteration of the internal branches will be handled for us by that iterator

		const new_against = []
		for (const against_iter of against) {
			const a = against_iter.next()
			if (a === undefined)
				continue

			Array.protoype.push.apply(against_items, a)
			new_against.push(against_iter)
		}
		against = new_against

		if (is_branch(item))
			lookahead.push(
				new DecisionBranch(
					item.is_optional,
					item.paths.map(path => _compute_path(
						path.branch_iter(),
						against.map(a => a.clone()),
						lookahead,
					)),
				)
			)

		const same = against_items.filter(a => a.name === item.name)

		// if (same.length >= against.length)
		// 	throw new Error("all branches have the same stem")

		lookahead.push(item)
		// in this case we're done
		if (same.length === 0)
			break
	}

	return lookahead.build()
}

export function compute_path(main: DecisionPath, against: DecisionPath[]) {
	return _compute_path(
		main.branch_iter(),
		against.map(a => a.iter()),
		new LookaheadBuilder(),
	)
}
