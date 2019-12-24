import 'mocha'
import { expect } from 'chai'

// import { reset, exit, locking_definitions, simple_rule_line, rule_atom } from './grammar_out'
import { reset, exit, simple_rule_line, rule_atom } from './grammar_out'

function parse(fn: () => any, input: string) {
	reset(input)
	fn()
	exit()
}

// const locking_definitions_single = `<!locked = :token>`
// const locking_definitions_multiple = `<!locked = :token, !other = :diff, !some = :whatever>`
// const locking_definitions_indented_separated = `<
// 	!locked = :token
// 	!other = :diff
// 	!some = :whatever
// >`

// const locking_definitions_indented_commad = `<
// 	!locked = :token, !other = :diff, !some = :whatever
// >`

// const locking_definitions_indented_mixed = `<
// 	!locked = :token, !other = :diff
// 	!some = :whatever
// 	!dude = :thing, !stuff = :howdy
// >`

// describe('locking_definitions', () => it('works', () => {
// 	parse(locking_definitions, locking_definitions_single)
// 	parse(locking_definitions, locking_definitions_multiple)

// 	parse(locking_definitions, locking_definitions_indented_separated)
// 	parse(locking_definitions, locking_definitions_indented_commad)
// 	parse(locking_definitions, locking_definitions_indented_mixed)
// }))


const rule_atom_token_name = `:yoyo`
const rule_atom_var_name = `$yoyo`
const rule_atom_locked_name = `!yoyo`

const rule_atom_paren = `(:yoyo :a :b $thing !locked)`

describe('rule_atom', () => it('works', () => {
	parse(rule_atom, rule_atom_token_name)
	parse(rule_atom, rule_atom_var_name)
	parse(rule_atom, rule_atom_locked_name)

	parse(rule_atom, rule_atom_token_name + '?')
	parse(rule_atom, rule_atom_var_name + '+')
	parse(rule_atom, rule_atom_locked_name + '*')

	parse(rule_atom, rule_atom_paren)
	parse(rule_atom, rule_atom_paren + '?')
}))


const simple_rule_line_spaces = `:yoyo :a* :b $thing+ !lock :whitespace?`
const simple_rule_line_or = `:yoyo :a | :thing | :b (:stuff :colon)+`

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
}))
