import { HashSet } from '@ts-std/collections'
import { Rule, Macro, Definition } from './ast'

export function check_left_recursive(thing: Rule | Macro) {
	const seen_rules = {} as Dict<true>
	const seen_macros = {} as Dict<true>
	const one_to_add = thing.type === 'Rule' ? seen_rules : seen_macros
	one_to_add[thing.name] = true
	return _check_left_recursive(seen_rules, seen_macros, thing.definition)
}
function _check_left_recursive(
	seen_rules: Dict<true>,
	seen_macros: Dict<true>,
	definition: Definition,
): boolean {
	for (const node of definition) switch (node.type) {
	case 'Consume':
		return false
	case 'Maybe':
		if (_check_left_recursive(seen_rules, seen_macros, node.definition))
			return true
		continue
	case 'Or':
		for (const choice of node.choices)
			if (_check_left_recursive(seen_rules, seen_macros, choice))
				return true
		return false
	case 'Many':
		if (_check_left_recursive(seen_rules, seen_macros, node.definition))
			return true
		return false

	case 'Subrule':
		if (seen_rules[node.rule_name])
			return true
		const subrule = registered_rules[node.rule_name]!
		if (_check_left_recursive({ [node.rule_name]: true, ...seen_rules }, seen_macros, subrule.definition))
			return true
		return false

	case 'MacroCall':
		if (seen_macros[node.macro_name])
			return true
		const call_definition = resolve_macro(node.macro_name, node.args)
		if (_check_left_recursive(seen_rules, { [node.macro_name]: true, ...seen_macros }, call_definition))
			return true
		return false

	case 'Var':
		continue
	case 'LockingVar':
		continue

	default: return exhaustive(node)
	}

	return false
}


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
			if (!(token_name in registered_tokens))
				validation_errors.push(`Token ${token_name} couldn't be found.`)
		continue

	case 'Subrule':
		if (!(node.rule_name in registered_rules))
			validation_errors.push(`Rule ${node.rule_name} couldn't be found.`)
		continue

	case 'MacroCall':
		const macro = registered_macros[node.macro_name]
		if (macro === undefined) {
			validation_errors.push(`Macro ${node.macro_name} couldn't be found.`)
			continue
		}

		const macro_keys = HashSet.from(macro.args.keys())
		const node_keys = HashSet.from(node.args.keys())
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
		if(!(locking_arg.value.token_name in registered_tokens))
			validation_errors.push(`Token ${locking_arg.value.token_name} couldn't be found.`)
		continue

	default: return exhaustive(node)
	}

	return validation_errors
}
