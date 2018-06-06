function flatten(array) {
	const finalArray = []
	for (const item of array) {
		if (Array.isArray(item)) finalArray.push.apply(finalArray, item)
		else finalArray.push(item)
	}
	return finalArray
}

const { expect } = require('chai')

const Parser = require('../src/parser')
const lexing = require('kreia-moo')

const { matchToken, matchTokens } = lexing

const lexer = lexing.compile({
	LeftParen: '(',
	RightParen: ')',
	Num: /[0-9]+/,
	Space: / +/,
	Dot: '.',
	Plus: '+',
	Mult: '*',
})

const { LeftParen, RightParen, Num, Space, Dot, Plus, Mult } = lexer.tokenLibrary()


describe("basic tests for", () => {
	const basicParser = new Parser(lexer)

	const {
		inspecting, rule, subrule, maybeSubrule, gateSubrule,
		consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
	} = basicParser.getPrimitives()

	rule('testConsumeOne', () => {
		consume(Space)
		return consume(Num)
	})
	rule('testConsumeMultiple', () => {
		consume(Space)
		return consume(Num, Space, Num)
	})
	rule('testMaybeConsume', () => {
		consume(Space)
		return maybeConsume(Num)
	})
	rule('testMaybeConsumeMultiple', () => {
		consume(Space)
		return maybeConsume(Num, Space, Num)
	})

	rule('testMaybe', () => {
		consume(Space)
		return maybe(() => {
			consume(LeftParen, Dot)
			const num = consume(Num)
			consume(Dot, RightParen)
			return num
		})
	})

	rule('testOr', () => {
		consume(Space)
		return or(
			() => consume(LeftParen, LeftParen),
			() => consume(RightParen, RightParen),
		)
	})
	rule('testMaybeOr', () => {
		consume(Space)
		return maybeOr(
			() => consume(LeftParen, LeftParen),
			() => consume(RightParen, RightParen),
		)
	})

	rule('testMany', () => {
		consume(Space)
		return many(() => consume(Num, Dot))
	})
	rule('testMaybeMany', () => {
		consume(Space)
		return maybeMany(() => consume(Num, Dot))
	})

	rule('testManySeparated', () => {
		consume(Space)
		return manySeparated(
			() => consume(Num),
			() => consume(Space),
		)
	})
	rule('testMaybeManySeparated', () => {
		consume(Space)
		return maybeManySeparated(
			() => consume(Num),
			() => consume(Space),
		)
	})

	rule('targetSubrule', () => {
		consume(LeftParen, Dot)
		const num = consume(Num)
		consume(Dot, RightParen)
		return num
	})

	rule('testSubrule', () => {
		consume(Space, Dot)
		const targetResult = subrule('targetSubrule')
		consume(Dot, Space)
		return targetResult
	})

	rule('testMaybeSubrule', () => {
		consume(Space, Dot)
		const targetResult = maybeSubrule('targetSubrule')
		consume(Dot, Space)
		return targetResult
	})

	basicParser.analyze()

	let output

	it("testConsumeOne", () => {
		basicParser.reset(" 0")
		output = basicParser.testConsumeOne()
		expect(matchToken(output, Num)).to.be.true

		basicParser.reset(" ")
		expect(() => basicParser.testConsumeOne()).to.throw
	})
	it("testConsumeMultiple", () => {
		basicParser.reset(" 0 0")
		output = basicParser.testConsumeMultiple()
		expect(matchTokens(output, [Num, Space, Num])).to.be.true

		basicParser.reset(" ()")
		expect(() => basicParser.testConsumeMultiple()).to.throw
	})
	it("testMaybeConsume", () => {
		basicParser.reset(" 0")
		output = basicParser.testMaybeConsume()
		expect(matchToken(output, Num)).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybeConsume()
		expect(output).to.be.undefined

		basicParser.reset(" ()")
		expect(() => basicParser.testMaybeConsume()).to.throw
	})
	it("testMaybeConsumeMultiple", () => {
		basicParser.reset(" 0 0")
		output = basicParser.testMaybeConsumeMultiple()
		expect(matchToken(output, [Num, Space, Num])).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybeConsumeMultiple()
		expect(output).to.be.undefined

		basicParser.reset(" ()")
		expect(() => basicParser.testMaybeConsumeMultiple()).to.throw
	})

	it("testMaybe", () => {
		basicParser.reset(" (.0.)")
		output = basicParser.testMaybe()
		expect(matchToken(output, Num)).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybe()
		expect(output).to.be.undefined

		basicParser.reset(" 0")
		expect(() => basicParser.testMaybe()).to.throw

		basicParser.reset(" (..)")
		expect(() => basicParser.testMaybe()).to.throw
	})

	it("testOr", () => {
		basicParser.reset(" ((")
		output = basicParser.testOr()
		expect(matchTokens(output, [LeftParen, LeftParen])).to.be.true

		basicParser.reset(" ))")
		output = basicParser.testOr()
		expect(matchTokens(output, [RightParen, RightParen])).to.be.true

		basicParser.reset(" (")
		expect(() => basicParser.testOr()).to.throw

		basicParser.reset(" )")
		expect(() => basicParser.testOr()).to.throw

		basicParser.reset(" 0")
		expect(() => basicParser.testOr()).to.throw
	})
	it("testMaybeOr", () => {
		basicParser.reset(" ((")
		output = basicParser.testMaybeOr()
		expect(matchTokens(output, [LeftParen, LeftParen])).to.be.true

		basicParser.reset(" ))")
		output = basicParser.testMaybeOr()
		expect(matchTokens(output, [RightParen, RightParen])).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybeOr()
		expect(output).to.be.undefined

		basicParser.reset(" (")
		expect(() => basicParser.testMaybeOr()).to.throw

		basicParser.reset(" )")
		expect(() => basicParser.testMaybeOr()).to.throw

		basicParser.reset(" 0")
		expect(() => basicParser.testMaybeOr()).to.throw
	})

	it("testMany", () => {
		basicParser.reset(" 4.")
		output = basicParser.testMany()
		expect(matchTokens(flatten(output), [Num, Dot])).to.be.true

		basicParser.reset(" 4.4.")
		output = basicParser.testMany()
		expect(matchTokens(flatten(output), [Num, Dot, Num, Dot])).to.be.true

		basicParser.reset(" 4.4.4.")
		output = basicParser.testMany()
		expect(matchTokens(flatten(output), [Num, Dot, Num, Dot, Num, Dot])).to.be.true

		basicParser.reset(" ")
		expect(() => basicParser.testMany()).to.throw

		basicParser.reset(" .")
		expect(() => basicParser.testMany()).to.throw
	})
	it("testMaybeMany", () => {
		basicParser.reset(" 4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(flatten(output), [Num, Dot])).to.be.true

		basicParser.reset(" 4.4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(flatten(output), [Num, Dot, Num, Dot])).to.be.true

		basicParser.reset(" 4.4.4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(flatten(output), [Num, Dot, Num, Dot, Num, Dot])).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybeMany()
		expect(output).to.be.an('array').with.lengthOf(0)

		basicParser.reset(" .")
		expect(() => basicParser.testMaybeMany()).to.throw
	})

	it("testManySeparated", () => {
		basicParser.reset(" 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(flatten(output), [Num])).to.be.true

		basicParser.reset(" 0 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(flatten(output), [Num, Num])).to.be.true

		basicParser.reset(" 0 0 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(flatten(output), [Num, Num, Num])).to.be.true

		basicParser.reset(" ")
		expect(() => basicParser.testManySeparated()).to.throw

		basicParser.reset(" .")
		expect(() => basicParser.testManySeparated()).to.throw
	})
	it("testMaybeManySeparated", () => {
		basicParser.reset(" 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(flatten(output), [Num])).to.be.true

		basicParser.reset(" 0 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(flatten(output), [Num, Num])).to.be.true

		basicParser.reset(" 0 0 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(flatten(output), [Num, Num, Num])).to.be.true

		basicParser.reset(" ")
		output = basicParser.testMaybeManySeparated()
		expect(output).to.be.an('array').with.lengthOf(0)

		basicParser.reset(" .")
		expect(() => basicParser.testMaybeManySeparated()).to.throw
	})

	it("testSubrule", () => {
		basicParser.reset(" .(.4.). ")
		output = basicParser.testSubrule()
		expect(matchToken(output, Num)).to.be.true

		basicParser.reset(" .(..). ")
		expect(() => basicParser.testSubrule()).to.throw

		basicParser.reset("4")
		expect(() => basicParser.testSubrule()).to.throw

		basicParser.reset(" .. ")
		expect(() => basicParser.testSubrule()).to.throw
	})
	it("testMaybeSubrule", () => {
		basicParser.reset(" .(.4.). ")
		output = basicParser.testMaybeSubrule()
		expect(matchToken(output, Num)).to.be.true

		basicParser.reset(" .(..). ")
		expect(() => basicParser.testMaybeSubrule()).to.throw

		basicParser.reset("4")
		expect(() => basicParser.testMaybeSubrule()).to.throw

		basicParser.reset(" .. ")
		output = basicParser.testMaybeSubrule()
		expect(output).to.be.undefined
	})
})


describe("gate versions of functions", () => {
	const gateParser = new Parser(lexer)
	const {
		inspecting, rule, subrule, maybeSubrule, gateSubrule,
		consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
	} = gateParser.getPrimitives()

	const alwaysTrue = () => true
	const alwaysFalse = () => false

	rule("testTrueGateConsume", () => {
		consume(Space)
		return gateConsume(alwaysTrue, LeftParen, Num, RightParen)
	})
	rule("testFalseGateConsume", () => {
		consume(Space)
		return gateConsume(alwaysFalse, LeftParen, Num, RightParen)
	})

	rule("testTrueGate", () => {
		consume(Space)
		return gate(alwaysTrue, () => consume(Dot))
	})
	rule("testFalseGate", () => {
		consume(Space)
		return gate(alwaysFalse, () => consume(Dot))
	})

	rule("testTrueGateOr", () => {
		consume(Space)
		return gateOr(alwaysTrue,
			() => consume(Mult),
			() => consume(Plus)
		)
	})
	rule("testFalseGateOr", () => {
		consume(Space)
		return gateOr(alwaysFalse,
			() => consume(Mult),
			() => consume(Plus)
		)
	})

	rule("testTrueOrChoiceGate", () => {
		consume(Space)
		return or(
			{ gate: alwaysTrue, func: () => consume(Mult) },
			() => consume(Plus)
		)
	})

	rule("testFalseOrChoiceGate", () => {
		consume(Space)
		return or(
			{ gate: alwaysFalse, func: () => consume(Mult) },
			() => consume(Plus)
		)
	})

	rule("testTrueGateMany", () => {
		consume(Space)
		return gateMany(alwaysTrue, () => consume(Dot))
	})
	rule("testFalseGateMany", () => {
		consume(Space)
		return gateMany(alwaysFalse, () => consume(Dot))
	})

	rule("testTrueGateManySeparated", () => {
		consume(Space)
		return gateManySeparated(alwaysTrue,
			() => consume(Num),
			() => consume(Dot)
		)
	})
	rule("testFalseGateManySeparated", () => {
		consume(Space)
		return gateManySeparated(alwaysFalse,
			() => consume(Num),
			() => consume(Dot)
		)
	})

	gateParser.analyze()

	it("testTrueGateConsume", () => {
		gateParser.reset(" ")
		output = gateParser.testTrueGateConsume()
		expect(output).to.be.undefined

		gateParser.reset(" (0)")
		output = gateParser.testTrueGateConsume()
		expect(matchTokens(output, [LeftParen, Num, RightParen])).to.be.true
	})
	it("testFalseGateConsume", () => {
		gateParser.reset(" ")
		output = gateParser.testFalseGateConsume()
		expect(output).to.be.undefined

		gateParser.reset(" (0)")
		expect(() => gateParser.testFalseGateConsume()).to.throw
	})

	it("testTrueGate", () => {
		gateParser.reset(" ")
		output = gateParser.testTrueGate()
		expect(output).to.be.undefined

		gateParser.reset(" .")
		output = gateParser.testTrueGate()
		expect(matchToken(output, Dot)).to.be.true
	})
	it("testFalseGate", () => {
		gateParser.reset(" ")
		output = gateParser.testFalseGate()
		expect(output).to.be.undefined

		gateParser.reset(" .")
		expect(() => gateParser.testFalseGate()).to.throw
	})

	it("testTrueGateOr", () => {
		gateParser.reset(" ")
		output = gateParser.testTrueGateOr()
		expect(output).to.be.undefined

		gateParser.reset(" +")
		output = gateParser.testTrueGateOr()
		expect(matchToken(output, Plus)).to.be.true

		gateParser.reset(" *")
		output = gateParser.testTrueGateOr()
		expect(matchToken(output, Mult)).to.be.true
	})
	it("testFalseGateOr", () => {
		gateParser.reset(" ")
		output = gateParser.testFalseGateOr()
		expect(output).to.be.undefined

		gateParser.reset(" +")
		expect(() => gateParser.testFalseGateOr()).to.throw

		gateParser.reset(" *")
		expect(() => gateParser.testFalseGateOr()).to.throw
	})

	it("testTrueOrChoiceGate", () => {
		gateParser.reset(" ")
		expect(() => gateParser.testTrueOrChoiceGate()).to.throw

		gateParser.reset(" +")
		output = gateParser.testTrueOrChoiceGate()
		expect(matchToken(output, Plus)).to.be.true

		gateParser.reset(" *")
		output = gateParser.testTrueOrChoiceGate()
		expect(matchToken(output, Mult)).to.be.true
	})
	it("testFalseOrChoiceGate", () => {
		gateParser.reset(" ")
		expect(() => gateParser.testFalseOrChoiceGate()).to.throw

		gateParser.reset(" +")
		output = gateParser.testFalseOrChoiceGate()
		expect(matchToken(output, Plus)).to.be.true

		gateParser.reset(" *")
		expect(() => gateParser.testFalseOrChoiceGate()).to.throw
	})

	it("testTrueGateMany", () => {
		gateParser.reset(" ")
		output = gateParser.testTrueGateMany()
		expect(output).eql([])

		gateParser.reset(" .")
		output = gateParser.testTrueGateMany()
		expect(matchTokens(output, [Dot])).to.be.true

		gateParser.reset(" ..")
		output = gateParser.testTrueGateMany()
		expect(matchTokens(output, [Dot, Dot])).to.be.true
	})
	it("testFalseGateMany", () => {
		gateParser.reset(" ")
		output = gateParser.testFalseGateMany()
		expect(output).eql([])

		gateParser.reset(" .")
		expect(() => gateParser.testFalseGateMany()).to.throw

		gateParser.reset(" ..")
		expect(() => gateParser.testFalseGateMany()).to.throw
	})

	it("testTrueGateManySeparated", () => {
		gateParser.reset(" ")
		output = gateParser.testTrueGateManySeparated()
		expect(output).eql([])

		gateParser.reset(" 4")
		output = gateParser.testTrueGateManySeparated()
		expect(matchTokens(output, [Num])).to.be.true

		gateParser.reset(" 4.4")
		output = gateParser.testTrueGateManySeparated()
		expect(matchTokens(output, [Num, Num])).to.be.true
	})
	it("testFalseGateManySeparated", () => {
		gateParser.reset(" ")
		output = gateParser.testFalseGateManySeparated()
		expect(output).eql([])

		gateParser.reset(" 4")
		expect(() => gateParser.testFalseGateManySeparated()).to.throw

		gateParser.reset(" 4.4")
		expect(() => gateParser.testFalseGateManySeparated()).to.throw
	})
})

describe("args and custom lookahead", () => {
	const optionsParser = new Parser(lexer)
	const {
		inspecting, rule, subrule, maybeSubrule, gateSubrule,
		consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
	} = optionsParser.getPrimitives()

	const args = [1, 2]
	const lookahead = 4

	rule("testOptionsOr", () => {
		function wearOut() {
			consume(LeftParen, Num, RightParen)
		}
		return or({
			args, lookahead, func: (num1, num2) => {
				wearOut()
				maybeConsume(Space)
				consume(Plus)
				return `plus${num1 + num2}`
			}
		}, {
			args, lookahead, func: (num1, num2) => {
				wearOut()
				maybeConsume(Space)
				consume(Mult)
				return `mult${num1 + num2}`
			}
		},
		() => {
			wearOut()
			return 1
		})
	})

	rule("hasArgs", (num1, num2) => {
		consume(LeftParen, Num, RightParen)
		maybeConsume(Space)
		consume(Plus)
		return num1 + num2
	}, lookahead)

	rule("testLookaheadSubrule", () => {
		const output = maybeSubrule('hasArgs', ...args)
		consume(LeftParen, Num, RightParen, Mult)
		return output
	})

	rule("testArgsMaybe", () => {
		consume(Space)
		return maybe((num1, num2) => {
			consume(LeftParen, Num, RightParen)
			return num1 + num2
		}, ...args)
	})

	rule("testOptionsMaybe", () => {
		const output = maybe({
			lookahead,
			func: (num1, num2) => {
				consume(LeftParen, Num, RightParen)
				maybeConsume(Space)
				consume(Plus)
				return num1 + num2
			}
		}, ...args)
		consume(LeftParen, Num, RightParen, Mult)

		return output
	})

	rule("testArgsMany", () => {
		consume(Space)
		return many((num1, num2) => {
			consume(LeftParen, Num, RightParen)
			return num1 + num2
		}, ...args)
	})

	rule("testArgsMaybeMany", () => {
		consume(Space)
		return maybeMany((num1, num2) => {
			consume(LeftParen, Num, RightParen)
			return num1 + num2
		}, ...args)
	})

	rule("testOptionsMany", () => {
		const output = maybeMany({
			lookahead,
			func: (num1, num2) => {
				consume(LeftParen, Num, RightParen)
				maybeConsume(Space)
				consume(Plus)
				return num1 + num2
			}
		}, ...args)
		consume(LeftParen, Num, RightParen, Mult)

		return output
	})

	rule("testArgsManySeparated", () => {
		consume(Space)
		return manySeparated(
			(num1, num2) => {
				consume(LeftParen, Num, RightParen)
				return num1 + num2
			},
			() => consume(Dot),
			...args
		)
	})

	rule("testArgsMaybeManySeparated", () => {
		consume(Space)
		return maybeManySeparated(
			(num1, num2) => {
				consume(LeftParen, Num, RightParen)
				return num1 + num2
			},
			() => consume(Dot),
			...args
		)
	})

	let testOptionsManySeparatedSepStack = []
	rule("testOptionsManySeparated", () => {
		const output = maybeManySeparated({
			lookahead, args,
			func: (num1, num2) => {
				consume(LeftParen, Num, RightParen)
				maybeConsume(Space)
				consume(Plus)
				return num1 + num2
			}
		}, {
			lookahead, args: [0],
			func: (sepArg) => {
				consume(LeftParen, Num, RightParen)
				maybeConsume(Space)
				consume(Dot)
				if (inspecting()) return
				testOptionsManySeparatedSepStack.push(sepArg)
			}
		})
		consume(LeftParen, Num, RightParen, Mult)

		return output
	})

	optionsParser.analyze()


	let output

	it("testOptionsOr", () => {
		optionsParser.reset("(0)+")
		output = optionsParser.testOptionsOr()
		expect(output).to.equal("plus3")

		optionsParser.reset("(0)*")
		output = optionsParser.testOptionsOr()
		expect(output).to.equal("mult3")

		optionsParser.reset("(0)")
		output = optionsParser.testOptionsOr()
		expect(output).to.equal(1)
	})

	it("testLookaheadSubrule", () => {
		optionsParser.reset("(0)+(0)*")
		output = optionsParser.testLookaheadSubrule()
		expect(output).to.equal(3)

		optionsParser.reset("(0)*")
		output = optionsParser.testLookaheadSubrule()
		expect(output).to.be.undefined
	})

	it("testArgsMaybe", () => {
		optionsParser.reset(" (0)")
		output = optionsParser.testArgsMaybe()
		expect(output).to.equal(3)

		optionsParser.reset(" ")
		output = optionsParser.testArgsMaybe()
		expect(output).to.be.undefined
	})

	it("testOptionsMaybe", () => {
		optionsParser.reset("(0)+(0)*")
		output = optionsParser.testOptionsMaybe()
		expect(output).to.equal(3)

		optionsParser.reset("(0)*")
		output = optionsParser.testOptionsMaybe()
		expect(output).to.be.undefined
	})

	it("testOptionsMany", () => {
		optionsParser.reset("(0)+(0)*")
		output = optionsParser.testOptionsMany()
		expect(output).to.eql([3])

		optionsParser.reset("(0)+(0)+(0)+(0)*")
		output = optionsParser.testOptionsMany()
		expect(output).to.eql([3, 3, 3])

		optionsParser.reset("(0)*")
		output = optionsParser.testOptionsMany()
		expect(output).to.eql([])
	})

	it("testArgsMany", () => {
		optionsParser.reset(" ")
		expect(() => optionsParser.testArgsMany()).to.throw

		optionsParser.reset(" (0)")
		output = optionsParser.testArgsMany()
		expect(output).to.eql([3])

		optionsParser.reset(" (0)(0)")
		output = optionsParser.testArgsMany()
		expect(output).to.eql([3, 3])
	})

	it("testArgsMaybeMany", () => {
		optionsParser.reset(" ")
		output = optionsParser.testArgsMaybeMany()
		expect(output).to.eql([])

		optionsParser.reset(" (0)")
		output = optionsParser.testArgsMaybeMany()
		expect(output).to.eql([3])

		optionsParser.reset(" (0)(0)")
		output = optionsParser.testArgsMaybeMany()
		expect(output).to.eql([3, 3])
	})

	it("testArgsManySeparated", () => {
		optionsParser.reset(" ")
		expect(() => optionsParser.testArgsManySeparated()).to.throw

		optionsParser.reset(" (0)")
		output = optionsParser.testArgsManySeparated()
		expect(output).to.eql([3])

		optionsParser.reset(" (0).(0)")
		output = optionsParser.testArgsManySeparated()
		expect(output).to.eql([3, 3])
	})

	it("testArgsMaybeManySeparated", () => {
		optionsParser.reset(" ")
		output = optionsParser.testArgsMaybeManySeparated()
		expect(output).to.eql([])

		optionsParser.reset(" (0)")
		output = optionsParser.testArgsMaybeManySeparated()
		expect(output).to.eql([3])

		optionsParser.reset(" (0).(0)")
		output = optionsParser.testArgsMaybeManySeparated()
		expect(output).to.eql([3, 3])
	})

	it("testOptionsManySeparated", () => {
		optionsParser.reset("(0)+(0)*")
		output = optionsParser.testOptionsManySeparated()
		expect(output).to.eql([3])
		expect(testOptionsManySeparatedSepStack).to.eql([])

		optionsParser.reset("(0)+(0).(0)+(0).(0)+(0)*")
		output = optionsParser.testOptionsManySeparated()
		expect(output).to.eql([3, 3, 3])
		expect(testOptionsManySeparatedSepStack).to.eql([0, 0])
		testOptionsManySeparatedSepStack = []

		optionsParser.reset("(0)*")
		output = optionsParser.testOptionsManySeparated()
		expect(output).to.eql([])
		expect(testOptionsManySeparatedSepStack).to.eql([])
	})


	describe("situations that fail with small lookahead", () => {
		it("manySeparated with long distance", () => {
			const failingParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = failingParser.getPrimitives()

			rule('similarManyAfter', () => {
				maybeManySeparated(
					() => {
						// this will take up more space than the lookahead distance will allow
						// so the parser will take this route when it shouldn't
						consume(LeftParen, Num, RightParen)
						maybeConsume(Space)
						// this plus won't be picked up
						consume(Mult)
					},
					() => {
						maybeConsume(Space)
						consume(Dot)
						maybeConsume(Space)
					}
				)

				consume(LeftParen, Num, RightParen, Plus, LeftParen, RightParen)
			})

			failingParser.analyze()
			// this has the many sep, so it will pass
			// the separator will save it
			failingParser.reset("(0)*(4)+()")
			expect(() => failingParser.similarManyAfter()).to.not.throw

			// same thing here. as long as the parser enters the manysep, it will be fine from there
			failingParser.reset("(0)*.(0)*(4)+()")
			expect(() => failingParser.similarManyAfter()).to.not.throw

			// but when that manysep isn't really there, it won't have the lookahead distance to know it shouldn't enter
			failingParser.reset("(4)+()")
			expect(() => failingParser.similarManyAfter()).to.throw
		})
	})

	it("custom lookahead solves ambiguity errors", () => {
		const moreLookaheadParser = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = moreLookaheadParser.getPrimitives()

		rule('similarManyAfter', () => {
			maybeManySeparated({
				// let's just bump the lookahead here
				lookahead: 4,
				func: () => {
					consume(LeftParen, Num, RightParen)
					maybeConsume(Space)
					// now this will be picked up
					consume(Mult)
				}
			},
			() => {
				maybeConsume(Space)
				consume(Dot)
				maybeConsume(Space)
			})

			consume(LeftParen, Num, RightParen, Plus, LeftParen, RightParen)
		})

		moreLookaheadParser.analyze()
		moreLookaheadParser.reset("(0)*(4)+()")
		expect(() => moreLookaheadParser.similarManyAfter()).to.not.throw

		moreLookaheadParser.reset("(0)*.(0)*(4)+()")
		expect(() => moreLookaheadParser.similarManyAfter()).to.not.throw

		moreLookaheadParser.reset("(4)+()")
		expect(() => moreLookaheadParser.similarManyAfter()).to.not.throw
	})
})


describe("tricky parsing situations", () => {
	it("potentially ambiguous manySeparated", () => {
		const trickyParser = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = trickyParser.getPrimitives()

		rule('similarManyAfter', () => {
			maybeManySeparated(
				() => {
					// this will eat up the lookahead distance
					consume(LeftParen, Num, RightParen)
				},
				() => {
					maybeConsume(Space)
					consume(Dot)
					maybeConsume(Space)
				}
			)

			// the thing we're trying to know is if the parser is smart enough to not treat this as part of the manySep
			// we're probably abusing the default lookahead distance of 3
			consume(LeftParen, Num, RightParen, Plus)
		})

		trickyParser.analyze()

		trickyParser.reset("(0)(4)+")
		expect(() => trickyParser.similarManyAfter()).to.not.throw

		trickyParser.reset("(0).(0) .(0). (0) . (0)(4)+")
		expect(() => trickyParser.similarManyAfter()).to.not.throw
	})
})


describe("error checking", () => {
	describe("catches all optional definitions", () => {
		it("entire rule", () => {
			const allOptionalParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = allOptionalParser.getPrimitives()

			rule('A', () => {
				maybeConsume(Space, Dot)
				maybe(() => {
					consume(Dot)
					many(() => {
						consume(LeftParen, Num, RightParen)
					})
					consume(Dot)
				})
				maybeConsume(Dot, Space)
			})

			expect(() => allOptionalParser.analyze()).to.throw
		})

		it("nested maybe", () => {
			const allOptionalParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = allOptionalParser.getPrimitives()

			expect(() => {
				rule('B', () => {
					consume(Space, Dot)
					maybe(() => {
						maybeConsume(Dot)
						maybeMany(() => {
							consume(LeftParen, Num, RightParen)
						})
						maybeConsume(Dot)
					})
				})
			}).to.throw
		})
	})


	it("catches empty rules", () => {
		const emptyParser = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = emptyParser.getPrimitives()

		expect(() => {
			rule('A', () => {
				return 4
			})
		}).to.throw
	})

	it("catches unresolved subrules", () => {
		const unresolvedParser = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = unresolvedParser.getPrimitives()

		rule('A', () => {
			consume(Space)
			subrule('B')
		})

		expect(() => unresolvedParser.analyze()).to.throw
	})

	describe("left recursion", () => {
		it("works for obvious ones", () => {
			const leftRecursiveParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = leftRecursiveParser.getPrimitives()

			rule('A', () => {
				maybeConsume(Num)
				subrule('B')
			})

			rule('B', () => {
				maybeConsume(Num)
				subrule('A')
			})

			expect(() => leftRecursiveParser.analyze()).to.throw
		})

		it("works for nested ones", () => {
			const leftRecursiveParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = leftRecursiveParser.getPrimitives()

			rule('A', () => {
				maybeConsume(Num)
				subrule('B')
			})

			rule('B', () => {
				maybeConsume(Num)
				subrule('C')
			})

			rule('C', () => {
				maybeConsume(Num)
				subrule('D')
			})

			rule('D', () => {
				maybeConsume(Num)
				subrule('A')
			})

			expect(() => leftRecursiveParser.analyze()).to.throw
		})

		it("doesn't incorrectly throw on safe recursion", () => {
			const safeRecursiveParser = new Parser(lexer)
			const {
				inspecting, rule, subrule, maybeSubrule, gateSubrule,
				consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
				many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
			} = safeRecursiveParser.getPrimitives()

			rule('A', () => {
				maybeConsume(Space)
				consume(LeftParen)
				subrule('B')
				consume(RightParen)
			})

			rule('B', () => {
				maybeConsume(Space)
				consume(Dot)
				subrule('A')
				consume(Dot)
			})

			expect(() => safeRecursiveParser.analyze()).to.not.throw
		})
	})
})


describe("fuller grammars", () => {
	it("tiny calculator", () => {
		const tinyCalculator = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = tinyCalculator.getPrimitives()

		rule('binaryExpression', () => {
			const a = subrule('atomicExpression')

			const next = maybe(() => {
				maybeConsume(Space)
				const op = or(
					() => consume(Plus).value,
					() => consume(Mult).value,
				)
				maybeConsume(Space)
				const b = subrule('binaryExpression')
				return [op, b]
			})

			if (inspecting()) return
			if (!next) return a

			const [op, b] = next
			if (op == '+') return a + b
			if (op == '*') return a * b
		})

		rule('parenExpression', () => {
			consume(LeftParen)
			maybeConsume(Space)
			const expressionResult = subrule('binaryExpression')
			maybeConsume(Space)
			consume(RightParen)
			return expressionResult
		})

		rule('atomicExpression', () => {
			return or(
				() => subrule('parenExpression'),
				() => subrule('number'),
			)
		})

		rule('number', () => {
			const numToken = consume(Num)
			if (inspecting()) return
			return parseInt(numToken.value)
		})

		tinyCalculator.analyze()

		function expectParseTo(input, expectedOutput) {
			tinyCalculator.reset(input)
			let output = tinyCalculator.binaryExpression()
			expect(output).equal(expectedOutput)
		}

		expectParseTo("4 + 4", 8)
		expectParseTo("4 * 4", 16)

		expectParseTo("4 * 4 * 2", 32)

		expectParseTo("(1 + 1 + 1) * 2 * 2 * (1 + 1 + 1)", 36)
	})


	it("mini json", () => {
		const lexer = lexing.compile({
			Primitive: ['null', 'undefined', 'true', 'false'],
			Str: /"(?:\\["\\]|[^\n"\\])*"/,
			Num: /[0-9]+/,
			Comma: ',',
			LeftBracket: '[', RightBracket: ']',
			LeftBrace: '{', RightBrace: '}',
			Colon: ':',
			Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
		})

		const { Primitive, Str, Num, Comma, LeftBracket, RightBracket, LeftBrace, RightBrace, Colon } = lexer.tokenLibrary()
		const miniJson = new Parser(lexer)
		const {
			inspecting, rule, subrule, maybeSubrule, gateSubrule,
			consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
			many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = miniJson.getPrimitives()

		rule('jsonEntity', () => {
			or(
				() => subrule('array'),
				() => subrule('object'),
				() => consume(Str),
				() => consume(Num),
				() => consume(Primitive),
			)
		})

		function separatedByCommas(func) {
			maybeManySeparated(
				func,
				() => consume(Comma),
			)
		}

		rule('array', () => {
			consume(LeftBracket)
			separatedByCommas(() => subrule('jsonEntity'))
			consume(RightBracket)
		})

		rule('object', () => {
			consume(LeftBrace)
			separatedByCommas(() => {
				consume(Str, Colon)
				subrule('jsonEntity')
			})
			consume(RightBrace)
		})

		function expectCanParse(input) {
			miniJson.reset(input)
			expect(() => miniJson.jsonEntity()).to.not.throw
		}

		expectCanParse(`1`)
		expectCanParse(`null`)
		expectCanParse(`true`)
		expectCanParse(`""`)
		expectCanParse(`"various stuff"`)
		expectCanParse(`[1, 2, 3, 4]`)
		expectCanParse(`{ "stuff": null, "other": [], "things": {} }`)

		miniJson.reset("not valid")
		expect(() => miniJson.jsonEntity()).to.throw
	})
})
