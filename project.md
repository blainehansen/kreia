Considering a "mode" function, that based on input tries to choose different options

```js
mode(mode, modeOptions) {
	oneMode() {},
	twoMode() {},
	// ...
}
```


[Basic Features]
Lexer
- X token categories
-- X compatible with matching
- X token library
- X make categories compatible with keywords

Gates
- gate executes in addition to lookahead
- configurable lookahead for individual branching functions

Node Parameters
- all inner functions can accept args

All Node Types
- X Or
- X MaybeSubrule
- X Many
- X MaybeMany
- X ManySeparated
- X MaybeManySeparated
- X ManyPadded
- X MaybeManyPadded
- ManyPossiblyPadded?
- MaybeManyPossiblyPadded?

[Fancy Features]
Static Javascript Parser Codegen
Specialized Grammar Language
Parse Tree Visitor
Arbitrary Language Parser Codegen




Left Recursion Detection
- X done

Token Ignore Lists
ditched in favor of encouraging just writing "macros" that abstract over commonly ignored tokens
