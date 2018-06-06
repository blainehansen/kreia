const { DecisionPath, DecisionBranch, EMPTY_BRANCH, UNKNOWN_AFTER } = require('./decision-paths')


function subclassOf(BClass, AClass) {
	return BClass.prototype instanceof AClass || BClass === AClass
}

const NO_LOOKAHEAD = Symbol()

class ParseNode {
	constructor(definition, optional, lookahead, check = true) {
		const isArray = definition instanceof Array
		if (definition !== null && !isArray) throw new Error("tried to create a parseNode with something other than an Array or null")

		if (isArray && definition.length <= 0) throw new Error("tried to create a rule without any parse functions in it")

		if (check && definition !== null && definition.every((node) => node.optional)) {
			console.log(definition)
			throw new Error("A definition was given where everything was optional. Instead of making all the items within something optional, make the whole thing optional.")
		}

		if ((typeof lookahead != 'number' || lookahead <= 0) && lookahead !== NO_LOOKAHEAD) {
			console.log('lookahead: ', lookahead)
			throw new Error(`An invalid lookahead was passed: ${lookahead}`)
		}

		this.definition = definition
		this.optional = optional
		this.lookahead = lookahead
	}

	static getLinearEntryPath(definition, lookahead) {
		let entryPath = new DecisionPath()

		let brokeEarly = false
		for (const node of definition) {
			const remainingLookahead = lookahead - entryPath.minLength
			if (remainingLookahead <= 0) {
				brokeEarly = true
				break
			}

			const [nodeBrokeEarly, nodeEntryPath] = node.getInlineEntryPath(remainingLookahead)

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

			if (nodeBrokeEarly && !node.optional) {
				brokeEarly = true
				break
			}
		}

		if (brokeEarly) entryPath.push(UNKNOWN_AFTER)
		return [brokeEarly, entryPath]
	}

	getRootEntryPath() {
		const lookahead = this.lookahead
		const [, entryPath] = this.getInlineEntryPath(lookahead)
		return entryPath
	}

	getInlineEntryPath(lookahead) {
		return ParseNode.getLinearEntryPath(this.definition, lookahead)
	}
}

class Subrule {
	constructor(definition, ruleName, ruleFunction, lookahead) {
		this.definition = definition
		this.ruleName = ruleName
		this.ruleFunction = ruleFunction
		this.lookahead = lookahead
	}
}

class SubruleNode extends ParseNode {
	constructor(subrule, optional) {
		if (subrule && !(subrule instanceof Subrule)) throw new Error("can't put anything other than a subrule into a subrule wrapper")
		const { definition, lookahead } = subrule ? subrule : { definition: null, lookahead: NO_LOOKAHEAD }
		super(definition, optional, lookahead)
		this.resolved = !!subrule
		this.subrule = subrule
	}

	resolveWith(subrule) {
		if (!(subrule instanceof Subrule)) throw new Error("can't put anything other than a subrule into a subrule wrapper")

		if (this.resolved) throw new Error("SubruleNode has already been resolved")
		this.definition = subrule.definition
		this.lookahead = subrule.lookahead
		this.resolved = true
		this.subrule = subrule
	}
}


// this holds an array of tokens
class Consume extends ParseNode {
	constructor(definition, optional) {
		super(definition, optional, NO_LOOKAHEAD, false)
	}

	// don't have to worry about runtime entry path

	getInlineEntryPath() {
		const entryPath = new DecisionPath()

		entryPath.push(this.definition)
		const length = this.definition.length
		entryPath.minLength = length
		entryPath.maxLength = length
		return [false, entryPath]
	}
}

class Maybe extends ParseNode {
	constructor(definition, lookahead) {
		super(definition, true, lookahead)
	}
}

class Or extends ParseNode {
	constructor(definition, optional) {
		super(definition, optional, NO_LOOKAHEAD)
	}

	getRootEntryPath() {
		const [, , alternates] = this.getAlternatesEntryPaths()
		return alternates
	}

	getAlternatesEntryPaths(lookahead = undefined) {
		let largestMaxLength = 0
		let smallestMinLength = 0
		const alternates = []
		for (const { definition, lookahead: objLookahead } of this.definition) {
			const actualLookahead = lookahead || objLookahead
			const [, choiceEntryPath] = ParseNode.getLinearEntryPath(definition, actualLookahead)
			const maxLength = choiceEntryPath.maxLength
			const minLength = choiceEntryPath.minLength
			if (maxLength > largestMaxLength) largestMaxLength = maxLength
			if (smallestMinLength == 0 || minLength < smallestMinLength) smallestMinLength = minLength

			alternates.push(choiceEntryPath)
		}

		return [smallestMinLength, largestMaxLength, alternates]
	}

	getInlineEntryPath(lookahead) {
		const [smallestMinLength, largestMaxLength, alternates] = this.getAlternatesEntryPaths(lookahead)
		const branch = new DecisionBranch()
		branch.branches = alternates

		const entryPath = new DecisionPath()
		entryPath.maxLength = largestMaxLength
		entryPath.minLength = smallestMinLength
		entryPath.push(branch)
		return [false, entryPath]
	}
}

class Many extends ParseNode {
	constructor(definition, optional, lookahead) {
		super(definition, optional, lookahead)
		// many doesn't need a decision if the definition is tokens or a subrule
	}

	getInlineEntryPath(lookahead) {
		const [, entryPath] = ParseNode.getLinearEntryPath(this.definition, lookahead)
		entryPath.push(UNKNOWN_AFTER)
		return [true, entryPath]
	}
}

class ManySeparated extends Many {
	constructor(definition, separator, optional) {
		super([definition, separator], optional, NO_LOOKAHEAD)
	}

	// this needs to be the enter and the continue, both with their embedded lookahead
	getRootEntryPath() {
		const { definition: defDefinition, lookahead: defLookahead } = this.definition[0]
		const [, enterDecisionPath] = ParseNode.getLinearEntryPath(defDefinition, defLookahead)

		const { definition: sepDefinition, lookahead: sepLookahead } = this.definition[1]
		const [separatorBrokeEarly, separatorDecisionPath] = ParseNode.getLinearEntryPath(sepDefinition, sepLookahead)

		const continueDecisionPath = separatorDecisionPath
		// if sep path broke early, don't append def onto it
		if (!separatorBrokeEarly) {
			continueDecisionPath.push(enterDecisionPath)
			continueDecisionPath.minLength += enterDecisionPath.minLength
			continueDecisionPath.maxLength += enterDecisionPath.maxLength
		}

		return [enterDecisionPath, continueDecisionPath]
	}

	// this needs to be a single path created from the passed lookahead
	getInlineEntryPath(lookahead) {
		const { definition: defDefinition } = this.definition[0]
		const [enterBrokeEarly, enterDecisionPath] = ParseNode.getLinearEntryPath(defDefinition, lookahead)

		const remainingLookahead = lookahead - enterDecisionPath.minLength
		if (enterBrokeEarly || remainingLookahead <= 0) {
			enterDecisionPath.push(UNKNOWN_AFTER)
			return [true, enterDecisionPath]
		}

		const totalEntryPath = new DecisionPath()
		totalEntryPath.push(enterDecisionPath)
		totalEntryPath.minLength += enterDecisionPath.minLength
		totalEntryPath.maxLength += enterDecisionPath.maxLength

		const { definition: sepDefinition } = this.definition[1]
		const [separatorBrokeEarly, separatorDecisionPath] = ParseNode.getLinearEntryPath(sepDefinition, remainingLookahead)

		// if sep didn't break early, and if there's some space in the lookahead, append one more
		if (!separatorBrokeEarly && separatorDecisionPath.minLength < remainingLookahead) {
			separatorDecisionPath.push(enterDecisionPath)
			separatorDecisionPath.minLength += enterDecisionPath.minLength
			separatorDecisionPath.maxLength += enterDecisionPath.maxLength
		}

		let continuationBranch = new DecisionBranch()
		continuationBranch.push(separatorDecisionPath)
		continuationBranch.push(EMPTY_BRANCH)
		totalEntryPath.push(continuationBranch)
		// we wouldn't do this because the separator is optional, it doesn't contribute to the guaranteed minLength
		// totalEntryPath.minLength += separatorDecisionPath.minLength
		totalEntryPath.maxLength += separatorDecisionPath.maxLength

		// we put this on the separator path because if the continuation isn't taken, they could keep checking
		separatorDecisionPath.push(UNKNOWN_AFTER)
		return [false, totalEntryPath]
	}
}


function isDecidingNode(inst) {
	return !(inst instanceof Consume || inst instanceof SubruleNode)
}

function isNestedNode(inst) {
	return inst instanceof Or || inst instanceof ManySeparated
}

function isRecurringNode(inst) {
	return !(inst instanceof Consume)
}

module.exports = {
	isDecidingNode, isNestedNode, isRecurringNode, Maybe, Consume, Subrule, SubruleNode, Or, Many, ManySeparated
}
