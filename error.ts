// https://github.com/chalk/chalk

const source = `span something stufff
if (def)
	whatevs
sdfd
`

export type SourceFile = Readonly<{
	source: string, filename?: string,
}>

export type Span = Readonly<{
	file: SourceFile, start: number, end: number,
	line: number, column: number,
}>

const chalk = require('chalk')
const err = chalk.red.bold
const bold = chalk.white.bold
const info = chalk.blue.bold
const file = chalk.magentaBright.bold
const pos = chalk.cyanBright.bold

// const surroundingLines = 4
function makeErrorSpan(
	{ file: { source, filename }, start, end, line, column }: Span,
	title: string, message: string,
) {
	// const sourceSpan = source.slice(start, end)
	const pointerWidth = end - start
	const lineNumberWidth = line.toString().length
	function makeMargin(lineNumber?: number) {
		const insert = lineNumber !== undefined
			? ' '.repeat(lineNumberWidth - lineNumber.toString().length) + lineNumber
			: ' '.repeat(lineNumberWidth)
		return info(`\n ${insert} |  `)
	}
	const blankMargin = makeMargin()

	let sourceLineStart = start
	for (; sourceLineStart >= 0; sourceLineStart--)
		if (source[sourceLineStart] === '\n') break

	const sourceLineEnd = source.indexOf('\n', start)
	const sourceLine = source.slice(sourceLineStart + 1, sourceLineEnd)

	const printSourceLine = sourceLine.replace('\t', '  ')
	const pointerPrefix = sourceLine.slice(0, column).replace('\t', '  ')
	const pointer = pointerPrefix + err('^'.repeat(pointerWidth) + ' ' + message)

	const header = filename
		? '\n' + ' '.repeat(lineNumberWidth + 2) + file(filename) + ':' + pos(line) + ':' + pos(column)
		: ''

	return err('error') + bold(`: ${title}`)
		+ header
		+ blankMargin
		+ makeMargin(line) + printSourceLine
		+ blankMargin + pointer
		+ blankMargin

	// const lines = source.split('\n')
	// const sourceLine = lines[index]

	// const beforeLines = lines.slice(Math.max(0, index - surroundingLines), index)
	// const afterLines = lines.slice(index + 1, index + 1 + surroundingLines)
}

const span = { file: { source, filename: 'lib/compiler/lexer.ts' }, start: 32, end: 32 + 7, line: 3, column: 1 }
console.log(makeErrorSpan(span, 'bad', 'really'))
