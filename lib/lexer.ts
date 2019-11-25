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

// export type VirtualTokenDefinition = {
// 	type: 'Token',
// 	name: string,
// 	virtual_lexer_name: string,
// 	is_virtual: true,
// }
export type EmptyVirtualTokenDefinition = {
	type: 'Token',
	name: string,
	virtual_lexer_name: string,
	is_virtual: true,
}
export type ContentVirtualTokenDefinition = EmptyVirtualTokenDefinition & {
	regex: RegExp,
}
export type VirtualTokenDefinition =
	| EmptyVirtualTokenDefinition
	| ContentVirtualTokenDefinition


export type RawTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition

export type TestableTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| HiddenTokenDefinition
	| ContentVirtualTokenDefinition

export type TokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| VirtualTokenDefinition



export type SourceFile = Readonly<{
	source: string, filename?: string,
}>

export type Span = Readonly<{
	file: SourceFile, start: number, end: number,
	line: number, column: number,
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
export type EmptyVirtualToken = {
	type: EmptyVirtualTokenDefinition,
	is_virtual: true,
	span: Pick<Span, 'line' | 'column'> & { index: number },
}
export type ContentVirtualToken = {
	type: ContentVirtualTokenDefinition,
	is_virtual: true,
	content: string,
	span: Span,
}
export type VirtualToken =
	| EmptyVirtualToken
	| ContentVirtualToken

export type Token =
	| RawToken
	| VirtualToken

export type VirtualLexer<S, A extends any[] = []> = Readonly<{
	use(...args: A): (ExposedRawTokenDefinition | VirtualTokenDefinition)[],
	initialize(): S,
	request(
		virtual_token: VirtualTokenDefinition,
		state: S,
		source_state: SourceState,
		file: SourceFile,
	): [HiddenToken[], VirtualToken, S, SourceState] | undefined,
	notify(token: RawToken, state: S): S,
}>

// type VirtualLexers = Dict<VirtualLexer<any, any[]>>
type VirtualLexerDict<V extends Dict<any>> =
	{ [K in keyof V]: VirtualLexer<V[K]> }

type VirtualLexerState<S> =
	{ readonly virtual_lexer: VirtualLexer<S>, state: S }

type VirtualLexerStateDict<V extends Dict<any>> = {
	[K in keyof V]: VirtualLexerState<V[K]>
}


export type SourceState = Readonly<{
	source: string, index: number,
	line: number, column: number,
}>

export type LexerState<V extends Dict<any>> = Readonly<{
	source_state: SourceState,
	virtual_lexers: VirtualLexerStateDict<V>,
}>
// type UnknownLexerState = LexerState<Dict<unknown>>

type NonEmpty<T> = [T, ...T[]]

export class Lexer<V extends Dict<any>> {
	constructor(
		raw_virtual_lexers: VirtualLexerDict<V>,
		ignored_token_definitions: RawTokenDefinition[],
		source: string, filename?: string,
	) {
		this.reset(raw_virtual_lexers, ignored_token_definitions, source, filename)
	}

	private file!: SourceFile
	private state!: LexerState<V>
	private ignored_token_definitions!: RawTokenDefinition[]
	reset(
		raw_virtual_lexers: VirtualLexerDict<V>,
		input_ignored_token_definitions: RawTokenDefinition[],
		source: string, filename?: string,
	) {
		this.file = { source, filename }

		const ignored_token_definitions = input_ignored_token_definitions.slice()
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

		this.state = {
			source_state: { source, index: 0, line: 1, column: 1 },
			virtual_lexers,
		}
	}

	static attempt_regex(
		regex: RegExp,
		{ source, index, line, column }: SourceState,
		file: SourceFile,
	) {
		const match = source.match(regex)
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

		const span = { file, start: index, end: new_index, line, column }
		const source_state = {
			source: source.slice(characters_consumed),
			index: new_index,
			line: new_line,
			column: new_column,
		}
		return t(content, span, source_state)
	}

	static attempt_token<T extends TestableTokenDefinition>(
		token_definition: T,
		source_state: SourceState,
		file: SourceFile,
	) {
		const match_attempt = Lexer.attempt_regex(token_definition.regex, source_state, file)
		if (match_attempt === undefined)
			return undefined
		const [content, span, new_source_state] = match_attempt

		const token = {
			content, span,
			type: token_definition,
			is_virtual: false as const,
		}
		return t(token, new_source_state)
	}

	protected static request<V extends Dict<any>>(
		token_definitions: TokenDefinition[],
		input_state: LexerState<V>,
		file: SourceFile,
		ignored_token_definitions: RawTokenDefinition[],
	): [NonEmpty<Token>, LexerState<V>] | undefined {
		let state = input_state
		const tokens = [] as Token[]

		for (const token_definition of token_definitions) {
			if (token_definition.is_virtual) {
				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]

				const virtual_attempt = virtual_lexer.request(token_definition, virtual_lexer_state, state.source_state, file)
				if (virtual_attempt === undefined)
					return undefined
				const [_ignored_tokens, virtual_token, new_virtual_lexer_state, new_source_state] = virtual_attempt
				state = {
					source_state: new_source_state,
					virtual_lexers: {
						...state.virtual_lexers,
						[token_definition.virtual_lexer_name]: { virtual_lexer, state: new_virtual_lexer_state },
					},
				}

				tokens.push(virtual_token)
				continue
			}

			// go through list of ignored tokens
			for (const ignored_token_definition of ignored_token_definitions) {
				if (ignored_token_definition.name === token_definition.name)
					continue

				const attempt = Lexer.attempt_token(ignored_token_definition, state.source_state, file)
				if (attempt === undefined)
					continue
				const [_ignored_token, new_source_state] = attempt
				state = { source_state: new_source_state, virtual_lexers: state.virtual_lexers }
			}

			const attempt = Lexer.attempt_token(token_definition, state.source_state, file)
			if (attempt === undefined)
				return undefined
			const [token, new_source_state] = attempt
			state = { source_state: new_source_state, virtual_lexers: state.virtual_lexers }

			if ('virtual_lexer_name' in token_definition) {
				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]
				const new_virtual_lexer_state = virtual_lexer.notify(token, virtual_lexer_state)
				state = {
					source_state: state.source_state,
					virtual_lexers: {
						...state.virtual_lexers,
						[token_definition.virtual_lexer_name]: { virtual_lexer, state: new_virtual_lexer_state }
					},
				}
			}

			if (token_definition.ignore)
				continue

			tokens.push(token)
		}

		return tokens.length === 0
			? undefined
			: [tokens as NonEmpty<Token>, state]
	}

	test(
		token_definitions: TokenDefinition[],
		input_lexer_state?: LexerState<V>,
	): [NonEmpty<Token>, LexerState<V>] | undefined {
		return Lexer.request(
			token_definitions, input_lexer_state || this.state,
			this.file, this.ignored_token_definitions,
		)
	}

	require(token_definitions: TokenDefinition[]): Token[] {
		const attempt = Lexer.request(
			token_definitions, this.state,
			this.file, this.ignored_token_definitions,
		)
		if (attempt === undefined)
			// TODO make nice source frames and everything
			throw new Error()

		this.state = attempt[1]
		return attempt[0]
	}

	// this would turn off ignore
	// require_all() {
	// }

	exit() {
		if (this.state.source_state.source.length !== 0)
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

	const final_regex = new RegExp('^' + base_source)
	if (final_regex.test(''))
		throw new Error(`attempted to create a token that matches the empty string ${regex}`)
	return final_regex
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

export function VirtualToken(name: string, virtual_lexer_name: string): EmptyVirtualTokenDefinition
export function VirtualToken(name: string, virtual_lexer_name: string, regex: BaseTokenSpec): ContentVirtualTokenDefinition
export function VirtualToken(name: string, virtual_lexer_name: string, regex?: BaseTokenSpec) {
	const token_definition = { type: 'Token', name, virtual_lexer_name, is_virtual: true }
	if (regex !== undefined)
		(token_definition as any).regex = make_regex(regex)

	return token_definition
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
