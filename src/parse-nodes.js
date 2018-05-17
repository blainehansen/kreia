const { DecisionPath, DecisionBranch, EMPTY_BRANCH, TERMINATE_NODE } = require('./decision-paths')


function subclassOf(BClass, AClass) {
	return BClass.prototype instanceof AClass || BClass === AClass
}

class ParseNode {
	constructor(definition, optional) {
		if (definition !== null && !(definition instanceof Array) && !subclassOf(definition, ParseNode)) throw "tried to create a parseNode with something other than an Array, ParseNode, or null"

		this.definition = definition
		this.optional = optional
	}

	getLinearEntryPath(definition, lookahead) {
		let entryPath = new DecisionPath()

		let brokeEarly = false
		for (const node of definition) {
			if (entryPath.minLength >= lookahead) {
				brokeEarly = true
				entryPath.push(TERMINATE_NODE)
				break
			}

			const remainingLookahead = lookahead - entryPath.minLength

			const nodeEntryPath = node.getEntryPath(remainingLookahead)
			let thingToPush = nodeEntryPath
			// when an Or is called as the top level tester, it shouldn't have an empty branch pushed, but should simply rely on the "maybeness" of the calling function to panic or not
			// but when it's simply on a path within another thing, it needs to allow continuation
			if (node.optional) {
				if (node instanceof Or) {
					// this should exist and be a branch
					nodeEntryPath.path[0].push(EMPTY_BRANCH)
				}
				else {
					const branch = new DecisionBranch()
					branch.push(nodeEntryPath)
					branch.push(EMPTY_BRANCH)
					thingToPush = branch
				}
			}

			entryPath.minLength += node.optional ? 0 : nodeEntryPath.minLength
			entryPath.maxLength += nodeEntryPath.maxLength
			entryPath.push(thingToPush)
		}

		return [brokeEarly, entryPath]
	}

	getEntryPath(lookahead) {
		const [, entryPath] = this.getLinearEntryPath(this.definition, lookahead)
		return entryPath
	}
}

class Subrule {
	constructor(definition, ruleName, ruleFunction) {
		this.definition = definition
		this.ruleName = ruleName
		this.ruleFunction = ruleFunction
	}
}

class SubruleNode extends ParseNode {
	constructor(subrule, optional) {
		if (subrule && !(subrule instanceof Subrule)) throw "can't put anything other than a subrule into a subrule wrapper"
		super(subrule ? subrule.definition : null, optional)
		this.resolved = !!subrule
		this.subrule = subrule
	}

	resolveWith(subrule) {
		if (!(subrule instanceof Subrule)) throw "can't put anything other than a subrule into a subrule wrapper"

		if (this.resolved) throw "SubruleNode has already been resolved"
		this.definition = subrule.definition
		this.resolved = true
		this.subrule = subrule
	}
}


// this holds an array of tokens
class Consume extends ParseNode {
	getEntryPath(lookahead) {
		const entryPath = new DecisionPath()

		entryPath.push(this.definition)
		const length = this.definition.length
		// we no longer do this because the calling thing should use our optionalness to determine whether to add our minLength or not
		// entryPath.minLength = this.optional ? 0 : length
		entryPath.minLength = length
		entryPath.maxLength = length
		return entryPath
	}
}

class Maybe extends ParseNode {
	constructor(definition) {
		super(definition, true)
	}
}

class Or extends ParseNode {
	getEntryPath(lookahead) {
		const branch = new DecisionBranch()
		let overallMaxLength = 0
		let overallMinLength = 0

		for (const choice of this.definition) {
			const [, choiceEntryPath] = this.getLinearEntryPath(choice, lookahead)
			const maxLength = choiceEntryPath.maxLength
			const minLength = choiceEntryPath.minLength
			if (maxLength > overallMaxLength) overallMaxLength = maxLength
			if (minLength > overallMinLength) overallMinLength = minLength

			branch.push(choiceEntryPath)
		}

		const entryPath = new DecisionPath()
		entryPath.maxLength = overallMaxLength
		entryPath.minLength = overallMinLength
		entryPath.push(branch)
		return entryPath
	}
}

class Many extends ParseNode {
	getManyBranch(subPath, lookahead) {
		const continuationBranch = new DecisionBranch()

		// let's say we have 5 lookahead remaining
		// and the sep path is 3 minimum tokens and 6 maximum
		// that means the longest iteration would be two, it would be a six minimum and a 12 maximum
		const maxIterations = Math.ceil(lookahead / subPath.minLength)
		let currentIterations = maxIterations
		while (currentIterations > 0) {
			const iterationsPath = new DecisionPath()

			for (var i = 1; i <= currentIterations; i++) {
				iterationsPath.push(subPath)
			}

			continuationBranch.push(iterationsPath)

			currentIterations--
		}

		const largestMinLength = maxIterations * subPath.minLength
		const largestMaxLength = maxIterations * subPath.maxLength

		return [largestMinLength, largestMaxLength, continuationBranch]
	}

	getEntryPath(lookahead) {
		const [brokeEarly, entryPath] = this.getLinearEntryPath(this.definition, lookahead)
		if (brokeEarly) return entryPath

		const realEntryPath = new DecisionPath()

		const [
			largestMinLength, largestMaxLength, continuationBranch
		] = this.getManyBranch(entryPath, lookahead - realEntryPath.minLength)

		realEntryPath.push(continuationBranch)
		realEntryPath.minLength += largestMinLength
		realEntryPath.maxLength += largestMaxLength
		return realEntryPath
	}
}

class ManySeparated extends Many {
	constructor(definition, separator, optional) {
		super([definition, separator], optional)
	}

	getDefEntryPath(lookahead) {
		return this.getLinearEntryPath(this.definition[0], lookahead)[1]
	}
	getSepEntryPath(lookahead) {
		return this.getLinearEntryPath(this.definition[1], lookahead)[1]
	}

	getEntryPath(lookahead) {
		const [definition, separator] = this.definition

		// if this broke early, it will have a terminate at the end
		// if they match it but it terminates, they just won't look at the continuation
		// even if that happens, we need to
		const [enterBrokeEarly, enterDecisionPath] = this.getLinearEntryPath(definition, lookahead)
		if (enterBrokeEarly) return enterDecisionPath

		const [separatorBrokeEarly, separatorDecisionPath] = this.getLinearEntryPath(separator, lookahead)

		const totalEntryPath = new DecisionPath()
		totalEntryPath.push(enterDecisionPath)
		totalEntryPath.minLength += enterDecisionPath.minLength
		totalEntryPath.maxLength += enterDecisionPath.maxLength

		let continuationBranch
		let branchMinLength = separatorDecisionPath.minLength
		let branchMaxLength = separatorDecisionPath.maxLength
		if (!separatorBrokeEarly) {
			separatorDecisionPath.maxLength += enterDecisionPath.maxLength
			separatorDecisionPath.minLength += enterDecisionPath.minLength
			separatorDecisionPath.push(enterDecisionPath)

			const [
				tempBranchMinLength, tempBranchMaxLength, tempContinuationBranch
			] = this.getManyBranch(separatorDecisionPath, lookahead - totalEntryPath.minLength)
			branchMinLength = tempBranchMinLength
			branchMaxLength = tempBranchMaxLength
			continuationBranch = tempContinuationBranch
		}
		else {
			continuationBranch = new DecisionBranch()
			continuationBranch.push(separatorDecisionPath)
			continuationBranch.push(EMPTY_BRANCH)
		}

		totalEntryPath.push(continuationBranch)
		totalEntryPath.minLength += branchMinLength
		totalEntryPath.maxLength += branchMaxLength

		return totalEntryPath
	}
}


function isDecidingNode(inst) {
	return !(inst instanceof Consume || inst instanceof SubruleNode)
}

function isRecurringNode(inst) {
	return !(inst instanceof Consume)
}

module.exports = {
	isDecidingNode, isRecurringNode, Maybe, Consume, Subrule, SubruleNode, Or, Many, ManySeparated
}
