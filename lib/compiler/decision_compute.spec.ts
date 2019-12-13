import 'mocha'
import { expect } from 'chai'

import { tuple as t } from '@ts-std'

import * as a from './ast'
import { generate_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'

const empty_scope = a.Scope(undefined, undefined)

describe('tail ambiguity' () => it('works', () => {
	// @many_separated[$body, $separator] = $body ($separator $body)*

	// @many_separated[
	// 	@many_separated[num, space],
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

	expect(generate_decidable(
		a.maybe_many_consume('space', 'num'), empty_scope,
		[],
		[t(
			a.maybe_many(
				a.consume('space', 'bar', 'space')
				a.consume('num')
				a.maybe_many_consume('space', 'num')
			),
			empty_scope,
		)],
	)).eql(
		path(['space', 'num']),
	)
}))
