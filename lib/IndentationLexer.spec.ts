import 'mocha'
import { expect } from 'chai'

import { Lexer, UserToken } from './lexer'
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

describe('IndentationLexer', () => {
	it('basically works', () => {
		const defs = IndentationLexer.use()
		if (defs.length !== 3)
			throw new Error()
		const [indent, deindent, indent_continue] = defs
		const name = UserToken('name', /[a-z]+/)

		const lexer = new Lexer({ IndentationLexer }, source)

		expect(lexer.test([name, indent_continue])).false
		expect(lexer.test([name, indent])).true
		expect(lexer.test([name, indent_continue])).false
		expect(lexer.test([name, indent])).true

		const toks = lexer.require([
			name, indent, name, deindent,
			name, indent_continue, name,
			indent, name, indent, name, indent_continue, name,
			indent, name, deindent, deindent,
			name, indent, name,
			deindent, deindent,
		])!
		expect(toks.length).eql(22)

		expect(lexer.test([name])).false
		expect(lexer.test([indent])).false
		expect(lexer.test([deindent])).false
		expect(lexer.test([indent_continue])).false

		expect(() => lexer.exit()).not.throw()
	})
})
