# Kreia

A flexible and easy to use parser library.

> Peer into chaos, and see order.

---

Kreia makes it effortless to build completely custom lookahead parsers in pure javascript, and all the looking ahead is completely handled for you.

Here's a small example.

```bash
npm install --save-dev kreia
```

```js
const kreia = require('kreia')

// create a parser with a token type definition
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
  return many(() => subrule('parenthesizedNumberList'))
})

rule('parenthesizedNumberList', () => {
  consume(tokenLibrary.LeftParen)
  const list = maybeSubrule('numberList')
  consume(tokenLibrary.RightParen)
  return list
})

// you can define functions that call parser functions
function tokenOr(...tokenTypes) {
  or(
    ...tokenTypes.map(tokenType => () => consume(tokenType))
  )
}
// rules and parsing functions can take arguments
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

Let's look at all the details.


## Lexing

First we need to lex our input string into tokens. Kreia uses an [extended version of moo](https://github.com/blainehansen/moo) to build its internal lexers. To understand all the details of that library, check out that previous link, but here's small example to get you started.

```js
const kreia = require('kreia')

// you can create token categories
const Punctuation = kreia.createTokenCategory('Punctuation')
// you can give categories either one or an array of parent categories
const Paren = kreia.createTokenCategory('Paren', Punctuation)

const Delimiting = kreia.createTokenCategory('Delimiting')
const Literal = kreia.createTokenCategory('Literal')

// create a parser with a token definition
const [parser, tokenLibrary] = kreia.createParser({
  // tokens can be just a regex
  Num: /[0-9]+/,
  // or a literal
  AtSign: '@',
  // or an array of literals
  Equality: ['==', '<=', '>='],

  Whitespace: {
    // if you pass more options to a token rule,
    // pass the basic matching rule as `match`
    match: /\s+/,
    // you can ignore tokens (they'll never show up in the output)
    ignore: true,
    // if the match could include line breaks,
    // you have to say so
    lineBreaks: true
  },

  // the `.` dot regex doesn't match newlines
  // since we're using multiline RegExps
  // so lineBreaks: true isn't necessary here
  Str: { match: /'.+'/ },

  // capturing groups aren't allowed: (match)
  // only non capturing ones: (?:match)
  Str: { match: /'(.+)'/ }, // -> ERROR

  // use the `value` function instead
  Str: { match: /'.+'/, value: x => x.slice(1, -1) },

  // pass one or an array of categories
  Comma: { match: ',', categories: Punctuation },

  // since a Paren is Punctuation, these will both be Punctuation as well
  LeftParen: { match: '(', categories: [Paren, Delimiting] },
  RightParen: { match: ')', categories: [Paren, Delimiting] },

  // order of rule definitions matters
  // the first match will be used
  // so if there's a shorter version of something,
  // then you need to include it in the keywords for a rule
  Identifier: { match: /[a-zA-Z]+/, keywords: {
    ControlFlow: ['while', 'if', 'else'],
    // since keywords have to be literals, pass them as values
    // when you need to pass more options
    BooleanLiteral: { values: ['false', 'true'], categories: Literal },
    ExistenceLiteral: { values: ['undefined', 'null'], categories: Literal },
  }},
})

// now all the token types, including keyword types,
// are inside this tokenLibrary
// you'll pass these types
// or the categories you defined above
// to parsing functions
tokenLibrary.Num
tokenLibrary.Whitespace
tokenLibrary.BooleanLiteral
```


## Parsing

Now that you have a parser instance, you can define your parsing rules. Most of the time you'll want to pull the actual parsing functions out of the parser instance with `parser.getPrimitives()`, so you can call them without referring to the parser instance every time.


```js
const [parser, tokenLibrary] = kreia.createParser({ /* ... */ })

const {
  inspecting, rule, subrule, maybeSubrule, gateSubrule,
  consume, maybeConsume, maybe, or, maybeOr,
  many, maybeMany, manySeparated, maybeManySeparated,
  formatError,
} = parser.getPrimitives()

// rules and parsing functions can take arguments
rule('myRule', (prefix = "") => {
  // the consume and maybeConsume functions
  // take any token type or category
  consume(tokenLibrary.LeftParen)
  const literal = maybeConsume(Identifier)
  consume(tokenLibrary.RightParen)

  if (inspecting()) return

  return prefix + "-" + literal.value
})

parser.analyze()
parser.reset("(identifier)")
parser.myRule("prefix") == "prefix-identifier"
```

For a breakdown of all the available parsing functions, take a look at the [api reference](https://github.com/blainehansen/kreia#api-reference).


## Important Concepts

There are a few important things to understand to use Kreia intelligently.


### Always Analyze

Before you can actually feed the parser any input, the parser needs to run an analysis and prepare all the lookahead information. Just call `parser.analyze()` *after* you've defined all your `rule`s.

If you don't do this, parsing won't actually work.


### Inspection

In order for the parser to know when it needs to look ahead and what it needs to look for, it has to call all your rule functions before parsing actually begins to see what functions they use. This means that before your functions are called to do real work, they'll be called in a fake "inspection mode" where all of the parsing functions (`consume`, `many`, etc), won't return real results. If you try to call functions or access properties of these fake results, bad things will happen.

To avoid this, use the `inspecting` function to determine if you're currently in inspection mode. The simplest way to go about using parse results is to have two stages in your rule functions, a gathering stage and a processing stage.

```js
rule('example', () => {
  // gathering
  const gatheredToken = consume(SomeToken)

  // don't continue if in inspection mode
  if (inspecting()) return

  // processing, doing whatever it is you need to do
  return gatheredToken.value.slice(2)
})
```

It's also **very important** that all the parsing functions you call aren't hidden behind any kind of control flows that won't run in inspection mode. For example, in a rule like this, the subrule call will never be called in inspection mode, and so the parser won't know it exists! That means it won't be able to do any looking ahead at that stage.

```js
rule('example', () => {
  const firstToken = consume(SomeToken)

  // this will never be true in inspection mode
  if (firstToken.value == 'whatever') {
    // so this will never be called in inspection mode!
    subrule('someSubrule')
  }
})
```

It's a much better choice to instead structure your grammar to not need regular control flow, but use the conditional parsing functions.


### First Match is Taken

We'll expand on this idea more in the next section about lookahead distances, but when defining `or()` rules, the first one that matches based on its lookahead distance will be taken, even if another rule matches *better*. Always put longer or more specific rules first in `or`'s.


### Lookahead Distances

Consider a rule like this:

```js
rule('myRule', () => {
  consume(LeftParen)
  maybeMany(() => {
    consume(Num)
  })
  consume(RightParen)
})
```

At the `maybeMany`, how does the parser decide whether to take that path? And how does it decide whether to continue taking it once it already has? The simple answer is by looking ahead at the tokens and seeing if they match. So when the parser gets to that `maybeMany`, it grabs an internal structure called a `DecisionPath` that was built when you called `analyze`, and uses it to decide whether to take the path, and then whether to continue taking it.

When you create a parser, you can pass a default lookahead distance that will be used for all decision points if you don't give them a specific number. Kreia's default is `3`. The size of the `DecisionPath`'s is decided by the lookahead distance of the rule they're deciding for.

`DecisionPath`'s are created by walking along the rules you've defined, taking note of what tokens are consumed, and creating new branches when things are optional or have multiple choices. The analyze process will continue walking along the rules, even recursively entering other rules, until it's noted enough mandatory token consumptions to use up the whole lookahead distance. Optional token consumptions don't use up the lookahead distance at all.

Here's an example of a place where you might want to pass a longer distance.

```js
// an or() call requires a DecisionPath
// to decide which path to take
// so we'll begin walking the rules,
// starting with a lookahead of 3
or(
  () => {
    // optional, so it won't use up the lookahead
    maybeConsume(Dash)
    // these three tokens are mandatory,
    // so the lookahead distance is used up.
    // the DecisionPath will stop here...
    consume(LeftParen, Num, RightParen)
    maybeConsume(Dash)
    // and it won't take note of this!
    consume(ExclamationPoint)
  },
  () => {
    maybeConsume(Underscore)
    // the DecisionPath will also stop here!
    consume(LeftParen, Num, RightParen)
    maybeConsume(Underscore)
    // and it won't take note of this!
    consume(AtSymbol)
  },
)
```

Even though those two `or()` choices are quite different from each other, they could theoretically start with the exact same tokens, `LeftParen, Num, RightParen`. This means that in situations where the difference between them is clear, they'll parse correctly (`-(4)-!` vs `_(4)_@`), but in others they won't (`(4)!` will accidentally work because it's the first choice, but `(4)@` will throw an error saying it expects an exclamation point!).

The easy solution is to give the rules a longer lookahead distance, so they'll be able to see the difference.

```js
or(
  {
    lookahead: 4,
    func: () => {
      maybeConsume(Dash)
      // uses up 3...
      consume(LeftParen, Num, RightParen)
      maybeConsume(Dash)
      // and uses up the last to make 4
      consume(ExclamationPoint)
    }
  },
  // we actually don't have to bother giving this
  // a longer lookahead, since the problem was the first rule
  // being entered too eagerly.
  // now that won't happen
  () => {
    maybeConsume(Underscore)
    consume(LeftParen, Num, RightParen)
    maybeConsume(Underscore)
    consume(AtSymbol)
  },
)
```

In general you should try to structure your grammar so that these kinds of ambiguities don't happen, but this option is always there if you need it.

#### Performance and Lookahead Distances

The longer your lookahead distances are, the longer everything in general will take. Matching will take longer, analysis will take longer, decision paths will take up more memory since they'll be longer and possibly have more branches, etc. This can especially be true if your grammar has lots of nested optional rules, since those don't count towards lookahead distances.

The default distance of `3` was chosen since it seemed like a good balance between too short and too long, and since the out-of-the-box behavior should probably prefer easy usage over performance. But different grammars will have different characteristics. If your grammar is very concrete and has little ambiguity between choices, you can probably pass a smaller default distance and pass longer ones as needed to tricky rules.

Some more things to consider:

* If a decision point is very unambiguous, you can pass a *smaller* distance to just that rule to improve its performance. A perfect example is an `or()` where all the choices start with completely different mandatory tokens.
* If a decision point is small enough that the entire thing can be walked before the lookahead distance is worn out, then it won't matter how long the lookahead distance is. The `DecisionPath` will always stop once it's walked through the whole thing.


### Gates

Gates are tools that you should almost never use, since structuring your grammar differently is almost always a better, clearer, and more maintainable choice. But the functionality is easy to add, and in some situations can be the only way to solve a problem. If you have an instinct to use gates, first ask yourself if there's *any* other way to achieve what you're trying to. If there is an even somewhat acceptable path forward, you should prefer that.


Every parsing function has a `gate` version that you can think of as an extension of the `maybe` version. You pass a gate function to the parsing function, and that rule will only be entered if both the gate returns a truthy value *and* the normal lookahead process matches.

The `or` function can also accept gates for its individual options, and this is probably the only place where using gates is somewhat reasonable.

Here's a very contrived example:

```js
rule("needGate", (mode) => {
  or(
    {
      // this option will only be taken
      // if the next token is an AngryToken
      // and we're in angry mode
      gate: () => mode == 'angry',
      func: () => consume(AngryToken)
    },
    {
      // similar to above
      gate: () => mode == 'happy',
      func: () => consume(HappyToken)
    },
    // not every choice needs to be given a gate
    () => consume(NeutralToken)
  )
})
```

Even the above example would be better served by instead using the mode to process a general token differently, so here's an example of a way to achieve the same thing without using gates.

```js
rule("noGate", (mode) => {
  // EmotionalToken is a category
  const token = consume(EmotionalToken)

  if (inspecting()) return

  if (matchToken(token, AngryToken) && mode != 'angry') {
    throw createError("expected angry")
  }
  if (matchToken(token, HappyToken) && mode != 'happy') {
    throw createError("expected happy")
  }

  return token
})
```

And of course, an *even beter* way to achieve this is to use the fact that we can use normal javascript functions to build up many rules for us programatically:

```js
function makeModeRule(mode) {
  rule(`${mode}Rule`, () => consume(modeTokenMap[mode]))
}

for (const mode of ['happy', 'angry', 'neutral']) {
  makeModeRule(mode)
}

parser.reset(/* ... */)
parser.happyRule() // => ...
```

The point is, you have options, and you should prefer the ones that are more predictable.


## Putting it all together

Here's a fuller example with explanations, a simple json parser that actually uses the parse results to return a javascript entity.

```js
const kreia = require('kreia')

// This first builds a lexer.
// Then it creates a parser that uses that lexer.
// createStatesParser() (that uses moo.states) is also available
const [miniJsonParser, tokenLibrary] = kreia.createParser({
  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
  Colon: ':',
  Comma: ',',
  LeftBrace: '{',
  RightBrace: '}',
  LeftBracket: '[',
  RightBracket: ']',
  Num: /[0-9]+/,
  Primitive: ['null', 'undefined', 'true', 'false'],
  Str: { match: /"(?:\\["\\]|[^\n"\\])*"/, value: x => x.slice(1, -1) },
}, 1)
// since this grammar is so simple and so deterministic,
// we can give it a default lookahead distance of 1!
// and we never have to give any rules a longer distance

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
  inspecting
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
// that calls parser primitive functions
function separatedByCommas(func) {
  return maybeManySeparated(
    func,
    () => consume(Comma),
  )
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
  // be sure to inspecting in case
  // the parser's in "inspection mode"
  if (inspecting()) return

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
  if (inspecting()) return

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
  if (inspecting()) return
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


## Api Reference

### Library Functions Reference

* `[parserInstance, tokenLibrary] = kreia.createParser(lexerDefinition, defaultLookahead = 3)`: creates a parser instance with a default lookahead distance, and an internal lexer based on the definition.

* `[parserInstance, tokenLibrary] = kreia.createStatesParser(lexerDefinition, defaultLookahead = 3)`: same as `createParser`, except that the internal lexer [is state aware](https://github.com/blainehansen/moo#states).

* `kreia.lexingError`: passed along [`moo.error`](https://github.com/blainehansen/moo#errors).

* `CategoryObject = kreia.createTokenCategory(categoryName, ...parentCategories)`: creates a token category with one or more parents.

* `Boolean = kreia.matchToken(tokenToTest, tokenTypeOrCategory)`: tests if a token matches the type or category.
* `Boolean = kreia.matchTokens(arrayOfTokensToTest, arrayOfTokenTypesOrCategories)`: tests if an array of tokens matches all of the types or categories. The `arrayOfTokensToTest` must be as long or longer than the `arrayOfTokenTypesOrCategories`.


### Parser Functions Reference

**unbound functions**

These functions are called directly on the parser instance.

* `PrimitivesObject = parser.getPrimitives()`: gives you all the functions in the "bound functions" section, all of which are bound to the parser instance.
* `parser.analyze()`: performs the internal analysis of your parsing rules. Call this function *after* all your rules have been defined, and *before* you in feed any input and call any top level parsing functions.
* `parser.reset(inputText)`: feeds input into the parser.

* `parser.look(distance = 1)`: get the single token that is `distance` tokens up the token stream. Will return `undefined` if that distance is past the end of the input. You can think of this as a one-indexed accessor into the token stream array. You almost certainly won't need to use this.
* `parser.lookRange(distance)`: get an array length `distance` containing all the tokens from the current position in the stream to `distance`, inclusive. You almost certainly won't need to use this.


**bound functions**

These functions are returned from `parser.getPrimitives()`, bound to the parser instance, so you can call them unattached.

* `Boolean = inspecting()`: tells you if the parser is currently in inspection mode.

* `String = formatError(token, message)`: pass along of [`moo.formatError`](https://github.com/blainehansen/moo#formatting-errors).
* `Error = createError(token, message)`: a convenience wrapper of `formatError` that creates a `new Error` for you to throw.

* `rule(ruleName, ruleFunction, lookahead = parser.defaultLookahead)`: define a parsing rule. The rule can take arguments, and you can pass a lookahead that will be used to create the `DecisionPath` used in `maybeSubrule` calls.

* `subrule(ruleName, ...args)`: call a rule from within another rule. Here is where you can pass arguments that rule functions take. If the next tokens of input don't match this rule, it will throw an error.
* `maybeSubrule(ruleName, ...args)`: same as `subrule`, except that it's optional.
* `gateSubrule(gateFunction, ruleName, ...args)`: just like `maybeSubrule`, except you can pass a `gateFunction` that has to return a truthy value in order for the rule to be taken. The normal lookahead matching has to pass as well.

* `consume(...tokenTypeArray)`: consume one or more tokens from the token stream. If the input doesn't match, it will throw an error.
* `maybeConsume(...tokenTypeArray)`: same as `consume`, except that it's optional.
* `gateConsume(gateFunction, ...tokenTypeArray)`: same as `maybeConsume`, but with a gate.

* `maybe(def, ...args)`: optionally calls a function of parse rules. The `def` can be a function or an object with a `func` and `lookahead`.
* `gate(gateFunction, def, ...args)`: just like `maybe`, except you can pass a `gateFunction` that has to return a truthy value in order for the rule to be taken. The normal lookahead matching has to pass as well.

* `or(...choices)`: chooses one of several options, one of which must match or an error will be thrown. Each choice can be a function or an object with `func`, `lookahead`, `gate`, and `args` properties.
* `maybeOr(...choices)`: same as `or` but optional, so if no choices match no error will throw.
* `gateOr(gateFunction, ...choices)`: same as `maybeOr`, but with a gate.

* `many(def, ...args)`: parses at least one of the given `def`. The `def` can be a function or an object with a `func` and `lookahead`.
* `maybeMany(def, ...args)`: same as `many`, but optional, so it parses zero or more.
* `gateMany(gateFunction, def, ...args)`: same as `maybeMany`, but takes a gate.

* `manySeparated(def, sep, ...args)`: parses at least one `def`, or multiple `def`s separated by `sep`. Both `def` and `sep` can be a function or an object with a `func`, `lookahead`, and args. If you pass `...args`, they will be given to `def`, and you can only use either `...args` or the `args` options on the `def` and `sep` objects you pass, not both at the same time.
* `maybeManySeparated(def, sep, ...args)`: same as `manySeparated` but optional, so it parses zero or more.
* `gateManySeparated(gateFunction, def, sep, ...args)`: same as `maybeManySeparated`, but takes a gate.


## Contributing

This package has testing set up with [mocha](https://mochajs.org/) and [chai expect](http://chaijs.com/api/bdd/).

If you'd like to contribute, perhaps because you uncovered a bug or would like to add features:

- fork the project
- clone it locally
- write tests to either to reveal the bug you've discovered or cover the features you're adding (write them in the `test` directory, and take a look at existing tests as well as the mocha, chai expect, and vue testing docs to understand how)
- run those tests with `npm test` (use `npm test -- -g "text matching test description"` to only run particular tests)
- once you're done with development and all tests are passing (including the old ones), submit a pull request!
