import { Parser, ParseArg, Decidable, path, branch, t, f } from "./index"
import { IndentationLexer } from "./IndentationLexer"

export const { tok, reset, exit, arg, maybe, consume, many, maybe_many, or, maybe_or, many_separated, maybe_many_separated } = Parser({
    var_name: /\$\w+/,
    token_name: /\:\w+/,
    locked_name: /\!\w+/,
    rule_name: /\w+/,
    macro_name: /\@\w+/,
    space: / +/,
    primitive: ["true"],
    str: [/"(?:\\["\\]|[^\n"\\])*"/, /'(?:\\['\\]|[^\n'\\])*'/],
    regex_source: /\/(?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+\//,
    use_keyword: "use",
    eq: "=",
    bar: "|",
    star: "*",
    plus: "+",
    maybe: "?",
    colon: ":",
    comma: ",",
    slash: "/",
    open_angle: "<",
    close_angle: ">",
    open_paren: "(",
    close_paren: ")",
    open_brace: "{",
    close_brace: "}",
    open_bracket: "[",
    close_bracket: "]"
}, { IndentationLexer: t(IndentationLexer, t()) })

const [_0, _1] = [path([tok.space]), path([tok.space])]

export function _() {
    maybe(tok.space);
}

export function simple_rule_line() {
    many_separated(() => {
        many_separated(() => {
            rule_atom();
        }, () => {
            consume(tok.space);
        }, _1);
    }, () => {
        consume(tok.space, tok.bar, tok.space);
    }, _0);
}

export function rule_atom() {
    or(t(tok.token_name), t(tok.var_name));
}