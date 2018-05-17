const util = require('util')
function log(obj) {
	console.log(util.inspect(obj, { depth: null }))
}

const moo = require('./src/moo')

const { matchToken, createCategory } = moo

const Identifier = createCategory('Identifier')
const Keyword = createCategory('Keyword')
// const Dangerous = createCategory('Dangerous')
// const Punctuation = createCategory('Punctuation')
// const Separator = createCategory('Separator', Punctuation)

const lexer = moo.compile({
	// Slash: { match: '/', categories: [Separator, Dangerous] },
	// LeftParen: { match: '(', categories: Separator },
	// RightParen: { match: ')', categories: Separator },
	// Dot: { match: '.', categories: Punctuation },
	// Number: /[0-9]+/,

	DiffIdent: { match: /[a-zA-Z]+/, categories: Identifier, keywords: {
		DiffKeyword: ['but', 'maybe', 'some'],
	}},

	// Ident: { match: /[a-zA-Z]+/, keywords: [
	// 	{ type: "ControlFlowKeyword", values: ['while', 'if', 'else'], categories: Keyword }
	// ]},
	Space: / +/,
})

const tok = lexer.tokenLibrary()
log(tok)

lexer.reset("while")
for (const token of lexer) {
	console.log(token)
	// console.log('is Slash: ', matchToken(token, tok.Slash))
	// console.log('is LeftParen: ', matchToken(token, tok.LeftParen))
	// console.log('is RightParen: ', matchToken(token, tok.RightParen))
	// console.log('is Dot: ', matchToken(token, tok.Dot))
	// console.log('is Number: ', matchToken(token, tok.Number))
	// console.log('is Space: ', matchToken(token, tok.Space))
	// console.log('is Ident: ', matchToken(token, tok.Ident))

	// console.log('')
	// console.log('is Punctuation: ', matchToken(token, Punctuation))
	// console.log('is Separator: ', matchToken(token, Separator))
	// console.log('is Dangerous: ', matchToken(token, Dangerous))
	// console.log('')
	// console.log('')
}
