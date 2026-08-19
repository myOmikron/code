"""Graph-backed card search.

The thing Scryfall cannot express. `o:treasure` finds cards with the word
"Treasure" in their text — Treasure tokens, Treasure Cruise, cards that *hate*
Treasure. It cannot ask for "cards that produce Treasure", "cards that want a
resource my deck over-produces", or "Crab payoffs", because none of those are
in the text; they are in the extraction layer.

Every filter is an AND; values within one filter are an OR. Resource filters
traverse `BROADER`, so asking for `artifact_matters` finds Treasure producers
without naming Treasure.

Results are ranked by playability by default — of the 179 cards that produce
Treasure, that is what puts Smothering Tithe above a common that makes one
once. See `power.py` for why that is a proxy rather than a measure.

Query construction is parameterised throughout. The only interpolated parts are
relationship types and sort keys, both chosen from fixed maps rather than taken
from the request.

Free text goes through the `card_text` full-text index rather than a `CONTAINS`
predicate. `toLower(c.name) CONTAINS $text` cannot use the `card_name` range
index, so every keystroke scanned all 32k Card nodes; the index turns that into
a lookup, and it reaches oracle text as well as names.
"""

from __future__ import annotations

from dataclasses import dataclass, field

FULLTEXT_INDEX = "card_text"

# Lucene's boolean keywords are recognised by case, not by escaping — a
# backslash does not disarm them, and `+OR +x` is a parse error rather than a
# search for "or". Lowercasing does disarm them, and costs nothing: the
# analyser lowercases every term before matching anyway.
LUCENE_KEYWORDS = {"AND", "OR", "NOT"}

# A lone one-character prefix — `s*` — matches most of the corpus and is not
# worth asking the index. With other words in front of it to anchor the query
# the wildcard is cheap, and "Order of S" is someone mid-word, so the rule is
# about the query as a whole rather than about the term.
MIN_PREFIX = 2

# The apostrophe stays inside a word, always. A dot or comma stays only between
# two alphanumerics, which is where the analyser keeps them: `M.O.D.O.K.` and
# `100,000` are single tokens, but a trailing full stop is not part of one.
WORD_JOINERS = "'’"
INNER_JOINERS = ".,"

# Sort keys are looked up, never interpolated from user input.
SORTS = {
    "playability": "c.playability DESC",
    "price": "coalesce(c.price_usd, 999999) ASC",
    "price_desc": "coalesce(c.price_usd, 0) DESC",
    "cmc": "c.cmc ASC",
    "name": "c.name ASC",
    "rank": "coalesce(c.edhrec_rank, 999999) ASC",
}

DEFAULT_SORT = "playability"


@dataclass(slots=True)
class SearchQuery:
    produces: list[str] = field(default_factory=list)
    cares_about: list[str] = field(default_factory=list)
    roles: list[str] = field(default_factory=list)
    creature_types: list[str] = field(default_factory=list)
    makes_types: list[str] = field(default_factory=list)
    cares_about_types: list[str] = field(default_factory=list)
    themes: list[str] = field(default_factory=list)
    # Colour identity the card must fit *inside* — the Commander rule, not an
    # exact match, so a mono-blue card is a legal answer for a Simic commander.
    identity: list[str] | None = None
    text: str | None = None
    max_price: float | None = None
    min_playability: float = 0.0
    game_changers: bool | None = None
    exclude: list[str] = field(default_factory=list)
    sort: str = DEFAULT_SORT
    limit: int = 40

    def is_empty(self) -> bool:
        return not any(
            (
                self.produces,
                self.cares_about,
                self.roles,
                self.creature_types,
                self.makes_types,
                self.cares_about_types,
                self.themes,
                self.text,
                self.game_changers is not None,
            )
        )


def lucene_query(text: str) -> str | None:
    """Free text → a Lucene query over `card_text`, or None if there is nothing
    to ask.

    Every whole word is required. The last one is a *prefix*, because this box
    is a type-ahead and "sol ri" is someone half way through typing Sol Ring.

    Prefix matching is not the substring matching this replaces: "olri" no
    longer finds Sol Ring. That is the trade the index buys, and it matches
    what a search box is expected to do — "ring" still finds Sol Ring, because
    Lucene tokenises the name into words rather than treating it as one string.
    """
    words = _words(text)
    if not words:
        return None

    *head, last = words
    wildcard = bool(head) or len(last) >= MIN_PREFIX
    terms = [f"+{word}" for word in head]
    terms.append(f"+{last}*" if wildcard else f"+{last}")
    return " ".join(terms)


def _words(text: str) -> list[str]:
    """Split on punctuation rather than escaping it.

    The obvious move is to backslash-escape Lucene's operators so a name like
    `Ratonhnhaké:ton` is not read as a field query. It does not work: the index
    was written through the standard analyser, which *dropped* that colon, so
    the escaped term `Ratonhnhaké\\:ton` is a literal that nothing in the index
    can match. Escaping made the query legal and unanswerable.

    Dropping the punctuation instead matches how the text was indexed, and it
    also disarms every operator by construction — there is nothing left to
    escape. `Ach! Hans, Run!`, `El-Hajjâj` and `Kongming, "Sleeping Dragon"`
    all resolve; so does `sol -ring`, which someone typing a card name means
    literally rather than as an exclusion.

    Apostrophes stay, because the analyser keeps them inside a word: splitting
    `Urza's` into `urza` and `s` would stop it matching the token `urza's`. So
    do dots and commas *between* alphanumerics, for the same reason —
    `M.O.D.O.K.`, `Big Apple, 3 a.m.` and `Borrowing 100,000 Arrows` are all
    indexed with those inside the token, and all four of this repo's original
    round-trip failures were exactly that.
    """

    def keep(index: int, ch: str) -> bool:
        if ch.isalnum() or ch in WORD_JOINERS:
            return True
        return ch in INNER_JOINERS and _inner(text, index)

    chars = [ch if keep(index, ch) else " " for index, ch in enumerate(text)]

    strippable = WORD_JOINERS + INNER_JOINERS
    words = [word.strip(strippable) for word in "".join(chars).split()]
    return [word.lower() if word in LUCENE_KEYWORDS else word for word in words if word]


def _inner(text: str, index: int) -> bool:
    """Alphanumeric on both sides — the analyser's rule for keeping a joiner."""
    return (
        index > 0
        and index + 1 < len(text)
        and text[index - 1].isalnum()
        and text[index + 1].isalnum()
    )


def build_cypher(query: SearchQuery) -> tuple[str, dict]:
    """Compose the query. Returns `(cypher, params)`."""
    matches: list[str] = ["MATCH (c:Card)"]
    where: list[str] = []
    params: dict = {"limit": max(1, min(query.limit, 200))}

    def resource_hop(field_name: str, rel: str, values: list[str]) -> None:
        """Match a resource or anything narrower than it."""
        key = f"{field_name}_names"
        params[key] = values
        matches.append(f"MATCH (c)-[:{rel}]->(:Resource)-[:BROADER*0..]->(r_{field_name}:Resource)")
        where.append(f"r_{field_name}.name IN ${key}")

    if query.produces:
        resource_hop("produces", "PRODUCES", query.produces)
    if query.cares_about:
        resource_hop("cares", "CARES_ABOUT", query.cares_about)

    if query.roles:
        params["role_names"] = query.roles
        matches.append("MATCH (c)-[:FILLS_ROLE]->(role:Role)")
        where.append("role.name IN $role_names")

    for label, rel in (
        ("creature_types", "IS_TYPE"),
        ("makes_types", "MAKES_TYPE"),
        ("cares_about_types", "CARES_ABOUT_TYPE"),
    ):
        values = getattr(query, label)
        if values:
            params[f"{label}_names"] = values
            matches.append(f"MATCH (c)-[:{rel}]->(t_{label}:CreatureType)")
            where.append(f"t_{label}.name IN ${label}_names")

    if query.themes:
        params["theme_ids"] = query.themes
        matches.append("MATCH (c)-[:FITS_THEME]->(theme:Theme)")
        where.append("theme.id IN $theme_ids")

    if query.identity is not None:
        params["identity"] = query.identity
        where.append("all(sym IN c.color_identity WHERE sym IN $identity)")

    # The full-text call *seeds* the match instead of filtering it: starting
    # from the index's hits and narrowing beats starting from 32k Card nodes.
    # It replaces the seed rather than appending, so it stays first — a
    # procedure call cannot follow the MATCH clauses that depend on it.
    lucene = lucene_query(query.text) if query.text else None
    if lucene:
        params["index"] = FULLTEXT_INDEX
        # Tokenised the same way, or the name-match ranking below would be
        # asking whether "hans," appears in a name the analyser stored as "hans".
        params["text_words"] = [word.lower() for word in _words(query.text)]
        params["text"] = lucene
        matches[0] = "CALL db.index.fulltext.queryNodes($index, $text) YIELD node AS c"
    elif query.text:
        # Text that is all punctuation — "~~~" — has no terms to ask for. It
        # must match nothing: dropping the filter instead would answer a search
        # for gibberish with the top 40 cards in the game.
        where.append("false")

    if query.max_price is not None:
        params["max_price"] = query.max_price
        where.append("(c.price_usd IS NULL OR c.price_usd <= $max_price)")

    if query.min_playability > 0:
        params["min_playability"] = query.min_playability
        where.append("c.playability >= $min_playability")

    if query.game_changers is not None:
        params["game_changers"] = query.game_changers
        where.append("coalesce(c.game_changer, false) = $game_changers")

    if query.exclude:
        params["exclude"] = query.exclude
        where.append("NOT c.oracle_id IN $exclude")

    cypher = "\n".join(matches)
    if where:
        cypher += "\nWHERE " + "\n  AND ".join(where)

    # Name hits rank above rules-text hits, and the caller's sort orders each
    # bucket. Ordering by the index's relevance score instead would be the
    # conventional move, but score is continuous — it would leave `sort=price`
    # with nothing left to order, and "cheapest Treasure producer named sol"
    # is a question this box is supposed to answer.
    order = [SORTS.get(query.sort, SORTS[DEFAULT_SORT]), "c.name ASC"]
    projection = "WITH DISTINCT c"
    if lucene:
        projection = (
            "WITH DISTINCT c,\n"
            "     all(w IN $text_words WHERE toLower(c.name) CONTAINS w) AS name_match"
        )
        order.insert(0, "name_match DESC")

    # LIMIT before the projection, so the ordering discards rows rather than
    # the RETURN shaping every one of them first.
    cypher += f"""
{projection}
ORDER BY {", ".join(order)}
LIMIT $limit
RETURN c.oracle_id AS oracle_id, c.scryfall_id AS scryfall_id,
       c.name AS name, c.mana_cost AS mana_cost,
       c.cmc AS cmc, c.type_line AS type_line, c.color_identity AS color_identity,
       c.price_usd AS price_usd, c.edhrec_rank AS edhrec_rank,
       c.playability AS playability, coalesce(c.game_changer, false) AS game_changer,
       c.unreleased AS unreleased"""

    return cypher, params


def search(query: SearchQuery) -> list[dict]:
    from .config import settings
    from .graph import driver

    cypher, params = build_cypher(query)

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(record) for record in session.run(cypher, params)]


def facets() -> dict[str, list[dict]]:
    """What the UI can offer: the resources, roles, themes and types in use.

    Driven by the graph rather than the enums, so a term with no cards behind it
    never appears as a filter that returns nothing.
    """
    from .config import settings
    from .graph import driver

    queries = {
        "resources": """
            MATCH (c:Card)-[:PRODUCES|CARES_ABOUT]->(r:Resource)
            RETURN r.name AS value, count(DISTINCT c) AS count
            ORDER BY count DESC
        """,
        "roles": """
            MATCH (c:Card)-[:FILLS_ROLE]->(r:Role)
            RETURN r.name AS value, count(DISTINCT c) AS count
            ORDER BY count DESC
        """,
        "themes": """
            MATCH (c:Card)-[:FITS_THEME]->(t:Theme)
            RETURN t.id AS value, t.label AS label, count(c) AS count
            ORDER BY count DESC
        """,
        "creature_types": """
            MATCH (c:Card)-[:IS_TYPE]->(t:CreatureType)
            RETURN t.name AS value, count(c) AS count
            ORDER BY count DESC LIMIT 60
        """,
    }

    out: dict[str, list[dict]] = {}
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for name, cypher in queries.items():
            out[name] = [dict(record) for record in session.run(cypher)]

    return out
