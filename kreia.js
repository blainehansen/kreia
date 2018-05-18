const Parser = require('./src/parser')

const lexingFunctions = require('./src/lexing')

function createParser(lexerDefinition, defaultLookahead) {
	const lexer = lexingFunctions.compile(lexerDefinition)
	return [new Parser(lexer, defaultLookahead), lexer.tokenLibrary()]
}

function createStatesParser(lexerDefinition, defaultLookahead) {
	const lexer = lexingFunctions.states(lexerDefinition)
	return [new Parser(lexer, defaultLookahead), lexer.tokenLibrary()]
}

module.exports = {
	createParser,
	createStatesParser,
	lexingError: lexingFunctions.error,
	createTokenCategory: lexingFunctions.createCategory,
	matchToken: lexingFunctions.matchToken,
	matchTokens: lexingFunctions.matchTokens,
}
