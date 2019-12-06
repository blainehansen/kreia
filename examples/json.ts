// import * as fs from 'fs'
// import { log } from './utils'
// import { tuple as t } from '@ts-std/types'
// import { OrderedDict } from '@ts-std/collections'

// import { render_grammar } from './ast/render'
// import {
// 	TokenDef, Rule, Macro, Node, Definition, Maybe, Many, Or, Consume,
// 	MacroCall, Subrule, Arg, Var, LockingVar, LockingArg,
// } from './ast/ast'

// function sep(def: Definition) {
// 	return OrderedDict.create_unique(() => 'thing', [def]).unwrap()
// }

// const JsonGrammar = [
// 	TokenDef('Str', { type: 'regex', source: /"(?:\\["\\]|[^\n"\\])*"/.source }),
// 	TokenDef('Comma', { type: 'string', value: ',' }),
// 	TokenDef('Colon', { type: 'string', value: ':' }),
// 	TokenDef('LeftBrace', { type: 'string', value: '{' }),
// 	TokenDef('RightBrace', { type: 'string', value: '}' }),
// 	TokenDef('LeftBracket', { type: 'string', value: '[' }),
// 	TokenDef('RightBracket', { type: 'string', value: ']' }),
// 	TokenDef('Primitive', { type: 'array', items: [
// 		{ type: 'string', value: 'null'},
// 		{ type: 'string', value: 'undefined' },
// 		{ type: 'string', value: 'true' },
// 		{ type: 'string', value: 'false' },
// 	] }),
// 	TokenDef('Num', { type: 'regex', source: /[0-9]+(\.[0-9]+)?/.source }),
// 	TokenDef('Whitespace', { type: 'options', match: { type: 'regex', source: /\s+/.source }, ignore: true }),

// 	Rule('json_entity', [
// 		Or([
// 			[Subrule('array')],
// 			[Subrule('object')],
// 			[Subrule('atomic_entity')],
// 		])
// 	]),

// 	Macro('separated_by_commas', OrderedDict.create_unique('name', [Arg('thing')]).unwrap(), [
// 		Maybe([
// 			MacroCall(
// 				'many_separated',
// 				OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
// 					[Var('thing')],
// 					[Consume(['Comma'])],
// 				]).unwrap(),
// 			),
// 		]),
// 	]),

// 	Rule('array', [
// 		Consume(['LeftBracket']),
// 		MacroCall('separated_by_commas', sep([Subrule('json_entity')])),
// 		Consume(['RightBracket']),
// 	]),

// 	Rule('object', [
// 		Consume(['LeftBrace']),
// 		MacroCall('separated_by_commas', sep([
// 			Subrule('json_key'),
// 			Subrule('json_entity'),
// 		])),
// 		Consume(['RightBrace']),
// 	]),

// 	Rule('atomic_entity', [
// 		Or([
// 			[Consume(['Str'])],
// 			[Consume(['Num'])],
// 			[Consume(['Primitive'])],
// 		]),
// 	]),

// 	Rule('json_key', [
// 		Consume(['Str', 'Colon']),
// 	]),
// ]

// const rendered = render_grammar(JsonGrammar)

// fs.writeFileSync('./lib/parser_out.ts', rendered)


import { tuple as t } from '@ts-std/types'
import { Parser, f, ParseArg } from './parser'
import { path, branch, Decidable } from './ast/decision'

function impossible(): never {
	throw new Error("impossible")
}

const { tok, reset, exit, arg, maybe, consume, many, maybe_many, or, maybe_or, many_separated, maybe_many_separated } = Parser({
	Str: /"(?:\\["\\]|[^\n"\\])*"/,
	Comma: ",",
	Colon: ":",
	LeftBrace: "{",
	RightBrace: "}",
	LeftBracket: "[",
	RightBracket: "]",
	Primitive: ["null", "undefined", "true", "false"],
	Num: /[0-9]+(\.[0-9]+)?/,
	Whitespace: { match: /\s+/, ignore: true }
}, {})

const [_0, _1, _2, _3, _4, _5, _6] = [
	path([tok.LeftBracket]),
	path([tok.LeftBrace]),
	path(branch(path([tok.Str]), path([tok.Num]), path([tok.Primitive]))),
	path(branch(path([tok.LeftBracket]), path([tok.LeftBrace]), path(branch(path([tok.Str]), path([tok.Num]), path([tok.Primitive]))))),
	path([tok.Comma]),
	path([tok.Str]),
	path([tok.Comma]),
]

type Dict<T> = { [key: string]: T }

type Json =
	| string | number | boolean | null | undefined
	| JsonObject
	| JsonArray

interface JsonObject { [property: string]: Json }
interface JsonArray extends Array<Json> {}

function json_entity(): Json {
	return or(
		f(array, _0),
		f(object, _1),
		f(atomic_entity, _2),
	)
}

function array(): JsonArray {
	consume(tok.LeftBracket)
	const items = separated_by_commas(() => json_entity(), _3, _4)
	consume(tok.RightBracket)
	return items
}

function object(): JsonObject {
	consume(tok.LeftBrace)
	const entries = separated_by_commas(() => {
		const key = json_key()
		const value = json_entity()
		return t(key, value)
	}, _5, _6)
	consume(tok.RightBrace)

	const give = {} as JsonObject
	for (const [key, value] of entries)
		give[key] = value
	return give
}

function atomic_entity() {
	const [p] = or(t(tok.Str), t(tok.Num), t(tok.Primitive))
	const content = p.content
	switch (p.type.name) {
		case 'Str':
			return content.slice(1, -1)
		case 'Num':
			return content.includes('.')
				? parseFloat(content)
				: parseInt(content)
		case 'Primitive':
			switch (content) {
				case 'null': return null
				case 'undefined': return undefined
				case 'false': return false
				case 'true': return true
				default: return impossible()
			}
		default: return impossible()
	}
}

function json_key(): string {
	const [str, ] = consume(tok.Str, tok.Colon)
	const key = str.content.slice(1, -1)
	return key
}

function separated_by_commas<THING extends ParseArg>(thing: THING, _d1: Decidable, _d2: Decidable) {
	const r = maybe_many_separated(
		f(() => arg(thing), _d1),
		f(() => { consume(tok.Comma) }, _d2),
	)
	return r || []
}

reset(`{
	"yo": null,
	"here": 4,
	"different": ["stuff", 5, undefined, true],
	"while": {
		"nested": {
			"again": "sdf"
		}
	}
}`)
console.log(json_entity())
exit()

reset('null')
console.log(json_entity())
exit()

reset('[5, 4, 3, "sdf dfa fndsf"]')
console.log(json_entity())
exit()

// reset('5, 4')
// console.log(json_entity())
// exit()
