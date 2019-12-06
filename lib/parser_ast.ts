import * as fs from 'fs'
import { log } from './utils'
import { tuple as t } from '@ts-std/types'
import { OrderedDict } from '@ts-std/collections'

import { render_grammar } from './ast/render'
import {
	TokenDef, Rule, Macro, Node, Definition, Maybe, Many, Or, Consume,
	MacroCall, Subrule, Arg, Var, LockingVar, LockingArg,
} from './ast/ast'

function sep(def: Definition) {
	return OrderedDict.create_unique(() => 'thing', [def]).unwrap()
}

// export type RegexSpec =
// 	| { type: 'regex', source: string }
// 	| { type: 'string', value: string }

// export type MatchSpec =
// 	| RegexSpec
// 	| { type: 'array', items: RegexSpec[] }

// export type TokenSpec =
// 	| MatchSpec
// 	| { type: 'options', match: MatchSpec } & TokenOptions

const JsonGrammar = [
	// TokenDef('Quote', '"'),
	// TokenDef('Ident', /([^\"\n]|\".)+/),
	TokenDef('Str', { type: 'regex', source: /"(?:\\["\\]|[^\n"\\])*"/.source }),
	TokenDef('Comma', { type: 'string', value: ',' }),
	TokenDef('Colon', { type: 'string', value: ':' }),
	TokenDef('LeftBrace', { type: 'string', value: '{' }),
	TokenDef('RightBrace', { type: 'string', value: '}' }),
	TokenDef('LeftBracket', { type: 'string', value: '[' }),
	TokenDef('RightBracket', { type: 'string', value: ']' }),
	TokenDef('Primitive', { type: 'array', items: [
		{ type: 'string', value: 'null'},
		{ type: 'string', value: 'undefined' },
		{ type: 'string', value: 'true' },
		{ type: 'string', value: 'false' },
	] }),
	TokenDef('Num', { type: 'regex', source: /[0-9]+(\.[0-9]+)?/.source }),
	TokenDef('Whitespace', { type: 'options', match: { type: 'regex', source: /\s+/.source }, ignore: true }),

	Rule('json_entity', [
		Or([
			[Subrule('array')],
			[Subrule('object')],
			[Subrule('atomic_entity')],
		])
	]),

	Macro('separated_by_commas', OrderedDict.create_unique('name', [Arg('thing')]).unwrap(), [
		Maybe([
			MacroCall(
				'many_separated',
				OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
					[Var('thing')],
					[Consume(['Comma'])],
				]).unwrap(),
			),
		]),
	]),

	Rule('array', [
		Consume(['LeftBracket']),
		MacroCall('separated_by_commas', sep([Subrule('json_entity')])),
		Consume(['RightBracket']),
	]),

	Rule('object', [
		Consume(['LeftBrace']),
		MacroCall('separated_by_commas', sep([
			Subrule('json_key'),
			Subrule('json_entity'),
		])),
		Consume(['RightBrace']),
	]),

	Rule('atomic_entity', [
		Or([
			[Consume(['Str'])],
			[Consume(['Num'])],
			[Consume(['Primitive'])],
		]),
	]),

	Rule('json_key', [
		Consume(['Str', 'Colon']),
	]),
]

const rendered = render_grammar(JsonGrammar)

fs.writeFileSync('./lib/parser_out.ts', rendered)
