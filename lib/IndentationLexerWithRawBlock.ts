import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Lexer, LexerState, VirtualLexer, UserToken, HiddenToken, VirtualToken, ExposedToken, make_regex } from './lexer'
import {
	IndentationLexer, IndentationState, make_indents,
	indent, deindent, indent_continue,
	space, newline, tab, exposed_space, whitespace_sequence,
} from './IndentationLexer'

const need_tab_tester = make_regex(/\t/)

const block_tab = HiddenToken('block_tab', /\t/)
const raw_block_begin = ExposedToken('raw_block_begin', 'IndentationLexer', /\|\"\n/)
const raw_block_content = VirtualToken('raw_block_content', 'IndentationLexer', /[^\n]*\n+/)
const raw_block_end = VirtualToken('raw_block_end', 'IndentationLexer')


type IndentationStateWithRawBlock =
	| { in_block: false, indentation_state: IndentationState }
	| { in_block: true, block_indentation: number, must_newline: boolean }


export const IndentationLexerWithRawBlock: VirtualLexer<IndentationStateWithRawBlock> = {
	use() {
		return [indent, deindent, indent_continue, raw_block_begin, raw_block_content, raw_block_end]
	},
	initialize() {
		return { in_block: false, indentation_state: { type: 'unbuffered', indentation: 0 } }
	},
	request(virtual_requested, state, input_lexer_state, file) {
		if (!state.in_block) {
			if (virtual_requested.type.name === 'raw_block_end' || virtual_requested.type.name === 'raw_block_content')
				return undefined

			const request_attempt = IndentationLexer.request(virtual_requested, state.indentation_state, input_lexer_state, file)
			if (request_attempt === undefined)
				return undefined
			const [hidden_tokens, virtual_token, indentation_state, new_source_state] = request_attempt
			return t(hidden_tokens, virtual_token, { in_block: false, indentation_state }, new_source_state)
		}

		let lexer_state = input_lexer_state
		const hidden_tokens = [] as HiddenToken[]

		if (virtual_requested.type.name === 'raw_block_end') {
			// this will attempt to lex a tab
			// it will look at the size of the tab, and if it's less than the block indentation,
			// it will issue the raw_block_end along with the newline and tab
			const tab_attempt = Lexer.attempt_token(tab, lexer_state, file)
			if (tab_attempt !== undefined) {
				hidden_tokens.push(tab_attempt[0])
				lexer_state = tab_attempt[1]
			}

			if (!any_non_whitespace.test(lexer_state.source) && lexer_state.source.length !== 0)
				return undefined

			const new_indentation = tab_attempt !== undefined ? tab_attempt[0].content.length : 0
			if (new_indentation >= state.block_indentation)
				return undefined

			make_indents(new_indentation, state.block_indentation - 1)

			lexer_state = Lexer.patch_virtual_lexer_state(
				lexer_state, 'IndentationLexer',
				{ in_block: false, indentation_state: { type: 'unbuffered', indentation: new_indentation } }
			)

			const { line, column, index } = lexer_state
			const span = { line, column, index }

			return t(hidden_tokens, { is_virtual: true, type: raw_block_end, span }, lexer_state, new_source_state)
		}

		// else this must be a 'raw_block_content'
		if (virtual_requested.type.name !== 'raw_block_content')
			throw new Error()

		// in this form, without any interpolation, we have to require a newline before a raw_block_content
		// but with interpolation we'll have to save state that records whether we stopped in the middle of a line
		// for an interpolation or not

		if (need_tab_tester.test(lexer_state.source) && lexer_state.source.length !== 0) {
			// we lex the amount of indentation required for this block
			let discovered_indentation = 0
			while (discovered_indentation < state.block_indentation) {
				const attempt = Lexer.attempt_token(block_tab, lexer_state, file)
				if (attempt === undefined)
					return undefined
				hidden_tokens.push(attempt[0])
				lexer_state = attempt[1]
				discovered_indentation++
			}
		}

		// now we simply lex the content, which is basically anything
		const attempt = Lexer.attempt_token(raw_block_content, lexer_state, file)
		if (attempt === undefined)
			return undefined

		return t(hidden_tokens, attempt[0], attempt[1])
	},
	notify(token, state) {
		if (token.type.name !== 'raw_block_begin')
			return state

		if (state.in_block)
			throw new Error("attempted to enter a raw block while already inside a raw block")

		const { indentation_state } = state
		if (indentation_state.type === 'buffered')
			throw new Error("attempted to enter a raw block while indentation hadn't been consumed")

		return { in_block: true, block_indentation: indentation_state.indentation + 1, must_newline: true }
	},
}


// const name = UserToken('name', /[a-z]+/)

// const source = `\
// a
// 	b

// a
// a
// 	b
// 		c
// 		c
// 			d
// 	b
// 		c`

// const lexer = new Lexer({ IndentationLexerWithRawBlock }, source)

// console.log(lexer.require([
// 	name, indent, name, deindent,
// 	name, indent_continue, name,
// 	indent, name, indent, name, indent_continue, name,
// 	indent, name, deindent, deindent,
// 	name, indent, name,
// 	deindent, deindent,
// ]))

// console.log(lexer.test([name, indent_continue]))
// console.log(lexer.test([name, indent]))
