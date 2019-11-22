import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { UserToken, HiddenToken, VirtualToken, ExposedToken } from './lexer'
import { SpacesError, produce_deindents, make_indents, newline, tab, exposed_space } from './IndentationLexer'

export const indent = VirtualToken('indent', 'IndentationLexerWithRawBlock', [newline, tab], /[^\W]/)
export const deindent = VirtualToken('deindent', 'IndentationLexerWithRawBlock', [newline, tab], /[^\W]/)
export const indent_continue = VirtualToken('indent_continue', 'IndentationLexerWithRawBlock', [newline, tab], /[^\W]/)

export const exposed_space = ExposedToken('space', 'IndentationLexerWithRawBlock', { match: / +/, ignore: true })

const single_tab = HiddenToken('single_tab', /\t/)

export const IndentationLexerWithRawBlock: VirtualLexer<IndentationState> = {
	use() {
		return [indent, deindent, indent_continue, exposed_space]
	},
	initialize() {
		return { indentation: 0, last_illegal_spaces: true }
	},
	process(sequence, lookahead_matched, state, lexer_state) {
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
