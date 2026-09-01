"""A Scryfall-flavoured pool restriction, compiled to a Cypher predicate.

The advisor's retrieval channels share one hard filter (`graph._HARD_FILTER`);
this module turns a user-written query — `eur<5 -t:artifact year>=2020` — into
one more clause of it, so a budget or era restriction scopes every channel at
the source instead of censoring a ranked answer afterwards.

The syntax is a *subset* of Scryfall's, bounded by what the Card node stores:

- text: `t:`/`type:`, `o:`/`oracle:`, bare words and quoted strings (name)
- keywords: `kw:`/`keyword:`
- enums: `r:`/`rarity:`, `s:`/`set:`/`e:`, `is:` flags, `banned:` format
- numbers: `mv`/`cmc`, `eur`, `usd`, `pow`/`power`, `tou`/`toughness`, `year`,
  each with `:` `=` `<` `<=` `>` `>=`
- combinators: juxtaposition is AND, `or`, `-` negates, parentheses group

Deliberately absent: `legal:`/`f:` (the graph stores no positive per-format
legality — adding it means a new ingest property and a re-ingest), `c:`/`id:`
(the deck's identity already scopes colours, and Rule 0 owns overriding it),
rarity comparisons, regexes, and `!"exact name"`.

A term whose *field* is unknown — those above, `order:edhrec`, any typo —
is dropped rather than rejected, so a query pasted from Scryfall keeps
working with the terms the graph can answer; a negation or `or` branch
reduced to nothing vanishes with it. Known fields still validate their
values: `year>=20` stays an error.

Two semantic notes the UI help text must carry:

- The corpus is Scryfall's `oracle_cards` — one canonical printing per card —
  so `set:` and `year` mean *that printing's* set and date, not "ever printed
  in". `year<=1995` misses every reprinted classic.
- A card with no price is *excluded* by `eur<5`. That follows Cypher's null
  comparisons and matches Scryfall; it is the opposite of the legacy
  `max_price` clause in `_HARD_FILTER`, which waves unpriced cards through.

Injection safety is structural: predicates are assembled from the fixed
templates in this module and nothing else, and every user value travels as a
`$pq_<n>` parameter. `tests/test_poolquery.py` holds the hostile-input proof,
in the same style as search.py's.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import _BANNABLE_FORMATS

MAX_QUERY_LENGTH = 400
# Bounds the compiled predicate: every term is one clause, and a hostile
# 400-character payload of one-letter terms would otherwise compile to a
# WHERE clause with hundreds of them.
MAX_TERMS = 32


class PoolQueryError(ValueError):
    """A query that cannot be compiled, pointing at the offending spot."""

    def __init__(self, message: str, position: int) -> None:
        super().__init__(message)
        self.position = position


@dataclass(frozen=True, slots=True)
class PoolFilter:
    """Everything the hard filter needs to scope the pool.

    Carries `max_price` too, so the channels thread one object instead of a
    growing kwarg list. `predicate` is a self-contained boolean Cypher
    expression over `c`, or `""` for "no restriction"; `params` holds its
    `pq_*` parameters. `query` keeps the raw text for cache keys and notes.
    """

    max_price: float | None = None
    query: str | None = None
    predicate: str = ""
    params: dict[str, object] = field(default_factory=dict)


# --- field tables ----------------------------------------------------------
# The whitelist IS the security boundary: property names, operators and
# Cypher fragments come from here and nowhere else.

_TEXT_FIELDS = {
    "t": "type_line",
    "type": "type_line",
    "o": "oracle_text",
    "oracle": "oracle_text",
}

_NUMERIC_FIELDS = {
    "mv": "cmc",
    "cmc": "cmc",
    "eur": "price_eur",
    "usd": "price_usd",
    "pow": "power",
    "power": "power",
    "tou": "toughness",
    "toughness": "toughness",
}

_RARITIES = ("common", "uncommon", "rare", "mythic", "special", "bonus")

# Every flag coalesced: the properties are written for the whole corpus today,
# but a null on a future node must read as "not the thing", never as a null
# that silently drops the clause's row from both `is:x` and `-is:x`.
_IS_FLAGS = {
    "legendary": "coalesce(c.is_legendary, false)",
    "creature": "coalesce(c.is_creature, false)",
    "land": "coalesce(c.is_land, false)",
    "commander": "coalesce(c.can_be_commander, false)",
    "gamechanger": "coalesce(c.game_changer, false)",
    "reserved": "coalesce(c.reserved, false)",
    "unreleased": "coalesce(c.unreleased, false)",
}

# Every key `_term` dispatches on; a term with any other key is dropped by
# the compiler rather than rejected — see the module docstring.
_KNOWN_KEYS = (
    frozenset(_TEXT_FIELDS)
    | frozenset(_NUMERIC_FIELDS)
    | {"kw", "keyword", "r", "rarity", "s", "set", "e", "year", "is", "banned"}
)

_COMPARATORS = ("<=", ">=", "<", ">", ":", "=")
_YEAR = re.compile(r"^\d{4}$")


# --- tokenizer -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Token:
    kind: str  # "lparen" | "rparen" | "neg" | "term" | "word"
    pos: int
    key: str = ""
    op: str = ""
    value: str = ""


def _read_quoted(text: str, start: int) -> tuple[str, int]:
    """The string inside the quotes and the index past the closing one.

    No escape syntax: no card name contains a double quote, so a backslash
    rule would only add a way to write an unanswerable query.
    """
    end = text.find('"', start + 1)
    if end < 0:
        raise PoolQueryError("unclosed quote", start)
    return text[start + 1 : end], end + 1


def _split_term(word: str, pos: int) -> _Token:
    """One whitespace-delimited word → a `term` (key op value) or a bare `word`.

    The *first* comparator splits, so a value may contain later colons
    (`o:pay 2:` stays wrong for other reasons, but the split is stable).
    """
    indices = [(word.find(op[0]), op) for op in _COMPARATORS if word.find(op[0]) > 0]
    if not indices:
        return _Token("word", pos, value=word)

    index = min(i for i, _ in indices)
    op = word[index : index + 2] if word[index : index + 2] in ("<=", ">=") else word[index]
    return _Token("term", pos, key=word[:index], op=op, value=word[index + len(op) :])


def _tokenize(text: str) -> list[_Token]:
    tokens: list[_Token] = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch.isspace():
            i += 1
        elif ch in "()":
            tokens.append(_Token("lparen" if ch == "(" else "rparen", i))
            i += 1
        elif ch == "-":
            tokens.append(_Token("neg", i))
            i += 1
        elif ch == '"':
            start = i
            value, i = _read_quoted(text, i)
            tokens.append(_Token("word", start, value=value))
        else:
            start = i
            while i < len(text) and not text[i].isspace() and text[i] not in '()"':
                i += 1
            token = _split_term(text[start:i], start)
            # `o:"draw a card"` — the quote opens right after the operator, so
            # the quoted string is this term's value rather than a bare word.
            if token.kind == "term" and not token.value and i < len(text) and text[i] == '"':
                value, i = _read_quoted(text, i)
                token = _Token("term", start, key=token.key, op=token.op, value=value)
            tokens.append(token)
    return tokens


# --- parser / compiler -----------------------------------------------------


class _Compiler:
    """Recursive descent over the token list, emitting Cypher as it parses.

    Small enough that a separate AST would be scaffolding: every production
    returns its finished predicate string, and `params` accumulates on the
    side.
    """

    def __init__(self, tokens: list[_Token], length: int) -> None:
        self.tokens = tokens
        self.length = length
        self.index = 0
        self.terms = 0
        self.params: dict[str, object] = {}

    def _peek(self) -> _Token | None:
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def _bind(self, value: object) -> str:
        name = f"pq_{len(self.params)}"
        self.params[name] = value
        return f"${name}"

    def compile(self) -> str:
        predicate = self._or()
        if (token := self._peek()) is not None:
            raise PoolQueryError("unmatched ')'", token.pos)
        # A query of nothing but dropped terms compiles to "no restriction".
        return predicate or ""

    def _or(self) -> str | None:
        parts = [self._and()]
        while (token := self._peek()) and token.kind == "word" and token.value.lower() == "or":
            self.index += 1
            parts.append(self._and())
        kept = [part for part in parts if part is not None]
        if not kept:
            return None
        return kept[0] if len(kept) == 1 else "(" + " OR ".join(kept) + ")"

    def _and(self) -> str | None:
        parts: list[str] = []
        dropped = False
        while (token := self._peek()) is not None:
            if token.kind == "rparen":
                break
            if token.kind == "word" and token.value.lower() == "or":
                break
            # A literal "and" is what someone types when they mean the
            # juxtaposition they already have — accepted and skipped.
            if token.kind == "word" and token.value.lower() == "and":
                self.index += 1
                continue
            part = self._unary()
            if part is None:
                dropped = True
            else:
                parts.append(part)
        if not parts:
            if dropped:
                return None
            position = self.tokens[self.index - 1].pos if self.index else self.length
            raise PoolQueryError("expected a search term", position)
        return parts[0] if len(parts) == 1 else "(" + " AND ".join(parts) + ")"

    def _unary(self) -> str | None:
        token = self._peek()
        assert token is not None  # callers checked
        if token.kind == "neg":
            self.index += 1
            if self._peek() is None:
                raise PoolQueryError("'-' needs a term to negate", token.pos)
            inner = self._unary()
            return None if inner is None else f"NOT ({inner})"
        if token.kind == "lparen":
            self.index += 1
            inner = self._or()
            closing = self._peek()
            if closing is None or closing.kind != "rparen":
                raise PoolQueryError("unclosed '('", token.pos)
            self.index += 1
            return inner
        self.index += 1
        if token.kind == "rparen":
            raise PoolQueryError("unmatched ')'", token.pos)
        self.terms += 1
        if self.terms > MAX_TERMS:
            raise PoolQueryError(f"more than {MAX_TERMS} terms", token.pos)
        if token.kind == "word":
            return f"toLower(c.name) CONTAINS toLower({self._bind(token.value)})"
        return self._term(token)

    def _term(self, token: _Token) -> str | None:
        key, op, value = token.key.lower(), token.op, token.value
        if key not in _KNOWN_KEYS:
            return None
        if not value:
            raise PoolQueryError(f"'{token.key}{op}' is missing its value", token.pos)

        if key in _TEXT_FIELDS:
            self._exact_only(token)
            return f"toLower(c.{_TEXT_FIELDS[key]}) CONTAINS toLower({self._bind(value)})"

        if key in ("kw", "keyword"):
            self._exact_only(token)
            return f"any(k IN c.keywords WHERE toLower(k) = toLower({self._bind(value)}))"

        if key in ("r", "rarity"):
            self._exact_only(token)
            return f"c.rarity = {self._bind(self._enum(value.lower(), _RARITIES, token))}"

        if key in ("s", "set", "e"):
            self._exact_only(token)
            return f"c.set_code = {self._bind(value.lower())}"

        if key == "year":
            if not _YEAR.match(value):
                raise PoolQueryError(f"{value!r} is not a four-digit year", token.pos)
            # String comparison on the ISO date's first four characters —
            # lexicographic order and numeric order agree for fixed width.
            return f"substring(c.released_at, 0, 4) {self._cypher_op(op)} {self._bind(value)}"

        if key in _NUMERIC_FIELDS:
            try:
                number = float(value)
            except ValueError:
                raise PoolQueryError(f"{value!r} is not a number", token.pos) from None
            return f"c.{_NUMERIC_FIELDS[key]} {self._cypher_op(op)} {self._bind(number)}"

        if key == "is":
            self._exact_only(token)
            flag = value.lower()
            if flag not in _IS_FLAGS:
                raise PoolQueryError(
                    f"unknown is: value {value!r}; expected one of {', '.join(sorted(_IS_FLAGS))}",
                    token.pos,
                )
            return _IS_FLAGS[flag]

        if key == "banned":
            self._exact_only(token)
            fmt = self._bind(self._enum(value.lower(), _BANNABLE_FORMATS, token))
            return f"{fmt} IN c.banned_in"

        raise PoolQueryError(f"unknown field {token.key!r}", token.pos)

    @staticmethod
    def _exact_only(token: _Token) -> None:
        if token.op not in (":", "="):
            raise PoolQueryError(f"'{token.key}' does not support '{token.op}'", token.pos)

    @staticmethod
    def _cypher_op(op: str) -> str:
        return "=" if op in (":", "=") else op

    @staticmethod
    def _enum(value: str, allowed: tuple[str, ...], token: _Token) -> str:
        if value not in allowed:
            raise PoolQueryError(
                f"unknown {token.key} value {token.value!r}; expected one of {', '.join(allowed)}",
                token.pos,
            )
        return value


def parse_pool_query(text: str, *, max_price: float | None = None) -> PoolFilter:
    """Compile a pool query, or raise `PoolQueryError` pointing at the fault.

    Whitespace-only input is "no restriction" rather than an error — an empty
    input box is the resting state, not a mistake.
    """
    if len(text) > MAX_QUERY_LENGTH:
        raise PoolQueryError(f"query longer than {MAX_QUERY_LENGTH} characters", MAX_QUERY_LENGTH)

    stripped = text.strip()
    if not stripped:
        return PoolFilter(max_price=max_price)

    compiler = _Compiler(_tokenize(text), len(text))
    predicate = compiler.compile()
    return PoolFilter(
        max_price=max_price, query=stripped, predicate=predicate, params=compiler.params
    )
