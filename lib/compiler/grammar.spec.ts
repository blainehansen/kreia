import 'mocha'
import { expect } from 'chai'

import {
	reset, exit,
	rule_block,
	token_definition, token_specification, base_token_specification,
	virtual_lexer_usage, macro_call,
	locking_definitions, simple_rule_line, rule_atom,
} from './grammar_blank'

function parse(fn: () => any, input: string) {
	reset(input)
	fn()
	exit()
}

function bad(fn: () => any, input: string) {
	reset(input)
	expect(fn).throw()
}


const rule_block_simple = `yoyo thing`
const rule_block_bar_front = `| yoyo thing`
const rule_block_bar_section = `\
| yoyo thing
| yoyo thing
| yoyo thing`
const rule_block_modified_line = `? thing other :stuff`
const rule_block_modified_indented_single = `\
?
	thing other :stuff
`
const rule_block_modified_indented_multiple = `\
?
	thing other :stuff
	thing other+ :stuff
	(thing other)+ :stuff
`

const rule_block_modified_indented_nested = `\
+
	thing other :stuff
	| stuff
	| different !option
	*
		$thingy | dude
	thing other+ :stuff
	(thing other)+ :stuff
`

describe('rule_block', () => it('works', () => {
	// parse(rule_block, rule_block_simple)
	// parse(rule_block, rule_block_bar_front)
	// parse(rule_block, rule_block_bar_section)
	// parse(rule_block, rule_block_modified_line)
	// parse(rule_block, rule_block_modified_indented_single)
	// parse(rule_block, rule_block_modified_indented_multiple)
	parse(rule_block, rule_block_modified_indented_nested)
}))



const base_token_specification_regex_simple = `/\\w+/`
const base_token_specification_regex_complex = `/(\\w\\/)|(.{5})+/`
const base_token_specification_str_double = `"yo"`
const base_token_specification_str_single = `'yo'`

describe('base_token_specification', () => it('works', () => {
	parse(base_token_specification, base_token_specification_regex_simple)
	parse(base_token_specification, base_token_specification_regex_complex)
	parse(base_token_specification, base_token_specification_str_double)
	parse(base_token_specification, base_token_specification_str_single)
}))


const token_specification_array_regex_simple = `[${base_token_specification_regex_simple}]`
const token_specification_array_regex_complex = `[${base_token_specification_regex_complex}]`
const token_specification_array_str_double = `[${base_token_specification_str_double}]`
const token_specification_array_str_single = `[${base_token_specification_str_single}]`
const token_specification_array_str_single_multiple = `[${base_token_specification_str_single}, ${base_token_specification_str_single}]`
const token_specification_array_bad = `[]`

describe('token_specification', () => it('works', () => {
	parse(token_specification, token_specification_array_regex_simple)
	parse(token_specification, token_specification_array_regex_complex)
	parse(token_specification, token_specification_array_str_double)
	parse(token_specification, token_specification_array_str_single)
	parse(token_specification, token_specification_array_str_single_multiple)

	bad(token_specification, token_specification_array_bad)
}))


const token_definition_regex_simple = `:yoyo = ${base_token_specification_regex_simple}`
const token_definition_str_double = `:yoyo = ${base_token_specification_str_double}`
const token_definition_array_regex_complex = `:yoyo = ${token_specification_array_regex_complex}`
const token_definition_array_str_single_multiple = `:yoyo = ${token_specification_array_str_single_multiple}`

describe('token_definition', () => it('works', () => {
	parse(token_definition, token_definition_regex_simple)
	parse(token_definition, token_definition_str_double)
	parse(token_definition, token_definition_array_regex_complex)
	parse(token_definition, token_definition_array_str_single_multiple)
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
