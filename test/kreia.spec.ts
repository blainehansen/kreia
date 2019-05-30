import { createParser, createTokenCategory, Category, Token, matchToken, TokenType } from '../kreia'
import { expect } from 'chai'

describe("the top level api", () => {

	it("works", () => {
		const Paren: Category = createTokenCategory('Paren')

		const [parser, tok] = createParser({
			LeftParen: { match: '(', categories: Paren },
			RightParen: { match: ')', categories: Paren },
			Num: /[0-9]+/,
			Space: / +/,
			Dot: '.',
			Bang: '!',
		})

		const tokCategories: string[] = tok.LeftParen.categories || []
		expect(tokCategories).to.be.an('array').with.lengthOf(1)
		expect(tokCategories[0]).to.be.a('string').with.lengthOf(5)

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
			const l = consume(LeftParen)
			maybeConsume(Space)
			consume(Num)
			maybeConsume(Space)
			consume(RightParen)

			if (inspecting()) return
			const lCategories: string[] = l.categories || []
			expect(lCategories).to.be.an('array').with.lengthOf(1)
			expect(lCategories[0]).to.be.a('string').with.lengthOf(5)
		})

		rule('endingParens', () => {
			many(() => {
				consume(Paren)
				maybeConsume(Dot)
			})
		})

		parser.analyze()

		const top = parser.getTopLevel('top') as any as () => void

		parser.reset("(4) (4).(4) ! (.))()(.().(.)(.")
		top()

		parser.reset("(4)( 4)(4 )( 4 ) (4).(4) (4) ( 4).( 4).(4) ( 4 ) ! ")
		top()

		parser.reset("asdf")
		expect(() => top()).to.throw()
	})

	it("readme example works", () => {
		const [parser, tokenLibrary] = createParser({
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

		function tokenOr(...tokenTypes: TokenType[]) {
		  or(
		    ...tokenTypes.map(tokenType => () => consume(tokenType)),
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

		const lists = parser.getTopLevel('lists') as () => void
		expect(() => lists()).to.not.throw()
	})

	it("works for returning miniJson", () => {
		const [miniJsonParser, tokenLibrary] = createParser({
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

		function separatedByCommas(func: () => any) {
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

		  const object: { [jsonKey: string]: any } = {}
		  for (const [key, value] of keyValuePairs || []) object[key] = value
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
			const tokCategories = entity.categories
			expect(tokCategories).to.be.null
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
		const jsonEntity = miniJsonParser.getTopLevel('jsonEntity') as () => any
		const obj = jsonEntity()
		expect(obj).to.be.an('object')
			.and.have.property('stuff').that.is.null

		miniJsonParser.reset(`[1, 2, 3, 4]`)
		const arr = jsonEntity()
		expect(arr).to.be.an('array').with.lengthOf(4)

		miniJsonParser.reset(`"various stuff"`)
		const str = jsonEntity()
		expect(str).to.be.a('string').that.eql("various stuff")

		miniJsonParser.reset(`not valid`)
		expect(() => jsonEntity()).to.throw()

		miniJsonParser.reset(`["valid", "json"] (not valid extra)`)
		expect(() => jsonEntity()).to.throw()
	})

	it("programmatic example works", () => {
		const [modeParser, tokenLibrary] = createParser({
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

		function makeModeRule(mode: keyof typeof modeTokenMap) {
		  rule(`${mode}Rule`, () => consume(modeTokenMap[mode]))
		}

		for (const mode of ['happy', 'angry', 'neutral'] as (keyof typeof modeTokenMap)[]) {
		  makeModeRule(mode)
		}

		const happyRule = modeParser.getTopLevel('happyRule') as () => Token
		const angryRule = modeParser.getTopLevel('angryRule') as () => Token
		const neutralRule = modeParser.getTopLevel('neutralRule') as () => Token

		modeParser.reset("happy")
		let output: Token = happyRule()
		expect(matchToken(output, HappyToken)).to.be.true

		modeParser.reset("angry")
		expect(() => happyRule()).to.throw()

		modeParser.reset("meh")
		expect(() => happyRule()).to.throw()

		modeParser.reset("")
		expect(() => happyRule()).to.throw()

		modeParser.reset("angry")
		output = angryRule()
		expect(matchToken(output, AngryToken)).to.be.true

		modeParser.reset("meh")
		output = neutralRule()
		expect(matchToken(output, NeutralToken)).to.be.true
	})
})
