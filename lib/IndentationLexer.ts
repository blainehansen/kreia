import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Lexer, VirtualLexer, UserToken, HiddenToken, VirtualToken, ExposedToken } from './lexer'

const name = UserToken('name', /[a-z]+/)

export const space = HiddenToken('space', / +/)
export const newline = HiddenToken('newline', /[\t ]*\n+/)
export const tab = HiddenToken('tab', /\t+/)
export const whitespace_sequence = [newline, space, tab, space]

// to make this catch spaces, we could do [newline, space, tab, space]
// then in `process` we filter out any space tokens from the found_sequence,
// and if we successfully remove any, we throw SpacesError
// this means the existing algorithm stays the exact same

// export const indent = VirtualToken('indent', 'IndentationLexer', [newline, tab], /[^\W]/)
// export const deindent = VirtualToken('deindent', 'IndentationLexer', [newline, tab], /[^\W]/)
// export const indent_continue = VirtualToken('indent_continue', 'IndentationLexer', [newline, tab], /[^\W]/)
const any_non_whitespace = /^[^\W]/
export const indent = VirtualToken('indent', 'IndentationLexer', whitespace_sequence, /[^\W]/)
export const deindent = VirtualToken('deindent', 'IndentationLexer', whitespace_sequence, /[^\W]/)
export const indent_continue = VirtualToken('indent_continue', 'IndentationLexer', whitespace_sequence, /[^\W]/)

export const exposed_space = ExposedToken('space', 'IndentationLexer', { match: / +/, ignore: true })


export class SpacesError extends Error { constructor() { super("spaces are not allowed at the beginning of lines") } }

// type IndentationState = { indentation: number, last_illegal_spaces: boolean }

export const IndentationLexer: VirtualLexer<number> = {
	use() {
		return [indent, deindent, indent_continue, exposed_space]
	},
	initialize() {
		return { indentation: 0, last_illegal_spaces: true }
	},
	// process(found_sequence, lookahead_matched, state, lexer_state) {
	request(_virtual_requested, current_indentation, input_lexer_state, file) {
		let lexer_state = input_lexer_state
		const tokens = [] as (HiddenToken | VirtualToken)[]
		let attempt

		// attempt to lex newline, if nothing return empty
		attempt = Lexer.attempt_token(newline, lexer_state, file)
		if (attempt === undefined)
			return undefined
		tokens.push(attempt[0])
		lexer_state = attempt[1]

		// attempt to lex space, fail if you do
		attempt = Lexer.attempt_token(space, lexer_state, file)
		if (attempt !== undefined)
			throw new SpacesError()

		// attempt to lex an optional tab
		attempt = Lexer.attempt_token(tab, lexer_state, file)
		if (attempt !== undefined) {
			tokens.push(attempt[0])
			lexer_state = attempt[1]
		}
		const indentation = attempt?.[0].content.length || 0

		// attempt to lex space, fail if you do
		attempt = Lexer.attempt_token(space, lexer_state, file)
		if (attempt !== undefined)
			throw new SpacesError()

		if (!any_non_whitespace.test(lexer_state.source) && lexer_state.source.length !== 0)
			return undefined

		lexer_state.virtual_lexers.IndentationLexer!.state = current_indentation

		return t(make_indents(indentation, current_indentation, lexer_state), lexer_state)




		if (found_sequence.length > 2)
			throw SpacesError()

		if (!lookahead_matched)
			return t([], {
				indentation: state.indentation,
				last_illegal_spaces: found_sequence.length > 0,
			})

		const sequence = found_sequence.filter(token => token.type.name !== 'space')

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
