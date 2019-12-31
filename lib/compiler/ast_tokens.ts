import { Dict } from '@ts-std/types'
import { Maybe } from '@ts-std/monads'

import { Registry } from './ast'
import { debug, NonLone } from '../utils'
import { escape_string } from '../runtime/lexer'

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


export abstract class _RegexComponent {
	protected abstract modifier: Modifier
	abstract _source(): string
	into_regex_source(): string {
		const rendered_modifier = modifier_to_source(this.modifier)
		return rendered_modifier.length !== 0
			? `(?:${this._source()})${rendered_modifier}`
			: this._source()
	}
}

export type RegexComponent =
	| Concat
	| Union
	| TokenString
	| TokenReference
	| CharacterClass
	| CharacterClassReference
	// | SpecialCharacter


export class Concat extends _RegexComponent {
	constructor(readonly segments: NonLone<_RegexComponent>, protected modifier: Modifier) { super() }

	_source() {
		// return '(?:' + this.segments.map(p => p.into_regex_source()).join('') + ')'
		return this.segments.map(p => p.into_regex_source()).join('')
	}
	modify(modifier: Modifier) {
		this.modifier = modifier
		return this
	}
}

export class Union extends _RegexComponent {
	constructor(readonly segments: NonLone<_RegexComponent>, protected modifier: Modifier) { super() }

	_source() {
		// return `(?:${this.segments.map(p => p.into_regex_source()).join('|')})`
		return this.segments.map(p => p.into_regex_source()).join('|')
	}
	modify(modifier: Modifier) {
		this.modifier = modifier
		return this
	}
}

export class TokenString extends _RegexComponent {
	constructor(readonly value: string, protected modifier: Modifier) { super() }

	_source() {
		// return `(?:${escape_string(this.value)})`
		return escape_string(this.value)
	}
	modify(modifier: Modifier) {
		this.modifier = modifier
		return this
	}
}

export class TokenReference extends _RegexComponent {
	constructor(readonly token_name: string, protected modifier: Modifier) { super() }

	_source() {
		return Registry.get_token_def(this.token_name).unwrap().def.into_regex_source()
	}
	modify(modifier: Modifier) {
		this.modifier = modifier
		return this
	}
}

// export class SpecialCharacter extends _RegexComponent {
// 	// constructor(readonly character: '[^]' | '^' | '$') {}
// 	constructor(readonly character: '[^]' | '$') { super() }

// 	_source() {
// 		return character
// 	}
// }

export class CharacterClass extends _RegexComponent {
	constructor(readonly source: string, readonly negated: boolean, protected modifier: Modifier) { super() }

	_source() {
		return `[${this.negated ? '^' : ''}${this.source.replace(/\^/g, '\\^')}]`
	}
	change(negated: boolean, modifier: Modifier) {
		return new CharacterClass(this.source, negated, modifier)
	}
	modify(modifier: Modifier) {
		return new CharacterClass(this.source, this.negated, modifier)
	}
}

export class CharacterClassReference extends _RegexComponent {
	constructor(readonly class_name: string, readonly negated: boolean, protected modifier: Modifier) { super() }

	_source() {
		const class_source = Maybe.from_nillable(builtins[this.class_name]).unwrap()
		return `[${this.negated ? '^' : ''}${class_source.replace(/\^/g, '\\^')}]`
	}
	change(negated: boolean, modifier: Modifier) {
		return new CharacterClassReference(this.class_name, negated, modifier)
	}
	modify(modifier: Modifier) {
		return new CharacterClassReference(this.class_name, this.negated, modifier)
	}
}


export const builtins = {
	// any: new SpecialCharacter('[^]'),
	// begin: new SpecialCharacter('^'),
	// end: new SpecialCharacter('$'),
	// boundary: new SpecialCharacter('\\b'),

	alphanumeric: '0-9a-zA-Z',
	alnum: '0-9A-Za-z',

	alphabetic: 'a-zA-Z',
	alpha: 'A-Za-z',

	numeric: '0-9',
	digit: '0-9',

	lower: 'a-z',
	lowercase: 'a-z',

	uppercase: 'A-Z',
	upper: 'A-Z',

	whitespace: '\\t\\n\\v\\f\\r ',
	space: '\\t\\n\\v\\f\\r ',

	ascii: '\\x00-\\x7F',
	blank: '\\t ',
	cntrl: '\\x00-\\x1F\\x7F',
	graph: '!-~',
	print: ' -~',
	punct: '!-/:-@[-`{-~',
	word: '0-9A-Za-z_',
	xdigit: '0-9A-Fa-f',

	// https://www.compart.com/en/unicode/category
	// https://2ality.com/2017/07/regexp-unicode-property-escapes.html
	// https://mathiasbynens.be/notes/es-unicode-property-escapes
	unicode_digit: '\\p{Decimal_Number}',
	unicode_numeric: '\\p{Number}',
	unicode_word: '\\p{Alphabetic}\\p{Mark}\\p{Decimal_Number}\\p{Connector_Punctuation}\\p{Join_Control}',
	// unicode_whitespace: '\\s',
	unicode_whitespace: '\\p{White_Space}',

	// \d digit (\p{Nd})
	// \s whitespace (\p{White_Space})
	// \w word character (\p{Alphabetic} + \p{M} + \d + \p{Pc} + \p{Join_Control})
} as Readonly<Dict<string>>


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
