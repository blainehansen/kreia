import { readFileSync, writeFileSync } from 'fs'
import { compile } from './compiler'

const args = process.argv.slice(2)

const [input_filename, output_filename] = [args[0], args[1]]
if (input_filename === undefined)
	throw new Error("no input filename provided")

const source = readFileSync(input_filename, 'utf-8')
const code = compile(source, input_filename)

if (output_filename === undefined)
	process.stdout.write(code)
else
	writeFileSync(output_filename, code)
