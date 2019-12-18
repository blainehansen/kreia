import * as util from 'util'
import { Result, Ok, Err, Maybe, Some, None } from '@ts-std/monads'
import { OrderedDict } from '@ts-std/collections'

export function debug(obj: any, depth = null as number | null) {
	return util.inspect(obj, { depth, colors: true })
}
export function log(obj: any, depth = null as number | null) {
	console.log(debug(obj, depth))
}

// export function impossible(): never {
// 	//
// }

export class LogError extends Error {
	constructor(lines: (string | any)[], depth = null as number | null) {
		const message = lines.map(line => {
			return typeof line === 'string'
				? line
				: debug(line, depth)
		}).join('\n')
		super(message)
	}
}

export interface Cls<T, A extends any[]> {
	new (...args: A): T
}

export function exec<F extends (...args: any[]) => any>(fn: F, ...args: Parameters<F>): ReturnType<F> {
	return fn(...args)
}

export function array_of(length: number): undefined[] {
	return Array.from({ length })
}

export const empty_ordered_dict = OrderedDict.create<any>(t => '', [])


export type NonEmpty<T> = [T, ...T[]]
export namespace NonEmpty {
	export function from_array<T>(array: T[]): Maybe<NonEmpty<T>> {
		return array.length !== 0 ? Some(array as NonEmpty<T>) : None
	}
}

export type NonLone<T> = [T, T, ...T[]]
export namespace NonLone {
	export function from_array<T>(array: T[]): Maybe<NonLone<T>> {
		return array.length >= 2 ? Some(array as NonLone<T>) : None
	}
}


export type GeneratorProducer<T> = () => Generator<T, void, undefined>

export class IterWrapper<T> {
	protected readonly children = [] as IterWrapper<T>[]
	protected internal: Generator<T, void, undefined>
	protected constructor(
		protected readonly fn: GeneratorProducer<T>,
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


export class MaxDict<T> {
	protected items: Dict<T> = {}
	constructor(readonly left_greater_right: (left: T, right: T) => boolean) {}

	set(key: string, item: T): T {
		if (key in this.items) {
			const existing = this.items[key]
			const existing_greater = this.left_greater_right(existing, item)
			return this.items[key] = existing_greater ? existing : item
		}

		return this.items[key] = item
	}
}


export function Data<F extends (...args: any) => any>(
	fn: F,
): (...args: Parameters<F>) => Readonly<ReturnType<F>> {
	return fn
}
export type Data<F extends (...args: any) => any> = ReturnType<F>


export function exhaustive(v: never): never {
	throw new Error()
}
