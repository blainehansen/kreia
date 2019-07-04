import kreia from '../kreia'

// create a parser with a token type definition
const [parser, tokenLibrary] = kreia.createParser({
  LeftParen: '(',
  RightParen: ')',
  Num: /[0-9]+/,
  Nil: 'nil',
  Comma: ',',
  Whitespace: { match: /\s+/, ignore: true, lineBreaks: true },
})

// grab the parser functions
// these are all bound to the parser instance
const {
  rule, subrule, maybeSubrule,
  consume, or, many, manySeparated,
} = parser.getPrimitives()
