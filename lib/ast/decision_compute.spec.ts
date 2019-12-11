import 'mocha'
import { expect } from 'chai'

describe('tail ambiguity' () => it('works', () => {
	consume('num')
	maybe_many_consume('space', 'num')
	maybe_many(
		consume('space', 'bar', 'space')
		consume('num')
		maybe_many_consume('space', 'num')
	)

	// many_separated(
	// 	many_separated(
	// 		consume('num'),
	// 		consume('space'),
	// 	),
	// 	consume('space', 'bar', 'space')
	// )
}))

// @many_separated[$body, $separator] = $body ($separator $body)*

// @many_separated[
// 	@many_separated[num, space],
// 	space bar space
// ] = @many_separated[num, space] (space bar space @many_separated[num, space])*

// @many_separated[
// 	@many_separated[num, space],
// 	space bar space
// ] = num (space num)* (space bar space num (space num)*)*
