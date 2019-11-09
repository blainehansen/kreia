import 'mocha'
import { expect } from 'chai'

import { Token } from './states_lexer'
import { path, branch } from './decision'
import { compute_path } from './decision_compute'

const A = Token('A', 'A')
const B = Token('B', 'B')
const C = Token('C', 'C')
const D = Token('D', 'D')
const E = Token('E', 'E')
const F = Token('F', 'F')
const G = Token('G', 'G')
const H = Token('H', 'H')


describe('compute_path', () => {
	it('simple linear tokens', () => {
		expect(compute_path(
			path([A]),
			[
			path([B]),
			path([C]),
		])).eql(path([A]))

		expect(compute_path(
			path([A, B, C]),
			[
			path([A, B, C, D, E]),
		])).eql(path([A, B, C]))

		expect(compute_path(
			path([A, B, A]),
			[
			path([A, C, A]),
		])).eql(path([A, B]))

		expect(compute_path(
			path([A, C, B, A, C]),
			[
			path([A, C, D, A]),
			path([A, C, B, A, E, A]),
		])).eql(path([A, C, B, A, C]))

		expect(compute_path(
			path([A, C, B, A, C, E]),
			[
			path([A, C, D, A]),
			path([A, C, B, A, E, A]),
		])).eql(path([A, C, B, A, C]))
	})

	it('simple branches', () => {
		expect(compute_path(
			path([A, B, C]),
			[
			path([A], branch(true, path([D, F]))),
		])).eql(path([A, B]))

		expect(compute_path(
			path([A, B, C]),
			[
			path([A], branch(true, path([B, F]))),
		])).eql(path([A, B, C]))

		expect(compute_path(
			path([A, B], branch(true, path([F, G]))),
			[
			path([A, B, E]),
		])).eql(path([A, B]))

		expect(compute_path(
			path([A, B], branch(false, path([F, G]))),
			[
			path([A, B, E]),
		])).eql(path([A, B], branch(false, path([F]))))

		expect(compute_path(
			path([A, B], branch(true, path([C, D])), [E, F, A, B, C]),
			[
			path([A, B, E, G]),
			path([A, B, C, D, E, H]),
		])).eql(
			path([A, B], branch(true, path([C, D])), [E, F])
		)
	})

	it('complex branches', () => {
		expect(compute_path(
			path(
				[A, B],
				branch(false,
					path([C, D, E]),
					path([D]),
				),
				[A, C, A],
			),
			[
			path(
				[A],
				branch(false,
					path([B, D]),
					path([B, C]),
				),
			),
			path(
				branch(false,
					path([A, B], branch(false, path([C, A]), path([C, D, E]))),
					path([A, B], branch(false, path([A, C, A]))),
				),
			),
		])).eql(
			path(
				[A, B],
				branch(false,
					path([C, D, E]),
					path([D]),
				),
				[A],
			)
		)

		expect(compute_path(
			path(
				[A, B],
				branch(false,
					path([C, D, E]),
					path([D]),
				),
				[A, C, A],
			),
			[
			path(
				[A],
				branch(false,
					path([B, D]),
					path([B, C]),
				),
			),
			path(
				branch(false,
					path([A, B], branch(false, path([C, D, E]))),
					path([A, B], branch(false, path([A, C, A]))),
				),
			),
		])).eql(
			path(
				[A, B],
				branch(false,
					path([C, D, E]),
					path([D]),
				),
				[A],
			)
		)

		expect(compute_path(
			path(
				[A, B],
				branch(true,
					path([C, D, E]),
					path([D]),
				),
				[A, C, A],
			),
			[
			path(
				[A],
				branch(false,
					path([B, D]),
					path([B, C]),
				),
			),
			path(
				branch(false,
					path([A, B], branch(false, path([C, A]), path([C, D, E]))),
					path([A, B], branch(false, path([A, C, A]))),
				),
			),
		])).eql(
			path(
				[A, B],
				branch(true,
					path([C, D, E]),
					path([D]),
				),
			)
		)
	})
})
