function check_lr_rules(rules: Rule[]) {
	const lr_rules = [] as Rule[]
	for (const rule of rules) {
		const lr_name = check_lr_rule(rule)
		if (lr_name !== undefined)
			lr_rules.push(lr_name)
	}

	if (lr_rules.length > 0)
		throw new Error(`There are rules which are left-recursive: ${lr_rules.join(', ')}`)
}

function check_lr_rule(rule: Rule): string | undefined {
	const stack = rule.nodes.slice()
	let node
	while (node = stack.pop()) switch (node.key) {
	case 'Subrule':
		if (node.content.name === rule.name)
			return rule.name
		Array.prototype.push.apply(stack, node.content.nodes.slice().reverse())
		continue

	case 'Consume':
		return undefined

	case 'Or':
	case 'MacroCall':

	default:
		Array.prototype.push.apply(stack, node.content.slice().reverse())
		continue
	}

	return undefined
}

// something to think about
// both an or and a maybe are a branch
// with both, you need to discover the unambiguous lookahead
// in an or, the unambiguity must be between compared between the choices
// in a maybe, it must be compared between entering the maybe and whatever comes immediately after the maybe
// this also happens with many, since you need to choose between entering *again* and whatever is immediately after the many

function analyze_and_render_rules(rules: RuleDefinition[]) {
	const rules = {} as { [rule_name: string]: Rule }
	const macros = {} as { [macro_name: string]: Macro }

	for (const rule of rules) {
		switch (rule.type) {
		case 'Rule':
			rules[rule.name] = rule
		case 'Macro':
			macros[rule.name] = rule
		}

		// this function is trying to achieve a few things
		// - checking that everything properly resolves, tokens, macros, rules
		// - checking for left-recursive rules
		// - figuring out the non-ambiguous lookaheads and differentiators

		// go through all nodes
		// find all the decision points
		// only some node types and combinator functions actually need lookahead branches

		// for 'Or' nodes, iterate through all of the branches, once there's only one left you can stop
		// you're trying to find a lookahead for each branch,
		// which means that you're looking for the first non-optional consume that's *different* from all other branches
		// if you reach the end of the branches and there are more than one remaining, the grammar is redundant or undecidable
	}
}


import { TokenDefinition, regulate_regex } from './states_lexer'

function Data<F extends (...args: any) => any>(
	fn: F,
): (...args: Parameters<F>) => Readonly<ReturnType<F>> {
	return fn
}


const Token = Data((name: string, regex: RegExp, ignore?: true, state_transform?: StateTransform) => {
	const t = { name, regex } as TokenDefinition
	if (ignore !== undefined)
		t.ignore = ignore
	if (state_transform !== undefined)
		t.state_transform = state_transform
	return t
})
type Token = ReturnType<typeof Token>


const SpreadArg = Data((arg_name: string) => {
	return { is_arg: true as const, arg_name, is_spread: true }
})
const Arg = Data((arg_name: string) => {
	return { is_arg: true as const, arg_name, is_spread: false }
})
type Arg = ReturnType<typeof Arg> | ReturnType<typeof SpreadArg>

const SpreadVar = Data((arg_name: string) => {
	return { is_var: true as const, arg_name, is_spread: true }
})
const Var = Data((arg_name: string) => {
	return { is_var: true as const, arg_name, is_spread: false }
})
type Var = ReturnType<typeof Var> | ReturnType<typeof SpreadVar>


const Rule = Data((name: string, ...nodes: Node[]) => {
	return { type: 'Rule' as const, name, nodes, is_locking: false as const }
})
const LockingVar = Data((internal_name: string, ...locked_definition: Node[]) => {
	return { internal_name, locked_definition }
})
type LockingVar = ReturnType<typeof LockingVar>
const LockingRule = Data((name: string, lockers: LockingVar[], ...nodes: Node[]) => {
	return { type: 'Rule' as const, name, nodes, is_locking: true as const, lockers }
})
type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

const Macro = Data((name: string, args: Arg[], ...nodes: (Node | Var)[]) => {
	return { type: 'Macro' as const, name, args, nodes }
})
type Macro = ReturnType<typeof Macro>

type RuleDefinition =
	| Rule
	| Macro



const Subrule = Data((rule_name: string) => {
	return { type: 'Subrule' as const, rule_name }
})
type Subrule = ReturnType<typeof Subrule>

const Maybe = Data((...nodes: Node[]) => {
	return { type: 'Maybe' as const, nodes }
})
type Maybe = ReturnType<typeof Maybe>

const Many = Data((...nodes: Node[]) => {
	return { type: 'Many' as const, nodes }
})
type Many = ReturnType<typeof Many>

const Or = Data((...choices: Node[][]) => {
	return { type: 'Or' as const, choices }
})
type Or = ReturnType<typeof Or>

const MacroCall = Data((macro_name: string, ...args: Node[][]) => {
	return { type: 'MacroCall' as const, macro_name, args }
})
type MacroCall = ReturnType<typeof MacroCall>

const Consume = Data((...token_names: string[]) => {
	return { type: 'Consume' as const, token_names }
})
type Consume = ReturnType<typeof Consume>

type Node =
	| Subrule
	| Maybe
	| Many
	| Or
	| MacroCall
	| Consume



const ManySeparated = Macro(
	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
	Var('body_rule'),
	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
)

const Grammar = [
	Rule('lists',
		Many(Subrule('parenthesized_number_list')),
	),
	Rule('parenthesized_number_list',
		Consume('LeftParen'),
		Maybe(Subrule('number_list'))
		Consume('RightParen'),
	),
	Macro('token_or', [SpreadArg('tokens')],
		Or(SpreadVar('tokens'))
	),
	Rule('number_list',
		MacroCall('many_separated',
			[Or(
				[Subrule('parenthesized_number_list')],
				[MacroCall('token_or', [Consume('Num')], [Consume('Nil')]],
			)],
			[Consume('Comma')],
		),
	),
]
