"""Creature types as a third axis.

Magic has 379 creature types. They must **not** become `Resource` members — that
is exactly the fragmentation the closed vocabulary exists to prevent, and by the
rule in `docs/extraction.md` a creature type is a *parameter*, not a kind. So
types get their own node label and their own edges:

    (:Card)-[:IS_TYPE]->(:CreatureType)           what the card is
    (:Card)-[:CARES_ABOUT_TYPE]->(:CreatureType)  lords and payoffs
    (:Card)-[:MAKES_TYPE]->(:CreatureType)        token creation

The same bipartite bridge as everything else, on a different axis. Discovering
that was what made the extraction work: *creating* a Goblin token is not
*caring* about Goblins, it is supplying one, and conflating them put precision
at 0.355.

Scored against Tagger's `typal` closure: **precision 0.830, recall 0.619**. Some
of the apparent misses are cards Tagger has not tagged yet rather than errors —
a newly spoiled lord reads correctly here and is absent there, which is the
cold-start case working as intended.

Four things carry that precision, each worth a measurable amount:

1. **The vocabulary is derived, and so is its exclusion list.** A subtype seen
   more often on non-creatures than creatures is not a creature type — Forest
   and Island arrive via Dryad Arbor, Equipment via Equipment Creatures. Both
   were driving false positives.
2. **The type must be capitalised; the context must not be.** Case sensitivity
   on the type is what stops "bear" in "bearer" matching. Applying it to the
   whole pattern instead loses every lord, because oracle text opens sentences
   with "Other Goblins".
3. **Reminder text, the card's own name, token creation and animation text are
   masked.** "becomes a 2/1 blue Faerie creature" makes a Faerie; it does not
   care about Faeries.
4. **And/or lists are walked backwards.** Only the last item touches the context
   marker, so "Crabs, Lobsters, Nautiluses, Starfish, and/or Trilobites you
   control" yields two types without it and five with.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

# Contexts that turn a capitalised word into a typal reference. The type is
# matched case-sensitively; the surrounding words are not.
CONTEXTS = (
    r"(?i:other) {f}\b",
    r"{f} (?i:you control)",
    r"{f} (?i:creatures?)\b",
    r"{f} (?i:spells?)\b",
    r"(?i:number of) {f}\b",
    r"(?i:each) {f}\b",
    r"(?i:target) {f}\b",
    r"(?i:another target) {f}\b",
    r"(?i:a) {f} (?i:enters)",
    r"{f} (?i:entering)",
    r"{f} (?i:you own)",
    r"(?i:all) {f}\b",
)

REMINDER = re.compile(r"\([^)]*\)")
ANIMATE = re.compile(r"(becomes?|is|are)\s+(a|an)?\s*[\d*X]+/[\d*X]+[^.]{0,60}?creature")


def plural_forms(singular: str) -> set[str]:
    """Magic's type plurals. Irregular in a handful of places that matter:
    Elf -> Elves, Fungus -> Fungi, Starfish -> Starfish."""
    out = {singular}
    if singular.endswith("f"):
        out.add(singular[:-1] + "ves")
    if singular.endswith("fe"):
        out.add(singular[:-2] + "ves")
    if singular.endswith("us"):
        out.update({singular[:-2] + "i", singular + "es"})
    if singular.endswith(("s", "x", "z", "ch", "sh")):
        out.add(singular + "es")
    if singular.endswith("y") and singular[-2:-1] not in "aeiou":
        out.add(singular[:-1] + "ies")
    out.add(singular + "s")
    return out


@dataclass(frozen=True, slots=True)
class TypeVocabulary:
    types: frozenset[str]
    forms: dict[str, frozenset[str]]  # surface form -> the types it can mean
    _alternation: str

    def resolve(self, form: str) -> frozenset[str]:
        return self.forms.get(form, frozenset())


def build_vocabulary(type_lines: list[str]) -> TypeVocabulary:
    """Derive the creature-type vocabulary from the corpus itself.

    Self-maintaining: a type introduced by a new set appears here with no edit.
    """
    creature: Counter[str] = Counter()
    other: Counter[str] = Counter()

    for line in type_lines:
        for part in line.split("//"):
            if "—" not in part:
                continue
            subtypes = [t for t in part.split("—")[1].split() if t[:1].isupper()]
            target = creature if "Creature" in part else other
            for subtype in subtypes:
                target[subtype] += 1

    types = {t for t, n in creature.items() if n > other.get(t, 0)}

    forms: dict[str, set[str]] = {}
    for t in types:
        for form in plural_forms(t):
            forms.setdefault(form, set()).add(t)

    alternation = "|".join(re.escape(f) for f in sorted(forms, key=len, reverse=True))
    return TypeVocabulary(
        types=frozenset(types),
        forms={k: frozenset(v) for k, v in forms.items()},
        _alternation=alternation,
    )


def _compiled(vocab: TypeVocabulary):
    alt = vocab._alternation
    return (
        [re.compile(c.format(f=f"(?P<t>{alt})")) for c in CONTEXTS],
        re.compile(rf"((?:(?:{alt})\s*,?\s*(?:and/or|and|or)?\s*)+)$"),
        re.compile(rf"[Cc]reates?\b[^.]{{0,60}}?\b(?:{alt})\b[^.]{{0,30}}?tokens?"),
        re.compile(rf"non-(?:{alt})\b"),
        re.compile(alt),
    )


def _mask(text: str, name: str, token_span, negated) -> str:
    blank = lambda m: " " * len(m.group(0))  # noqa: E731
    text = REMINDER.sub(blank, text)

    # Oracle text refers to the card by name, so "Sliver Overlord" would read as
    # caring about Slivers purely from its own title.
    for part in re.split(r"\s*//\s*", name):
        part = part.strip()
        if part:
            text = text.replace(part, " " * len(part))

    text = token_span.sub(blank, text)
    text = ANIMATE.sub(blank, text)
    return negated.sub(blank, text)


def extract(text: str, name: str, vocab: TypeVocabulary) -> tuple[set[str], set[str]]:
    """Return `(cares_about, makes)` creature types for one card."""
    if not text:
        return set(), set()

    patterns, list_tail, token_span, negated, bare = _compiled(vocab)

    makes: set[str] = set()
    for match in token_span.finditer(text):
        for form in bare.findall(match.group(0)):
            makes |= vocab.resolve(form)

    masked = _mask(text, name, token_span, negated)
    cares: set[str] = set()

    for pattern in patterns:
        for match in pattern.finditer(masked):
            cares |= vocab.resolve(match.group("t"))
            # Only the last item of an and/or list touches the context marker.
            tail = list_tail.search(masked[: match.start("t")])
            if tail:
                for form in bare.findall(tail.group(1)):
                    cares |= vocab.resolve(form)

    return cares, makes


def own_types(type_line: str, vocab: TypeVocabulary) -> set[str]:
    """The creature types a card *is*, from its type line."""
    out: set[str] = set()
    for part in type_line.split("//"):
        if "Creature" in part and "—" in part:
            out |= {t for t in part.split("—")[1].split() if t in vocab.types}
    return out


def build_typal_edges() -> dict[str, int]:
    """Extract creature types across the corpus and write the three edge types."""
    import structlog

    from .graph import all_card_text, clear_typal, typal_stats, write_typal

    log = structlog.get_logger(__name__)
    cards = all_card_text()
    vocab = build_vocabulary([c["type_line"] or "" for c in cards])

    rows = []
    for card in cards:
        cares, makes = extract(card["oracle_text"] or "", card["name"] or "", vocab)
        is_type = own_types(card["type_line"] or "", vocab)
        if cares or makes or is_type:
            rows.append(
                {
                    "oracle_id": card["oracle_id"],
                    "is_type": sorted(is_type),
                    "cares": sorted(cares),
                    "makes": sorted(makes),
                }
            )

    clear_typal()
    write_typal(rows)

    stats = typal_stats()
    log.info("typal.built", vocabulary=len(vocab.types), cards=len(rows), **stats)
    return stats
