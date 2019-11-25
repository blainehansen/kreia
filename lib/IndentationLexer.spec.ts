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

		const lexer = new Lexer({ IndentationLexer }, [], source)

		expect(lexer.test([name, indent_continue])).eql(undefined)
		expect(lexer.test([name, indent])).not.eql(undefined)
		expect(lexer.test([name, indent_continue])).eql(undefined)
		expect(lexer.test([name, indent])).not.eql(undefined)

		const toks = lexer.require([
			name, indent, name, deindent,
			name, indent_continue, name,
			indent, name, indent, name, indent_continue, name,
			indent, name, deindent, deindent,
			name, indent, name,
			deindent, deindent,
		])
		expect(toks.length).eql(22)

		expect(lexer.test([name])).eql(undefined)
		expect(lexer.test([indent])).eql(undefined)
		expect(lexer.test([deindent])).eql(undefined)
		expect(lexer.test([indent_continue])).eql(undefined)

		expect(() => lexer.exit()).not.throw()
	})
})
