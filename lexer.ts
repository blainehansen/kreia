const sample = `\
thing
stuff what
	how
	thing
		other
	stuff
dude

thing

	stuff
`


const space = /^ +/
const newline = /^\n+/
const tab = /^\t+/
const symbol = /^\w+/

enum BaseTokenType {
	space = 'space',
	newline = 'newline',
	tab = 'tab',
	symbol = 'symbol',
}

const toks = [
	{ regex: space, type: BaseTokenType.space },
	{ regex: newline, type: BaseTokenType.newline },
	{ regex: tab, type: BaseTokenType.tab },
	{ regex: symbol, type: BaseTokenType.symbol },
]

enum TokenType {
	SPACE = 'SPACE',
	NEWLINE = 'NEWLINE',
	SYMBOL = 'SYMBOL',
	INDENT = 'INDENT',
	DEINDENT = 'DEINDENT',
}


function map_base_to_type(t: BaseTokenType): TokenType {
	switch (t) {
		case BaseTokenType.newline:
			return TokenType.NEWLINE
		case BaseTokenType.space:
			return TokenType.SPACE
		case BaseTokenType.symbol:
			return TokenType.SYMBOL
		case BaseTokenType.tab:
			throw new Error("can't map tab")
	}
}


function* indentation_lexer(input_text: string) {
	let text = input_text
	let program_indentation = 0
	// conceptually, at the beginning of parsing it's as if we just had a newline
	// with a program_indentation of 0.
	// If the program starts with a tab then it's incorrect.
	let last_was_newline = true

	while (text.length > 0) {
		for (const { regex, type } of toks) {
			const match = text.match(regex)
			if (match === null)
				continue

			const match_content = match[0]
			text = text.slice(match_content.length)

			const is_tab = type === BaseTokenType.tab

			if (!last_was_newline && is_tab)
				yield { token_type: TokenType.SPACE, text_value: match_content }

			if (last_was_newline) {
				const current_indentation = is_tab
					? match_content.length
					: 0

				// by definition, this can only happen if the token is a tab
				if (current_indentation === program_indentation + 1)
					yield { token_type: TokenType.INDENT, text_value: match_content }

				else if (current_indentation < program_indentation) {
					while (current_indentation < program_indentation) {
						yield { token_type: TokenType.DEINDENT, text_value: '' }
						program_indentation--
					}
				}
				else if (current_indentation !== program_indentation)
					throw new Error("indentation increased by more than one")

				program_indentation = current_indentation
			}

			if (!is_tab)
				yield { token_type: map_base_to_type(type), text_value: match_content }
			last_was_newline = type == BaseTokenType.newline
		}
	}

	while (program_indentation > 0) {
		yield { token_type: TokenType.DEINDENT, text_value: '' }
		program_indentation--
	}
}


const g = indentation_lexer(sample)

let v = g.next().value
while (v !== undefined) {
	console.log(v)
	v = g.next().value
}


// class IndentationLexer {
// 	private last_was_newline = false
// 	private current_indentation_level = 0

// 	constructor(private text: string) {}

// 	next(): { type: TokenType, value: string } | undefined {
// 		for (const { regex, type } of toks) {
// 			const match = this.text.match(regex)
// 			if (match !== null) {
// 				const value = match[0]
// 				switch (type) {
// 					case BaseTokenType.space:
// 						if (this.last_was_newline)
// 							throw new Error("space at the beginning of a line")
// 						this.last_was_newline = false
// 						return { value, type: TokenType.SPACE }

// 					case BaseTokenType.newline:
// 						const possible_tab = this.text.match(tab)

// 						while (current_indentation_level)
// 						this.last_was_newline = true
// 						return { value, type: TokenType. }

// 					case BaseTokenType.tab:
// 						this.last_was_newline = false
// 						return { value, type: TokenType. }

// 					case BaseTokenType.name:
// 						this.last_was_newline = false
// 						return { value, type: TokenType. }

// 					default:
// 						return exhaustive()
// 				}
// 			}
// 		}

// 		return undefined
// 	}
// }


// function exhaustive(): never {
// 	throw new Error()
// }
