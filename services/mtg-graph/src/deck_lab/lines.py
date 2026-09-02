"""The line engine — cost, reachability, redundancy, and fold classes over
Commander Spellbook combos.

`/combos` answers "am I one card short of this combo"; a competitive player's
next three questions are never answered there: what does completing it cost,
what colours and zones does it demand, which of my tutors can find the piece
I'm missing, and — the one that actually matters at the table — what turns it
off. This module answers all four, reusing `spellbook.ingest_combos`'
`(:Combo)-[:USES]->(:Card)` layer (now carrying cost/zone/prerequisite
properties too, see `spellbook.parse_variant` and `graph.UPSERT_COMBOS`)
rather than a second corpus.

The fold taxonomy (`FoldClass`) is deliberately closed, like `vocabulary.py`:
it names a *hate class* a line dies to (graveyard hate, a stax piece that
kills activated abilities, ...), never a specific card — Task H's job is
mapping classes to real answers. Detection is rules.py-style throughout:
graph predicates where the semantic graph already computed the answer
(`etb_trigger`, `cast_trigger` and the graveyard-resource family all exist as
real `PRODUCES`/`CARES_ABOUT` edges already), regex only where nothing does —
measured against named lines, not a labelled corpus, and the numbers are
recorded beside each rule.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

import structlog

from .vocabulary import TRIGGER_RESOURCES

log = structlog.get_logger(__name__)

# Near-misses are popularity-ordered and effectively unbounded (a busy
# commander is one card short of dozens of obscure variants) — the same
# problem `COMBO_SUGGESTION_LIMIT` solves in `suggestions.py` for the same
# reason: an uncapped list of interchangeable one-away combos reads as noise
# and buries the strongest few. Same number, independent constant — this
# module does not import from `suggestions.py`.
LINE_NEAR_MISS_LIMIT = 12


class FoldClass(StrEnum):
    """What hate class turns a line off, named by mechanism rather than by
    card. Closed on purpose, like `vocabulary.py` — Task H's job is mapping
    a class to real meta answers; this module only says which classes apply.
    """

    GRAVEYARD = "graveyard"
    ACTIVATED_ABILITY = "activated_ability"
    TRIGGERED_ABILITY = "triggered_ability"
    ETB = "etb"
    CAST_TRIGGER = "cast_trigger"
    ARTIFACT_DEPENDENT = "artifact_dependent"
    CREATURE_DEPENDENT = "creature_dependent"
    ENCHANTMENT_DEPENDENT = "enchantment_dependent"
    LIBRARY = "library"


ALL_FOLD_CLASSES: frozenset[FoldClass] = frozenset(FoldClass)


@dataclass(frozen=True, slots=True)
class PieceInfo:
    """One combo piece's shape, as `classify_folds` needs it. Pure data —
    kept separate from `LinePiece` below so fold detection stays testable
    without a `Line` (and its deck-membership bookkeeping) in the way.

    `produces` and `cares_about` are kept apart rather than merged into one
    resource set: `rules.py`'s `cheap_instant_or_sorcery` rule gives *every*
    cheap instant/sorcery a structural `PRODUCES cast_trigger` (a true
    statement about what casting it counts toward), which would tag almost
    any line containing one as cast-trigger-dependent if the two sides were
    merged — see `_CAST_TRIGGER_RESOURCES` below for why that distinction is
    load-bearing.
    """

    name: str
    type_line: str
    oracle_text: str
    zones: tuple[str, ...]
    produces: frozenset[str]
    cares_about: frozenset[str]


# --------------------------------------------------------------------------
# Fold detection
# --------------------------------------------------------------------------

# Graveyard-family resources: real `PRODUCES`/`CARES_ABOUT` edges the
# semantic graph already computed (`vocabulary.py`, `rules.py`,
# `tag_mapping.py`). A piece caring about `graveyard_any` (Underworld
# Breach's own escape ability) is graveyard-dependent even when neither its
# `zoneLocations` nor Spellbook's prerequisite text says so — spot-checked
# live: "Underworld Breach + Burning Inquiry + Electro, Assaulting Battery"
# carries no `G` zone and no graveyard-mentioning prerequisite text at all,
# and would miss the fold on zones/prerequisites alone. This is the judgment
# call that closes that gap — a third signal, not a replacement for the two
# the taxonomy names.
_GRAVEYARD_RESOURCES = frozenset(
    {
        "graveyard_any",
        "graveyard_creature",
        "graveyard_instant_sorcery",
        "graveyard_artifact",
        "graveyard_land",
        "recursion_any",
        "recursion_to_hand",
        "recursion_to_battlefield",
        "commander_recursion",
        "self_mill",
        "exile_from_graveyard",
    }
)
_GRAVEYARD_PREREQ_RE = re.compile(r"(?si)\bgraveyard\b")

# Cast-trigger family: `CARES_ABOUT` only, never `PRODUCES`. `rules.py`'s
# `cheap_instant_or_sorcery` rule grants `PRODUCES` for these three resources
# structurally to *every* cheap instant/sorcery (it is a true statement about
# what casting the card counts toward), which would tag almost any line
# containing one as `cast_trigger` — Demonic Consultation and Tainted Pact
# both produce it and neither is a storm piece. `CARES_ABOUT` is the
# genuine payoff signal: Runaway Steam-Kin and Jeskai Ascendancy both care
# about `cast_trigger`, and that is the card actually doing something with
# the trigger.
_CAST_TRIGGER_RESOURCES = frozenset(
    {"cast_trigger", "magecraft_trigger", "storm_count", "prowess_trigger"}
)
_ETB_RESOURCES = frozenset({"etb_trigger"})
# The rest of the trigger family, minus etb/ltb (their own class) and the
# whole cast-trigger family (its own class): death, attack, combat-damage,
# upkeep, end-step, lifegain and landfall triggers. `PRODUCES` or
# `CARES_ABOUT` either one counts here — a piece producing its own death
# trigger and a piece caring about someone else's are both "this line rides
# a death trigger". Subtracting `_CAST_TRIGGER_RESOURCES` rather than
# hand-listing `cast_trigger` alone matters: `prowess_trigger` and
# `magecraft_trigger` also end in `_trigger` (so `TRIGGER_RESOURCES` includes
# them) and are the same structural "every cheap instant/sorcery produces
# this" rule — leaving them in this set silently reproduced the exact
# over-tagging problem the CARES_ABOUT-only cast_trigger rule exists to
# avoid, just one class over. Caught live: Thassa's Oracle + Demonic
# Consultation picked up `triggered_ability` from Consultation's structural
# `PRODUCES magecraft_trigger` before this fix.
_OTHER_TRIGGER_RESOURCES = (
    frozenset(TRIGGER_RESOURCES)
    - _CAST_TRIGGER_RESOURCES
    - {
        "etb_trigger",
        "ltb_trigger",
    }
)

# Activated/loyalty abilities are templated in the rules themselves as
# "cost: effect" on their own line — this is not a guess at a convention, it
# is the actual templating rule, which is why one regex covers Devoted
# Druid's two mana/counter-cost abilities and a planeswalker's "+1:"/"-8:"
# alike. `(?m)` so each ability line is checked independently; oracle_text
# carries real newlines between abilities (confirmed against the live
# export).
_ACTIVATED_ABILITY_RE = re.compile(r"(?m)^[^:\n]{1,60}:\s")

# Library fold, split into the two shapes the canonical family actually
# uses rather than one loose "mentions library" regex — a loose version
# matches nearly every impulse-draw card ("Exile the top card of your
# library. You may play it"), which is not this fold. `_WINCON` is the
# payoff side (Thassa's Oracle, Jace, Wielder of Mysteries, Laboratory
# Maniac): "library" and "win the game" in the same sentence, no period
# between them. `_DECKOUT` is the enabler side (Demonic Consultation,
# Tainted Pact): the specific "reveal until you hit the name" / "same name
# as another card exiled" templates neither shares with a normal tutor.
# Narrow on purpose — recall past this named family is unmeasured, the same
# honesty rules.py keeps about `reanimate`/`sweeper`.
_LIBRARY_WINCON_RE = re.compile(r"(?si)\blibrary\b[^.]{0,80}\bwin the game\b")
_LIBRARY_DECKOUT_RE = re.compile(
    r"(?si)\breveal (?:cards|a card) from the top of your library until\b"
    r"|\bsame name as another card exiled\b"
)

# Type-dependence: "at least half the pieces share the type" read straight
# off `type_line`. `Card` and `Battle` are not offered — no canonical line in
# the corpus has needed them yet, and adding an unused fold class would just
# be an unaudited guess.
_DEPENDENT_TYPES: tuple[tuple[str, FoldClass], ...] = (
    ("artifact", FoldClass.ARTIFACT_DEPENDENT),
    ("creature", FoldClass.CREATURE_DEPENDENT),
    ("enchantment", FoldClass.ENCHANTMENT_DEPENDENT),
)


def classify_folds(
    pieces: Sequence[PieceInfo], prereq_easy: str, prereq_notable: str
) -> frozenset[FoldClass]:
    """The fold classes a line belongs to — see the module docstring and the
    per-rule comments above for what each predicate reads and why.

    Canonical spot checks (encoded as tests in `test_lines.py`):
    Thassa's Oracle + Demonic Consultation/Tainted Pact -> {library,
    creature_dependent}, NOT graveyard; any Devoted Druid line ->
    {activated_ability, creature_dependent}; Underworld Breach lines ->
    {graveyard, cast_trigger}.
    """
    folds: set[FoldClass] = set()
    prereq_text = f"{prereq_easy}\n{prereq_notable}"

    def _resources(piece: PieceInfo) -> frozenset[str]:
        return piece.produces | piece.cares_about

    if any("G" in piece.zones for piece in pieces) or _GRAVEYARD_PREREQ_RE.search(prereq_text):
        folds.add(FoldClass.GRAVEYARD)
    if any(_resources(piece) & _GRAVEYARD_RESOURCES for piece in pieces):
        folds.add(FoldClass.GRAVEYARD)

    if any(_ACTIVATED_ABILITY_RE.search(piece.oracle_text) for piece in pieces):
        folds.add(FoldClass.ACTIVATED_ABILITY)

    # CARES_ABOUT only, deliberately not `_resources()` — see the `PieceInfo`
    # docstring: a cheap instant/sorcery structurally *produces* this triple,
    # which would tag Demonic Consultation/Tainted Pact as cast-trigger-
    # dependent despite doing nothing storm-like. Caring about the trigger is
    # what a real payoff (Runaway Steam-Kin, Jeskai Ascendancy) does.
    if any(piece.cares_about & _CAST_TRIGGER_RESOURCES for piece in pieces):
        folds.add(FoldClass.CAST_TRIGGER)
    if any(_resources(piece) & _ETB_RESOURCES for piece in pieces):
        folds.add(FoldClass.ETB)
    if any(_resources(piece) & _OTHER_TRIGGER_RESOURCES for piece in pieces):
        folds.add(FoldClass.TRIGGERED_ABILITY)

    def _cares_about_library(piece: PieceInfo) -> bool:
        text = piece.oracle_text
        return bool(_LIBRARY_WINCON_RE.search(text) or _LIBRARY_DECKOUT_RE.search(text))

    if any(_cares_about_library(piece) for piece in pieces):
        folds.add(FoldClass.LIBRARY)

    total = len(pieces) or 1
    for word, fold in _DEPENDENT_TYPES:
        share = sum(1 for piece in pieces if word in piece.type_line.lower()) / total
        if share >= 0.5:
            folds.add(fold)

    return frozenset(folds)


# --------------------------------------------------------------------------
# Lines
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class LinePiece:
    name: str
    oracle_id: str
    type_line: str
    zones: tuple[str, ...]
    must_be_commander: bool
    quantity: int
    in_deck: bool
    # Not part of the `/lines` API contract's `cards[]` shape — kept here so
    # `api.py` can apply the same "filter the missing piece by colour
    # identity" rule `/combos` applies, without a second graph round trip.
    color_identity: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Line:
    id: str
    cards: tuple[LinePiece, ...]
    mana_needed: str
    mana_value_needed: int
    identity: tuple[str, ...]
    produces: tuple[str, ...]
    bracket_tag: str
    popularity: int
    prereq_easy: str
    prereq_notable: str
    folds_to: frozenset[FoldClass]
    complete: bool
    missing: tuple[str, ...]

    @property
    def missing_oracle_id(self) -> str | None:
        """The oracle id of the one piece this line is short, or `None` for
        a complete line. `DECK_LINES` shares `DECK_COMBOS`' `have >=
        k.pieces - 1` gate, so there is never more than one."""
        piece = next((card for card in self.cards if not card.in_deck), None)
        return piece.oracle_id if piece else None


def _line_from_row(row: dict, deck: frozenset[str]) -> Line:
    uses: list[str] = row["uses"]
    names: list[str] = row["names"]
    count = len(uses)
    type_lines = row.get("type_lines") or [""] * count
    oracle_texts = row.get("oracle_texts") or [""] * count
    color_identities = row.get("color_identities") or [[]] * count
    zones_list = row.get("zones") or [[]] * count
    must_be_commander = row.get("must_be_commander") or [False] * count
    quantities = row.get("quantities") or [1] * count
    produces_list = row.get("piece_produces") or [[]] * count
    cares_list = row.get("piece_cares") or [[]] * count

    pieces_info = [
        PieceInfo(
            name=name,
            type_line=type_line or "",
            oracle_text=oracle_text or "",
            zones=tuple(zones or ()),
            produces=frozenset(produces or ()),
            cares_about=frozenset(cares or ()),
        )
        for name, type_line, oracle_text, zones, produces, cares in zip(
            names, type_lines, oracle_texts, zones_list, produces_list, cares_list, strict=True
        )
    ]

    cards = tuple(
        LinePiece(
            name=name,
            oracle_id=oracle_id,
            type_line=type_line or "",
            zones=tuple(zones or ()),
            must_be_commander=bool(must_be_cmd),
            quantity=int(quantity or 1),
            in_deck=oracle_id in deck,
            color_identity=tuple(color_identity or ()),
        )
        for oracle_id, name, type_line, zones, must_be_cmd, quantity, color_identity in zip(
            uses,
            names,
            type_lines,
            zones_list,
            must_be_commander,
            quantities,
            color_identities,
            strict=True,
        )
    )
    missing = tuple(
        name for oracle_id, name in zip(uses, names, strict=True) if oracle_id not in deck
    )
    prereq_easy = row.get("prereq_easy") or ""
    prereq_notable = row.get("prereq_notable") or ""

    return Line(
        id=row["id"],
        cards=cards,
        mana_needed=row.get("mana_needed") or "",
        mana_value_needed=int(row.get("mana_value_needed") or 0),
        identity=tuple(row.get("identity") or ""),
        produces=tuple(row.get("produces") or ()),
        bracket_tag=row.get("bracket") or "",
        popularity=int(row.get("popularity") or 0),
        prereq_easy=prereq_easy,
        prereq_notable=prereq_notable,
        folds_to=classify_folds(pieces_info, prereq_easy, prereq_notable),
        complete=not missing,
        missing=missing,
    )


def deck_lines(deck_oracle_ids: list[str]) -> list[Line]:
    """Every combo the deck completes or is exactly one card short of, each
    carrying cost, colours, zones, prerequisites and fold classes.

    No HTTP fallback, unlike `spellbook.deck_combos`: cost/zone/prerequisite
    data only exists on the ingested graph (`deck-lab ingest-combos`), and
    Spellbook's live API carries none of it — an empty combo layer here must
    read as "not ingested yet", never as a slower equivalent answer.
    """
    from .graph import deck_line_rows

    deck = frozenset(deck_oracle_ids)
    return [_line_from_row(row, deck) for row in deck_line_rows(deck_oracle_ids)]


# --------------------------------------------------------------------------
# Tutor reach
# --------------------------------------------------------------------------

_TUTOR_CARD_TYPES = frozenset(
    {
        "creature",
        "artifact",
        "enchantment",
        "instant",
        "sorcery",
        "land",
        "planeswalker",
        "permanent",
    }
)

# The templated "search your library ... for a(n) <type> card" clause. Reads
# only the words between "for" and "card(s)"; words outside `_TUTOR_CARD_TYPES`
# (colour, mana value, "with flying") are dropped rather than guessed at.
_TUTOR_TARGET_RE = re.compile(
    r"(?si)search\s+(?:your|a)\s+library.*?\bfor\b\s+(?:up to \w+\s+)?"
    # "an" before "a": alternation tries left-to-right, and "a" alone would
    # otherwise match the first letter of "an instant..." and leave a stray
    # "n" glued onto the captured type words.
    r"(?:(?:an|a|\d+)\b)?\s*([a-z][a-z /\-]*?)\s+cards?\b"
)


@dataclass(frozen=True, slots=True)
class TutorReach:
    tutor: str
    reaches: tuple[str, ...]  # line ids


def _tutor_target_classes(oracle_text: str) -> frozenset[str] | None:
    """The card types a tutor's search clause names, or `None` when it is
    unrestricted (a plain "for a card") or the clause could not be read at
    all. Neither Tagger nor `TUTOR_TO_*` records *what* a tutor can find,
    only that it tutors — this is a best-effort v1 read of the card's own
    text, not a curated mapping; state precision honestly rather than
    silently guessing "reaches everything" for a tutor this regex simply
    does not understand.
    """
    match = _TUTOR_TARGET_RE.search(oracle_text or "")
    if not match:
        return None
    words = re.split(r"\s+or\s+|/|,", match.group(1).lower())
    types = {word.strip() for word in words} & _TUTOR_CARD_TYPES
    return types or None


def _tutor_reaches(target_classes: frozenset[str] | None, type_line: str) -> bool:
    if not target_classes:
        return True
    lowered = type_line.lower()
    return any(target in lowered for target in target_classes)


def tutor_map(deck_oracle_ids: list[str], lines: Sequence[Line]) -> list[TutorReach]:
    """Which of the deck's own tutors can find a piece of which line.

    "Reach" is a type-class match only (`_tutor_reaches`) — no zone check —
    because a piece's `zoneLocations` records the precondition a combo's
    described sequence assumes (usually hand, occasionally battlefield or
    graveyard), not "can be tutored from"; nearly every piece is tutorable
    from the library the way deck construction already assumes. Checked
    against every card in the line, not only `missing`: a tutor that can
    re-find an already-included piece is real redundancy information too.
    """
    from .graph import deck_line_tutors

    if not lines:
        return []

    out: list[TutorReach] = []
    for row in deck_line_tutors(deck_oracle_ids):
        targets = _tutor_target_classes(row.get("oracle_text") or "")
        reaches = tuple(
            line.id
            for line in lines
            if any(_tutor_reaches(targets, card.type_line) for card in line.cards)
        )
        if reaches:
            out.append(TutorReach(tutor=row["name"], reaches=reaches))
    return out


# --------------------------------------------------------------------------
# Redundancy
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SharedPiece:
    name: str
    oracle_id: str
    line_ids: tuple[str, ...]


def redundancy(complete_lines: Sequence[Line]) -> tuple[list[SharedPiece], list[SharedPiece]]:
    """`(shared_pieces, single_points)` over the deck's complete lines only —
    a near-miss line is not alive yet, so it cannot be "killed".

    Plain set arithmetic over each line's pieces, exactly as the task calls
    for: no popularity or mana-cost weighting decides who counts as
    "redundant". With exactly one complete line, every one of its pieces is
    trivially a single point of failure — that is an honest answer to "what
    kills every complete line", not a bug in the arithmetic.
    """
    by_oracle_id: dict[str, tuple[str, list[str]]] = {}
    for line in complete_lines:
        for card in line.cards:
            name, line_ids = by_oracle_id.setdefault(card.oracle_id, (card.name, []))
            line_ids.append(line.id)

    shared = [
        SharedPiece(name=name, oracle_id=oracle_id, line_ids=tuple(line_ids))
        for oracle_id, (name, line_ids) in by_oracle_id.items()
        if len(line_ids) >= 2
    ]

    total_complete = len(complete_lines)
    single_points = [
        SharedPiece(name=name, oracle_id=oracle_id, line_ids=tuple(line_ids))
        for oracle_id, (name, line_ids) in by_oracle_id.items()
        if total_complete > 0 and len(line_ids) == total_complete
    ]

    return shared, single_points
