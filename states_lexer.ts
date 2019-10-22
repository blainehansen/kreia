import { Dict } from '@ts-std/types'
import { Enum, empty, variant } from '@ts-std/enum'

type Token = {
	type: TokenDefinition,
	content: string,
	is_virtual: false,
}

type VirtualToken = {
	type: string,
	is_virtual: true,
	pop_current?: true,
}

const StateTransform = Enum({
	Push: variant<() => State>(),
	Pop: empty(),
	None: empty(),
})
type StateTransform = Enum<typeof StateTransform>

type TokenDefinition = {
	name: string,
	regex: RegExp,
	state_transform: StateTransform,
}

type State = {
	tokens: TokenDefinition[],
	virtual_lexers: VirtualLexer[],
}

interface VirtualLexer {
	process(tok: Token): VirtualToken[]
	exit(): Overwrite<VirtualToken, { pop_current: undefined }>[]
}

function exhaustive(): never {
	throw new Error()
}

// const LexerState = Enum({
// 	Holding: variant<Token[]>(),
// 	Empty: empty(),
// })
// type LexerState = Enum<typeof LexerState>

class BaseLexer {
	private state_stack: State[]
	constructor(
		readonly default_state: () => State,
		readonly states: Dict<() => State>,
		private source: string,
	) {
		this.state_stack = [default_state()]
	}


	next() {
		const { source, state_stack } = this
		if (source.length === 0) return

		const output_tokens = [] as Token[]
		const current_state = state_stack[state_stack.length - 1]
		if (!current_state)
			throw new Error("popped too many times")

		for (const token_definition of current_state.tokens) {
			const match = source.match(token_definition.regex)
			if (match === null) continue

			const content = match[0]
			const token = { type: token_definition, content, is_virtual: false }
			output_tokens.push(token)

			// allow all virtual lexers to process
			// one of them may tell us to pop state
			let virtual_popped = false
			for (const virtual_lexer of current_state.virtual_lexers) {
				const virtual_tokens = virtual_lexer.process(token)
				virtual_popped = virtual_popped || virtual_tokens.some(v => v.pop_current)
				// if (virtual_popped && any) throw new Error("more than one popped")
				Array.prototype.push.apply(output_tokens, virtual_tokens)
			}

			// if (virtual_popped && token_definition.state_transform.matches('Push'))
			if (virtual_popped && token_definition.state_transform.key === 'Push')
				throw new Error("a virtual popped and the matched token said to push")

			const state_transform = virtual_popped
				? StateTransform.Pop()
				: token_definition.state_transform

			// actually handle state transformations
			state_transform.match({
				Push: next_state => {
					this.state_stack.push(next_state())
				},
				Pop: () => {
					for (const virtual_lexer of current_state.virtual_lexers) {
						const virtual_tokens = virtual_lexer.exit()
						// if (virtual_tokens.any(v => v.pop_current)) throw new Error()
						Array.prototype.push.apply(output_tokens, virtual_tokens)
					}
					this.state_stack.pop()
				},
				None: () => {},
			})

			// trim internal source
			this.source = source.slice(content.length)

			// return output
			return output_tokens
		}

		if (this.source.length === 0) return
		// throw new Error("didn't match any tokens, unexpected")
	}
}


const IndentationLexerState = Enum({
	Normal: empty(),
	LastNewline: empty(),
	LastTab: variant<number>(),
})
type IndentationLexerState = Enum<typeof IndentationLexerState>

function produce_deindents(count: number) {
	return Array
		.from({ length: count })
		.map(() => ({ is_virtual: true, type: 'deindent' }))
}

class IndentationLexer implements VirtualLexer {
	// we start in this because an indent at this point is nonsensical
	private current_indentation = 0
	private state = IndentationLexerState.LastNewline()

	process(tok: Token) {
		const type = tok.type.name

		return this.state.match({
			Normal: () => {
				if (type === 'newline')
					this.state = IndentationLexerState.LastNewline()
				return []
			},

			LastNewline: () => {
				if (type === 'space')
					throw new Error("spaces are not allowed at the beginning of lines")
				if (type === 'tab') {
					this.state = IndentationLexerState.LastTab(tok.content.length)
					return []
				}
				if (type === 'newline') {
					this.state = IndentationLexerState.LastNewline()
					return []
				}

				// if it's just a normal token, then deindent
				this.current_indentation = 0
				return produce_deindents(this.current_indentation)
			},

			LastTab: tab_size => {
				if (type === 'space')
					throw new Error("spaces are not allowed at the beginning of lines")
				if (type === 'tab')
					throw new Error("zuh??")
				if (type === 'newline') {
					this.state = IndentationLexerState.LastNewline()
					return []
				}

				const new_indentation = tab_size
				const current_indentation = this.current_indentation
				if (new_indentation > current_indentation + 1)
					throw new Error("indentation can only increase by one")

				if (new_indentation === current_indentation + 1) {
					this.state = IndentationLexerState.Normal()
					return [{ is_virtual: true, type: 'indent' }]
				}
				if (new_indentation === current_indentation) {
					this.state = IndentationLexerState.Normal()
					return [{ is_virtual: true, type: 'indent_continue' }]
				}

				return produce_deindents(current_indentation - new_indentation)
			},
		})
	}
}


const RawBlockState = Enum({
	EnteringMustNewline: empty(),
	// EnteringMustFirstIndent: empty(),
	Normal: empty(),
	LastNewline: empty(),
	LastTab: empty(),
})
type RawBlockState = Enum<typeof RawBlockState>

class RawBlock implements VirtualLexer {
	private state = RawBlockState.EnteringMustNewline()
	readonly block_indentation: number
	constructor(program_indentation_at_entry: number) {
		this.block_indentation = program_indentation_at_entry + 1
	}

	process(tok: Token) {
		const type = tok.type.name
		const { state } = this

		// if we are in normal, last_was_newline, entering_must_have_first_indent, or last_was_tab
		// then we could possibly emit a pop_current
		// if (!['space', 'tab', 'newline'].includes(type) && !state.key.matches('EnteringMustNewline'))
		if (!['space', 'tab', 'newline'].includes(type) && state.key !== 'EnteringMustNewline')
			return [{ is_virtual: true, type: 'raw_block_end', pop_current: true }]

		return state.match({
			EnteringMustNewline: () => {
				if (type !== 'newline')
					throw new Error("some token other than a newline came after a RawBlock began")
				// this.state = RawBlockState.EnteringMustFirstIndent()
				this.state = RawBlockState.Normal()
				return []
			},
			// EnteringMustFirstIndent: () => {
			// 	if (type === 'newline')
			// 		return []
			// 	if (type !== 'tab')
			// 		throw new Error("raw blocks must begin with an indent")
			// 	if (this.block_indentation !== tok.content.length)
			// 		throw new Error("an incorrect amount of indentation appeared")
			// 	this.state = RawBlockState.Normal()
			// 	return []
			// },
			Normal: () => {
				if (type === 'tab') {
					this.state = RawBlockState.LastTab()
					return [{ is_virtual: true, type: 'raw_block_indent_adjust', adjustment: tok.content.length }]
				}
				if (type === 'newline') {
					this.state = RawBlockState.LastNewline()
					return []
				}
				return []
			},
			LastNewline: () => {
				if (type === 'tab') {
					this.state = RawBlockState.LastTab()
					return [{ is_virtual: true, type: 'raw_block_' }]
				}
				if (type === 'newline') {
					this.state = RawBlockState.LastNewline()
					return []
				}
				return []
			},
			LastTab: () => {
				if (type === 'tab') {
					this.state = RawBlockState.LastTab()
					return [{ is_virtual: true, type: 'raw_block_indent_adjust', adjustment: tok.content.length }]
				}
				if (type === 'newline') {
					this.state = RawBlockState.LastNewline()
					return []
				}
				return []
			},
		})
	}
}
