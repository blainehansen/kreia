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

// function sep(body: Definition, separator: Definition) {
// 	return MacroCall(
// 		'many_separated',
// 		OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
// 			body, separator,
// 		]).unwrap(),
// 	)
// }

// function space_sep(body: Definition) {
// 	return sep(body, [Consume(['space'])])
// }

describe('compute_decidable', () => {
	// it('specific cases', () => {
	// 	expect(compute_decidable(
	// 		d(
	// 			sep(
	// 				[space_sep([Consume(['A'])])],
	// 				[Consume(['space', 'bar', 'space'])],
	// 			),
	// 		),
	// 		[
	// 		d(),
	// 	])).eql(
	// 		path()
	// 	)
	// })

	it('simple linear tokens', () => {
		expect(compute_decidable(
			d(Maybe([Consume([B])]), Consume([C])),
			[
			d(Consume([A])),
		])).eql(
			path(branch(path([B]), path([C]))),
		)

		expect(compute_decidable(
			d(Consume([A])),
			[
			d(Consume([B])),
			d(Consume([C])),
		])).eql(
			path([A]),
		)

		expect(compute_decidable(
			d(Consume([A, B, C])),
			[
			d(Consume([A, B, C, D, E])),
		])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(Consume([A, B, A])),
			[
			d(Consume([A, C, A])),
		])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(Consume([A, C, B, A, C])),
			[
			d(Consume([A, C, D, A])),
			d(Consume([A, C, B, A, E, A])),
		])).eql(
			path([A, C, B, A, C]),
		)

		expect(compute_decidable(
			d(Consume([A, C, B, A, C, E])),
			[
			d(Consume([A, C, D, A])),
			d(Consume([A, C, B, A, E, A])),
		])).eql(
			path([A, C, B, A, C]),
		)
	})

	it('simple branches', () => {
		expect(compute_decidable(
			d(Consume([A, B, C])),
			[
			d(Consume([A]), Maybe([Consume([D, F])])),
		])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(Consume([A, B, C])),
			[
			d(Consume([A]), Maybe([Consume([B, F])])),
		])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(Consume([A, B, C])),
			[
			d(Consume([A]), Maybe([Consume([E])]), Consume([B])),
		])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(Consume([A, B]), Maybe([Consume([F, G])])),
			[
			d(Consume([A, B, E])),
		])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(Consume([A, B]), Maybe([Consume([F, G])]), Consume([C, E])),
			[
			d(Consume([A, B, C, D])),
		])).eql(
			path([A, B], branch(path([F]), path([C, E]))),
		)

		expect(compute_decidable(
			d(Consume([A, B]), Maybe([Consume([C, D])]), Consume([E, F, A, B, C])),
			[
			d(Consume([A, B, E, G])),
			d(Consume([A, B, C, D, E, H])),
		])).eql(
			path([A, B], branch(path([C, D]), path([E, F])))
		)
	})

	it('unambiguous many', () => {
		expect(compute_decidable(
			d(Many([Consume([A, B, C])])),
			[
			d(Consume([A, B, D])),
		])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(Consume([A, B, D])),
			[
			d(Many([Consume([A, B, C])])),
		])).eql(
			path([A, B, D]),
		)

		expect(compute_decidable(
			d(Consume([A, B, A, B, A, B, C])),
			[
			d(Many([Consume([A, B])]), Consume([C])),
		])).eql(
			path([A, B, A, B, A, B, C]),
		)

		expect(compute_decidable(
			d(Consume([A, B, A, B, C])),
			[
			d(Many([Consume([A, B])]), Consume([C])),
		])).eql(
			path([A, B, A, B, C]),
		)
	})

	it('decidable many against many', () => {
		expect(compute_decidable(
			d(Many([Consume([A])])),
			[
			d(Many([Consume([B])])),
		])).eql(
			path([A]),
		)

		expect(compute_decidable(
			d(Many([Consume([A, B])])),
			[
			d(Many([Consume([A, C])])),
		])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(Many([Consume([A, B, C])])),
			[
			d(Consume([A, B]), Many([Consume([D, A, B, C])])),
		])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(Many([Consume([A, B, D, E])])),
			[
			d(Consume([A, B]), Many([Consume([D, A, B, C])])),
		])).eql(
			path([A, B, D, E]),
		)
	})

	it('undecidable many', () => {
		expect(() => compute_decidable(
			d(Many([Consume([A, B, C])])),
			[
			// the problem here is that the many will always eat into this,
			// and prevent it from ever happening
			// they need to restructure their grammar
			d(Consume([A, B, C, D])),
		])).throw('undecidable')

		expect(() => compute_decidable(
			d(Many([Consume([A, B, C])])),
			[
			d(Consume([A, B]), Many([Consume([C, A, B])])),
		])).throw('undecidable')
	})

	it('complex branches', () => {
		expect(compute_decidable(
			d(
				Consume([A, B]),
				Or([
					[Consume([C, D, E])],
					[Consume([D])],
				]),
				Consume([A, C, A])
			),
			[
			d(
				Consume([A]),
				Or([
					[Consume([B, D])],
					[Consume([B, C])],
				]),
			),
		])).eql(
			path(
				[A, B],
				branch(
					path([C, D]),
					path([D]),
				),
				[A],
			)
		)

		expect(compute_decidable(
			d(
				Consume([A, B]),
				Or([
					[Consume([C, D, E])],
					[Consume([D])],
				]),
				Consume([A, C, A]),
			),
			[
			d(
				Or([
					[Consume([A, B]), Or([
						[Consume([C, A])],
						[Consume([C, D, E])],
					])],
					[Consume([A, B, E]), Maybe([Consume([A, C, A])])],
				]),
			),
		])).eql(
			path(
				[A, B],
				branch(
					path([C, D, E]),
					path([D]),
				),
				[A],
			),
		)

		expect(compute_decidable(
			d(Many([Maybe([Consume([D])]), Consume([B, C, E])])),
			[
			d(Many([Consume([B]), Maybe([Consume([C])]), Consume([A])])),
		])).eql(
			path(
				branch(
					path([D]),
					path([B, C, E]),
				),
			)
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
