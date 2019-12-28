import 'mocha'
import { expect } from 'chai'
import { tuple as t } from '@ts-std/types'

import { Lexer, UserToken } from '../runtime/lexer'
import { IndentationLexer } from './IndentationLexer'

const source = `\
a
	b

a
a
	b
		c
		c
			d
	b
		c`

const padded_source = `\
a
`

const name = UserToken('name', /[a-z]+/)
const [{ indent, deindent, indent_continue }, ] = IndentationLexer()
const [, lexer] = Lexer.create({}, { IndentationLexer: IndentationLexer() })

describe('IndentationLexer', () => {
	it('basically works', () => {
		lexer.reset(source)

		expect(lexer.test([name, indent_continue])).eql(undefined)
		expect(lexer.test([name, indent])).not.eql(undefined)
		expect(lexer.test([name, indent_continue])).eql(undefined)
		expect(lexer.test([name, indent])).not.eql(undefined)

		const toks = lexer.require([
			name, indent, name, deindent, indent_continue,
			name, indent_continue, name,
			indent, name, indent, name, indent_continue, name,
			indent, name, deindent, deindent, indent_continue,
			name, indent, name,
			deindent, deindent,
		])
		expect(toks.length).eql(24)

		expect(lexer.test([name])).eql(undefined)
		expect(lexer.test([indent])).eql(undefined)
		expect(lexer.test([deindent])).eql(undefined)
		expect(lexer.test([indent_continue])).eql(undefined)

		expect(() => lexer.exit()).not.throw()
	})

	// it('handles padded', () => {
	// 	lexer.reset(padded_source)

	// 	const toks = lexer.require([
	// 		name
	// 	])
	// 	expect(toks.length).eql(1)

	// 	expect(lexer.test([name])).eql(undefined)
	// 	expect(lexer.test([indent])).eql(undefined)
	// 	expect(lexer.test([deindent])).eql(undefined)
	// 	expect(lexer.test([indent_continue])).eql(undefined)

	// 	expect(() => lexer.exit()).not.throw()
	// })
})
