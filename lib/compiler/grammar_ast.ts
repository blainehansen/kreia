import * as fs from 'fs'
import { log } from './utils'
import { tuple as t } from '@ts-std/types'

import { print_grammar } from './render_codegen'
import {
	TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, many, _var, many_separated,
	macro_call, subrule, maybe_subrule,
} from './ast'


const KreiaGrammar = [
	new TokenDef('var_name', /\$\w+/),
	new TokenDef('token_name', /\:\w+/),
	new TokenDef('locked_name', /\!\w+/),

	new TokenDef('rule_name', /\w+/),
	new TokenDef('macro_name', /\@\w+/),

	new TokenDef('space', / +/),
	new TokenDef('primitive', ['true']),
	new TokenDef('str', [
		/"(?:\\["\\]|[^\n"\\])*"/,
		/'(?:\\['\\]|[^\n'\\])*'/,
	]),

	new TokenDef('regex_source', /\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//),

	new TokenDef('use_keyword', 'use'),
	// new TokenDef('with_keyword', 'with'),

	new TokenDef('eq', '='),
	new TokenDef('bar', '|'),
	new TokenDef('star', '*'),
	new TokenDef('plus', '+'),
	new TokenDef('maybe', '?'),
	new TokenDef('colon', ':'),
	new TokenDef('comma', ','),
	new TokenDef('slash', '/'),

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

	new Macro('diff_block', [new Arg('in_indent'), new Arg('not_in_indent')], [
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

	new Macro('block', [new Arg('block_line')], [
		macro_call('diff_block', [_var('block_line')], [_var('block_line')]),
	]),

	// new Rule('kreia_grammar', [
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

	// new Rule('token_definition', [
	// 	Consume(['token_name', 'space', 'eq', 'space']),
	// 	Subrule('token_specification'),
	// 	// Maybe([Consume(['space']), Many([Subrule('token_option')])]),
	// ]),

	// new Rule('base_token_specification', [
	// 	Or([
	// 		[Consume(['regex_source'])],
	// 		[Consume(['str'])],
	// 	]),
	// ]),

	// new Rule('token_specification', [
	// 	Or([
	// 		[Subrule('base_token_specification')],
	// 		[
	// 			Consume(['open_bracket']),
	// 			comma_sep([Subrule('base_token_specification')]),
	// 			Consume(['close_bracket']),
	// 		],
	// 	]),
	// ]),

	// new Rule('virtual_lexer_usage', [
	// 	Consume(['open_brace']),
	// 	comma_sep([Consume(['token_name'])]),
	// 	Consume(['close_brace', 'space', 'eq', 'space', 'use_keyword', 'space', 'str']),
	// 	// Maybe([Consume(['space', 'with_keyword', 'space']), comma_sep([Subrule('token_specification')])]),
	// ]),


	// new Rule('macro_definition', [
	// 	Consume(['macro_name']),
	// 	Maybe([Subrule('locking_definitions')]),

	// 	Consume(['open_bracket'])
	// 	comma_sep([Consume(['var_name'])]),
	// 	Consume(['close_bracket']),

	// 	Subrule('rule_block'),
	// ]),

	// new Rule('macro_call', [
	// 	Consume(['macro_name', 'open_bracket']),
	// 	comma_sep([Subrule('simple_rule_line')]),
	// 	Consume(['close_bracket']),
	// ]),

	// new Rule('rule_definition', [
	// 	Consume(['rule_name']),
	// 	Maybe([Subrule('locking_definitions')]),

	// 	Subrule('rule_block'),
	// ]),

	// new Rule('locking_definitions', [
	// 	Consume(['open_angle']),
	// 	block([comma_sep([Consume(['locked_name', 'space', 'eq', 'space', 'token_name'])])]),
	// 	Consume(['close_angle']),
	// ]),

	// new Rule('rule_block', [
	// 	Consume(['space', 'eq']),
	// 	diff_block([Subrule('rule_line')], [Consume(['space']), Subrule('simple_rule_line')]),
	// ]),

	// new Rule('rule_line', [
	// 	Or([
	// 		[Subrule('modifier'), block([Subrule('rule_line')])],
	// 		[Maybe([Consume(['bar', 'space'])]), Subrule('simple_rule_line')],
	// 	]),
	// ]),

	new Rule('simple_rule_line', [
		macro_call('many_separated',
			[macro_call('space_sep', [subrule('rule_atom')])],
			[consume('space', 'bar', 'space')],
		),
	]),

	new Rule('rule_atom', [
		or(
			[consume('token_name')],
			[consume('var_name')],
			// [consume('locked_name')],
			// [subrule('macro_call')],
			// [consume('open_paren'), subrule('simple_rule_line'), consume('close_paren')],
		),
		// maybe_subrule('modifier'),
	]),

	// new Rule('modifier', [
	// 	Or([
	// 		[Consume(['plus'])],
	// 		[Consume(['star'])],
	// 		[Consume(['maybe'])],
	// 	]),
	// ]),
]

fs.writeFileSync('./lib/compiler/grammar_out.ts', print_grammar(KreiaGrammar))
