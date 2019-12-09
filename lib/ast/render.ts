// https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#user-content-creating-and-printing-a-typescript-ast
// https://github.com/HearTao/ts-creator

import ts = require('typescript')
import { Dict, tuple as t } from '@ts-std/types'
import { UniqueDict, OrderedDict } from '@ts-std/collections'

import { Data, exhaustive, debug, log, exec, array_of, empty_ordered_dict } from '../utils'

import { AstDecidable } from './decision'
import { gather_branches, compute_decidable } from './decision_compute'

import { check_left_recursive, validate_references } from './validate'

import {
	RegexSpec, MatchSpec, TokenSpec, Node, Definition, Grammar, get_token, get_rule, get_macro,
	Rule, Macro, VirtualLexerUsage, LockingArg, TokenDef,
	Scope, ScopeStack, push_scope, pop_scope, DefinitionTuple,
	VisitingFunctions, VisitorParams, visit_definition,
	set_registered_tokens, set_registered_virtual_lexers, set_registered_rules, set_registered_macros,
	Arg, Maybe, Many, Var,
} from './ast'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 5 } })

type Call = ReturnType<typeof ts.createCall>

// every time we call render_entity, we might want to do so in one of two ways:
// - normal, compute a decidable and move on
// - just use a blank _d# identifier. this is when we're directly inside a macro definition. if this is the case, we need to know what number we're on

// when we render a macro_call, we need to go through the shallow definition (not recursing at all into subrules or other macro_calls)

// when rendering a macro definition, we need to traverse the definition and render the entities with numbered decisions instead of newly computed ones
// when rendering macro calls we need to traverse the definition only to gather the final computed values of those decisions.

// when counting decision points to render a macro definition, you don't have to iterate vars and macro calls, because in fact you can't. in fact you shouldn't recurse beyond the current definition at all. when gathering the finalized decision points at render time, the same is true that you don't recurse beyond the macro definition as you gather them, but you will have to recurse beyond in order to compute the decision points. you do have to render the provided vars themselves though

type MacroRenderContext =
	| { type: 'definition', count: number }
	| { type: 'call', decidables: ts.Identifier[] }

let global_macro_render_context = undefined as undefined | MacroRenderContext
function with_macro_render_context<T>(macro_render_context: MacroRenderContext, fn: () => T): T {
	const saved = global_macro_render_context
	global_macro_render_context = macro_render_context
	const result = fn()
	global_macro_render_context = saved
	return result
}

let global_decidables = [] as ReturnType<typeof ts.createCall>[]

function generate_decidable(
	wrapping_function_name: VisitorParams[2],
	main: DefinitionTuple, against: DefinitionTuple[]
): ts.Identifier {
	if (global_macro_render_context !== undefined && global_macro_render_context.type === 'definition') {
		global_macro_render_context.count++
		return ts.createIdentifier(`_d${global_macro_render_context.count}`)
	}

	// console.log('main[0]', main[0])
	// console.log('against.map(i => i[0])', against.map(i => i[0]))
	const decidable = compute_decidable(main, against)
	// console.log('decidable', decidable)
	// console.log()
	// console.log()
	// console.log()
	const lookahead_definition = render_decidable(decidable)
	const lookahead_number = global_decidables.length
	global_decidables.push(lookahead_definition)
	const lookahead_ident = ts.createIdentifier(`_${lookahead_number}`)

	if (global_macro_render_context !== undefined && global_macro_render_context.type === 'call')
		global_macro_render_context.decidables.push(lookahead_ident)

	return lookahead_ident
}


const render_visiting_functions: VisitingFunctions<Call> = {
	Or(or, next, scope, wrapping_function_name) {
		const choices = [] as ts.Expression[]
		for (let choice_index = 0; choice_index < or.choices.length; choice_index++) {
			const choice = or.choices[choice_index]
			const against = or.choices.slice(choice_index + 1)

			choices.push(render_entity(choice, against, true, next, scope, 'maybe'))
		}
		// since Or always has all the information it needs about whether to enter or not (it merely tries all of its branches)
		// it doesn't need a top level decidable. using maybe_or merely means it doesn't panic if no choice succeeds
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_or' : 'or'), undefined, choices,
		)
	},
	Maybe(maybe, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier('maybe'), undefined,
			render_entity(maybe.definition, gather_branches(next.slice()), false, next, scope, 'maybe'),
		)
	},
	Many(many, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_many' : 'many'), undefined,
			render_entity(many.definition, gather_branches(next.slice()), false, next, scope, 'many'),
		)
	},
	Consume(consume, next, scope, wrapping_function_name) {
		return ts.createCall(
			ts.createIdentifier(wrapping_function_name || 'consume'), undefined,
			consume.token_names.map(render_token_reference),
		)
	},
	LockingVar(locking_var, next, scope, wrapping_function_name) {
		const locker_identifier = ts.createIdentifier(locking_var.locking_arg_name)
		return wrapping_function_name === undefined
			? ts.createCall(locker_identifier, undefined, [])
			: ts.createCall(
				ts.createIdentifier(wrapping_function_name), undefined,
				render_entity([locking_var as Node], gather_branches(next.slice()), false, next, scope, wrapping_function_name),
			)
	},
	Subrule(subrule, next, scope, wrapping_function_name) {
		const rule_identifier = ts.createIdentifier(subrule.rule_name)
		if (wrapping_function_name === undefined)
			return ts.createCall(rule_identifier, undefined, [])

		const rule = get_rule(subrule.rule_name).unwrap()
		const rule_scope = { current: Scope(rule.locking_args, undefined), previous: [] }

		const entity_decidable =
			render_entity_decidable(rule.definition, rule_scope, next, scope, wrapping_function_name)

		return ts.createCall(ts.createIdentifier(wrapping_function_name), undefined, [rule_identifier, entity_decidable])
	},
	MacroCall(macro_call, next, scope, wrapping_function_name) {
		const macro = get_macro(macro_call.macro_name).unwrap()
		const pushed_scope = push_scope(scope, macro.locking_args, macro_call.args)

		if (macro_call.macro_name === 'many_separated') {
			const body_rule = macro_call.args.get_by_name('body_rule').unwrap()
			const separator_rule = macro_call.args.get_by_name('separator_rule').unwrap()

			const body_decidable =
				render_entity_decidable(macro.definition, pushed_scope, next, scope, wrapping_function_name)
			const separator_decidable =
				render_entity_decidable([...separator_rule, ...body_rule], scope, next, scope, wrapping_function_name)

			return ts.createCall(
				ts.createIdentifier(wrapping_function_name === 'maybe' ? 'maybe_many_separated' : 'many_separated'), undefined,
				[
					ts.createCall(ts.createIdentifier('f'), undefined, [render_arrow(body_rule, scope), body_decidable]),
					ts.createCall(ts.createIdentifier('f'), undefined, [render_arrow(separator_rule, scope), separator_decidable]),
				],
			)
		}

		const gathered_decidables: MacroRenderContext = { type: 'call', decidables: [] }
		with_macro_render_context(gathered_decidables, () => {
			render_definition(macro.definition, pushed_scope)
		})

		// all of these args are rendered in the current scope (we haven't already pushed the macro's args)
		const rendered_args = macro_call.args.to_array().map(arg_definition => {
			return render_arrow(arg_definition, scope)
		})
		const macro_identifier = ts.createIdentifier(macro_call.macro_name)
		const macro_args = [...rendered_args, ...gathered_decidables.decidables]

		if (wrapping_function_name === undefined)
			return ts.createCall(macro_identifier, undefined, macro_args)

		const entity_decidable =
			render_entity_decidable(macro.definition, pushed_scope, next, scope, wrapping_function_name)

		return ts.createCall(ts.createIdentifier(wrapping_function_name), undefined, [macro_identifier, entity_decidable, ...macro_args])
	},
	Var(var_node, next, scope, wrapping_function_name) {
		const var_identifier = ts.createIdentifier(var_node.arg_name)
		if (wrapping_function_name === undefined)
			return ts.createCall(ts.createIdentifier('arg'), undefined, [var_identifier])

		const var_definition = scope.current.args.get_by_name(var_node.arg_name).unwrap()
		const var_scope = pop_scope(scope)

		const entity_decidable =
			render_entity_decidable(var_definition, var_scope, next, scope, wrapping_function_name)

		return ts.createCall(ts.createIdentifier(wrapping_function_name), undefined, [var_identifier, entity_decidable])
	},
}
function render_definition(definition: Definition, scope: ScopeStack) {
	return visit_definition(render_visiting_functions, definition, [], scope, undefined)
		.map(rendered => ts.createExpressionStatement(rendered))
}



function render_entity_decidable(
	main: Definition, main_scope: ScopeStack, next: Definition, next_scope: ScopeStack,
	wrapping_function_name: VisitorParams[2],
) {
	return generate_decidable(
		wrapping_function_name,
		t(main, main_scope), gather_branches(next.slice()).map(branch => t(branch, next_scope)),
	)
}

function render_entity<B extends boolean>(
	target: Definition, against: Definition[], atom_style: B,
	...[next, scope, wrapping_function_name]: VisitorParams
): B extends true ? Call : ts.Expression[] {
	if (
		target.length === 1
		&& target[0].type === 'Consume'
	) {
		const c = target[0]
		return atom_style
			? ts.createCall(
				ts.createIdentifier('t'), undefined,
				c.token_names.map(render_token_reference),
			) as B extends true ? Call : ts.Expression[]
			: c.token_names.map(render_token_reference) as unknown as B extends true ? Call : ts.Expression[]
	}

	if (
		target.length === 1
		&& (
			target[0].type === 'Subrule'
			// || target[0].type === 'MacroCall'
			|| target[0].type === 'Var'
		)
	) {
		const entity = target[0]
		const entity_args = exec(() => {
			switch (entity.type) {
			case 'Subrule':
				return render_visiting_functions.Subrule(entity, next, scope, 'maybe').arguments
			// case 'MacroCall':
			// 	return render_visiting_functions.MacroCall(entity, next, scope, 'maybe').arguments
			case 'Var':
				return render_visiting_functions.Var(entity, next, scope, 'maybe').arguments
			default:
				return exhaustive(entity)
			}
		})

		return atom_style
			? ts.createCall(ts.createIdentifier('f'), undefined, entity_args) as B extends true ? Call : ts.Expression[]
			: entity_args as unknown as B extends true ? Call : ts.Expression[]
	}

	const rendered_entity = render_arrow(target, scope)

	const overall_decidable = generate_decidable(
		wrapping_function_name,
		t(target, scope), against.map(branch => t(branch, scope)),
	)

	return atom_style
		? ts.createCall(
			ts.createIdentifier('f'), undefined,
			[rendered_entity, overall_decidable],
		) as B extends true ? Call : ts.Expression[]
		: [rendered_entity, overall_decidable] as unknown as B extends true ? Call : ts.Expression[]
}

function render_arrow(...[definition, scope]: DefinitionTuple) {
	return ts.createArrowFunction(
		undefined, undefined, [], undefined,
		ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		ts.createBlock(render_definition(definition, scope), true),
	)
}

export function render_macro(macro: Macro) {
	if (macro.name === 'many_separated')
		return undefined

	const lockers = (macro.locking_args !== undefined ? macro.locking_args.to_array() : []).map(render_locking_arg)
	const args = macro.args.to_array()

	const macro_render_context: MacroRenderContext = { type: 'definition', count: 0 }
	const starting_scope = { current: Scope(macro.locking_args, undefined), previous: [] }
	const rendered_definition = with_macro_render_context(macro_render_context, () => {
		return render_definition(macro.definition, starting_scope)
	})

	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		ts.createIdentifier(macro.name),
		// generics
		args.map(arg => ts.createTypeParameterDeclaration(
			ts.createIdentifier(arg.name.toUpperCase()),
			ts.createTypeReferenceNode(ts.createIdentifier('ParseArg'), undefined), undefined,
		)),
		// actual args
		[
			...args.map(arg => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(arg.name), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier(arg.name.toUpperCase()), undefined), undefined,
			)),
			...array_of(macro_render_context.count).map((_, index) => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(`_d${index + 1}`), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier('Decidable'), undefined), undefined,
			)),
		],
		undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}




export function render_grammar(grammar: Grammar, filename = '') {
	const token_defs = new UniqueDict<TokenDef>()
	const virtual_lexers = new UniqueDict<VirtualLexerUsage>()
	const rules = new UniqueDict<Rule>()
	const macros = new UniqueDict<Macro>()
	macros.set('many_separated', Macro(
		'many_separated',
		OrderedDict.create_unique('name', [Arg('body_rule'), Arg('separator_rule')]).unwrap(),
		[Var('body_rule'), Maybe([Many([Var('separator_rule'), Var('body_rule')])])],
	)).unwrap()

	const matcher = {
		ok: () => undefined,
		err: (e: [string, unknown, unknown]) =>
			`there are conflicting definitions for: ${e[0]}`,
	}

	const conflict_errors = grammar.filter_map(grammar_item => {
		switch (grammar_item.type) {
		case 'TokenDef':
			return token_defs.set(grammar_item.name, grammar_item).match(matcher)

		case 'VirtualLexerUsage':
			for (const exposed_token_name of Object.keys(grammar_item.exposed_tokens))
				if (token_defs.get(exposed_token_name).is_some())
					return matcher.err([exposed_token_name, undefined, undefined])
			return virtual_lexers.set(grammar_item.virtual_lexer_name, grammar_item).match(matcher)

		case 'Rule':
			return rules.set(grammar_item.name, grammar_item).match(matcher)

		case 'Macro':
			return macros.set(grammar_item.name, grammar_item).match(matcher)

		}
	})

	if (conflict_errors.length > 0)
		throw new Error(conflict_errors.join('\n\n'))

	set_registered_tokens(token_defs.into_dict())
	set_registered_virtual_lexers(virtual_lexers.into_dict())
	set_registered_rules(rules.into_dict())
	set_registered_macros(macros.into_dict())

	// log(rules.values().map(r => r.definition))
	const rules_macros: (Rule | Macro)[] = [...rules.values(), ...macros.values()]
	const validation_errors = rules_macros
		.flat_map(validate_references)
	if (validation_errors.length > 0)
		throw new Error(validation_errors.join('\n\n'))

	const left_recursive_rules = rules_macros
		.filter(check_left_recursive)
	if (left_recursive_rules.length > 0)
		throw new Error(`There are left recursive rules: ${left_recursive_rules.join('\n\n')}`)

	const rendered_tokens = token_defs.values().map(render_token_def)
	const rendered_virtual_lexers = virtual_lexers.values().map(render_virtual_lexer_usage)
	const rendered_macros = macros.values().filter_map(render_macro)
	const rendered_rules = rules.values().map(render_rule)

	const rendered_decidables = ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList(
		[ts.createVariableDeclaration(
			ts.createArrayBindingPattern(array_of(global_decidables.length).map((_, index) => ts.createBindingElement(
				undefined, undefined,
				ts.createIdentifier(`_${index}`), undefined,
			))),
			undefined,
			ts.createArrayLiteral(global_decidables, false),
		)], ts.NodeFlags.Const),
	)

	const destructured_parser_names = [
		'tok', 'reset', 'exit', 'arg', 'maybe', 'consume', 'many', 'maybe_many',
		'or', 'maybe_or', 'many_separated', 'maybe_many_separated',
	]

	const parser_statement = ts.createVariableStatement(
		[ts.createModifier(ts.SyntaxKind.ExportKeyword)],
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(ts.createObjectBindingPattern(
				destructured_parser_names.map(name => ts.createBindingElement(undefined, undefined, ts.createIdentifier(name), undefined))
			), undefined,
			ts.createCall(ts.createIdentifier('Parser'), undefined, [
				ts.createObjectLiteral(rendered_tokens, true),
				ts.createObjectLiteral(rendered_virtual_lexers, false),
			]),
		)], ts.NodeFlags.Const),
	)

	const import_statement = ts.createImportDeclaration(
		undefined, undefined,
		ts.createImportClause(
			undefined,
			ts.createNamedImports(
				['Parser', 'ParseArg', 'Decidable', 'path', 'branch', 't', 'f'].map(i =>
					ts.createImportSpecifier(undefined, ts.createIdentifier(i)),
				)
			),
		), ts.createStringLiteral('./index'),
		// ), ts.createStringLiteral('kreia'),
	)

	const virtual_lexer_imports = virtual_lexers.values().map(virtual_lexer => {
		return ts.createImportDeclaration(
			undefined, undefined,
			ts.createImportClause(
				undefined,
				ts.createNamedImports([
					ts.createImportSpecifier(undefined, ts.createIdentifier(virtual_lexer.virtual_lexer_name))
				]),
			), ts.createStringLiteral(virtual_lexer.path),
		)
	})

	const resultFile =
		ts.createSourceFile(filename, '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: true })

	const imports = [import_statement, ...virtual_lexer_imports]
		.map(item => printer.printNode(ts.EmitHint.Unspecified, item, resultFile))
		.join('\n')

	const rest = [
		parser_statement,
		rendered_decidables,
		...rendered_rules,
		...rendered_macros,
	]
		.map(item => printer.printNode(ts.EmitHint.Unspecified, item, resultFile))
		.join('\n\n')

	return `${imports}\n\n${rest}`
}

function render_regex_spec(regex_spec: RegexSpec) {
	switch (regex_spec.type) {
	case 'regex':
		return ts.createRegularExpressionLiteral(`/${regex_spec.source}/`)
	case 'string':
		return ts.createStringLiteral(regex_spec.value)
	}
}

function render_match_spec(match_spec: MatchSpec) {
	switch (match_spec.type) {
	case 'array':
		return ts.createArrayLiteral(match_spec.items.map(render_regex_spec), false)
	default:
		return render_regex_spec(match_spec)
	}
}

function render_token_spec(token_spec: TokenSpec) {
	switch (token_spec.type) {
	case 'options': {
		const assignments = [
			ts.createPropertyAssignment(
				ts.createIdentifier('match'),
				render_match_spec(token_spec.match),
			),
		]
		if (token_spec.ignore)
			assignments.push(ts.createPropertyAssignment(
				ts.createIdentifier('ignore'),
				ts.createTrue(),
			))

		// TODO this is where the keyword: true argument would go

		return ts.createObjectLiteral(assignments, false)
	}
	default:
		return render_match_spec(token_spec)
	}
}

function render_token_def(token_def: TokenDef) {
	return ts.createPropertyAssignment(
		ts.createIdentifier(token_def.name),
		render_token_spec(token_def.def),
	)
}


function render_locking_arg(arg: LockingArg) {
	return ts.createVariableStatement(
		undefined,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(arg.name), undefined,
				ts.createCall(ts.createIdentifier('lock'), undefined, [
					ts.createIdentifier(arg.token_name),
				]),
			),
		], ts.NodeFlags.Const),
	)
}

function render_token_reference(token_name: string) {
	return ts.createPropertyAccess(
		ts.createIdentifier('tok'),
		ts.createIdentifier(token_name),
	)
}

function render_decidable(decidable: AstDecidable): Call {
	switch (decidable.type) {
	case 'AstDecisionPath':
		return ts.createCall(
			ts.createIdentifier('path'), undefined,
			decidable.path.map(item =>
				Array.isArray(item)
					? ts.createArrayLiteral(item.map(render_token_reference), false)
					: render_decidable(item)
			),
		)
	case 'AstDecisionBranch':
		return ts.createCall(
			ts.createIdentifier('branch'), undefined,
			decidable.paths.map(path => render_decidable(path)) as ts.Expression[],
		)
	}
}

function render_tuple_call(params: ts.Expression[]) {
	return ts.createCall(ts.createIdentifier('t'), undefined, params)
}

function render_virtual_lexer_usage(virtual_lexer: VirtualLexerUsage) {
	const name = ts.createIdentifier(virtual_lexer.virtual_lexer_name)
	return ts.createPropertyAssignment(
		name,
		render_tuple_call([name, render_tuple_call(virtual_lexer.args.map(render_token_spec))])
	)
}

export function render_rule(rule: Rule) {
	const lockers = (rule.locking_args !== undefined ? rule.locking_args.to_array() : []).map(render_locking_arg)

	if (global_macro_render_context !== undefined)
		throw new Error('global_macro_render_context should be undefined')
	const starting_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
	const rendered_definition = render_definition(rule.definition, starting_scope)

	return ts.createFunctionDeclaration(
		undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], undefined,
		ts.createIdentifier(rule.name),
		[], [], undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}
