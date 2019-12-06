const { tok, reset, exit, arg, maybe, consume, many, maybe_many, or, maybe_or, many_separated, maybe_many_separated } = Parser({
	Str: /"(?:\\["\\]|[^\n"\\])*"/,
	Comma: ",",
	Colon: ":",
	LeftBrace: "{",
	RightBrace: "}",
	LeftBracket: "[",
	RightBracket: "]",
	Primitive: ["null", "undefined", "true", "false"],
	Num: /[0-9]+(\.[0-9]+)?/,
	Whitespace: { match: /\s+/, ignore: true }
}, {})

const [_0, _1, _2, _3, _4, _5, _6] = [path([tok.LeftBracket]), path([tok.LeftBrace]), path(branch(path([tok.Str]), path([tok.Num]), path([tok.Primitive]))), path(branch(path([tok.LeftBracket]), path([tok.LeftBrace]), path(branch(path([tok.Str]), path([tok.Num]), path([tok.Primitive]))))), path([tok.Comma]), path([tok.Str]), path([tok.Comma])]

function json_entity() {
	or(f(array, _0), f(object, _1), f(atomic_entity, _2))
}

function array() {
	consume(tok.LeftBracket)
	separated_by_commas(() => {
		json_entity()
	}, _3, _4)
	consume(tok.RightBracket)
}

function object() {
	consume(tok.LeftBrace)
	separated_by_commas(() => {
		json_key()
		json_entity()
	}, _5, _6)
	consume(tok.RightBrace)
}

function atomic_entity() {
	or(t(tok.Str), t(tok.Num), t(tok.Primitive))
}

function json_key() {
	consume(tok.Str, tok.Colon)
}

function separated_by_commas<THING extends ParseArg>(thing: THING, _d1: Decidable, _d2: Decidable) {
	maybe_many_separated(f(() => {
		arg(thing)
	}, _d1), f(() => {
		consume(tok.Comma)
	}, _d2))
}
