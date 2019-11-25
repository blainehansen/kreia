import { tuple as t } from '@ts-std/types'

import { log } from './utils'
import { path, branch } from './decision'
import { Token, TokenDefinition, UserToken } from './lexer'
import { ParseEntity, ChoicesReturn, Parser, f } from './parser'

const source = `
	(1, 2, 3, nil) ()
	(nil, nil)
	(1, (2, 3, 4), (((), nil)))
`

const tok = {
	LeftParen: UserToken('LeftParen', '('),
	RightParen: UserToken('RightParen', ')'),
	Num: UserToken('Num', /[0-9]+/),
	Nil: UserToken('Nil', 'nil'),
	Comma: UserToken('Comma', ','),
	Whitespace: UserToken('Whitespace', { match: /\s+/, ignore: true }),
}

const {
	reset,
	consume,
	maybe,
	or,
	maybe_or,
	many,
	maybe_many,
	many_separated,
	maybe_many_separated,
} = Parser({}, [tok.Whitespace], source)

const _0 = path([tok.LeftParen])
const _1 = branch(path([tok.Num]), path([tok.Nil]))
const _2 = branch(_0, path(_1))

function lists() {
	return many(parenthesized_number_list, _0)
}

function parenthesized_number_list() {
	consume(tok.LeftParen)
	const list = maybe(number_list, _2)
	consume(tok.RightParen)
	return list
}


function number_list() {
	return many_separated(
		f(() => or(
			f(parenthesized_number_list, _0),
			f(() => or(
				t(tok.Num),
				t(tok.Nil),
			), _1),
		), _0),
		t(tok.Comma),
	)
}

log(lists())


// postgres_string<$sigil = %ident> =
// 	%dollar $sigil %dollar
// 	*
// 		| %not_dollar
// 		| %escape $dollar
// 	%dollar $sigil %dollar


// const source = `
//   $a$ dfjsdk dfkdjfkd
// 	sdfdjfk asdfdsk
// 	dkkjfdk
// 	$a$
// `

// const tok = {
// 	Whitespace: UserToken('Whitespace', { match: /\s+/, ignore: true }),
// 	Ident: UserToken('Ident', /[a-z]+/),
// 	Dollar: UserToken('Dollar', '$'),
// }

// const {
// 	reset,
// 	lock,
// 	consume,
// 	maybe,
// 	or,
// 	maybe_or,
// 	many,
// 	maybe_many,
// 	many_separated,
// 	maybe_many_separated,
// } = Parser({}, [tok.Whitespace], source)

// function postgres_string() {
// 	const sigil = lock(tok.Ident)
// 	consume(tok.Dollar)
// 	const s = sigil()
// 	consume(tok.Dollar)
// 	const idents = maybe_many(tok.Ident) || []
// 	consume(tok.Dollar)
// 	sigil()
// 	consume(tok.Dollar)

// 	return t(s, idents)
// }

// log(postgres_string())
