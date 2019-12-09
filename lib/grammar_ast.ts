import * as fs from 'fs'
import { log } from './utils'
import { tuple as t } from '@ts-std/types'
import { OrderedDict } from '@ts-std/collections'

import { render_grammar } from './ast/render'
import {
	TokenDef, Rule, Macro, Node, Definition, Maybe, Many, Or, Consume,
	MacroCall, Subrule, Arg, Var, LockingVar, LockingArg, VirtualLexerUsage,
} from './ast/ast'


function sep(body: Definition, separator: Definition) {
	return MacroCall(
		'many_separated',
		OrderedDict.create_unique((_, index) => index === 0 ? 'body_rule' : 'separator_rule', [
			body, separator,
		]).unwrap(),
	)
}

function comma_sep(body: Definition) {
	return sep(body, [Subrule('_'), Consume(['comma']), Subrule('_')])
}

function space_sep(body: Definition) {
	return sep(body, [Consume(['space'])])
}

function diff_block(in_indent: Definition, not_in_indent: Definition) {
	return Or([
		not_in_indent,
		[
			Consume(['indent']),
			sep(in_indent, [Consume(['indent_continue'])]),
			Consume(['deindent']),
		],
	])
}

function block(block_line: Definition) {
	return diff_block(block_line, block_line)
}

const KreiaGrammar = [
	TokenDef('var_name', { type: 'regex', source: /\$\w+/.source }),
	TokenDef('token_name', { type: 'regex', source: /\:\w+/.source }),
	TokenDef('locked_name', { type: 'regex', source: /\!\w+/.source }),

	TokenDef('rule_name', { type: 'regex', source: /\w+/.source }),
	TokenDef('macro_name', { type: 'regex', source: /\@\w+/.source }),

	TokenDef('space', { type: 'regex', source: / +/.source }),
	TokenDef('primitive', { type: 'array', items: [{ type: 'string', value: 'true' }] }),
	TokenDef('str', { type: 'array', items: [
		{ type: 'regex', source: /"(?:\\["\\]|[^\n"\\])*"/.source },
		{ type: 'regex', source: /'(?:\\['\\]|[^\n'\\])*'/.source },
	] }),

	TokenDef('regex_source', { type: 'regex', source: /\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//.source }),

	TokenDef('use_keyword', { type: 'string', value: 'use' }),
	// TokenDef('with_keyword', { type: 'string', value: 'with' }),

	TokenDef('eq', { type: 'string', value: '=' }),
	TokenDef('bar', { type: 'string', value: '|' }),
	TokenDef('star', { type: 'string', value: '*' }),
	TokenDef('plus', { type: 'string', value: '+' }),
	TokenDef('maybe', { type: 'string', value: '?' }),
	TokenDef('colon', { type: 'string', value: ':' }),
	TokenDef('comma', { type: 'string', value: ',' }),
	TokenDef('slash', { type: 'string', value: '/' }),

	TokenDef('open_angle', { type: 'string', value: '<' }),
	TokenDef('close_angle', { type: 'string', value: '>' }),

	TokenDef('open_paren', { type: 'string', value: '(' }),
	TokenDef('close_paren', { type: 'string', value: ')' }),
	TokenDef('open_brace', { type: 'string', value: '{' }),
	TokenDef('close_brace', { type: 'string', value: '}' }),
	TokenDef('open_bracket', { type: 'string', value: '[' }),
	TokenDef('close_bracket', { type: 'string', value: ']' }),

	VirtualLexerUsage('IndentationLexer', './IndentationLexer', [], { indent: true, deindent: true, indent_continue: true }),

	Rule('_', [
		Maybe([Consume(['space'])]),
	]),

	// Rule('kreia_grammar', [
	// 	sep(
	// 		[Or([
	// 			[Subrule('token_definition')],
	// 			[Subrule('virtual_lexer_usage')],
	// 			[Subrule('macro_definition')],
	// 			[Subrule('rule_definition')],
	// 		])],
	// 		[Consume(['indent_continue'])]
	// 	),
	// ]),

	// Rule('token_definition', [
	// 	Consume(['token_name', 'space', 'eq', 'space']),
	// 	Subrule('token_specification'),
	// 	// Maybe([Consume(['space']), Many([Subrule('token_option')])]),
	// ]),

	// Rule('base_token_specification', [
	// 	Or([
	// 		[Consume(['regex_source'])],
	// 		[Consume(['str'])],
	// 	]),
	// ]),

	// Rule('token_specification', [
	// 	Or([
	// 		[Subrule('base_token_specification')],
	// 		[
	// 			Consume(['open_bracket']),
	// 			comma_sep([Subrule('base_token_specification')]),
	// 			Consume(['close_bracket']),
	// 		],
	// 	]),
	// ]),

	// Rule('virtual_lexer_usage', [
	// 	Consume(['open_brace']),
	// 	comma_sep([Consume(['token_name'])]),
	// 	Consume(['close_brace', 'space', 'eq', 'space', 'use_keyword', 'space', 'str']),
	// 	// Maybe([Consume(['space', 'with_keyword', 'space']), comma_sep([Subrule('token_specification')])]),
	// ]),


	// Rule('macro_definition', [
	// 	Consume(['macro_name']),
	// 	Maybe([Subrule('locking_definitions')]),

	// 	Consume(['open_bracket'])
	// 	comma_sep([Consume(['var_name'])]),
	// 	Consume(['close_bracket']),

	// 	Subrule('rule_block'),
	// ]),

	// Rule('macro_call', [
	// 	Consume(['macro_name', 'open_bracket']),
	// 	comma_sep([Subrule('simple_rule_line')]),
	// 	Consume(['close_bracket']),
	// ]),

	// Rule('rule_definition', [
	// 	Consume(['rule_name']),
	// 	Maybe([Subrule('locking_definitions')]),

	// 	Subrule('rule_block'),
	// ]),

	// Rule('locking_definitions', [
	// 	Consume(['open_angle']),
	// 	block([comma_sep([Consume(['locked_name', 'space', 'eq', 'space', 'token_name'])])]),
	// 	Consume(['close_angle']),
	// ]),

	// Rule('rule_block', [
	// 	Consume(['space', 'eq']),
	// 	diff_block([Subrule('rule_line')], [Consume(['space']), Subrule('simple_rule_line')]),
	// ]),

	// Rule('rule_line', [
	// 	Or([
	// 		[Subrule('modifier'), block([Subrule('rule_line')])],
	// 		[Maybe([Consume(['bar', 'space'])]), Subrule('simple_rule_line')],
	// 	]),
	// ]),

	Rule('simple_rule_line', [
		sep(
			[space_sep([Subrule('rule_atom')])],
			[Consume(['space', 'bar', 'space'])],
		),
	]),

	Rule('rule_atom', [
		Or([
			[Consume(['token_name'])],
			[Consume(['var_name'])],
			// [Consume(['locked_name'])],
			// [Subrule('macro_call')],
			// [Consume(['open_paren']), Subrule('simple_rule_line'), Consume(['close_paren'])],
		]),
		// Maybe([Subrule('modifier')]),
	]),

	// Rule('modifier', [
	// 	Or([
	// 		[Consume(['plus'])],
	// 		[Consume(['star'])],
	// 		[Consume(['maybe'])],
	// 	]),
	// ]),
]

const rendered = render_grammar(KreiaGrammar)

fs.writeFileSync('./lib/grammar_out.ts', rendered)
