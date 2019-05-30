const { expect } = require('chai')

const kreia = require('../kreia')
const lexing = require('kreia-moo')

// const { matchToken, matchTokens } = lexing
const { matchToken } = lexing

describe("the top level api", () => {

	it("works", () => {
		expect(kreia).to.have.property('createParser').that.is.a('function')
		expect(kreia).to.have.property('createStatesParser').that.is.a('function')
		expect(kreia).to.have.property('lexingError').that.is.an('object')
		expect(kreia).to.have.property('createTokenCategory').that.is.a('function')
		expect(kreia).to.have.property('matchToken').that.is.a('function')
		expect(kreia).to.have.property('matchTokens').that.is.a('function')

		const Paren = kreia.createTokenCategory('Paren')

		expect(Paren).to.have.property('isCategory').which.equal(true)
		expect(Paren).to.have.property('categoryName').which.eql('Paren')
		expect(Paren).to.have.property('categories').which.is.null

		const [parser, tok] = kreia.createParser({
			LeftParen: { match: '(', categories: Paren },
			RightParen: { match: ')', categories: Paren },
			Num: /[0-9]+/,
			Space: / +/,
			Dot: '.',
			Bang: '!',
		})

		const {
		  inspecting, rule, subrule, maybeSubrule, gateSubrule,
		  consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		  many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = parser.getPrimitives()
		const { LeftParen, RightParen, Num, Space, Dot, Bang } = tok

		rule('top', () => {
			many(() => {
				subrule('parenNumber')
			})

			consume(Space)

			manySeparated(
				() => subrule('parenNumber'),
				() => or(
					() => consume(Space),
					() => consume(Dot),
				),
			)

			consume(Space, Bang, Space)

			maybeSubrule('endingParens')
		})

		rule('parenNumber', () => {
			consume(LeftParen)
			maybeConsume(Space)
			consume(Num)
			maybeConsume(Space)
			consume(RightParen)
		})

		rule('endingParens', () => {
			many(() => {
				consume(Paren)
				maybeConsume(Dot)
			})
		})

		expect(() => parser.analyze()).to.not.throw()

		function expectCanParse(input) {
			parser.reset(input)
			expect(() => parser.top()).to.not.throw()
		}

		expectCanParse("(4) (4).(4) ! (.))()(.().(.)(.")

		expectCanParse("(4)( 4)(4 )( 4 ) (4).(4) (4) ( 4).( 4).(4) ( 4 ) ! ")

		parser.reset("asdf")
		expect(() => parser.top()).to.throw()
	})

	it("readme example works", () => {
		const [parser, tokenLibrary] = kreia.createParser({
		  LeftParen: '(',
		  RightParen: ')',
		  Num: /[0-9]+/,
		  Nil: 'nil',
		  Comma: ',',
		  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
		})

		const {
		  rule, subrule, maybeSubrule,
		  consume, or, many, manySeparated,
		} = parser.getPrimitives()

		rule('lists', () => {
		  many(() => {
		    subrule('parenthesizedNumberList')
		  })
		})

		rule('parenthesizedNumberList', () => {
		  consume(tokenLibrary.LeftParen)
		  maybeSubrule('numberList')
		  consume(tokenLibrary.RightParen)
		})

		function tokenOr(...tokenTypes) {
		  or(
		    ...tokenTypes.map(tokenType => () => consume(tokenType))
		  )
		}
		rule('numberList', () => {
		  manySeparated(
		    () => or(
		      () => subrule('parenthesizedNumberList'),
		      () => tokenOr(tokenLibrary.Num, tokenLibrary.Nil),
		    ),
		    () => consume(tokenLibrary.Comma)
		  )
		})

		parser.analyze()

		parser.reset(`
		  (1, 2, 3, nil) ()
		  (nil, nil)
		  (1, (2, 3, 4), (((), nil)))
		`)

		expect(() => parser.lists()).to.not.throw()
	})

	it("works for returning miniJson", () => {
		const [miniJsonParser, tokenLibrary] = kreia.createParser({
		  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
		  Colon: ':',
		  Comma: ',',
		  LeftBrace: '{',
		  RightBrace: '}',
		  LeftBracket: '[',
		  RightBracket: ']',
		  Num: /[0-9]+/,
		  Primitive: ['null', 'undefined', 'true', 'false'],
		  Str: { match: /"(?:\\["\\]|[^\n"\\])*"/, value: x => x.slice(1, -1) },
		}, 1)

		const {
		  Primitive, Str, Num, Comma,
		  LeftBracket, RightBracket, LeftBrace, RightBrace, Colon
		} = tokenLibrary

		const {
		  inspecting, rule, subrule, maybeSubrule, gateSubrule,
		  consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		  many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = miniJsonParser.getPrimitives()

		rule('jsonEntity', () => {
		  return or(
		    () => subrule('array'),
		    () => subrule('object'),
		    () => subrule('atomicEntity'),
		  )
		})

		function separatedByCommas(func) {
		  return maybeManySeparated(
		    func,
		    () => consume(Comma),
		  )
		}

		rule('array', () => {
		  consume(LeftBracket)
		  const array = separatedByCommas(() => subrule('jsonEntity'))
		  consume(RightBracket)
		  return array
		})

		rule('object', () => {
		  consume(LeftBrace)
		  const keyValuePairs = separatedByCommas(() => {
		    const key = subrule('jsonKey')
		    const entity = subrule('jsonEntity')
		    return [key, entity]
		  })
		  consume(RightBrace)

		  if (inspecting()) return

		  const object = {}
		  for (const [key, value] of keyValuePairs) object[key] = value
		  return object
		})

		rule('atomicEntity', () => {
		  const entity = or(
		    () => consume(Str),
		    () => consume(Num),
		    () => consume(Primitive),
		  )
		  if (inspecting()) return

		  const tokenValue = entity.value
		  switch (entity.type) {
		    case 'Str': return tokenValue
		    case 'Num': return parseInt(tokenValue)
		    case 'Primitive':
		      switch (tokenValue) {
		        case 'true': return true
		        case 'false': return false
		        case 'null': return null
		        case 'undefined': return undefined
		      }
		  }
		})

		rule('jsonKey', () => {
		  const key = consume(Str)
		  consume(Colon)
		  if (inspecting()) return
		  return key.value
		})

		miniJsonParser.analyze()

		miniJsonParser.reset(`{
		  "stuff": null, "other": [], "things": {}
		}`)
		const obj = miniJsonParser.jsonEntity()
		expect(obj).to.be.an('object')
			.and.have.property('stuff').that.is.null

		miniJsonParser.reset(`[1, 2, 3, 4]`)
		const arr = miniJsonParser.jsonEntity()
		expect(arr).to.be.an('array').with.lengthOf(4)

		miniJsonParser.reset(`"various stuff"`)
		const str = miniJsonParser.jsonEntity()
		expect(str).to.be.a('string').that.eql("various stuff")

		miniJsonParser.reset(`not valid`)
		expect(() => miniJsonParser.jsonEntity()).to.throw()

		miniJsonParser.reset(`["valid", "json"] (not valid extra)`)
		expect(() => miniJsonParser.jsonEntity()).to.throw()
	})

	it("programmatic example works", () => {
		const [modeParser, tokenLibrary] = kreia.createParser({
			HappyToken: 'happy',
			AngryToken: 'angry',
			NeutralToken: 'meh',
		})

		const { HappyToken, AngryToken, NeutralToken } = tokenLibrary

		const {
		  inspecting, rule, subrule, maybeSubrule, gateSubrule,
		  consume, maybeConsume, gateConsume, maybe, gate, or, maybeOr, gateOr,
		  many, maybeMany, gateMany, manySeparated, maybeManySeparated, gateManySeparated,
		} = modeParser.getPrimitives()

		const modeTokenMap = {
			happy: HappyToken,
			angry: AngryToken,
			neutral: NeutralToken,
		}

		function makeModeRule(mode) {
		  rule(`${mode}Rule`, () => consume(modeTokenMap[mode]))
		}

		for (const mode of ['happy', 'angry', 'neutral']) {
		  makeModeRule(mode)
		}

		let output

		modeParser.reset("happy")
		output = modeParser.happyRule()
		expect(matchToken(output, HappyToken)).to.be.true

		modeParser.reset("angry")
		expect(() => modeParser.happyRule()).to.throw()

		modeParser.reset("meh")
		expect(() => modeParser.happyRule()).to.throw()

		modeParser.reset("")
		expect(() => modeParser.happyRule()).to.throw()


		modeParser.reset("angry")
		output = modeParser.angryRule()
		expect(matchToken(output, AngryToken)).to.be.true


		modeParser.reset("meh")
		output = modeParser.neutralRule()
		expect(matchToken(output, NeutralToken)).to.be.true
	})
})
