import '@ts-std/extensions/dist/array'
import { Dict, tuple as t } from '@ts-std/types'
import { Lexer, LexerState, VirtualLexer, UserToken, HiddenToken, VirtualToken, ExposedToken, make_regex } from './lexer'

const name = UserToken('name', /[a-z]+/)

export const newline = HiddenToken('newline', /[\t ]*\n+/)
export const tab = HiddenToken('tab', /\t+/)

const any_non_whitespace = make_regex(/[^\W]/)
export const indent = VirtualToken('indent', 'IndentationLexer')
export const deindent = VirtualToken('deindent', 'IndentationLexer')
export const indent_continue = VirtualToken('indent_continue', 'IndentationLexer')

type NonEmpty<T> = [T, ...T[]]

type IndentationState =
	| { type: 'buffered', buffer: NonEmpty<[number, VirtualToken]> }
	| { type: 'unbuffered', indentation: number }

export const IndentationLexer: VirtualLexer<IndentationState> = {
	use() {
		return [indent, deindent, indent_continue]
	},
	initialize() {
		return { type: 'unbuffered', indentation: 0 }
	},
	request(virtual_requested, state, input_lexer_state, file) {
		if (state.type === 'buffered') {
			const { buffer: [[new_indentation, virtual_token], ...remaining_buffer] } = state
			if (virtual_token.type.name !== virtual_requested.name)
				return undefined

			const lexer_state = Lexer.patch_virtual_lexer_state(
				input_lexer_state, 'IndentationLexer',
				remaining_buffer.length === 0
					? { type: 'unbuffered', indentation: new_indentation }
					: { type: 'buffered', buffer: remaining_buffer as NonEmpty<[number, VirtualToken]> }
			)

			return t([], virtual_token, lexer_state)
		}

		let lexer_state = input_lexer_state

		if (lexer_state.source.length === 0) {
			if (state.indentation === 0 || virtual_requested.name !== 'deindent')
				return undefined

			const [[new_indentation, virtual_token], ...remaining_buffer] = make_indents(0, state.indentation, lexer_state)
			if (virtual_token.type.name !== virtual_requested.name)
				return undefined

			lexer_state = Lexer.patch_virtual_lexer_state(
				input_lexer_state, 'IndentationLexer',
				remaining_buffer.length === 0
					? { type: 'unbuffered', indentation: new_indentation }
					: { type: 'buffered', buffer: remaining_buffer as NonEmpty<[number, VirtualToken]> },
			)

			return t([], virtual_token, lexer_state)
		}

		const current_indentation = state.indentation
		const hidden_tokens = [] as HiddenToken[]
		let attempt

		// attempt to lex newline, if nothing return empty
		attempt = Lexer.attempt_token(newline, lexer_state, file)
		if (attempt === undefined)
			return undefined
		hidden_tokens.push(attempt[0])
		lexer_state = attempt[1]

		// attempt to lex an optional tab
		attempt = Lexer.attempt_token(tab, lexer_state, file)
		if (attempt !== undefined) {
			hidden_tokens.push(attempt[0])
			lexer_state = attempt[1]
		}

		if (!any_non_whitespace.test(lexer_state.source) && lexer_state.source.length !== 0)
			return undefined

		const indentation = attempt !== undefined
			? attempt[0].content.length
			: 0
		const [[new_indentation, virtual_token], ...remaining_buffer] = make_indents(indentation, current_indentation, lexer_state)
		if (virtual_token.type.name !== virtual_requested.name)
			return undefined

		lexer_state = Lexer.patch_virtual_lexer_state(
			lexer_state, 'IndentationLexer',
			remaining_buffer.length === 0
				? { type: 'unbuffered', indentation: new_indentation }
				: { type: 'buffered', buffer: remaining_buffer as NonEmpty<[number, VirtualToken]> },
		)

		return t(hidden_tokens, virtual_token, lexer_state)
	},
	notify(_token, state) {
		return state
	},
}


// export function produce_deindents(
// 	count: number,
// 	{ line, column, index }: LexerState<Dict<unknown>>,
// ): NonEmpty<[number, VirtualToken]> {

// }


export function make_indents(
	new_indentation: number,
	current_indentation: number,
	lexer_state: LexerState<Dict<unknown>>,
): NonEmpty<[number, VirtualToken]> {
	if (new_indentation > current_indentation + 1)
		throw new Error("indentation can only increase by one")

	const { line, column, index } = lexer_state
	const span = { line, column, index }

	if (new_indentation === current_indentation + 1)
		return [t(new_indentation, { is_virtual: true, type: indent, span })]

	if (new_indentation === current_indentation)
		return [t(new_indentation, { is_virtual: true, type: indent_continue, span })]

	let indent_counter = current_indentation - 1
	const deindents = [t(indent_counter, { is_virtual: true, type: deindent, span })] as NonEmpty<[number, VirtualToken]>
	while (indent_counter > new_indentation) {
		indent_counter--
		deindents.push(t(indent_counter, { is_virtual: true, type: deindent, span }))
	}
	return deindents
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

// console.log(lexer.require([
// 	name, indent, name, deindent,
// 	name, indent_continue, name,
// 	indent, name, indent, name, indent_continue, name,
// 	indent, name, deindent, deindent,
// 	name, indent, name,
// 	deindent, deindent,
// ]))

console.log(lexer.test([name, indent_continue, name, deindent, name, indent_continue, name]))
console.log(lexer.test([name, indent, name, indent_continue, name, indent_continue, name]))
