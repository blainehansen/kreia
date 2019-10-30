import { Result, Ok, Err } from '@ts-std/monads'
import { Cast, tuple as t } from '@ts-std/types'
import { Enum, empty, variant } from '@ts-std/enum'

import { def, TokenDefinition, BaseLexer, Token, RawToken, VirtualToken } from './states_lexer'

type LexerState<D extends { [key: string]: RegExp | string }> = { [K in keyof D]: TokenDefinition }
function lexer_state<D extends { [key: string]: RegExp | string }>(
	token_definitions: D
): LexerState<D> {
	const give = {} as LexerState<D>
	for (const key in token_definitions) {
		const regex = token_definitions[key]
		give[key] = def(key, regex)
	}

	return give
}

const toks = lexer_state({
	LeftParen: '(',
	RightParen: ')',
	Num: /[0-9]+/,
	Nil: 'nil',
	Comma: ',',
	Whitespace: /\s+/, // { match: , ignore: true, lineBreaks: true },
})

toks.Whitespace.ignore = true

const source = `
	(1, 2, 3, nil) ()
	(nil, nil)
	(1, (2, 3, 4), (((), nil)))
`

const lexer = new BaseLexer({ tokens: Object.values(toks) }, source)

// let token
// while (token = lexer.next()) {
// 	console.log(token)
// }


function match_token(token: Token | undefined, token_definition: TokenDefinition): boolean {
	if (token === undefined)
		return false

	switch (token.is_virtual) {
		case true:
			return token.type === token_definition.name
		case false:
			return token.type.name === token_definition.name
	}
}

function match_tokens(tokens: Token[], token_definitions: TokenDefinition[]) {
	for (const [index, token_definition] of token_definitions.entries()) {
		const token = tokens[index]
		if (!match_token(token, token_definition))
			return false
	}

	return true
}


type ParseEntity<F extends Func> =
	| ParseFunction<F>
	| TokenDefinition[]

type Func = () => any
type ParseFunction<F extends Func> = F & { lookahead: () => boolean }


function func<F extends Func>(f: F, l: () => boolean): ParseFunction<F> {
	const new_f = f as ParseFunction<F>
	new_f.lookahead = l
	return new_f
}

type EntityReturn<E extends ParseEntity<Func>> =
	E extends TokenDefinition[] ? { [I in keyof E]: Token }
	: E extends ParseFunction<infer F> ? ReturnType<F>
	: never

function perform_entity<F extends Func, E extends ParseEntity<F>>(entity: E): EntityReturn<E> {
	if (typeof entity === 'function')
		return (entity as ParseFunction<F>)()
	return consume(...(entity as TokenDefinition[])) as EntityReturn<E>
}
function test_entity<F extends Func, E extends ParseEntity<F>>(entity: E): boolean {
	if (typeof entity === 'function')
		return (entity as ParseFunction<F>).lookahead()
	const toks = lexer.peek((entity as TokenDefinition[]).length)
	return match_tokens(toks, entity as TokenDefinition[])
}



function consume<L extends TokenDefinition[]>(...token_definitions: L): { [I in keyof L]: Token } {
	const next_tokens = lexer.advance(token_definitions.length)

	if (match_tokens(next_tokens, token_definitions))
		return next_tokens as { [I in keyof L]: Token }
	else {
		throw new Error("next tokens didn't match")
	}
}

// function maybe_consume(...token_definitions : TokenDefinition[]): Token[] | undefined {
// 	const next_tokens = lexer.peek(token_definitions.length)

// 	if (match_tokens(next_tokens, token_definitions))
// 		return next_tokens
// 	return undefined
// }

function maybe<E extends ParseEntity<Func>>(rule: E): EntityReturn<E> | undefined {
	if (test_entity(rule))
		return perform_entity(rule)
	return undefined
}

function many<E extends ParseEntity<Func>>(rule: E): EntityReturn<E>[] {
	// this isn't optional, so we have to do one loop
	let should_proceed = true
	const results = [] as EntityReturn<E>[]

	while (should_proceed) {
		results.push(perform_entity(rule))
		should_proceed = test_entity(rule)
	}

	return results
}

function or<C extends ParseEntity<Func>[]>(
	...choices: C
): Result<{ [K in keyof C]: EntityReturn<Cast<C[K], ParseEntity<Func>>> }[number]> {
	// let choice_result = optional ? Ok(undefined) : Err('no choice taken')
	let choice_result = Err('no choice taken')

	for (const choice of choices) {
		// use the lookahead to test, if can't proceed then continue
		if (!test_entity(choice))
			continue

		choice_result = Ok(perform_entity(choice))
	}

	return choice_result.expect("")
}

function many_separated<B extends ParseEntity<Func>, S extends ParseEntity<Func>>(
	body_rule: B,
	separator_rule: S,
): EntityReturn<B>[] {
	const results = [] as EntityReturn<B>[]

	// first body isn't optional
	results.push(perform_entity(body_rule))

	let should_proceed = test_entity(separator_rule)
	while (should_proceed) {
		perform_entity(separator_rule)

		results.push(perform_entity(body_rule))
		should_proceed = test_entity(separator_rule)
	}

	return results
}




// ### Grammar

function lists() {
	return many(parenthesized_number_list)
}

const parenthesized_number_list = func(() => {
	consume(toks.LeftParen)
	const list = maybe(number_list)
	consume(toks.RightParen)
	return list
}, () => {
	const tok = lexer.peek(1)[0]
	return match_token(tok, toks.LeftParen)
})


function token_or(...toks: TokenDefinition[]) {
	return or(
		...toks.map(token_type => [token_type]),
	)
}

const number_list_1_2 = () => {
	const tok = lexer.peek(1)[0]
	return match_token(tok, toks.Num) || match_token(tok, toks.Nil)
}

const number_list: ParseFunction<Func> = func(() => {
	return many_separated(
		func(() => or(
			parenthesized_number_list,
			func(() => token_or(toks.Num, toks.Nil), number_list_1_2),
		), parenthesized_number_list.lookahead),
		[toks.Comma],
	)
}, () => {
	return parenthesized_number_list.lookahead() || number_list_1_2()
})

import * as util from 'util'
function log(obj: any) {
	console.log(util.inspect(obj, { depth: null, colors: true }))
}

log(lists())



type Rule = {
	name: string,
	nodes: Node[],
}

const Node = Enum({
	Subrule: variant<Rule>(),
	Consume: variant<TokenDefinition[]>(),
	Maybe: variant<Node[]>()
	Many: variant<Node[]>(),
	Or: variant<Node[]>(),
})
type Node = Enum<typeof Node>

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

	default:
		Array.prototype.push.apply(stack, node.content.slice().reverse())
		continue
	}

	return undefined
}



function analyze_and_render(rules: Rule[]) {
	for (const rule of rules) {
		// go through all nodes
		// find all the decision points
		// only some node types and combinator functions actually need lookahead branches

		// for 'Or' nodes, iterate through all of the branches, once there's only one left you can stop
		// you're trying to find a lookahead for each branch,
		// which means that you're looking for the first non-optional consume that's *different* from all other branches
		// if you reach the end of the branches and there are more than one remaining, the grammar is redundant or undecidable
	}
}
