import * as util from 'util'
import { Result, Ok, Err } from '@ts-std/monads'

export function to_string(obj: any) {
	return util.inspect(obj, { depth: null, colors: true })
}
export function log(obj: any) {
	console.log(to_string(obj))
}


export function Data<F extends (...args: any) => any>(
	fn: F,
): (...args: Parameters<F>) => Readonly<ReturnType<F>> {
	return fn
}
export type Data<F extends (...args: any) => any> = ReturnType<F>

export function result_get<T>(dict: Dict<T>, key: string): Result<T> {
	return Result.from_nillable(dict[key], key)
}
