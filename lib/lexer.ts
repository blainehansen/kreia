import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Enum, empty, variant } from '@ts-std/enum'


export type UserRawTokenDefinition = {
	type: 'Token',
	name: string,
	regex: RegExp,
	ignore?: true,
	is_virtual: false,
}
export type ExposedRawTokenDefinition = UserRawTokenDefinition & {
	virtual_lexer_name: string,
}

export type HiddenTokenDefinition =
	Pick<UserRawTokenDefinition, 'name' | 'regex' | 'is_virtual'>
	& { ignore: true }

export type VirtualTokenDefinition = {
	type: 'Token',
	name: string,
	virtual_lexer_name: string,
	is_virtual: true,
}


export type RawTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition

export type TestableTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| HiddenTokenDefinition

export type TokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| VirtualTokenDefinition



export type SourceFile = Readonly<{
	source: string, filename?: string,
}>

export type Span = Readonly<{
	file: SourceFile, start: number, end: number, line: number, column: number,
}>

export type RawToken = {
	type: UserRawTokenDefinition | ExposedRawTokenDefinition,
	content: string,
	is_virtual: false,
	span: Span,
}
export type HiddenToken = {
	type: HiddenTokenDefinition,
	content: string,
	is_virtual: false,
	span: Span,
}
export type VirtualToken = {
	type: VirtualTokenDefinition,
	is_virtual: true,
	span: Pick<Span, 'line' | 'column'> & { index: number },
}

export type Token =
	| RawToken
	| VirtualToken

export type VirtualLexer<S, A extends any[] = []> = {
	use(...args: A): (ExposedRawTokenDefinition | VirtualTokenDefinition)[],
	initialize(): S,
	request<V extends Dict<any>>(
		virtual_token: VirtualTokenDefinition,
		state: S,
		lexer_state: LexerState<V>,
		file: SourceFile,
	): [HiddenToken[], VirtualToken, LexerState<V>] | undefined,
	notify(token: RawToken, state: S): S,
}

type VirtualLexerDict<V extends Dict<any>> =
	{ [K in keyof V]: V[K] }

type VirtualLexerState<S> =
	{ readonly virtual_lexer: VirtualLexer<S>, state: S }

type VirtualLexerStateDict<V extends Dict<any>> = {
	[K in keyof V]: VirtualLexerState<V[K]>
}


export type LexerState<V extends Dict<any>> = Readonly<{
	source: string, index: number,
	line: number, column: number,
	virtual_lexers: VirtualLexerStateDict<V>,
}>

type NonEmpty<T> = [T, ...T[]]

type LexerCache<V extends Dict<any>> = Readonly<{
	state: LexerState<V>,
	saved_tokens: NonEmpty<Token>,
}>


export class Lexer<V extends Dict<any>> {
	constructor(raw_virtual_lexers: V, source: string, filename?: string) {
		this.reset(raw_virtual_lexers, source, filename)
	}

	private file!: SourceFile
	private state!: LexerState<V>
	private cache: LexerCache<V> | undefined = undefined
	private ignored_token_definitions!: RawTokenDefinition[]
	reset(raw_virtual_lexers: V, source: string, filename?: string) {
		this.file = { source, filename }

		const ignored_token_definitions = [] as RawTokenDefinition[]
		const virtual_lexers = {} as VirtualLexerStateDict<V>
		for (const virtual_lexer_name in raw_virtual_lexers) {
			const virtual_lexer = raw_virtual_lexers[virtual_lexer_name]
			virtual_lexers[virtual_lexer_name] = { virtual_lexer, state: virtual_lexer.initialize() }

			for (const tok of virtual_lexer.use()) {
				if (tok.is_virtual || !tok.ignore)
					continue
				ignored_token_definitions.push(tok)
			}
		}

		this.ignored_token_definitions = ignored_token_definitions

		this.state = { source, index: 0, line: 0, column: 0, virtual_lexers }
	}

	static patch_virtual_lexer_state<V extends Dict<any>, S>(
		state: LexerState<V>,
		virtual_lexer_name: string,
		virtual_lexer_state: S,
	): LexerState<V> {
		if (!(virtual_lexer_name in state.virtual_lexers))
			throw new Error("")
		const { virtual_lexer } = state.virtual_lexers[virtual_lexer_name]

		return {
			...state,
			virtual_lexers: {
				...state.virtual_lexers,
				[virtual_lexer_name]: { virtual_lexer, state: virtual_lexer_state },
			}
		}
	}

	static attempt_token<V extends Dict<any>, T extends TestableTokenDefinition>(
		token_definition: T,
		{ source, index, line, column, virtual_lexers }: LexerState<V>,
		file: SourceFile,
	) {
		const match = source.match(token_definition.regex)
		if (match === null)
			return undefined

		const content = match[0]
		const characters_consumed = content.length
		const new_index = index + characters_consumed
		const split_newlines = content.split('\n')
		const count_newlines = split_newlines.length - 1
		const new_line = line + count_newlines
		const new_column = count_newlines === 0
			? column + characters_consumed
			: split_newlines[count_newlines].length

		const token = {
			content,
			type: token_definition,
			is_virtual: false as const,
			span: { file, start: index, end: new_index, line, column },
		}
		const state = {
			source: source.slice(characters_consumed),
			index: new_index,
			line: new_line,
			column: new_column,
			virtual_lexers,
		}
		return t(token, state)
	}

	protected request(token_definitions: TokenDefinition[]): LexerCache<V> | undefined {
		// request doesn't mutate anything, not even cache
		// it merely returns a possible cache candidate and lets the calling function decide what to do

		const { file } = this
		let state = { ...this.state }
		const tokens = [] as Token[]

		for (const token_definition of token_definitions) {
			if (token_definition.is_virtual) {
				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]
				const virtual_attempt = virtual_lexer.request(token_definition, virtual_lexer_state, state, file)
				if (virtual_attempt === undefined)
					return undefined
				const [_ignored_tokens, virtual_token, new_state] = virtual_attempt
				state = new_state

				tokens.push(virtual_token)
				continue
			}

			// go through list of ignored tokens
			for (const ignored_token_definition of this.ignored_token_definitions) {
				if (ignored_token_definition.name === token_definition.name)
					continue

				const attempt = Lexer.attempt_token(ignored_token_definition, state, file)
				if (attempt === undefined)
					continue
				const [_ignored_token, new_state] = attempt
				state = new_state
			}

			const attempt = Lexer.attempt_token(token_definition, state, file)
			if (attempt === undefined)
				return undefined
			const [token, new_state] = attempt
			state = new_state

			// here is where we would check if there's an interested virtual_lexer
			if ('virtual_lexer_name' in token_definition) {
				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]
				const new_virtual_lexer_state = virtual_lexer.notify(token, virtual_lexer_state)
				state = Lexer.patch_virtual_lexer_state(
					state, token_definition.virtual_lexer_name,
					{ virtual_lexer, state: new_virtual_lexer_state },
				)
			}

			if (token_definition.ignore)
				continue

			tokens.push(token)
		}

		return tokens.length === 0
			? undefined
			: { state, saved_tokens: [tokens[0], ...tokens.slice(1)] }
	}

	test(token_definitions: TokenDefinition[]): boolean {
		// this function merely tests, so it only saves the cache but doesn't do anything else
		const possible_cache = this.request(token_definitions)
		if (possible_cache === undefined)
			return false
		this.cache = possible_cache
		return true
	}

	require(token_definitions: TokenDefinition[]): Token[] | undefined {
		// require returns and destroys the cache if it exists,
		// and it updates the current state

		if (this.cache !== undefined) {
			const { saved_tokens, state } = this.cache
			this.cache = undefined
			if (match_tokens(saved_tokens, token_definitions)) {
				this.state = state
				return saved_tokens
			}
		}

		const cache = this.request(token_definitions)
		if (cache === undefined)
			return undefined
		const { saved_tokens, state } = cache
		this.state = state
		return saved_tokens
	}

	exit() {
		if (this.state.source.length !== 0)
			throw new Error("the source wasn't entirely consumed")
	}
}




export function match_token(token: Token | undefined, token_definition: TokenDefinition): boolean {
	return token !== undefined && token.type.name == token_definition.name
}

export function match_tokens(tokens: Token[], token_definitions: TokenDefinition[]) {
	for (const [index, token_definition] of token_definitions.entries()) {
		const token = tokens[index]
		if (!match_token(token, token_definition))
			return false
	}

	return true
}

export function match_and_trim(tokens: Token[], token_definitions: TokenDefinition[]) {
	for (const [index, token_definition] of token_definitions.entries()) {
		const token = tokens[index]

		if (!match_token(token, token_definition))
			return undefined
	}

	return tokens.slice(token_definitions.length)
}


type TokenOptions = { ignore?: true }
type BaseTokenSpec = RegExp | string | (RegExp | string)[]
type TokenSpec = BaseTokenSpec | { match: BaseTokenSpec } & TokenOptions

function source_regex(def: RegExp | string) {
	return typeof def === 'string'
		? def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
		: def.source
}

function denature_spec(spec: TokenSpec): [BaseTokenSpec, TokenOptions] {
	if (typeof spec === 'object' && 'match' in spec) {
		const { match, ...options } = spec
		return [match, options]
	}
	return [spec, {}]
}

export function make_regex(regex: BaseTokenSpec) {
	const base_source = Array.isArray(regex)
		? regex.map(r => `(?:${source_regex(r)})`).join('|')
		: source_regex(regex)

	return new RegExp('^' + base_source)
}


export function UserToken(name: string, spec: TokenSpec) {
	const [regex, { ignore }] = denature_spec(spec)

	const token_definition = {
		type: 'Token', name, is_virtual: false,
		regex: make_regex(regex),
	} as UserRawTokenDefinition

	if (ignore !== undefined)
		(token_definition as any).ignore = ignore

	return token_definition
}

export function ExposedToken(name: string, virtual_lexer_name: string, spec: TokenSpec) {
	const token_definition = UserToken(name, spec) as unknown as ExposedRawTokenDefinition
	(token_definition as any).virtual_lexer_name = virtual_lexer_name
	return token_definition
}

export function VirtualToken(name: string, virtual_lexer_name: string): VirtualTokenDefinition {
	return {
		type: 'Token', name, virtual_lexer_name, is_virtual: true,
	}
}

export function HiddenToken(name: string, regex: BaseTokenSpec): HiddenTokenDefinition {
	return {
		name, ignore: true, is_virtual: false,
		regex: make_regex(regex),
	}
}

// export function ConcatTokens(tokens: TestableTokenDefinition[]) {
// 	// basically just extract the sources (without the ^) and put them together
// }
