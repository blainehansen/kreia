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
		this.inInspectionMode = false
		this.definitionScope = null

		// maps subruleNames to lists of unresolved items
		this.unresolvedSubruleNodes = {}

		this.decisionPathStack = new DecisionPathStack()

		this.currentTokenIndex = 0
	}

	inspecting() {
		return this.inInspectionMode
	}

	formatError(token, message) {
		return this.lexer.formatError(token, message)
	}

	createError(token, message) {
		return new Error(this.lexer.formatError(token, message))
	}

	// formatRangeError(beginToken, endToken, message) {
	// 	return this.lexer.formatRangeError(beginToken, endToken, message)
	// }

	getPrimitives() {
		let {
			inspecting,
			rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume,
			maybe, gate,
			or, maybeOr, gateOr,
			many, maybeMany, gateMany,
			manySeparated, maybeManySeparated, gateManySeparated,
			formatError, // formatRangeError,
		} = this

		inspecting = inspecting.bind(this)
		rule = rule.bind(this)
		subrule = subrule.bind(this)
		maybeSubrule = maybeSubrule.bind(this)
		gateSubrule = gateSubrule.bind(this)
		consume = consume.bind(this)
		maybeConsume = maybeConsume.bind(this)
		gateConsume = gateConsume.bind(this)
		maybe = maybe.bind(this)
		gate = gate.bind(this)
		or = or.bind(this)
		maybeOr = maybeOr.bind(this)
		gateOr = gateOr.bind(this)
		many = many.bind(this)
		maybeMany = maybeMany.bind(this)
		gateMany = gateMany.bind(this)
		manySeparated = manySeparated.bind(this)
		maybeManySeparated = maybeManySeparated.bind(this)
		gateManySeparated = gateManySeparated.bind(this)
		formatError = formatError.bind(this)
		// formatRangeError = formatRangeError.bind(this)

		return {
			inspecting,
			rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume,
			maybe, gate,
			or, maybeOr, gateOr,
			many, maybeMany, gateMany,
			manySeparated, maybeManySeparated, gateManySeparated,
			formatError, // formatRangeError,
		}
	}

	reset(inputText) {
		this.lexer.reset(inputText)
		this.lookQueue = []

		this.currentTokenIndex = 0
	}

	// this method will primarily be used in the various gates
	look(amount = 1) {
		if (amount <= 0) throw new Error(`you can't look a non positive whole number amount: ${amount}`)

		let current = amount - this.lookQueue.length
		while (current > 0) {
			this.lookQueue.push(this.lexer.next())
			current--
		}

		return this.lookQueue[amount - 1]
	}

	lookRange(amount) {
		if (amount <= 0) throw new Error(`you can't look a non positive whole number amount: ${amount}`)

		this.look(amount)
		return this.lookQueue.slice(0, amount)
	}

	advance(amount = 1) {
		if (amount <= 0) throw new Error(`advance can't be called with a non positive whole number: ${amount}`)

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

	rule(ruleName, ruleFunction, lookahead = this.lookahead) {
		this[ruleName] = (...args) => {
			const subruleResults = this.subrule(ruleName, ...args)

			// this function would be called as a top level rule
			// if there are any tokens still in the output, that's an error
			const remainingQueue = this.lookQueue.filter((token) => token !== undefined)
			let nextToken = this.lexer.next()
			if (nextToken !== undefined || remainingQueue.length != 0) {
				console.log(this.lookQueue)
				console.log(nextToken)
				throw new Error("there are still tokens in the output")
			}
			return subruleResults
		}

		// this array represents a list of all definitions in the rule we're about to inspect
		if (this.definitionScope !== null) throw new Error("rule should only be invoked to create rules, and not from other rules")

		const definition = this.definitionScope = []
		// since inInspectionMode is true, all parser primitive functions will push their definitions to definitionScope
		this.inInspectionMode = true
		ruleFunction()
		this.inInspectionMode = false
		this.definitionScope = null

		const subrule = this.rules[ruleName] = new Subrule(definition, ruleName, ruleFunction, lookahead)

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

	processDefs(defs, allowArgs = true, allowGate = true) {
		return defs.map((def) => this.processDef(def, allowArgs, allowGate))
	}

	processDef(def, allowArgs = false, allowGate = false) {
		const type = typeof def
		if (type == 'function') def = { func: def }
		// there will be a case for passing through tokens or tokens of arrays here
		if (allowArgs) def.args = def.args || []
		else if ('args' in def) throw new Error("this method doesn't allow args, use the ... in the function instead")

		if (allowGate) def.gate = def.gate || null
		else if ('gate' in def) throw new Error("this method doesn't allow a gate, use the gate version of this method instead")

		def.lookahead = def.lookahead || this.lookahead

		return def
	}

	subrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, false, args)
	}

	maybeSubrule(ruleName, ...args) {
		return this.subruleInternal(ruleName, true, args)
	}

	gateSubrule(gateFunction, ruleName, ...args) {
		return this.subruleInternal(ruleName, true, args, gateFunction)
	}

	subruleInternal(ruleName, optional, args, gate = undefined) {
		const rule = this.rules[ruleName]
		if (this.inInspectionMode) {
			if (!rule) {
				// this looks to see if the subrule being invoked has already been defined
				// if it hasn't, it adds this name to the set of unresolved
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

			return
		}

		if (gate && !gate()) return

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

	gate(gateFunction, def, ...args) {
		return this.maybeInternal(def, args, gateFunction)
	}

	maybeInternal(def, args, gate = undefined) {
		const { lookahead, func: defFunc } = this.processDef(def)

		if (this.inInspectionMode) {
			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			defFunc()
			oldDefinitionScope.push(new Maybe(currentDefinitionScope, lookahead))
			this.definitionScope = oldDefinitionScope

			return
		}

		if (gate && !gate()) return

		// we grab the decision path at the right key, and then we increment the decision number
		const decisionPath = this.decisionPathStack.getDecisionPath()

		const nextTokens = this.lookRange(decisionPath.maxLength)
		const [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		// if no tokens were consumed, then that means an EMPTY_BRANCH was taken
		let defResults
		if (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			defResults = defFunc(...args)
			this.decisionPathStack.exitDecision()
		}

		this.decisionPathStack.incrementDecision()
		// this may return undefined, but this is an always optional rule
		return defResults
	}

	or(...choices) {
		const [tookChoice, choiceResults] = this.orInternal(false, choices)

		if (!tookChoice) {
			log(choices)
			throw new Error("unsuccessful Or decision")
		}
		return choiceResults
	}

	maybeOr(...choices) {
		const [, choiceResults] = this.orInternal(true, choices)
		return choiceResults
	}

	gateOr(gateFunction, ...choices) {
		const [, choiceResults] = this.orInternal(true, choices, gateFunction)
		return choiceResults
	}

	orInternal(optional, choices, gate = undefined) {
		if (choices.length < 2) throw new Error("can't call an `or` variant with less than two choices")

		choices = this.processDefs(choices)

		if (this.inInspectionMode) {
			const alternations = []
			const oldDefinitionScope = this.definitionScope
			for (const { func: choice, lookahead } of choices) {
				const currentAlternationScope = this.definitionScope = []
				choice()
				alternations.push({ lookahead, definition: currentAlternationScope })
			}
			oldDefinitionScope.push(new Or(alternations, optional))
			this.definitionScope = oldDefinitionScope

			return [true, undefined]
		}

		if (gate && !gate()) return [false, undefined]

		let choiceResults
		let tookChoice = false

		const decisionPaths = this.decisionPathStack.getDecisionPath()
		if (!(decisionPaths instanceof Array)) {
			console.log(decisionPaths)
			throw new Error("an or() decisionPath wasn't an array")
		}

		for (const [whichChoice, { func: choice, gate: choiceGate, args }] of choices.entries()) {
			const decisionPath = decisionPaths[whichChoice]
			if (decisionPath === undefined) {
				log(whichChoice)
				log(choice)
				log(choices)
				log(branch)
				throw new Error("the choices and decisionPaths didn't line up")
			}

			if (choiceGate && !choiceGate()) continue

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
				break
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

	gateMany(gateFunction, def, ...args) {
		return this.manyInternal(def, true, args, gateFunction)
	}

	manyInternal(def, optional, args, gate = undefined) {
		const { func: defFunc, lookahead } = this.processDef(def)

		if (this.inInspectionMode) {
			const oldDefinitionScope = this.definitionScope
			const currentDefinitionScope = this.definitionScope = []
			defFunc()
			oldDefinitionScope.push(new Many(currentDefinitionScope, optional, lookahead))
			this.definitionScope = oldDefinitionScope

			return
		}

		if (gate && !gate()) return []

		const allResults = []
		if (!optional) {
			this.decisionPathStack.enterDecision()
			// this one is mandatory
			// if it's unsuccessful, it will throw an expectation error
			allResults.push(defFunc(...args))
			this.decisionPathStack.exitDecision()
		}

		const decisionPath = this.decisionPathStack.getDecisionPath()

		let nextTokens = this.lookRange(decisionPath.maxLength)
		let [, remainingTokens] = decisionPath.testAgainstTokens(nextTokens)
		while (remainingTokens !== false && nextTokens.length != remainingTokens.length) {
			this.decisionPathStack.enterDecision()
			allResults.push(defFunc(...args))
			this.decisionPathStack.exitDecision()

			nextTokens = this.lookRange(decisionPath.maxLength)
			const [, tempRemainingTokens] = decisionPath.testAgainstTokens(nextTokens)
			remainingTokens = tempRemainingTokens
		}

		this.decisionPathStack.incrementDecision()
		return allResults
	}


	manySeparated(def, sep, ...args) {
		return this.manySeparatedInternal(def, sep, false, args)
	}

	maybeManySeparated(def, sep, ...args) {
		return this.manySeparatedInternal(def, sep, true, args)
	}

	gateManySeparated(gateFunction, def, sep, ...args) {
		return this.manySeparatedInternal(def, sep, true, args, gateFunction)
	}

	manySeparatedInternal(def, sep, optional, args, gate = undefined) {
		const [
			{ func: defFunc, args: defArgs, lookahead: defLookahead },
			{ func: sepFunc, args: sepArgs, lookahead: sepLookahead }
		] = this.processDefs([def, sep], true, false)

		if (args.length > 0) {
			if (defArgs.length > 0 || sepArgs.length > 0) {
				console.log(defArgs)
				console.log(sepArgs)
				throw new Error("can only use the variadic ...args by itself or the args property of the def or sep. You can't do both at the same time")
			}
			defArgs.push.apply(defArgs, args)
		}

		if (this.inInspectionMode) {
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

			return
		}

		if (gate && !gate()) return []

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
		if (this.inInspectionMode) {
			this.definitionScope.push(new Consume(tokenTypeArray, false))
			return {}
		}

		// this can just go ahead and advance then check, since if the match doesn't succeed we'll just error
		const nextTokens = this.advance(tokenTypeArray.length)
		if (matchTokens(nextTokens, tokenTypeArray)) return unwrapOneItemArray(nextTokens)
		else {
			console.log('expected: ', tokenTypeArray)
			console.log('found: ', nextTokens)
			throw new Error("next tokens didn't match")
		}
	}

	maybeConsume(...tokenTypeArray) {
		if (this.inInspectionMode) {
			this.definitionScope.push(new Consume(tokenTypeArray, true))
			return {}
		}

		const nextTokens = this.testLookTokenList(tokenTypeArray)
		if (nextTokens !== false) {
			this.advance(tokenTypeArray.length)
			return unwrapOneItemArray(nextTokens)
		}
	}

	gateConsume(gateFunction, ...tokenTypeArray) {
		if (!this.inInspectionMode && gateFunction && !gateFunction()) return

		return this.maybeConsume(...tokenTypeArray)
	}
}


module.exports = Parser
