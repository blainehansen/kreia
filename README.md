# :warning: this repo is dormant for now :warning:

I might return to it some day, but don't hold your breath!

Feel free to check out the rough unfinished documentation below.

---

# Kreia

An powerful, flexible, and type safe parser generator.

> Peer into chaos, and see order.

Kreia is a grammar definition language a lot like pegjs or antlr, but with some added conveniences. Kreia completely separates the details of your grammar from your domain logic.

Here are some of the neat features:

- Convenient ways to define terminal regexes.
- Macros that allow you to conveniently reuse common grammar patterns.
- Domain logic is completely separate from the grammar definition.
- All grammar branching/decision point calculations are handled by the compiler.
<!-- - Can express any context-free language, and even some context-sensitive ones!  -->
- Powerful (but optional) `VirtualLexer` system that can be used for complex context-sensitive concepts.

Here's a tiny example of a naive arithmetic expression grammar (could parse something like `1 + (5 - 3 * 2) / (4 * 3)`)

```kreia
// first we define our tokens,
// the "terminals" of the grammar

:open_paren = '('
:close_paren = ')'

// "Or" branching with |
:operator = '+' | '-' | '*' | '/'

// kreia supports the EBNF modifiers +, *, and ?
:number = [0-9]+ ('.' [0-9]+)?

// adding the _ before the = makes this an "ignored" token
// # refers to a built-in character class
:whitespace _= #whitespace+
// equivalent to this:
// :whitespace _= [\t\n\v\f\r ]+

// now our actual grammar rules

// kreia is whitespace sensitive,
// so grammar rules can begin/end with an indent/deindent

// | makes these branches of an "Or"
// an expression_atom can be either of these two possibilities
expression_atom =
  | :number
  | :open_paren expression :close_paren

// rules can be defined on a single line if you want
expression = @many_separated[expression_atom, :operator]
// here we're using the built-in macro `many_separated`
// which is equivalent to this:
// expression_atom (:operator expression_atom)*
```

A kreia grammar compiles to a typescript file with empty functions corresponding to each of your grammar rules, ready for you to fill in with your domain logic. The above grammar would compile to something like this:

```ts
// we imports some basics from the kreia runtime
import { Parser, ParseArg, Decidable, path, branch, c } from "kreia"

// then the token definitions are used to create a lexer/parser which is enclosed inside these runtime parsing functions
export const { tok, reset, lock, consume, maybe, or, maybe_or, many_or, maybe_many_or, many, maybe_many, exit } = Parser({
  open_paren = /\(/,
  close_paren = /\)/,
  operator = /\+|-|\*|\//,
  number = /[0-9]+(?:\.[0-9]+)?/,
  whitespace: { regex: /(?:[\t\n\v\f\r ])+/, ignore: true },
}, {})

// these are "Decidable"s that have been calculated for you,
// they're used to for lookahead at decision points in the grammar
const { _1, _2 } = {
  _1: path([tok.open_paren]),
  _2: path([tok.operator]),
}

// grammar rules are just output as functions
export function expression_atom() {
  // the `or` parsing function takes many choices
  or(
    // which are wrapped with the c function for type safety
    c(tok.number),
    c(() => {
      consume(tok.open_paren)
      expression()
      consume(tok.close_paren)
    }, _1),
    // here we see the _1 decidable being used
    // to help `or` know whether to choose this branch
  )
}

export function expression() {
  // since macros are generic in what actual items they parse
  // they need their Decidables passed to them
  many_separated(
    expression_atom,
    () => { consume(tok.operator) },
    _2,
  )
}

// all macros defined in the grammar are also output as functions
// that take other parsing functions as arguments
function many_separated<BODY extends ParseArg, SEPARATOR extends ParseArg>(
  body: BODY, separator: SEPARATOR, _d1: Decidable,
) {
  body()
  maybe_many(() => {
    separator()
    body()
  }, _d1)
}
```

You can probably see that in a large grammar with many complex decision points, using Kreia is a very helpful choice.

The goals and values of this project:

- Give language communities an expressive way to canonically represent a grammar to allow easy reuse.
- Completely separate the domain logic of a parser away from all details of the actual parsing.
- Be as robustly type safe as possible.

Because Kreia separates parsing from the actual logic, it's an ideal tool to use for languages that might have multiple consumers or be used in multiple contexts. The grammar definition outputs a blank parser very similar to what someone might write by hand, which merely needs to be filled in with the domain logic.

## Tutorial

Kreia has two main components:

- The grammar definition language.
- The runtime.

### Grammar definition language

#### **Token Definitions**

Tokens can be defined with combinations of strings, character classes, and references to other tokens.

```kreia
// EBNF modifiers (+, *, ?) are allowed
:space = ' '+
// double quotes are equivalent to single quotes
// :space = " "+

// ranges are allowed in character classes
:num = [0-9]+

// character classes (and only character classes)
// can be negated
:not_space = ^[ ]
:not_whitespace = ^#whitespace

// _= makes the token "ignored"
// here any :comma encountered will just be thrown away
// will never be output
// however, if you explicitly ask for it, it will be required
:comma _= ','

// unicode points can be used
:unicode_thing = [\u{AA}-\u{FF}]

// you can use multiple lines
:number =
  '-'?
  // you can reuse other tokens
  | :num ('.' :num)?
  | '.' :num

:unit_number = :number ('mm' | 'in')
```

#### **Macros**

Macros are essentially functions that take parsing rules as variables.

```kreia
// here is a macro definition
// [] wraps variable names that are prefixed with $
@enclosed[$opener, $body, $closer] =
  // then those arguments can be used just like any other item
  $opener
  // other macros can be used within macros
  @many_separated[$body, :comma]?
  $closer

some_rule =
  // when you use a macro, pass your comma separated list of items within []
  // your passed args can be complex and consist of more than one item
  @enclosed[:open_paren, :ident :colon some_other_rule, :close_paren]

  // you can even use macro calls as *variables* to other macros
  @enclosed[:arrow, @many_separated[some_expression, :space], :semi_colon]
```

#### **Lockers**

Some grammars require some token to match *exactly* in multiple places. A simple example is [rust raw strings](https://rahul-thakoor.github.io/rust-raw-string-literals/):

```rust
// this can enclose anything that doesn't contain "#
let one_pound = r#" Here's a string in a string: "hello #world" "#;
// this can enclose anything that doesn't contain "##
let two_pound = r##"
  This can contain `one_pound`
  r#" Here's a string in a string: "hello #world" "#
"##;
// etc.
```

Situations like this where the *contents* of a token match have to repeat, not just the token in general, can be solved in kreia with "lockers".

A rule can specify any amount of lockers, which are given names prefixed with '!' and assigned to actual token definitions.

```kreia
:r_letter = 'r'
:quote = '"'
:pound = '#'+
:not_quote_pound = ^["#]+
raw_string<!pounds = :pound> =
  // after the !pounds locker matches for the first time,
  // it "locks" that content and won't match on anything that isn't exactly the same
  :r_letter !pounds :quote
  (
    | :not_quote_pound
    | :quote
    | :pound
  )*~
  // the ~ modifier makes something non-greedy
  // essentially whether it continues will depend on whether
  // the next thing after it could match
  :quote !pounds
```

#### **Syntax**

Kreia is a whitespace sensitive language, so indentation and line breaks are meaningful.

```kreia
// anything wrapped in tokens like () or <>
// can either use commas or newlines to separate the items, but not both
// and either all items should be on indented lines, or none of them

// ✔️ this is valid
my_rule<!a = :i, !b = :i, !c = :i, !d = :i> = ...

// ✔️ so is this
my_rule<
  !a = :i
  !b = :i
  !c = :i
  !d = :i
> = ...

// ✔️ and this
my_rule<
  !a = :i, !b = :i
  !c = :i, !d = :i
> = ...

// ❌ but not this
my_rule<
  !a = :i, !b = :i, // <- extra comma!
  !c = :i, !d = :i, // <- extra comma!
> = ...

// ❌ or this
my_rule<!a = :i // <- either all items should be on indented lines, or none of them
  !b = :i !c = :i, !d = :i
> = ...
```


Modifiers can either be placed right after an atom (`:thing? thing+ (multiple things)*`) or at the beginning of a line to mark an entire line or block with that modifier.

```kreia
my_rule =
  // at least one :thing followed by a colon
  + :thing :colon

  // maybe this entire block
  ?
    other_rule :some_token
    :another_token*
    ending_rule
```

#### **Virtual Lexers**

Sometimes a grammar has complex token concepts that can only be properly done with some custom code, typically to maintain some state. An easy example is a whitespace sensitive language, which needs to maintain state about the program's current indentation level in order to output indents and deindents.

Kreia allows grammars to connect to `VirtualLexer`s in order to provide these complex tokens.

Here's an example of what that looks like in the grammar itself:

```kreia
// this is a virtual lexer useage
// a path is given to a code file
// and the lexer exposes some "virtual" tokens
// these virtual tokens might not have any content when matched
// but merely be semantic markers
{ :indent, :deindent, :indent_continue } = use './IndentationLexer'

// these tokens can be used normally in the rest of the grammar
@indented_block[$line_body] =
  :indent
  @many_separated[$line_body, :indent_continue]
  :deindent
```

In the typescript implementation, a virtual lexer consists of these two types:

```ts
// virtual lexers have a generic state `S`
// but they don't maintain it themselves
// the parent Lexer holds the state
// and passes it to the `request` function
export type VirtualLexer<S> = Readonly<{
  // initializes the state at the beginning of parsing
  initialize(): S,

  // called by the parent Lexer
  request(
    // one of the `VirtualTokenDefinition`s exposed by the `VirtualLexer`
    // that the parent `Lexer` is requesting
    virtual_token: VirtualTokenDefinition,
    // this is the state it wants us to match `virtual_token` with
    state: S,
    // this is the state of the input source string
    source_state: SourceState,
    // this is the file we're working with
    file: SourceFile,
  ): [HiddenToken[], VirtualToken, S, SourceState] | undefined,
  // we can return a tuple on success
  // or undefined on failure

  // a `VirtualLexer` can also expose `ExposedRawTokenDefinition` that aren't virtual and do have content
  // whenever one of those is encountered by the parent Lexer,
  // it can notify us in case we want to change our state in response
  notify(token: RawToken, state: S): S,
}>;

// the actual export used by grammars is a function
// that returns a tuple of a dictionary of the exposed tokens
// and the virtual lexer object itself
export type VirtualLexerCreator<S, T extends Dict<ExposedRawTokenDefinition | VirtualTokenDefinition>, A extends any[]> =
  (...args: A) => [T, VirtualLexer<S>];
```





### Runtime

The best way to understand the runtime is to look at its API given below. However, there are a few important concepts you should be aware of.

#### First matching choice wins.

#### Decidables calculated based on differences from other options.

#### Greedy rule tails.


## Grammar Requirements

There are certain conditions that make analyzing a grammar either dangerous or impossible that you need to avoid when working with Kreia.

### Left Recursion

If a rule could potentially call itself recursively without consuming anything from the source, that's a condition that will often result in infinite recursion. This can happen when the recursive call is either the first thing in the rule (duh), or if the only things that happen before the recursive call are all optional. Thankfully Kreia analyzes the grammar to catch these situations and fail with a helpful error message.

```kreia
// ❌ an obviously bad example
my_rule =
  my_rule
  // it doesn't matter what happens after the recursive call
  // since we'll get caught in infinite recursion first

// ❌ a more subtle bad example
my_rule =
  ?
    | something | something_else
    | :some_token
  (:a :b :c)*
  // other things happen before the recursive call
  // but they're optional, so *sometimes* this will infinitely recurse
  my_rule

// ❌ "indirect" left recursion is also possible
// "a" isn't left recursive,
// but it could result in a nested left recursive call
// Kreia can catch situations like this as well
a = b
b = c
c = b
```

Make sure you design your grammar so that some mandatory thing always precedes a recursive call.

Macros can also be recursive and are checked for left recursion.


### All optional sequences

It doesn't make a lot of sense to make a rule or macro or other enclosed sequence where all the items are optional.

```kreia
// this rule can end up matching *nothing*
// which really makes modifying this rule with ? or * confusing doesn't it?
// this seems like a grammar that needs to be redesigned,
// and might even represent a simple accident by the programmer
// ❌ Kreia will reject rules like this with an error
my_rule = thing? something*

// ❌ the same will be done for macros
@my_macro[$var] = $var?

// ❌ or a branch of a choice
my_rule =
  | something?
  | other

// ❌ or the contents of a block or parentheses
my_rule =
  (thing? something*)+
  +
    thing? something*

// ❌ or a variable given to a macro
my_rule = @many_separated[something, :some_token?]
```

All of these situations should be redesigned to either use ignored tokens, or moving modifiers farther up the rule tree, or making alternations where things trade being optional, such as this:

```kreia
// now we have something much like `thing? something*`
// but without the confusion and ambiguity
my_rule =
  | thing something*
  | thing? something+
```

### Ambiguous many against many

At every point in the grammar where a decision has to be made, the Kreia compiler has to figure out the lookahead sequence for each option. These decision points happen anywhere there's an alternation or modifiers (`|`, `+`, `*`, `?`). In order to know whether to go down a particular path, Kreia needs to look at the other current options and make a lookahead sequence that disambiguates the current path from the others.

Sometimes this is easy:

```kreia
my_rule =
  // to know whether to proceed with `:a :b`
  // we just have to compare `:a :b` against `:c :d`
  // and those paths have no overlap,
  // so the lookahead sequence is just `:a`
  (:a :b)?
  :c :d
```

Other times it isn't easy, but it's still possible:

```kreia
my_rule =
  // these completely overlap,
  // but if the entire sequence `:a :b :c` matches
  // we should consume it
  (:a :b :c)?
  (:a :b :c :d)+
```

But other times, it isn't possible to generate a static lookahead sequence:

```kreia
my_rule =
  // this is a completely ambiguous situation
  // and the `:a :b :c :d` will never be successfully matched
  // since the `:a :b :c` sequence will always consume the first three tokens
  // and leave only an unmatched and now invalid `:d` behind
  (:a :b :c)+
  (:a :b :c :d)+
```

The Kreia compiler can detect these situations where a repeating sequence is being compared against a repeating sequence in an ambiguous way (ambiguous many against many), and will reject that grammar.

### Ambiguous recursion

This is the only condition that Kreia currently can't detect, where the grammar isn't left recursive, but is ambiguous in a recursive way.

What does ambiguity mean? Consider the following rule:

```kreia
my_rule =
  (a b c)?
  ()
```


## Why not X?

## API


## v1.0.0 roadmap

## Wishlist

- Allow support for "arbitrary lookahead" rules.
- Detect recursive ambiguity.
- Make macro arg passing more syntactically clear and flexible.
- An "until" modifier, that requires something *until* the modifier rule matches.
