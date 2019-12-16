import 'mocha'
import { expect } from 'chai'
import { tuple as t } from '@ts-std/types'
import { OrderedDict } from '@ts-std/collections'

import { UserToken } from '../lexer'
import { compute_decidable } from './decision_compute'
import { AstDecisionPath as path, AstDecisionBranch as branch } from './decision'
import { render_grammar } from './render'
import { check_left_recursive, validate_references } from './validate'
import {
	register_tokens, register_rules, register_macros, Scope,
	TokenDef, Rule, Macro, MacroCall, Subrule, Arg, Var, Node, Definition, Maybe, Many, Or, Consume, LockingVar, LockingArg
} from './ast'


import { log } from '../utils'

const token_defs = [
	TokenDef('A', { type: 'string', value: 'A' }),
	TokenDef('B', { type: 'string', value: 'B' }),
	TokenDef('C', { type: 'string', value: 'C' }),
	TokenDef('D', { type: 'string', value: 'D' }),
	TokenDef('E', { type: 'string', value: 'E' }),
	TokenDef('F', { type: 'string', value: 'F' }),
	TokenDef('G', { type: 'string', value: 'G' }),
	TokenDef('H', { type: 'string', value: 'H' }),
]
register_tokens(token_defs)

const empty_scope = Scope(undefined, undefined)
const empty_stack = { current: empty_scope, previous: [] }
function d(...nodes: Node[]) {
	return t(nodes as Definition, empty_stack)
}

const A = 'A'
const B = 'B'
const C = 'C'
const D = 'D'
const E = 'E'
const F = 'F'
const G = 'G'
const H = 'H'


describe('check_left_recursive', () => {
	function expect_left(left: boolean, ...rules: Rule[]) {
		register_rules(rules)
		for (const rule of rules)
			expect(check_left_recursive(rule)).eql(left)
	}

	it('works', () => {
		expect_left(true,
			Rule('one', [Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(true,
			Rule('one', [Subrule('two')]),
			Rule('two', [Maybe([Subrule('one')])]),
		)

		expect_left(true,
			Rule('one', [Maybe([Subrule('two')])]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(true,
			Rule('one', [Maybe([Subrule('two')])]),
			Rule('two', [Maybe([Subrule('one')])]),
		)

		expect_left(true,
			Rule('one', [Maybe([Consume([A])]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		// deeply nested
		expect_left(true,
			Rule('one', [Maybe([Consume([A])]), Subrule('two')]),
			Rule('two', [Maybe([Consume([A])]), Subrule('three')]),
			Rule('three', [Maybe([Consume([A])]), Subrule('four')]),
			Rule('four', [Maybe([Consume([A])]), Subrule('one')]),
		)

		// nested but the target rule isn't the one that introduces the recursion
		expect_left(true,
			Rule('one', [Maybe([Consume([A])]), Subrule('two')]),
			Rule('two', [Maybe([Consume([A])]), Subrule('three')]),
			Rule('three', [Maybe([Consume([A])]), Subrule('two')]),
		)

		expect_left(true,
			Rule('one', [Or([
				[Consume([A]), Maybe([Subrule('two')])],
				[Maybe([Consume([B])]), Subrule('two')],
			])]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(false,
			Rule('one', [Many([Consume([A])]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(false,
			Rule('one', [Consume([A]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(false,
			Rule('one', [Maybe([Consume([A])]), Consume([A]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(false,
			Rule('one', [Many([Consume([A])]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		expect_left(false,
			Rule('one', [Or([
				[Maybe([Consume([A]), Subrule('two')]), Consume([C])],
				[Maybe([Consume([B])]), Consume([D])],
			]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)

		// this is an interesting situation,
		// since it's one of these rules where something has only a single Maybe
		// which is always a non-canonical way to put things
		expect_left(true,
			Rule('one', [Or([
				[Consume([A])],
				[Maybe([Consume([B])])],
			]), Subrule('two')]),
			Rule('two', [Subrule('one')]),
		)
	})
})


describe('validate_references', () => {
	it('works', () => {
		expect(validate_references(
			Rule('two', [Consume([A])])
		).length).eql(0)
		expect(validate_references(
			Rule('one', [Consume(['nope'])])
		).length).eql(1)
		expect(validate_references(
			Rule('two', [Var('nope')])
		).length).eql(1)


		register_rules([
			Rule('one', [Consume([A])]),
		])
		expect(validate_references(
			Rule('two', [Subrule('three')])
		).length).eql(1)
		expect(validate_references(
			Rule('two', [Subrule('one')])
		).length).eql(0)


		const m = Macro(
			'm',
			OrderedDict.create_unique('name', [Arg('thing')]).unwrap(),
			[Consume([A]), Var('thing')],
		)
		expect(validate_references(
			m,
		).length).eql(0)

		expect(validate_references(
			Macro(
				'bad',
				OrderedDict.create_unique('name', [Arg('thing')]).unwrap(),
				[Var('nope')],
			)
		).length).eql(1)

		register_macros([m])
		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('thing')]).unwrap().map(() => [Consume([A])]),
			)]),
		).length).eql(0)

		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('thing'), Arg('extra')]).unwrap().map(() => [Consume([A])]),
			)])
		).length).eql(1)

		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('extra')]).unwrap().map(() => [Consume([A])]),
			)])
		).length).eql(1)


		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [] as Arg[]).unwrap().map(() => [Consume([A])]),
			)])
		).length).eql(1)
	})
})


// const json_grammar = []

describe('render_grammar', () => {
	it('works', () => {
		render_grammar([
			...token_defs,
			Rule('something', [] as Definition),
		])
	})
})
