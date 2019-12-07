// import * as fs from 'fs'
// import { log } from './utils'
// import { tuple as t } from '@ts-std/types'
// import { OrderedDict } from '@ts-std/collections'

// import { render_grammar } from './ast/render'
// import {
// 	TokenDef, Rule, Macro, Node, Definition, Maybe, Many, Or, Consume,
// 	MacroCall, Subrule, Arg, Var, LockingVar, LockingArg, VirtualLexerUsage,
// } from './ast/ast'


// function lined(def: Definition) {
// 	return MacroCall(
// 		'many_separated',
// 		OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
// 			def, [Consume(['indent_continue'])],
// 		]).unwrap(),
// 	)
// }

// const MicroYmlGrammar = [
// 	TokenDef('Key', { type: 'regex', source: /\w+/.source }),
// 	TokenDef('Colon', { type: 'string', value: ':' }),
// 	TokenDef('Dash', { type: 'string', value: '-' }),
// 	TokenDef('Space', { type: 'options', match: { type: 'regex', source: / +/.source }, ignore: true }),

// 	TokenDef('Primitive', { type: 'array', items: [
// 		{ type: 'string', value: 'null'},
// 		{ type: 'string', value: 'undefined' },
// 		{ type: 'string', value: 'true' },
// 		{ type: 'string', value: 'false' },
// 	] }),
// 	TokenDef('Str', { type: 'regex', source: /"(?:\\["\\]|[^\n"\\])*"/.source }),
// 	TokenDef('Num', { type: 'regex', source: /[0-9]+(\.[0-9]+)?/.source }),

// 	VirtualLexerUsage('IndentationLexer', './IndentationLexer', [], { indent: true, deindent: true, indent_continue: true }),

// 	// Rule('yml_file', [
// 	// 	Maybe([Many([
// 	// 		Subrule('entity'),
// 	// 	])]),
// 	// ]),

// 	// Rule('complex_entity', [
// 	// 	Or([
// 	// 		[Subrule('object')],
// 	// 		[Subrule('list')],
// 	// 	])
// 	// ]),

// 	Rule('simple_entity', [
// 		Or([
// 			[Consume(['Primitive'])],
// 			[Consume(['Str'])],
// 			[Consume(['Num'])],
// 		])
// 	]),

// 	Rule('object', [
// 		lined([Subrule('key_value')]),
// 	]),

// 	Rule('key_value', [
// 		Consume(['Key', 'Colon']),
// 		Or([
// 			[Consume(['indent']), Subrule('object'), Consume(['deindent'])],
// 			[Consume(['Space']), Subrule('simple_entity')],
// 		])
// 	]),

// 	// Rule('list', [
// 	// 	lined([
// 	// 		Consume(['Dash', 'Space']),
// 	// 		Or([
// 	// 			[Consume('indent'), Subrule('complex_entity'), Consume('deindent')],
// 	// 			[Consume('Space'), Subrule('simple_entity')],
// 	// 		]),
// 	// 	]),
// 	// ]),
// ]
// const rendered = render_grammar(MicroYmlGrammar)

// fs.writeFileSync('./lib/parser_out.ts', rendered)


import { Parser, ParseArg, Decidable, path, branch, t, f } from "./index"
import { IndentationLexer } from "./IndentationLexer"

const { tok, reset, exit, arg, maybe, consume, many, maybe_many, or, maybe_or, many_separated, maybe_many_separated } = Parser({
	Key: /\w+/,
	Colon: ":",
	Dash: "-",
	Space: { match: / +/, ignore: true },
	Primitive: ["null", "undefined", "true", "false"],
	Str: /"(?:\\["\\]|[^\n"\\])*"/,
	Num: /[0-9]+(\.[0-9]+)?/
}, { IndentationLexer: t(IndentationLexer, t()) })

const [_0, _1, _2, _3] = [path([tok.Key]), path([tok.indent_continue]), path([tok.indent]), path([tok.Space])]

function simple_entity() {
	or(t(tok.Primitive), t(tok.Str), t(tok.Num))
}

function object() {
	many_separated(f(() => {
		key_value()
	}, _0), f(() => {
		consume(tok.indent_continue)
	}, _1))
}

function key_value() {
	consume(tok.Key, tok.Colon)
	or(f(() => {
		consume(tok.indent)
		object()
		consume(tok.deindent)
	}, _2), f(() => {
		consume(tok.Space)
		simple_entity()
	}, _3))
}

reset(`\
a:
	b: null
	c:
		d: 5
		e: "df"
	f: null
	a:
		b: true
	c: "sdf"
`)
object()
exit()
