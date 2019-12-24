import 'mocha'
import { expect } from 'chai'

import { check_left_recursive, validate_references } from './ast_validate'
import {
	Definition, Scope, ScopeStack, Node, Registry,
	TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume,
	or, maybe_or, maybe_many_or, many, _var, many_separated,
	macro_call, subrule, maybe_subrule,
} from './ast'


const token_defs = [
	new TokenDef('A', 'A'),
	new TokenDef('B', 'B'),
	new TokenDef('C', 'C'),
	new TokenDef('D', 'D'),
	new TokenDef('E', 'E'),
	new TokenDef('F', 'F'),
	new TokenDef('G', 'G'),
	new TokenDef('H', 'H'),
]
Registry.register_tokens(token_defs)

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
		Registry.register_rules(rules)
		for (const rule of rules)
			expect(check_left_recursive(rule)).eql(left)
	}

	it('works', () => {
		expect_left(true,
			new Rule('one', [subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(true,
			new Rule('one', [subrule('two')]),
			new Rule('two', [maybe_subrule('one'), consume(A)]),
		)

		expect_left(true,
			new Rule('one', [maybe_subrule('two'), consume(A)]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(true,
			new Rule('one', [maybe_subrule('two'), consume(A)]),
			new Rule('two', [maybe_subrule('one'), consume(A)]),
		)

		expect_left(true,
			new Rule('one', [maybe_consume(A), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		// deeply nested
		expect_left(true,
			new Rule('one', [maybe_consume(A), subrule('two')]),
			new Rule('two', [maybe_consume(A), subrule('three')]),
			new Rule('three', [maybe_consume(A), subrule('four')]),
			new Rule('four', [maybe_consume(A), subrule('one')]),
		)

		// nested but the target rule isn't the one that introduces the recursion
		expect_left(true,
			new Rule('one', [maybe_consume(A), subrule('two')]),
			new Rule('two', [maybe_consume(A), subrule('three')]),
			new Rule('three', [maybe_consume(A), subrule('two')]),
		)

		expect_left(true,
			new Rule('one', [or(
				[consume(A), maybe_subrule('two')],
				[maybe_consume(B), subrule('two')],
			)]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(false,
			new Rule('one', [many_consume(A), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(false,
			new Rule('one', [consume(A), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(false,
			new Rule('one', [maybe_consume(A), consume(A), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(false,
			new Rule('one', [many_consume(A), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(false,
			new Rule('one', [or(
				[maybe(consume(A), subrule('two')), consume(C)],
				[maybe_consume(B), consume(D)],
			), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(true,
			new Rule('one', [maybe_or(
				[consume(A)],
				[consume(B)],
			), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)

		expect_left(true,
			new Rule('one', [maybe_many_or(
				[consume(A)],
				[consume(B)],
			), subrule('two')]),
			new Rule('two', [subrule('one')]),
		)
	})
})


describe('validate_references', () => {
	it('works', () => {
		expect(validate_references(
			new Rule('two', [consume(A)])
		).length).eql(0)
		expect(validate_references(
			new Rule('one', [consume('nope')])
		).length).eql(1)
		expect(validate_references(
			new Rule('two', [_var('nope')])
		).length).eql(1)


		Registry.register_rules([
			new Rule('one', [consume(A)]),
		])
		expect(validate_references(
			new Rule('two', [subrule('three')])
		).length).eql(1)
		expect(validate_references(
			new Rule('two', [subrule('one')])
		).length).eql(0)


		const m = new Macro(
			'm', [new Arg('thing')],
			[consume(A), _var('thing')],
		)
		expect(validate_references(
			m,
		).length).eql(0)

		expect(validate_references(
			new Macro(
				'bad',
				[new Arg('thing')],
				[_var('nope')],
			)
		).length).eql(1)

		Registry.register_macros([m])
		expect(validate_references(
			new Rule('one', [macro_call(
				'm', [consume(A)],
			)]),
		).length).eql(0)

		expect(validate_references(
			new Rule('one', [macro_call(
				'm', [consume(A)], [consume(A)],
			)]),
		).length).eql(1)


		const n = new Macro(
			'n', [new Arg('thing'), new Arg('other')],
			[consume(A), _var('thing'), _var('other')],
		)
		expect(validate_references(
			n,
		).length).eql(0)
		Registry.register_macros([n])

		expect(validate_references(
			new Rule('one', [macro_call(
				'n',
				[consume(B)],
			)]),
		).length).eql(1)
	})
})
