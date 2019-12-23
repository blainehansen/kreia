import '@ts-std/extensions/dist/array'

import { Lexer, LexerState, VirtualLexers, TokenDefinition, Token, match_and_trim } from './lexer'

export interface HasTestLength {
	readonly test_length: number
}
export function compute_path_test_length<T>(path: readonly (T[] | HasTestLength)[]) {
	return path.map(
		item => Array.isArray(item)
			? item.length
			: item.test_length
	).sum()
}

export abstract class Decidable {
	abstract readonly test_length: number
	abstract test<V extends VirtualLexers>(
		lexer: Lexer<V>,
		lexer_state?: LexerState<V>,
	): [Token[], LexerState<V>] | undefined
}


export function path(...path: (TokenDefinition[] | DecisionBranch)[]) {
	return new DecisionPath(path)
}
class DecisionPath extends Decidable {
	readonly type = 'DecisionPath'
	readonly test_length: number
	constructor(
		readonly path: readonly (TokenDefinition[] | DecisionBranch)[],
	) {
		super()
		this.test_length = compute_path_test_length(path as (TokenDefinition[] | HasTestLength)[])
	}

	test<V extends VirtualLexers>(
		lexer: Lexer<V>,
		input_lexer_state?: LexerState<V>,
	): [Token[], LexerState<V>] | undefined {
		const tokens = [] as Token[]
		let lexer_state = input_lexer_state

		for (const item of this.path) {
			const attempt = Array.isArray(item)
				? lexer.test(item, lexer_state)
				: item.test(lexer, lexer_state)
			if (attempt === undefined)
				return undefined

			const [consumed_tokens, new_lexer_state] = attempt
			tokens.push_all(consumed_tokens)
			lexer_state = new_lexer_state
		}

		return [tokens, lexer_state as LexerState<V>]
	}
}



export function branch(...paths: DecisionPath[]) {
	return new DecisionBranch(paths)
}
class DecisionBranch extends Decidable {
	readonly type = 'DecisionBranch'
	readonly test_length: number
	readonly paths: readonly DecisionPath[]
	readonly is_optional: boolean
	constructor(
		paths: DecisionPath[],
	) {
		super()
		if (paths.length === 0)
			throw new Error("DecisionBranch was constructed with an empty list")

		this.is_optional = paths.length === 1
		this.paths = paths.slice()
		this.test_length = Math.max(...paths.map(p => p.test_length))
	}

	test<V extends VirtualLexers>(
		lexer: Lexer<V>,
		lexer_state?: LexerState<V>,
	): [Token[], LexerState<V>] | undefined {
		for (const path of this.paths) {
			const attempt = path.test(lexer, lexer_state)
			if (attempt === undefined)
				continue
			return attempt
		}

		return undefined
	}
}
