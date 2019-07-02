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




// and a sample version of the userland code for the json example

type Thing = { val: string }

type ParseFunction = Function & { __lookahead: Thing }

function parse_thing() {
	return 4
}

parse_thing.__lookahead = { val: 'stuff' }
const a: ParseFunction = parse_thing
console.log(parse_thing.__lookahead)


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



function json_entity() {
	kreia.or(
		array,
		object,
		atomic_entity,
	)
}

function separated_by_commas(rule: ParseFunction) {
	kreia.maybe(
		() => {
			rule()
			kreia.maybe_many(() => {
				kreia.consume(tokens.Comma)
				rule()
			})
		},
		__separated_by_commas__branch_1,
	)
}

function atomic_entity() {
	kreia.or([
		tokens.Str,
		tokens.Num,
		tokens.Primitive,
	])
}

json_entity.__lookahead_path = new Something()
