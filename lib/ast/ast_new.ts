import { Dict, tuple as t } from '@ts-std/types'

export enum BaseModifier {
	Many = '+',
	Maybe = '?',
	MaybeMany = '*',
}

export type Modifier = BaseModifier | undefined
export namespace Modifier {
	export function is_optional(modifer: Modifier) {
		switch (modifer) {
			case '+': return false
			case '?': return true
			case '*': return true
			default: return false
		}
	}
}

export interface NodeLike {
	readonly modifer: Modifier,
	readonly is_optional: boolean,
	readonly needs_decidable: boolean,
	readonly tail_needs_decidable: boolean,
}


export type Node =
	| Consume
	| Or
	| Subrule
	| MacroCall
	| Wrap

export namespace Node {
	export function flatten(nodes: NonEmpty<Node>): Node {
		return NonLone.from_array(nodes).match({
			some: non_lone => new Wrap(non_lone, undefined),
			none: () => nodes[0]
		})
	}
}

export class Definition {
	readonly is_optional: boolean
	constructor(
		readonly nodes: NonEmpty<Node>,
	) {
		this.is_optional = nodes.all(node => node.is_optional)
	}
}

export class Wrap {
	readonly type: 'Wrap' = 'Wrap'
	constructor(
		// readonly modifer: Modifier,
		readonly modifer: BaseModifier,
		readonly nodes: NonLone<Node>,
	) {}
}
export function wrap(nodes: NonLone<Node>) { return new new Wrap(undefined, nodes) }
export function many_wrap(nodes: NonLone<Node>) { return new new Wrap(Modifier.Many, nodes) }
export function maybe_wrap(nodes: NonLone<Node>) { return new new Wrap(Modifier.Maybe, nodes) }
export function maybe_many_wrap(nodes: NonLone<Node>) { return new new Wrap(Modifier.MaybeMany, nodes) }

export class Consume {
	readonly type: 'Consume' = 'Consume'
	constructor(
		readonly modifer: Modifier,
		readonly token_definitions: NonEmpty<TokenDefinition>,
	) {}
}

export class Or {
	readonly type: 'Or' = 'Or'
	constructor(
		readonly modifer: Modifier,
		readonly choices: NonLone<Node>,
	) {}
}

export class Subrule {
	readonly type: 'Subrule' = 'Subrule'
	constructor(
		readonly modifer: Modifier,
		readonly rule_name: string,
	) {}
}

export class MacroCall {
	readonly type: 'MacroCall' = 'MacroCall'
	constructor(
		readonly modifer: Modifier,
		readonly macro_name: string,
		// readonly args: readonly Node[],
		readonly args: readonly Definition[],
	) {}
}

export class Var {
	readonly type: 'Var' = 'Var'
	constructor(
		readonly modifer: Modifier,
		readonly arg_name: string,
	) {}
}

export class LockingVar {
	readonly type: 'LockingVar' = 'LockingVar'
	constructor(
		readonly modifer: Modifier,
		readonly locking_arg_name: string,
	) {}
}


export class Arg {
	constructor(readonly name: string) {}
}

export class LockingArg {
	constructor(readonly name: string, readonly token_name: string) {}
}

export class Rule {
	readonly type: 'Rule' = 'Rule'
	// readonly locking_args_index: Dict<LockingArg>
	constructor(
		readonly name: string,
		readonly definition: NonEmpty<Node>,
		readonly locking_args: LockingArg[] = [],
	) {
		// this.locking_args_index = locking_args
		// 	.unique_index_by('name')
		// 	.expect(`some locking_args passed to rule ${name} aren't unique`)
	}
}

export class Macro {
	readonly type: 'Macro' = 'Macro'
	// readonly args_index: Dict<Arg>
	// readonly locking_args_index: Dict<LockingArg>
	constructor(
		readonly name: string,
		readonly args: NonEmpty<Arg>,
		readonly definition: NonEmpty<Node>,
		readonly locking_args: LockingArg[] = [],
	) {}
}

export class VirtualLexerUsage {
	readonly type: 'VirtualLexerUsage' = 'VirtualLexerUsage'
	constructor(
		readonly virtual_lexer_name: string,
		readonly path: string,
		readonly args: TokenSpec[],
		readonly exposed_tokens: Dict<true>,
	) {}
}




export type Scope = Readonly<{ locking_args: OrderedDict<LockingArg>, args: OrderedDict<Node> }>
export function Scope(locking_args: OrderedDict<LockingArg> | undefined, args: OrderedDict<Node> | undefined): Scope {
	return { locking_args: locking_args || empty_ordered_dict, args: args || empty_ordered_dict }
}
export type ScopeStack = { current: Scope, previous: Scope[] }
export namespace Scope {
	export function for_rule(rule: Rule) {
		return { current: Scope(rule.locking_args, undefined), previous: [] }
	}
	export function for_macro({ current, previous }: ScopeStack, macro: Macro, call: MacroCall) {
		return { current: Scope(macro.locking_args, call.args), previous: [...previous, current] }
	}
	export function for_var({ current, previous }: ScopeStack, var_node: Var): [Node, ScopeStack] {
		return t(
			current.get_by_name(var_node.arg_name).unwrap(),
			{
				current: previous.maybe_get(-1).unwrap(),
				previous: previous.slice(0, previous.length - 1),
			},
		)
	}
	export function in_scope(definitions: Node[], scope: ScopeStack): DefinitionTuple[] {
		return definitions.map(d => t(d, scope))
	}
}
export type DefinitionTuple = [Node, ScopeStack]




type AstIterItem = string | DefinitionTuple[] | Continue
type AstIter = IterWrapper<AstIterItem>

function* iterate_definition(
	...[definition, scope]: DefinitionTuple
): Generator<AstIterItem, void, undefined> {
	const nodes_to_visit = definition.slice()
	let node
	while (node = nodes_to_visit.shift()) switch (node.type) {
	// case 'Maybe': {
	// 	yield [t(node.definition, scope), ...gather_branches(nodes_to_visit, scope)[0]]
	// 	continue
	// }
	// case 'Many':
	// 	yield* iterate_definition(node.definition, scope)
	// 	yield Continue(node.definition, scope)
	// 	continue
	case 'Or':
		const [gathered, ] = gather_branches(nodes_to_visit, scope)[0]
		yield [...in_scope(node.choices, scope), ...gathered]
		continue
	case 'Consume':
		yield* node.token_names.map(token_name => get_token(token_name).unwrap())
		continue

	case 'Subrule': {
		const rule = get_rule(node.rule_name).unwrap()
		const rule_scope = { current: Scope(rule.locking_args, undefined), previous: [] }
		const [gathered, all_maybe] = gather_branches(rule.definition.slice(), rule_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(rule.definition, rule_scope)

		continue
	}

	case 'MacroCall': {
		const macro = get_macro(node.macro_name).unwrap()
		const macro_scope = push_scope(scope, macro.locking_args, node.args)
		const [gathered, all_maybe] = gather_branches(macro.definition.slice(), macro_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(macro.definition, macro_scope)

		continue
	}

	case 'Var': {
		// Vars use the parent_scope
		const arg_definition = scope.current.args.get_by_name(node.arg_name).unwrap()
		const var_scope = pop_scope(scope)
		// const [gathered, all_maybe] = gather_branches(arg_definition.slice(), var_scope)
		const [gathered, all_maybe] = gather_branches([...arg_definition, ...nodes_to_visit], var_scope)
		if (all_maybe) {
			const branches = gather_branches(nodes_to_visit, scope)[0]
			yield [...gathered, ...branches]
		}
		else
			yield* iterate_definition(arg_definition, var_scope)

		continue
	}

	case 'LockingVar':
		const locking_arg = scope.current.locking_args.get_by_name(node.locking_arg_name).unwrap()
		yield get_token(locking_arg.token_name).unwrap()
		continue

	default: return exhaustive(node)
	}
}
