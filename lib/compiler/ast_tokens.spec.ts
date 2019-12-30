import 'mocha'
import { expect } from 'chai'

import { Concat, Union, TokenString, CharacterClass, builtins, make_regex } from './ast_tokens'

describe('make_regex', () => it('works', () => {
	expect(make_regex(new Union([
		new Concat([builtins.uppercase, builtins.blank], undefined),
		builtins.word,
	], undefined))).eql(
		/^(?:[A-Z][\t ])|[0-9A-Za-z_]/u,
	)

	expect(make_regex(new CharacterClass('^\\\\/$%$#', true, 3))).eql(
		/^[^\^\\/$%$#]{3}/u
	)

	expect(make_regex(new CharacterClass('^\\\\/$%$#', true, [3, undefined]))).eql(
		/^[^\^\\/$%$#]{3,}/u
	)

	expect(make_regex(new CharacterClass('^\\\\/$%$#', true, [3, 6]))).eql(
		/^[^\^\\/$%$#]{3,6}/u
	)

	expect(make_regex(new CharacterClass('^\\\\/$%$#', false, '+'))).eql(
		/^[\^\\/$%$#]+/u
	)

	expect(make_regex(new Concat([new TokenString('span', '?'), builtins.numeric], '+'))).eql(
		/^(?:(?:span)?[0-9])+/u
	)

	expect(() => make_regex(new Concat([new TokenString('span', undefined), builtins.numeric], '*'))).throw()
	expect(() => make_regex(new Concat([new TokenString('span', undefined), builtins.numeric], '?'))).throw()
}))

describe('builtins', () => it("don't throw exceptions when you create them", () => {
	for (const builtin of Object.values(builtins))
		make_regex(builtin)
}))
