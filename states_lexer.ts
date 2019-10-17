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

type StateTransform =
	| { sigil: 'push', next_state: () => State }
	| { sigil: 'pop' }
	| { sigil: 'none' }

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

class BaseLexer {
	constructor(
		readonly default_state: () => State,
		readonly states: { [state_name: string]: () => State },
	) {
		this.state_stack = [default_state()]
	}

	private state_stack: State[]

	private source?: string
	reset(source: string) {
		this.source = source
	}

	next() {
		const source = this.source
		if (source === undefined) throw new Error("")
		if (source.length === 0) return

		const output_tokens = [] as Token[]
		const current_state = this.state_stack.last()
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
				virtual_popped = virtual_popped || virtual_tokens.any(v => v.pop_current)
				// if (virtual_popped && any) throw new Error("more than one popped")
				Array.prototype.push.apply(output_tokens, virtual_tokens)
			}

			if (virtual_popped && token_definition.state_transform.sigil === 'push')
				throw new Error("a virtual popped and the matched token said to push")

			const state_transform: StateTransform = virtual_popped
				? { sigil: 'pop' }
				: token_definition.state_transform.sigil

			// actually handle state transformations
			switch (state_transform.sigil) {
				case 'push':
					this.state_stack.push(state_transform.next_state())
					break

				case 'pop':
					for (const virtual_lexer of current_state.virtual_lexers) {
						const virtual_tokens = virtual_lexer.exit()
						// if (virtual_tokens.any(v => v.pop_current)) throw new Error()
						Array.prototype.push.apply(output_tokens, virtual_tokens)
					}
					this.state_stack.pop()
					break

				case 'none':
					break

				default:
					return exhaustive()
			}

			// trim internal source
			const length = content.length
			this.source = source.slice(length)

			// return output
			return output_tokens
		}

		if (source.length === 0) return
		// throw new Error("didn't match any tokens, unexpected")
	}
}



type IndentationLexerState =
	| { sigil: 'normal' }
	// on the lookout for indents
	| { sigil: 'last_was_newline' }
	// this takes in single large tabs
	| { sigil: 'last_was_tab', tab_size: number }

function produce_deindents(count: number) {
	return Array
		.from({ length: count })
		.map(() => ({ is_virtual: true, type: 'deindent' }))
}

class IndentationLexer implements VirtualLexer {
	// we start in this because an indent at this point is nonsensical
	private current_indentation = 0
	private state: IndentationLexerState = { sigil: 'last_was_newline' }

	process(tok: Token) {
		const type = tok.type.name

		switch (this.state.sigil) {
			case 'normal':
				if (type === 'newline') {
					this.state = { sigil: 'last_was_newline' }
					return []
				}
				// both tabs and spaces are ignored if they're after a normal token
				return []

			case 'last_was_newline':
				if (type === 'space')
					throw new Error("spaces are not allowed at the beginning of lines")

				if (type === 'tab') {
					this.state = { sigil: 'last_was_tab', tab_size: tok.content.length }
					return []
				}
				if (type === 'newline') {
					this.state = { sigil: 'last_was_newline' }
					return []
				}
				// if it's just a normal token, then deindent
				const deindents = produce_deindents(this.current_indentation)
				this.current_indentation = 0
				return deindents

			case 'last_was_tab':
				if (type === 'space')
					throw new Error("spaces are not allowed at the beginning of lines")
				if (type === 'tab')
					throw new Error("zuh??")
				if (type === 'newline') {
					this.state = { sigil: 'last_was_newline' }
					return []
				}

				const new_indentation = this.state.tab_size
				const current_indentation = this.current_indentation
				if (new_indentation > current_indentation + 1)
					throw new Error("indentation can only increase by one")

				if (new_indentation === current_indentation + 1)
					return [{ is_virtual: true, type: 'indent' }]

				if (new_indentation === current_indentation)
					return [{ is_virtual: true, type: 'indent_continue' }]

				return produce_deindents(current_indentation - new_indentation)
		}
	}
}



type RawBlockState =
	| { sigil: 'entering_must_have_newline' }
	| { sigil: 'entering_must_have_first_indent' }
	| { sigil: 'normal' }
	| { sigil: 'last_was_newline' }
	| { sigil: 'last_was_tab' }

class RawBlock implements VirtualLexer {
	private state: RawBlockState = { sigil: 'entering_must_have_newline' }
	readonly block_indentation: number
	constructor(program_indentation_at_entry: number) {
		this.block_indentation = program_indentation_at_entry + 1
	}

	process(tok: Token) {
		const type = tok.type.name
		const { state, block_indentation } = this

		// if we are in normal, last_was_newline, entering_must_have_first_indent, or last_was_tab
		// then we could possibly emit a pop_current
		if (!['space', 'tab', 'newline'].includes(type) && state.sigil !== 'entering_must_have_newline')
			return [{ is_virtual: true, type: 'raw_block_end', pop_current: true, }]

		switch (state.sigil) {
			case 'entering_must_have_newline':
				if (type !== 'newline')
					throw new Error("some token other than a newline came after a RawBlock began")
				this.state = { sigil: 'entering_must_have_first_indent' }
				return []

			case 'entering_must_have_first_indent':
				if (type !== 'tab' || tok.content.length nh)
					throw new Error("an incorrect amount of indentation appeared")
				break

			case 'normal':
				break

			case 'last_was_newline':
				break

			case 'last_was_tab':
				break
		}
	}
}
