import { basename } from 'path'
import { tuple as t } from '@ts-std/types'
import { RawToken, ContentVirtualToken } from '../runtime/lexer'
import { Parser, ParseArg, Decidable, path, branch, c } from "../index"
import { IndentationLexer } from "../virtual_lexers/IndentationLexer"

import { NonEmpty, NonLone, exec, impossible, flatten } from '../utils'
import {
	Grammar as KreiaGrammar, Definition,
	TokenDef, Rule, Macro, VirtualLexerUsage, Arg, LockingArg,
	Node, Consume, Or, Subrule, MacroCall, Var, LockingVar, Paren,
	Modifier, BaseModifier, mut_cluster_consumes,
} from './ast'
import {
	RegexComponent, Concat, Union, TokenString,
	TokenReference, CharacterClass, CharacterClassReference,
} from './ast_tokens'

// import { Console } from 'console'
// const console = new Console({ stdout: process.stdout, stderr: process.stderr, inspectOptions: { depth: 3 } })

export const { tok, reset, lock, consume, maybe, or, maybe_or, many_or, maybe_many_or, many, maybe_many, exit } = Parser({
	var_name: /\$\w+/,
	token_name: /\:\w+/,
	locked_name: /\!\w+/,
	rule_name: /\w+/,
	macro_name: /\@\w+/,
	// modifier_token: ["*", "+", "?"],
	modifier_token: /\*|\+|\?/,
	repetitions_modifier: /{\d+(,\d*)?}/,
	space: { regex: / +/, ignore: true },
	// comment: { regex: /\s*\/\/[^\n]*\n+/, ignore: true },
	comment: { regex: /(?:\s*\/\/[^\n]*)+\n*/, ignore: true },
	// character_class: /(?:\^?\[(?:\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[ftnrv]|\\]|\\\\|[\x20-\x5B\x5E-\x7E])+\])/,
	character_class: /\^?\[(?:\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\[ftnrv]|\\]|\\\\|[\x20-\x5B\x5E-\x7E])+\]/,
	character_class_name: /\^?\#\w+/,
	// str: [/"(?:\\["\\]|[^\n"\\])*"/, /'(?:\\['\\]|[^\n'\\])*'/],
	str: /(?:"(?:\\["\\]|[^\n"\\])*")|(?:'(?:\\['\\]|[^\n'\\])*')/,
	use_keyword: 'use',
	eq: '=',
	bar: '|',
	comma: ',',
	dash: '-',
	caret: '^',
	underscore: '_',
	open_angle: '<',
	close_angle: '>',
	open_paren: '(',
	close_paren: ')',
	open_brace: '{',
	close_brace: '}',
	open_bracket: '[',
	close_bracket: ']',
}, { IndentationLexer: IndentationLexer() })

const { _7jjmO, _MM3H4, _Z1Bz2H0, _Z2t6uuV, _1EWJ7s, _17Yeup, _7U1Cw, _NFQGh, _6PPJc, _Z1owlnn, _Z1F9dGs, _MHu6X, _Z1tSeaR, _Nf9Ed, _2dw1N, _1cWbFl, _2eTKEs, _fw7Qu } = {
	_7jjmO: path([tok.token_name]),
	_MM3H4: path([tok.open_brace]),
	_Z1Bz2H0: path([tok.macro_name]),
	_Z2t6uuV: path([tok.rule_name]),
	_1EWJ7s: path([tok.indent_continue], branch(path([tok.token_name]), path([tok.open_brace]), path([tok.macro_name]), path([tok.rule_name]))),
	_17Yeup: path([tok.space], branch(path([tok.character_class]), path([tok.character_class_name]), path([tok.token_name]), path([tok.str]), path([tok.open_paren]))),
	_7U1Cw: path([tok.space]),
	_NFQGh: path([tok.open_paren]),
	_6PPJc: path([tok.comma]),
	_Z1owlnn: path([tok.indent]),
	_Z1F9dGs: path([tok.indent_continue]),
	_MHu6X: path([tok.open_angle]),
	_Z1tSeaR: path([tok.var_name]),
	_Nf9Ed: branch(path([tok.bar]), path([tok.modifier_token])),
	_2dw1N: path([tok.modifier_token]),
	_1cWbFl: branch(path([tok.rule_name]), path([tok.token_name]), path([tok.var_name]), path([tok.locked_name]), path([tok.macro_name]), path([tok.open_paren])),
	_2eTKEs: path([tok.space], branch(path([tok.rule_name]), path([tok.token_name]), path([tok.var_name]), path([tok.locked_name]), path([tok.macro_name]), path([tok.open_paren]))),
	_fw7Qu: path([tok.locked_name])
}

function trim_sigil(token: RawToken | ContentVirtualToken) {
	return token.content.slice(1)
}

function parse_number(content: string): number {
	const parsed_int = parseInt(content)
	if (isNaN(parsed_int))
		throw new Error("how did this bad parsed_int happen?" + content)
	return parsed_int
}

export function kreia_grammar(): KreiaGrammar {
	maybe(tok.indent_continue)

	const grammar_items = many_separated(() => {
		return or(
			c(token_definition, _7jjmO), c(virtual_lexer_usage, _MM3H4),
			c(macro_definition, _Z1Bz2H0), c(rule_definition, _Z2t6uuV),
		)
	}, () => { consume(tok.indent_continue) }, _1EWJ7s)

	maybe(tok.indent_continue)

	return grammar_items
}

export function token_definition() {
	const [token_name, ] = consume(tok.token_name, tok.space)
	const ignore = maybe(tok.underscore) !== undefined
	consume(tok.eq, tok.space)
	const def = token_specification()

	return new TokenDef(trim_sigil(token_name), def, ignore)
}

export function token_specification(): RegexComponent {
	const union_segments = many_separated(() => {
		const concat_segments = space_sep(token_atom, _17Yeup)

		return concat_segments.length === 1
			? concat_segments[0]
			: new Concat(concat_segments as NonLone<RegexComponent>, undefined)
	}, () => {
		consume(tok.space, tok.bar, tok.space)
	}, _7U1Cw)

	return union_segments.length === 1
		? union_segments[0]
		: new Union(union_segments as NonLone<RegexComponent>, undefined)
}

export function token_atom() {
	const token_tuple_or_spec: [RawToken] | RegexComponent = or(
		c(tok.character_class),
		c(tok.character_class_name),
		c(tok.token_name),
		c(tok.str),
		c(() => {
			consume(tok.open_paren)
			const spec = token_specification()
			consume(tok.close_paren)
			return spec
		}, _NFQGh),
	)
	const maybe_token_modifier = maybe_or(c(tok.modifier_token), c(tok.repetitions_modifier))

	const parsed_modifier = maybe_token_modifier === undefined ? undefined : exec(() => {
		const modifier_token = maybe_token_modifier[0]!
		switch (modifier_token.type.name) {
		case 'modifier_token':
			return handle_modifier(modifier_token.content)
		case 'repetitions_modifier':
			const unwrapped_modifier = modifier_token.content.slice(1, -1)
			if (!unwrapped_modifier.includes(','))
				return parse_number(unwrapped_modifier)
			const [begin, end] = unwrapped_modifier.split(',')
			return t(
				parse_number(begin),
				end !== undefined && end !== '' ? parse_number(end) : undefined,
			)
		default: return impossible()
		}
	})

	if (!Array.isArray(token_tuple_or_spec))
		return (token_tuple_or_spec as RegexComponent).modify(parsed_modifier)

	const [spec_token] = token_tuple_or_spec
	switch (spec_token.type.name) {
	case 'character_class': {
		const [negated, source] = spec_token.content.startsWith('^')
			? t(true, spec_token.content.slice(2, -1))
			: t(false, spec_token.content.slice(1, -1))
		return new CharacterClass(source, negated, parsed_modifier)
	}
	case 'character_class_name': {
		const [negated, class_name] = spec_token.content.startsWith('^')
			? t(true, spec_token.content.slice(2))
			: t(false, trim_sigil(spec_token))
		return new CharacterClassReference(class_name, negated, parsed_modifier)
	}
	case 'token_name':
		return new TokenReference(trim_sigil(spec_token), parsed_modifier)
	case 'str':
		return new TokenString(spec_token.content.slice(1, -1), parsed_modifier)
	default: return impossible()
	}
}

export function virtual_lexer_usage() {
	consume(tok.open_brace)
	const exposed_token_names: string[] = lines_block(() => {
		const [exposed_token_name_token] = consume(tok.token_name)
		return trim_sigil(exposed_token_name_token)
	}, _7jjmO, _Z1owlnn, _Z1F9dGs, _6PPJc)

	const path_token = consume(tok.close_brace, tok.space, tok.eq, tok.space, tok.use_keyword, tok.space, tok.str)[6]
	const path = path_token.content.slice(1, -1)
	// TODO need a more robust way of doing this
	const virtual_lexer_name = basename(path)
	const exposed_tokens = exposed_token_names.index_map(n => t(n, true as const))

	// return new VirtualLexerUsage(virtual_lexer_name, path, args, exposed_tokens)
	return new VirtualLexerUsage(virtual_lexer_name, path, [], exposed_tokens)
}

export function macro_definition() {
	const [macro_name_token] = consume(tok.macro_name)
	const locking_args = maybe(locking_definitions, _MHu6X)

	consume(tok.open_bracket)
	const args = lines_block(() => {
		const [arg_name_token] = consume(tok.var_name)
		return new Arg(trim_sigil(arg_name_token))
	}, _Z1tSeaR, _Z1owlnn, _Z1F9dGs, _6PPJc)
	consume(tok.close_bracket)

	const definition = rule_block()

	const macro_name = trim_sigil(macro_name_token)
	return new Macro(macro_name, args, definition, locking_args)
}

export function macro_call() {
	const [macro_name_token, ] = consume(tok.macro_name, tok.open_bracket)
	const args = comma_sep(simple_rule_line, _6PPJc).map(mut_cluster_prefixed_items) as NonEmpty<Definition>
	consume(tok.close_bracket)

	const macro_name = trim_sigil(macro_name_token)
	return new MacroCall(undefined, macro_name, args)
}

export function rule_definition() {
	const [rule_name_token] = consume(tok.rule_name)
	const locking_args = maybe(locking_definitions, _MHu6X)
	const definition = rule_block()

	const rule_name = rule_name_token.content
	return new Rule(rule_name, definition, locking_args)
}


type PrefixedItem = ['|' | undefined, NonEmpty<Node>]


function apply_modifier(modifier: Modifier, nodes: NonEmpty<Node>): NonEmpty<Node> {
	if (modifier === undefined)
		return nodes
	return nodes.length === 1
		? [nodes[0].modify(modifier)]
		: [new Paren(modifier, mut_cluster_consumes(nodes) as NonLone<Node>)]
}

function mut_cluster_prefixed_items(items: NonEmpty<PrefixedItem>): Definition {
	const give = [] as Node[]
	let item
	while (item = items.shift()) {
		const [prefix, nodes] = item
		if (prefix === undefined) {
			give.push_all(nodes)
			continue
		}

		const final_choices = [nodes] as Definition[]
		let next_item
		while (next_item = items.shift()) {
			const [prefix, nodes] = next_item
			if (prefix === '|') {
				final_choices.push(nodes)
				continue
			}

			if (final_choices.length < 2)
				throw new Error("only one choice in an Or")

			give.push(new Or(undefined, final_choices as NonLone<Definition>))
			give.push_all(nodes)
			break
		}

		if (final_choices.length < 2)
			throw new Error("only one choice in an Or")
		give.push(new Or(undefined, final_choices as NonLone<Definition>))
	}

	return mut_cluster_consumes(give as NonEmpty<Node>)
}

export function rule_block(): Definition {
	consume(tok.space, tok.eq)
	const rule_items = diff_block(() => {
		consume(tok.space)
		return [simple_rule_line()]
	}, rule_item, _7U1Cw, _Z1owlnn, _Z1F9dGs)

	return mut_cluster_prefixed_items(flatten(rule_items) as NonEmpty<PrefixedItem>)
}

export function rule_item(): NonEmpty<PrefixedItem> {
	return or(
		c(() => {
			const prefix_modifier: [RawToken] | BaseModifier = or(c(tok.bar), c(modifier, _2dw1N))
			const prefix: BaseModifier | '|' = Array.isArray(prefix_modifier)
				? '|'
				: prefix_modifier

			const sub_rule_items = diff_block(() => {
				consume(tok.space)
				return { choices: simple_rule_line() }
			}, rule_item, _7U1Cw, _Z1owlnn, _Z1F9dGs)

			if (Array.isArray(sub_rule_items)) {
				const nodes = mut_cluster_prefixed_items(flatten(sub_rule_items) as NonEmpty<PrefixedItem>)
				return prefix !== '|'
					? [t(undefined, apply_modifier(prefix, nodes))]
					: [t('|', nodes)]
			}

			if (prefix !== '|') {
				const choices = sub_rule_items.choices.map(prefixed => prefixed[1])
				return [t(
					undefined,
					choices.length === 1
						? [new Paren(prefix, choices[0] as NonLone<Node>)]
						: [new Or(prefix, choices as NonLone<Definition>)]
				)]
			}

			return sub_rule_items.choices.map(c => t('|', c[1]))

		}, _Nf9Ed),

		c(simple_rule_line, _1cWbFl),
	)
}

export function simple_rule_line(): NonEmpty<PrefixedItem> {
	const bar_separated = many_separated(() => {
		const space_separated_atoms = flatten(space_sep(rule_atom, _2eTKEs)) as NonEmpty<Node>
		return mut_cluster_consumes(space_separated_atoms)
	}, () => {
		consume(tok.space, tok.bar, tok.space)
	}, _7U1Cw)

	return bar_separated.length === 1
		? [t(undefined, bar_separated[0])]
		: bar_separated.map(c => t('|', c) as PrefixedItem) as NonEmpty<PrefixedItem>
}


export function rule_atom(): NonEmpty<Node> {
	const atoms: { atoms: NonEmpty<PrefixedItem> } | Node | [RawToken] = or(
		c(tok.rule_name), c(tok.token_name), c(tok.var_name), c(tok.locked_name),
		c(macro_call, _Z1Bz2H0),
		c(() => {
			consume(tok.open_paren)
			const atoms = flatten(enclosed_diff_block(simple_rule_line, _1cWbFl, _Z1owlnn, _Z1F9dGs))
			consume(tok.close_paren)
			return { atoms }
		}, _NFQGh),
	)
	const parsed_modifier = maybe(modifier, _2dw1N)

	if (!Array.isArray(atoms)) {
		return 'atoms' in atoms
			? apply_modifier(parsed_modifier, mut_cluster_prefixed_items((atoms as { atoms: NonEmpty<PrefixedItem> }).atoms))
			: [parsed_modifier !== undefined ? (atoms as Node).modify(parsed_modifier) : atoms]
	}

	const [atom_token] = atoms
	switch (atom_token.type.name) {
	case 'rule_name':
		return [new Subrule(parsed_modifier, atom_token.content)]
	case 'token_name':
		return [new Consume(parsed_modifier, [trim_sigil(atom_token)])]
	case 'var_name':
		return [new Var(parsed_modifier, trim_sigil(atom_token))]
	case 'locked_name':
		// console.log("locked_name", atom_token.content)
		return [new LockingVar(parsed_modifier, trim_sigil(atom_token))]
	default: return impossible()
	}
}

export function locking_definitions() {
	consume(tok.open_angle)
	const locking_args = lines_block(() => {
		const [locked_name_token, , , , token_name_token] = consume(tok.locked_name, tok.space, tok.eq, tok.space, tok.token_name)
		return new LockingArg(trim_sigil(locked_name_token), trim_sigil(token_name_token))
	}, _fw7Qu, _Z1owlnn, _Z1F9dGs, _6PPJc)
	consume(tok.close_angle)

	return locking_args
}

export function modifier() {
	const [modifier_token] = consume(tok.modifier_token)
	return handle_modifier(modifier_token.content)
}

function handle_modifier(content: string): BaseModifier {
	switch (content) {
		case '+': return '+' as BaseModifier
		case '?': return '?' as BaseModifier
		case '*': return '*' as BaseModifier
		default: return impossible()
	}
}


function many_separated<BODY extends ParseArg, SEPARATOR extends ParseArg>(
	body: BODY, separator: SEPARATOR, _d1: Decidable,
) {
	const results = [body()] as NonEmpty<ReturnType<BODY>>
	const rest = maybe_many(() => {
		separator()
		return body()
	}, _d1)
	if (rest)
		results.push_all(rest)
	return results
}

function comma_sep<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
	return many_separated(body, () => {
		consume(tok.comma, tok.space)
	}, _d1)
}

function space_sep<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
	return many_separated(body, () => {
		consume(tok.space)
	}, _d1)
}

function diff_block<NOT_IN_INDENT extends ParseArg, IN_INDENT extends ParseArg>(
	not_in_indent: NOT_IN_INDENT, in_indent: IN_INDENT, _d1: Decidable, _d2: Decidable, _d3: Decidable,
) {
	return or(
		c(not_in_indent, _d1),
		c(() => {
			consume(tok.indent)
			const items = many_separated(in_indent, () => {
				consume(tok.indent_continue)
			}, _d3)
			consume(tok.deindent)
			return items
		}, _d2),
	)
}

// function block<BLOCK_LINE extends ParseArg>(block_line: BLOCK_LINE, _d1: Decidable, _d2: Decidable, _d3: Decidable) {
// 	return diff_block(block_line, block_line, _d1, _d2, _d3)
// }

function enclosed_diff_block<LINE_ITEM extends ParseArg>(
	line_item: LINE_ITEM, _d1: Decidable, _d2: Decidable, _d3: Decidable,
): NonEmpty<ReturnType<LINE_ITEM>> {
	const items = or(
		c(() => [line_item()] as NonEmpty<ReturnType<LINE_ITEM>>, _d1),
		c(() => {
			consume(tok.indent)
			const items = many_separated(line_item, () => {
				consume(tok.indent_continue)
			}, _d3)
			consume(tok.deindent, tok.indent_continue)
			return items
		}, _d2),
	)
	return items
}

function lines_block<LINE_ITEM extends ParseArg>(
	line_item: LINE_ITEM, _d1: Decidable, _d2: Decidable, _d3: Decidable, _d4: Decidable
): NonEmpty<ReturnType<LINE_ITEM>> {
	const items = enclosed_diff_block(() => {
		return comma_sep(line_item, _d4)
	}, _d1, _d2, _d3)
	return flatten(items) as NonEmpty<ReturnType<LINE_ITEM>>
}
