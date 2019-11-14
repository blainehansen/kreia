import 'mocha'
import { expect } from 'chai'

import { Token } from './lexer'
import { path, branch } from './decision'
// import { compute_decidable, register_tokens, Node, Definition, Subrule, Maybe, Many, Or, MacroCall, Consume } from './ast'
import { compute_decidable, register_tokens, Node, Definition, Maybe, Many, Or, Consume } from './ast'

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

	// it('complex branches', () => {
	// 	expect(compute_decidable(
	// 		path(
	// 			[A, B],
	// 			branch(false,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 			[A, C, A],
	// 		),
	// 		[
	// 		path(
	// 			[A],
	// 			branch(false,
	// 				path([B, D]),
	// 				path([B, C]),
	// 			),
	// 		),
	// 		path(
	// 			branch(false,
	// 				path([A, B], branch(false, path([C, A]), path([C, D, E]))),
	// 				path([A, B], branch(false, path([A, C, A]))),
	// 			),
	// 		),
	// 	])).eql(
	// 		path(
	// 			[A, B],
	// 			branch(false,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 			[A],
	// 		)
	// 	)

	// 	expect(compute_decidable(
	// 		path(
	// 			[A, B],
	// 			branch(false,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 			[A, C, A],
	// 		),
	// 		[
	// 		path(
	// 			[A],
	// 			branch(false,
	// 				path([B, D]),
	// 				path([B, C]),
	// 			),
	// 		),
	// 		path(
	// 			branch(false,
	// 				path([A, B], branch(false, path([C, D, E]))),
	// 				path([A, B], branch(false, path([A, C, A]))),
	// 			),
	// 		),
	// 	])).eql(
	// 		path(
	// 			[A, B],
	// 			branch(false,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 			[A],
	// 		)
	// 	)

	// 	expect(compute_decidable(
	// 		path(
	// 			[A, B],
	// 			branch(true,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 			[A, C, A],
	// 		),
	// 		[
	// 		path(
	// 			[A],
	// 			branch(false,
	// 				path([B, D]),
	// 				path([B, C]),
	// 			),
	// 		),
	// 		path(
	// 			branch(false,
	// 				path([A, B], branch(false, path([C, A]), path([C, D, E]))),
	// 				path([A, B], branch(false, path([A, C, A]))),
	// 			),
	// 		),
	// 	])).eql(
	// 		path(
	// 			[A, B],
	// 			branch(true,
	// 				path([C, D, E]),
	// 				path([D]),
	// 			),
	// 		)
	// 	)
	// })
})
