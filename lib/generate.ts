// https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#user-content-creating-and-printing-a-typescript-ast
// https://github.com/HearTao/ts-creator

import ts = require('typescript')

function render() {
	//
}

function f() {
	return ts.createFunctionDeclaration(
		undefined,
		[ts.createModifier(ts.SyntaxKind.ExportKeyword)],
		undefined,
		ts.createIdentifier('t'),
		undefined,
		[
			ts.createParameter(
				undefined,
				undefined,
				undefined,
				ts.createIdentifier('n'),
				undefined,
				ts.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
				undefined,
			),
		],
		ts.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword),
		ts.createBlock(
			[
				ts.createReturn(
					ts.createBinary(
						ts.createIdentifier('n'),
						ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
						ts.createNumericLiteral('1'),
					),
				),
			],
			true,
		),
	)
}

const resultFile = ts.createSourceFile(
	'lib/generated.ts',
	'',
	ts.ScriptTarget.Latest,
	/*setParentNodes*/ false,
	ts.ScriptKind.TS,
)
const printer = ts.createPrinter({
	newLine: ts.NewLineKind.LineFeed
})
const result = printer.printNode(
	ts.EmitHint.Unspecified,
	f(),
	resultFile,
)

console.log(result)
