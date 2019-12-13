import { compute_path_test_length } from '../runtime/decision'
import { Data } from '../utils'

export const AstDecisionPath = Data((...path: (string[] | AstDecisionBranch)[]): AstDecisionPath => {
	return { type: 'AstDecisionPath' as const, path, test_length: compute_path_test_length(path) }
})
export type AstDecisionPath = Readonly<{ type: 'AstDecisionPath', path: (string[] | AstDecisionBranch)[], test_length: number }>

export const AstDecisionBranch = Data((...paths: AstDecisionPath[]): AstDecisionBranch => {
	const is_optional = paths.length === 1
	const test_length = Math.max(...paths.map(p => p.test_length))
	return { type: 'AstDecisionBranch' as const, is_optional, paths: paths.slice(), test_length }
})
export type AstDecisionBranch = Readonly<{ type: 'AstDecisionBranch', is_optional: boolean, paths: AstDecisionPath[], test_length: number }>
export type AstDecidable = AstDecisionPath | AstDecisionBranch
