// can do individual characters 'a' which can be any ascii character and the escape sequences supported by rust
// keep it simple for now a unicode character is '\u{any amount of }'

// eventually expand to this:
// \x7F        hex character code (exactly two digits)
// \x{10FFFF}  any hex character code corresponding to a Unicode code point
// \u007F      hex character code (exactly four digits)
// \u{7F}      any hex character code corresponding to a Unicode code point
// \U0000007F  hex character code (exactly eight digits)
// \U{7F}      any hex character code corresponding to a Unicode code point

// then there are ranges, which are always expressed by themselves in brackets []










// // the "base terminals" are all either CharacterClass or a String
// // but abstracted from any particular language and implementation

// // the most basic is simply a string using '' or ""
// // then there are all the base included "character classes"

// // they can be concatenated
// // &ascii_alphanumeric 'thing'
// // they can be unioned
// // &ascii_word | 'something'
// // they can be simply negated
// // ^&ascii_whitespace
// // they can be modified with ?, +, *, {n}, {n,}, {n,m}

// // strings can be made case-insensitive with i after
// // "span"i
// // something to make things exact....
// // !("span"i, "div"i)

// // here's a list of all the language's base regulars
// const any = new SpecialCharacter('[^]')
// const begin = new SpecialCharacter('^')
// const end = new SpecialCharacter('$')
// const word = new CharacterClass('0-9a-zA-Z_')
// const alphanumeric = new CharacterClass('0-9a-zA-Z')
// const alphabetic = new CharacterClass('a-zA-Z')
// const numeric = new CharacterClass('0-9')
// const lowercase = new CharacterClass('a-z')
// const uppercase = new CharacterClass('A-Z')
// const whitespace = new CharacterClass('\\t\\n\\v\\f\\r ')


// // here's a list of all the base token macros (allow people to define their own?)
// // #not(a: CharacterClass) // negates this CharacterClass, allowing for escaping with \
// // #not_custom_escape(a: CharacterClass, escape: Character) // negates, but requires custom escape
// // #exact(a: Regex) // wraps it in word boundaries \b
// // #enclosed(a: Character) // creates a regex that matches anything enclosed in a, allowing escape with /
// // #enclosed_except(a: Character, d: CharacterClass) // same as #enclosed, but disallows anything matching d within the enclosure
// // #enclosed_non_empty(a: Regex) // same as enclosed but uses + instead of * for the enclosure content
// // #open_close(begin: Character, end: Character) // creates a regex that matches anything enclosed by begin then end
// // #open_close_except(begin: Character, end: Character, d: CharacterClass)

// // all of the above that allow escaping also have a custom_escape version

// interface IntoRegex {
// 	into_regex(): RegExp,
// }

// class SpecialCharacter implements IntoRegex {
// 	constructor(readonly special: string) {}
// 	into_regex() {
// 		return new RegExp(this.char)
// 	}
// }

// class Character implements IntoRegex {
// 	constructor(readonly char: string) {
// 		if (char.length !== 1)
// 			throw new Error(`invalid character: ${char}`)
// 	}
// 	into_regex() {
// 		return new RegExp('\\' + this.char)
// 	}
// }

// class CharacterClass implements IntoRegex {
// 	constructor(readonly codes: string[], readonly negated = false) {
// 		if (char.length !== 1)
// 			throw new Error(`invalid character: ${char}`)
// 	}
// 	into_regex() {
// 		const code = this.codes.join('')
// 		return this.negated
// 			? new RegExp(`[^${code}]`)
// 			: new RegExp(`[${code}]`)
// 	}
// }
