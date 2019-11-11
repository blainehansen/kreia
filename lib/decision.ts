import '@ts-std/extensions/dist/array'

import { IterWrapper } from './utils'
import { TokenDefinition, Token, match_and_trim } from './lexer'

export abstract class Decidable {
	abstract readonly test_length: number
	test(tokens: Token[]): boolean {
		const result = this._test(tokens)
		return result !== undefined
	}

	abstract _test(tokens: Token[]): Token[] | undefined
}

export function path(...path: (TokenDefinition[] | DecisionBranch)[]) {
	return new DecisionPath(path)
}
export class DecisionPath extends Decidable {
	readonly type = 'DecisionPath'
	readonly test_length: number
	constructor(
		readonly path: readonly (TokenDefinition[] | DecisionBranch)[],
	) {
		super()
		this.test_length = path.map(
			item => Array.isArray(item)
				? item.length
				: item.test_length
		).sum()
	}

	_test(input_tokens: Token[]): Token[] | undefined {
		let tokens: Token[] | undefined = input_tokens.slice()

		for (const item of this.path) {
			tokens = Array.isArray(item)
				? match_and_trim(tokens, item)
				: item._test(tokens)

			if (tokens === undefined)
				return undefined
			if (tokens.length === 0)
				return tokens
		}

		return tokens
	}

	iter(): IterWrapper<TokenDefinition[]> {
		const fn = function* (this: DecisionPath) {
			for (const item of this.path) {
				if (Array.isArray(item))
					yield* item.map(tok => [tok])
				else {
					const iters = item.paths.map(path => path.iter())
					let sub_array = iters.flat_map(i => i.next() || [])
					while (sub_array.length > 0) {
						yield sub_array
						sub_array = iters.flat_map(i => i.next() || [])
					}
				}
			}
		}
		return new IterWrapper(fn.call(this))
	}

	branch_iter(): IterWrapper<TokenDefinition | DecisionBranch> {
		const fn = function* (this: DecisionPath) {
			for (const item of this.path) {
				if (Array.isArray(item))
					yield* item
				else
					yield item
			}
		}
		return new IterWrapper(fn.call(this))
	}
}



const EMPTY_PATH = new DecisionPath([])
export function branch(is_optional: boolean, ...paths: DecisionPath[]) {
	return new DecisionBranch(is_optional, paths)
}
export class DecisionBranch extends Decidable {
	readonly type = 'DecisionBranch'
	readonly test_length: number
	readonly paths: readonly DecisionPath[]
	constructor(
		is_optional: boolean,
		paths: DecisionPath[],
	) {
		super()
		if (is_optional)
			paths.push(EMPTY_PATH)
		this.paths = paths.slice()
		this.test_length = Math.max(...paths.map(p => p.test_length))
	}

	_test(tokens: Token[]): Token[] | undefined {
		for (const path of this.paths) {
			const path_result = path._test(tokens)
			if (path_result !== undefined)
				return path_result
		}

		return undefined
	}
}

// export class DecisionWhile() {
// 	//
// }
