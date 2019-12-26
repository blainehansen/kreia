import { Parser, ParseArg, Decidable, path, branch, c } from "../index"
import { IndentationLexer } from "../virtual_lexers/IndentationLexer"

export const { tok, reset, exit, maybe, consume, many, maybe_many, or, maybe_or } = Parser({
	var_name: /\$\w+/,
	token_name: /\:\w+/,
	locked_name: /\!\w+/,
	rule_name: /\w+/,
	macro_name: /\@\w+/,
	space: / +/,
	primitive: ["true"],
	str: [/"(?:\\["\\]|[^\n"\\])*"/, /'(?:\\['\\]|[^\n'\\])*'/],
	regex_source: /\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//,
	use_keyword: "use",
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
}, { IndentationLexer: IndentationLexer() })

const { _2c5xYB, _7U1Cw, _NFQGh, _5n64E } = {
	_2c5xYB: path([tok.space], branch(path([tok.token_name]), path([tok.var_name]), path([tok.locked_name]), path([tok.open_paren]))),
	_7U1Cw: path([tok.space]),
	_NFQGh: path([tok.open_paren]),
	_5n64E: path(branch(path([tok.plus]), path([tok.star]), path([tok.maybe])))
}

export function simple_rule_line() {
	many_separated(() => {
		space_sep(() => {
			rule_atom()
		}, _2c5xYB)
	}, () => {
		consume(tok.space, tok.bar, tok.space)
	}, _7U1Cw)
}

export function rule_atom() {
	or(c(tok.token_name), c(tok.var_name), c(tok.locked_name), c(() => {
		consume(tok.open_paren)
		simple_rule_line()
		consume(tok.close_paren)
	}, _NFQGh))
	maybe(modifier, _5n64E)
}

export function modifier() {
	or(c(tok.plus), c(tok.star), c(tok.maybe))
}

function many_separated<BODY extends ParseArg, SEPARATOR extends ParseArg>(body: BODY, separator: SEPARATOR, _d1: Decidable) {
	body()
	maybe_many(() => {
		separator()
		body()
	}, _d1)
}

function comma_sep<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
	many_separated(body, () => {
		consume(tok.comma, tok.space)
	}, _d1)
}

function space_sep<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
	many_separated(body, () => {
		consume(tok.space)
	}, _d1)
}

function diff_block<IN_INDENT extends ParseArg, NOT_IN_INDENT extends ParseArg>(in_indent: IN_INDENT, not_in_indent: NOT_IN_INDENT, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
	or(c(() => {
		not_in_indent()
	}, _d1), c(() => {
		consume(tok.indent)
		many_separated(in_indent, () => {
			consume(tok.indent_continue)
		}, _d3)
		consume(tok.deindent)
	}, _d2))
}

function block<BLOCK_LINE extends ParseArg>(block_line: BLOCK_LINE, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
	diff_block(block_line, block_line, _d1, _d2, _d3)
}
