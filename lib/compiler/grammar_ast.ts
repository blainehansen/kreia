// https://www.ascii-code.com/
import * as fs from 'fs'
import { tuple as t } from '@ts-std/types'

import { print_grammar } from './render_codegen'
import {
	TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, maybe_or, many, _var, many_separated,
	macro_call, subrule, maybe_subrule,
} from './ast'


const KreiaGrammar = [
	new TokenDef('var_name', /\$\w+/),
	new TokenDef('token_name', /\:\w+/),
	new TokenDef('locked_name', /\!\w+/),

	new TokenDef('rule_name', /\w+/),
	new TokenDef('macro_name', /\@\w+/),
	new TokenDef('modifier_token', ['*', '+', '?']),
	new TokenDef('repetitions_modifier', /{\d+(,\d*)?}/),

	new TokenDef('space', { match: / +/, ignore: true }),
	new TokenDef('comment', { match: /\s*\/\/[^\n]*\n+/, ignore: true }),

	// new TokenDef('character', /\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[aftnrv]|[\x20-\x7E]/),
	// new TokenDef('character_class', /\^?\[(?:\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[ftnrv]|\\]|[\x20-\x5C\x5E-\x7E])+\]/), // 5D is ]

	// this is overly simplified, and won't allow for literal emojis or other complex unicode characters to be used directly
	// 5C is \, 5D is ]
	new TokenDef('character_class', /\^?\[(?:\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[ftnrv]|\\]|\\\\|[\x20-\x5B\x5E-\x7E])+\]/),
	new TokenDef('character_class_name', /\^?\#\w+/),
	new TokenDef('str', [
		/"(?:\\["\\]|[^\n"\\])*"/,
		/'(?:\\['\\]|[^\n'\\])*'/,
	]),

	new TokenDef('use_keyword', 'use'),
	// new TokenDef('with_keyword', 'with'),

	new TokenDef('eq', '='),
	new TokenDef('bar', '|'),
	new TokenDef('comma', ','),
	new TokenDef('dash', '-'),
	new TokenDef('caret', '^'),
	new TokenDef('underscore', '_'),

	new TokenDef('open_angle', '<'),
	new TokenDef('close_angle', '>'),
	new TokenDef('open_paren', '('),
	new TokenDef('close_paren', ')'),
	new TokenDef('open_brace', '{'),
	new TokenDef('close_brace', '}'),
	new TokenDef('open_bracket', '['),
	new TokenDef('close_bracket', ']'),

	new VirtualLexerUsage(
		'IndentationLexer', '../virtual_lexers/IndentationLexer', [],
		{ indent: true, deindent: true, indent_continue: true },
	),

	new Macro('many_separated', [new Arg('body'), new Arg('separator')], [
		_var('body'),
		maybe_many(
			_var('separator'),
			_var('body')
		),
	]),

	new Macro('comma_sep', [new Arg('body')], [
		macro_call('many_separated',
			[_var('body')],
			[consume('comma', 'space')],
		),
	]),

	new Macro('space_sep', [new Arg('body')], [
		macro_call('many_separated',
			[_var('body')],
			[consume('space')],
		),
	]),

	new Macro('diff_block', [new Arg('not_in_indent'), new Arg('in_indent')], [
		or(
			[_var('not_in_indent')],
			[
				consume('indent'),
				macro_call('many_separated',
					[_var('in_indent')],
					[consume('indent_continue')],
				),
				consume('deindent'),
			],
		),
	]),

	new Macro('enclosed_diff_block', [new Arg('line_item')], [
		or(
			[_var('line_item')],
			[
				consume('indent'),
				macro_call('many_separated',
					[_var('line_item')],
					[consume('indent_continue')],
				),
				consume('deindent', 'indent_continue'),
			],
		),
	]),

	new Macro('block', [new Arg('block_line')], [
		macro_call('diff_block', [_var('block_line')], [_var('block_line')]),
	]),

	new Macro('lines_block', [new Arg('line_item')], [
		macro_call('enclosed_diff_block',
			[macro_call('comma_sep', [_var('line_item')])],
		),
	]),


	new Rule('kreia_grammar', [
		maybe_consume('indent_continue'),
		macro_call('many_separated',
			[or(
				[subrule('token_definition')],
				[subrule('virtual_lexer_usage')],
				[subrule('macro_definition')],
				[subrule('rule_definition')],
			)],
			[consume('indent_continue')],
		),
		maybe_consume('indent_continue'),
	]),


	new Rule('token_definition', [
		consume('token_name', 'space'),
		// this is where a case insensitivity modifier could go?
		maybe_consume('underscore'),
		consume('eq', 'space'),
		// here is where we could branch out and allow multiline token_specifications
		subrule('token_specification'),
	]),

	new Rule('token_specification', [
		macro_call('many_separated',
			[macro_call('space_sep', [subrule('token_atom')])],
			[consume('space', 'bar', 'space')],
		),
	]),

	new Rule('token_atom', [
		or(
			[consume('character_class')],
			[consume('character_class_name')],
			[consume('token_name')],
			[consume('str')],
			[consume('open_paren'), subrule('token_specification'), consume('close_paren')],
		),
		maybe_or(
			[consume('modifier_token')],
			[consume('repetitions_modifier')],
		),
	]),


	new Rule('virtual_lexer_usage', [
		consume('open_brace'),
		macro_call('lines_block', [consume('token_name')]),
		consume('close_brace', 'space', 'eq', 'space', 'use_keyword', 'space', 'str'),
		// maybe(
		// 	consume('space', 'with_keyword', 'space'),
		// 	macro_call('comma_sep', [subrule('token_specification')]),
		// ),
	]),


	new Rule('macro_definition', [
		consume('macro_name'),
		maybe_subrule('locking_definitions'),

		consume('open_bracket'),
		macro_call('lines_block', [consume('var_name')]),
		consume('close_bracket'),

		subrule('rule_block'),
	]),

	new Rule('macro_call', [
		consume('macro_name', 'open_bracket'),
		macro_call('comma_sep', [subrule('simple_rule_line')]),
		consume('close_bracket'),
	]),


	new Rule('rule_definition', [
		consume('rule_name'),
		maybe_subrule('locking_definitions'),
		// consume('space'),
		// maybe_consume('underscore'),
		subrule('rule_block'),
	]),

	new Rule('rule_block', [
		consume('space', 'eq'),
		macro_call('diff_block',
			[consume('space'), subrule('simple_rule_line')],
			[subrule('rule_item')],
		),
	]),

	new Rule('rule_item', [
		or(
			[
				or([consume('bar')], [subrule('modifier')]),
				macro_call('diff_block',
					[consume('space'), subrule('simple_rule_line')],
					[subrule('rule_item')],
				),
			],
			[subrule('simple_rule_line')],
		)
	]),

	new Rule('simple_rule_line', [
		macro_call('many_separated',
			[macro_call('space_sep', [subrule('rule_atom')])],
			[consume('space', 'bar', 'space')],
		),
	]),

	new Rule('rule_atom', [
		or(
			[consume('rule_name')],
			[consume('token_name')],
			[consume('var_name')],
			[consume('locked_name')],
			[subrule('macro_call')],
			[
				consume('open_paren'),
				macro_call('block', [subrule('simple_rule_line')]),
				consume('close_paren'),
			],
		),
		maybe_subrule('modifier'),
	]),

	new Rule('locking_definitions', [
		consume('open_angle'),
		macro_call('lines_block', [
			consume('locked_name', 'space', 'eq', 'space', 'token_name')
		]),
		consume('close_angle'),
	]),

	new Rule('modifier', [
		consume('modifier_token')
	]),
]

fs.writeFileSync('./lib/compiler/grammar_blank.ts', print_grammar(KreiaGrammar))
