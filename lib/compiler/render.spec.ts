import 'mocha'
import { expect } from 'chai'

import { compute_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'
import {
	Definition, Scope, ScopeStack, Node,
	TokenDef as _TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, many, _var, many_var, many_separated,
	macro_call,
} from './ast'
import { TokenString } from './ast_tokens'
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

function TokenDef(name: string, def: string) {
	return new _TokenDef(name, new TokenString(def, undefined), false)
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
			}, _7U1Cw)
		}
	`))
}))

describe('basic gathering in render_grammar', () => it('works', () => {
	const { rendered_decidables, rendered_rules } = render_grammar([
		TokenDef('A', 'A'),
		TokenDef('B', 'B'),
		TokenDef('C', 'C'),
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
			}, _h9W)
			many(() => {
				consume(tok.A)
				many(tok.C, tok.A)
			}, _14)
		}
	`))
	b(rendered_decidables).eql(boil_string(`
		const { _h9W, _14 } = {
			_h9W: path([tok.A, tok.B]),
			_14: path([tok.A])
		}
	`))
}))


describe('many_separated case', () => it('works', () => {
	const { rendered_decidables, rendered_rules, rendered_macros } = render_grammar([
		TokenDef('num', 'num'),
		TokenDef('bar', 'bar'),
		TokenDef('space', 'space'),
		new Macro('many_separated', [new Arg('body'), new Arg('separator')], [
			_var('body'),
			maybe_many(
				_var('separator'),
				_var('body')
			),
		]),

		new Rule('a', [
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
		TokenDef('space', 'space'),

		new Macro('many_separated', [new Arg('body'), new Arg('separator')], [
			_var('body'),
			maybe_many(
				_var('separator'),
				_var('body'),
			),
		]),

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
				body,
				() => { consume(tok.space) },
				_d1
			)
		}
	`))
}))

describe('macros deeply nested', () => it('works', () => {
	const { rendered_macros } = render_grammar([
		// TokenDef('A', 'A'),
		// TokenDef('A', 'A'),
		// TokenDef('A', 'A'),

		new Macro('one', [new Arg('one_body')], [
			_var('one_body'),
		]),

		new Macro('two', [new Arg('two_body')], [
			macro_call('one', [_var('two_body')]),
		]),

		new Macro('three', [new Arg('three_body')], [
			macro_call('two', [_var('three_body')]),
		]),
	])

	b(rendered_macros[0]).eql(boil_string(`
		function one<ONE_BODY extends ParseArg>(one_body: ONE_BODY) {
			one_body()
		}
	`))

	b(rendered_macros[1]).eql(boil_string(`
		function two<TWO_BODY extends ParseArg>(two_body: TWO_BODY) {
			one(two_body)
		}
	`))

	b(rendered_macros[2]).eql(boil_string(`
		function three<THREE_BODY extends ParseArg>(three_body: THREE_BODY) {
			two(three_body)
		}
	`))
}))


describe('macros deeply nested with decidables', () => it('works', () => {
	const { rendered_macros } = render_grammar([
		// TokenDef('A', 'A'),
		// TokenDef('A', 'A'),
		// TokenDef('A', 'A'),

		new Macro('one', [new Arg('one_body')], [
			many_var('one_body'),
		]),

		new Macro('two', [new Arg('two_body')], [
			macro_call('one', [_var('two_body')]),
		]),

		new Macro('three', [new Arg('three_body')], [
			macro_call('two', [_var('three_body')]),
		]),
	])

	b(rendered_macros[0]).eql(boil_string(`
		function one<ONE_BODY extends ParseArg>(one_body: ONE_BODY, _d1: Decidable) {
			many(one_body, _d1)
		}
	`))

	b(rendered_macros[1]).eql(boil_string(`
		function two<TWO_BODY extends ParseArg>(two_body: TWO_BODY, _d1: Decidable) {
			one(two_body, _d1)
		}
	`))

	b(rendered_macros[2]).eql(boil_string(`
		function three<THREE_BODY extends ParseArg>(three_body: THREE_BODY, _d1: Decidable) {
			two(three_body, _d1)
		}
	`))
}))
