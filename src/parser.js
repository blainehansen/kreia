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

const { matchTokens } = require('kreia-moo')
const {
	isDecidingNode, isNestedNode, isRecurringNode, Maybe, Consume, Subrule, SubruleNode, Or, Many, ManySeparated
} = require('./parse-nodes')

function toArray(item) {
	return item instanceof Array ? item : [item]
}

function unwrapOneItemArray(array) {
	return array.length == 1 ? array[0] : array
}

function unwrapEmptyArray(array) {
	return array.length == 0 ? undefined : array
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
			throw new Error("no decision path was found")
		}

		return decisionPath
	}
}


class Parser {
	constructor(lexer, lookahead = 3) {
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

	quit() {
		return this.inspecting
	}

	getPrimitives() {
		let {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated, quit,
			optionsMaybeSubrule, optionsMaybe, optionsMany, optionsManySeparated,
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
		quit = quit.bind(this)
		optionsMaybeSubrule = optionsMaybeSubrule.bind(this)
		optionsMaybe = optionsMaybe.bind(this)
		optionsMany = optionsMany.bind(this)
		optionsManySeparated = optionsManySeparated.bind(this)

		return {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated, quit,
			optionsMaybeSubrule, optionsMaybe, optionsMany, optionsManySeparated,
		}
	}

	reset(inputText) {
		this.lexer.reset(inputText)
		this.lookQueue = []

		this.currentTokenIndex = 0
	}

	// this method will primarily be used in the various gates
	look(amount = 1) {
		if (amount <= 0) throw new Error("you can't look a non positive whole number amount")

		let current = amount - this.lookQueue.length
		while (current > 0) {
			this.lookQueue.push(this.lexer.next())
			current--
		}

		return this.lookQueue[amount - 1]
	}

	lookRange(amount) {
		if (amount <= 0) throw new Error("you can't look a non positive whole number amount")

		this.look(amount)
		return this.lookQueue.slice(0, amount)
	}

	advance(amount = 1) {
		if (amount <= 0) throw new Error("advance can't be called with a negative number")

		this.currentTokenIndex += amount

		const nextTokens = this.lookRange(amount)
		this.lookQueue.splice(0, amount)
		return nextTokens
	}

	testLookTokenList(tokenTypeList) {
		const nextTokens = this.lookRange(tokenTypeList.length)
		if (matchTokens(nextTokens, tokenTypeList)) return nextTokens
		else return false
	}

	rule(ruleName, ruleFunction) {
		this[ruleName] = (...args) => {
			const subruleResults = this.subrule(ruleName, ...args)

			// this function would be called as a top level rule
			// if there are any tokens still in the output, that's an error
			const remainingQueue = this.lookQueue.filter((token) => token !== undefined)
			if (this.lexer.next() !== undefined || remainingQueue.length != 0) throw new Error("there are still tokens in the output")
			return subruleResults
		}

		// this array represents a list of all definitions in the rule we're about to inspect
		if (this.definitionScope !== null) throw new Error("rule should only be invoked to create rules, and not from other rules")

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
		if (isNestedNode(node)) {
			for (const alternate of node.definition) {
				if (this.checkSubNodesForLeftRecursion(topLevelRule, alternate.definition)) {
					return true
				}
			}

			return false
		}
		else return this.checkSubNodesForLeftRecursion(topLevelRule, node.definition)
	}

	checkSubNodesForLeftRecursion(topLevelRule, definition) {
		for (const subNode of definition) {
			if (subNode instanceof Consume) {
				if (subNode.optional) continue
				return false
			}

			else if (
				(subNode instanceof SubruleNode)
				&& subNode.subrule.ruleName == topLevelRule
			) return true

			else if (isRecurringNode(subNode)) {
				if (this.checkForLeftRecursion(topLevelRule, subNode)) return true
				else if (!subNode.optional) return false
			}
		}

		// if we make it this far, it isn't left recursive
		return false
	}

	gatherDecisionPathsForNode(node) {
		// if (node instanceof Or || node instanceof ManySeparated) {
		if (isNestedNode(node)) {
			// when we enter here, the current decision index is tracking which of the branches, rather than which spot
			for (const alternate of node.definition) {
				// after this, the decision index is tracking which point in the nested thing we are
				this.decisionPathStack.enterDecision()
				this.gatherSubNodes(alternate.definition)
				this.decisionPathStack.exitDecision()

				this.decisionPathStack.incrementDecision()
			}
		}
		else this.gatherSubNodes(node.definition)
	}

	gatherSubNodes(definition) {
		for (const subNode of definition) {
			if (isDecidingNode(subNode)) {
				const decisionPathObject = subNode.getRootEntryPath()

				this.decisionPathStack.pushDecisionPath(decisionPathObject)

				// this won't infinitely recurse because we won't make maybeSubrules decision points
				this.decisionPathStack.enterDecision()
				this.gatherDecisionPathsForNode(subNode)
				this.decisionPathStack.exitDecision()

				this.decisionPathStack.incrementDecision()
			}
		}
	}

	analyze() {
		// first check that all subrules could be resolved
		if (Object.keys(this.unresolvedSubruleNodes).length != 0) {
			log(this.unresolvedSubruleNodes)
			throw new Error("there are unresolved subrules")
		}

		// check for left recursion
		for (const [ruleName, rule] of Object.entries(this.rules)) {
			if (this.checkForLeftRecursion(ruleName, rule)) {
				throw new Error(`${ruleName} is left recursive`)
			}
		}

		// gather decision paths
		for (const [ruleName, rule] of Object.entries(this.rules)) {
			// getting just the entry path for this subrule will be useful, to decide for all future maybeSubrules
			const node = new SubruleNode(rule, false, this.lookahead)
			this.ruleEntryPaths[ruleName] = node.getRootEntryPath()

			this.decisionPathStack.enterSubrule(ruleName)
			this.gatherDecisionPathsForNode(node)
			this.decisionPathStack.exitSubrule()
		}
	}

	subrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, false, args)
	}

	maybeSubrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, true, args)
	}

	optionsMaybeSubrule(ruleName, lookahead, ...args) {
		return this.subruleInternal(ruleName, true, args, lookahead)
	}

	subruleInternal(ruleName, optional, args, lookahead = this.lookahead) {
		const rule = this.rules[ruleName]
		if (this.inspecting) {
			if (!rule) {
				// this looks to see if the subrule being invoked has already been defined
				// if it hasn't, it adds this name to the set of unresolved
				// we also create an unresolved decision tree and push it both to the current scopes and to the unresolved list
				const unresolvedSubruleNode = new SubruleNode(null, optional, lookahead)
				this.definitionScope.push(unresolvedSubruleNode)

				const existingUnresolved = this.unresolvedSubruleNodes[ruleName] || []
				existingUnresolved.push(unresolvedSubruleNode)
				this.unresolvedSubruleNodes[ruleName] = existingUnresolved
			}
			else {
				const subruleNode = new SubruleNode(rule, optional, lookahead)
				this.definitionScope.push(subruleNode)
			}

			return {}
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

	maybe(def, ...args) {
		return this.maybeInternal(def, args)
	}

	optionsMaybe(def, lookahead, ...args) {
		return this.maybeInternal(def, args, lookahead)
	}

	maybeInternal(def, args, lookahead = this.lookahead) {
		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			def()
			oldDefinitionScope.push(new Maybe(currentDefinitionScope, lookahead))
			this.definitionScope = oldDefinitionScope

			return {}
		}

		// we grab the decision path at the right key, and then we increment the decision number
		const decisionPath = this.decisionPathStack.getDecisionPath()

		const nextTokens = this.lookRange(decisionPath.maxLength)
		const [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		// if no tokens were consumed, then that means an EMPTY_BRANCH was taken
		let defResults
		if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			defResults = def(...args)
			this.decisionPathStack.exitDecision()
		}

		this.decisionPathStack.incrementDecision()
		// this may return undefined, but this is an always optional rule
		return defResults
	}

	processChoices(choices) {
		return choices.map((choice) => this.processChoice(choice))
	}

	processChoice(choice) {
		if (typeof choice == 'function') return { choice, args: [], lookahead: this.lookahead }
		else if (!choice || typeof choice.choice != 'function') throw new Error(`You provided an invalid choice: ${choice}`)

		choice.lookahead = choice.lookahead || this.lookahead
		choice.args = choice.args || []
		return choice
	}

	or(...choices) {
		choices = this.processChoices(choices)
		const [tookChoice, choiceResults] = this.orInternal(false, choices)

		if (!tookChoice) {
			log(choices)
			throw new Error("unsuccessful Or decision")
		}
		return choiceResults
	}

	maybeOr(...choices) {
		choices = this.processChoices(choices)
		const [, choiceResults] = this.orInternal(true, choices)
		return choiceResults
	}

	orInternal(optional, choices) {
		if (choices.length < 2) throw new Error("can't call an `or` variant with less than two choices")

		if (this.inspecting) {
			const alternations = []
			const oldDefinitionScope = this.definitionScope
			for (const { choice, lookahead } of choices) {
				const currentAlternationScope = this.definitionScope = []
				choice()
				alternations.push({ lookahead, definition: currentAlternationScope })
			}
			oldDefinitionScope.push(new Or(alternations, optional))
			this.definitionScope = oldDefinitionScope

			return [true, undefined]
		}

		let choiceResults
		let tookChoice = false

		const decisionPaths = this.decisionPathStack.getDecisionPath()
		if (!(decisionPaths instanceof Array)) {
			console.log(decisionPaths)
			throw new Error("an or() decisionPath wasn't an array")
		}

		for (const [whichChoice, { choice, args }] of choices.entries()) {
			const decisionPath = decisionPaths[whichChoice]
			if (decisionPath === undefined) {
				log(whichChoice)
				log(choice)
				log(choices)
				log(branch)
				throw new Error("the choices and decisionPaths didn't line up")
			}

			const nextTokens = this.lookRange(decisionPath.maxLength)
			const [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)

			if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
				this.decisionPathStack.enterDecision()
				this.decisionPathStack.setDecision(whichChoice)

				tookChoice = true
				this.decisionPathStack.enterDecision()
				choiceResults = choice(...args)

				this.decisionPathStack.exitDecision()
				this.decisionPathStack.exitDecision()
			}
		}

		this.decisionPathStack.incrementDecision()
		return [tookChoice, choiceResults]
	}


	many(def, ...args) {
		return this.manyInternal(def, false, args)
	}

	maybeMany(def, ...args) {
		return this.manyInternal(def, true, args)
	}

	optionsMany(def, lookahead, ...args) {
		return this.manyInternal(def, true, args, lookahead)
	}

	manyInternal(def, optional, args, lookahead = this.lookahead) {
		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			def()
			oldDefinitionScope.push(new Many(currentDefinitionScope, optional, lookahead))
			this.definitionScope = oldDefinitionScope

			return {}
		}

		const allResults = []
		if (!optional) {
			this.decisionPathStack.enterDecision()
			// this one is mandatory
			// if it's unsuccessful, it will throw an expectation error
			allResults.push(def(...args))
			this.decisionPathStack.exitDecision()
		}

		const decisionPath = this.decisionPathStack.getDecisionPath()

		let nextTokens = this.lookRange(decisionPath.maxLength)
		let [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		while (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			allResults.push(def(...args))
			this.decisionPathStack.exitDecision()

			nextTokens = this.lookRange(decisionPath.maxLength)
			const [, tempRemainingTokens] = decisionPath.testAgainstTokens(nextTokens)
			remainingTokens = tempRemainingTokens
		}

		this.decisionPathStack.incrementDecision()
		return allResults
	}


	manySeparated(def, sep, ...args) {
		def = this.processChoice({ choice: def, args })
		sep = this.processChoice({ choice: sep })
		return this.manySeparatedInternal(def, sep, false)
	}

	maybeManySeparated(def, sep, ...args) {
		def = this.processChoice({ choice: def, args })
		sep = this.processChoice({ choice: sep })
		return this.manySeparatedInternal(def, sep, true)
	}

	optionsManySeparated(def, sep, optional) {
		def = this.processChoice(def)
		sep = this.processChoice(sep)
		return this.manySeparatedInternal(def, sep, optional)
	}

	manySeparatedInternal(def, sep, optional) {
		const { choice: defFunc, args: defArgs, lookahead: defLookahead } = def
		const { choice: sepFunc, args: sepArgs, lookahead: sepLookahead } = sep

		if (this.inspecting) {
			const oldDefinitionScope = this.definitionScope

			const currentDefinitionScope = this.definitionScope = []
			defFunc()

			const currentSeparatorScope = this.definitionScope = []
			sepFunc()

			oldDefinitionScope.push(
				new ManySeparated(
					{ definition: currentDefinitionScope, lookahead: defLookahead },
					{ definition: currentSeparatorScope, lookahead: sepLookahead },
					optional
				)
			)
			this.definitionScope = oldDefinitionScope

			return {}
		}

		const [enterDecisionPath, continueDecisionPath] = this.decisionPathStack.getDecisionPath()

		const allResults = []
		if (optional) {
			const nextTokens = this.lookRange(enterDecisionPath.maxLength)
			const [, remainingTokens] = enterDecisionPath.testAgainstTokens(nextTokens)
			if (!(remainingTokens !== false && nextTokens.length != remainingTokens.length)) return allResults
		}

		// since we have two alternating decisions
		this.decisionPathStack.enterDecision()
		this.decisionPathStack.enterDecision()
		// this one could be mandatory
		// if it's unsuccessful, it will throw an expectation error
		allResults.push(defFunc(...defArgs))
		this.decisionPathStack.exitDecision()
		this.decisionPathStack.incrementDecision() // this puts us at the sep

		let nextTokens = this.lookRange(continueDecisionPath.maxLength)
		let [, remainingTokens] = continueDecisionPath.testAgainstTokens(nextTokens)
		while (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			// we consume the sep without doing anything with it's return value
			this.decisionPathStack.enterDecision()
			sepFunc(...sepArgs)
			this.decisionPathStack.exitDecision()
			this.decisionPathStack.resetDecision()

			this.decisionPathStack.enterDecision()
			allResults.push(defFunc(...defArgs))
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


	consume(...tokenTypeArray) {
		if (this.inspecting) {
			this.definitionScope.push(new Consume(tokenTypeArray, false))
			return {}
		}

		// this can just go ahead and advance then check, since if the match doesn't succeed we'll just error
		const nextTokens = this.advance(tokenTypeArray.length)
		if (matchTokens(nextTokens, tokenTypeArray)) return unwrapOneItemArray(nextTokens)
		else throw new Error(`next tokens didn't match:\n\texpected: ${tokenTypeArray}\n\tfound: ${nextTokens}`)
	}

	maybeConsume(...tokenTypeArray) {
		if (this.inspecting) {
			this.definitionScope.push(new Consume(tokenTypeArray, true))
			return {}
		}

		const nextTokens = this.testLookTokenList(tokenTypeArray)
		if (nextTokens !== false) {
			this.advance(tokenTypeArray.length)
			return unwrapOneItemArray(nextTokens)
		}
	}

	// gateConsume(gate, ...tokenTypeArray) {

	// }
}


module.exports = Parser
