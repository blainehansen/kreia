import { Parser, ParseArg, Decidable, path, branch, c } from "../index"
import { IndentationLexer } from "../virtual_lexers/IndentationLexer"

export const { tok, reset, lock, consume, maybe, or, maybe_or, many_or, maybe_many_or, many, maybe_many, exit } = Parser({
	var_name: /\$\w+/,
	token_name: /\:\w+/,
	locked_name: /\!\w+/,
	rule_name: /\w+/,
	macro_name: /\@\w+/,
	modifier_token: ["*", "+", "?"],
	repetitions_modifier: /{\d+(,\d*)?}/,
	space: { match: / +/, ignore: true },
	comment: { match: /\s*\/\/[^\n]*\n+/, ignore: true },
	character_class: /\^?\[(?:\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[ftnrv]|\\]|\\\\|[\x20-\x5B\x5E-\x7E])+\]/,
	character_class_name: /\^?\#\w+/,
	str: [/"(?:\\["\\]|[^\n"\\])*"/, /'(?:\\['\\]|[^\n'\\])*'/],
	use_keyword: "use",
	eq: "=",
	bar: "|",
	comma: ",",
	dash: "-",
	caret: "^",
	underscore: "_",
	open_angle: "<",
	close_angle: ">",
	open_paren: "(",
	close_paren: ")",
	open_brace: "{",
	close_brace: "}",
	open_bracket: "[",
	close_bracket: "]"
}, { IndentationLexer: IndentationLexer() })

const { _7jjmO, _MM3H4, _Z1Bz2H0, _Z2t6uuV, _1EWJ7s, _17Yeup, _7U1Cw, _NFQGh, _6PPJc, _Z1owlnn, _Z1F9dGs, _MHu6X, _Z1tSeaR, _Nf9Ed, _2dw1N, _1cWbFl, _2eTKEs, _fw7Qu } = {
	_7jjmO: path([tok.token_name]),
	_MM3H4: path([tok.open_brace]),
	_Z1Bz2H0: path([tok.macro_name]),
	_Z2t6uuV: path([tok.rule_name]),
	_1EWJ7s: path([tok.indent_continue], branch(path([tok.token_name]), path([tok.open_brace]), path([tok.macro_name]), path([tok.rule_name]))),
	_17Yeup: path([tok.space], branch(path([tok.character_class]), path([tok.character_class_name]), path([tok.token_name]), path([tok.str]), path([tok.open_paren]))),
	_7U1Cw: path([tok.space]),
	_NFQGh: path([tok.open_paren]),
	_6PPJc: path([tok.comma]),
	_Z1owlnn: path([tok.indent]),
	_Z1F9dGs: path([tok.indent_continue]),
	_MHu6X: path([tok.open_angle]),
	_Z1tSeaR: path([tok.var_name]),
	_Nf9Ed: branch(path([tok.bar]), path([tok.modifier_token])),
	_2dw1N: path([tok.modifier_token]),
	_1cWbFl: branch(path([tok.rule_name]), path([tok.token_name]), path([tok.var_name]), path([tok.locked_name]), path([tok.macro_name]), path([tok.open_paren])),
	_2eTKEs: path([tok.space], branch(path([tok.rule_name]), path([tok.token_name]), path([tok.var_name]), path([tok.locked_name]), path([tok.macro_name]), path([tok.open_paren]))),
	_fw7Qu: path([tok.locked_name])
}

export function kreia_grammar() {
	maybe(tok.indent_continue)
	many_separated(() => {
		or(c(token_definition, _7jjmO), c(virtual_lexer_usage, _MM3H4), c(macro_definition, _Z1Bz2H0), c(rule_definition, _Z2t6uuV))
	}, () => {
		consume(tok.indent_continue)
	}, _1EWJ7s)
	maybe(tok.indent_continue)
}

export function token_definition() {
	consume(tok.token_name, tok.space)
	maybe(tok.underscore)
	consume(tok.eq, tok.space)
	token_specification()
}

export function token_specification() {
	many_separated(() => {
		space_sep(() => {
			token_atom()
		}, _17Yeup)
	}, () => {
		consume(tok.space, tok.bar, tok.space)
	}, _7U1Cw)
}

export function token_atom() {
	or(c(tok.character_class), c(tok.character_class_name), c(tok.token_name), c(tok.str), c(() => {
		consume(tok.open_paren)
		token_specification()
		consume(tok.close_paren)
	}, _NFQGh))
	maybe_or(c(tok.modifier_token), c(tok.repetitions_modifier))
}

export function virtual_lexer_usage() {
	consume(tok.open_brace)
	lines_block(() => {
		consume(tok.token_name)
	}, _7jjmO, _6PPJc, _Z1owlnn, _6PPJc, _Z1F9dGs, _6PPJc)
	consume(tok.close_brace, tok.space, tok.eq, tok.space, tok.use_keyword, tok.space, tok.str)
}

export function macro_definition() {
	consume(tok.macro_name)
	maybe(locking_definitions, _MHu6X)
	consume(tok.open_bracket)
	lines_block(() => {
		consume(tok.var_name)
	}, _Z1tSeaR, _6PPJc, _Z1owlnn, _6PPJc, _Z1F9dGs, _6PPJc)
	consume(tok.close_bracket)
	rule_block()
}

export function macro_call() {
	consume(tok.macro_name, tok.open_bracket)
	comma_sep(() => {
		simple_rule_line()
	}, _6PPJc)
	consume(tok.close_bracket)
}

export function rule_definition() {
	consume(tok.rule_name)
	maybe(locking_definitions, _MHu6X)
	rule_block()
}

export function rule_block() {
	consume(tok.space, tok.eq)
	diff_block(() => {
		consume(tok.space)
		simple_rule_line()
	}, () => {
		rule_item()
	}, _7U1Cw, _Z1owlnn, _Z1F9dGs)
}

export function rule_item() {
	or(c(() => {
		or(c(tok.bar), c(modifier, _2dw1N))
		diff_block(() => {
			consume(tok.space)
			simple_rule_line()
		}, () => {
			rule_item()
		}, _7U1Cw, _Z1owlnn, _Z1F9dGs)
	}, _Nf9Ed), c(simple_rule_line, _1cWbFl))
}

export function simple_rule_line() {
	many_separated(() => {
		space_sep(() => {
			rule_atom()
		}, _2eTKEs)
	}, () => {
		consume(tok.space, tok.bar, tok.space)
	}, _7U1Cw)
}

export function rule_atom() {
	or(c(tok.rule_name), c(tok.token_name), c(tok.var_name), c(tok.locked_name), c(macro_call, _Z1Bz2H0), c(() => {
		consume(tok.open_paren)
		block(() => {
			simple_rule_line()
		}, _1cWbFl, _Z1owlnn, _Z1F9dGs)
		consume(tok.close_paren)
	}, _NFQGh))
	maybe(modifier, _2dw1N)
}

export function locking_definitions() {
	consume(tok.open_angle)
	lines_block(() => {
		consume(tok.locked_name, tok.space, tok.eq, tok.space, tok.token_name)
	}, _fw7Qu, _6PPJc, _Z1owlnn, _6PPJc, _Z1F9dGs, _6PPJc)
	consume(tok.close_angle)
}

export function modifier() {
	consume(tok.modifier_token)
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

function diff_block<NOT_IN_INDENT extends ParseArg, IN_INDENT extends ParseArg>(not_in_indent: NOT_IN_INDENT, in_indent: IN_INDENT, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
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

function enclosed_diff_block<LINE_ITEM extends ParseArg>(line_item: LINE_ITEM, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
	or(c(() => {
		line_item()
	}, _d1), c(() => {
		consume(tok.indent)
		many_separated(line_item, () => {
			consume(tok.indent_continue)
		}, _d3)
		consume(tok.deindent, tok.indent_continue)
	}, _d2))
}

function block<BLOCK_LINE extends ParseArg>(block_line: BLOCK_LINE, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
	diff_block(block_line, block_line, _d1, _d2, _d3)
}

function lines_block<LINE_ITEM extends ParseArg>(line_item: LINE_ITEM, _d1: Decidable, _d2: Decidable, _d3: Decidable, _d4: Decidable, _d5: Decidable, _d6: Decidable) {
	enclosed_diff_block(() => {
		comma_sep(line_item, _d6)
	}, _d1, _d3, _d5)
}
