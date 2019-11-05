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
			path(0, [A]),
			[
			path(0, [B]),
			path(0, [C]),
		])).eql(path(1, [A]))

		expect(compute_path(
			path(0, [A, B, C]),
			[
			path(0, [A, B, C, D, E]),
		])).eql(path(3, [A, B, C]))

		expect(compute_path(
			path(0, [A, B, A]),
			[
			path(0, [A, C, A]),
		])).eql(path(2, [A, B]))

		expect(compute_path(
			path(0, [A, C, B, A, C]),
			[
			path(0, [A, C, D, A]),
			path(0, [A, C, B, A, E, A]),
		])).eql(path(5, [A, C, B, A, C]))
	})

	it('simple branches', () => {
		expect(compute_path(
			path(0, [A, B, C]),
			[
			path(0, [A], branch(true, path(2, [D, F]))),
		])).eql(path(2, [A, B]))

		expect(compute_path(
			path(0, [A, B, C]),
			[
			path(0, [A], branch(true, path(2, [B, F]))),
		])).eql(path(3, [A, B, C]))

		expect(compute_path(
			path(0, [A, B], branch(true, path(2, [F, G]))),
			[
			path(0, [A, B, E]),
		])).eql(path(2, [A, B]))
	})
})
