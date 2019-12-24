import { HashSet } from '@ts-std/collections'
import { Dict, tuple as t } from '@ts-std/types'

import { exhaustive, log_error_message } from '../utils'

import {
	Rule, Macro, Definition, Registry, Scope, ScopeStack,
	zip_args,
} from './ast'

import { Console } from 'console'
const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 5 } })

export function check_left_recursive(thing: Rule | Macro) {
	// console.log('thing.name', thing.name)
	const seen_rules = {} as Dict<true>
	const seen_macros = {} as Dict<true>
	const one_to_add = thing.type === 'Rule' ? seen_rules : seen_macros
	one_to_add[thing.name] = true

	const scope = { current: Scope(thing.locking_args, undefined), previous: [] }
	const checked = _check_left_recursive(seen_rules, seen_macros, thing.definition, scope)
	// console.log(`checked for ${thing.name}`, checked)
	// console.log()
	// console.log()
	// console.log()
	return checked
}
function _check_left_recursive(
	seen_rules: Dict<true>,
	seen_macros: Dict<true>,
	definition: Definition,
	scope: ScopeStack,
): boolean {
	// console.log('seen_rules', seen_rules)
	// console.log('seen_macros', seen_macros)
	// console.log()

	for (const node of definition) {
		// console.log('node.type', node.type)
		switch (node.type) {
		case 'Consume':
			if (!node.is_optional)
				return false
			continue
		case 'LockingVar':
			if (!node.is_optional)
				return false
			continue

		case 'Paren':
			if (_check_left_recursive(seen_rules, seen_macros, node.nodes, scope))
				return true
			if (!node.is_optional)
				return false
			continue

		case 'Or':
			for (const choice of node.choices)
				if (_check_left_recursive(seen_rules, seen_macros, choice, scope))
					return true
			if (!node.is_optional)
				return false
			continue

		case 'Subrule':
			if (seen_rules[node.rule_name])
				return true

			const rule = Registry.get_rule(node.rule_name).unwrap()
			const rule_scope = Scope.for_rule(rule)
			if (_check_left_recursive({ ...seen_rules, [node.rule_name]: true }, seen_macros, rule.definition, rule_scope))
				return true
			if (!node.is_optional)
				return false
			continue

		case 'MacroCall':
			if (seen_macros[node.macro_name])
				return true
			const macro = Registry.get_macro(node.macro_name).unwrap()
			const macro_scope = Scope.for_macro_call(scope, macro, node)
			// if (_check_left_recursive(seen_rules, { ...seen_macros, [node.macro_name]: true }, macro.definition, call_scope))
			if (_check_left_recursive(seen_rules, seen_macros, macro.definition, macro_scope))
				return true
			if (!node.is_optional)
				return false
			continue

		case 'Var':
			const arg_tuple = Scope.try_for_var(scope, node)
			if (arg_tuple === undefined) {
				if (!node.is_optional)
					return false
				continue
			}

			const [var_definition, var_scope] = arg_tuple
			if (_check_left_recursive(seen_rules, seen_macros, var_definition, var_scope))
				return true
			if (!node.is_optional)
				return false
			continue

		default: return exhaustive(node)
		}
	}

	// console.log()
	// console.log()
	return false
}


export function validate_references(thing: Rule | Macro) {
	const validation_errors = [] as string[]

	// TODO validate unique_index_by of args and locking_args
	// function index_locking_args(input_locking_args: LockingArg[] | undefined):  Dict<LockingArg> {
	// 	const locking_args = input_locking_args || []
	// 	return locking_args.unique_index_by('name').match({
	// 		ok: locking_args => locking_args,
	// 		err: ([name,]) => { throw new Error(`some locking tokens have the same name: ${name}`) }
	// 	})
	// }
	// this is actually a problem
	// by the time we've successfully constructed a Rule or Macro, they've already had their args/locking_args indexed and unwrapped
	// I'm guessing that we'll have a "parsing" validation error stage as well for all the things that are required by the ast types

	const all_optional = Definition.all_optional(thing.definition)
	if (all_optional)
		validation_errors.push(log_error_message([
			`The definition of ${thing.name} is all optional:`,
			thing.definition,
			"It doesn't make a lot of sense to have a rule or macro that is all optional, since this causes problems with grammar analysis.",
			"Consider instead marking some usages as optional with ?, or use ignored tokens.",
		], 2))

	const nodes_to_visit = thing.definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		for (const choice of node.choices) {
			const all_optional = Definition.all_optional(choice)
			if (all_optional)
				validation_errors.push(log_error_message([
					"This branch of an Or node had only optional children:",
					choice,
					'',
					"It doesn't make a lot of sense to have a branch of an Or node be all optional, and this is probably a mistake.",
					"Consider moving this optional item out of the Or node, or making the Or node itself optional.",
				], 2))

			nodes_to_visit.push_all(choice)
		}
		continue

	case 'Paren':
		const all_optional = Definition.all_optional(node.nodes)
		if (all_optional)
			validation_errors.push(log_error_message([
				"This parenthesized expression was all optional:",
				node.nodes,
				'',
				"It doesn't make a lot of sense to wrap these optional nodes like this, and this is probably a mistake.",
				"Consider making the parenthesized expression optional instead of making all the children optional.",
			], 2))
		continue

	case 'Consume':
		for (const token_name of node.token_names)
			if (Registry.get_token(token_name).is_none())
				validation_errors.push(`Token ${token_name} couldn't be found.`)
		continue

	case 'Subrule':
		if (Registry.get_rule(node.rule_name).is_none())
			validation_errors.push(`Rule ${node.rule_name} couldn't be found.`)
		continue

	case 'MacroCall':
		const macro = Registry.get_macro(node.macro_name).to_undef()
		if (macro === undefined) {
			validation_errors.push(`Macro ${node.macro_name} couldn't be found.`)
			continue
		}

		for (const arg of node.args) {
			const all_optional = Definition.all_optional(arg)
			if (all_optional)
				validation_errors.push(log_error_message([
					`This arg to ${macro.name} had all optional nodes:`,
					arg,
					'',
					"It doesn't make a lot of sense to pass an all-optional arg to a macro, since it could break the assumptions of the macro.",
					"Consider instead making the usage site of the Var optional, or having an alternate version of the macro.",
				], 2))
		}

		const zip_result = zip_args(macro, node)
		if (zip_result.is_err()) {
			validation_errors.push(log_error_message([
				`Macro ${node.macro_name} called with invalid arguments:`,
				zip_result.error,
			]))
			continue
		}

		nodes_to_visit.push_all(...node.args)
		continue

	case 'Var':
		// a var is only valid if we're in a Macro
		if (thing.type === 'Rule') {
			validation_errors.push(`unexpected variable: ${node.arg_name}`)
			continue
		}

		const arg = thing.args_by_name[node.arg_name]
		if (arg === undefined)
			validation_errors.push(`variable ${node.arg_name} is invalid in ${thing.name}`)
		continue

	case 'LockingVar':
		const locking_arg = thing.locking_args[node.locking_arg_name]
		if (locking_arg === undefined) {
			validation_errors.push(`locking variable ${node.locking_arg_name} is invalid in ${thing.name}`)
			continue
		}

		if (Registry.get_token(locking_arg.token_name).is_none())
			validation_errors.push(`Token ${locking_arg.token_name} couldn't be found.`)
		continue

	default: return exhaustive(node)
	}

	return validation_errors
}
