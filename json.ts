// // basically the only controversial thing about the token syntax is what subset of regex to use, and what syntax to use to indicate beginning and ending
// %token = [a-b\-]

// maybe at some point we can add:
// rule = other_rule &(different) // only parse other_rule if it is followed by different, **but don't consume different**
// rule = other_rule !(different) // only parse other_rule if it is *not* followed by different

// @my_macro[$arg, $differentarg] = $arg? $differentarg+ %comma

// in general, *branches* of rules that *can be* completely empty should be rejected
// some_rule =
// 	| name:(%t | other_rule)+
// 	| different_rule+
// 	| need_tok:(%tok %comma)? also_need:@many_separated[some_rule, %newline %comma %indent]
// thinking about how to indicate needing things passed as arguments to macros
// 	| need_tok:(%tok %comma)? @many_separated[also_need:some_rule, %newline %comma %indent]

// to create a finalized form of something like the grammar above:
// each subrule is represented by a function

// every "branching" construct (*, +, ?, |) will also need a function call, within it's rule, with some "lookahead branch" object that's baked in another file (yes, these output parsers will find ways to keep the cruft out of people's hair) passed in to let it know what to look for

// the cli has lots of options, some to just run the grammar with some input (basically for testing the validity of the grammar)
// one to generate in "take everything" mode, or "take nothing" mode, indicating what functions should be set up to actually return things versus just toss them once they've been consumed
// and obviously for every host language that's added, those would all be plugins that could be given at the cli





// json_entity =
// 	| array
// 	| object
// 	| atomic_entity

// @separated_by_commas[$rule] = ($rule (%Comma $rule)*)?

// array =
// 	%LeftBracket
// 	@separated_by_commas[json_entity]
// 	%RightBracket

// object =
// 	%LeftBrace
// 	@separated_by_commas[%Str %Colon json_entity]
// 	%RightBrace

// atomic_entity =
// 	| %Str
// 	| %Num
// 	| %Primitive

// and a sample version of the userland code for the json example


type Func = () => any
type ParseFunction<F extends Func> = F & { __lookahead: LookaheadPath }

class LookaheadPath {
	constructor(readonly a: number) {}
}

function random_bool() { return Math.random() > 0.5 }

type Lexer = { [tokenName: string]: BaseTokenDefinition }
type TokenManifest<L extends Lexer> = { [K in keyof L]: { name: K } & L[T] }

type BaseTokenDefinition = { regex: number }
// type TokenDefinition<L extends Lexer> = { name: keyof L, regex: RegExp }
type TokenDefinition<L extends Lexer, K extends keyof L> = { name: keyof L, regex: number }
type Token<L extends Lexer, K extends keyof L> = { name: K, value: string }

type TokenDefinitionTuple<L extends Lexer, T extends any[]> = { [K in keyof T]: TokenDefinition<L> }
type TokenTuple<L extends Lexer, T extends any[]> = { [K in keyof T]: Token<L> }

type ParseObject<F extends Func> = { f: F, l: LookaheadPath }

type ParseEntity<F extends Func> = ParseFunction<F> | ParseObject<F>

type BothEntity<F extends Func, L extends Lexer, A extends any[]> =
	ParseEntity<F>
	| TokenDefinitionTuple<L, A>


type BothEntityTuple<L extends Lexer, A extends any[]> = {
	[K in keyof A]:
		A[K] extends any[] ? TokenDefinitionTuple<L, A[K]>
		: A[K] extends Func ? ParseFunction<A[K]>
		: A[K] extends ParseObject<infer R> ? ParseObject<R>
		: never
}

type UnionReturnBothEntityTuple<L extends Lexer, A extends any[]> = ({
	[K in keyof A]:
		A[K] extends any[] ? TokenTuple<L, A[K]>
		: A[K] extends Func ? ReturnType<A[K]>
		: A[K] extends ParseObject<infer R> ? ReturnType<R>
		: never
})[number]


function entity_is_function<F extends Func>(entity: ParseEntity<F>): entity is ParseFunction<F> {
	return typeof entity === 'function'
}

function act_on_entity<F extends Func, L extends Lexer, A extends any[]>(entity: BothEntity<F, L, A>): ReturnType<F> | TokenTuple<L, A> {
	if (Array.isArray(entity))
		return entity.map(token_definition => ({
			name: token_definition.name,
			value: '' + token_definition.regex,
		})) as TokenTuple<L, A>

	else if (entity_is_function(entity)) return entity()

	return entity.f()
}

function or<L extends Lexer, A extends any[]>(...entities: BothEntityTuple<L, A>): UnionReturnBothEntityTuple<L, A> | undefined {
	for (const entity of entities) {
		if (random_bool()) {
			return act_on_entity(entity)
		}
	}
	return undefined
}


function one() {
	return 5
}
one.__lookahead = new LookaheadPath(6)

const results: string | number | undefined = or(
	one,
	{ l: new LookaheadPath(2), f: () => 'string' },
)





function maybe_consume<L extends Lexer, T extends any[]>(entity: TokenDefinitionTuple<L, T>): TokenTuple<L, T> | undefined {
	return entity
		.map(token_definition => ({
			name: token_definition.name,
			value: '' + token_definition.regex,
		})) as TokenTuple<L, T>
}

function maybe<F extends Func>(entity: ParseEntity<F>): ReturnType<F> | undefined {
	if (entity_is_function(entity)) {
		console.log(entity.__lookahead)
		return entity()
	}
	console.log(entity.l.a)
	return entity.f()
}



function json_entity() {
	kreia.or(
		array,
		object,
		atomic_entity,
	)
}

function separated_by_commas(rule: ParseFunction) {
	kreia.maybe({ l: __separated_by_commas__branch_1, f() {
		rule()
		kreia.maybe_many({ l: __separated_by_commas__branch__1__1, f() {
			kreia.consume(tokens.Comma)
			rule()
		}})
	}})
}

function atomic_entity() {
	kreia.or(
		[tokens.Str],
		[tokens.Num],
		[tokens.Primitive],
	)
}

json_entity.__lookahead_path = new Something()
