import 'mocha'
import { expect } from 'chai'
import { tuple as t } from '@ts-std/types'

import { compute_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'
import {
	Definition, Scope, ScopeStack, Node,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, many,
} from './ast'

const empty_scope = { current: Scope(undefined, undefined), previous: [] }

function d(...definition: Definition): [Definition, ScopeStack] {
	return t(definition, empty_scope)
}
function n(node: Node): [Node, ScopeStack] {
	return t(node, empty_scope)
}

const A = 'A'
const B = 'B'
const C = 'C'
const D = 'D'
const E = 'E'
const F = 'F'
const G = 'G'
const H = 'H'


describe('tail ambiguity', () => it('works', () => {
	// @many_separated[$body, $separator] = $body ($separator $body)*

	// @many_separated[
	// 	@many_separated[num, space]
	// 	space bar space
	// ] = @many_separated[num, space] (space bar space @many_separated[num, space])*

	// @many_separated[
	// 	@many_separated[num, space],
	// 	space bar space
	// ] = num (space num)* (space bar space num (space num)*)*

	// many_separated(
	// 	many_separated(
	// 		consume('num'),
	// 		consume('space'),
	// 	),
	// 	consume('space', 'bar', 'space')
	// )

	// consume('num')
	// maybe_many_consume('space', 'num')
	// maybe_many(
	// 	consume('space', 'bar', 'space')
	// 	consume('num')
	// 	maybe_many_consume('space', 'num')
	// )

	expect(compute_decidable(
		d(consume('space', 'num')), [],
		[n(
			maybe_many(
				consume('space', 'bar', 'space'),
				consume('num'),
				maybe_many_consume('space', 'num'),
			),
		)],
	)).eql(
		path(['space', 'num']),
	)
}))


describe('decision_compute cases', () => it('works', () => {
	// // (A B C)? (A B)+
	// expect(compute_decidable(
	// 	d(consume(A, B, C)), [],
	// 	[n(
	// 		many_consume(A, B),
	// 	)],
	// )).eql(
	// 	path([A, B, C]),
	// )

	// (A B C)+ (A B)+
	expect(compute_decidable(
		d(many_consume(A, B, C)), [],
		[n(
			many_consume(A, B),
		)],
	)).eql(
		path([A, B, C]),
	)

	// // (A B C)* (A B)+
	// expect(compute_decidable(
	// 	d(maybe_many_consume(A, B, C)), [],
	// 	[n(
	// 		many_consume(A, B),
	// 	)],
	// )).eql(
	// 	path([A, B, C]),
	// )

	// (A B D | A C D) (A (B | C))+
	expect(compute_decidable(
		d(
			or(
				[consume(A, B, D)],
				[consume(A, C, D)],
			),
			many(
				consume(A),
				or(
					[consume(B)],
					[consume(C)],
				)
			),
		),
		[],
		[],
	)).eql(
		path(branch(
			path([A]),
			path([A]),
		)),
	)
}))


describe('compute_decidable', () => {
	it('simple linear tokens', () => {
		expect(compute_decidable(
			d(maybe_consume(B), consume(C)),
			[
			d(consume(A)),
		], [])).eql(
			path(branch(path([B]), path([C]))),
		)

		expect(compute_decidable(
			d(consume(A)),
			[
			d(consume(B)),
			d(consume(C)),
		], [])).eql(
			path([A]),
		)

		expect(compute_decidable(
			d(consume(A, B, C)),
			[
			d(consume(A, B, C, D, E)),
		], [])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(consume(A, B, A)),
			[
			d(consume(A, C, A)),
		], [])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(consume(A, C, B, A, C)),
			[
			d(consume(A, C, D, A)),
			d(consume(A, C, B, A, E, A)),
		], [])).eql(
			path([A, C, B, A, C]),
		)

		expect(compute_decidable(
			d(consume(A, C, B, A, C, E)),
			[
			d(consume(A, C, D, A)),
			d(consume(A, C, B, A, E, A)),
		], [])).eql(
			path([A, C, B, A, C]),
		)
	})

	it('simple branches', () => {
		expect(compute_decidable(
			d(consume(A, B, C)),
			[
			d(consume(A), maybe_consume(D, F)),
		], [])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(consume(A, B, C)),
			[
			d(consume(A), maybe_consume(B, F)),
		], [])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(consume(A, B, C)),
			[
			d(consume(A), maybe_consume(E), consume(B)),
		], [])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(consume(A, B), maybe_consume(F, G)),
			[
			d(consume(A, B, E)),
		], [])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(consume(A, B), maybe_consume(F, G), consume(C, E)),
			[
			d(consume(A, B, C, D)),
		], [])).eql(
			path([A, B], branch(path([F]), path([C, E]))),
		)

		expect(compute_decidable(
			d(consume(A, B), maybe_consume(C, D), consume(E, F, A, B, C)),
			[
			d(consume(A, B, E, G)),
			d(consume(A, B, C, D, E, H)),
		], [])).eql(
			path([A, B], branch(path([C, D]), path([E, F])))
		)
	})

	it('unambiguous many', () => {
		expect(compute_decidable(
			d(many_consume(A, B, C)),
			[
			d(consume(A, B, D)),
		], [])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(consume(A, B, D)),
			[
			d(many_consume(A, B, C)),
		], [])).eql(
			path([A, B, D]),
		)

		expect(compute_decidable(
			d(consume(A, B, A, B, A, B, C)),
			[
			d(many_consume(A, B), consume(C)),
		], [])).eql(
			path([A, B, A, B, A, B, C]),
		)

		expect(compute_decidable(
			d(consume(A, B, A, B, C)),
			[
			d(many_consume(A, B), consume(C)),
		], [])).eql(
			path([A, B, A, B, C]),
		)
	})

	it('decidable many against many', () => {
		expect(compute_decidable(
			d(many_consume(A)),
			[
			d(many_consume(B)),
		], [])).eql(
			path([A]),
		)

		expect(compute_decidable(
			d(many_consume(A, B)),
			[
			d(many_consume(A, C)),
		], [])).eql(
			path([A, B]),
		)

		expect(compute_decidable(
			d(many_consume(A, B, C)),
			[
			d(consume(A, B), many_consume(D, A, B, C)),
		], [])).eql(
			path([A, B, C]),
		)

		expect(compute_decidable(
			d(many_consume(A, B, D, E)),
			[
			d(consume(A, B), many_consume(D, A, B, C)),
		], [])).eql(
			path([A, B, D, E]),
		)
	})

	it('undecidable many', () => {
		expect(() => compute_decidable(
			d(many_consume(A, B, C)),
			[
			// the problem here is that the many will always eat into this,
			// and prevent it from ever happening
			// they need to restructure their grammar
			d(consume(A, B, C, D)),
		], [])).throw('undecidable')

		expect(() => compute_decidable(
			d(many_consume(A, B, C)),
			[
			d(consume(A, B), many_consume(C, A, B)),
		], [])).throw('undecidable')
	})

	it('complex branches', () => {
		expect(compute_decidable(
			d(
				consume(A, B),
				or(
					[consume(C, D, E)],
					[consume(D)],
				),
				consume(A, C, A)
			),
			[
			d(
				consume(A),
				or(
					[consume(B, D)],
					[consume(B, C)],
				),
			),
		], [])).eql(
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
				consume(A, B),
				or(
					[consume(C, D, E)],
					[consume(D)],
				),
				consume(A, C, A),
			),
			[
			d(
				or(
					[consume(A, B), or(
						[consume(C, A)],
						[consume(C, D, E)],
					)],
					[consume(A, B, E), maybe_consume(A, C, A)],
				),
			),
		], [])).eql(
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
			d(many(maybe_consume(D), consume(B, C, E))),
			[
			d(many(consume(B), maybe_consume(C), consume(A))),
		], [])).eql(
			path(
				branch(
					path([D]),
					path([B, C, E]),
				),
			)
		)
	})
})
