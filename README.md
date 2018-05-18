# Kreia

A flexible and easy to use parser library.

> Peer into chaos, and see order.

---

```js
const Parser = require('kreia/parser')
const lexing = require('kreia/lexing')

const lexer = lexing.compile({
  Primitive: ['null', 'undefined', 'true', 'false'],
  Str: /"(?:\\["\\]|[^\n"\\])*"/,
  Num: /[0-9]+/,
  Comma: ',',
  LeftBracket: '[', RightBracket: ']',
  LeftBrace: '{', RightBrace: '}',
  Colon: ':',
  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
})

const { Primitive, Str, Num, Comma, LeftBracket, RightBracket, LeftBrace, RightBrace, Colon } = lexer.tokenLibrary()
const miniJson = new Parser(lexer)
const {
  rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
  or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
  quit, INSPECT
} = miniJson.getPrimitives()

rule('jsonEntity', () => {
  or(
    () => subrule('array'),
    () => subrule('object'),
    () => consume(Str),
    () => consume(Num),
    () => consume(Primitive),
  )
})

// note how we're defining a pure function
// that calls a parser primitive function
function separatedByCommas(func) {
  maybeManySeparated(
    func,
    () => consume(Comma),
  )
}

rule('array', () => {
  consume(LeftBracket)
  separatedByCommas(() => subrule('jsonEntity'))
  consume(RightBracket)
})

rule('object', () => {
  consume(LeftBrace)
  separatedByCommas(() => {
    consume(Str, Colon)
    subrule('jsonEntity')
  })
  consume(RightBrace)
})
```
