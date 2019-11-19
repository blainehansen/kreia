import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Enum, empty, variant } from '@ts-std/enum'

import { Data } from './utils'


export type Token =
	| RawToken
	| VirtualToken

export type RawToken = Readonly<{
	type: RawTokenDefinition,
	content: string,
	span: Span,
}>
export type VirtualToken = Readonly<{
	type: VirtualTokenDefinition,
} & Pick<Span, 'index' | 'line' | 'column'>>

const StateTransform = Enum({
	Push: variant<() => State>(),
	Pop: empty(),
})
type StateTransform = Enum<typeof StateTransform> | undefined

export type TokenDefinition =
	| RawTokenDefinition
	| VirtualTokenDefinition
export type RawTokenDefinition = Readonly<{
	type: 'Token',
	name: string,
	regex: RegExp,
	state_transform?: StateTransform,
	ignore?: true,
	is_virtual: false,
}>
export type VirtualTokenDefinition = Readonly<{
	type: 'Token',
	name: string,
	virtual_lexer: VirtualLexerClass,
	// state_transform?: StateTransform,
	is_virtual: true,
}>

export function VirtualToken(name: string, state_transform?: StateTransform): VirtualTokenDefinition {
	const token_definition = { type: 'Token', is_virtual: true } as VirtualTokenDefinition
	if (state_transform !== undefined)
		(token_definition as any).state_transform = state_transform
	return token_definition
}

export type TokenOptions = {
	ignore?: true,
	state_transform?: StateTransform,
}
export type BaseTokenSpec = RegExp | string | (RegExp | string)[]
export type TokenSpec = BaseTokenSpec | { match: BaseTokenSpec } & TokenOptions

function source_regex(def: RegExp | string) {
	return typeof def === 'string'
		? def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
		: def.source
}

export function Token(
	name: string,
	regex: RegExp | string | (RegExp | string)[],
	{ ignore, state_transform } = {} as TokenOptions,
): RawTokenDefinition {
	const base_source = Array.isArray(regex)
		? regex.map(r => `(?:${source_regex(r)})`).join('|')
		: source_regex(regex)
	const token_definition = { type: 'Token', name, regex: new RegExp('^' + base_source), is_virtual: false } as RawTokenDefinition

	if (ignore !== undefined)
		(token_definition as any).ignore = ignore
	if (state_transform !== undefined)
		(token_definition as any).state_transform = state_transform
	return token_definition
}
// type Token = ReturnType<typeof Token>

function denature_spec(spec: TokenSpec): [BaseTokenSpec, TokenOptions] {
	if (typeof spec === 'object' && 'match' in spec) {
		const { match, ...options } = spec
		return [match, options]
	}
	return [spec, {}]
}


// type State = {
// 	tokens: RawTokenDefinition[],
// 	virtual_lexer?: VirtualLexer,
// }

interface VirtualLexerClass<V extends VirtualLexer, A extends any[]> {
	readonly concerned_manifest: readonly RawTokenDefinition[]
	readonly virtual_manifest: readonly VirtualTokenDefinition[]
	new(...args: A): V
}
interface VirtualLexer {
	process(tok: RawToken): [VirtualToken[], StateTransform]
	exit(): VirtualToken[]
}

// type LexerState<D extends Dict<TokenSpec>> = {
// 	virtual_lexer?: [],
// 	tokens: { [K in keyof D]: RawTokenDefinition },
// }

type LexerState<D extends Dict<TokenSpec>> = { [K in keyof D]: RawTokenDefinition }

export function state<D extends Dict<TokenSpec>>(
	token_definitions: D,
	// virtual_lexer?: VirtualLexerClass,
): LexerState<D> {
	const give = {} as LexerState<D>
	for (const key in token_definitions) {
		const [regex, options] = denature_spec(token_definitions[key])
		give[key] = Token(key, regex, options)
	}

	return give
}


// export function lexer<M extends Dict<TokenSpec>, S extends Dict<Dict<TokenSpec>>>(
// 	main: M, states: S,
// ): LexerState<M> & { [K in keyof S]: LexerState<S[K]> } {
// 	//
// }


// %strstart = '`', push: #lit
// %ident = /\w+/,
// %lbrace = '{', push: #main
// %rbrace =   '}', pop: true
// %colon = ':'
// #{ %indent, %deindent, %newline, %raw_block_begin, #{ %raw_block_content,  } } = &significant_whitespace_raw_block('|"')

// #lit =
// 	%interp = '${', push: #main
// 	%escape = /\\./
// 	%strend = '`', pop: true
// 	%str = '/(?:[^$`]|\\$(?!\\{))+/'

// const {
// 	main: { strstart, ident, lbrace, rbrace, colon, indent, deindent, newline, raw_block_begin },
// 	raw_block: { interp, escape, strend, str, raw_block_end },
// } = lexer(
// 	state(
// 		{ strstart, ident, lbrace, rbrace, colon },
// 		IndentationLexer, sub_state('raw_block', RawBlock, state({ interp, escape, strend, str })),
// 	),
// )


export function match_token(token: Token | undefined, token_definition: TokenDefinition): boolean {
	if (token === undefined)
		return false

	switch (token.is_virtual) {
		case true:
			return token_definition.is_virtual && token.type === token_definition.name
		case false:
			return !token_definition.is_virtual && token.type.name === token_definition.name
	}
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


type LexerState = Readonly<{
	source: string, index: number,
	line: number, column: number,
}>

type NonEmpty<T> = [T, ...T[]]

type LexerCache = Readonly<{
	state: LexerState,
	saved_tokens: readonly NonEmpty<Token>,
}>

export const SourceFile = Data((source: string, filename?: string) => {
	return { type: 'SourceFile' as const, source, filename }
})
export type SourceFile = ReturnType<typeof SourceFile>

export const Span = Data((file: SourceFile, start: number, end: number) => {
	return { type: 'Span' as const, file, start, end }
})
export type Span = ReturnType<typeof Span>


export class BaseLexer {
	private buffer!: Token[]
	private state_stack!: State[]
	private source!: string
	constructor(...args: Parameters<BaseLexer['reset']>) {
		this.reset(...args)
	}

	reset(initial_state: State, source: string) {
		if (source.length === 0)
			throw new Error("created lexer with empty source")
		this.buffer = []
		this.state_stack = [initial_state]
		this.source = source
	}

	private source_file: SourceFile
	private state: LexerState
	private cache: LexerCache | undefined

	static attempt_token(
		{ source, index, line, column }: LexerState,
		token_definition: RawTokenDefinition,
		source_file: SourceFile,
	): [RawToken, LexerState] | undefined {
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
			span: { source_file, start: index, end: new_index, line, column },
		}
		const state = {
			source: source.slice(characters_consumed),
			index: new_index,
			line: new_line,
			column: new_column,
		}
		return t(token, state)
	}

	protected request(token_definitions: TokenDefinition[]): LexerCache | undefined {
		// request doesn't mutate anything, not even cache
		// it merely returns a possible cache candidate and lets the calling function decide what to do

		const { source_file } = this
		let state = { ...this.state }
		let buffered_virtual_tokens = [] as VirtualToken[]

		const tokens = [] as TokenDefinition[]
		for (const token_definition of token_definitions) {
			if (token_definition.is_virtual) {
				const attempt_from_cache = match_and_trim(buffered_virtual_tokens, [token_definition])
				if (attempt_from_cache !== undefined) {
					tokens.push({ type: token_definition } as VirtualTokenDefinition)
					buffered_virtual_tokens = attempt_from_cache
					continue
				}

				// TODO the truly right way to do this virtual_lexer nonsense is to have two varieties of involvement
				// these exposed virtual_tokens that you're playing with now
				// and "interest" hooks on normal raw tokens,
				// that specify a virtual_lexer that wants to be called whenever that token is requested and matched

				// and of course, the realization I'm having now is that the significant_whitespace_raw_block virtual lexer
				// should simply *contain* the raw_block state machine
				// the top level virtual_lexer should be the one notified when a raw_block_begin occurs,
				// and it will initialize the raw_block lexer and drive it

				// and of course, these virtual_lexers can have "hidden" raw tokens that are implied to be ignored,
				// but that they nonetheless contribute to the whole grammar
				// these are exposed in the form of these sequence tokens

				// the indentation lexer can signal interest in the space token,
				// and expose it for use?
				// I suppose it does make sense to have a token that is ignored but still can be explicitly requested
				// then it's both on the list of ignored, so that we can try for it whenever a request fails
				// but still explicitly request it at certain times


				// this also means that virtual_lexers should be resettable, we should be able to grab a state from them at the beginning
				// of this method, and return them to that state after we're done
				// it also could make sense to do that simply with the whole lexer, we grab the state at the beginning of this method
				// and restore to that when we're done

				// a virtual_token will have a sequence that needs to occur before it can process
				// what we can do is request that sequence
				const found_sequence = [] as RawToken[]
				for (const sequence_token_definition of token_definition.interest_sequence) {
					let attempt = BaseLexer.attempt_token(state, sequence_token_definition, source_file)
					// if we want to have "maybe" tokens in sequences *at the beginning of the sequence*
					// like we would if the indenation lexer wanted to signal interest in [newline, space, tab, space, any]
					// so that it could get mad whenever a space was encountered at the beginning of a line
					// then this block shouldn't break, but continue
					if (attempt === undefined)
						break

					const [token, new_state] = attempt
					found_sequence.push(token)
					state = new_state
				}

				// then pass it possibly incomplete into the virtual_lexer (this is to handle "maybe" tokens in the sequence)
				// then it returns a list of virtual tokens
				const virtual_tokens = token_definition.virtual_lexer.process(found_sequence)
				// we attempt to pull what we're looking for from that list,
				const remaining_virtual_tokens = match_and_trim(virtual_tokens, [token_definition])

				// if we don't find what we need, we return undefined and fail
				if (remaining_virtual_tokens === undefined)
					return undefined

				// if we do find what we need, we push what was requested into our return list
				tokens.push({ type: token_definition } as VirtualTokenDefinition)
				// and cache the rest, those might fail in the future
				buffered_virtual_tokens = remaining_virtual_tokens
				continue
			}

			if (buffered_virtual_tokens.length > 0)
				return undefined

			// TODO go through list of ignored tokens

			const attempt = BaseLexer.attempt_token(state, token_definition, source_file)
			if (attempt === undefined)
				return undefined
			const [token, new_state] = attempt
			state = new_state

			// here is where we would check if there's an interested virtual_lexer

			if (token_definition.ignore)
				continue

			tokens.push(token)
		}

		return {
			state: { source, index, line, column },
			saved_tokens: tokens,
		}
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
			if (!match_tokens(saved_tokens, token_definitions))
				return undefined

			this.cache = undefined
			this.state = state
			return saved_tokens
		}

		const cache = this.request(token_definitions)
		if (cache === undefined)
			return undefined
		const { saved_tokens, state } = cache
		this.state = state
		return saved_tokens
	}



	// advance(count: number): Token[] {
	// 	if (count <= 0) throw new Error(`advance can't be called with a non positive whole number: ${count}`)

	// 	// this.current_token_index += count
	// 	// you have to do something with this.buffer.length here

	// 	const tokens = this.peek(count)
	// 	this.buffer.splice(0, count)
	// 	return tokens
	// }

	// peek(count: number): Token[] {
	// 	if (count <= 0) throw new Error(`you can't look a non positive whole number count: ${count}`)

	// 	while (this.buffer.length < count) {
	// 		const tokens = this.next()
	// 		if (tokens.length === 0)
	// 			break
	// 		this.buffer.push_all(tokens)
	// 	}

	// 	return this.buffer.slice(0, count)
	// }

	// private next(): Token[] {
	// 	if (this.source.length === 0)
	// 		return []

	// 	const output_tokens = [] as Token[]

	// 	const current_state = this.state_stack[this.state_stack.length - 1]
	// 	if (!current_state)
	// 		throw new Error("popped too many times")

	// 	const { tokens: token_definitions, virtual_lexer } = current_state

	// 	let token_definitions_to_check = token_definitions.slice()
	// 	while (token_definitions_to_check.length > 0) {
	// 		if (this.source.length === 0) {
	// 			while (this.state_stack.length > 0) {
	// 				const { virtual_lexer } = this.state_stack.pop()!
	// 				if (virtual_lexer) {
	// 					const virtual_tokens = virtual_lexer.exit()
	// 					output_tokens.push_all(virtual_tokens)
	// 				}
	// 			}

	// 			return output_tokens
	// 		}

	// 		const token_definition = token_definitions_to_check.pop()!

	// 		const match = this.source.match(token_definition.regex)
	// 		if (match === null)
	// 			continue

	// 		const content = match[0]
	// 		this.source = this.source.slice(content.length)

	// 		const matched_token: RawToken = { type: token_definition, content, is_virtual: false }

	// 		let virtual_transform = undefined as StateTransform
	// 		if (virtual_lexer) {
	// 			const [virtual_tokens, state_transform] = virtual_lexer.process(matched_token)
	// 			virtual_transform = state_transform
	// 			output_tokens.push_all(virtual_tokens)
	// 		}

	// 		if (virtual_transform && token_definition.state_transform)
	// 			throw new Error("both the virtual_lexer and the token_definition had a state_transform")

	// 		const state_transform = virtual_transform || token_definition.state_transform

	// 		if (state_transform)
	// 			state_transform.match({
	// 				Push: next_state => {
	// 					this.state_stack.push(next_state())
	// 				},
	// 				Pop: () => {
	// 					if (virtual_lexer) {
	// 						const virtual_tokens = virtual_lexer.exit()
	// 						output_tokens.push_all(virtual_tokens)
	// 					}
	// 					this.state_stack.pop()
	// 				},
	// 			})

	// 		if (token_definition.ignore && output_tokens.length === 0) {
	// 			token_definitions_to_check = token_definitions.slice()
	// 			continue
	// 		}
	// 		if (!token_definition.ignore)
	// 			output_tokens.push(matched_token)

	// 		return output_tokens
	// 	}

	// 	throw new Error("didn't match any tokens, unexpected")
	// }
}


// const IndentationLexerState = Enum({
// 	Normal: empty(),
// 	LastNewline: empty(),
// 	LastTab: variant<number>(),
// })
// type IndentationLexerState = Enum<typeof IndentationLexerState>

// class SpacesError extends Error { constructor() { super("spaces are not allowed at the beginning of lines") } }

// function produce_deindents(count: number): VirtualToken[] {
// 	if (count === 0)
// 		return [{ is_virtual: true, type: 'indent_continue' }]
// 	return Array
// 		.from({ length: count })
// 		.map(() => ({ is_virtual: true, type: 'deindent' }))
// }

// const empty_process = t([] as VirtualToken[], undefined as StateTransform)

// export class IndentationLexer implements VirtualLexer {
// 	// readonly manifest: readonly VirtualTokenDefinition[] = []

// 	private current_indentation: number
// 	// we start in this because an indent at this point is nonsensical
// 	private state = IndentationLexerState.LastNewline() as IndentationLexerState

// 	constructor(starting_indentation?: number) {
// 		this.current_indentation = starting_indentation || 0
// 	}

// 	readonly raw_block_transform = StateTransform.Push(() => ({
// 		tokens: [
// 			def('newline', /\n+/),
// 			def('tab', /\t/),
// 			def('space', / +/),
// 			def('str', /.+/),
// 			// def('interpolation_start', '${', StateTransform.Push(() => ({
// 			// 	// except you need to remove a lot of the whitespace ones
// 			// 	tokens: default_state_tokens.concat(),
// 			// 	// newlines aren't allowed in interpolation
// 			// }))),
// 		],
// 		virtual_lexer: new RawBlock(this.current_indentation),
// 	}))


// 	process(tok: RawToken): [VirtualToken[], StateTransform] {
// 		const type = tok.type.name

// 		if (type === 'newline') {
// 			this.state = IndentationLexerState.LastNewline()
// 			return empty_process
// 		}
// 		if (type === 'tab' && !this.state.matches('LastTab')) {
// 			this.state = IndentationLexerState.LastTab(tok.content.length)
// 			return empty_process
// 		}

// 		const [must_new_state, state_transform] = type === 'raw_block_start'
// 			? t(IndentationLexerState.LastNewline(), this.raw_block_transform)
// 			: t(undefined, undefined)

// 		return this.state.match({
// 			Normal: () => {
// 				this.state = must_new_state || IndentationLexerState.LastNewline()
// 				return t([], this.raw_block_transform)
// 			},

// 			LastNewline: () => {
// 				if (type === 'space')
// 					throw new SpacesError()

// 				// if it's just a normal token, then deindent
// 				const virtual_tokens = produce_deindents(this.current_indentation)
// 				this.current_indentation = 0
// 				this.state = must_new_state || IndentationLexerState.Normal()
// 				return t(virtual_tokens, state_transform)
// 			},

// 			LastTab: tab_size => {
// 				if (type === 'space')
// 					throw new SpacesError()
// 				if (type === 'tab')
// 					throw new Error("zuh??")

// 				const new_indentation = tab_size
// 				const current_indentation = this.current_indentation
// 				if (new_indentation > current_indentation + 1)
// 					throw new Error("indentation can only increase by one")

// 				this.state = must_new_state || IndentationLexerState.Normal()
// 				this.current_indentation = new_indentation

// 				if (new_indentation === current_indentation + 1)
// 					return t([{ is_virtual: true, type: 'indent' }], state_transform)

// 				if (new_indentation === current_indentation)
// 					return t([{ is_virtual: true, type: 'indent_continue' }], state_transform)

// 				const virtual_tokens = produce_deindents(current_indentation - new_indentation)
// 				return t(virtual_tokens, state_transform)
// 			},
// 		})
// 	}

// 	exit(): VirtualToken[] {
// 		const virtual_tokens = produce_deindents(this.current_indentation)
// 		this.current_indentation = 0
// 		return virtual_tokens
// 	}
// }


// export class RawBlock implements VirtualLexer {
// 	private state = IndentationLexerState.LastNewline() as IndentationLexerState
// 	readonly block_indentation: number
// 	constructor(program_indentation_at_entry: number) {
// 		this.block_indentation = program_indentation_at_entry + 1
// 	}

// 	process(tok: RawToken): [VirtualToken[], StateTransform] {
// 		const type = tok.type.name

// 		if (type === 'newline') {
// 			this.state = IndentationLexerState.LastNewline()
// 			return empty_process
// 		}
// 		if (type === 'tab' && !this.state.matches('LastTab')) {
// 			this.state = IndentationLexerState.LastTab(1)
// 			return empty_process
// 		}

// 		return this.state.match({
// 			Normal: () => {
// 				return empty_process
// 			},
// 			LastNewline: () => {
// 				if (type === 'space')
// 					throw new SpacesError()

// 				// by definition the indentation reset to 0, so the raw_block must be over
// 				this.state = IndentationLexerState.Normal()
// 				return t([{ is_virtual: true, type: 'raw_block_end' } as VirtualToken], StateTransform.Pop())
// 			},
// 			LastTab: tab_count => {
// 				const fulfilled_indentation = tab_count >= this.block_indentation
// 				if (fulfilled_indentation) {
// 					// we got to the minimum, so now anything goes
// 					this.state = IndentationLexerState.Normal()
// 					return empty_process
// 				}

// 				if (type === 'tab') {
// 					this.state = IndentationLexerState.LastTab(tab_count + 1)
// 					return empty_process
// 				}

// 				const exiting_raw_block = !fulfilled_indentation
// 				if (type === 'space' && exiting_raw_block)
// 					throw new SpacesError()

// 				this.state = IndentationLexerState.Normal()
// 				return t([], exiting_raw_block ? StateTransform.Pop() : undefined)
// 			},
// 		})
// 	}

// 	exit(): VirtualToken[] {
// 		return []
// 	}
// }


// const source = `\
// a
// 	b
// 	c
// 		d
// 	e
// 		f
// 			g
// 	a

// z
// b
// 	c`

// const default_state_tokens = [
// 	def('newline', /\n+/),
// 	def('tab', /\t+/),
// 	def('space', / +/),
// 	def('ident', /[a-z]+/),
// 	// def('raw_block_start', '|"'),
// ]

// const default_state: State = {
// 	tokens: default_state_tokens,
// 	virtual_lexer: new IndentationLexer(),
// }

// const lexer = new BaseLexer(default_state, source)

// let tok
// while (tok = lexer.next()) {
// 	switch (tok.is_virtual) {
// 		case true:
// 			console.log(tok.type)
// 			continue
// 		case false:
// 			console.log(tok.type.name, tok.content)
// 			continue
// 	}
// }
