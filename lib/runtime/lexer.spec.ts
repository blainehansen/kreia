import 'mocha'
import { expect } from 'chai'

import { Span, SourceState, SourceFile, UserToken, RawToken, VirtualToken, EmptyVirtualToken, finalize_regex, Lexer } from './lexer'

describe('Lexer.advance_span_indices', () => it('works', () => {
	expect(Lexer.advance_span_indices('one', 0, 1, 0)).eql([3, 1, 3])
	expect(Lexer.advance_span_indices('one', 2, 4, 6)).eql([5, 4, 9])

	expect(Lexer.advance_span_indices('one\nlinetwo', 0, 1, 0)).eql([11, 2, 7])
	expect(Lexer.advance_span_indices('one\nlinetwo', 2, 4, 6)).eql([13, 5, 7])

	expect(Lexer.advance_span_indices('one\n\nlinetwo', 0, 1, 0)).eql([12, 3, 7])
	expect(Lexer.advance_span_indices('one\n\nlinetwo', 2, 4, 6)).eql([14, 6, 7])

	expect(Lexer.advance_span_indices('one\ne\nlinetwo', 0, 1, 0)).eql([13, 3, 7])
	expect(Lexer.advance_span_indices('one\ne\nlinetwo', 2, 4, 6)).eql([15, 6, 7])

	expect(Lexer.advance_span_indices('\n', 0, 1, 0)).eql([1, 2, 0])
	expect(Lexer.advance_span_indices('\n', 2, 4, 6)).eql([3, 5, 0])

	expect(Lexer.advance_span_indices('\n\n', 0, 1, 0)).eql([2, 3, 0])
	expect(Lexer.advance_span_indices('\n\n', 2, 4, 6)).eql([4, 6, 0])

	expect(Lexer.advance_span_indices('\n\nlinetwo', 0, 1, 0)).eql([9, 3, 7])
	expect(Lexer.advance_span_indices('\n\nlinetwo', 2, 4, 6)).eql([11, 6, 7])

	expect(Lexer.advance_span_indices('', 0, 1, 0)).eql([0, 1, 0])
	expect(Lexer.advance_span_indices('', 2, 4, 6)).eql([2, 4, 6])
}))

describe('finalize_regex', () => it('works', () => {
	expect(finalize_regex('[a]')).eql(/^(?:\[a\])/)
	expect(finalize_regex(/qwer|asdf/)).eql(/^(?:qwer|asdf)/)

	expect(() => finalize_regex(/.*/)).throw()
	expect(() => finalize_regex(/.?/)).throw()
}))

describe('Lexer.attempt_regex', () => it('works', () => {
	function s(
		re: string, source: string, index: number, line: number, column: number,
		expected: { line: number, column: number } | undefined,
	) {
		const regex = finalize_regex(re)
		const file = { source }
		const source_state = { source: source.slice(index), index, line, column }

		expect(Lexer.attempt_regex(regex, source_state, file)).eql(
			expected
				? [
					re,
					{ file, start: index, end: index + re.length, line, column },
					{ source: source.slice(index + re.length), index: index + re.length, ...expected },
				]
				: undefined,
		)
	}

	s('one', 'one[whatever]', 0, 1, 0, { line: 1, column: 3 })
	s('one', 'a one[whatever]', 2, 4, 6, { line: 4, column: 9 })
	s('one', 'asdf[whatever]', 0, 1, 0, undefined)

	s('on\ne', 'on\ne[whatever]', 0, 1, 0, { line: 2, column: 1 })
	s('on\ne', 'a on\ne[whatever]', 2, 4, 6, { line: 5, column: 1 })
}))



describe('Span.around', () => {
	it('basic', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.around(a, b)).eql({ file, start: 2, end: 5, line: 1, column: 2 })
	})

	it('lines between', () => {
		const file = { source: '__a\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 6, end: 7, line: 3, column: 0 } }
		expect(Span.around(a, b)).eql({ file, start: 2, end: 7, line: 1, column: 2 })
	})

	it('virtual a', () => {
		const file = { source: '__a_b__' }
		const a: EmptyVirtualToken = { type: VirtualToken('a', 'a'), is_virtual: true, span: { file, index: 2, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.around(a, b)).eql({ file, start: 2, end: 5, line: 1, column: 2 })
	})

	it('virtual b', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: EmptyVirtualToken = { type: VirtualToken('b', 'b'), is_virtual: true, span: { file, index: 5, line: 1, column: 5 } }
		expect(Span.around(a, b)).eql({ file, start: 2, end: 5, line: 1, column: 2 })
	})
})

describe('Span.between', () => {
	it('basic', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.between(a, b)).eql({ file, start: 3, end: 4, line: 1, column: 3 })
	})

	it('lines between', () => {
		const file = { source: '__a\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 6, end: 7, line: 3, column: 0 } }
		expect(Span.between(a, b)).eql({ file, start: 3, end: 6, line: 1, column: 3 })
	})
	it('lines within a', () => {
		const file = { source: '__a\na\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a\na', is_virtual: false, span: { file, start: 2, end: 5, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 8, end: 9, line: 4, column: 0 } }
		expect(Span.between(a, b)).eql({ file, start: 5, end: 8, line: 2, column: 1 })
	})

	it('virtual a', () => {
		const file = { source: '__a_b__' }
		const a: EmptyVirtualToken = { type: VirtualToken('a', 'a'), is_virtual: true, span: { file, index: 2, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.between(a, b)).eql({ file, start: 2, end: 4, line: 1, column: 2 })
	})

	it('virtual b', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: EmptyVirtualToken = { type: VirtualToken('b', 'b'), is_virtual: true, span: { file, index: 5, line: 1, column: 5 } }
		expect(Span.between(a, b)).eql({ file, start: 3, end: 5, line: 1, column: 3 })
	})
})

describe('Span.exclude_start', () => {
	it('basic', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.exclude_start(a, b)).eql({ file, start: 3, end: 5, line: 1, column: 3 })
	})

	it('lines between', () => {
		const file = { source: '__a\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 6, end: 7, line: 3, column: 0 } }
		expect(Span.exclude_start(a, b)).eql({ file, start: 3, end: 7, line: 1, column: 3 })
	})
	it('lines within a', () => {
		const file = { source: '__a\na\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a\na', is_virtual: false, span: { file, start: 2, end: 5, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 8, end: 9, line: 4, column: 0 } }
		expect(Span.exclude_start(a, b)).eql({ file, start: 5, end: 9, line: 2, column: 1 })
	})

	it('virtual a', () => {
		const file = { source: '__a_b__' }
		const a: EmptyVirtualToken = { type: VirtualToken('a', 'a'), is_virtual: true, span: { file, index: 2, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.exclude_start(a, b)).eql({ file, start: 2, end: 5, line: 1, column: 2 })
	})

	it('virtual b', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: EmptyVirtualToken = { type: VirtualToken('b', 'b'), is_virtual: true, span: { file, index: 5, line: 1, column: 5 } }
		expect(Span.exclude_start(a, b)).eql({ file, start: 3, end: 5, line: 1, column: 3 })
	})
})

describe('Span.exclude_end', () => {
	it('basic', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.exclude_end(a, b)).eql({ file, start: 2, end: 4, line: 1, column: 2 })
	})

	it('lines between', () => {
		const file = { source: '__a\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 6, end: 7, line: 3, column: 0 } }
		expect(Span.exclude_end(a, b)).eql({ file, start: 2, end: 6, line: 1, column: 2 })
	})
	it('lines within a', () => {
		const file = { source: '__a\na\n_\nb__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a\na', is_virtual: false, span: { file, start: 2, end: 5, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 8, end: 9, line: 4, column: 0 } }
		expect(Span.exclude_end(a, b)).eql({ file, start: 2, end: 8, line: 1, column: 2 })
	})

	it('virtual a', () => {
		const file = { source: '__a_b__' }
		const a: EmptyVirtualToken = { type: VirtualToken('a', 'a'), is_virtual: true, span: { file, index: 2, line: 1, column: 2 } }
		const b: RawToken = { type: UserToken('b', 'b'), content: 'b', is_virtual: false, span: { file, start: 4, end: 5, line: 1, column: 5 } }
		expect(Span.exclude_end(a, b)).eql({ file, start: 2, end: 4, line: 1, column: 2 })
	})

	it('virtual b', () => {
		const file = { source: '__a_b__' }
		const a: RawToken = { type: UserToken('a', 'a'), content: 'a', is_virtual: false, span: { file, start: 2, end: 3, line: 1, column: 2 } }
		const b: EmptyVirtualToken = { type: VirtualToken('b', 'b'), is_virtual: true, span: { file, index: 5, line: 1, column: 5 } }
		expect(Span.exclude_end(a, b)).eql({ file, start: 2, end: 5, line: 1, column: 2 })
	})
})
