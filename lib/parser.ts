import { Dict, Cast, tuple as t } from '@ts-std/types'
import { Maybe, Some, None } from '@ts-std/monads'

import { Decidable } from './decision'
import { Lexer as _Lexer, match_tokens, TokenDefinition, RawTokenDefinition, Token, RawToken, VirtualToken } from './lexer'

type Lexer = _Lexer<Dict<unknown>>

export function Parser(...lexer_args: Parameters<Lexer['reset']>) {
	const lexer = new _Lexer(...lexer_args)
	return {
		reset(...args: Parameters<Lexer['reset']>) {
			lexer.reset(...args)
		},
		arg<E extends ParseEntity>(entity: E) {
			return perform_entity(lexer, entity)
		},
		lock(token_definition: RawTokenDefinition) {
			return lock(lexer, token_definition)
		},
		consume<L extends TokenDefinition[]>(...token_definitions: L) {
			return consume(lexer, token_definitions)
		},
		maybe<E extends ParseEntity>(...entity: E) {
			return maybe(lexer, entity)
		},
		or<C extends ParseEntity[]>(...choices: C) {
			return or(lexer, choices)
		},
		maybe_or<C extends ParseEntity[]>(...choices: C) {
			return maybe_or(lexer, choices)
		},
		many<E extends ParseEntity>(...entity: E) {
			return many(lexer, entity)
		},
		maybe_many<E extends ParseEntity>(...entity: E) {
			return maybe_many(lexer, entity)
		},
		many_separated<B extends ParseEntity, S extends ParseEntity>(body_rule: B, separator_rule: S) {
			return many_separated(lexer, body_rule, separator_rule)
		},
		maybe_many_separated<B extends ParseEntity, S extends ParseEntity>(body_rule: B, separator_rule: S) {
			return maybe_many_separated(lexer, body_rule, separator_rule)
		},
	}
}

type Func = (...args: any[]) => any

type DecidableFunc<F extends Func> =
	((fn: F, d: Decidable, ...args: Parameters<F>) => any) extends ((...args: infer R) => any)
	? R
	: never

function is_decidable_func<F extends Func>(
	fl: DecidableFunc<F> | TokenDefinition[],
): fl is DecidableFunc<F> {
	return typeof fl[0] === 'function'
}

export function f<F extends Func>(
	fn: F, d: Decidable,
	...args: Parameters<F>
): DecidableFunc<F> {
	return [fn, d, ...args] as DecidableFunc<F>
}

export type ParseEntity = DecidableFunc<Func> | TokenDefinition[]

type EntityReturn<E extends ParseEntity> =
	E extends TokenDefinition[] ? TokensForDefinitions<E>
	: ((...args: E) => any) extends ((fn: infer F, d: Decidable, ...args: infer A) => any)
	? F extends Func
	? A extends Parameters<F>
	? ReturnType<F>
	: never : never : never


type TokensForDefinitions<L extends TokenDefinition[]> = { [E in keyof L]: Token }

function perform_entity<F extends Func, E extends DecidableFunc<F> | TokenDefinition[]>(
	lexer: Lexer,
	entity: E,
): EntityReturn<E> {
	if (is_decidable_func(entity)) {
		const [fn, _, ...args] = entity
		return fn(...args)
	}
	return lexer.require(entity as TokenDefinition[]) as EntityReturn<E>
}

function test_entity<F extends Func, E extends DecidableFunc<F> | TokenDefinition[]>(
	lexer: Lexer,
	entity: E,
): boolean {
	if (is_decidable_func(entity)) {
		const [, tester, ] = entity
		return tester.test(lexer) !== undefined
	}
	return lexer.test(entity as TokenDefinition[]) !== undefined
}

function consume<L extends TokenDefinition[]>(
	lexer: Lexer,
	token_definitions: L
): TokensForDefinitions<L> {
	return lexer.require(token_definitions) as EntityReturn<L>
}

// function lock<E extends ParseEntity>(lexer: Lexer, ...entity: E) {
function lock(lexer: Lexer, token_definition: RawTokenDefinition) {
	// const locked = new LockedValue<EntityReturn<E>>(deep_equal)
	let locked = undefined as RawToken | undefined
	return function() {
		const [token] = perform_entity(lexer, [token_definition] as [RawTokenDefinition]) as [RawToken]

		if (locked !== undefined) {
			if (locked.type.name !== token.type.name || locked.content !== token.content)
				throw new Error(`unexpected locked Token, expected ${locked} got ${token}`)
			return token
		}
		locked = token
		return token
	}
}

type Optional<T, B extends boolean> = B extends true ? T | undefined : T

function maybe<E extends ParseEntity>(
	lexer: Lexer,
	entity: E
): EntityReturn<E> | undefined {
	if (test_entity(lexer, entity))
		return perform_entity(lexer, entity)

	return undefined
}


function many<E extends ParseEntity>(
	lexer: Lexer,
	entity: E
): EntityReturn<E>[] {
	return _many(lexer, false, entity)
}

function maybe_many<E extends ParseEntity>(
	lexer: Lexer,
	entity: E
): EntityReturn<E>[] | undefined {
	return _many(lexer, true, entity)
}

function _many<E extends ParseEntity, B extends boolean>(
	lexer: Lexer,
	is_optional: B,
	entity: E,
): Optional<EntityReturn<E>[], B> {
	let should_proceed = !is_optional || test_entity(lexer, entity)
	if (is_optional && !should_proceed)
		return undefined as Optional<EntityReturn<E>[], B>

	const results = [] as EntityReturn<E>[]

	while (should_proceed) {
		results.push(perform_entity(lexer, entity))
		should_proceed = test_entity(lexer, entity)
	}

	return results as Optional<EntityReturn<E>[], B>
}



export type ChoicesReturn<C extends ParseEntity[]> = {
	[K in keyof C]: EntityReturn<C[K] extends ParseEntity ? C[K] : never>
}[number]

function or<C extends ParseEntity[]>(
	lexer: Lexer,
	choices: C
): ChoicesReturn<C> {
	return _or(lexer, false, choices) as ChoicesReturn<C>
}

function maybe_or<C extends ParseEntity[]>(
	lexer: Lexer,
	choices: C
): ChoicesReturn<C> | undefined {
	return _or(lexer, true, choices) as ChoicesReturn<C> | undefined
}

function _or<C extends ParseEntity[], B extends boolean>(
	lexer: Lexer,
	is_optional: B,
	choices: C,
): Optional<ChoicesReturn<C>, B> {
	let choice_result = None

	for (const choice of choices) {
		if (!test_entity(lexer, choice))
			continue

		choice_result = Some(perform_entity(lexer, choice))
	}

	return is_optional
		? choice_result.to_undef()
		// TODO make this have nice code frames etc
		: choice_result.expect("no choice taken")
}


function many_separated<B extends ParseEntity, S extends ParseEntity>(
	lexer: Lexer,
	body_rule: B,
	separator_rule: S,
): EntityReturn<B>[] {
	return _many_separated(lexer, false, body_rule, separator_rule)
}

function maybe_many_separated<B extends ParseEntity, S extends ParseEntity>(
	lexer: Lexer,
	body_rule: B,
	separator_rule: S,
): EntityReturn<B>[] | undefined {
	return _many_separated(lexer, true, body_rule, separator_rule)
}

function _many_separated<B extends ParseEntity, S extends ParseEntity, O extends boolean>(
	lexer: Lexer,
	is_optional: O,
	body_rule: B,
	separator_rule: S,
): Optional<EntityReturn<B>[], O> {
	const results = [] as EntityReturn<B>[]

	if (is_optional && !test_entity(lexer, body_rule))
		return undefined as Optional<EntityReturn<B>[], O>

	results.push(perform_entity(lexer, body_rule))

	let should_proceed = test_entity(lexer, separator_rule)
	while (should_proceed) {
		perform_entity(lexer, separator_rule)

		results.push(perform_entity(lexer, body_rule))
		should_proceed = test_entity(lexer, separator_rule)
	}

	return results as Optional<EntityReturn<B>[], O>
}
