import * as fs from 'fs'

const source = fs.readFileSync('./experiment.txt', 'utf8').split(/\s+/)

const re = /"(?:\\["\\]|[^\n"\\])*"/

for (const line of source) {
	console.log(line)
	console.log(line.match(re))
}

// console.log(source.match(/\\\/\//))


// for (const c of source) {
// 	console.log('character: ', c)
// }
