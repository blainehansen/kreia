const { expect } = require('chai')

const kreia = require('../kreia')

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
		  rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
		  or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
		  quit
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

		expect(() => parser.analyze()).to.not.throw

		function expectCanParse(input) {
			parser.reset(input)
			expect(() => parser.top()).to.not.throw
		}

		expectCanParse("(4) (4).(4) ! (.))()(.().(.)(.")

		expectCanParse("(4)( 4)(4 )( 4 ) (4).(4) (4) ( 4).( 4).(4) ( 4 ) ! ")

		parser.reset("asdf")
		expect(() => parser.top()).to.throw
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

		expect(() => parser.lists()).to.not.throw
	})

	it("works for returning miniJson", () => {
		const [miniJsonParser, tokenLibrary] = kreia.createParser({
		  Primitive: ['null', 'undefined', 'true', 'false'],
		  Str: /"(?:\\["\\]|[^\n"\\])*"/,
		  Num: /[0-9]+/,
		  Comma: ',',
		  LeftBracket: '[',
		  RightBracket: ']',
		  LeftBrace: '{',
		  RightBrace: '}',
		  Colon: ':',
		  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
		})

		const {
		  Primitive, Str, Num, Comma,
		  LeftBracket, RightBracket, LeftBrace, RightBrace, Colon
		} = tokenLibrary

		const {
		  rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
		  or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
		  quit
		} = miniJsonParser.getPrimitives()

		rule('jsonEntity', () => {
		  return or(
		    () => subrule('array'),
		    () => subrule('object'),
		    () => subrule('atomicEntity'),
		  )
		})

		function separatedByCommas(func) {
		  const possibleArray = maybeManySeparated(
		    func,
		    () => consume(Comma),
		  )
		  return possibleArray !== undefined ? possibleArray : []
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

		  if (quit()) return

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
		  if (quit()) return

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
		  if (quit()) return
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

		miniJson.reset(`not valid`)
		expect(() => miniJsonParser.jsonEntity()).to.throw

		miniJson.reset(`["valid", "json"] (not valid extra)`)
		expect(() => miniJsonParser.jsonEntity()).to.throw
	})
})
