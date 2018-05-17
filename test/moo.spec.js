const { expect } = require('chai')

const moo = require('../src/moo')
const { createCategory, matchToken } = moo

describe("createCategory", () => {
	it("works", () => {
		const First = createCategory('First')
		expect(First).to.have.property('isCategory').which.equal(true)
		expect(First).to.have.property('categoryName').which.eql('First')
		expect(First).to.have.property('categories').which.is.null

		const Second = createCategory('Second', First)
		expect(Second).to.have.property('isCategory').which.equal(true)
		expect(Second).to.have.property('categoryName').which.eql('Second')
		expect(Second).to.have.property('categories').that.has.lengthOf(1)

		const Unrelated = createCategory('Unrelated')
		const Third = createCategory('Third', [Second, Unrelated])
		expect(Third).to.have.property('isCategory').which.equal(true)
		expect(Third).to.have.property('categoryName').which.eql('Third')
		expect(Third).to.have.property('categories').that.has.lengthOf(3)
	})

	it("doesn't allow non-categories", () => {
		expect(() => {
			createCategory('First', 'stuff')
		}).to.throw()
	})
})



describe("categories", () => {
	const Punctuation = createCategory('Punctuation')
	const Paren = createCategory('Paren', Punctuation)

	const Exclamatory = createCategory('Exclamatory')

	const noKeywordLexer = moo.compile({
		Dot: { match: '.', categories: Punctuation },
		BangParen: { match: '!()', categories: [Paren, Exclamatory] },
		LeftParen: { match: '(', categories: Paren },
		RightParen: { match: ')', categories: Paren },
		Exclaim: { match: '!', categories: [Punctuation, Exclamatory] },
		Space: / +/,
	})

	const tok = noKeywordLexer.tokenLibrary()

	it("has a complete tokenLibrary when there are no keywords", () => {
		expect(tok).to.have.all.keys('Dot', 'BangParen', 'LeftParen', 'RightParen', 'Exclaim', 'Space')
	})

	it("gives all tokenLibrary items the correct categories", () => {
		const { Dot, BangParen, LeftParen, RightParen, Exclaim, Space } = tok

		expect(Dot).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation'])

		expect(BangParen).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren', 'Exclamatory'])

		expect(LeftParen).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren'])

		expect(RightParen).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren'])

		expect(Exclaim).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Exclamatory'])

		expect(Space).to.have.property('categories').that.is.null
	})

	it("are given correctly to lexed tokens", () => {
		noKeywordLexer.reset(".!()()! ")
		const tokens = Array.from(noKeywordLexer)
		expect(tokens).to.have.lengthOf(6)

		const [
			DotToken, BangParenToken, LeftParenToken, RightParenToken, ExclaimToken, SpaceToken
		] = tokens

		expect(DotToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation'])

		expect(BangParenToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren', 'Exclamatory'])

		expect(LeftParenToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren'])

		expect(RightParenToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Paren'])

		expect(ExclaimToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Punctuation', 'Exclamatory'])

		expect(SpaceToken).to.have.property('categories').that.is.null
	})

	it("works correctly with matchToken", () => {
		noKeywordLexer.reset(".!()()! ")
		const tokens = Array.from(noKeywordLexer)
		expect(tokens).to.have.lengthOf(6)

		const [
			DotToken, BangParenToken, LeftParenToken, RightParenToken, ExclaimToken, SpaceToken
		] = tokens
		const { Dot, BangParen, LeftParen, RightParen, Exclaim, Space } = tok

		expect(matchToken(DotToken, Dot)).to.be.true
		expect(matchToken(BangParenToken, BangParen)).to.be.true
		expect(matchToken(LeftParenToken, LeftParen)).to.be.true
		expect(matchToken(RightParenToken, RightParen)).to.be.true
		expect(matchToken(ExclaimToken, Exclaim)).to.be.true
		expect(matchToken(SpaceToken, Space)).to.be.true

		expect(matchToken(DotToken, Punctuation)).to.be.true
		expect(matchToken(DotToken, Paren)).to.be.false
		expect(matchToken(DotToken, Exclamatory)).to.be.false

		expect(matchToken(BangParenToken, Punctuation)).to.be.true
		expect(matchToken(BangParenToken, Paren)).to.be.true
		expect(matchToken(BangParenToken, Exclamatory)).to.be.true

		expect(matchToken(LeftParenToken, Punctuation)).to.be.true
		expect(matchToken(LeftParenToken, Paren)).to.be.true
		expect(matchToken(LeftParenToken, Exclamatory)).to.be.false

		expect(matchToken(RightParenToken, Punctuation)).to.be.true
		expect(matchToken(RightParenToken, Paren)).to.be.true
		expect(matchToken(RightParenToken, Exclamatory)).to.be.false

		expect(matchToken(ExclaimToken, Punctuation)).to.be.true
		expect(matchToken(ExclaimToken, Paren)).to.be.false
		expect(matchToken(ExclaimToken, Exclamatory)).to.be.true

		expect(matchToken(SpaceToken, Punctuation)).to.be.false
		expect(matchToken(SpaceToken, Paren)).to.be.false
		expect(matchToken(SpaceToken, Exclamatory)).to.be.false
	})
})


describe("keywords", () => {
	const IdentifierCategory = createCategory('IdentifierCategory')
	const Keyword = createCategory('Keyword')
	const Html = createCategory('Html', Keyword)

	const Exclamatory = createCategory('Exclamatory')

	const Numeric = createCategory('Numeric')

	const keywordLexer = moo.compile({
		Identifier: { match: /[a-z]+/, categories: IdentifierCategory, keywords: [
			{ type: 'Null', values: ['null'] },
			{ type: 'ControlFlowKeyword', values: ['while', 'for'], categories: Keyword },
			{ type: 'HtmlTag', values: ['div', 'span'], categories: Html },
			{ type: 'Scary', values: ['argh'], categories: [Keyword, Exclamatory] },
		]},
		Num: { match: /[0-9]+/, categories: Numeric, keywords: {
			ScaryNum: '666',
			NiceNum: '000',
		}},
		Dots: { match: /\.+/, keywords: [
			{ type: 'ScaryDots', values: ['...'], categories: Exclamatory }
		]},
		Bangs: { match: /\!+/, keywords: { ThreeBang: '!!!' }},
		Space: / +/,
	})

	const tok = keywordLexer.tokenLibrary()

	it("work with both new syntaxes, and are added to the tokenLibrary", () => {
		expect(tok).to.have.all.keys('Identifier', 'Null', 'ControlFlowKeyword', 'HtmlTag', 'Scary', 'Num', 'ScaryNum', 'NiceNum', 'Dots', 'ScaryDots', 'Bangs', 'ThreeBang', 'Space')

		const {
			Identifier, Null, ControlFlowKeyword, HtmlTag, Scary, Num, ScaryNum, NiceNum, Dots, ScaryDots, Bangs, ThreeBang, Space
		} = tok

		expect(Identifier).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory'])

		expect(Null).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory'])

		expect(ControlFlowKeyword).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword'])

		expect(HtmlTag).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword', 'Html'])

		expect(Scary).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword', 'Exclamatory'])

		expect(Num).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(ScaryNum).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(NiceNum).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(Dots).to.have.property('categories').that.is.null

		expect(ScaryDots).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Exclamatory'])

		expect(Bangs).to.have.property('categories').that.is.null

		expect(ThreeBang).to.have.property('categories').that.is.null

		expect(Space).to.have.property('categories').that.is.null
	})

	it("are given correctly to lexed tokens", () => {
		keywordLexer.reset("iden null for div argh 1 666 000 . ... ! !!! ")

		const tokens = Array.from(keywordLexer)
		expect(tokens).to.have.lengthOf(24)

		const [
			IdentifierToken, , NullToken, , ControlFlowKeywordToken, , HtmlTagToken, , ScaryToken, , NumToken, , ScaryNumToken, , NiceNumToken, , DotsToken, ,ScaryDotsToken, , BangsToken, , ThreeBangToken, SpaceToken
		] = tokens

		expect(IdentifierToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory'])

		expect(NullToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory'])

		expect(ControlFlowKeywordToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword'])

		expect(HtmlTagToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword', 'Html'])

		expect(ScaryToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['IdentifierCategory', 'Keyword', 'Exclamatory'])

		expect(NumToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(ScaryNumToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(NiceNumToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Numeric'])

		expect(DotsToken).to.have.property('categories').that.is.null

		expect(ScaryDotsToken).to.have.property('categories')
			.that.is.an('array')
			.and.has.members(['Exclamatory'])

		expect(BangsToken).to.have.property('categories').that.is.null

		expect(ThreeBangToken).to.have.property('categories').that.is.null

		expect(SpaceToken).to.have.property('categories').that.is.null
	})
})
