const util = require('util')
function log(obj) {
	console.log(util.inspect(obj, { depth: null }))
}
