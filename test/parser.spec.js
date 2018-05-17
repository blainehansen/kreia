// const { expect } = require('chai')

// const Parser = require('../src/parser')
// // const moo = require('moo')
// const moo = require('../src/moo')

// const lexer = moo.compile({
// 	LeftParen: '(',
// 	RightParen: ')',
// 	Number: /[0-9]+/,
// 	Space: / +/,
// 	Dot: '.',
// })

// // lexer.reset(" (9) ")
// // let token
// // while (token = lexer.next()) {
// // 	log(token)
// // }
// // const tok = lexer.tokenLibrary()

// let parser

// const basicParser = new Parser(lexer)

// const {
// 	look, lookRange, rule, subrule, maybeSubrule, maybe, consume, maybeConsume,
// 	or, maybeOr, many, maybeMany, manySeparated, maybeManySeparated,
// } = basicParser.getFunctions()

// rule('consumeOne', () =>{
// 	consume('Space')
// })



// basicParser.reset(" (4)")
// basicParser.only()

// // basicParser.reset(" (4).(4)")
// // basicParser.only()

// // basicParser.reset(" ")
// // basicParser.only()


// describe("consume", () => {
// 	it("tests", () => {
// 		expect(true).to.be.true
// 	})
// })

// describe("maybeConsume", () => {
// 	it("tests", () => {
// 		expect(true).to.be.true
// 	})
// })

// describe("maybeConsume", () => {
// 	it("tests", () => {
// 		expect(true).to.be.true
// 	})
// })


// rule('only', () => {
// 	consume(['Number', 'Dot'])
// 	maybe(() => {
// 		consume('Space')
// 		subrule('other')
// 		consume('Space')
// 	})
// 	consume(['Dot', 'Number'])
// })

// rule('other', () => {
// 	consume('LeftParen')
// 	maybeConsume('Number')
// 	consume('RightParen')
// })


// // // this is a left recursive grammar
// // rule('A', () => {
// // 	maybeConsume('Plus')
// // 	subrule('B')
// // 	// consume('LeftParen')
// // 	// subrule('A')
// // 	// consume('RightParen')
// // })

// // rule('B', () => {
// // 	maybeConsume('Space')
// // 	subrule('A')
// // 	// maybeConsume('Space')
// // })


// // // this is a grammar with recursion
// // // but it's not left recursion
// // // because every time a rule ends up at itself again, the stream has been advanced

// // // path from A to B is [LeftParen]
// // rule('A', () => {
// // 	consume(tok.LeftParen)
// // 	subrule('B')
// // 	consume(tok.RightParen)
// // })

// // // path from B to A is [Number, Space]
// // // probably we can get away with just incrementing a mandatoryTokenCount. we don't actually need the whole path
// // rule('B', () => {
// // 	consume(tok.Number)
// // 	// there would the mandatory lookahead path of this is the mandatory path to the first optional thing
// // 	// here that would ironically involve
// // 	option(() => {
// // 		consume(tok.Space)
// // 		subrule('A')
// // 	})
// // })


// // basicParser.reset("1. (4) .1")
// // basicParser.only()

// // basicParser.reset("1..1")
// // basicParser.only()


// // rule('only', () => {
// // 	consume('Space')
// // 	or(() => {
// // 		consume('LeftParen')
// // 	}, () => {
// // 		consume('RightParen')
// // 	})
// // })

// // basicParser.reset(" (")
// // basicParser.only()

// // basicParser.reset(" )")
// // basicParser.only()

// // basicParser.reset(" ")
// // basicParser.only()


// // rule('only', () => {
// // 	consume('Space')
// // 	maybeMany(() => {
// // 		consume(['Number', 'Dot'])
// // 	})
// // })

// // basicParser.reset(" 4.4")
// // basicParser.only()



// // rule('only', () => {
// // 	consume('Space')
// // 	maybeOr(() => {
// // 		consume('LeftParen')
// // 	}, () => {
// // 		consume('RightParen')
// // 	})
// // })

// // basicParser.reset(" (")
// // basicParser.only()

// // basicParser.reset(" )")
// // basicParser.only()

// // basicParser.reset(" ")
// // basicParser.only()
