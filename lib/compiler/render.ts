import ts = require('typescript')
import { Dict, tuple as t } from '@ts-std/types'
import { UniqueDict } from '@ts-std/collections'
import { MaxDict, NonEmpty, exhaustive, array_of, exec } from '../utils'

import * as ast from './ast'
import {
	BaseModifier, Modifier, Scope as AstScope, ScopeStack as AstScopeStack, Node, Definition, Registry,
	TokenDef, VirtualLexerUsage, Rule, Macro, Grammar,
	LockingArg,
} from './ast'
import { TokenSpec, BaseTokenSpec } from '../runtime/lexer'
import { AstDecidable, compute_decidable } from './decision_compute'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 3 } })

function create_call(function_name: string, args: ts.Expression[]) {
	return ts.createCall(ts.createIdentifier(function_name), undefined, args)
}

function create_statement(expression: ts.Expression) {
	return ts.createExpressionStatement(expression)
}

function render_token_reference(token_name: string) {
	return ts.createPropertyAccess(
		ts.createIdentifier('tok'),
		ts.createIdentifier(token_name),
	)
}
function render_token_tuple(token_names: NonEmpty<string>) {
	return token_names.map(render_token_reference)
}

function wrapping_name(modifier: Modifier) {
	switch (modifier) {
		case BaseModifier.Many: return 'many' as const
		case BaseModifier.Maybe: return 'maybe' as const
		case BaseModifier.MaybeMany: return 'maybe_many' as const
		default: return undefined
	}
}

function wrap_function_name(function_name: string, modifier: Modifier) {
	switch (modifier) {
		case BaseModifier.Many: return `many_${function_name}`
		case BaseModifier.Maybe: return `maybe_${function_name}`
		case BaseModifier.MaybeMany: return `maybe_many_${function_name}`
		default: return function_name
	}
}


// let global_render_context = undefined as undefined | RenderContext
// function with_render_context<T>(render_context: RenderContext, fn: () => T): T {
// 	const saved = global_render_context
// 	global_render_context = render_context
// 	const result = fn()
// 	global_render_context = saved
// 	return result
// }

let global_decidables = {} as Dict<ts.CallExpression>
function generate_decidable(
	main_definition: Definition, main_scope: ScopeStack,
	known_against: [Definition, ScopeStack][],
	next: [Node, ScopeStack][],
	calling_modifier: Modifier,
) {
	if (global_render_context !== undefined && global_render_context.type === 'counting')
		return generate_fake_decidable()

	// console.log('main_definition', main_definition)
	// console.log('known_against.map(a => a[0])', known_against.map(a => a[0]))
	// console.log('next.map(a => a[0])', next.map(a => a[0]))
	// console.log('calling_modifier', calling_modifier)
	const should_gather = calling_modifier !== undefined
	// console.log('should_gather', should_gather)
	const decidable = compute_decidable(t(main_definition, main_scope), known_against, next, should_gather)
	const rendered_decidable = render_decidable(decidable)

	const decidable_name = `_${decidable.to_hash()}`
	const decidable_ident = ts.createIdentifier(decidable_name)
	global_decidables[decidable_name] = rendered_decidable

	if (global_render_context !== undefined && global_render_context.type === 'gathering_macro_call')
		global_render_context.decidables.push(decidable_ident)

	if (global_render_context !== undefined && global_render_context.type === 'gathering_arg') {
		const current_point = global_render_context.current_point
		global_render_context.current_point++

		const [final_ident, ] = global_render_context.points.set('' + current_point, t(decidable_ident, decidable))
		return final_ident
	}

	return decidable_ident
}
function generate_fake_decidable() {
	if (!(global_render_context !== undefined && global_render_context.type === 'counting'))
		throw new Error("tried to generate_fake_decidable while not in a 'counting' global_render_context")

	global_render_context.count++
	return ts.createIdentifier(`_d${global_render_context.count}`)
}
function render_decidable(decidable: AstDecidable): ts.CallExpression {
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



function render_definition(
	nodes: NonEmpty<Node>, scope: ScopeStack, parent_next: [Node, ScopeStack][],
	parent_other_choices: [Definition, ScopeStack][],
) {
	// console.log('nodes', nodes)
	// console.log('parent_next', parent_next)
	// console.log()

	const rendered = []
	for (const [index, node] of nodes.entries()) {
		// console.log('index', index)
		const next = [...Scope.zip_nodes(nodes.slice(index + 1), scope), ...parent_next]
		// console.log('next', next)
		// console.log()
		rendered.push(create_statement(render_node(node, scope, next, parent_other_choices)))
	}
	// console.log()
	// console.log()
	return rendered
}
function render_definition_arrow(
	nodes: NonEmpty<Node>, scope: ScopeStack, parent_next: [Node, ScopeStack][],
	parent_other_choices: [Definition, ScopeStack][],
) {
	return ts.createArrowFunction(
		undefined, undefined, [], undefined,
		ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		ts.createBlock(render_definition(nodes, scope, parent_next, parent_other_choices), true),
	)
}


function render_node(
	node: Node, scope: ScopeStack, next: [Node, ScopeStack][],
	parent_other_choices: [Definition, ScopeStack][],
): ts.CallExpression {
	switch (node.type) {

	case 'Paren': {
		const function_name = exec(() => {
			switch (node.modifier) {
				case BaseModifier.Many: return 'many' as const
				case BaseModifier.Maybe: return 'maybe' as const
				case BaseModifier.MaybeMany: return 'maybe_many' as const
			}
		})
		// we assume that since Paren is defined as containing NonLone<Node>,
		// and since we also assume that we fold all adjacent token references into a single assume
		// that Paren can never have a simple token tuple as its decidable
		// (if we go with NotEnough, we'll "lift" it to the next highest Consume, so we don't split up a Consume, so this will remain true)
		// therefore, this will never need to flatten, and we can simply generate a decidable

		const decidable = generate_decidable(node.nodes, scope, parent_other_choices, next, node.modifier)
		return create_call(function_name, [render_definition_arrow(node.nodes, scope, next, parent_other_choices), decidable])
	}

	case 'Or': {
		const choices = []
		for (const [choice_index, choice] of node.choices.entries()) {
			const choice = node.choices[choice_index]
			const other_choices = [
				...Scope.zip_definitions(node.choices.slice(choice_index + 1), scope),
				...parent_other_choices,
			]

			// this is the only place where flattening is useful or necessary
			const flattened = Definition.flatten(choice)
			if (
				Array.isArray(flattened)
				|| flattened.modifier !== undefined
				|| flattened.type === 'Var'
				|| flattened.type === 'LockingVar'
			) {
				const decidable = generate_decidable(choice, scope, other_choices, next, node.modifier)
				choices.push(create_call('c', [render_definition_arrow(choice, scope, next, other_choices), decidable]))
				continue
			}
			// it correctly narrowed!
			// if (flattened.type === 'Paren')
			// 	return impossible()
			if (flattened.type === 'Or')
				throw new Error("an unmodified Or is the only node in a choice of an Or")

			// if (flattened.type === 'Consume') {
			// 	choices.push(create_call('t', render_token_tuple(flattened.token_names)))
			// 	continue
			// }

			// since we know that the modifier is undefined, this will only return the args
			// flattened.type === 'Subrule' || flattened.type === 'MacroCall'
			const sub_call = render_node(flattened, scope, next, other_choices)
			choices.push(create_call('c', [sub_call.expression, ...sub_call.arguments]))
		}

		return create_call(wrap_function_name('or', node.modifier), choices)
	}

	case 'Subrule': {
		const rule = Registry.get_rule(node.rule_name).unwrap()
		const rule_scope = Scope.for_rule(rule)
		// const gathered: RenderContext = { type: 'gathering', decidables: [] }
		// with_render_context(gathered, () => {
		// 	render_definition(rule.definition, rule_scope, next)
		// })

		const maybe_function_name = wrapping_name(node.modifier)
		if (maybe_function_name === undefined)
			return create_call(rule.name, [])
			// return create_call(rule.name, gathered.decidables)

		const decidable = generate_decidable(rule.definition, rule_scope, parent_other_choices, next, node.modifier)
		return create_call(maybe_function_name, [ts.createIdentifier(rule.name), decidable])
		// return create_call(maybe_function_name, [ts.createIdentifier(rule.name), decidable, ...gathered.decidables])
	}

	case 'MacroCall': {
		const macro = Registry.get_macro(node.macro_name).unwrap()
		const macro_scope = Scope.for_macro_call(scope, macro, node)

		const gathered: RenderContext = { type: 'gathering_macro_call', body_decidables: [], rendered_args: {} }
		with_render_context(gathered, () => {
			render_definition(macro.definition, macro_scope, next, parent_other_choices)
		})

		const rendered_args = macro.args.map(arg => Maybe.from_nillable(gathered.rendered_args[arg.name]).unwrap())
		const macro_args = [...rendered_args, ...gathered.body_decidables]

		const maybe_function_name = wrapping_name(node.modifier)
		if (maybe_function_name === undefined)
			return create_call(macro.name, macro_args)

		const decidable = generate_decidable(macro.definition, macro_scope, parent_other_choices, next, node.modifier)
		return create_call(maybe_function_name, [ts.createIdentifier(macro.name), decidable, ...macro_args])
	}

	case 'Var': {
		if (global_render_context !== undefined && global_render_context.type === 'counting') {
			const maybe_function_name = wrapping_name(node.modifier)
			if (maybe_function_name === undefined)
				return create_call(node.arg_name, [])

			// this Var *must* appear directly inside a macro definition, otherwise it makes no sense
			// the real one is generated at the MacroCall site that fills in this decidable
			return create_call(maybe_function_name, [ts.createIdentifier(node.arg_name), generate_fake_decidable()])
		}

		if (global_render_context === undefined || global_render_context.type !== 'gathering_macro_call')
			throw new Error("tried to render a Var while not in a counting or gathering_macro_call RenderContext")

		// this arg_scope now contains the necessary information to capture this Var's arrow
		const [arg_scope, arg_definition] = Scope.for_var(scope, node)

		const rendered_arrow = render_definition_arrow(arg_definition, arg_scope, next, parent_other_choices)
		scope.render_context.rendered_args[node.arg_name] = rendered_arrow

		if (node.modifier !== undefined) {
			generate_decidable(arg_definition, arg_scope, parent_other_choices, next, node.modifier)
		}

		return create_call('fake', [])
	}

	// these two are the simplest
	// they never need a decidable
	case 'Consume': {
		const function_name = wrapping_name(node.modifier) || 'consume'
		return create_call(function_name, render_token_tuple(node.token_names))
	}
	case 'LockingVar': {
		const function_name = wrap_function_name('lock', node.modifier)
		return create_call(function_name, [ts.createIdentifier(node.locking_arg_name)])
	}}
}



export function render_grammar(grammar: Grammar) {
	global_decidables = []
	const token_defs = new UniqueDict<TokenDef>()
	const virtual_lexers = new UniqueDict<VirtualLexerUsage>()
	const rules = new UniqueDict<Rule>()
	const macros = new UniqueDict<Macro>()
	// macros.set('many_separated', new Macro(
	// 	'many_separated',
	// 	[Arg('body_rule'), Arg('separator_rule')],
	// 	[Var('body_rule'), Maybe([Many([Var('separator_rule'), Var('body_rule')])])],
	// )).unwrap()

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

	Registry.set_registered_tokens(token_defs.into_dict())
	Registry.set_registered_virtual_lexers(virtual_lexers.into_dict())
	Registry.set_registered_rules(rules.into_dict())
	Registry.set_registered_macros(macros.into_dict())

	// log(rules.values().map(r => r.definition))
	// const rules_macros: (Rule | Macro)[] = [...rules.values(), ...macros.values()]
	// const validation_errors = rules_macros
	// 	.flat_map(validate_references)
	// if (validation_errors.length > 0)
	// 	throw new Error(validation_errors.join('\n\n'))

	// const left_recursive_rules = rules_macros
	// 	.filter(check_left_recursive)
	// if (left_recursive_rules.length > 0)
	// 	throw new Error(`There are left recursive rules: ${left_recursive_rules.join('\n\n')}`)

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

	return {
		import_statement, virtual_lexer_imports, parser_statement,
		rendered_decidables, rendered_rules, rendered_macros,
	}
}

export function render_rule(rule: Rule) {
	const lockers = rule.ordered_locking_args.map(render_locking_arg)

	if (global_render_context !== undefined)
		throw new Error('global_render_context should be undefined')

	const scope = Scope.for_rule(rule)
	const rendered_definition = render_definition(rule.definition, scope, [], [])
	// const render_context: RenderContext = { type: 'counting', count: 0 }
	// const rendered_definition = with_render_context(render_context, () => {
	// 	return render_definition(rule.definition, scope, [])
	// })

	return ts.createFunctionDeclaration(
		undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)], undefined,
		ts.createIdentifier(rule.name), [],

		// array_of(render_context.count).map((_, index) => ts.createParameter(
		// 	undefined, undefined, undefined,
		// 	ts.createIdentifier(`_d${index + 1}`), undefined,
		// 	ts.createTypeReferenceNode(ts.createIdentifier('Decidable'), undefined), undefined,
		// )),
		[],
		undefined,

		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}

function render_locking_arg(arg: LockingArg) {
	return ts.createVariableStatement(
		undefined,
		ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(arg.name), undefined,
				create_call('lock', [ts.createIdentifier(arg.token_name)]),
			),
		], ts.NodeFlags.Const),
	)
}


export function render_macro(macro: Macro) {
	// if (macro.name === 'many_separated')
	// 	return undefined

	const lockers = macro.ordered_locking_args.map(render_locking_arg)
	const args = macro.args

	const render_context: RenderContext = { type: 'counting', count: 0 }
	const macro_scope = Scope.for_macro(macro)
	const rendered_definition = with_render_context(render_context, () => {
		return render_definition(macro.definition, macro_scope, [], [])
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
			...array_of(render_context.count).map((_, index) => ts.createParameter(
				undefined, undefined, undefined,
				ts.createIdentifier(`_d${index + 1}`), undefined,
				ts.createTypeReferenceNode(ts.createIdentifier('Decidable'), undefined), undefined,
			)),
		],
		undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}


function render_virtual_lexer_usage(virtual_lexer: VirtualLexerUsage) {
	const name = ts.createIdentifier(virtual_lexer.virtual_lexer_name)
	return ts.createPropertyAssignment(
		name,
		create_call('t', [name, create_call('t', virtual_lexer.args.map(render_token_spec))]),
	)
}


function render_token_def(token_def: TokenDef) {
	return ts.createPropertyAssignment(
		ts.createIdentifier(token_def.name),
		render_token_spec(token_def.def),
	)
}

function render_token_spec(spec: TokenSpec) {
	if (typeof spec === 'object' && 'match' in spec) {
		const assignments = [
			ts.createPropertyAssignment(
				ts.createIdentifier('match'),
				render_base_spec(spec.match),
			),
		]
		if (spec.ignore)
			assignments.push(ts.createPropertyAssignment(
				ts.createIdentifier('ignore'),
				ts.createTrue(),
			))

		// TODO this is where the keyword: true argument would go
		return ts.createObjectLiteral(assignments, false)
	}

	return render_base_spec(spec)
}

function render_regex(def: RegExp | string) {
	return typeof def === 'string'
		? ts.createStringLiteral(def)
		: ts.createRegularExpressionLiteral(`/${def.source}/`)
}

function render_base_spec(spec: BaseTokenSpec) {
	return Array.isArray(spec)
		? ts.createArrayLiteral(spec.map(render_regex), false)
		: render_regex(spec)
}
