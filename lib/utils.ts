import * as util from 'util'
import { Result, Ok, Err } from '@ts-std/monads'

export function to_string(obj: any) {
	return util.inspect(obj, { depth: null, colors: true })
}
export function log(obj: any) {
	console.log(to_string(obj))
}


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

// export class BufferIterWrapper<T> {
// 	constructor(protected internal: Generator<T[], void, undefined>) {}

// 	next(): T | undefined {
// 		// this needs some internal buffer to hold the last output of internal.next
// 	}

// 	clone() {
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
