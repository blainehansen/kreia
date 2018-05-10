Array.prototype.last = function() {
	return this[this.length - 1]
}

Array.prototype.setLast = function(value) {
	this[this.length - 1] = value
}


const util = require('util')
function log(obj) {
	console.log(util.inspect(obj, { depth: null }))
}

const { matchToken } = require('./decision-paths')
const {
	determineDecidingNode, determineRecurringNode, Maybe, Consume, MaybeConsume, Subrule, SubruleNode, MaybeSubruleNode
} = require('./parse-nodes')

const INSPECT = Symbol()

function toArray(item) {
	return item instanceof Array ? item : [item]
}



// this will be to help them know where they are, and how to find the decision path that currently applies to them
class DecisionPathStack {
	constructor() {
		this.subruleStack = []
		this.subruleBranchIndexListStack = []
		this.decisionPathMap = {}
	}

	getCurrentKey() {
		const subruleName = this.subruleStack.last()
		const indexList = this.subruleBranchIndexListStack.last()

		// console.log('getCurrentKey: ', subruleName + '.' + indexList.join('.'))
		return subruleName + '.' + indexList.join('.')
	}


	enterSubrule(subruleName) {
		this.subruleBranchIndexListStack.push([0])
		this.subruleStack.push(subruleName)
	}

	exitSubrule() {
		this.subruleBranchIndexListStack.pop()
		this.subruleStack.pop()
	}

	enterDecision() {
		this.subruleBranchIndexListStack.last().push(0)
	}

	exitDecision() {
		this.subruleBranchIndexListStack.last().pop()
	}

	incrementDecision() {
		const currentIndex = this.subruleBranchIndexListStack.last().last()
		this.subruleBranchIndexListStack.last().setLast(currentIndex + 1)
	}

	// this is used for creating them during inspection
	pushDecisionPath(decisionPath) {
		const currentKeyName = this.getCurrentKey()
		this.decisionPathMap[currentKeyName] = decisionPath
		this.incrementDecision()
	}

	// this is used for getting them again during parsing
	getDecisionPath() {
		const currentKeyName = this.getCurrentKey()
		const decisionPath = this.decisionPathMap[currentKeyName]
		if (!decisionPath) {
			log(currentKeyName)
			log(this.decisionPathMap)
			throw "no decision path was found"
		}

		this.incrementDecision()
		return decisionPath
	}
}



class Parser {
	constructor(lexer, lookahead = 6, ignoreList = []) {
		this.lexer = lexer
		this.lookQueue = []
		this.lookahead = lookahead

		// this.ignoreList = ignoreList

		this.rules = {}
		this.ruleEntryPaths = {}

		// for inspection
		this.inspecting = false
		this.definitionScope = null

		// maps subruleNames to lists of unresolved items
		this.unresolvedSubruleNodes = {}

		this.decisionPathStack = new DecisionPathStack()

		this.currentTokenIndex = 0
	}

	getUnbound() {
		let {
			look, lookRange, rule, subrule, maybe, consume, maybeConsume
		} = this

		look = look.bind(this)
		lookRange = lookRange.bind(this)
		rule = rule.bind(this)
		subrule = subrule.bind(this)
		maybe = maybe.bind(this)
		consume = consume.bind(this)
		maybeConsume = maybeConsume.bind(this)

		return {
			look, lookRange, rule, subrule, maybe, consume, maybeConsume
		}
	}

	reset(inputText) {
		this.lexer.reset(inputText)
		this.lookQueue = []

		// this.decisionPathStack = new DecisionPathStack()

		this.currentTokenIndex = 0
	}

	// this method will primarily be used in the various gates
	look(amount = 1, ignore = null) {
		if (amount <= 0) throw "you can't look a non positive whole number amount"

		// ignore = ignore || this.ignoreList
		let current = amount - this.lookQueue.length
		while (current > 0) {
			this.lookQueue.push(this.lexer.next())
			current--
		}

		return this.lookQueue[amount - 1]
	}

	lookRange(amount) {
		if (amount <= 0) throw "you can't look a non positive whole number amount"

		this.look(amount)
		return this.lookQueue.slice(0, amount)
	}

	advance(amount = 1) {
		if (amount <= 0) throw "advance can't be called with a negative number"

		this.currentTokenIndex += amount

		const nextTokens = this.lookRange(amount)
		this.lookQueue.splice(0, amount)
		return nextTokens
	}

	testLookTokenList(tokenTypeList) {
		const nextTokens = this.lookRange(tokenTypeList.length)
		if (tokenTypeList.every((tokenType, index) => matchToken(nextTokens[index], tokenType))) {
			return nextTokens
		}
		else return false
	}

	testRealTokenList(tokenTypeList, tokenList) {
		return tokenTypeList.every((tokenType, index) => matchToken(tokenList[index], tokenType))
	}

	rule(ruleName, ruleFunction) {
		this[ruleName] = () => {
			const subruleResults = this.subrule(ruleName)

			// this function would be called as a top level rule
			// if there are any tokens still in the output, that's an error
			const remainingQueue = this.lookQueue.filter((token) => token !== undefined)
			if (this.lexer.next() !== undefined || remainingQueue.length != 0) throw "there are still tokens in the output"
			return subruleResults
		}

		// this array represents a list of all definitions in the rule we're about to inspect
		if (this.definitionScope !== null) throw "rule should only be invoked to create rules, and not from other rules"

		const definition = this.definitionScope = []
		// since inspecting is true, all parser primitive functions will push their definitions to definitionScope
		this.inspecting = true
		ruleFunction()
		this.inspecting = false
		this.definitionScope = null

		const subrule = this.rules[ruleName] = new Subrule(definition, ruleName, ruleFunction)

		// log(this.unresolvedSubruleNodes)
		const canResolveSubruleNodes = this.unresolvedSubruleNodes[ruleName] || []
		// log(canResolveSubruleNodes)
		// this will also look at all unresolved subrules and resolve them with this
		for (const subruleNode of canResolveSubruleNodes) {
			// log(subruleNode)
			subruleNode.resolveWith(subrule)
		}

		delete this.unresolvedSubruleNodes[ruleName]
	}

	checkForLeftRecursion(topLevelRule, node) {
		console.log(topLevelRule)
		log(node)

		for (const subNode of node.definition) {
			if (subNode instanceof Consume) return false

			else if (
				(subNode instanceof SubruleNode || subNode instanceof MaybeSubruleNode)
				&& subNode.subrule.ruleName == topLevelRule
			) return true

			else if (
				determineRecurringNode(subNode)
				&& this.checkForLeftRecursion(topLevelRule, subNode)
			) return true
		}

		// if we make it this far, it isn't left recursive
		return false
	}

	analyze() {
		// first check that all subrules could be resolved
		if (Object.keys(this.unresolvedSubruleNodes).length != 0) {
			log(this.unresolvedSubruleNodes)
			throw "there are unresolved subrules"
		}

		// check for left recursion
		for (const [ruleName, rule] of Object.entries(this.rules)) {
			if (this.checkForLeftRecursion(ruleName, rule)) {
				throw `${ruleName} is left recursive`
			}
		}


		// gather decision paths
		for (const [ruleName, rule] of Object.entries(this.rules)) {
			// getting just the entry path for this subrule will be useful, to decide for all future maybeSubrules
			const node = new SubruleNode(rule)
			this.ruleEntryPaths[ruleName] = node.getEntryPath(this.lookahead)

			this.decisionPathStack.enterSubrule(ruleName)
			this.gatherDecisionPathsForNode(node)
			this.decisionPathStack.exitSubrule()
		}

		// log(this.ruleEntryPaths)
		// log(this.decisionPathStack.decisionPathMap)
	}

	gatherDecisionPathsForNode(node) {
		for (const subNode of node.definition) {
			const [isMaybeSubrule, isOneOf] = determineDecidingNode(subNode)

			if (isOneOf) {
				const decisionPath = isMaybeSubrule
					? this.ruleEntryPaths[subNode.subrule.ruleName]
					: subNode.getEntryPath(this.lookahead)

				// after this adds this decision at the right key, it increments the decision number
				this.decisionPathStack.pushDecisionPath(decisionPath)

				// this won't infinitely recurse since we'll reuse the subrule entry paths for maybeSubrules
				if (!isMaybeSubrule) {
					this.decisionPathStack.enterDecision()
					this.gatherDecisionPathsForNode(subNode)
					this.decisionPathStack.exitDecision()
				}
			}
		}
	}

	subrule(ruleName, ...args) {
		const rule = this.rules[ruleName]
		if (this.inspecting) {
			// this.subruleCalls.push(ruleName)

			if (!rule) {
				// this looks to see if the subrule being invoked has already been defined
				// if it hasn't, it adds this name to the set of unresolved
				// we also create an unresolved decision tree and push it both to the current scopes and to the unresolved list
				const unresolvedSubruleNode = new SubruleNode(null)
				this.definitionScope.push(unresolvedSubruleNode)

				const existingUnresolved = this.unresolvedSubruleNodes[ruleName] || []
				existingUnresolved.push(unresolvedSubruleNode)
				this.unresolvedSubruleNodes[ruleName] = existingUnresolved
			}
			else {
				const subruleNode = new SubruleNode(rule)
				this.definitionScope.push(subruleNode)
			}

			return INSPECT
		}

		this.decisionPathStack.enterSubrule(ruleName)
		const ruleReturnValue = rule.ruleFunction(...args)
		this.decisionPathStack.exitSubrule()

		return ruleReturnValue
	}

	// maybeSubrule() {
	// 	// else if (this.gatheringDecisionPaths) {
	// 	// 	const decisionPath = this.ruleEntryPaths[ruleName]
	// 	// 	this.decisionPathStack.pushDecisionPath(decisionPath)
	// 	// }

	// 	throw new Error("Unimplemented")
	// }


	// (gate, def)
	maybe(def) {
		if (this.inspecting) {
			// we have to do whatever is required to move ourselves to the correct point in the stack
			// when we're inspecting we always "enter"

			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			def()
			oldDefinitionScope.push(new Maybe(currentDefinitionScope))
			this.definitionScope = oldDefinitionScope

			return INSPECT
		}

		// we grab the decision path at the right key, and then we increment the decision number
		const decisionPath = this.decisionPathStack.getDecisionPath()

		const nextTokens = this.lookRange(decisionPath.maxLength)
		const remainingTokens = decisionPath.testAgainstTokens(nextTokens)
		// if no tokens were consumed, then that means an EMPTY_BRANCH was taken
		if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			const defResults = def()
			this.decisionPathStack.exitDecision()
			return defResults
		}

		// if we get to this point, no decisions were taken, but this is an always optional rule
	}

	consume(tokenTypeOrArray) {
		const tokenTypeArray = toArray(tokenTypeOrArray)
		if (this.inspecting) {

			this.definitionScope.push(new Consume(tokenTypeArray))
			return INSPECT
		}

		// this can just go ahead and advance then check, since if the match doesn't succeed we'll just error
		const nextTokens = this.advance(tokenTypeArray.length)
		if (this.testRealTokenList(tokenTypeArray, nextTokens)) return nextTokens
		else throw `next tokens didn't match:\n\texpected: ${tokenTypeArray}\n\tfound: ${nextTokens}`
	}

	maybeConsume(tokenTypeOrArray) {
		const tokenTypeArray = toArray(tokenTypeOrArray)
		if (this.inspecting) {
			this.definitionScope.push(new MaybeConsume(tokenTypeArray))
			return INSPECT
		}

		const nextTokens = this.testLookTokenList(tokenTypeArray)
		if (nextTokens !== false) {
			this.advance(tokenTypeArray.length)
			return nextTokens
		}
	}

	// // of the form { gate, def }
	// // or possibly [gate, def]
	// or(...choices) {
	// 	// this one actually has to consume things, using the decision tree created during analysis

	// 	throw new Error("Unimplemented")
	// }

	// maybeOr() {
	// 	throw new Error("Unimplemented")
	// }


	// many(def) {
	// 	throw new Error("Unimplemented")
	// }

	// maybeMany(gate, def) {
	// 	throw new Error("Unimplemented")
	// }


	// manySeparated(def, sep) {
	// 	throw new Error("Unimplemented")
	// }

	// maybeManySeparated(gate, def, sep) {
	// 	throw new Error("Unimplemented")
	// }
}


// const moo = require('moo')
const moo = require('./moo')

const lexer = moo.compile({
	LeftParen: '(',
	RightParen: ')',
	Number: /[0-9]+/,
	Space: / +/,
	Dot: '.',
})

// lexer.reset(" (9) ")
// let token
// while (token = lexer.next()) {
// 	log(token)
// }

// const tok = lexer.tokenLibrary()


class ConcreteParser extends Parser {
	constructor() {
		super(lexer)

		const {
			rule, subrule, maybe, consume, maybeConsume
		} = this.getUnbound()


		// rule('only', () => {
		// 	consume(['Number', 'Dot'])
		// 	maybe(() => {
		// 		consume('Space')
		// 		subrule('other')
		// 		consume('Space')
		// 	})
		// 	consume(['Dot', 'Number'])
		// })

		// rule('other', () => {
		// 	consume('LeftParen')
		// 	maybeConsume('Number')
		// 	consume('RightParen')
		// })


		// this is a left recursive grammar
		rule('A', () => {
			consume('LeftParen')
			maybeConsume('Plus')
			subrule('B')
			// consume('LeftParen')
			// subrule('A')
			// consume('RightParen')
		})

		rule('B', () => {
			maybeConsume('Space')
			subrule('A')
			// maybeConsume('Space')
		})

		this.analyze()
	}
}


const concreteParser = new ConcreteParser()
// concreteParser.reset("1. () .1")
// concreteParser.only()

// concreteParser.reset("1. (4) .1")
// concreteParser.only()

// concreteParser.reset("1..1")
// concreteParser.only()



// // this is a grammar with recursion
// // but it's not left recursion
// // because every time a rule ends up at itself again, the stream has been advanced

// // path from A to B is [LeftParen]
// rule('A', () => {
// 	consume(tok.LeftParen)
// 	subrule('B')
// 	consume(tok.RightParen)
// })

// // path from B to A is [Number, Space]
// // probably we can get away with just incrementing a mandatoryTokenCount. we don't actually need the whole path
// rule('B', () => {
// 	consume(tok.Number)
// 	// there would the mandatory lookahead path of this is the mandatory path to the first optional thing
// 	// here that would ironically involve
// 	option(() => {
// 		consume(tok.Space)
// 		subrule('A')
// 	})
// })

