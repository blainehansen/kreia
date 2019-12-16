import 'mocha'
import { expect } from 'chai'

import { compute_decidable, AstDecisionPath as path, AstDecisionBranch as branch } from './decision_compute'
import {
	Definition, Scope, ScopeStack, Node,
	TokenDef, VirtualLexerUsage, Rule, Macro, Arg,
	consume, maybe, maybe_many, maybe_consume, maybe_many_consume, many_consume, or, many, _var, many_separated,
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

		// consume('num')
		// maybe_many(
		// 	consume('space', 'num')
		// )
		// maybe_many(
		// 	consume('space', 'bar', 'space')
		// 	consume('num')
		// 	maybe_many(
		// 		consume('space', 'num')
		// 	)
		// )
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
				}, _1)
			}, () => {
				consume(tok.space)
			}, _0)
		}
	`))

	expect(rendered_macros.length).eql(1)
	b(rendered_macros[0]).eql(boil_string(`
		//
	`))

	b(rendered_decidables).eql(boil_string(`
		const [_0, _1] = [
			path([tok.space, tok.bar]),
			path([tok.space])
		]
	`))
}))
