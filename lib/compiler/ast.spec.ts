import 'mocha'
import { expect } from 'chai'
import { mut_cluster_consumes, consume, maybe_consume, many_consume, maybe_many_consume, subrule } from './ast'

const r = 'some_rule'
const A = 'A'
const B = 'B'
const C = 'C'
const D = 'D'
const E = 'E'

describe('mut_cluster_consumes', () => it('works', () => {
	expect(mut_cluster_consumes([
		consume(A), consume(B), consume(C),
	])).eql([
		consume(A, B, C),
	])

	expect(mut_cluster_consumes([
		consume(A), consume(B),
		many_consume(C),
		consume(A), consume(B, A, B), consume(C),
		subrule(r),
		consume(B), consume(C),
	])).eql([
		consume(A, B),
		many_consume(C),
		consume(A, B, A, B, C),
		subrule(r),
		consume(B, C),
	])

	expect(mut_cluster_consumes([
		many_consume(A),
		consume(B), consume(C, D, E),
	])).eql([
		many_consume(A),
		consume(B, C, D, E),
	])

	expect(mut_cluster_consumes([
		maybe_consume(A),
		consume(B, A, B, C), consume(E),
	])).eql([
		maybe_consume(A),
		consume(B, A, B, C, E),
	])

	expect(mut_cluster_consumes([
		subrule(r),
		maybe_consume(A),
		consume(B, A, B, C), consume(E),
		subrule(r),
	])).eql([
		subrule(r),
		maybe_consume(A),
		consume(B, A, B, C, E),
		subrule(r),
	])

	expect(mut_cluster_consumes([
		maybe_many_consume(A),
		many_consume(B),
		consume(C),
	])).eql([
		maybe_many_consume(A),
		many_consume(B),
		consume(C),
	])
}))
