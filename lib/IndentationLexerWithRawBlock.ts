import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import {
	Lexer, SourceState, VirtualLexer, make_regex, ContentVirtualToken,
	UserToken, HiddenToken, VirtualToken, ExposedToken, VirtualTokenDefinition, ExposedTokenDefinition,
} from './lexer'
import {
	IndentationLexer, IndentationState, make_indents,
	any_non_whitespace, indent, deindent, indent_continue, tab,
} from './IndentationLexer'

const need_tab_tester = make_regex(/\t/)

const block_tab = HiddenToken('block_tab', /\t/)
const raw_block_begin = ExposedToken('raw_block_begin', 'IndentationLexer', /\|\"\n/)
const raw_block_content = VirtualToken('raw_block_content', 'IndentationLexer', [/[^\n]*\n+/, /[^\n]+\n*/])
const raw_block_end = VirtualToken('raw_block_end', 'IndentationLexer')


type IndentationStateWithRawBlock =
	| { in_block: false, indentation_state: IndentationState }
	| { in_block: true, block_indentation: number }


type Toks = {
	indent: VirtualTokenDefinition, deindent: VirtualTokenDefinition, indent_continue: VirtualTokenDefinition,
	raw_block_begin: ExposedTokenDefinition, raw_block_content: VirtualTokenDefinition, raw_block_end: VirtualTokenDefinition,
}
export const IndentationLexerWithRawBlock: VirtualLexer<IndentationStateWithRawBlock, Toks> = {
	use() {
		return { indent, deindent, indent_continue, raw_block_begin, raw_block_content, raw_block_end }
	},
	initialize() {
		return { in_block: false, indentation_state: { type: 'unbuffered', indentation: 0 } }
	},
	request(virtual_requested, state, input_source_state, file) {
		if (!state.in_block) {
			if (virtual_requested.name === 'raw_block_end' || virtual_requested.name === 'raw_block_content')
				return undefined

			const request_attempt = IndentationLexer.request(virtual_requested, state.indentation_state, input_source_state, file)
			if (request_attempt === undefined)
				return undefined
			const [hidden_tokens, virtual_token, indentation_state, new_source_state] = request_attempt
			return t(hidden_tokens, virtual_token, { in_block: false as const, indentation_state }, new_source_state)
		}

		let source_state = input_source_state
		const hidden_tokens = [] as HiddenToken[]

		if (virtual_requested.name === 'raw_block_end') {
			const tab_attempt = Lexer.attempt_token(tab, source_state, file)
			if (tab_attempt !== undefined) {
				hidden_tokens.push(tab_attempt[0])
				source_state = tab_attempt[1]
			}

			if (!any_non_whitespace.test(source_state.source) && source_state.source.length !== 0)
				return undefined

			const new_indentation = tab_attempt !== undefined ? tab_attempt[0].content.length : 0
			if (new_indentation >= state.block_indentation)
				return undefined

			const { line, column, index } = source_state
			const span = { line, column, index }
			const created_raw_block_end = { is_virtual: true, type: raw_block_end, span } as VirtualToken

			if (new_indentation === state.block_indentation - 1) {
				const indentation_state: IndentationState = { type: 'unbuffered', indentation: new_indentation }
				return t(hidden_tokens, created_raw_block_end, { in_block: false as const, indentation_state }, source_state)
			}

			const indentation_state: IndentationState =
				{ type: 'buffered', buffer: make_indents(new_indentation, state.block_indentation - 1, source_state) }
			return t(hidden_tokens, created_raw_block_end, { in_block: false as const, indentation_state }, source_state)
		}

		// else this must be a 'raw_block_content'
		if (virtual_requested.name !== 'raw_block_content')
			throw new Error()

		// in this form, without any interpolation, we have to require a newline before a raw_block_content
		// but with interpolation we'll have to save state that records whether we stopped in the middle of a line
		// for an interpolation or not

		if (need_tab_tester.test(source_state.source) && source_state.source.length !== 0) {
			// we lex the amount of indentation required for this block
			let discovered_indentation = 0
			while (discovered_indentation < state.block_indentation) {
				const attempt = Lexer.attempt_token(block_tab, source_state, file)
				if (attempt === undefined)
					return undefined
				hidden_tokens.push(attempt[0])
				source_state = attempt[1]
				discovered_indentation++
			}
		}

		// now we simply lex the content, which is basically anything
		const attempt = Lexer.attempt_regex(raw_block_content.regex, source_state, file)
		if (attempt === undefined)
			return undefined
		const raw_block_content_token = {
			type: raw_block_content,
			is_virtual: true,
			content: attempt[0],
			span: attempt[1],
		} as VirtualToken

		return t(hidden_tokens, raw_block_content_token, state, attempt[2])
	},
	notify(token, state) {
		if (token.type.name !== 'raw_block_begin')
			return state

		if (state.in_block)
			throw new Error("attempted to enter a raw block while already inside a raw block")

		const { indentation_state } = state
		if (indentation_state.type === 'buffered')
			throw new Error("attempted to enter a raw block while indentation hadn't been consumed")

		return { in_block: true as const, block_indentation: indentation_state.indentation + 1 }
	},
}
