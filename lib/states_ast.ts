import { TokenDefinition, regulate_regex, match_token } from './states_lexer'


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
