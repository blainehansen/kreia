import 'mocha'
import { expect } from 'chai'

import { reset, exit, locking_definitions } from './grammar_out'

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

function parse(fn: () => any, input: string) {
	reset(input)
	fn()
	exit()
}

describe('isolated rules', () => {
	it('locking_definitions', () => {
		parse(locking_definitions, locking_definitions_single)
		parse(locking_definitions, locking_definitions_multiple)

		parse(locking_definitions, locking_definitions_indented_separated)
		parse(locking_definitions, locking_definitions_indented_commad)
		parse(locking_definitions, locking_definitions_indented_mixed)
	})
})
