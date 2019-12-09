import { Parser, ParseArg, Decidable, path, branch, t, f } from "./index"
import { IndentationLexer } from "./IndentationLexer"

export const { tok, reset, exit, arg, maybe, consume, many, maybe_many, or, maybe_or, many_separated, maybe_many_separated } = Parser({
	rule_name: /\w+/,
	var_name: /\$\w+/,
	token_name: /\:\w+/,
	macro_name: /\@\w+/,
	locked_token: /\!\w+/,
	space: / +/,
	primitive: ["true"],
	str: [/"(?:\\["\\]|[^\n"\\])*"/, /'(?:\\['\\]|[^\n'\\])*'/],
	use_keyword: "use",
	at: "@",
	eq: "=",
	bar: "|",
	star: "*",
	plus: "+",
	maybe: "?",
	colon: ":",
	comma: ",",
	slash: "/",
	open_angle: "<",
	close_angle: ">",
	open_paren: "(",
	close_paren: ")",
	open_brace: "{",
	close_brace: "}",
	open_bracket: "[",
	close_bracket: "]"
}, { IndentationLexer: t(IndentationLexer, t()) })

const [_0, _1, _2, _3, _4, _5, _6, _7] = [path([tok.locked_token]), path(branch(path([tok.space]), path([tok.comma]))), path([tok.locked_token]), path([tok.locked_token]), path([tok.indent_continue]), path([tok.locked_token]), path(branch(path([tok.space]), path([tok.comma]))), path([tok.indent])]

export function _() {
	maybe(tok.space)
}

export function locking_definitions() {
	consume(tok.open_angle)

	or(f(() => {
		many_separated(f(() => {
			consume(tok.locked_token, tok.space, tok.eq, tok.space, tok.token_name)
		}, _0), f(() => {
			_()
			consume(tok.comma)
			_()
		}, _1))
	}, _2), f(() => {
		consume(tok.indent)

		many_separated(f(() => {
			many_separated(f(() => {
				consume(tok.locked_token, tok.space, tok.eq, tok.space, tok.token_name)
			}, _5), f(() => {
				_()
				consume(tok.comma)
				_()
			}, _6))
		}, _3), f(() => {
			consume(tok.indent_continue)
		}, _4))

		consume(tok.deindent)
	}, _7))

	consume(tok.close_angle)
}
