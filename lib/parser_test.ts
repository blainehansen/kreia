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

const LeftParen = UserToken('LeftParen', '(')
const RightParen = UserToken('RightParen', ')')
const Num = UserToken('Num', /[0-9]+/)
const Nil = UserToken('Nil', 'nil')
const Comma = UserToken('Comma', ',')
const Whitespace = UserToken('Whitespace', { match: /\s+/, ignore: true })

const {
	reset, arg,
	consume, maybe,
	or, maybe_or,
	many, maybe_many,
	many_separated, maybe_many_separated,
} = Parser({}, [Whitespace], source)

// const Delimited = Macro(
// 	'delimited', [Arg('item'), Arg('delimiter')],
// 	Maybe(Var('delimiter')),
// 	Var('item'),
// 	Maybe(Many(Var('delimiter'), Var('item'))),
// 	Maybe(Var('delimiter')),
// )

// function delimited<ITEM extends ParseEntity, DELIMITER extends ParseEntity>(
function delimited<ITEM extends ParseBody, DELIMITER extends ParseBody>(
	item: ITEM, delimiter: DELIMITER, _d1: D, _d2: D, _d3: D,
) {
	maybe(item, _d1)
	arg(item)
	maybe_many(() => {
		arg(delimiter)
		arg(item)
	}, _d2)
	maybe(delimiter, _d3)
}


// const Enclosed = Macro(
// 	'enclosed', [Arg('begin'), Arg('middle'), Arg('end')],
// 	Var('begin'),
// 	MacroCall('many_separated', [Var('middle')], [Consume('Comma')])
// 	Var('end'),
// )

// function enclosed<BEGIN extends ParseEntity, MIDDLE extends ParseEntity, END extends ParseEntity>(
// 	begin: BEGIN, middle: MIDDLE, end: END,
// ) {
// 	arg(begin)
// 	many_separated(middle, t(Comma))
// 	arg(end)
// }


// const _0 = path([LeftParen])
// const _1 = branch(path([Num]), path([Nil]))
// const _2 = branch(_0, path(_1))

// function lists() {
// 	return many(parenthesized_number_list, _0)
// }

// function parenthesized_number_list() {
// 	consume(LeftParen)
// 	const list = maybe(number_list, _2)
// 	consume(RightParen)
// 	return list
// }


// function number_list() {
// 	return many_separated(
// 		f(() => or(
// 			f(parenthesized_number_list, _0),
// 			f(() => or(
// 				t(Num),
// 				t(Nil),
// 			), _1),
// 		), _0),
// 		t(Comma),
// 	)
// }

// log(lists())


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
// } = Parser({}, [Whitespace], source)

// function postgres_string() {
// 	const sigil = lock(Ident)
// 	consume(Dollar)
// 	const s = sigil()
// 	consume(Dollar)
// 	const idents = maybe_many(Ident) || []
// 	consume(Dollar)
// 	sigil()
// 	consume(Dollar)

// 	return t(s, idents)
// }

// log(postgres_string())
