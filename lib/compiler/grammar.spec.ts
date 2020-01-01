import 'mocha'
import { expect } from 'chai'

import {
	reset, exit,
	tok,
	kreia_grammar,
	rule_block, rule_item, rule_definition, macro_definition,
	token_definition, token_specification, token_atom,
	virtual_lexer_usage, macro_call,
	locking_definitions, simple_rule_line, rule_atom,
} from './grammar'
import { print_grammar } from './render_codegen'
import { boil_string } from './render.spec'

function parse(fn: () => any, input: string) {
	reset(input)
	fn()
	exit()
}
function parse_give<R>(fn: () => R, input: string): R {
	reset(input)
	const result = fn()
	exit()
	return result
}

function bad(fn: () => any, input: string) {
	reset(input)
	expect(fn).throw()
}
function incomplete(fn: () => any, input: string) {
	reset(input)
	fn()
	expect(exit).throw()
}


describe('character_class regex', () => it('works', () => {
	for (const char of `!@#$%^&*()_-+={[}|:;"'<>,.?/\`~1234567890azAZ `) {
		expect(tok.character_class.regex.test(`[${char}]`)).eql(true)
		expect(tok.character_class.regex.test(`^[${char}]`)).eql(true)
	}
	expect(tok.character_class.regex.test(`[\\]]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\]]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\\\]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\\\]`)).eql(true)

	for (const mod of `ftnrv`) {
		expect(tok.character_class.regex.test(`[\\${mod}]`)).eql(true)
		expect(tok.character_class.regex.test(`^[\\${mod}]`)).eql(true)
	}
	expect(tok.character_class.regex.test(`[\x07]`)).eql(false)
	expect(tok.character_class.regex.test(`[\f]`)).eql(false)
	expect(tok.character_class.regex.test(`[\t]`)).eql(false)
	expect(tok.character_class.regex.test(`[\n]`)).eql(false)
	expect(tok.character_class.regex.test(`[\r]`)).eql(false)
	expect(tok.character_class.regex.test(`[\v]`)).eql(false)

	expect(tok.character_class.regex.test(`[we]`)).eql(true)

	expect(tok.character_class.regex.test(`[\\x0F]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\xAa]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\x0F]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\xAa]`)).eql(true)

	expect(tok.character_class.regex.test(`[\\x4]`)).eql(false)
	expect(tok.character_class.regex.test(`[\\xnm]`)).eql(false)

	expect(tok.character_class.regex.test(`[\\u{Aa}]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\u{A}]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\u{a}]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\u{053FDEA}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\u{Aa}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\u{A}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\u{a}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\u{053FDEA}]`)).eql(true)

	expect(tok.character_class.regex.test(`[\\u{z}]`)).eql(false)
	expect(tok.character_class.regex.test(`[\\u{Z}]`)).eql(false)


	expect(tok.character_class.regex.test(`["\]\\\\]`)).eql(true)
	expect(tok.character_class.regex.test(`["\\\\]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\n"\\\\]`)).eql(true)
	expect(tok.character_class.regex.test(`[1-6a-f\\xFF\\u{FF}-\\u{5577}]`)).eql(true)
	expect(tok.character_class.regex.test(`[\\x9d-\\u{FF33}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\x9d-\\u{FF33}]`)).eql(true)
	expect(tok.character_class.regex.test(`^[\\x9d-\\u{FF33}]`)).eql(true)
}))

describe('token_atom', () => it('works', () => {
	parse(token_atom, `["\\]\\\\]`)
	incomplete(token_atom, `["]\\]`)
	incomplete(token_atom, `["]\\\\]`)
	parse(token_atom, `'a'`)
	parse(token_atom, `'a'?`)
	parse(token_atom, `'a'{3,5}`)
	parse(token_atom, `^[a]`)
	parse(token_atom, `[\\x9d]`)
	// parse(token_atom, `'\\x9d'`)
	parse(token_atom, `[a-Z]`)
	parse(token_atom, `^[a-Z]`)
	parse(token_atom, `[\\x9d-\\u{FF33}]`)
	parse(token_atom, `[\\x9d-\\u{FF33}]+`)
	parse(token_atom, `[\\x9d-\\u{FF33}]{2}`)
	parse(token_atom, `[\\x9d-\\u{FF33}]{6,}`)
	parse(token_atom, `[\\x9d-\\u{FF33}]{6,9}`)
	parse(token_atom, `^[\\x9d-\\u{FF33}]`)
	parse(token_atom, `^[\\x9d-\\u{FF33}]`)
	bad(token_atom, `^'a'`)

	parse(token_atom, `#something`)
	parse(token_atom, `^#something`)

	parse(token_atom, `:some_token`)
	bad(token_atom, `^:some_token`)

	parse(token_atom, `"stuff"`)
	parse(token_atom, `"different sdlkfjasdk ;;;%%"`)
	bad(token_atom, `^"different sdlkfjasdk ;;;%%"`)

	parse(token_atom, `([a-z] :something | ^#whitespace)*`)
	parse(token_atom, `(^[a-z] :something | ^#whitespace){3}`)
}))


const token_specification_single_range = `[a-z]`
const token_specification_range_concat_string = `[a-z] "span"`
const token_specification_range_header = `'h' [1-6]`
const token_specification_concat_token = `'$' :identifier{5}`
const token_specification_concat_token_or_range = `'$' :identifier{4} | '_' [a-z]+ :something?`
const token_specification_concat_token_or_range_paren = `'$' :identifier | '_' (^[a-z]* #dudes | ^#whitespace) :something{4,}`

describe('token_specification', () => it('works', () => {
	parse(token_specification, token_specification_single_range)
	parse(token_specification, token_specification_range_concat_string)
	parse(token_specification, token_specification_range_header)
	parse(token_specification, token_specification_concat_token)
	parse(token_specification, token_specification_concat_token_or_range)
	parse(token_specification, token_specification_concat_token_or_range_paren)
}))


describe('token_definition', () => it('works', () => {
	parse(token_definition, ':yoyo = ' + token_specification_single_range)
	parse(token_definition, ':yoyo = ' + token_specification_range_concat_string)
	parse(token_definition, ':yoyo = ' + token_specification_range_header)
	parse(token_definition, ':yoyo = ' + token_specification_concat_token)
	parse(token_definition, ':yoyo = ' + token_specification_concat_token_or_range)
	parse(token_definition, ':yoyo = ' + token_specification_concat_token_or_range_paren)

	parse(token_definition, ':yoyo _= ' + token_specification_single_range)
	parse(token_definition, ':yoyo _= ' + token_specification_range_concat_string)
	parse(token_definition, ':yoyo _= ' + token_specification_range_header)
	parse(token_definition, ':yoyo _= ' + token_specification_concat_token)
	parse(token_definition, ':yoyo _= ' + token_specification_concat_token_or_range)
	parse(token_definition, ':yoyo _= ' + token_specification_concat_token_or_range_paren)
}))



const virtual_lexer_usage_single_exposed = `{ :yoyo } = use './SomeLexer'`
const virtual_lexer_usage_multiple_exposed = `{ :yoyo, :other } = use './SomeLexer'`
const virtual_lexer_usage_blocked = `{
	:yoyo, :other
	:stuff
} = use './SomeLexer'`

describe('virtual_lexer_usage', () => it('works', () => {
	parse(virtual_lexer_usage, virtual_lexer_usage_single_exposed)
	parse(virtual_lexer_usage, virtual_lexer_usage_multiple_exposed)
	parse(virtual_lexer_usage, virtual_lexer_usage_blocked)
}))


const macro_call_single = `@sep[:yoyo]`
const macro_call_multiple = `@sep[:yoyo, thingy+ dude !stuff, whatever? (stuff :dude)+]`
const macro_call_empty = `@sep[]`

describe('macro_call', () => it('macro_call', () => {
	parse(macro_call, macro_call_single)
	parse(macro_call, macro_call_multiple)

	bad(macro_call, macro_call_empty)
}))


const locking_definitions_single = `<!locked = :token>`
const locking_definitions_multiple = `<!locked = :token, !other = :diff, !some = :whatever>`
const locking_definitions_indented_separated = `<
	!locked = :token
	!other = :diff
	!some = :whatever
>`

const locking_definitions_indented_commad = `<
	!locked = :token, !other = :diff, !some = :whatever
>`

const locking_definitions_indented_mixed = `<
	!locked = :token, !other = :diff
	!some = :whatever
	!dude = :thing, !stuff = :howdy
>`
const locking_definitions_empty = '<>'
const locking_definitions_gross_before = `<!locked= :token>`
const locking_definitions_gross_after = `<!locked =:token>`

describe('locking_definitions', () => it('works', () => {
	parse(locking_definitions, locking_definitions_single)
	parse(locking_definitions, locking_definitions_multiple)

	parse(locking_definitions, locking_definitions_indented_separated)
	parse(locking_definitions, locking_definitions_indented_commad)
	parse(locking_definitions, locking_definitions_indented_mixed)

	bad(locking_definitions, locking_definitions_empty)
	bad(locking_definitions, locking_definitions_gross_before)
	bad(locking_definitions, locking_definitions_gross_after)
}))





const rule_atom_rule_name = `yoyo`
const rule_atom_token_name = `:yoyo`
const rule_atom_var_name = `$yoyo`
const rule_atom_locked_name = `!yoyo`

const rule_atom_paren = `(:yoyo :a :b some_rule $thing !locked)`

describe('rule_atom', () => it('works', () => {
	parse(rule_atom, rule_atom_rule_name)
	parse(rule_atom, rule_atom_token_name)
	parse(rule_atom, rule_atom_var_name)
	parse(rule_atom, rule_atom_locked_name)

	parse(rule_atom, rule_atom_rule_name + '+')
	parse(rule_atom, rule_atom_token_name + '?')
	parse(rule_atom, rule_atom_var_name + '+')
	parse(rule_atom, rule_atom_locked_name + '*')

	parse(rule_atom, rule_atom_paren)
	parse(rule_atom, rule_atom_paren + '?')
}))


const simple_rule_line_spaces = `:yoyo :a* :b $thing+ !lock :whitespace?`
const simple_rule_line_or = `:yoyo :a | :thing | :b (:stuff :colon)+`
const simple_rule_line_macro_call = `:yoyo :a | :thing @stuff[!dude, :other rule_thing] | :b (:stuff :colon)+`

describe('simple_rule_line', () => it('works', () => {
	parse(simple_rule_line, rule_atom_token_name)
	parse(simple_rule_line, rule_atom_var_name)
	parse(simple_rule_line, rule_atom_locked_name)

	parse(simple_rule_line, rule_atom_token_name + '?')
	parse(simple_rule_line, rule_atom_var_name + '+')
	parse(simple_rule_line, rule_atom_locked_name + '*')

	parse(simple_rule_line, rule_atom_paren)
	parse(simple_rule_line, rule_atom_paren + '?')

	parse(simple_rule_line, simple_rule_line_spaces)
	parse(simple_rule_line, simple_rule_line_or)
	parse(simple_rule_line, simple_rule_line_macro_call)
}))


const rule_item_bar_front = `| yoyo thing`
const rule_item_modified = `+ stuff :thing $var !dude (some things)?`
const rule_item_modified_or = `* stuff :thing | $var | !dude (some things)?`
const rule_item_modified_indented = `\
*
	stuff :thing | $var | !dude (some things)?`
const rule_item_modified_indented_multiple = `\
*
	stuff :thing | $var | !dude
	(some things)?
	| stuff | :other`
const rule_item_modified_indented_nested = `\
*
	stuff :thing | $var | !dude
	(some things)?
	| stuff | :other
	| hmmm
	!something
	+
		things stuff
		:other
	|
		here we go
	| @something[here, :therefore]
`

describe('rule_item', () => it('works', () => {
	parse(rule_item, rule_atom_var_name)
	parse(rule_item, rule_atom_paren)
	parse(rule_item, simple_rule_line_spaces)
	parse(rule_item, simple_rule_line_macro_call)

	parse(rule_item, rule_item_bar_front)
	parse(rule_item, rule_item_modified)
	parse(rule_item, rule_item_modified_or)
	parse(rule_item, rule_item_modified_indented)
	parse(rule_item, rule_item_modified_indented_multiple)
	parse(rule_item, rule_item_modified_indented_nested)
}))


const rule_block_html_tag = ` =
	:open_angle !tag_name
	(:ident :eq :str)*
	| :slash :close_angle
	|
		:close_angle
		(text | html_tag)*
		:open_angle !tag_name :slash :close_angle`

const rule_block_complex = ` =
	:something !different (this $and :that)+
	*
		here are :some @rules[$that, :we can :use]
		|
			therefore here
			? :something !is
		| :this is (stuff that? :works :hopefully)*
	?
		then whatever this (:thing | also !works | $here you go)?
		something
`

describe('rule_block', () => it('works', () => {
	parse(rule_block, ` = ${rule_atom_token_name}`)
	parse(rule_block, ` = ${rule_atom_paren}`)
	parse(rule_block, ` = ${simple_rule_line_spaces}`)
	parse(rule_block, ` = ${simple_rule_line_macro_call}`)

	parse(rule_block, rule_block_html_tag)
	parse(rule_block, rule_block_complex)
}))


const rule_definition_html_file = `html_file =
	html_tag+`

const rule_definition_html_tag = `html_tag<!tag_name = :html_tag_ident> =
	:open_angle !tag_name
	(:ident :eq :str)*
	| :slash :close_angle
	|
		:close_angle
		(text | html_tag)*
		:open_angle !tag_name :slash :close_angle
	`
const rule_definition_html_tag_indented_locker = `html_tag<
	!tag_name = :html_tag_ident
> =
	:open_angle !tag_name
	(:ident :eq :str)*
	| :slash :close_angle
	|
		:close_angle
		(text | html_tag)*
		:open_angle !tag_name :slash :close_angle
`
const rule_definition_html_text = `text = (:whitespace | :not_open_angle)+`

describe('rule_definition', () => it('works', () => {
	parse(rule_definition, rule_definition_html_file)
	parse(rule_definition, rule_definition_html_tag)
	parse(rule_definition, rule_definition_html_tag_indented_locker)
	parse(rule_definition, rule_definition_html_text)
}))


const macro_definition_many_separated_one_line = `@many_separated[$body, $separator] = $body ($separator $body)*`
const macro_definition_many_separated_indented_def = `@many_separated[$body, $separator] =
	$body ($separator $body)*`
const macro_definition_many_separated_blocked_vars_one_line = `@many_separated[
	$body, $separator
] = $body ($separator $body)*`

const macro_definition_many_separated_blocked_vars_indented_def = `@many_separated[
	$body, $separator
] =
	$body ($separator $body)*`

const macro_definition_many_separated_lined_vars_indented_def = `@many_separated[
	$body
	$separator
] =
	$body ($separator $body)*`

describe('macro_definition', () => it('works', () => {
	parse(macro_definition, macro_definition_many_separated_one_line)
	parse(macro_definition, macro_definition_many_separated_indented_def)
	parse(macro_definition, macro_definition_many_separated_blocked_vars_one_line)
	parse(macro_definition, macro_definition_many_separated_blocked_vars_indented_def)
	parse(macro_definition, macro_definition_many_separated_lined_vars_indented_def)
}))


import * as fs from 'fs'

describe('./examples/html.peg', () => it('works', () => {
	const html_grammar = parse_give(kreia_grammar, fs.readFileSync('./examples/html.peg', 'utf-8'))
	expect(boil_string(print_grammar(html_grammar))).eql(boil_string(`
		import { Parser, ParseArg, Decidable, path, branch, c } from "kreia"

		export const { tok, reset, lock, consume, maybe, or, maybe_or, many_or, maybe_many_or, many, maybe_many, exit } = Parser({
			html_tag_ident: /h[1-6]|a|p|div|span/,
			ident: /(?:[0-9a-zA-Z]|-)+/,
			open_angle: /</,
			close_angle: />/,
			slash: /\\//,
			eq: /=/,
			str: /"(?:\\\\\\\\["\\\\]|[^\\n"\\\\])*"/,
			not_open_angle: /(?:[^<]|\\\\\\\\<)+/,
			whitespace: { regex: /(?:[\\t\\n\\v\\f\\r ])+/, ignore: true }
		}, {})

		const {_MHu6X, _A1THl, _Z1oSnTW, _Z1oj86y} = {
			_MHu6X: path([tok.open_angle]),
			_A1THl: path([tok.close_angle]),
			_Z1oSnTW: branch(path([tok.whitespace]), path([tok.not_open_angle])),
			_Z1oj86y: path([tok.open_angle, tok.html_tag_ident])
		}

		export function html_file() {
			many(html_tag, _MHu6X)
		}

		export function html_tag() {
			const tag_name = lock(tok.html_tag_ident)

			consume(tok.open_angle)
			tag_name()
			maybe_many(tok.ident, tok.eq, tok.str)
			or(
				c(tok.slash, tok.close_angle),
				c(() => {
					consume(tok.close_angle)

					maybe_many_or(
						c(text, _Z1oSnTW),
						c(html_tag, _Z1oj86y)
					)

					consume(tok.open_angle)
					tag_name()
					consume(tok.slash, tok.close_angle)
				}, _A1THl)
			)
		}

		export function text() {
			many_or(
				c(tok.whitespace),
				c(tok.not_open_angle)
			)
		}
	`))
}))

	// parse_give(kreia_grammar, fs.readFileSync('./examples/json.peg', 'utf-8'))
	// parse_give(kreia_grammar, fs.readFileSync('./examples/yml.peg', 'utf-8'))
