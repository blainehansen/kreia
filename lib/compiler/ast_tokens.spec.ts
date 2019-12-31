import 'mocha'
import { expect } from 'chai'

import { finalize_regex } from '../runtime/lexer'
import { RegexComponent, Concat, Union, TokenString, CharacterClass, CharacterClassReference, builtins } from './ast_tokens'

function make(r: RegexComponent) {
	return finalize_regex(new RegExp(r.into_regex_source()))
}

describe('finalize_regex', () => it('works', () => {
	expect(make(new Union([
		new Concat([
			new CharacterClassReference('uppercase', false, undefined),
			new CharacterClassReference('blank', false, undefined),
		], undefined),
		new CharacterClassReference('word', false, undefined),
	], undefined))).eql(
		// /^(?:[A-Z][\t ]|[0-9A-Za-z_])/u,
		/^(?:[A-Z][\t ]|[0-9A-Za-z_])/,
	)

	expect(make(new CharacterClass('^\\\\/$%$#', true, 3))).eql(
		// /^[^\^\\/$%$#]{3}/u
		/^(?:(?:[^\^\\/$%$#]){3})/,
	)

	expect(make(new CharacterClass('^\\\\/$%$#', true, [3, undefined]))).eql(
		// /^[^\^\\/$%$#]{3,}/u
		/^(?:(?:[^\^\\/$%$#]){3,})/,
	)

	expect(make(new CharacterClass('^\\\\/$%$#', true, [3, 6]))).eql(
		// /^[^\^\\/$%$#]{3,6}/u
		/^(?:(?:[^\^\\/$%$#]){3,6})/,
	)

	expect(make(new CharacterClass('^\\\\/$%$#', false, '+'))).eql(
		// /^[\^\\/$%$#]+/u
		/^(?:(?:[\^\\/$%$#])+)/,
	)

	expect(make(new Concat([
		new TokenString('span', '?'),
		new CharacterClassReference('numeric', false, undefined),
	], '+'))).eql(
		// /^(?:(?:span)?[0-9])+/u
		/^(?:(?:(?:span)?[0-9])+)/,
	)

	expect(() => make(new Concat([
		new TokenString('span', undefined),
		new CharacterClassReference('numeric', false, undefined),
	], '*'))).throw()
	expect(() => make(new Concat([
		new TokenString('span', undefined),
		new CharacterClassReference('numeric', false, undefined),
	], '?'))).throw()
}))

describe('builtins', () => it("don't throw exceptions when you create them", () => {
	for (const builtin of Object.values(builtins))
		make(new CharacterClass(builtin, false, undefined))
}))
