// https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#user-content-creating-and-printing-a-typescript-ast
// https://github.com/HearTao/ts-creator

import ts = require('typescript')
import { Dict } from '@ts-std/types'
import { Maybe as Option } from '@ts-std/monads'

import { Data, exhaustive, debug, exec, array_of, empty_ordered_dict } from '../utils'

import { AstDecidable } from './decision'
import { gather_branches, compute_decidable } from './decision_compute'

type Call = ReturnType<typeof ts.createCall>

// every time we call render_entity, we might want to do so in one of two ways:
// - normal, compute a decidable and move on
// - just use a blank _d# identifier. this is when we're directly inside a macro definition. if this is the case, we need to know what number we're on

// when we render a macro_call, we need to go through the shallow definition (not recursing at all into subrules or other macro_calls)

// when rendering a macro definition, we need to traverse the definition and render the entities with numbered decisions instead of newly computed ones
// when rendering macro calls we need to traverse the definition only to gather the final computed values of those decisions.

// when counting decision points to render a macro definition, you don't have to iterate vars and macro calls, because in fact you can't. in fact you shouldn't recurse beyond the current definition at all. when gathering the finalized decision points at render time, the same is true that you don't recurse beyond the macro definition as you gather them, but you will have to recurse beyond in order to compute the decision points. you do have to render the provided vars themselves though

// type MacroRenderContext = { count: number }
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
): ts.Identifier | undefined {
	if (global_macro_render_context === undefined)
		return undefined

	switch (global_macro_render_context.type) {
	case 'definition':
		global_macro_render_context.count++
		return ts.createIdentifier(`_d${global_macro_render_context.count}`)

	case 'call':
		const decidable = compute_decidable(main, against)
		const lookahead_definition = render_decidable(decidable)
		const lookahead_number = global_decidables.length
		global_decidables.push(lookahead_definition)
		const lookahead_ident = ts.createIdentifier(`_${lookahead_number}`)
		global_macro_render_context.decidables.push(lookahead_ident)
		return lookahead_ident

	default:
		return exhaustive(global_macro_render_context)
	}
}

// function render_global_decidables() {
// 	return ts.createVariableStatement(
// 		undefined, ts.createVariableDeclarationList(
// 		[ts.createVariableDeclaration(
// 			ts.createArrayBindingPattern(array_of(global_decidables.length).map((_, index) => ts.createBindingElement(
// 				undefined, undefined,
// 				ts.createIdentifier(`_${index}`), undefined,
// 			))),
// 			undefined,
// 			ts.createArrayLiteral(global_decidables, false),
// 		)], ts.NodeFlags.Const),
// 	)
// }


const render_visiting_functions: VisitingFunctions<ts.Expression> = {
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
			consume.token_names.map(ts.createIdentifier),
		)
	},
	LockingVar(locking_var, next, scope, wrapping_function_name) {
		const locker_identifier = ts.createIdentifier(locking_var.locking_arg_name)
		return wrapping_function_name === undefined
			? ts.createCall(locker_identifier, undefined, [])
			: ts.createCall(
				ts.createIdentifier(wrapping_function_name), undefined,
				render_entity([locking_var], gather_branches(next.slice()), false, next, scope, wrapping_function_name),
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
		const macro = get_macro(macro_call.macro_name)
		const pushed_scope = push_scope(scope, macro.locking_args, macro_call.args)

		const gathered_decidables = { type: 'call', decidables: [] }
		with_macro_render_context(gathered_decidables, () => {
			render_definition(macro.definition, pushed_scope)
		})

		// all of these args are rendered in the current scope (we haven't already pushed the macro's args)
		const rendered_args = macro_call.args.to_array().map(arg_definition => {
			return render_definition(arg_definition, scope)
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
		.map(ts.createExpressionStatement)
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
				c.token_names.map(ts.createIdentifier),
			) as B extends true ? Call : ts.Expression[]
			: c.token_names.map(ts.createIdentifier) as unknown as B extends true ? Call : ts.Expression[]
	}

	if (
		target.length === 1
		&& (
			target[0].type === 'Subrule'
			|| target[0].type === 'MacroCall'
			|| target[0].type === 'Var'
		)
	) {
		const entity = target[0]
		const entity_args = exec(() => {
			switch (entity.type) {
			case 'Subrule':
				return render_visiting_functions.Subrule(entity, next, scope, 'maybe').argumentsArray
			case 'MacroCall':
				return render_visiting_functions.MacroCall(entity, next, scope, 'maybe').argumentsArray
			case 'Var':
				return render_visiting_functions.Var(entity, next, scope, 'maybe').argumentsArray
			default:
				return exhaustive(entity)
			}
		})

		return atom_style
			? ts.createCall(ts.createIdentifier('f'), undefined, entity_args)
			: entity_args
	}

	const rendered_entity = return ts.createArrowFunction(
		undefined, undefined, [], undefined,
		ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		ts.createBlock(render_definition(target, scope), true),
	)

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


function render_macro(macro: Macro) {
	if (macro.name === 'many_separated')
		return undefined

	const lockers = (macro.locking_args !== undefined ? macro.locking_args.to_array() : []).map(render_locking_arg)
	const args = macro.args.to_array()

	const macro_render_context = { type: 'definition', count: 0 }
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
			ts.createTypeReferenceNode(ts.createIdentifier('ArgBody'), undefined), undefined,
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
			))),
		],
		undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}




export function render_grammar(grammar: Grammar) {
	const token_defs = new UniqueDict<TokenDef>()
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
		case 'Rule':
			return rules.set(grammar_item.name, grammar_item).match(matcher)
		case 'Macro':
			return macros.set(grammar_item.name, grammar_item).match(matcher)
		}
	})

	if (conflict_errors.length > 0)
		throw new Error(conflict_errors.join('\n\n'))

	registered_tokens = token_defs.into_dict()
	registered_rules = rules.into_dict()
	registered_macros = macros.into_dict()

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
	const rendered_macros = macros.values().filter_map(render_macro)
	const rendered_rules = rules.values().map(render_rule)
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

function render_token_def(token_def: TokenDef) {
	switch (token_def.def.type) {
	case 'options': {
		const assigments = [
			ts.createPropertyAssignment(
				ts.createIdentifier('match'),
				render_match_spec(token_def.def.match),
			),
		]
		if (token_def.def.ignore)
			assigments.push(ts.createPropertyAssignment(
				ts.createIdentifier('ignore'),
				ts.createTrue(),
			))

		const body = ts.createObjectLiteral(assigments, false)
		return wrap_token_def(token_def.name, body)
	}
	default:
		const body = render_match_spec(token_def.def)
		return wrap_token_def(token_def.name, body)
	}
}

function wrap_token_def(name: string, expression: ts.Expression) {
	return ts.createVariableStatement(
		undefined, ts.createVariableDeclarationList([
			ts.createVariableDeclaration(
				ts.createIdentifier(name), undefined,
				ts.createCall(ts.createIdentifier('Token'), undefined, [
					ts.createStringLiteral(name),
					expression,
				]),
			)], ts.NodeFlags.Const,
		),
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


function render_decidable(decidable: AstDecidable): Call {
	switch (decidable.type) {
	case 'AstDecisionPath':
		return ts.createCall(
			ts.createIdentifier('path'), undefined,
			decidable.path.map(item =>
				Array.isArray(item)
					? item.map(token_def => ts.createIdentifier(token_def.name))
					: render_decidable(item)
			) as ts.Expression[],
		)
	case 'AstDecisionBranch':
		return ts.createCall(
			ts.createIdentifier('branch'), undefined,
			decidable.paths.map(render_decidable) as ts.Expression[],
		)
	}
}

function render_rule(rule: Rule) {
	const lockers = (rule.locking_args !== undefined ? rule.locking_args.to_array() : []).map(render_locking_arg)

	if (global_macro_render_context !== undefined)
		throw new Error('global_macro_render_context should be undefined')
	const starting_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
	const rendered_definition = render_definition(rule.definition, starting_scope)

	return ts.createFunctionDeclaration(
		undefined, undefined, undefined,
		ts.createIdentifier(rule.name),
		[], [], undefined,
		ts.createBlock([...lockers, ...rendered_definition], true),
	)
}


// const resultFile = ts.createSourceFile(
// 	'lib/generated.ts',
// 	'',
// 	ts.ScriptTarget.Latest,
// 	/*setParentNodes*/ false,
// 	ts.ScriptKind.TS,
// )
// const printer = ts.createPrinter({
// 	newLine: ts.NewLineKind.LineFeed
// })
// const result = printer.printNode(
// 	ts.EmitHint.Unspecified,
// 	f(),
// 	resultFile,
// )

// console.log(result)
