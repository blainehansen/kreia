import ts = require('typescript')
import { Grammar } from './ast'
import { render_grammar } from './render'

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: true })

export function print_grammar(grammar: Grammar, filename = '') {
	const {
		import_statement, virtual_lexer_imports, parser_statement,
		rendered_decidables, rendered_rules, rendered_macros,
	} = render_grammar(grammar)

	const result_file = ts.createSourceFile(filename, '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
	const rest = [
		parser_statement,
		rendered_decidables,
		...rendered_rules,
		...rendered_macros,
	]
		.map(item => printer.printNode(ts.EmitHint.Unspecified, item, result_file))
		.join('\n\n')

	const imports = [import_statement, ...virtual_lexer_imports]
		.map(item => printer.printNode(ts.EmitHint.Unspecified, item, result_file))
		.join('\n')

	return `${imports}\n\n${rest}`.replace(/;/g, '')
}

export function print_node(node: Parameters<typeof printer.printNode>[1], filename = '') {
	const result_file = ts.createSourceFile(filename, '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
	return printer.printNode(ts.EmitHint.Unspecified, node, result_file)
}
