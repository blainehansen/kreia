import 'mocha'
import { expect } from 'chai'
import { OrderedDict } from '@ts-std/collections'

import { Token } from './lexer'
import { path, branch } from './decision'
import { compute_decidable } from './decision_compute'
import {
	register_tokens, register_rules, register_macros,
	resolve_macro, check_left_recursive, validate_references,
	render_grammar,
	Rule, Macro, MacroCall, Subrule, Arg, Var, Node, Definition, Maybe, Many, Or, Consume,
} from './ast'


import { log } from './utils'

const _A = Token('A', 'A')
const _B = Token('B', 'B')
const _C = Token('C', 'C')
const _D = Token('D', 'D')
const _E = Token('E', 'E')
const _F = Token('F', 'F')
const _G = Token('G', 'G')
const _H = Token('H', 'H')

register_tokens([_A, _B, _C, _D, _E, _F, _G, _H])

const A = 'A'
const B = 'B'
const C = 'C'
const D = 'D'
const E = 'E'
const F = 'F'
const G = 'G'
const H = 'H'

describe('compute_decidable', () => {
	it('simple linear tokens', () => {
		expect(compute_decidable(
			[Consume([A])],
			[
			[Consume([B])],
			[Consume([C])],
		])).eql(
			path([_A]),
		)

		expect(compute_decidable(
			[Consume([A, B, C])],
			[
			[Consume([A, B, C, D, E])],
		])).eql(
			path([_A, _B, _C]),
		)

		expect(compute_decidable(
			[Consume([A, B, A])],
			[
			[Consume([A, C, A])],
		])).eql(
			path([_A, _B]),
		)

		expect(compute_decidable(
			[Consume([A, C, B, A, C])],
			[
			[Consume([A, C, D, A])],
			[Consume([A, C, B, A, E, A])],
		])).eql(
			path([_A, _C, _B, _A, _C]),
		)

		expect(compute_decidable(
			[Consume([A, C, B, A, C, E])],
			[
			[Consume([A, C, D, A])],
			[Consume([A, C, B, A, E, A])],
		])).eql(
			path([_A, _C, _B, _A, _C]),
		)
	})

	it('simple branches', () => {
		expect(compute_decidable(
			[Consume([A, B, C])],
			[
			[Consume([A]), Maybe([Consume([D, F])])],
		])).eql(
			path([_A, _B]),
		)

		expect(compute_decidable(
			[Consume([A, B, C])],
			[
			[Consume([A]), Maybe([Consume([B, F])])],
		])).eql(
			path([_A, _B, _C]),
		)

		expect(compute_decidable(
			[Consume([A, B, C])],
			[
			[Consume([A]), Maybe([Consume([E])]), Consume([B])],
		])).eql(
			path([_A, _B, _C]),
		)

		expect(compute_decidable(
			[Consume([A, B]), Maybe([Consume([F, G])])],
			[
			[Consume([A, B, E])],
		])).eql(
			path([_A, _B]),
		)

		expect(compute_decidable(
			[Consume([A, B]), Maybe([Consume([F, G])]), Consume([C, E])],
			[
			[Consume([A, B, C, D])],
		])).eql(
			path([_A, _B], branch(path([_F]), path([_C, _E]))),
		)

		expect(compute_decidable(
			[Consume([A, B]), Maybe([Consume([C, D])]), Consume([E, F, A, B, C])],
			[
			[Consume([A, B, E, G])],
			[Consume([A, B, C, D, E, H])],
		])).eql(
			path([_A, _B], branch(path([_C, _D]), path([_E, _F])))
		)
	})

	it('unambiguous many', () => {
		expect(compute_decidable(
			[Many([Consume([A, B, C])])],
			[
			[Consume([A, B, D])],
		])).eql(
			path([_A, _B, _C]),
		)

		expect(compute_decidable(
			[Consume([A, B, D])],
			[
			[Many([Consume([A, B, C])])],
		])).eql(
			path([_A, _B, _D]),
		)

		expect(compute_decidable(
			[Consume([A, B, A, B, A, B, C])],
			[
			[Many([Consume([A, B])]), Consume([C])],
		])).eql(
			path([_A, _B, _A, _B, _A, _B, _C]),
		)

		expect(compute_decidable(
			[Consume([A, B, A, B, C])],
			[
			[Many([Consume([A, B])]), Consume([C])],
		])).eql(
			path([_A, _B, _A, _B, _C]),
		)
	})

	it('decidable many against many', () => {
		expect(compute_decidable(
			[Many([Consume([A])])],
			[
			[Many([Consume([B])])],
		])).eql(
			path([_A]),
		)

		expect(compute_decidable(
			[Many([Consume([A, B])])],
			[
			[Many([Consume([A, C])])],
		])).eql(
			path([_A, _B]),
		)

		expect(compute_decidable(
			[Many([Consume([A, B, C])])],
			[
			[Consume([A, B]), Many([Consume([D, A, B, C])])],
		])).eql(
			path([_A, _B, _C]),
		)

		expect(compute_decidable(
			[Many([Consume([A, B, D, E])])],
			[
			[Consume([A, B]), Many([Consume([D, A, B, C])])],
		])).eql(
			path([_A, _B, _D, _E]),
		)
	})

	it('undecidable many', () => {
		expect(() => compute_decidable(
			[Many([Consume([A, B, C])])],
			[
			// the problem here is that the many will always eat into this,
			// and prevent it from ever happening
			// they need to restructure their grammar
			[Consume([A, B, C, D])],
		])).throw('undecidable')

		expect(() => compute_decidable(
			[Many([Consume([A, B, C])])],
			[
			[Consume([A, B]), Many([Consume([C, A, B])])],
		])).throw('undecidable')
	})

	it('complex branches', () => {
		expect(compute_decidable(
			[
				Consume([A, B]),
				Or([
					[Consume([C, D, E])],
					[Consume([D])],
				]),
				Consume([A, C, A])
			],
			[
			[
				Consume([A]),
				Or([
					[Consume([B, D])],
					[Consume([B, C])],
				]),
			],
		])).eql(
			path(
				[_A, _B],
				branch(
					path([_C, _D]),
					path([_D]),
				),
				[_A],
			)
		)

		expect(compute_decidable(
			[
				Consume([A, B]),
				Or([
					[Consume([C, D, E])],
					[Consume([D])],
				]),
				Consume([A, C, A])
			],
			[
			[
				Or([
					[Consume([A, B]), Or([
						[Consume([C, A])],
						[Consume([C, D, E])],
					])],
					[Consume([A, B, E]), Maybe([Consume([A, C, A])])],
				]),
			],
		])).eql(
			path(
				[_A, _B],
				branch(
					path([_C, _D, _E]),
					path([_D]),
				),
				[_A],
			),
		)

		expect(compute_decidable(
			[Many([Maybe([Consume([D])]), Consume([B, C, E])])],
			[
			[Many([Consume([B]), Maybe([Consume([C])]), Consume([A])])],
		])).eql(
			path(
				branch(
					path([_D]),
					path([_B, _C, _E]),
				),
			)
		)
	})
})


describe('resolve_macro', () => {
	it('works', () => {
		register_macros([
			Macro(
				'many_separated',
				OrderedDict.create_unique('name', [Arg('body_rule'), Arg('separator_rule')]).expect(''),
				[Var('body_rule'), Maybe([Many([Var('separator_rule'), Var('body_rule')])])],
			),
		])
		const resolved = resolve_macro(
			'many_separated',
			OrderedDict.create_unique(
				(_arg, index) => index === 0 ? 'body_rule' : 'separator_rule',
				[[Consume([A])], [Consume([B])]],
			).expect(''),
		)
		expect(resolved).eql(
			[Consume([A]), Maybe([Many([Consume([B]), Consume([A])])])],
		)
	})
})


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

		// this is an interesting situation,
		// since it's one of these rules where something has only a single Maybe
		// which is always a non-canonical way to put things
		// expect_left(true,
		// 	Rule('one', [Or([
		// 		[Consume([A])],
		// 		[Maybe([Consume([B])])],
		// 	]), Subrule('two')]),
		// 	Rule('two', [Subrule('one')]),
		// )

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
			OrderedDict.create_unique('name', [Arg('thing')]).expect(''),
			[Consume([A]), Var('thing')],
		)
		expect(validate_references(
			m,
		).length).eql(0)

		expect(validate_references(
			Macro(
				'bad',
				OrderedDict.create_unique('name', [Arg('thing')]).expect(''),
				[Var('nope')],
			)
		).length).eql(1)

		register_macros([m])
		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('thing')]).expect('').map(() => [Consume([A])]),
			)]),
		).length).eql(0)

		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('thing'), Arg('extra')]).expect('').map(() => [Consume([A])]),
			)])
		).length).eql(1)

		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [Arg('extra')]).expect('').map(() => [Consume([A])]),
			)])
		).length).eql(1)


		expect(validate_references(
			Rule('one', [MacroCall(
				'm', OrderedDict.create_unique('name', [] as Arg[]).expect('').map(() => [Consume([A])]),
			)])
		).length).eql(1)
	})
})


// const json_grammar = []

describe('render_grammar', () => {
	it('works', () => {
		render_grammar([
			_A, _B, _C, _D, _E, _F, _G, _H,
			Rule(),
		])
	})
})
