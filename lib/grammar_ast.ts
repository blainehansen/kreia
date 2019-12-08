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
	return sep(body, [Subrule('_'), Consume(['Comma']), Subrule('_')])
}

function diff_block(in_indent: Definition, not_in_indent: Definition) {
	return Or([
		[
			Consume(['indent']),
			sep(in_indent, [Consume('indent_continue')]),
			Consume(['deindent']),
		],
		not_in_indent,
	])
}

function block(block_line: Definition) {
	return diff_block(block_line, block_line)
}

const KreiaGrammar = [
	TokenDef('rule_name', { type: 'regex', source: /\w+/.source }),
	TokenDef('var_name', { type: 'regex', source: /\$\w+/.source }),
	TokenDef('token_name', { type: 'regex', source: /\:\w+/.source }),
	TokenDef('macro_name', { type: 'regex', source: /\@\w+/.source }),
	TokenDef('locked_token', { type: 'regex', source: /\!\w+/.source }),

	TokenDef('space', { type: 'regex', source: / +/.source }),
	TokenDef('primitive', { type: 'array', items: [{ type: 'string', value: 'true' }] }),
	TokenDef('str', { type: 'array', items: [
		{ type: 'regex', source: /"(?:\\["\\]|[^\n"\\])*"/.source },
		{ type: 'regex', source: /'(?:\\['\\]|[^\n'\\])*'/.source },
	] }),

	TokenDef('use_keyword', { type: 'string', value: 'use' }),
	// TokenDef('with_keyword', { type: 'string', value: 'with' }),

	TokenDef('at', { type: 'string', value: '@' }),
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

	Rule('token_definition', [
		Consume(['token_name', 'space', 'eq', 'space']),
		Subrule('token_specification'),
		// Maybe([Consume(['space']), Many([Subrule('token_option')])]),
	]),

	Rule('base_token_specification', [
		Or([
			[Consume(['slash']), /* TODO */, Consume(['slash'])],
			[Consume(['str'])],
		]),
	]),

	Rule('token_specification', [
		Or([
			[Subrule('base_token_specification')],
			[
				Consume(['open_bracket']),
				comma_sep([Subrule('base_token_specification')]),
				Consume(['close_bracket']),
			],
		]),
	]),

	Rule('virtual_lexer_usage', [
		Consume(['open_brace']),
		comma_sep([Consume(['token_name'])]),
		Consume(['close_brace', 'space', 'eq', 'space', 'use_keyword', 'space', 'str']),
		// Maybe([Consume(['space', 'with_keyword', 'space']), comma_sep([Subrule('token_specification')])]),
	]),


	Rule('macro_definition', [
		Consume(['macro_name']),
		Maybe([Subrule('locking_definitions')]),

		Consume(['open_bracket'])
		comma_sep([Consume(['var_name'])]),
		Consume(['close_bracket', 'space', 'eq']),
		Subrule('rule_block'),
	]),

	Rule('rule_definition', [
		Consume(['rule_name']),
		Maybe([Subrule('locking_definitions')]),

		Consume(['space', 'eq']),
		Subrule('rule_block'),
	]),

	Rule('locking_definitions', [
		Consume(['open_angle']),
		comma_sep([Consume(['locked_token', 'space', 'eq', 'space', 'token_name'])]),
		Consume(['close_angle']),
	]),

	Rule('rule_block', [
		diff_block([Subrule(rule_line)], [Consume(['space']), Subrule(simple_rule_line)]),
	]),
]

const rendered = render_grammar(KreiaGrammar)

fs.writeFileSync('./lib/grammar_out.ts', rendered)
