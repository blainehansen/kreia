import * as util from 'util'
import { Result, Ok, Err } from '@ts-std/monads'
import { OrderedDict } from '@ts-std/collections'

export function debug(obj: any, depth = 3 as number | null) {
	return util.inspect(obj, { depth, colors: true })
}
export function log(obj: any) {
	console.log(debug(obj))
}

export function exec<F extends (...args: any[]) => any>(fn: F, ...args: Parameters<F>): ReturnType<F> {
	return fn(...args)
}

export function array_of(length: number): undefined[] {
	return Array.from({ length })
}

export const empty_ordered_dict = OrderedDict.create<any>(t => '', [])

// export interface NiceGenerator<T> {
// 	next(): T | undefined
// 	clone: NiceGenerator<T>
// }

// type IterState =
// 	| { readonly type: 'Recording', readonly buffer: T[] }
// 	| { readonly type: 'Done', readonly memory: readonly T[], position: number }

// export class IterWrapper<T> {
// 	protected internal: Generator<T, void, undefined>
// 	protected state: IterState = { type: 'Recording', buffer: [] }
// 	constructor(
// 		protected readonly fn: () => Generator<T, void, undefined>,
// 	) {
// 		this.internal = fn()
// 	}

// 	next(): T | undefined {
// 		switch (this.state.type) {

// 		case 'Recording':
// 			let result = this.internal.next()
// 			if (result.done) {
// 				this.state = { type: 'Done', memory: this.buffer, position: this.buffer.length }
// 				return undefined
// 			}
// 			const value = result.value
// 			this.state.buffer.push(value)
// 			return value

// 		case 'Done':
// 			//
// 		}
// 	}

// 	// back() {
// 	// 	//
// 	// }

// 	// previous(amount: number): T {
// 	// 	//
// 	// }

// 	restart() {
// 		this.internal = this.fn()
// 		this.state = { type: 'Recording', buffer: [] }
// 	}

// 	clone() {
// 		switch (this.state.type) {

// 		case 'Recording':
// 			const buffer = this.state.buffer.slice()
// 			return new IterWrapper(function*() {
// 				yield* buffer
// 				yield*
// 			})

// 		case 'Done':
// 			//
// 		}
// 	}

// 	// the parent IterWrapper has complete ownership of these enclosed IterWrappers
// 	static chain<T>(...iters: IterWrapper<T>): IterWrapper<T> {
// 		return new IterWrapper(function*() {
// 			for (const iter of iters)
// 				yield* iter.internal
// 				// let item
// 				// while (item = iter.next())
// 				// 	yield item
// 		})
// 	}

// 	fresh_clone() {
// 		return new IterWrapper(this.fn)
// 	}
// }



// export class IterWrapper<T, E extends boolean> {
export type GeneratorProducer<T> = () => Generator<T, void, undefined>

export class IterWrapper<T> {
	protected readonly children = [] as IterWrapper<T>[]
	protected internal: Generator<T, void, undefined>
	protected constructor(
		protected readonly fn: GeneratorProducer<T>,
		// protected readonly possibly_eternal: E,
		protected readonly buffer: T[] = [],
	) {
		this.internal = fn()
	}

	static create<T>(fn: GeneratorProducer<T>) {
		return new IterWrapper(fn)
	}

	static create_eternal<T>(fn: GeneratorProducer<T>) {
		return new IterWrapper(function* () {
			while (true)
				yield* fn()
		})
	}

	static chain<T>(...iters: GeneratorProducer<T>[]): IterWrapper<T> {
		return new IterWrapper(function* () {
			for (const iter of iters)
				yield* iter()
		})
	}

	static chain_iters<T>(...iters: IterWrapper<T>[]): IterWrapper<T> {
		return new IterWrapper(function* () {
			for (const iter of iters)
				yield* iter.internal
		})
	}

	next(): T | undefined {
		if (this.buffer.length > 0)
			return this.buffer.shift()

		let result = this.internal.next()
		if (result.done) return undefined

		const { value } = result
		for (const child of this.children)
			child.buffer.push(value)
		return value
	}

	clone(): IterWrapper<T> {
		const parent = this
		const child = new IterWrapper(function* () {
			let item = parent.internal.next()
			while (!item.done) {
				const { value } = item
				parent.buffer.push(value)
				yield value

				item = parent.internal.next()
			}
		}, this.buffer.slice())
		this.children.push(child)

		return child
	}
}



// export class MultiIter<T> implements NiceGenerator<T[]> {
// 	constructor(protected branches: NiceGenerator<T>[]) {}
// }


export function Data<F extends (...args: any) => any>(
	fn: F,
): (...args: Parameters<F>) => Readonly<ReturnType<F>> {
	return fn
}
export type Data<F extends (...args: any) => any> = ReturnType<F>


export function exhaustive(v: never): never {
	throw new Error()
}
