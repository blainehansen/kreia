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
	isDecidingNode, isRecurringNode, Maybe, Consume, Subrule, SubruleNode, Or, Many, ManySeparated
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
		// console.log('before enterDecision: ', this.subruleBranchIndexListStack)
		this.subruleBranchIndexListStack.last().push(0)
		// console.log('after enterDecision: ', this.subruleBranchIndexListStack)
	}

	exitDecision() {
		this.subruleBranchIndexListStack.last().pop()
	}

	incrementDecision() {
		const currentIndex = this.subruleBranchIndexListStack.last().last()
		this.subruleBranchIndexListStack.last().setLast(currentIndex + 1)
	}

	resetDecision() {
		this.subruleBranchIndexListStack.last().setLast(0)
	}

	setDecision(decisionNumber) {
		this.subruleBranchIndexListStack.last().setLast(decisionNumber)
	}

	// this is used for creating them during inspection
	pushDecisionPath(decisionPath) {
		const currentKeyName = this.getCurrentKey()
		this.decisionPathMap[currentKeyName] = decisionPath
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

		return decisionPath
	}
}



class Parser {
	constructor(lexer, lookahead = 6) {
		this.lexer = lexer
		this.lookQueue = []
		this.lookahead = lookahead

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

	getFunctions() {
		let {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
		} = this

		look = look.bind(this)
		lookRange = lookRange.bind(this)
		rule = rule.bind(this)
		subrule = subrule.bind(this)
		maybeSubrule = maybeSubrule.bind(this)
		maybe = maybe.bind(this)
		consume = consume.bind(this)
		maybeConsume = maybeConsume.bind(this)
		or = or.bind(this)
		maybeOr = maybeOr.bind(this)
		many = many.bind(this)
		maybeMany = maybeMany.bind(this)
		manySeparated = manySeparated.bind(this)
		maybeManySeparated = maybeManySeparated.bind(this)

		return {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
		}
	}

	reset(inputText) {
		this.lexer.reset(inputText)
		this.lookQueue = []

		// this.decisionPathStack = new DecisionPathStack()

		this.currentTokenIndex = 0
	}

	// this method will primarily be used in the various gates
	look(amount = 1) {
		if (amount <= 0) throw "you can't look a non positive whole number amount"

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

		const canResolveSubruleNodes = this.unresolvedSubruleNodes[ruleName] || []
		// this will also look at all unresolved subrules and resolve them with this
		for (const subruleNode of canResolveSubruleNodes) {
			subruleNode.resolveWith(subrule)
		}

		delete this.unresolvedSubruleNodes[ruleName]
	}

	checkForLeftRecursion(topLevelRule, node) {
		for (const subNode of node.definition) {
			if (subNode instanceof Consume) return false

			else if (
				(subNode instanceof SubruleNode)
				&& subNode.subrule.ruleName == topLevelRule
			) return true

			else if (
				isRecurringNode(subNode)
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
			const node = new SubruleNode(rule, false)
			this.ruleEntryPaths[ruleName] = node.getEntryPath(this.lookahead)

			this.decisionPathStack.enterSubrule(ruleName)
			this.gatherDecisionPathsForNode(node)
			this.decisionPathStack.exitSubrule()
		}

		log(this.decisionPathStack.decisionPathMap)
	}

	gatherDecisionPathsForNode(node) {
		if (node instanceof Or || node instanceof ManySeparated) {
			// when we enter here, the current decision index is tracking which of the branches, rather than which spot
			for (const alternate of node.definition) {
				// after this, the decision index is tracking which point in the nested thing we are
				this.decisionPathStack.enterDecision()
				this.gatherSubNodes(alternate)
				this.decisionPathStack.exitDecision()

				this.decisionPathStack.incrementDecision()
			}
		}
		else this.gatherSubNodes(node.definition)
	}

	gatherSubNodes(definition) {
		for (const subNode of definition) {
			if (isDecidingNode(subNode)) {
				const lookahead = this.lookahead
				// const [, decisionPath] = subNode.getEntryPath(this.lookahead)
				const [, decisionPath] = subNode instanceof ManySeparated
					? [, [subNode.getDefEntryPath(lookahead), subNode.getSepEntryPath(lookahead)]]
					: subNode.getEntryPath(lookahead)

				this.decisionPathStack.pushDecisionPath(decisionPath)

				// this won't infinitely recurse because we won't make maybeSubrules decision points
				this.decisionPathStack.enterDecision()
				this.gatherDecisionPathsForNode(subNode)
				this.decisionPathStack.exitDecision()

				this.decisionPathStack.incrementDecision()
			}
		}
	}

	subrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, false, ...args)
	}

	maybeSubrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, true, ...args)
	}

	subruleInternal(ruleName, optional, ...args) {
		const rule = this.rules[ruleName]
		if (this.inspecting) {
			if (!rule) {
				// this looks to see if the subrule being invoked has already been defined
				// if it hasn't, it adds this name to the set of unresolved
				// we also create an unresolved decision tree and push it both to the current scopes and to the unresolved list
				const unresolvedSubruleNode = new SubruleNode(null, optional)
				this.definitionScope.push(unresolvedSubruleNode)

				const existingUnresolved = this.unresolvedSubruleNodes[ruleName] || []
				existingUnresolved.push(unresolvedSubruleNode)
				this.unresolvedSubruleNodes[ruleName] = existingUnresolved
			}
			else {
				const subruleNode = new SubruleNode(rule, optional)
				this.definitionScope.push(subruleNode)
			}

			return INSPECT
		}

		let shouldEnter = true
		if (optional) {
			// we use the precomputed decision path instead of using the stack
			const decisionPath = this.ruleEntryPaths[ruleName]

			const nextTokens = this.lookRange(decisionPath.maxLength)
			const [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
			// if no tokens were consumed, then that means an EMPTY_BRANCH was taken
			if (!(remainingTokens !== false && nextTokens.length != remainingTokens.length)) {
				shouldEnter = false
			}
		}

		let ruleReturnValue
		// in the event this isn't optional, the ruleFunction will definitely be called
		// if that happens and the token stream isn't correct, this will fail
		if (shouldEnter) {
			this.decisionPathStack.enterSubrule(ruleName)
			ruleReturnValue = rule.ruleFunction(...args)
			this.decisionPathStack.exitSubrule()
		}

		return ruleReturnValue
	}


	maybe(def) {
		if (this.inspecting) {
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
		const [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		// if no tokens were consumed, then that means an EMPTY_BRANCH was taken
		if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			const defResults = def()
			this.decisionPathStack.exitDecision()
			return defResults
		}

		this.decisionPathStack.incrementDecision()
		// if we get to this point, no decisions were taken, but this is an always optional rule
	}

	or(...choices) {
		const [tookChoice, choiceResults] = this.orInternal(false, ...choices)

		if (!tookChoice) throw "unsuccessful Or decision"
		return choiceResults
	}

	maybeOr(...choices) {
		const [, choiceResults] = this.orInternal(true, ...choices)
		return choiceResults
	}

	orInternal(optional, ...choices) {
		if (choices.length < 2) throw "can't call an or() with less than two choices"

		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope

			const alternations = []
			for (const choice of choices) {
				const currentAlternationScope = this.definitionScope = []
				choice()
				alternations.push(currentAlternationScope)
			}

			oldDefinitionScope.push(new Or(alternations, optional))
			this.definitionScope = oldDefinitionScope

			return [true, INSPECT]
		}

		let choiceResults
		let tookChoice = false
		// this belongs to our parent, not us
		const topDecisionPath = this.decisionPathStack.getDecisionPath()

		// if this path doesn't have exactly one thing, that's a problem
		if (topDecisionPath.path.length != 1) {
			console.log(topDecisionPath)
			throw "an or decision path didn't have exactly one element"
		}
		const branch = topDecisionPath.path[0]
		const nextTokens = this.lookRange(topDecisionPath.maxLength)
		const [whichChoice, , remainingTokens] = branch.testAgainstTokens(nextTokens)

		if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			this.decisionPathStack.setDecision(whichChoice)

			tookChoice = true
			this.decisionPathStack.enterDecision()
			const choice = choices[whichChoice]
			if (choice === undefined) {
				log(whichChoice)
				log(choice)
				log(choices)
				log(branch)
				throw "a choices array didn't line up with the choice index returned from branch.testAgainstTokens"
			}
			choiceResults = choice()
			this.decisionPathStack.exitDecision()
			this.decisionPathStack.exitDecision()
		}

		this.decisionPathStack.incrementDecision()
		return [tookChoice, choiceResults]
	}


	many(def) {
		return this.manyInternal(def, true)
	}

	maybeMany(def) {
		return this.manyInternal(def, false)
	}

	manyInternal(def, requireFirst) {
		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			def()
			oldDefinitionScope.push(new Many(currentDefinitionScope, !requireFirst))
			this.definitionScope = oldDefinitionScope

			return INSPECT
		}

		const allResults = []
		if (requireFirst) {
			this.decisionPathStack.enterDecision()
			// this one is mandatory
			// if it's unsuccessful, it will throw an expectation error
			allResults.push(def())
			this.decisionPathStack.exitDecision()
		}

		const decisionPath = this.decisionPathStack.getDecisionPath()

		let nextTokens = this.lookRange(decisionPath.maxLength)
		let [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		while (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			allResults.push(def())
			this.decisionPathStack.exitDecision()

			nextTokens = this.lookRange(decisionPath.maxLength)
			const [, tempRemainingTokens] = decisionPath.testAgainstTokens(nextTokens)
			remainingTokens = tempRemainingTokens
		}

		this.decisionPathStack.incrementDecision()
		return allResults
	}


	manySeparated(def, sep) {
		return this.manySeparatedInternal(def, sep, true)
	}

	maybeManySeparated(def, sep) {
		return this.manySeparatedInternal(def, sep, false)
	}

	manySeparatedInternal(def, sep, requireFirst) {
		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope

			const currentDefinitionScope = this.definitionScope = []
			def()

			const currentSeparatorScope = this.definitionScope = []
			sep()

			oldDefinitionScope.push(new ManySeparated(currentDefinitionScope, currentSeparatorScope, !requireFirst))
			this.definitionScope = oldDefinitionScope

			return INSPECT
		}

		const [enterDecisionPath, continueDecisionPath] = this.decisionPathStack.getDecisionPath()
		// const possibleArrayOfDecisionPaths = this.decisionPathStack.getDecisionPath()
		// const [enterDecisionPath, continueDecisionPath] = possibleArrayOfDecisionPaths instanceof Array
		// 	? possibleArrayOfDecisionPaths
		// 	: [undefined, possibleArrayOfDecisionPaths]

		const allResults = []
		if (!requireFirst) {
			const nextTokens = this.lookRange(enterDecisionPath.maxLength)
			const [, remainingTokens] = enterDecisionPath.testAgainstTokens(nextTokens)
			if (!(remainingTokens !== false && nextTokens.length != remainingTokens.length)) return
		}

		// since we have two alternating decisions
		this.decisionPathStack.enterDecision()
		this.decisionPathStack.enterDecision()
		// this one could be mandatory
		// if it's unsuccessful, it will throw an expectation error
		allResults.push(def())
		this.decisionPathStack.exitDecision()
		this.decisionPathStack.incrementDecision() // this puts us at the sep

		let nextTokens = this.lookRange(continueDecisionPath.maxLength)
		let [, remainingTokens] = continueDecisionPath.testAgainstTokens(nextTokens)
		while (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			// we consume the sep without doing anything with it's return value
			this.decisionPathStack.enterDecision()
			sep()
			this.decisionPathStack.exitDecision()
			this.decisionPathStack.resetDecision()

			this.decisionPathStack.enterDecision()
			allResults.push(def())
			this.decisionPathStack.exitDecision()
			this.decisionPathStack.incrementDecision()

			nextTokens = this.lookRange(continueDecisionPath.maxLength)
			const [, tempRemainingTokens] = continueDecisionPath.testAgainstTokens(nextTokens)
			remainingTokens = tempRemainingTokens
		}
		this.decisionPathStack.exitDecision()

		this.decisionPathStack.incrementDecision()
		return allResults
	}


	consume(tokenTypeOrArray) {
		const tokenTypeArray = toArray(tokenTypeOrArray)
		if (this.inspecting) {
			this.definitionScope.push(new Consume(tokenTypeArray, false))
			return INSPECT
		}

		// this can just go ahead and advance then check, since if the match doesn't succeed we'll just error
		const nextTokens = this.advance(tokenTypeArray.length)
		if (this.testRealTokenList(tokenTypeArray, nextTokens)) return nextTokens
		else throw `next tokens didn't match:\n\texpected: ${tokenTypeArray}\n\tfound: ${nextTokens}`
	}

	// TODO could be a good idea to have a consumeMany and maybeConsumeMany, instead of a token option for many and many sep

	maybeConsume(tokenTypeOrArray) {
		const tokenTypeArray = toArray(tokenTypeOrArray)
		if (this.inspecting) {
			this.definitionScope.push(new Consume(tokenTypeArray, true))
			return INSPECT
		}

		const nextTokens = this.testLookTokenList(tokenTypeArray)
		if (nextTokens !== false) {
			this.advance(tokenTypeArray.length)
			return nextTokens
		}
	}
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
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
		} = this.getFunctions()

		rule('only', () => {
			consume('Space')
			manySeparated(() => {
			// maybeManySeparated(() => {
				consume(['LeftParen', 'Number', 'RightParen'])
			}, () => {
				consume('Dot')
			})
		})

		this.analyze()
	}
}


const concreteParser = new ConcreteParser()
concreteParser.reset(" (4)")
concreteParser.only()

// concreteParser.reset(" (4).(4)")
// concreteParser.only()

// concreteParser.reset(" ")
// concreteParser.only()
