import ts = require('typescript')
import { Maybe } from '@ts-std/monads'
import { Dict, tuple as t } from '@ts-std/types'
import { UniqueDict, DefaultDict } from '@ts-std/collections'
import { MaxDict, NonEmpty, exhaustive, array_of, exec } from '../utils'

import { RegexComponent } from './ast_tokens'
import { validate_references, check_left_recursive } from './ast_validate'
import {
	BaseModifier, Modifier, Scope as AstScope, ScopeStack as AstScopeStack, Node, Definition, Registry,
	TokenDef, VirtualLexerUsage, Rule, Macro, Grammar, LockingArg,
} from './ast'
import { finalize_regex, TokenSpec } from '../runtime/lexer'
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


function points_initializer(left: AstDecidable, right: AstDecidable) {
	return left.test_length > right.test_length
}

function rendered_args_initializer() {
	return {
		arrow: undefined as ts.Expression | undefined, current_point: 0,
		points: new MaxDict(points_initializer),
	}
}

type RenderContext = {
	macro_definition_count: { count: number } | undefined,
	maximizing_var: { current_point: number, points: MaxDict<AstDecidable> } | undefined,
	receiving_macro_calls: {
		body_decidables: ts.Identifier[],
		rendered_args: DefaultDict<{ arrow: ts.Expression | undefined, points: MaxDict<AstDecidable> }>,
	}[],
}
function push_macro_call_decidable(scope: Scope, decidable_ident: ts.Identifier) {
	// for (const receiving_macro_call of scope.receiving_macro_calls) {
	// 	// it might really be that only the bottom one truly needs it
	// 	// or rather, only macro_calls inside of top level vars need it
	// 	receiving_macro_call.body_decidables.push(decidable_ident)
	// }
	if (scope.receiving_macro_calls.length !== 0)
		scope.receiving_macro_calls[0].body_decidables.push(decidable_ident)
}
type Scope = AstScope<RenderContext>
type ScopeStack = { current: Scope, previous: Scope[] }


let global_decidables = {} as Dict<ts.CallExpression>
function generate_decidable(
	main_definition: Definition, main_scope: ScopeStack,
	known_against: [Definition, ScopeStack][],
	next: [Node, ScopeStack][],
	calling_modifier: Modifier,
) {
	const current_scope = main_scope.current
	if (current_scope.macro_definition_count !== undefined) {
		const fake_decidable_ident = generate_fake_decidable(current_scope.macro_definition_count)
		push_macro_call_decidable(current_scope, fake_decidable_ident)
		return fake_decidable_ident
	}

	const should_gather = calling_modifier !== undefined
	const here_decidable = compute_decidable(t(main_definition, main_scope), known_against, next, should_gather)

	// console.log('here_decidable', here_decidable)
	// console.log('current_scope.determiner', current_scope.determiner)
	const decidable = current_scope.maximizing_var !== undefined
		? current_scope.maximizing_var.points.set('' + (++current_scope.maximizing_var.current_point), here_decidable)
		: here_decidable
	// console.log('decidable', decidable)
	// console.log()

	const decidable_name = `_${decidable.to_hash()}`
	const decidable_ident = ts.createIdentifier(decidable_name)
	const rendered_decidable = render_decidable(decidable)
	global_decidables[decidable_name] = rendered_decidable

	push_macro_call_decidable(current_scope, decidable_ident)

	return decidable_ident
}

function generate_fake_decidable(context: { count: number }) {
	context.count++
	return ts.createIdentifier(`_d${context.count}`)
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
		const next = [...AstScope.zip_nodes(nodes.slice(index + 1), scope), ...parent_next]
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
	// if nodes.length === 1 && nodes[]

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
		// and since we also assume that we fold all adjacent token references into a single consume
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
				...AstScope.zip_definitions(node.choices.slice(choice_index + 1), scope),
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
				choices.push(create_call('c', [render_definition_arrow(choice, scope, next, []), decidable]))
				continue
			}
			// it correctly narrowed!
			// if (flattened.type === 'Paren')
			// 	return impossible()
			if (flattened.type === 'Or')
				throw new Error("an unmodified Or is the only node in a choice of an Or")

			if (flattened.type === 'Consume') {
				choices.push(create_call('c', render_token_tuple(flattened.token_names)))
				continue
			}

			// flattened.type === 'Subrule' || flattened.type === 'MacroCall'
			const sub_call = render_node(flattened, scope, next, other_choices)
			const decidable = generate_decidable(choice, scope, other_choices, next, node.modifier)
			choices.push(create_call('c', [sub_call.expression, decidable, ...sub_call.arguments]))
		}

		return create_call(wrap_function_name('or', node.modifier), choices)
	}

	case 'Subrule': {
		const rule = Registry.get_rule(node.rule_name).unwrap()
		const rule_scope = AstScope.for_rule(rule, {
			macro_definition_count: scope.current.macro_definition_count,
			maximizing_var: scope.current.maximizing_var,
			receiving_macro_calls: scope.current.receiving_macro_calls,
		} as RenderContext)

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

		// when we push a new macro call, it and all of its ancestors must receive body decidables
		// however when we render a Var, only the ancestors get that information

		const this_macro_call = { body_decidables: [], rendered_args: new DefaultDict(rendered_args_initializer) }
		const macro_scope = AstScope.for_macro_call(scope, macro, node, {
			macro_definition_count: scope.current.macro_definition_count,
			maximizing_var: scope.current.maximizing_var,
			receiving_macro_calls: [...scope.current.receiving_macro_calls, this_macro_call],
		} as RenderContext)
		// console.log('macro_scope', macro_scope)

		render_definition(macro.definition, macro_scope, next, parent_other_choices)

		// console.log('this_macro_call', this_macro_call)
		const rendered_args = macro.args.map(arg => Maybe.from_nillable(this_macro_call.rendered_args.get(arg.name).arrow).unwrap())
		const macro_args = [...rendered_args, ...this_macro_call.body_decidables]

		const maybe_function_name = wrapping_name(node.modifier)
		if (maybe_function_name === undefined)
			return create_call(macro.name, macro_args)

		const decidable = generate_decidable(macro.definition, macro_scope, parent_other_choices, next, node.modifier)
		return create_call(maybe_function_name, [ts.createIdentifier(macro.name), decidable, ...macro_args])
	}

	case 'Var': {
		// first check if we have a current receiving_macro_call
		// if we are, then we *must* have a scope to pop, so go forward with that
		// if we aren't, we *must* have a count to fall back to

		if (scope.current.receiving_macro_calls.length !== 0) {
			// console.log('scope.current.receiving_macro_call', scope.current.receiving_macro_call)
			// since the for_var *pops* the scope, we should only provide the things that we must override
			// and let the parent scope determine the rest
			// this isn't true with for_rule and for_macro,
			// since they're pushing and therefore must propagate what they have downward
			const current_receiving_macro_call = scope.current.receiving_macro_calls.maybe_get(-1).unwrap()
			const [arg_definition, arg_scope] = AstScope.for_var(scope, node, {
				maximizing_var: {
					current_point: 0,
					points: current_receiving_macro_call.rendered_args.get(node.arg_name).points,
				},
			} as RenderContext)

			// console.log('arg_scope', arg_scope)
			// we always have to call this for the side effects produced with the above maximizing_var
			const rendered_arrow = render_definition_arrow(arg_definition, arg_scope, next, parent_other_choices)
			// const used_rendered_arrow = arg_definition.length === 1 && arg_definition[0].type === 'Var' && arg_definition[0].modifier === undefined
			const used_rendered_arrow = arg_definition.length === 1 && arg_definition[0].type === 'Var' && arg_definition[0].modifier === undefined
				? ts.createIdentifier(arg_definition[0].arg_name)
				: rendered_arrow

			current_receiving_macro_call.rendered_args.get(node.arg_name).arrow = used_rendered_arrow

			if (node.modifier !== undefined) {
				const [arg_definition, arg_scope] = AstScope.for_var(scope, node, {
					receiving_macro_calls: scope.current.receiving_macro_calls,
				} as RenderContext)
				generate_decidable(arg_definition, arg_scope, parent_other_choices, next, node.modifier)
			}

			return create_call('fake', [])
		}

		if (scope.current.macro_definition_count === undefined)
			throw new Error("tried to render a Var while not in a macro definition or macro call")

		const maybe_function_name = wrapping_name(node.modifier)
		return maybe_function_name === undefined
			? create_call(node.arg_name, [])
			: create_call(maybe_function_name, [ts.createIdentifier(node.arg_name), generate_fake_decidable(scope.current.macro_definition_count)])
	}

	case 'Consume': {
		const function_name = wrapping_name(node.modifier) || 'consume'
		return create_call(function_name, render_token_tuple(node.token_names))
	}
	case 'LockingVar': {
		const maybe_function_name = wrapping_name(node.modifier)
		return maybe_function_name === undefined
			? create_call(node.locking_arg_name, [])
			: create_call(maybe_function_name, [ts.createIdentifier(node.locking_arg_name)])
	}}
}



export function render_grammar(grammar: Grammar) {
	global_decidables = {}
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

	const decidable_entries = Object.entries(global_decidables)
	const rendered_decidables = ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList(
		[ts.createVariableDeclaration(
			ts.createObjectBindingPattern(decidable_entries.map(([name, _]) =>
				ts.createBindingElement(undefined, undefined, ts.createIdentifier(name), undefined)
			)),
			undefined,
			ts.createObjectLiteral(decidable_entries.map(([name, decidable]) =>
				ts.createPropertyAssignment(name, decidable),
			), true),
		)],
		ts.NodeFlags.Const,
	))

	const destructured_parser_names = [
		'tok', 'reset', 'lock', 'consume', 'maybe',
		'or', 'maybe_or', 'many_or', 'maybe_many_or', 'many', 'maybe_many', 'exit',
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
				['Parser', 'ParseArg', 'Decidable', 'path', 'branch', 'c'].map(i =>
					ts.createImportSpecifier(undefined, ts.createIdentifier(i)),
				)
			),
		), ts.createStringLiteral('kreia'),
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

	const scope = AstScope.for_rule(rule, {
		macro_definition_count: undefined,
		maximizing_var: undefined,
		receiving_macro_calls: [],
	})
	const rendered_definition = render_definition(rule.definition, scope, [], [])

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
				create_call('lock', [render_token_reference(arg.token_name)]),
			),
		], ts.NodeFlags.Const),
	)
}


export function render_macro(macro: Macro) {
	// if (macro.name === 'many_separated')
	// 	return undefined

	const lockers = macro.ordered_locking_args.map(render_locking_arg)
	const args = macro.args

	const macro_definition_count = { count: 0 }
	const macro_definition_scope = AstScope.for_macro(macro, {
		macro_definition_count,
		maximizing_var: undefined,
		receiving_macro_calls: [],
	})
	const rendered_definition = render_definition(macro.definition, macro_definition_scope, [], [])

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
			...array_of(macro_definition_count.count).map((_, index) => ts.createParameter(
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
	const name = virtual_lexer.virtual_lexer_name
	return ts.createPropertyAssignment(
		name,
		create_call(name, virtual_lexer.args.map(render_regex_component)),
	)
}


function render_token_def(token_def: TokenDef) {
	const regex_literal = render_regex_component(token_def.def)
	return ts.createPropertyAssignment(
		token_def.name,
		token_def.ignore
			? ts.createObjectLiteral([
				ts.createPropertyAssignment('regex', regex_literal),
				ts.createPropertyAssignment('ignore', ts.createTrue())
			], false)
			: regex_literal
	)
}

function render_regex_component(regex_component: RegexComponent) {
	return ts.createRegularExpressionLiteral(`/${regex_component.into_regex_source()}/`)
}
