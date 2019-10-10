const tab = Symbol('tab')
const newline = Symbol('newline')
const name = Symbol('name')
const space = Symbol('space')

const indent = Symbol('indent')
const deindent = Symbol('deindent')

const toks = [
	{ type: name, value: 'one' },
	{ type: newline, value: '\n' },
	{ type: tab, value: '\t' },
	{ type: name, value: 'two' },
	{ type: newline, value: '\n' },
	{ type: tab, value: '\t\t' },
	{ type: name, value: 'three' },
	{ type: newline, value: '\n\n' },
	{ type: tab, value: '\t' },
	{ type: name, value: 'four' },
	{ type: newline, value: '\n' },
]


type State =
	| { id: 'decrementing' }
	| { id: 'decrementing' }

class Parser {
	constructor(private toks: typeof toks) {}

	indentation_level = 0
	current_temp_indentation_level = 0
	counting_indentation = true
	token_index = 0

	// states:
	// the last thing was a newline, in which case we're watching for a tab to increase indentation, or a space to error
	// we encountered a tab and haven't output all the nodes yet (decrementing indentation)

	next() {
		if (this.toks.length === 0) return undefined

		const [tok] = this.toks.splice(0, 1)
		this.token_index++
		console.log(tok)

		const is_tab = tok.type === tab
		const is_newline = tok.type === newline
		const is_space = tok.type === space

		if (this.last_was_newline && is_space)
			throw new Error("spaces are not allowed at the beginning of lines")

		if (this.last_was_newline && is_tab) {
			this.decrementing = true
			this.current_temp_indentation_level = tok.value.length
		}

		if (not_decrementing && !is_newline)
			return { ast: tok.type, value: tok.value }

		if (!this.counting_indentation)


		if (this.counting_indentation && tok === tab) {
			console.log()
		}

		this.counting_indentation = tok === newline || (this.counting_indentation && tok === tab)
	}
}


const parser = new Parser(toks)

let [t, i] = parser.next()

while (t !== undefined) {
	console.log(t)
	console.log(i)
	([t, i] = parser.next())
}
