import { log } from './utils'
import { TokenDefinition, Token } from './states_lexer'
import { Decidable, path, DecisionPath, branch, DecisionBranch } from './decision'

class LookaheadBuilder {
	private items = [] as TokenDefinition[]

	push(def: TokenDefinition) {
		this.items.push(def)
	}

	build(): Decidable {
		return new DecisionPath([this.items], this.items.length)
	}
}

function is_branch(item: TokenDefinition | DecisionBranch): item is DecisionBranch {
	return 'type' in item && item.type === 'DecisionBranch'
}

export function compute_path(main: DecisionPath, against: DecisionPath[]) {
	const main_iter = main.iter()

	const lookahead = new LookaheadBuilder()

	let against_iters = against.map(a => a.iter())
	let item: TokenDefinition | DecisionBranch
	while (item = main_iter.next() as unknown as TokenDefinition | DecisionBranch) {
		const against_items = [] as TokenDefinition[]

		const new_against_iters = []
		for (const against_iter of against_iters) {
			const a = against_iter.next()
			if (a === undefined) continue

			if (Array.isArray(a)) {
				// this means that a previous branch iterator is returning tokens from multiple branches
				// all of these should be pushed to against_items
				Array.protoype.push.apply(against_items, a)
			}
			if (is_branch(a)) {
				// TODO this has to be resumable
				new_against_iters.push(a)
				continue
			}

			new_against_iters.push(against_iter)
		}
		against_iters = new_against_iters

		if (is_branch(item)) {
			//
			continue
		}

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

// function pi(p: DecisionPath) {
// 	return p.iter()
// }

// function compute_path(d: DecisionPath, against: DecisionPath[]): Decidable {
// 	// as a someday optimization, it seems you should get mad about redundant prefixes (all the branches have identical beginnings)

// 	const d_iter = d.iter()
// 	const against_iters = against.map(pi)

// 	const lookahead = new LookaheadBuilder()
// 	let item
// 	while (item = d_iter.next()) {
// 		const against_items = increment_against(against_iters, i => {
// 			const item = i.next()
// 			// we'll assume that increment_against removes something from the source array if we return empty
// 			// replaces it with some resumable branch iterator if we return an array larger than one
// 			// and does nothing with array of size one
// 			if (item === undefined) return undefined
// 			if (item is branch) return item.paths
// 			return item
// 		})
// 		if (item is branch) {
// 			// we basically need to recursively compute the paths for each path of the branch,
// 			// starting from the current lookahead we've produced
// 			lookahead.push_branch(item, against_iters)
// 			continue
// 		}

		// // now we're finally in the simple case where we can compare tokens against tokens
		// // if any of the against_items are the same as item, then item needs to be pushed to the lookahead
		// // TODO similarly, all the backing iters for the ones that *weren't* the same should be kicked out
		// const same = against_items.filter(a => a.name === item.name)
		// // we always push item since if we're done it's still needed as the final differentiator,
		// // and if we aren't it's just part of the chain
		// lookahead.push(item)
		// if (same.length === 0)
		// 	// in this case we're done
			// break
// 	}

// 	return lookahead
// }
