
// // const Padded = Macro(
// // 	'padded', [Arg('body')],
// // 	Maybe(Consume('Whitespace')),
// // 	Var('body'),
// // 	Maybe(Consume('Whitespace')),
// // )

// const ManySeparated = Macro(
// 	'many_separated', [Arg('body_rule'), Arg('separator_rule')],
// 	Var('body_rule'),
// 	Maybe(Many(Var('separator_rule'), Var('body_rule'))),
// )

// const Grammar: Grammar = [
// 	Token('LeftParen', '('),
// 	Token('RightParen', ')'),
// 	Token('Num', /[0-9]+/),
// 	Token('Nil', 'nil'),
// 	Token('Comma', ','),
// 	Token('Whitespace', /\s+/, { ignore: true }),

// 	Rule('lists',
// 		Many(Subrule('parenthesized_number_list')),
// 	),
// 	Rule('parenthesized_number_list',
// 		Consume('LeftParen'),
// 		Maybe(Subrule('number_list'))
// 		Consume('RightParen'),
// 	),
// 	Rule('number_list',
// 		MacroCall('many_separated',
// 			[Or(
// 				[Subrule('parenthesized_number_list')],
// 				[Or([Consume('Num')], [Consume('Nil')])],
// 			)],
// 			[Consume('Comma')],
// 		),
// 	),
// ]
