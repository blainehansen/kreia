import { HashSet } from '@ts-std/collections'
import { Dict, tuple as t } from '@ts-std/types'

import { exhaustive } from '../utils'

import {
	Rule, Macro, Definition, get_token, get_rule, get_macro,
	visit_definition, VisitingFunctions,
	Scope, ScopeStack, push_scope, pop_scope,
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
			return false
		case 'LockingVar':
			return false

		case 'Maybe':
			if (_check_left_recursive(seen_rules, seen_macros, node.definition, scope))
				return true
			continue
		case 'Or':
			for (const choice of node.choices)
				if (_check_left_recursive(seen_rules, seen_macros, choice, scope))
					return true
			return false
		case 'Many':
			if (_check_left_recursive(seen_rules, seen_macros, node.definition, scope))
				return true
			return false

		case 'Subrule':
			if (seen_rules[node.rule_name])
				return true
			const subrule = get_rule(node.rule_name).unwrap()
			const rule_scope = { current: Scope(subrule.locking_args, undefined), previous: [] }
			if (_check_left_recursive({ ...seen_rules, [node.rule_name]: true }, seen_macros, subrule.definition, rule_scope))
				return true
			return false

		case 'MacroCall':
			if (seen_macros[node.macro_name])
				return true
			const macro = get_macro(node.macro_name).unwrap()
			const call_scope = push_scope(scope, macro.locking_args, node.args)
			// if (_check_left_recursive(seen_rules, { ...seen_macros, [node.macro_name]: true }, macro.definition, call_scope))
			if (_check_left_recursive(seen_rules, seen_macros, macro.definition, call_scope))
				return true
			return false

		case 'Var':
			const var_definition = scope.current.args.get_by_name(node.arg_name).to_undef()
			if (var_definition === undefined)
				return false
			const var_scope = pop_scope(scope)
			if (_check_left_recursive(seen_rules, seen_macros, var_definition, var_scope))
				return true
			return false

		default: return exhaustive(node)
		}
	}

	// console.log()
	// console.log()
	return false
}


// let validation_errors = [] as string[]
// const validate_references_visiting_functions: VisitingFunctions<void> = {
// 	//
// }

// export function validate_references(thing: Rule | Macro) {
// 	validation_errors = []
// 	const scope = { current: Scope(thing.locking_args, undefined), previous: [] }
// 	visit_definition(validate_references_visiting_functions, thing.definition, [], scope, undefined)
// 	return validation_errors
// }

// TODO this needs to also check that Maybes/Manys etc aren't erroneously nested within one another
// and that definitions don't contain only optional stuff
export function validate_references(thing: Rule | Macro) {
	const validation_errors = [] as string[]

	const nodes_to_visit = thing.definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	case 'Or':
		nodes_to_visit.push_all(...node.choices)
		continue
	case 'Many':
	case 'Maybe':
		nodes_to_visit.push_all(node.definition)
		continue

	case 'Consume':
		for (const token_name of node.token_names)
			if (get_token(token_name).is_none())
				validation_errors.push(`Token ${token_name} couldn't be found.`)
		continue

	case 'Subrule':
		if (get_rule(node.rule_name).is_none())
			validation_errors.push(`Rule ${node.rule_name} couldn't be found.`)
		continue

	case 'MacroCall':
		const macro = get_macro(node.macro_name).to_undef()
		if (macro === undefined) {
			validation_errors.push(`Macro ${node.macro_name} couldn't be found.`)
			continue
		}

		const macro_keys = HashSet.from_strings(macro.args.keys())
		const node_keys = HashSet.from_strings(node.args.keys())
		if (!macro_keys.equal(node_keys)) {
			validation_errors.push(`Macro ${node.macro_name} called with invalid arguments: ${node_keys.values().join(', ')}`)
			continue
		}

		nodes_to_visit.push_all(...node.args.values())
		continue

	case 'Var':
		// a var is only valid if we're in a Macro
		if (thing.type === 'Rule') {
			validation_errors.push(`unexpected variable: ${node}`)
			continue
		}

		if (thing.args.get_by_name(node.arg_name).is_none())
			validation_errors.push(`variable ${node.arg_name} is invalid in this macro`)
		continue

	case 'LockingVar':
		if (thing.locking_args === undefined) {
			validation_errors.push(`unexpected locking variable: ${node}`)
			continue
		}

		const locking_arg = thing.locking_args.get_by_name(node.locking_arg_name)
		if (locking_arg.is_none()) {
			validation_errors.push(`locking variable ${node.locking_arg_name} is invalid in this rule`)
			continue
		}
		if (get_token(locking_arg.value.token_name).is_none())
			validation_errors.push(`Token ${locking_arg.value.token_name} couldn't be found.`)
		continue

	default: return exhaustive(node)
	}

	return validation_errors
}
