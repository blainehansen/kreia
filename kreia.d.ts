// declare module "kreia" {}
export as namespace kreia;

export type GateFunction = () => boolean
export type Func = (...args: any[]) => any

type DefObj<F extends Func> = { func: F, lookahead: number }
export type Def<F extends Func> = F | DefObj<F>
type ArgsDef<F extends Func> = { args?: Parameters<F> }
type GateDef = { gate?: GateFunction }

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type OrDef<F extends Func> = F | PartialBy<DefObj<F>, 'lookahead'> & ArgsDef<F> & GateDef

export type BoundFunctions = {
	inspecting(): boolean,
	// formatError(token, message): string,
	// createError(token, message): Error,
	rule<F extends Func>(ruleName: string, ruleFunction: F, lookahead?: number): void,

	subrule(ruleName: string, ...args: any[]): any,
	maybeSubrule(ruleName: string, ...args: any[]): any,
	gateSubrule(gateFunction: GateFunction, ruleName: string, ...args: any[]): any,

	consume(tokenType: TokenType): Token,
	consume(...tokenTypeArray: TokenType[]): Token[],
	maybeConsume(tokenType: TokenType): Token | undefined,
	maybeConsume(...tokenTypeArray: TokenType[]): Token[] | undefined,
	gateConsume(gateFunction: GateFunction, tokenType: TokenType): Token | undefined,
	gateConsume(gateFunction: GateFunction, ...tokenTypeArray: TokenType[]): Token[] | undefined,

	maybe<F extends Func>(def: Def<F>, ...args: Parameters<F>): ReturnType<F> | undefined,
	gate<F extends Func>(gateFunction: GateFunction, def: Def<F>, ...args: Parameters<F>): ReturnType<F> | undefined,

	or<F extends Func>(...choices: OrDef<F>[]): ReturnType<F>,
	or<A extends Func, B extends Func>(a: OrDef<A>, b: OrDef<B>): ReturnType<A> | ReturnType<B>,
	or<A extends Func, B extends Func, C extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>): ReturnType<A> | ReturnType<B> | ReturnType<C>,
	or<A extends Func, B extends Func, C extends Func, D extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J>,
	or<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func, K extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>, k: OrDef<K>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J> | ReturnType<K>,


	maybeOr<F extends Func>(...choices: OrDef<F>[]): ReturnType<F>,
	maybeOr<A extends Func, B extends Func>(a: OrDef<A>, b: OrDef<B>): ReturnType<A> | ReturnType<B>,
	maybeOr<A extends Func, B extends Func, C extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>): ReturnType<A> | ReturnType<B> | ReturnType<C>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J>,
	maybeOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func, K extends Func>(a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>, k: OrDef<K>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J> | ReturnType<K>,

	gateOr<F extends Func>(gateFunction: GateFunction, ...choices: OrDef<F>[]): ReturnType<F>,
	gateOr<A extends Func, B extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>): ReturnType<A> | ReturnType<B>,
	gateOr<A extends Func, B extends Func, C extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>): ReturnType<A> | ReturnType<B> | ReturnType<C>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J>,
	gateOr<A extends Func, B extends Func, C extends Func, D extends Func, E extends Func, F extends Func, G extends Func, H extends Func, I extends Func, J extends Func, K extends Func>(gateFunction: GateFunction, a: OrDef<A>, b: OrDef<B>, c: OrDef<C>, d: OrDef<D>, e: OrDef<E>, f: OrDef<F>, g: OrDef<G>, h: OrDef<H>, i: OrDef<I>, j: OrDef<J>, k: OrDef<K>): ReturnType<A> | ReturnType<B> | ReturnType<C> | ReturnType<D> | ReturnType<E> | ReturnType<F> | ReturnType<G> | ReturnType<H> | ReturnType<I> | ReturnType<J> | ReturnType<K>,


	many<F extends Func>(
		def: Def<F>, ...args: Parameters<F>,
	): ReturnType<F>[],

	maybeMany<F extends Func>(
		def: Def<F>, ...args: Parameters<F>,
	): ReturnType<F>[] | undefined,

	gateMany<F extends Func>(
		gateFunction: GateFunction, def: Def<F>, ...args: Parameters<F>,
	): ReturnType<F>[] | undefined,


	manySeparated<F extends Func, S extends Func>(
		def: Def<F>, sep: Def<S>, ...args: Parameters<F>,
	): ReturnType<F>[],

	maybeManySeparated<F extends Func, S extends Func>(
		def: Def<F>, sep: Def<S>, ...args: Parameters<F>,
	): ReturnType<F>[] | undefined,

	gateManySeparated<F extends Func, S extends Func>(
		gateFunction: GateFunction, def: Def<F>, sep: Def<S>, ...args: Parameters<F>,
	): ReturnType<F>[] | undefined,
}

export interface Parser {
	getPrimitives(): BoundFunctions,
	analyze(): void,
	reset(text: string): void,
	getTopLevel(text: string): (...args: any[]) => any,
}

export type Rule = {
	match: RegExp | string | string[],
	lineBreaks?: boolean,
	push?: string,
	pop?: number,
	next?: string,
	error?: true,
	value?: (x: string) => string,
	categories?: Category | Category[],
	ignore?: true,
	keywords?: {
		[keywordType: string]: string | string[] | {
			values: string | string[], categories: Category | Category[],
		},
	},
}

export type Rules = {
	[ruleName: string]: RegExp | string | string[] | Rule | Rule[]
}
// export type StatesRules = { [stateName: string]: Rules }

type KeywordManifest = { [keyword: string]: undefined }
export type TokenLibrary<L extends Rules, K extends KeywordManifest> = { [tokenName in (keyof L | keyof K)]: TokenDefinition }
// export type StatesTokenLibrary<L extends StatesRules> = { [tokenName in keyof L]: TokenDefinition }


export function createParser<L extends Rules, K extends KeywordManifest>(
	lexerDefinition: L, defaultLookahead?: number, allLexerKeywords?: K,
): [Parser, TokenLibrary<L, K>]

// export function createStatesParser<L extends StatesRules>(
// 	lexerDefinition: L, defaultLookahead?: number,
// ): [Parser, NestedTokenLibrary<L>]

// export function lexingError(),

export interface Token {
	toString(): string,
	type?: string,
	value: string,
	offset: number,
	text: string,
	lineBreaks: number,
	line: number,
	col: number,
	categories: string[] | null,
}

export type Category = {
	isCategory: boolean,
	categoryName: string,
	categories: Category[] | null,
}

export type TokenDefinition = {
	type: string,
	categories: string[] | null,
}

export type TokenType = TokenDefinition | Category
export function matchToken(testToken: Token, matchTokenType: TokenType): boolean
export function matchTokens(testTokens: Token[], matchTokensOrCategories: TokenType[]): boolean
export function createTokenCategory(categoryName: string, parentCategories?: Category | Category[]): Category
