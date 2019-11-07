import { TokenDefinition, RawToken, match_token } from './states_lexer'

function match_and_trim(tokens: RawToken[], token_definitions: TokenDefinition[]) {
	for (const [index, token_definition] of token_definitions.entries()) {
		const token = tokens[index]

		if (!match_token(token, token_definition))
			return undefined
	}

	return tokens.slice(token_definitions.length)
}

export abstract class Decidable {
	abstract readonly test_length: number
	test(tokens: RawToken[]): boolean {
		const result = this._test(tokens)
		return result !== undefined
	}

	abstract _test(tokens: RawToken[]): RawToken[] | undefined
}

class IterWrapper<T> {
	constructor(protected internal: Generator<T, void, undefined>) {}
	next(): T | undefined {
		let result = this.internal.next()
		if (result.done) return undefined
		else return result.value
	}

	clone() {
		const a = Array.from(this.internal)
		this.internal = (function* () { yield* a.slice() })()
		return new IterWrapper((function* () { yield* a.slice() })())
	}
}

export function path(test_length: number, ...path: (TokenDefinition[] | DecisionBranch)[]) {
	return new DecisionPath(path, test_length)
}
export class DecisionPath extends Decidable {
	readonly type = 'DecisionPath'
	constructor(
		readonly path: (TokenDefinition[] | DecisionBranch)[],
		readonly test_length: number,
	) { super() }

	_test(input_tokens: RawToken[]): RawToken[] | undefined {
		let tokens: RawToken[] | undefined = input_tokens.slice()

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

	iter() {
		return new IterWrapper((function* () {
			for (const item of this.path) {
				if (Array.isArray(item))
					yield* item.map(i => [i])
				else {
					const iters = item.paths.map(i => i.iter())
					let sub_array = iters.flat_map(i => i.next() || [])
					while (sub_array.length > 0) {
						yield sub_array
						sub_array = iters.flat_map(i => i.next() || [])
					}
				}
			}
		})())
	}

	branch_iter() {
		return new IterWrapper((function* () {
			for (const item of this.path) {
				if (Array.isArray(item))
					yield* item
				else
					yield item
			}
		})())
	}
}



export function branch(is_optional: boolean, ...paths: DecisionPath[]) {
	return new DecisionBranch(is_optional, paths)
}
export class DecisionBranch extends Decidable {
	readonly type = 'DecisionBranch'
	readonly test_length: number
	constructor(
		readonly is_optional: boolean,
		readonly paths: DecisionPath[],
	) {
		super()
		this.test_length = Math.max(...paths.map(p => p.test_length))
	}

	_test(tokens: RawToken[]): RawToken[] | undefined {
		for (const path of this.paths) {
			const path_result = path._test(tokens)
			if (path_result !== undefined)
				return path_result
		}

		return this.is_optional ? [] : undefined
	}
}
