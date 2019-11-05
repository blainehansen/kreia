import { TokenDefinition, regulate_regex, match_token } from './states_lexer'


namespace ast {
	export const SpreadArg = Data((name: string) => {
		return { name, is_spread: true }
	})
	export const Arg = Data((name: string) => {
		return { name, is_spread: false }
	})
	export type Arg = ReturnType<typeof Arg> | ReturnType<typeof SpreadArg>

	export const SpreadVar = Data((arg_name: string) => {
		return { arg_name, is_spread: true }
	})
	export const Var = Data((arg_name: string) => {
		return { arg_name, is_spread: false }
	})
	export type Var = ReturnType<typeof Var> | ReturnType<typeof SpreadVar>


	export const Rule = Data((name: string, ...nodes: Node[]) => {
		return { type: 'Rule' as const, name, nodes, is_locking: false as const }
	})
	export const LockingVar = Data((internal_name: string, ...locked_definition: Node[]) => {
		return { internal_name, locked_definition }
	})
	export type LockingVar = ReturnType<typeof LockingVar>
	export const LockingRule = Data((name: string, lockers: LockingVar[], ...nodes: Node[]) => {
		return { type: 'Rule' as const, name, nodes, is_locking: true as const, lockers }
	})
	export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

	export const Macro = Data((name: string, args: Arg[], ...nodes: (Node | Var)[]) => {
		return { type: 'Macro' as const, name, args, nodes }
	})
	export type Macro = ReturnType<typeof Macro>


	export const Subrule = Data((rule_name: string) => {
		return { type: 'Subrule' as const, rule_name }
	})
	export type Subrule = ReturnType<typeof Subrule>

	export const Maybe = Data((...nodes: Node[]) => {
		return { type: 'Maybe' as const, nodes }
	})
	export type Maybe = ReturnType<typeof Maybe>

	export const Many = Data((...nodes: Node[]) => {
		return { type: 'Many' as const, nodes }
	})
	export type Many = ReturnType<typeof Many>

	export const Or = Data((...choices: Node[][]) => {
		return { type: 'Or' as const, choices }
	})
	export type Or = ReturnType<typeof Or>

	export const MacroCall = Data((macro_name: string, ...args: Node[][]) => {
		return { type: 'MacroCall' as const, macro_name, args }
	})
	export type MacroCall = ReturnType<typeof MacroCall>

	export const Consume = Data((...token_names: string[]) => {
		return { type: 'Consume' as const, token_names }
	})
	export type Consume = ReturnType<typeof Consume>


	export type Node =
		| Subrule
		| Maybe
		| Many
		| Or
		| MacroCall
		| Consume

	export type GrammarItem =
		| Token
		| Rule
		| Macro

	export type Grammar = GrammarItem[]
}


// namespace gen {
// 	export const SpreadArg = Data((name: string) => {
// 		return { name, is_spread: true }
// 	})
// 	export const Arg = Data((name: string) => {
// 		return { name, is_spread: false }
// 	})
// 	export type Arg = ReturnType<typeof Arg> | ReturnType<typeof SpreadArg>

// 	export const ArgUsage = Data((arg: Arg) => {
// 		return { arg }
// 	})
// 	export type ArgUsage = ReturnType<typeof ArgUsage>


// 	export const Rule = Data((name: string, ...nodes: Node[]) => {
// 		return { type: 'Rule' as const, name, nodes, is_locking: false as const }
// 	})
// 	export const LockingVar = Data((internal_name: string, ...locked_definition: Node[]) => {
// 		return { internal_name, locked_definition }
// 	})
// 	export type LockingVar = ReturnType<typeof LockingVar>
// 	export const LockingRule = Data((name: string, lockers: LockingVar[], ...nodes: Node[]) => {
// 		return { type: 'Rule' as const, name, nodes, is_locking: true as const, lockers }
// 	})
// 	export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

// 	export const Macro = Data((name: string, args: Arg[], ...nodes: (Node | ArgUsage)[]) => {
// 		return { type: 'Macro' as const, name, args, nodes }
// 	})
// 	export type Macro = ReturnType<typeof Macro>


// 	export const Subrule = Data((rule: Rule) => {
// 		return { type: 'Subrule' as const, rule }
// 	})
// 	export type Subrule = ReturnType<typeof Subrule>

// 	export const Maybe = Data((...nodes: Node[]) => {
// 		return { type: 'Maybe' as const, nodes }
// 	})
// 	export type Maybe = ReturnType<typeof Maybe>

// 	export const Many = Data((...nodes: Node[]) => {
// 		return { type: 'Many' as const, nodes }
// 	})
// 	export type Many = ReturnType<typeof Many>

// 	export const Or = Data((...choices: Node[][]) => {
// 		return { type: 'Or' as const, choices }
// 	})
// 	export type Or = ReturnType<typeof Or>

// 	export const MacroCall = Data((macro: Macro, ...args: Node[][]) => {
// 		return { type: 'MacroCall' as const, macro, args }
// 	})
// 	export type MacroCall = ReturnType<typeof MacroCall>

// 	export const Consume = Data((...tokens: Token[]) => {
// 		return { type: 'Consume' as const, tokens }
// 	})
// 	export type Consume = ReturnType<typeof Consume>
// }


const ManySeparated = Macro(
	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
	Var('body_rule'),
	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
)

const Grammar = [
	Token('LeftParen', '('),
	Token('RightParen', ')'),
	Token('Num', /[0-9]+/),
	Token('Nil', 'nil'),
	Token('Comma', ','),
	Token('Whitespace', /\s+/, { ignore: true }),

	Rule('lists',
		Many(Subrule('parenthesized_number_list')),
	),
	Rule('parenthesized_number_list',
		Consume('LeftParen'),
		Maybe(Subrule('number_list'))
		Consume('RightParen'),
	),
	// Macro('token_or', [SpreadArg('tokens')],
	// 	Or(SpreadVar('tokens'))
	// ),
	Rule('number_list',
		MacroCall('many_separated',
			[Or(
				[Subrule('parenthesized_number_list')],
				// [MacroCall('token_or', [Consume('Num')], [Consume('Nil')])],
				[Or([Consume('Num')], [Consume('Nil')])],
			)],
			[Consume('Comma')],
		),
	),
]



// a few things have to happen

// # validate the ast
// go through every item in the grammar, and check that it is valid
// there are a few requirements
// - all references to tokens (consume), macros (macrocall), and rules (subrule) must actually exist (create a lookup map for each variety, and recursively check all grammar nodes. there will also be a step of some sort to convert abstract ast subrules into resolved ones) actually this whole step might be unwise. it might be a good idea to simply look things up as you go through the validation and generation steps, using a monad.Maybe to unwrap things.
// - rules must not be left-recursive (every rule must descend to a non-optional consume before it can call itself in a subrule. when recursing into a maybe, consumes within the non-optional path of the maybe only terminate the maybe, not the whole rule)

// # figure out unambiguous lookaheads
// traverse the tree, and at every decision point (a Maybe, Or, Many), follow this algorithm:
// - gather all differentiatable paths
// -- (for a Maybe, it's the Maybe path as well as all next paths including the first mandatory path)
// -- (for an Or, it's all the branches of the Or)
// -- (for a Many, the branch is the continuation point after the body_rule, including all next paths like Maybe)
// - traverse all differentiatable paths at the same time. you keep all paths that have an identical sibling. so every time a path has a mandatory consume that's different than all the others, you can remove it from consideration and give it the lookahead branch you've calculated so far. a path requires a so-far-possibly-identical sibling to be kept, so by definition if there's only one left, we're done.
// - if you reach the end of the branches and there are more than one remaining, the grammar is redundant or undecidable


function ts_for_rule(rule: Rule) {
	const block_items = [] as ts.Statement[]

	for (const [index, node] of rule.nodes.entries()) switch (node.type) {
	case 'Maybe':
		// if (node.nodes.length === 1)
		// 	block_items.push(optional_thing(node.nodes[0]))
		const node_path = compute_path(node.nodes, gather_next_branches(index, rule.nodes))
		block_items.push(maybe_call(node.nodes, node_path))
		continue

	case 'Or':
		block_items.push(or_call(item.choices))
		continue

	case 'Many':
		continue

	case 'Consume':
		block_items.push(consume_call(node.tokens))
		continue
	case 'Subrule':
		block_items.push(subrule_call(node.rule))
		continue
	case 'MacroCall':
		block_items.push()
		continue
	}
}




// # produce a *typescript* ast and code generate
// this implies that in the lookahead computation process we figured out all the information needed to produce code



// function check_lr_rules(rules: Rule[]) {
// 	const lr_rules = [] as Rule[]
// 	for (const rule of rules) {
// 		const lr_name = check_lr_rule(rule)
// 		if (lr_name !== undefined)
// 			lr_rules.push(lr_name)
// 	}

// 	if (lr_rules.length > 0)
// 		throw new Error(`There are rules which are left-recursive: ${lr_rules.join(', ')}`)
// }

// function check_lr_rule(rule: Rule): string | undefined {
// 	const stack = rule.nodes.slice()
// 	let node
// 	while (node = stack.pop()) switch (node.key) {
// 	case 'Subrule':
// 		if (node.content.name === rule.name)
// 			return rule.name
// 		Array.prototype.push.apply(stack, node.content.nodes.slice().reverse())
// 		continue

// 	case 'Consume':
// 		return undefined

// 	case 'Or':
// 	case 'MacroCall':

// 	// here in the case of a Maybe, it can't prevent the top-level rule from being left-recursive, but it can still produce a left-recursive call

// 	default:
// 		Array.prototype.push.apply(stack, node.content.slice().reverse())
// 		continue
// 	}

// 	return undefined
// }

// function analyze_and_render_rules(rules: RuleDefinition[]) {
// 	const rules = {} as { [rule_name: string]: Rule }
// 	const macros = {} as { [macro_name: string]: Macro }

// 	for (const rule of rules) {
// 		switch (rule.type) {
// 		case 'Rule':
// 			rules[rule.name] = rule
// 		case 'Macro':
// 			macros[rule.name] = rule
// 		}
// 	}
// }
