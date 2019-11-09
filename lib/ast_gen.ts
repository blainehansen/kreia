// import { Data } from './utils'
// import { TokenDefinition } from './states_lexer'

// export const Arg = Data((name: string) => {
// 	return { type: 'Arg' as const, name }
// })
// export type Arg = ReturnType<typeof Arg>

// export const Var = Data((arg: Arg) => {
// 	return { type: 'Var' as const, arg }
// })
// export type Var = ReturnType<typeof Var>


// export const Rule = Data((name: string, definition: Definition) => {
// 	return { type: 'Rule' as const, name, definition, is_locking: false as const }
// })

// export const LockingArg = Data((name: string, definition: Definition) => {
// 	return { type: 'LockingArg' as const, name, definition }
// })
// export type LockingArg = ReturnType<typeof LockingArg>

// export const LockingVar = Data((name: string) => {
// 	return { type: 'LockingVar' as const, name }
// })
// export type LockingVar = ReturnType<typeof LockingVar>

// export const LockingRule = Data((name: string, lockers: LockingArg[], definition: (Node | LockingVar)[]) => {
// 	return { type: 'Rule' as const, name, definition, is_locking: true as const, lockers }
// })
// export type Rule = ReturnType<typeof Rule> | ReturnType<typeof LockingRule>

// export const Macro = Data((name: string, args: Arg[], definition: (Node | Var)[]) => {
// 	return { type: 'Macro' as const, name, args, definition }
// })
// export type Macro = ReturnType<typeof Macro>


// export const Subrule = Data((rule: Rule) => {
// 	return { type: 'Subrule' as const, rule }
// })
// export type Subrule = ReturnType<typeof Subrule>

// export const Maybe = Data((definition: Definition) => {
// 	return { type: 'Maybe' as const, definition }
// })
// export type Maybe = ReturnType<typeof Maybe>

// export const Many = Data((definition: Definition) => {
// 	return { type: 'Many' as const, definition }
// })
// export type Many = ReturnType<typeof Many>

// export const Or = Data((choices: Definition[]) => {
// 	return { type: 'Or' as const, choices }
// })
// export type Or = ReturnType<typeof Or>

// export const MacroCall = Data((macro: Macro, args: Definition[]) => {
// 	return { type: 'MacroCall' as const, macro, args }
// })
// export type MacroCall = ReturnType<typeof MacroCall>

// export const Consume = Data((tokens: TokenDefinition[]) => {
// 	return { type: 'Consume' as const, tokens }
// })
// export type Consume = ReturnType<typeof Consume>

// export type Node =
// 	| Subrule
// 	| Maybe
// 	| Many
// 	| Or
// 	| MacroCall
// 	| Consume

// export type Definition = Node[]

// export type GrammarItem =
// 	| Token
// 	| Rule
// 	| Macro

// export type Grammar = GrammarItem[]
