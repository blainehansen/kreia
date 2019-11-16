import * as util from 'util'
import { Result, Ok, Err } from '@ts-std/monads'

export function to_string(obj: any) {
	return util.inspect(obj, { depth: null, colors: true })
}
export function log(obj: any) {
	console.log(to_string(obj))
}


// export interface NiceGenerator<T> {
// 	next(): T | undefined
// 	clone: NiceGenerator<T>
// }

export class IterWrapper<T> {
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

// export class MultiIter<T> implements NiceGenerator<T> {
// 	constructor(protected branches: NiceGenerator<T>[]) {}


// }

// // this is to simultaneously iterate over the path and the next gathered branches
// function* multi_iter(branches: Definition[]) {
// 	const iters = branches
// 		.map(definition => new IterWrapper(into_iter(definition)))

// 	let sub_array = iters.flat_map(i => i.next() || [])
// 	while (sub_array.length > 0) {
// 		yield sub_array
// 		sub_array = iters.flat_map(i => i.next() || [])
// 	}
// }

// function* into_iter(definition: Definition): Generator<TokenDefinition[], void, undefined> {
// 	const nodes_to_visit = definition.slice()
// 	let node
// 	while (node = nodes_to_visit.shift()) switch (node.type) {
// 	case 'Or':
// 		yield* multi_iter(node.choices)
// 		continue
// 	case 'Maybe':
// 		yield* multi_iter(gather_branches([node.definition], nodes_to_visit))
// 		continue
// 	case 'Many':
// 		throw new Error()
// 	case 'Consume':
// 		yield* node.token_names.map(token_name => [registered_tokens[token_name]!])
// 		continue
// 	}
// }


export function Data<F extends (...args: any) => any>(
	fn: F,
): (...args: Parameters<F>) => Readonly<ReturnType<F>> {
	return fn
}
export type Data<F extends (...args: any) => any> = ReturnType<F>


export function exhaustive(): never {
	throw new Error()
}
