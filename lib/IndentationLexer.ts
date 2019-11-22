import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { UserToken, HiddenToken, VirtualToken, ExposedToken } from './lexer'

const name = UserToken('name', /[a-z]+/)

// const space = HiddenToken('space', / +/)
export const newline = HiddenToken('newline', /[\t ]*\n+/)
export const tab = HiddenToken('tab', /\t+/)

export const indent = VirtualToken('indent', 'IndentationLexer', [newline, tab], /[^\W]/)
export const deindent = VirtualToken('deindent', 'IndentationLexer', [newline, tab], /[^\W]/)
export const indent_continue = VirtualToken('indent_continue', 'IndentationLexer', [newline, tab], /[^\W]/)

export const exposed_space = ExposedToken('space', 'IndentationLexer', { match: / +/, ignore: true })


export class SpacesError extends Error { constructor() { super("spaces are not allowed at the beginning of lines") } }

type IndentationState = { indentation: number, last_illegal_spaces: boolean }

export const IndentationLexer: VirtualLexer<IndentationState> = {
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


export function produce_deindents(count: number, { line, column, index }: LexerState<Dict<unknown>>): VirtualToken[] {
	const span = { index, line, column }

	if (count === 0)
		return [{ is_virtual: true, type: indent_continue, span }]
	return Array
		.from({ length: count })
		.map(() => ({ is_virtual: true, type: deindent, span }))
}


export function make_indents(
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


// const source = `\
// a
//  	b

// a
// a
// 	b
// 		c
// 		c
// 			d
// 	b
// 		c`

// const lexer = new Lexer({ IndentationLexer }, source)

// console.log(lexer.require([name, indent, name]))

// console.log(lexer.test([name, indent_continue, name, deindent, name, indent_continue, name]))
// console.log(lexer.test([name, indent, name, indent_continue, name, indent_continue, name]))
