[Basic Features]
Lexer
- X token categories
-- X compatible with matching
- X token library
- make categories compatible with keywords

Gates
- gate executes in addition to lookahead
- configurable lookahead for individual branching functions

Node Parameters
- all inner functions can accept args

All Node Types
- 0 Or
- MaybeSubrule
- Many
- MaybeMany
- ManySeparated
- MaybeManySeparated
- ManyPadded
- MaybeManyPadded
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
