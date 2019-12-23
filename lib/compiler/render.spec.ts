import 'mocha'
import { expect } from 'chai'

import { compute_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'
import {
	Definition, Scope, ScopeStack, Node,
	TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, many, _var, many_separated,
	macro_call,
} from './ast'
import { render_rule, render_grammar } from './render'
import { print_node } from './render_codegen'


const empty_scope = { current: Scope(undefined, undefined), previous: [] }

export function boil_string(value: string) {
	return value
		.replace(/\s+/g, ' ')
		.replace(/ *; */g, ' ')
		.replace(/\( /g, '(')
		.replace(/ \)/g, ')')
		.replace(/\{ /g, '{')
		.replace(/ \}/g, '}')
		.replace(/\[ /g, '[')
		.replace(/ \]/g, ']')
		.trim()
}

function b(node: Parameters<typeof print_node>[0]) {
	return expect(boil_string(print_node(node)))
}

describe('render_rule', () => it('works', () => {
	b(render_rule(new Rule('a', [

		consume('num'),
		maybe_many_consume('space', 'num'),
		maybe_many(
			consume('space', 'bar', 'space', 'num'),
			maybe_many_consume('space', 'num'),
		),

	]))).eql(boil_string(`
		export function a() {
			consume(tok.num)
			maybe_many(tok.space, tok.num)
			maybe_many(() => {
				consume(tok.space, tok.bar, tok.space, tok.num)
				maybe_many(tok.space, tok.num)
			}, _0)
		}
	`))
}))

describe('basic gathering in render_grammar', () => it('works', () => {
	const { rendered_decidables, rendered_rules } = render_grammar([
		new TokenDef('A', 'A'),
		new TokenDef('B', 'B'),
		new TokenDef('C', 'C'),
		new Rule('a', [
			many(
				consume('A'),
				many_consume('B', 'A'),
			),
			many(
				consume('A'),
				many_consume('C', 'A'),
			),
		])
	])

	expect(rendered_rules.length).eql(1)

	b(rendered_rules[0]).eql(boil_string(`
		export function a() {
			many(() => {
				consume(tok.A)
				many(tok.B, tok.A)
			}, _0)
			many(() => {
				consume(tok.A)
				many(tok.C, tok.A)
			}, _1)
		}
	`))
	b(rendered_decidables).eql(boil_string(`
		const [_0, _1] = [
			path([tok.A, tok.B]),
			path([tok.A])
		]
	`))
}))


describe('many_separated case', () => it('works', () => {
	const { rendered_decidables, rendered_rules, rendered_macros } = render_grammar([
		new TokenDef('num', 'num'),
		new TokenDef('bar', 'bar'),
		new TokenDef('space', 'space'),
		new Macro('many_separated', [new Arg('body'), new Arg('separator')], [
			_var('body'),
			maybe_many(
				_var('separator'),
				_var('body')
			),
		]),

		new Rule('a', [
			// when we start, we have an empty scope
			// then we hit this first macro_call, and push to this:
			// { current: { args: { body: [nested], separator: [consume] }, receiver_one }, previous: [empty] }

			// then we're going along and hit the body var, and should pop to this:
			// { current: { args: {}, determiner: maximizing_body }, previous: [] }

			// then as we're maximizing_body, we hit the second macro_call:
			// { current: { args: { body: [consume], separator: [consume] }, receiver_two }, previous: [^] }
			// we hit the maybe_many and generate the decidable that's gathered by receiver_two
			many_separated(
				[many_separated(
					[consume('num')],
					[consume('space', 'bar', 'space')],
				)],
				[consume('space')],
			),
		])
	])

	expect(rendered_rules.length).eql(1)
	b(rendered_rules[0]).eql(boil_string(`
		export function a() {
			many_separated(() => {
				many_separated(() => {
					consume(tok.num)
				}, () => {
					consume(tok.space, tok.bar, tok.space)
				}, _Z17XUHM)
			}, () => {
				consume(tok.space)
			}, _7U1Cw)
		}
	`))

	expect(rendered_macros.length).eql(1)
	b(rendered_macros[0]).eql(boil_string(`
		function many_separated<BODY extends ParseArg, SEPARATOR extends ParseArg>(
			body: BODY, separator: SEPARATOR, _d1: Decidable
		) {
			body()
			maybe_many(() => {
				separator()
				body()
			}, _d1)
		}
	`))

	b(rendered_decidables).eql(boil_string(`
		const { _Z17XUHM, _7U1Cw } = {
			_Z17XUHM: path([tok.space, tok.bar]),
			_7U1Cw: path([tok.space])
		}
	`))
}))


describe('macro in macro', () => it('works', () => {
	const { rendered_decidables, rendered_rules, rendered_macros } = render_grammar([
		new TokenDef('space', 'space'),

		new Macro('many_separated', [new Arg('body'), new Arg('separator')], [
			_var('body'),
			maybe_many(
				_var('separator'),
				_var('body'),
			),
		]),


		// but perhaps this would be more appropriate?
		// { current: { args: { body: [] }, determiner: { count: 0 } }, previous: [] }


		// when we enter, we have this scope:
		// { current: { args: {}, determiner: { count: 0 } }, previous: [] }

		// then we hit the macro_call, and push to this:
		// { current: { args: { body: [var], separator: [consume] }, determiner: { count: 0 } }, previous: [^above] }

		// as we're going along the many_separated definition, we first encounter the body var, and pop to this:
		// { current: { args: {}, determiner: { count: 0 } }, previous: [] }
		// that makes perfect sense, so it would also make sense not to push the determiner through both stages
		new Macro('space_separated', [new Arg('body')], [
			macro_call('many_separated',
				[_var('body')],
				[consume('space')],
			),
		]),
	])

	b(rendered_macros[1]).eql(boil_string(`
		function space_separated<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
			many_separated(
				() => { body() },
				() => { consume(tok.space) },
				_d1
			)
		}
	`))

	// b(rendered_rules[1]).eql(boil_string(`
	// 	function space_separated<BODY extends ParseArg>(body: BODY, _d1: Decidable) {
	// 		many_separated(
	// 			() => { body() },
	// 			() => { consume(tok.space) },
	// 			_d1
	// 		)
	// 	}
	// `))
}))

// here we see a situation where who *receives* the decidable is different that who *determines* the decidable
// determination is by the "counting", or the definition
// reception is for the macro call
