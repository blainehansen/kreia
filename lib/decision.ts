import '@ts-std/extensions/dist/array'

import { TokenDefinition, Token, match_and_trim } from './lexer'

export abstract class Decidable {
	abstract readonly test_length: number
	test(tokens: Token[]): boolean {
		const result = this._test(tokens)
		return result !== undefined
	}

	// abstract render_ts(): ReturnType<typeof ts.createVariableStatement>
	abstract _test(tokens: Token[]): Token[] | undefined
}

export function is_branch(item: TokenDefinition[] | TokenDefinition | DecisionBranch): item is DecisionBranch {
	return !Array.isArray(item) && 'type' in item && item.type === 'DecisionBranch'
}

export class PathBuilder {
	private items = [] as (TokenDefinition[] | DecisionBranch)[]

	push_branch(paths: DecisionPath[]) {
		this.items.push(new DecisionBranch(
			paths.filter(path => path.test_length > 0)
		))
	}

	push(def: TokenDefinition) {
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

		return new DecisionPath(this.items)
	}
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
		this.test_length = path.map(
			item => Array.isArray(item)
				? item.length
				: item.test_length
		).sum()
	}

	// _test(input_tokens: Token[]): Token[] | undefined {
	test(lexer: BaseLexer): Token[] | undefined {
		// let tokens: Token[] | undefined = input_tokens.slice()

		for (const item of this.path) {
			// tokens = Array.isArray(item)
			// 	? match_and_trim(tokens, item)
			// 	: item._test(tokens)
			// if (tokens === undefined)
			// 	return undefined
			// if (tokens.length === 0)
			// 	return tokens

			const success = Array.isArray(item)
				? lexer.test(item)
				: item.test(lexer)

			if (!success)
				return false
		}

		// return tokens
		return true
	}

	// render_ts() {
	// 	return ts.createCall(
	// 		ts.createIdentifier('path'), undefined,
	// 		this.path.map(item =>
	// 			Array.isArray(item)
	// 				? ts.createArrayLiteral(item.map(tok => ts.createIdentifier(tok.name)))
	// 				: item.render_ts()
	// 		),
	// 	)
	// }
}



const EMPTY_PATH = new DecisionPath([])
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

	// _test(tokens: Token[]): Token[] | undefined {
	test(lexer: BaseLexer): Token[] | undefined {
		for (const path of this.paths) {
			// const path_result = path._test(tokens)
			// if (path_result !== undefined)
			// 	return path_result
			if (path.test(lexer))
				return true
		}

		// return undefined
		return false
	}

	// render_ts() {
	// 	const is_optional = this.paths.maybe_get(-1).match({
	// 		some: a => a.length === 0,
	// 		none: false,
	// 	})
	// 	return ts.createCall(
	// 		ts.createIdentifier('branch'), undefined,
	// 		[is_optional ? ts.createTrue() : ts.createFalse()].concat(this.paths.map(path => path.render_ts())),
	// 	)
	// }
}

// export class DecisionWhile() {
// 	//
// }
