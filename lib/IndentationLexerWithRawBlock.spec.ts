import 'mocha'
import { expect } from 'chai'

import { Lexer, UserToken } from './lexer'
import { IndentationLexerWithRawBlock } from './IndentationLexerWithRawBlock'

const source = `\
a
	|"


		jkfg ;l {}d 893 d#@# sdlfk
		     djfsadkf dfsadf asdfasf

			sdfd
			sdfkjd f;adfk
		 adf



		     ffdgadf
	b`


describe('IndentationLexerWithRawBlock', () => {
	it('basically works', () => {
		const defs = IndentationLexerWithRawBlock.use()
		if (defs.length !== 6)
			throw new Error()
		const [indent, deindent, indent_continue, raw_block_begin, raw_block_content, raw_block_end] = defs
		const name = UserToken('name', /[a-z]+/)

		const lexer = new Lexer({ IndentationLexer: IndentationLexerWithRawBlock }, source)

		expect(lexer.test([name, indent_continue])).false
		expect(lexer.test([name, indent])).true
		expect(lexer.test([name, indent_continue])).false
		expect(lexer.test([name, indent])).true

		const toks = lexer.require([
			name, indent,
			raw_block_begin,
			raw_block_content,
			raw_block_content,
			raw_block_content,
			raw_block_content,
			raw_block_content,
			raw_block_content,
			raw_block_content,
			raw_block_end,
			name, deindent,
		])!

		expect(toks.length).eql(13)

		expect(lexer.test([name])).false
		expect(lexer.test([indent])).false
		expect(lexer.test([deindent])).false
		expect(lexer.test([indent_continue])).false
		expect(lexer.test([raw_block_begin])).false
		expect(lexer.test([raw_block_content])).false
		expect(lexer.test([raw_block_end])).false

		expect(() => lexer.exit()).not.throw()
	})
})
