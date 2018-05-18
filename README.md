# Kreia

A flexible and easy to use parser library.

> Peer into chaos, and see order.

---

## This library is in active development.

There are lots of little features that are undone, and the "friendliness" of many of the errors and apis hasn't been completely finished. Contributions are welcome!

---

Kreia makes it effortless to build completely custom lookahead parsers in pure javascript, and all the looking ahead is completely handled for you.

```bash
npm install --save-dev kreia
```

```js
const kreia = require('kreia')

// create a parser with a token definition
const [parser, tokenLibrary] = kreia.createParser({
  LeftParen: '(',
  RightParen: ')',
  Num: /[0-9]+/,
  Nil: 'nil',
  Comma: ',',
  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
})

// grab the parser functions
// these are all bound to the parser instance
const {
  rule, subrule, maybeSubrule,
  consume, or, many, manySeparated,
} = parser.getPrimitives()

// define your parsing rules
rule('lists', () => {
  many(() => subrule('parenthesizedNumberList'))
})

rule('parenthesizedNumberList', () => {
  consume(tokenLibrary.LeftParen)
  maybeSubrule('numberList')
  consume(tokenLibrary.RightParen)
})

// you can define functions that call parser functions
function tokenOr(...tokenTypes) {
  or(
    ...tokenTypes.map(tokenType => () => consume(tokenType))
  )
}
rule('numberList', () => {
  manySeparated(
    () => or(
      () => subrule('parenthesizedNumberList'),
      () => tokenOr(tokenLibrary.Num, tokenLibrary.Nil),
    ),
    () => consume(tokenLibrary.Comma),
  )
})

// get your parser ready
parser.analyze()

// feed it some input
parser.reset(`
  (1, 2, 3, nil) ()
  (nil, nil)
  (1, (2, 3, 4), (((), nil)))
`)

// call a rule to parse
parser.lists()
```


Here's a fuller example with explanations, a simple json parser that actually uses the parse results to return a javascript entity.

```js
const kreia = require('kreia')

// This first builds a lexer
// with an extended version of moo (https://github.com/no-context/moo)
// so all the features of that library are available (and then some).
// Then it creates a parser that uses that lexer.
// createStatesParser() (that uses moo.states) is also available
const [miniJsonParser, tokenLibrary] = kreia.createParser({
  Primitive: ['null', 'undefined', 'true', 'false'],
  Str: { match: /"(?:\\["\\]|[^\n"\\])*"/, value: x => x.slice(1, -1) },
  Num: /[0-9]+/,
  Comma: ',',
  LeftBracket: '[',
  RightBracket: ']',
  LeftBrace: '{',
  RightBrace: '}',
  Colon: ':',
  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
})

// pull out all the individual token types
const {
  Primitive, Str, Num, Comma,
  LeftBracket, RightBracket, LeftBrace, RightBrace, Colon
} = tokenLibrary

// Get the primitive parsing functions.
// getPrimitives() binds the functions
// to the parser instance before returning them,
// so you can call rule() instead of miniJsonParser.rule()
const {
  rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
  or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
  quit
} = miniJsonParser.getPrimitives()

// these are pure javascript functions,
// that return values and can
// be debugged normally
rule('jsonEntity', () => {
  return or(
    () => subrule('array'),
    () => subrule('object'),
    () => subrule('atomicEntity')
  )
})

// note how we're defining a pure function
// that calls a parser primitive function
function separatedByCommas(func) {
  const possibleArray = maybeManySeparated(
    func,
    () => consume(Comma),
  )
  // "maybe" functions return undefined if they weren't entered
  return possibleArray !== undefined ? possibleArray : []
}

rule('array', () => {
  consume(LeftBracket)
  const array = separatedByCommas(() => subrule('jsonEntity'))
  consume(RightBracket)
  // this is already an array
  return array
})

rule('object', () => {
  consume(LeftBrace)
  const keyValuePairs = separatedByCommas(() => {
    const key = subrule('jsonKey')
    const entity = subrule('jsonEntity')
    return [key, entity]
  })
  consume(RightBrace)

  // before you ever actually act on any
  // values returned by parsing functions,
  // be sure to quit in case
  // this invocation is in "inspection mode"
  if (quit()) return

  const object = {}
  for (const [key, value] of keyValuePairs) object[key] = value
  return object
})

rule('atomicEntity', () => {
  const entity = or(
    () => consume(Str),
    () => consume(Num),
    () => consume(Primitive),
  )
  if (quit()) return

  const tokenValue = entity.value
  switch (entity.type) {
    case 'Str': return tokenValue
    case 'Num': return parseInt(tokenValue)
    case 'Primitive':
      switch (tokenValue) {
        case 'true': return true
        case 'false': return false
        case 'null': return null
        case 'undefined': return undefined
      }
  }
})

rule('jsonKey', () => {
  const key = consume(Str)
  consume(Colon)
  if (quit()) return
  // value is already a string
  return key.value
})

// very important to always call
miniJsonParser.analyze()

// feed some input into the parser
miniJsonParser.reset(`{
  "stuff": null, "other": [], "things": {}
}`)
// and call a rule on it
// this will act as a top level rule,
// and will error if it doesn't
// consume the entire token stream
const obj = miniJsonParser.jsonEntity()
console.log(obj)

miniJsonParser.reset(`[1, 2, 3, 4]`)
const arr = miniJsonParser.jsonEntity()
console.log(arr)

miniJsonParser.reset(`"various stuff"`)
const str = miniJsonParser.jsonEntity()
console.log(str)

miniJson.reset(`not valid`)
miniJsonParser.jsonEntity()
// => ERROR, expected ... but got ...

miniJson.reset(`["valid", "json"] (not valid extra)`)
miniJsonParser.jsonEntity()
// => ERROR, there are tokens left over in the stream
```
