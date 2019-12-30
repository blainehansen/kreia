import * as fs from 'fs'
import { reset, kreia_grammar, exit } from './grammar'
import { print_grammar } from './render_codegen'

const grammar_source = fs.readFileSync('./lib/compiler/grammar.peg', 'utf-8')
reset(grammar_source)
const parsed_grammar = kreia_grammar()
fs.writeFileSync('./lib/compiler/grammar.staging.ts', print_grammar(parsed_grammar))
