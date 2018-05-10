const { DecisionPath, DecisionBranch, EMPTY_BRANCH } = require('./decision-paths')


function subclassOf(BClass, AClass) {
	return BClass.prototype instanceof AClass || BClass === AClass
}

class ParseNode {
	constructor(definition, optional) {
		if (definition !== null && !subclassOf(definition, Array) && subclassOf(definition, ParseNode)) throw "tried to create a parseNode with something other than an Array, ParseNode, or null"

		this.definition = definition
		this.optional = optional
	}

	getEntryPath(lookahead) {
		let entryPath = new DecisionPath()

		if (this instanceof Consume) {
			entryPath.push(this.definition)
			entryPath.minLength = this.optional ? 0 : this.definition.length
			entryPath.maxLength = this.definition.length
			return entryPath
		}

		// if (this instanceof SubruleNode)

		// if (this instanceof Or) {
		// 	const branch = new DecisionBranch()
		// 	let overallMaxLength = 0
		// 	let overallMinLength = 0

		// 	for (const alternate of this.definition) {
		// 		const alternateEntryPath = alternate.getEntryPath(lookahead)
		// 		const maxLength = alternateEntryPath.maxLength
		// 		const minLength = alternateEntryPath.minLength
		// 		if (maxLength > overallMaxLength) overallMaxLength = maxLength
		// 		if (minLength > overallMinLength) overallMinLength = minLength

		// 		branch.push(alternateEntryPath)
		// 	}

		// 	entryPath.maxLength = overallMaxLength
		// 	entryPath.minLength = overallMinLength
		// 	entryPath.push(branch)
		// 	return entryPath
		// }

		for (const node of this.definition) {
			const nodeEntryPath = node.getEntryPath(lookahead - entryPath.minLength)
			let thingToPush = nodeEntryPath
			if (node.optional) {
				const branch = new DecisionBranch()
				branch.push(nodeEntryPath)
				branch.push(EMPTY_BRANCH)
				thingToPush = branch
			}

			entryPath.maxLength += nodeEntryPath.maxLength
			entryPath.minLength += nodeEntryPath.minLength
			entryPath.push(thingToPush)

			if (entryPath.minLength >= lookahead) break
		}

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

class AbstractSubruleNode extends ParseNode {
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

class SubruleNode extends AbstractSubruleNode {
	constructor(subrule) {
		super(subrule, false)
	}
}

class MaybeSubruleNode extends AbstractSubruleNode {
	constructor(subrule) {
		super(subrule, true)
	}
}

// this holds an array of tokens
class Consume extends ParseNode {}

class Maybe extends ParseNode {
	constructor(definition) {
		super(definition, true)
	}
}




function determineDecidingNode(inst) {
	if (inst instanceof MaybeSubruleNode) return [true, true]
	else return [false, [Maybe].some((cls) => inst instanceof cls)]
}

module.exports = {
	determineDecidingNode, Maybe, Consume, Subrule, SubruleNode
}
