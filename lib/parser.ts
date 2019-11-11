import { Cast, tuple as t } from '@ts-std/types'
import { Maybe, Some, None } from '@ts-std/monads'

import { Decidable } from './decision'
import { match_tokens, TokenDefinition, BaseLexer, Token, RawToken, VirtualToken } from './lexer'


function Parser(...lexer_args: Parameters<BaseLexer['reset']>) {
	const lexer = new BaseLexer(...lexer_args)
	return {
		reset: lexer.reset.bind(lexer),
		consume: consume.bind(lexer),
		maybe: maybe.bind(lexer),
		or: or.bind(lexer),
		maybe_or: maybe_or.bind(lexer),
		many: many.bind(lexer),
		maybe_many: maybe_many.bind(lexer),
		many_separated: many_separated.bind(lexer),
		maybe_many_separated: maybe_many_separated.bind(lexer),
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

function f<F extends Func>(
	fn: F, d: Decidable,
	...args: Parameters<F>
): DecidableFunc<F> {
	return [fn, d, ...args] as DecidableFunc<F>
}

type ParseEntity = DecidableFunc<Func> | TokenDefinition[]

type EntityReturn<I extends ParseEntity> =
	I extends TokenDefinition[] ? TokensForDefinitions<I>
	: ((...args: I) => any) extends ((fn: infer F, d: Decidable, ...args: infer A) => any)
	? F extends Func
	? A extends Parameters<F>
	? ReturnType<F>
	: never : never : never


type TokensForDefinitions<L extends TokenDefinition[]> = { [I in keyof L]: Token }

function perform_entity<F extends Func, I extends DecidableFunc<F> | TokenDefinition[]>(
	lexer: BaseLexer,
	entity: I,
): EntityReturn<I> {
	if (is_decidable_func(entity)) {
		const [fn, _, ...args] = entity
		return fn(...args)
	}
	return _consume(lexer, entity as TokenDefinition[]) as EntityReturn<I>
}

function test_entity<F extends Func, I extends DecidableFunc<F> | TokenDefinition[]>(
	lexer: BaseLexer,
	entity: I,
): boolean {
	if (is_decidable_func(entity)) {
		const [, tester, ] = entity
		const toks = lexer.peek(tester.test_length)
		return tester.test(toks)
	}
	const toks = lexer.peek(entity.length)
	return match_tokens(toks, entity as TokenDefinition[])
}


function _consume<L extends TokenDefinition[]>(
	lexer: BaseLexer,
	token_definitions: L
): TokensForDefinitions<L> {
	const next_tokens = lexer.advance(token_definitions.length)

	if (match_tokens(next_tokens, token_definitions))
		return next_tokens as TokensForDefinitions<L>
	else
		throw new Error("next tokens didn't match")
}

function consume<L extends TokenDefinition[]>(
	this: BaseLexer,
	...token_definitions: L
): TokensForDefinitions<L> {
	return _consume(this, token_definitions)
}

type Optional<T, B extends boolean> = B extends true ? T | undefined : T


function maybe<I extends ParseEntity>(
	this: BaseLexer,
	...entity: I
): EntityReturn<I> | undefined {
	if (test_entity(this, entity))
		return perform_entity(this, entity)

	return undefined
}


function many<I extends ParseEntity>(
	this: BaseLexer,
	...entity: I
): EntityReturn<I>[] {
	return _many(this, false, entity)
}

function maybe_many<I extends ParseEntity>(
	this: BaseLexer,
	...entity: I
): EntityReturn<I>[] | undefined {
	return _many(this, true, entity)
}

function _many<I extends ParseEntity, B extends boolean>(
	lexer: BaseLexer,
	is_optional: B,
	entity: I,
): Optional<EntityReturn<I>[], B> {
	let should_proceed = !is_optional || test_entity(lexer, entity)
	if (is_optional)
		if (!should_proceed)
			return undefined as Optional<EntityReturn<I>[], B>

	const results = [] as EntityReturn<I>[]

	while (should_proceed) {
		results.push(perform_entity(lexer, entity))
		should_proceed = test_entity(lexer, entity)
	}

	return results as Optional<EntityReturn<I>[], B>
}



type ChoicesReturn<C extends ParseEntity[]> = {
	[K in keyof C]: EntityReturn<Cast<C[K], ParseEntity>>
}[number]

function or<C extends ParseEntity[]>(
	this: BaseLexer,
	...choices: C
): ChoicesReturn<C> {
	return _or(this, false, choices)
}

function maybe_or<C extends ParseEntity[]>(
	this: BaseLexer,
	...choices: C
): ChoicesReturn<C> | undefined {
	return _or(this, true, choices)
}

function _or<C extends ParseEntity[], B extends boolean>(
	lexer: BaseLexer,
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
		: choice_result.expect("no choice taken")
}


function many_separated<B extends ParseEntity, S extends ParseEntity>(
	this: BaseLexer,
	body_rule: B,
	separator_rule: S,
): EntityReturn<B>[] {
	return _many_separated(this, false, body_rule, separator_rule)
}

function maybe_many_separated<B extends ParseEntity, S extends ParseEntity>(
	this: BaseLexer,
	body_rule: B,
	separator_rule: S,
): EntityReturn<B>[] | undefined {
	return _many_separated(this, true, body_rule, separator_rule)
}

function _many_separated<B extends ParseEntity, S extends ParseEntity, O extends boolean>(
	lexer: BaseLexer,
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
