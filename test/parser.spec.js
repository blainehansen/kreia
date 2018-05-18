const { expect } = require('chai')

const Parser = require('../src/parser')
const lexing = require('../src/lexing')

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
		look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
		or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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
		expect(matchTokens(output, [Num, Dot]))

		basicParser.reset(" 4.4.")
		output = basicParser.testMany()
		expect(matchTokens(output, [Num, Dot, Num, Dot]))

		basicParser.reset(" 4.4.4.")
		output = basicParser.testMany()
		expect(matchTokens(output, [Num, Dot, Num, Dot, Num, Dot]))

		basicParser.reset(" ")
		expect(() => basicParser.testMany()).to.throw

		basicParser.reset(" .")
		expect(() => basicParser.testMany()).to.throw
	})
	it("testMaybeMany", () => {
		basicParser.reset(" 4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(output, [Num, Dot]))

		basicParser.reset(" 4.4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(output, [Num, Dot, Num, Dot]))

		basicParser.reset(" 4.4.4.")
		output = basicParser.testMaybeMany()
		expect(matchTokens(output, [Num, Dot, Num, Dot, Num, Dot]))

		basicParser.reset(" ")
		output = basicParser.testMaybeMany()
		expect(output).to.be.undefined

		basicParser.reset(" .")
		expect(() => basicParser.testMaybeMany()).to.throw
	})

	it("testManySeparated", () => {
		basicParser.reset(" 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(output, [Num]))

		basicParser.reset(" 0 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(output, [Num, Num]))

		basicParser.reset(" 0 0 0")
		output = basicParser.testManySeparated()
		expect(matchTokens(output, [Num, Num, Num]))

		basicParser.reset(" ")
		expect(() => basicParser.testManySeparated()).to.throw

		basicParser.reset(" .")
		expect(() => basicParser.testManySeparated()).to.throw
	})
	it("testMaybeManySeparated", () => {
		basicParser.reset(" 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(output, [Num]))

		basicParser.reset(" 0 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(output, [Num, Num]))

		basicParser.reset(" 0 0 0")
		output = basicParser.testMaybeManySeparated()
		expect(matchTokens(output, [Num, Num, Num]))

		basicParser.reset(" ")
		output = basicParser.testMaybeManySeparated()
		expect(output).to.be.undefined

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


describe("error checking", () => {

	it("catches all optional definitions", () => {
		const allOptionalParser = new Parser(lexer)
		const {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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

	it("catches unresolved subrules", () => {
		const unresolvedParser = new Parser(lexer)
		const {
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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
				look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
				or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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
				look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
				or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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
				look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
				or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
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
			look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated, quit
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

			if (quit()) return
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
			if (quit()) return
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
			rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
			or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated, quit, INSPECT
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
