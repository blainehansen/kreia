import { print_grammar as render } from './render_codegen'
export { print_grammar as render } from './render_codegen'
import { reset, kreia_grammar, exit } from './grammar'

export function compile(source: string, filename = '') {
	const grammar = parse(source)
	return render(grammar, filename)
}

export function parse(source: string) {
	reset(source)
	const grammar = kreia_grammar()
	// TODO convert every instance of throwing an error possible into returning a result instead
	exit()
	return grammar
}
