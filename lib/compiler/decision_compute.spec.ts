import 'mocha'
import { expect } from 'chai'
import { tuple as t } from '@ts-std/types'

import * as a from './ast'
import { compute_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'

const empty_scope = { current: a.Scope(undefined, undefined), previous: [] }

function d(node: a.Node): [a.Definition, a.ScopeStack] {
	return t([node], empty_scope)
}
function n(node: a.Node): [a.Node, a.ScopeStack] {
	return t(node, empty_scope)
}

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
		d(a.maybe_many_consume('space', 'num')), [],
		[n(
			a.maybe_many(
				a.consume('space', 'bar', 'space'),
				a.consume('num'),
				a.maybe_many_consume('space', 'num'),
			),
		)],
	)).eql(
		path(['space', 'num']),
	)
}))


// describe('decision_compute cases', () => it('works', () => {
// 	// (A B C)? (A B)+
// 	expect(compute_decidable(
// 		a.maybe()
// 	))

// 	// (A B C)+ (A B)+

// 	// (A B C)* (A B)+

// 	// (A B D | A C D) (A (B | C))+
// }))
