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

		const contents = toks.slice(3, 10)
		expect((contents[0] as any).content).eql('\n\n')
		expect((contents[1] as any).content).eql('jkfg ;l {}d 893 d#@# sdlfk\n')
		expect((contents[2] as any).content).eql('     djfsadkf dfsadf asdfasf\n\n')
		expect((contents[3] as any).content).eql('	sdfd\n')
		expect((contents[4] as any).content).eql('	sdfkjd f;adfk\n')
		expect((contents[5] as any).content).eql(' adf\n\n\n\n')
		expect((contents[6] as any).content).eql('     ffdgadf\n')

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
