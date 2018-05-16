function matchToken(token, tokenType) {
	if (token === undefined) return false
	console.log(token.type)
	console.log(tokenType)
	return token.type == tokenType
}

const EMPTY_BRANCH = Symbol()
const TERMINATE_NODE = Symbol()

function matchAndTrimTokens(tokens, tokenTypes) {
	// console.log('matching and trimming')
	// console.log('tokens: ', tokens)
	// console.log('tokenTypes: ', tokenTypes)
	for (const [index, tokenType] of tokenTypes.entries()) {
		const token = tokens[index]
		// console.log('tokenType: ', tokenType)
		// console.log('token: ', token)

		if (!matchToken(token, tokenType)) return false
	}

	tokens = tokens.slice()
	tokens.splice(0, tokenTypes.length)
	return tokens
}

class DecisionPath {
	constructor() {
		this.path = []
		this.maxLength = 0
		this.minLength = 0
	}

	push(tokenListOrBranch) {
		if (tokenListOrBranch instanceof DecisionPath) {
			this.path.push.apply(this.path, tokenListOrBranch.path)
			// not doing this in favor of doing it when we push
			// this.maxLength += tokenListOrBranch.maxLength
			// this.minLength += tokenListOrBranch.minLength
		}
		else if (!(tokenListOrBranch instanceof DecisionBranch) && !(tokenListOrBranch instanceof Array)) {
			console.log(tokenListOrBranch)
			throw "paths can only hold paths, arrays of tokens, or branches"
		}
		else this.path.push(tokenListOrBranch)
	}

	testAgainstTokens(tokenList) {
		// console.log('path testing against: ', tokenList)

		let terminated = false
		for (const tokenListOrBranch of this.path) {
			if (tokenListOrBranch === TERMINATE_NODE) {
				return [true, tokenList]
			}

			// console.log('encountering: ', tokenListOrBranch)
			terminated = false
			if (tokenListOrBranch instanceof DecisionBranch) {
				// this replaces the tokenList with one that has been trimmed because of a successful match
				[, terminated, tokenList] = tokenListOrBranch.testAgainstTokens(tokenList)
			}
			else {
				tokenList = matchAndTrimTokens(tokenList, tokenListOrBranch)
			}
			// console.log('new tokenList: ', tokenList)

			if (terminated || tokenList === false) {
				return [terminated, tokenList]
			}
		}

		return [terminated, tokenList]
	}
}

class DecisionBranch {
	constructor() {
		this.branches = []
	}

	push(path) {
		if (!(path instanceof DecisionPath) && path !== EMPTY_BRANCH) {
			console.log(path)
			throw "branches can only hold paths"
		}
		else this.branches.push(path)
	}

	testAgainstTokens(tokenList) {
		// console.log('branch testing against: ', tokenList)

		for (const [whichIndex, path] of this.branches.entries()) {
			// console.log('encountering: ', path)
			// we got to the end of an optional branch
			if (path === EMPTY_BRANCH) {
				return [-1, false, tokenList]
			}

			const [terminated, newTokenList] = path.testAgainstTokens(tokenList)

			// console.log('new tokenList: ', newTokenList)
			if (terminated || newTokenList !== false) {
				return [whichIndex, terminated, newTokenList]
			}
		}

		return [-1, false, false]
	}
}

module.exports = { DecisionPath, DecisionBranch, EMPTY_BRANCH, TERMINATE_NODE, matchToken }


// const trunk = new DecisionPath()
// trunk.push(['String', 'Space', 'LeftParen'])

// const branch = new DecisionBranch()
// const subPath = new DecisionPath()
// subPath.push(['Number', 'RightParen', 'Number'])
// branch.push(subPath)
// branch.push(EMPTY_BRANCH)
// trunk.push(branch)

// trunk.push(['Space', 'Number'])

// log(trunk)

// log(trunk.testAgainstTokens(['String', 'Space', 'LeftParen', 'Space', 'Number', 'stuff']))
