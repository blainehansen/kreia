import { log } from './utils'
import { TokenDefinition, Token } from './states_lexer'
import { Decidable, path, DecisionPath, branch, DecisionBranch } from './decision'

// class BranchBuilder {
// 	constructor()
// }

class LookaheadBuilder {
	private items = [] as (TokenDefinition[] | DecisionBranch)[]

	// push_branch(paths: DecisionPath[]) {
	// 	//
	// }

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

	build(): DecisionPath {
		const last_index = this.items.length - 1
		const last = this.items[last_index]
		if (is_branch(last) && (last as DecisionBranch).is_optional)
			this.items.splice(last_index, 1)

		if (this.items.length === 1 && is_branch(this.items[0]))
			return this.items[0].try_build().default(new DecisionPath([]))

		return new DecisionPath(this.items)
	}
}

function is_branch(item: TokenDefinition[] | TokenDefinition | DecisionBranch): item is DecisionBranch {
	return !Array.isArray(item) && 'type' in item && item.type === 'DecisionBranch'
}

type DecisionPathIter = ReturnType<DecisionPath['iter']>
type DecisionPathBranchIter = ReturnType<DecisionPath['branch_iter']>

function _compute_path(main: DecisionPathBranchIter, input_against: DecisionPathIter[], lookahead: LookaheadBuilder) {
	let against = input_against.slice()

	let item: TokenDefinition | DecisionBranch
	while (item = main.next()!) {

		if (is_branch(item)) {
			// it it isn't optional, we need to pick up after the branch with against iterators
			// in the "exhausted" state they will be in after the branch

			const new_against = [] as DecisionPathIter[]

			lookahead.push(
				new DecisionBranch(
					item.is_optional,
					item.paths.map(path => {
						const branch_against = against.map(a => a.clone())
						Array.prototype.push.apply(new_against, branch_against)
						return _compute_path(
							path.branch_iter(),
							branch_against,
							new LookaheadBuilder(),
						)
					}),
				)
			)

			// against = against.concat(new_against)

			against = item.is_optional
				? against.concat(new_against)
				: new_against

			continue
		}

		const against_items = [] as TokenDefinition[]
		const new_against = []
		for (const against_iter of against) {
			const a = against_iter.next()
			if (a === undefined)
				continue

			Array.prototype.push.apply(against_items, a)
			new_against.push(against_iter)
		}
		against = new_against

		const same = against_items.filter(a => a.name === (item as TokenDefinition).name)

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
