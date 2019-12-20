import ts = require('typescript')
import { Dict, tuple as t } from '@ts-std/types'

import { MaxDict } from '../utils'
import { AstDecidable } from './decision_compute'

type RenderContext =
	| undefined
	| { type: 'counting', count: number }
	| {
		type: 'gathering_macro_call', body_decidables: ts.Identifier[],
		rendered_args: DefaultDict<{
			arrow: ts.ArrowFunction | undefined,
			current_point: number,
			points: MaxDict<[ts.Identifier, AstDecidable]>,
		}>
	}

function points_initializer(left: [ts.Identifier, AstDecidable], right: [ts.Identifier, AstDecidable]) {
	return left[1].test_length > right[1].test_length
}

function rendered_args_initializer() {
	return {
		arrow: undefined, current_point: 0,
		points: new MaxDict(points_initializer),
	}
}


type BaseScope = Readonly<{ locking_args: Dict<LockingArg>, args: Dict<Definition> }>
export type Scope<P extends Dict<any> = Dict<unknown>> = BaseScope & P

export function Scope(locking_args: Dict<LockingArg> | undefined, args: Dict<Definition> | undefined, render_context: RenderContext): Scope {
	return {
		locking_args: locking_args || {},
		args: args || {},
		render_context,
		capturing_var: undefined,
	}
}
export type ScopeStack = { current: Scope, previous: Scope[] }
export namespace Scope {
	export function for_rule(rule: Rule): ScopeStack {
		return { current: Scope(rule.locking_args, undefined, undefined), previous: [] }
	}
	export function for_macro(macro: Macro): ScopeStack {
		return { current: Scope(macro.locking_args, undefined, { type: 'counting', count: 0 }), previous: [] }
	}
	export function for_macro_call({ current, previous }: ScopeStack, macro: Macro, call: MacroCall): ScopeStack {
		const args = zip_args(macro, call).unwrap()
		return {
			current: Scope(macro.locking_args, args, {
				type: 'gathering_macro_call', body_decidables: [],
				rendered_args: new MaxDict(rendered_args_initializer),
			}),
			previous: [...previous, current],
		}
	}
	export function for_var({ current, previous }: ScopeStack, var_node: Var): [Definition, ScopeStack] {
		return t(
			{
				current: {
					...previous.maybe_get(-1).unwrap(),
					capturing_var: var_node.arg_name,
				},
				previous: previous.slice(0, previous.length - 1),
			},
			Maybe.from_nillable(current.args[var_node.arg_name]).unwrap(),
		)
	}
	export function for_locking_var({ current }: ScopeStack, locking_var: LockingVar): string {
		return Maybe.from_nillable(current.locking_args[locking_var.locking_arg_name]).unwrap().token_name
	}

	export function zip_definitions<L extends Definition[]>(
		definitions: L, scope: ScopeStack,
	): TForL<[Definition, ScopeStack], L> {
		return definitions.map(d => t(d, scope)) as TForL<[Definition, ScopeStack], L>
	}
	export function zip_nodes<L extends Node[]>(
		nodes: L, scope: ScopeStack,
	): TForL<[Node, ScopeStack], L> {
		return nodes.map(node => t(node, scope)) as TForL<[Node, ScopeStack], L>
	}
}


type TForL<T, L extends any[]> = { [K in keyof L]: T }
