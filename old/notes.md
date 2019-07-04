we enter A
we log subrule calls to B and A
the call to B is the dangerous one
A isn't definitely safe, so we add it to unknown

we enter B
B isn't definitely safe, so we add it to unknown






two matrices,
one to log "availability" (can we get from here to there)
one to log "subrules" (these subrules are called in this rule)

a set to log "non-safe" rules
a rule is safe if it either must consume a token before it calls any subrules, or if the first subrule it calls is safe


a rule is "left-recurse safe" if it has a mandatory token path before *any* of it's subrule calls
there's left recursion for a rule if it's non-safe and calls into a chain of non-safe rules which end up calling it



```js
class SymmetricMatrix {
  constructor() {
    // this will be an object of objects
    // the pairs will be rowName: { columnName: paths }
    this.columnNames = []
    this.rows = {}
  }

  addDomain(name) {
    this.columnNames.push(name)

    const rowObject = {}
    for (columnName in columnNames) {
      rowObject[columnName] = []
    }

    this.rows[name] = rowObject
  }
}
```



```js
class ParseNodeStack {
  constructor(lookahead) {
    this.stack = []
    this.indexStack = []
    this.lookahead = lookahead
  }

  increment() {
    const currentIndex = this.indexStack.last()
    this.indexStack.setLast(currentIndex + 1)
  }

  getCurrentNode() {
    return this.stack.last().definition[this.indexStack.last()]
  }

  getDecisionPath() {
    const currentNode = this.getCurrentNode()
    if (!currentNode.optional) throw "tried to get decisionPaths for a non optional node"

    return currentNode.getInlineEntryPath(this.lookahead)
  }

  push(parseNode) {
    this.stack.push(parseNode)
    this.indexStack.push(0)
  }

  pop() {
    this.indexStack.pop()
    return this.stack.pop()
  }

  enter() {
    this.push(this.getCurrentNode())
  }

  exit() {
    this.pop()
    this.increment()
  }
}
```



```js
function combinePaths(firstGroup, secondGroup) {
  if (firstGroup.length == 0) return secondGroup
  if (secondGroup.length == 0) return firstGroup

  const finalSet = []
  for (const firstGroupItem of firstGroup) {
    for (const secondGroupItem of secondGroup) {
      finalSet.push(firstGroupItem.concat(secondGroupItem))
    }
  }

  return finalSet
}
```



when we enter a rule, we begin building up a "mandatory token path", a list of tokens that must have been consumed up until this point in the rule
when we encounter a subrule
we log an entry in subrule matrix from rule to subrule,
then in the availability matrix, we switch on all the subrules that the subrule we're looking at calls, and all that those call, etc, until either we get to the end of the tree or all our columns are true



what we really want to know is all the subrules that will definitely consume something both before they call any other subrules, and that will definitely consume something *at all*

in the case that it doesn't consume something before calling a subrule, if that subrule could end up back where we started then it's a danger
in the case that it doesn't consume anything at all, then we need to check



a queue
as we're going through the first time, we push all rules that don't have a mandatory path into a queue. this queue is "unknown"

all rules that have a mandatory path are added to safe, or that don't call any subrules
however, if a rule calls a subrule that might not consume anything but that also doesn't call any subrules, we have to check the *next* subrule

we also have sets that are "safe" and "unsafe"
unsafe doesn't mean it's left recursive, simply that it could contribute to a left-recursive chain

a rule is safe if the first subrule it calls is safe

we pull a rule off the queue



put all "unknown" subrules into queue, with a list of their subrule calls in order



recursion that doesn't have a base case because of no optional-ness would simply fail, because it would be looking for something that doesn't exist


if we create an "ast" node class that enables them to very simply wrap the real stuff they're doing, it can have embedded methods that allow us to act on values that might be fake
then they don't have to pass their own stuff around
we can completely proxy unknown keys to allow them to basically have a real value inside they can interact with as normal, except we can intercept things to ensure it stays safe and error free during inspection


both tokens and this "ast wrapper" should have an act method that allows us to do stuff to it in a way that's agnostic of if it's real or not


this needs to create grammars that:
don't have left recursion (infinite)
don't have ambiguous points
and obviously everything needs to be valid

a rule that has a mandatory token path before it calls any subrules can't possibly introduce left recursion, since every time this rule leads to another it will have advanced the stream




to detect left recursion:
for all rules that call a subrule that could in turn call this rule
we need to know that the path from the subrule call to the recursive call has at least one mandatory token consumption

for each rule, we can log the mandatory token path from the rule call to the subrule call
with those paths we can construct what the recursive path is

so each rule has a set of dependents, rules that it calls as a subrule
since a subrule will call it's subrules, then if a rule depends on a rule it also depends on all the things it depends on


as we go through the rule definitions, as each rule calls a subrule, we register that subrule as a dependent of this rule, and also tag this rule as requiring all the dependents of all that subrule
basically since subrules might not have been processed yet, or all of their subrules might not have been processed yet (or in other words they're not resolved yet), then as we resolve further we need to be able to look back and inject everything as we go




similarly, every rule has a "mandatory starting" path
we can use that to help us with automatic lookahead

```js
Array.prototype.maxLength = function() {
 return Math.max.apply(null, this.map((item) => item.length))
}

Array.prototype.minLength = function() {
 return Math.min.apply(null, this.map((item) => item.length))
}
```


```js
const dependencyTable = {
  ruleName: {
    // dependency set
    dependencies: new Set(),

    // possibly nested under 'subrules'?
    subruleName: {
      // this is the path from the rule to this subrule definition
      path: [mandatoryToken, mandatoryToken]
    }
  }
}
```






