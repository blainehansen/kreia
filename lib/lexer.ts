import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Enum, empty, variant } from '@ts-std/enum'


type UserRawTokenDefinition = {
	type: 'Token',
	name: string,
	regex: RegExp,
	ignore?: true,
	is_virtual: false,
}
type ExposedRawTokenDefinition = UserRawTokenDefinition & {
	virtual_lexer_name: string,
}

type HiddenTokenDefinition =
	Pick<UserRawTokenDefinition, 'name' | 'regex' | 'is_virtual'>
	& { ignore: true }

type VirtualTokenDefinition = {
	type: 'Token',
	name: string,
	virtual_lexer_name: string,
	sequence: readonly HiddenTokenDefinition[],
	lookahead_regex?: RegExp,
	is_virtual: true,
}


type RawTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition

type TestableTokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| HiddenTokenDefinition

type TokenDefinition =
	| UserRawTokenDefinition
	| ExposedRawTokenDefinition
	| VirtualTokenDefinition



type SourceFile = Readonly<{
	source: string, filename?: string,
}>

type Span = Readonly<{
	file: SourceFile, start: number, end: number, line: number, column: number,
}>

type RawToken = {
	type: UserRawTokenDefinition | ExposedRawTokenDefinition,
	content: string,
	is_virtual: false,
	span: Span,
}
type HiddenToken = {
	type: HiddenTokenDefinition,
	content: string,
	is_virtual: false,
	span: Span,
}
type VirtualToken = {
	type: VirtualTokenDefinition,
	is_virtual: true,
	span: Pick<Span, 'line' | 'column'> & { index: number },
}

type Token =
	| RawToken
	| VirtualToken

type VirtualLexer<S> = {
	// use(...args: unknown[]): (ExposedRawTokenDefinition | VirtualTokenDefinition)[],
	use(): (ExposedRawTokenDefinition | VirtualTokenDefinition)[],
	initialize(): S,
	process(sequence: HiddenToken[], lookahead_matched: boolean, state: S, lexer_state: LexerState<Dict<unknown>>): [VirtualToken[], S],
	process_interest(token: RawToken, state: S, lexer_state: LexerState<Dict<unknown>>): [VirtualToken[], S],
	exit(state: S, lexer_state: LexerState<Dict<unknown>>): VirtualToken[],
}

type VirtualLexerDict<V extends Dict<any>> =
	{ [K in keyof V]: V[K] }

type VirtualLexerState<S> =
	{ readonly virtual_lexer: VirtualLexer<S>, state: S }

type VirtualLexerStateDict<V extends Dict<any>> = {
	[K in keyof V]: VirtualLexerState<V[K]>
}


// type SimpleLexerState = {
// 	index: number, line: number, column: number,
// }

type LexerState<V extends Dict<any>> = Readonly<{
	source: string, index: number,
	line: number, column: number,
	virtual_lexers: VirtualLexerStateDict<V>,
}>

type NonEmpty<T> = [T, ...T[]]

type LexerCache<V extends Dict<any>> = Readonly<{
	state: LexerState<V>,
	saved_tokens: NonEmpty<Token>,
}>


class Lexer<V extends Dict<any>> {
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

	static attempt_token<V extends Dict<any>, T extends TestableTokenDefinition>(
		{ source, index, line, column, virtual_lexers }: LexerState<V>,
		token_definition: T,
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
		let buffered_virtual_tokens = [] as VirtualToken[]

		const tokens = [] as Token[]
		for (const token_definition of token_definitions) {
			console.log(token_definition.name)

			if (token_definition.is_virtual) {
				// try to grab from any already output virtual tokens
				const attempt_from_cache = match_and_trim(buffered_virtual_tokens, [token_definition])
				if (attempt_from_cache !== undefined) {
					tokens.push({ type: token_definition } as VirtualToken)
					buffered_virtual_tokens = attempt_from_cache as unknown as VirtualToken[]
					continue
				}

				// otherwise, actually try to pull the thing out
				const found_sequence = [] as HiddenToken[]
				for (const sequence_token_definition of token_definition.sequence) {
					let attempt = Lexer.attempt_token(state, sequence_token_definition, file)
					if (attempt === undefined)
						continue

					const [token, new_state] = attempt
					found_sequence.push(token as HiddenToken)
					state = new_state
				}

				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]

				// console.log(found_sequence)
				const [virtual_tokens, new_virtual_lexer_state] = virtual_lexer.process(
					found_sequence,
					token_definition.lookahead_regex ? token_definition.lookahead_regex.test(state.source) : false,
					virtual_lexer_state,
					state,
				)
				console.log(virtual_tokens)

				const remaining_virtual_tokens = match_and_trim(virtual_tokens, [token_definition])
				if (remaining_virtual_tokens === undefined)
					return undefined

				tokens.push({ type: token_definition } as VirtualToken)
				state = {
					...state,
					virtual_lexers: {
						...state.virtual_lexers,
						[token_definition.virtual_lexer_name]: { virtual_lexer, state: new_virtual_lexer_state },
					},
				}
				buffered_virtual_tokens = remaining_virtual_tokens as unknown as VirtualToken[]
				continue
			}

			if (buffered_virtual_tokens.length > 0)
				return undefined

			// go through list of ignored tokens
			for (const ignored_token_definition of this.ignored_token_definitions) {
				if (ignored_token_definition.name === token_definition.name)
					continue

				const attempt = Lexer.attempt_token(state, ignored_token_definition, file)
				if (attempt === undefined)
					continue
				const [, new_state] = attempt
				state = new_state
			}

			const attempt = Lexer.attempt_token(state, token_definition, file)
			if (attempt === undefined)
				return undefined
			const [token, new_state] = attempt
			console.log(token)
			state = new_state

			// here is where we would check if there's an interested virtual_lexer
			if ('virtual_lexer_name' in token_definition) {
				const { virtual_lexer, state: virtual_lexer_state } = state.virtual_lexers[token_definition.virtual_lexer_name]
				const [virtual_tokens, new_virtual_lexer_state] = virtual_lexer.process_interest(token, virtual_lexer_state, state)
				state = {
					...state,
					virtual_lexers: {
						...state.virtual_lexers,
						[token_definition.virtual_lexer_name]: { virtual_lexer, state: new_virtual_lexer_state },
					},
				}
				tokens.push_all(virtual_tokens)
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
			// if (!match_tokens(saved_tokens, token_definitions))
			// 	return undefined
			if (match_tokens(saved_tokens, token_definitions)) {
				this.cache = undefined
				this.state = state
				return saved_tokens
			}

			// this.cache = undefined
			// this.state = state
			// return saved_tokens
		}

		const cache = this.request(token_definitions)
		if (cache === undefined)
			return undefined
		const { saved_tokens, state } = cache
		this.state = state
		return saved_tokens
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



const n = {
	type: 'Token',
	name: 'n',
	regex: /[a-z]+/,
	is_virtual: false,
} as UserRawTokenDefinition

const space = {
	name: 'space',
	regex: / +/,
	ignore: true,
	is_virtual: false,
} as HiddenTokenDefinition
const newline = {
	name: 'newline',
	regex: /[\t ]*\n+/,
	ignore: true,
	is_virtual: false,
} as HiddenTokenDefinition
const tab = {
	name: 'tab',
	regex: /\t+/,
	ignore: true,
	is_virtual: false,
} as HiddenTokenDefinition
const single_tab = {
	name: 'single_tab',
	regex: /\t/,
	ignore: true,
	is_virtual: false,
} as HiddenTokenDefinition

const indent = {
	type: 'Token',
	name: 'indent',
	virtual_lexer_name: 'IndentationLexer',
	sequence: [newline, tab],
	lookahead_regex: /[^\W]/,
	is_virtual: true,
} as VirtualTokenDefinition
const deindent = {
	type: 'Token',
	name: 'deindent',
	virtual_lexer_name: 'IndentationLexer',
	sequence: [newline, tab],
	lookahead_regex: /[^\W]/,
	is_virtual: true,
} as VirtualTokenDefinition
const indent_continue = {
	type: 'Token',
	name: 'indent_continue',
	virtual_lexer_name: 'IndentationLexer',
	sequence: [newline, tab],
	lookahead_regex: /[^\W]/,
	is_virtual: true,
} as VirtualTokenDefinition
const exposed_space = {
	type: 'Token',
	name: 'space',
	virtual_lexer_name: 'IndentationLexer',
	regex: / +/,
	ignore: true,
	is_virtual: false,
} as ExposedRawTokenDefinition

class SpacesError extends Error { constructor() { super("spaces are not allowed at the beginning of lines") } }

type IndentationState = { indentation: number, last_illegal_spaces: boolean }

const IndentationLexer: VirtualLexer<IndentationState> = {
	use() {
		return [indent, deindent, indent_continue, exposed_space]
	},
	initialize() {
		return { indentation: 0, last_illegal_spaces: true }
	},
	process(sequence, lookahead_matched, state, lexer_state) {
		console.log(sequence)
		console.log(state)
		if (!lookahead_matched)
			return t([], {
				indentation: state.indentation,
				last_illegal_spaces: sequence.length > 0,
			})

		if (sequence.length === 1) {
			const [tok] = sequence

			if (tok.type.name === 'newline')
				return t(produce_deindents(state.indentation, lexer_state), { indentation: 0, last_illegal_spaces: false })

			if (tok.type.name === 'tab')
				return make_indents(tok.content.length, state.indentation, lexer_state)

			throw new Error()
		}
		if (sequence.length === 2) {
			const [, tok] = sequence
			return make_indents(tok.content.length, state.indentation, lexer_state)
		}

		return t([], state)
	},
	process_interest(token, state, lexer_state) {
		if (token.type.name === 'space' && state.last_illegal_spaces)
			throw new SpacesError()
		return t([], state)
	},
	exit(state, lexer_state) {
		return produce_deindents(state.indentation, lexer_state)
	},
}


function produce_deindents(count: number, { line, column, index }: LexerState<Dict<unknown>>): VirtualToken[] {
	const span = { index, line, column }

	if (count === 0)
		return [{ is_virtual: true, type: indent_continue, span }]
	return Array
		.from({ length: count })
		.map(() => ({ is_virtual: true, type: deindent, span }))
}


function make_indents(
	new_indentation: number,
	current_indentation: number,
	lexer_state: LexerState<Dict<unknown>>,
): [VirtualToken[], IndentationState] {
	if (new_indentation > current_indentation + 1)
		throw new Error("indentation can only increase by one")

	const { line, column, index } = lexer_state
	const span = { index, line, column }
	const state = { indentation: new_indentation, last_illegal_spaces: false }

	if (new_indentation === current_indentation + 1)
		return t([{ is_virtual: true, type: indent, span }], state)

	if (new_indentation === current_indentation)
		return t([{ is_virtual: true, type: indent_continue, span }], state)

	const virtual_tokens = produce_deindents(current_indentation - new_indentation, lexer_state)
	return t(virtual_tokens, state)
}


const source = `\
a
	b

a
a
	b
		c
		c
			d
	b
		c`

const lexer = new Lexer({ IndentationLexer }, source)

// test
// require

const a = lexer.require([n, indent, n, deindent, n, indent_continue, n])
console.log(a)
