import '@ts-std/extensions/dist/array'
import { Dict, tuple as t, UnionToIntersection } from '@ts-std/types'

import { debug } from '../utils'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 5 } })

export type UserRawTokenDefinition = {
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

export type EmptyVirtualTokenDefinition = {
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


export type VirtualLexerCreator<S, T extends Dict<ExposedRawTokenDefinition | VirtualTokenDefinition>, A extends any[]> =
	(...args: A) => [T, VirtualLexer<S>]

type VirtualLexerOutput<S, T extends Dict<ExposedRawTokenDefinition | VirtualTokenDefinition>> = [T, VirtualLexer<S>]
export type VirtualLexerOutputs = Dict<VirtualLexerOutput<any, Dict<ExposedRawTokenDefinition | VirtualTokenDefinition>>>


export type VirtualLexer<S> = Readonly<{
	initialize(): S,
	request(
		virtual_token: VirtualTokenDefinition,
		state: S,
		source_state: SourceState,
		file: SourceFile,
	): [HiddenToken[], VirtualToken, S, SourceState] | undefined,
	notify(token: RawToken, state: S): S,
}>


type VirtualLexerState<S> =
	{ readonly virtual_lexer: VirtualLexer<S>, state: S }

type VirtualLexerStateDict<V extends VirtualLexerOutputs> = {
	[K in keyof V]: V[K] extends VirtualLexerOutput<infer S, any>
		? VirtualLexerState<S>
		: never
}

type TokensForVirtualLexers<V extends VirtualLexerOutputs> = UnionToIntersection<{
	[K in keyof V]: V[K] extends VirtualLexerOutput<any, infer T> ? T : never
}[keyof V]>

type VirtualLexersFromOutputs<V extends VirtualLexerOutputs> = {
	[K in keyof V]: V[K] extends VirtualLexerOutput<infer S, any> ? VirtualLexer<S> : never
}

export type SourceState = Readonly<{
	source: string, index: number,
	line: number, column: number,
}>

export type LexerState<V extends VirtualLexerOutputs> = Readonly<{
	source_state: SourceState,
	virtual_lexers: VirtualLexerStateDict<V>,
}>

type NonEmpty<T> = [T, ...T[]]

export class Lexer<V extends VirtualLexerOutputs> {
	private readonly ignored_token_definitions: RawTokenDefinition[]
	private readonly raw_virtual_lexers: VirtualLexersFromOutputs<V>
	private constructor(
		token_definitions: UserRawTokenDefinition[],
		virtual_lexer_outputs: V,
	) {
		const ignored_token_definitions = token_definitions.filter(d => d.ignore) as RawTokenDefinition[]

		const raw_virtual_lexers = {} as VirtualLexersFromOutputs<V>
		for (const virtual_lexer_name in virtual_lexer_outputs) {
			const [toks, virtual_lexer] = virtual_lexer_outputs[virtual_lexer_name]
			;(raw_virtual_lexers as any)[virtual_lexer_name] = virtual_lexer

			for (const token of Object.values(toks)) {
				if (token.is_virtual || !token.ignore)
					continue
				ignored_token_definitions.push(token)
			}
		}

		this.ignored_token_definitions = ignored_token_definitions
		this.raw_virtual_lexers = raw_virtual_lexers
	}

	static create<D extends Dict<TokenSpec>, V extends VirtualLexerOutputs = {}>(
		tokens: D,
		virtual_lexer_outputs: V,
	): [TokensForSpecs<D> & TokensForVirtualLexers<V>, Lexer<V>] {
		const user_toks = Tokens(tokens)

		const tok = { ...user_toks } as TokensForSpecs<D> & TokensForVirtualLexers<V>
		for (const virtual_lexer_name in virtual_lexer_outputs) {
			const [toks,] = virtual_lexer_outputs[virtual_lexer_name]
			for (const key in toks)
				(tok as any)[key] = toks[key]
		}
		const lexer = new Lexer(Object.values(user_toks), virtual_lexer_outputs)

		return t(tok, lexer)
	}

	private file: SourceFile | undefined
	private state: LexerState<V> | undefined
	reset(source: string, filename?: string) {
		const virtual_lexers = {} as VirtualLexerStateDict<V>
		for (const virtual_lexer_name in this.raw_virtual_lexers) {
			const virtual_lexer = this.raw_virtual_lexers[virtual_lexer_name]
			;(virtual_lexers as any)[virtual_lexer_name] = { virtual_lexer, state: virtual_lexer.initialize() }
		}

		this.file = { source, filename }
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

	protected static request<V extends VirtualLexerOutputs>(
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
		if (this.file === undefined)
			throw new Error()
		if (this.state === undefined)
			throw new Error()

		// console.log('test')
		// console.log('token_definitions', token_definitions)
		// console.log('input_lexer_state ? input_lexer_state.source_state : undefined', input_lexer_state ? input_lexer_state.source_state : undefined)
		// console.log('this.state.source_state', this.state.source_state)

		const attempt = Lexer.request(
			token_definitions, input_lexer_state || this.state,
			this.file, this.ignored_token_definitions,
		)
		// console.log('attempt', attempt)
		// console.log('exiting test')
		// console.log()
		return attempt
	}

	require(token_definitions: TokenDefinition[]): Token[] {
		if (this.file === undefined)
			throw new Error()
		if (this.state === undefined)
			throw new Error()

		// console.log('require')
		// console.log('token_definitions', token_definitions)
		// console.log('this.state.source_state', this.state.source_state)

		const attempt = Lexer.request(
			token_definitions, this.state,
			this.file, this.ignored_token_definitions,
		)
		if (attempt === undefined) {
			const expected_tokens = debug(token_definitions)
			const next_source = this.get_next_source()
			throw new Error(`expected these tokens:\n${expected_tokens}\n\nbut source had:\n${next_source}\n`)
		}

		this.state = attempt[1]
		// console.log('this.state.source_state', this.state.source_state)
		// console.log('attempt', attempt)
		// console.log('exiting require')
		// console.log()
		return attempt[0]
	}

	exit() {
		if (this.file === undefined)
			throw new Error()
		if (this.state === undefined)
			throw new Error()

		if (this.state.source_state.source.length !== 0)
			throw new Error(`the source wasn't entirely consumed:\n\n${this.get_next_source()}`)
	}

	get_next_source() {
		if (this.state === undefined)
			return ''
		return debug(this.state.source_state.source.slice(0, 30))
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


export type TokenSpec = RegExp | string | { regex: RegExp | string, ignore: true }

export function Tokens<D extends Dict<TokenSpec>>(
	tokens: D,
): TokensForSpecs<D> {
	const give = {} as TokensForSpecs<D>
	for (const key in tokens) {
		give[key] = UserToken(key, tokens[key])
	}
	return give
}
type TokensForSpecs<D extends Dict<TokenSpec>> =
	{ [K in keyof D]: UserRawTokenDefinition }


export function escape_string(def: string) {
	return def.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') // $& means the whole matched string
}

export function finalize_regex(entry: RegExp | string) {
	const final_regex = typeof entry === 'string'
		? new RegExp(`^(?:${escape_string(entry)})`)
		// ? new RegExp(`^(?:${escape_string(entry)})`, 'u')
		: new RegExp(`^(?:${entry.source})`)
		// : new RegExp(`^(?:${entry.source})`, 'u')
	if (final_regex.test(''))
		throw new Error(`attempted to create a token that matches the empty string:\n${debug(final_regex)}`)
	return final_regex
}

export function UserToken(name: string, spec: TokenSpec): UserRawTokenDefinition {
	return typeof spec === 'object' && 'ignore' in spec
		? { name, is_virtual: false, regex: finalize_regex(spec.regex), ignore: true }
		: { name, is_virtual: false, regex: finalize_regex(spec) }
}


export function ExposedToken(name: string, virtual_lexer_name: string, spec: TokenSpec) {
	const token_definition = UserToken(name, spec) as unknown as ExposedRawTokenDefinition
	(token_definition as any).virtual_lexer_name = virtual_lexer_name
	return token_definition
}

export function VirtualToken(name: string, virtual_lexer_name: string): EmptyVirtualTokenDefinition
export function VirtualToken(name: string, virtual_lexer_name: string, regex: RegExp): ContentVirtualTokenDefinition
export function VirtualToken(name: string, virtual_lexer_name: string, regex?: RegExp): any {
	const token_definition = { type: 'Token', name, virtual_lexer_name, is_virtual: true }
	if (regex !== undefined)
		(token_definition as any).regex = finalize_regex(regex)

	return token_definition
}

export function HiddenToken(name: string, regex: RegExp): HiddenTokenDefinition {
	return {
		name, ignore: true, is_virtual: false,
		regex: finalize_regex(regex),
	}
}
