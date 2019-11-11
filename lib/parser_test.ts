import { tuple as t } from '@ts-std/types'

import { log } from './utils'
import { Parser, f } from './parser'
import { path, branch } from './decision'
import { Token, create_lexer_state } from './lexer'

const source = `
  (1, 2, 3, nil) ()
  (nil, nil)
  (1, (2, 3, 4), (((), nil)))
`

const tok = create_lexer_state({
	LeftParen: '(',
	RightParen: ')',
	Num: /[0-9]+/,
	Nil: 'nil',
	Comma: ',',
	Whitespace: { match: /\s+/, ignore: true },
})

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
} = Parser({ tokens: Object.values(tok) }, source)

const _0 = path([tok.LeftParen])
const _1 = branch(false, path([tok.Num]), path([tok.Nil]))
const _2 = branch(false, _0, path(_1))

function lists() {
	return many(parenthesized_number_list, _0)
}

function parenthesized_number_list() {
  consume(tok.LeftParen)
  const list = maybe(number_list, _2)
  consume(tok.RightParen)
  return list
}

function a(): [Token] | [Token] | [Token] {
	return or(
		t(tok.Comma),
		t(tok.Num),
		t(tok.Nil),
	)
}

function number_list() {
	return many_separated(
		f(() => or(
		  f(parenthesized_number_list, _0),
		  f(() => or(t(tok.Num), t(tok.Nil)), _1),
		), _0),
		t(tok.Comma),
	)
}

log(lists())
