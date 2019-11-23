import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { UserToken, HiddenToken, VirtualToken, ExposedToken } from './lexer'
import {
	SpacesError, produce_deindents, make_indents,
	space, newline, tab, exposed_space, whitespace_sequence,
} from './IndentationLexer'


const indent = VirtualToken('indent', 'IndentationLexerWithRawBlock', whitespace_sequence, /[^\W]/)
const deindent = VirtualToken('deindent', 'IndentationLexerWithRawBlock', whitespace_sequence, /[^\W]/)
const indent_continue = VirtualToken('indent_continue', 'IndentationLexerWithRawBlock', whitespace_sequence, /[^\W]/)

const block_tab = HiddenToken('block_tab', /\t/)
const block_sequence = [newline, space, block_tab, space]
const raw_block_begin = ExposedToken('raw_block_begin', 'IndentationLexerWithRawBlock', '|"')
const raw_block_end = VirtualToken('raw_block_end', 'IndentationLexerWithRawBlock', whitespace_sequence, /[^\W]/)

const exposed_space = ExposedToken('space', 'IndentationLexerWithRawBlock', { match: / +/, ignore: true })
const exposed_literal = ExposedToken('block_literal', 'IndentationLexerWithRawBlock', /\n+\t+[ \t]*[^\n]/)

type IndentationState = { in_block: boolean, indentation: number, last_illegal_spaces: boolean }

// export const IndentationLexerWithRawBlock: VirtualLexer<IndentationState, [RegExp | string]> = {
export const IndentationLexerWithRawBlock: VirtualLexer<IndentationState> = {
	// use(block_begin: RegExp | string) {
	use() {
		return [indent, deindent, indent_continue, exposed_space, exposed_literal, raw_block_begin, raw_block_end]
	},
	initialize() {
		return { in_block: false, indentation: 0, last_illegal_spaces: true }
	},
	process(sequence, lookahead_matched, { in_block, indentation, last_illegal_spaces }, lexer_state) {
		// actually you need to compare the old and new size
		// this is only invalid if the first was a newline
		if (sequence.length === 4 || sequence.length === 3 && sequence[0].type.name === 'newline')
			throw new SpacesError()

		if (!lookahead_matched)
			return t([], {
				indentation: state.indentation,
				last_illegal_spaces: sequence.length > 0,
			})

		if (in_block) {
			return
		}

		if (sequence.length === 1) {
			const [tok] = sequence

			if (tok.type.name === 'newline')
				return t(produce_deindents(state.indentation, lexer_state), { indentation: 0, last_illegal_spaces: true })

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
		else if (token.type.name === 'raw_block_begin') {
			if (state.in_block)
				throw new Error("can't begin a raw block while already inside a raw block")
			return t([], { indentation: state.indentation + 1, in_block: true, last_illegal_spaces: true })
		}

		return t([], state)
	},
	exit(state, lexer_state) {
		// if (state.in_block)
		// 	raw_block_end
		// return produce_deindents(state.indentation, lexer_state)
	},
}
