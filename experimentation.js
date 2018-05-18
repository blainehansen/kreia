const util = require('util')
function log(obj) {
	console.log(util.inspect(obj, { depth: null }))
}

const lexing = require('./src/lexing')

const lexer = lexing.compile({
	Primitive: ['null', 'undefined', 'true', 'false'],
	Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
})

lexer.reset("null \n true")

console.log(Array.from(lexer))
