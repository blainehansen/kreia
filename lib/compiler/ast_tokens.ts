import { Dict } from '@ts-std/types'
import { debug, NonLone } from '../utils'
import { validate_regex } from '../runtime/lexer'
import { Registry } from './ast'

function escape_string(def: string) {
	return def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}


type Modifier =
	| undefined
	| '+' | '*' | '?'
	| number
	| [number, number | undefined]

function modifier_to_source(modifier: Modifier): string {
	if (modifier === undefined) return ''
	if (typeof modifier === 'string') return modifier
	if (typeof modifier === 'number') return `{${modifier}}`
	const [begin, end] = modifier
	return `{${begin},${end !== undefined ? '' + end : ''}}`
}


export abstract class RegexComponent {
	abstract readonly modifier: Modifier
	abstract _source(): string
	into_regex_source(): string {
		return this._source() + modifier_to_source(this.modifier)
	}
}

export class Concat extends RegexComponent {
	constructor(readonly segments: NonLone<RegexComponent>, readonly modifier: Modifier) { super() }

	_source() {
		return '(?:' + this.segments.map(p => p.into_regex_source()).join('') + ')'
	}
}

export class Union extends RegexComponent {
	constructor(readonly segments: NonLone<RegexComponent>, readonly modifier: Modifier) { super() }

	_source() {
		return this.segments.map(p => p.into_regex_source()).join('|')
	}
}

export class TokenString extends RegexComponent {
	constructor(readonly value: string, readonly modifier: Modifier) { super() }

	_source() {
		return `(?:${escape_string(this.value)})`
	}
}

export class TokenReference extends RegexComponent {
	constructor(readonly token_name: string, readonly modifier: Modifier) { super() }

	_source() {
		return Registry.get_token_def(this.token_name).unwrap().def.into_regex_source()
	}
}

// export class SpecialCharacter extends RegexComponent {
// 	// constructor(readonly character: '[^]' | '^' | '$') {}
// 	constructor(readonly character: '[^]' | '$') { super() }

// 	_source() {
// 		return character
// 	}
// }

export class CharacterClass extends RegexComponent {
	constructor(readonly source: string, readonly negated: boolean, readonly modifier: Modifier) { super() }

	_source() {
		return `[${this.negated ? '^' : ''}${this.source.replace(/\^/g, '\\^')}]`
	}
}

export function make_regex(entry: RegexComponent) {
	// const final_regex = new RegExp(`^(?:${entry.into_regex_source()})`, 'u')
	const final_regex = new RegExp(`^${entry.into_regex_source()}`, 'u')
	return validate_regex(final_regex)
}


export const builtins = {
	// any: new SpecialCharacter('[^]'),
	// begin: new SpecialCharacter('^'),
	// end: new SpecialCharacter('$'),
	// boundary: new SpecialCharacter('\\b'),

	alphanumeric: new CharacterClass('0-9a-zA-Z', false, undefined),
	alnum: new CharacterClass('0-9A-Za-z', false, undefined),

	alphabetic: new CharacterClass('a-zA-Z', false, undefined),
	alpha: new CharacterClass('A-Za-z', false, undefined),

	numeric: new CharacterClass('0-9', false, undefined),
	digit: new CharacterClass('0-9', false, undefined),

	lower: new CharacterClass('a-z', false, undefined),
	lowercase: new CharacterClass('a-z', false, undefined),

	uppercase: new CharacterClass('A-Z', false, undefined),
	upper: new CharacterClass('A-Z', false, undefined),

	whitespace: new CharacterClass('\\t\\n\\v\\f\\r ', false, undefined),
	space: new CharacterClass('\\t\\n\\v\\f\\r ', false, undefined),

	ascii: new CharacterClass('\\x00-\\x7F', false, undefined),
	blank: new CharacterClass('\\t ', false, undefined),
	cntrl: new CharacterClass('\\x00-\\x1F\\x7F', false, undefined),
	graph: new CharacterClass('!-~', false, undefined),
	print: new CharacterClass(' -~', false, undefined),
	punct: new CharacterClass('!-/:-@[-`{-~', false, undefined),
	word: new CharacterClass('0-9A-Za-z_', false, undefined),
	xdigit: new CharacterClass('0-9A-Fa-f', false, undefined),

	// https://www.compart.com/en/unicode/category
	// https://2ality.com/2017/07/regexp-unicode-property-escapes.html
	// https://mathiasbynens.be/notes/es-unicode-property-escapes
	unicode_digit: new CharacterClass('\\p{Decimal_Number}', false, undefined),
	unicode_numeric: new CharacterClass('\\p{Number}', false, undefined),
	unicode_word: new CharacterClass(
		'\\p{Alphabetic}\\p{Mark}\\p{Decimal_Number}\\p{Connector_Punctuation}\\p{Join_Control}',
		false, undefined,
	),
	// unicode_whitespace: new CharacterClass('\\s', false, undefined),
	unicode_whitespace: new CharacterClass('\\p{White_Space}', false, undefined),

	// \d digit (\p{Nd})
	// \s whitespace (\p{White_Space})
	// \w word character (\p{Alphabetic} + \p{M} + \d + \p{Pc} + \p{Join_Control})
} as Readonly<Dict<RegexComponent>>


// eventually add property escapes
// \p{words}

// strings can be made case-insensitive with i after
// "span"i
// something to make things exact....
// !("span"i, "div"i)


// here's a list of all the base token macros (allow people to define their own?)
// #exact(a: Regex) // wraps it in word boundaries \b
// #enclosed(a: Character) // creates a regex that matches anything enclosed in a, allowing escape with /
// #enclosed_except(a: Character, d: CharacterClass) // same as #enclosed, but disallows anything matching d within the enclosure
// #enclosed_non_empty(a: Regex) // same as enclosed but uses + instead of * for the enclosure content
// #open_close(begin: Character, end: Character) // creates a regex that matches anything enclosed by begin then end
// #open_close_except(begin: Character, end: Character, d: CharacterClass)
