import 'mocha'
import { expect } from 'chai'
import ts = require('typescript')

import { render_rule } from './render'
import { Consume, Rule, Maybe, Many, TokenDef, register_tokens } from './ast'

const token_defs = [
	TokenDef('LeftParen', { type: 'string', value: '(' }),
	TokenDef('Comma', { type: 'string', value: ',' }),
	TokenDef('Num', { type: 'regex', source: '0-9+' }),
	TokenDef('RightParen', { type: 'string', value: ')' }),
]
register_tokens(token_defs)

describe('sdf', () => {
	it('df', () => {
		const rendered_thing = render_rule(
			Rule('my_rule', [
				Consume(['LeftParen']),
				Maybe([
					Consume(['Num']),
					Maybe([Many([Consume(['Comma', 'Num'])])]),
				]),
				Consume(['RightParen']),
			])
		)

		const resultFile = ts.createSourceFile(
			'lib/generated.ts',
			'',
			ts.ScriptTarget.Latest,
			/*setParentNodes*/ false,
			ts.ScriptKind.TS,
		)
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: true })
		const result = printer.printNode(ts.EmitHint.Unspecified, rendered_thing, resultFile)

		console.log(result)
	})
})

// // const Padded = Macro(
// // 	'padded', [Arg('body')],
// // 	Maybe(Consume('Whitespace')),
// // 	Var('body'),
// // 	Maybe(Consume('Whitespace')),
// // )

// const ManySeparated = Macro(
// 	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
// 	Var('body_rule'),
// 	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
// )

// const Grammar: Grammar = [
// 	Token('LeftParen', '('),
// 	Token('RightParen', ')'),
// 	Token('Num', /[0-9]+/),
// 	Token('Nil', 'nil'),
// 	Token('Comma', ','),
// 	Token('Whitespace', /\s+/, { ignore: true }),

// 	Rule('lists',
// 		Many(Subrule('parenthesized_number_list')),
// 	),
// 	Rule('parenthesized_number_list',
// 		Consume('LeftParen'),
// 		Maybe(Subrule('number_list'))
// 		Consume('RightParen'),
// 	),
// 	Rule('number_list',
// 		MacroCall('many_separated',
// 			[Or(
// 				[Subrule('parenthesized_number_list')],
// 				[Or([Consume('Num')], [Consume('Nil')])],
// 			)],
// 			[Consume('Comma')],
// 		),
// 	),
// ]
