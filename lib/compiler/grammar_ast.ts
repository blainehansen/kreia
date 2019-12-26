import * as fs from 'fs'
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
	// 		[or([
	// 			[subrule('token_definition')],
	// 			[subrule('virtual_lexer_usage')],
	// 			[subrule('macro_definition')],
	// 			[subrule('rule_definition')],
	// 		])],
	// 		[consume(['indent_continue'])]
	// 	),
	// ]),

	// new Rule('token_definition', [
	// 	consume(['token_name', 'space', 'eq', 'space']),
	// 	subrule('token_specification'),
	// 	// Maybe([consume(['space']), Many([subrule('token_option')])]),
	// ]),

	// new Rule('base_token_specification', [
	// 	or([
	// 		[consume(['regex_source'])],
	// 		[consume(['str'])],
	// 	]),
	// ]),

	// new Rule('token_specification', [
	// 	or([
	// 		[subrule('base_token_specification')],
	// 		[
	// 			consume(['open_bracket']),
	// 			comma_sep([subrule('base_token_specification')]),
	// 			consume(['close_bracket']),
	// 		],
	// 	]),
	// ]),

	// new Rule('virtual_lexer_usage', [
	// 	consume(['open_brace']),
	// 	comma_sep([consume(['token_name'])]),
	// 	consume(['close_brace', 'space', 'eq', 'space', 'use_keyword', 'space', 'str']),
	// 	// Maybe([consume(['space', 'with_keyword', 'space']), comma_sep([subrule('token_specification')])]),
	// ]),


	// new Rule('macro_definition', [
	// 	consume(['macro_name']),
	// 	Maybe([subrule('locking_definitions')]),

	// 	consume(['open_bracket'])
	// 	comma_sep([consume(['var_name'])]),
	// 	consume(['close_bracket']),

	// 	subrule('rule_block'),
	// ]),

	// new Rule('macro_call', [
	// 	consume(['macro_name', 'open_bracket']),
	// 	comma_sep([subrule('simple_rule_line')]),
	// 	consume(['close_bracket']),
	// ]),

	// new Rule('rule_definition', [
	// 	consume(['rule_name']),
	// 	Maybe([subrule('locking_definitions')]),

	// 	subrule('rule_block'),
	// ]),

	new Rule('locking_definitions', [
		consume('open_angle'),
		macro_call('block', [
			macro_call('comma_sep', [consume('locked_name', 'space', 'eq', 'space', 'token_name')]),
		]),
		consume('close_angle'),
	]),

	// new Rule('rule_block', [
	// 	consume(['space', 'eq']),
	// 	diff_block([subrule('rule_line')], [consume(['space']), subrule('simple_rule_line')]),
	// ]),

	// new Rule('rule_line', [
	// 	or([
	// 		[subrule('modifier'), block([subrule('rule_line')])],
	// 		[Maybe([consume(['bar', 'space'])]), subrule('simple_rule_line')],
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
			[consume('locked_name')],
			// [subrule('macro_call')],
			[consume('open_paren'), subrule('simple_rule_line'), consume('close_paren')],
		),
		maybe_subrule('modifier'),
	]),

	new Rule('modifier', [
		or(
			[consume('plus')],
			[consume('star')],
			[consume('maybe')],
		),
	]),
]

fs.writeFileSync('./lib/compiler/grammar_blank.ts', print_grammar(KreiaGrammar))
