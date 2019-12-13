import 'mocha'
import { expect } from 'chai'
import ts = require('typescript')
import { OrderedDict } from '@ts-std/collections'

import { render_rule, render_macro, render_grammar } from './render'
import { Consume, Rule, Subrule, Maybe, MacroCall, Or, Many, TokenDef, register_tokens } from './ast'

const token_defs = [
	TokenDef('LeftParen', { type: 'string', value: '(' }),
	TokenDef('Comma', { type: 'string', value: ',' }),
	TokenDef('Num', { type: 'regex', source: '0-9+' }),
	TokenDef('RightParen', { type: 'string', value: ')' }),
]
register_tokens(token_defs)

describe('render_rule', () => {
	it('works', () => {
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

describe('render_grammar', () => {
	it('works', () => {
		// const rendered_thing = render_macro(
		// 	Macro('my_rule', [
		// 		Consume(['LeftParen']),
		// 		Maybe([
		// 			Consume(['Num']),
		// 			Maybe([Many([Consume(['Comma', 'Num'])])]),
		// 		]),
		// 		Consume(['RightParen']),
		// 	])
		// )

		const rendered_grammar = render_grammar([
			TokenDef('LeftParen', { type: 'string', value: '(' }),
			TokenDef('RightParen', { type: 'string', value: ')' }),
			TokenDef('Num', { type: 'regex', source: '[0-9]+' }),
			TokenDef('Nil', { type: 'string', value: 'nil' }),
			TokenDef('Comma', { type: 'string', value: ',' }),
			TokenDef('Whitespace', { type: 'options', match: { type: 'regex', source: '\\s+' }, ignore: true }),

			Rule('lists', [
				Many([Subrule('parenthesized_number_list')]),
			]),
			Rule('parenthesized_number_list', [
				Consume(['LeftParen']),
				Maybe([Subrule('number_list')]),
				Consume(['RightParen']),
			]),
			Rule('number_list', [
				MacroCall(
					'many_separated',
					OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
						[Or([
							[Subrule('parenthesized_number_list')],
							[Or([[Consume(['Num'])], [Consume(['Nil'])]])],
						])],
						[Consume(['Comma'])],
					]).unwrap(),
				),
			]),
		])

		const resultFile =
			ts.createSourceFile('lib/generated.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: true })
		const result = rendered_grammar.map(item => printer.printNode(ts.EmitHint.Unspecified, item, resultFile)).join('\n\n')

		console.log(result)
	})
})

// const Padded = Macro(
// 	'padded', [Arg('body')],
// 	Maybe(Consume('Whitespace')),
// 	Var('body'),
// 	Maybe(Consume('Whitespace')),
// )
