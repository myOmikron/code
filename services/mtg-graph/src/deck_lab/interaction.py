"""The cEDH interaction grid, and the scoring it backs.

Task C of the cEDH Pro round (`implementation-plans/cedh-pro/00-OVERVIEW.md`,
`TASK-C-INTERACTION-GRID.md`). Three things live here because they all read
role/resource edges the graph already has, sliced a different way than
`vocabulary.BUCKET_ROLES` slices them for the quota solver — and because
`vocabulary.py`'s `Role`/`Bucket` enums are out of scope for this round (the
casual bucket view stays untouched, overview decision 3):

- **The interaction grid (C1)** — `build_interaction_grid` — stack /
  proactive_protection / permanent_answer / class_hate rows, crossed against
  free / cheap / held_up columns. Populated only at `is_cedh(speed)`; a
  casual deck keeps its plain bucket view.
- **The cEDH board-wipe coverage discount (C2)** — `discount_board_wipe` —
  scales a card's `board_wipe` role weight down before it reaches
  `composition.bucket_coverage_from_cards`, so a sorcery-speed wrath counts
  for close to what it measures out to against a stack-interaction table.
  Applied at every place INTERACTION coverage is computed (the diagnostics
  report, cut scoring, and the fill solver) so no two of them disagree about
  the same deck's coverage number — the trap the task file names.
- **The asymmetry check (C3)** — `classify_asymmetry_candidates` plus the
  exposure thresholds — whether a stax/hate suggestion also hoses the
  pilot's own board, for three narrow, measurable cases.

Tagger slug survey (`deck-lab tag <slug>`, live corpus), done before any of
the regex/mapping decisions below, per the task file's own warning that
skipping this is exactly how `sacrifice-outlet-permanent` (a slug that does
not exist) ended up in a rule:

    silence            36 cards — "opponents can't cast spells [this turn]":
                       Silence, Grand Abolisher, Orim's Chant, Render Silent,
                       Cease-Fire, Sphinx's Decree. A real slug for exactly
                       the Silence/Abolisher class this round names, and it
                       was unmapped in `tag_mapping.py` — closed there
                       (`Role.PROTECTION`, for the general bucket view) and
                       used directly here (this row is narrower than that
                       Role — see `build_interaction_grid`).
    hatebear/hatebird  60 / 17 cards — already mapped to `Role.STAX`. Too
                       broad for proactive_protection: most of it is generic
                       tax creatures ("costs {1} more"), not can't-cast
                       effects.
    null-rod            6 cards — Null Rod, Collector Ouphe, Damping Matrix
                       and the rest of the "artifacts don't work" class.
                       Unmapped; used directly here for C3's artifact-hate
                       check — narrower than the 191-card `hate-artifact`
                       closure, which also catches ordinary artifact removal.
    hate-activation    32 cards — Cursed Totem and the "activated abilities
                       can't be activated" class. Already mapped to
                       `Role.STAX` (`tag_mapping.py`); used directly here too
                       for C3's ability-hate check, which needs the specific
                       slug rather than the whole (much broader) Role.
    stax               0 matches — no such Tagger slug exists. The community
                       tags the *effects* (hatebear, hate-storm, tax, ...),
                       never a catch-all "stax" bucket — confirming there is
                       nothing to map a `stax` row onto directly.
    hatebears          0 matches — likewise absent; `hatebear` (singular) is
                       the real slug, already covered above.
    hate-graveyard     408 cards — far broader than the `graveyard_hate`
                       Role (`rules.py`'s `exile ... from ... graveyard` text
                       rule, 1.0 weight,
                       ~50 cards): includes tax-on-graveyard effects, discard
                       hate, etc. The Role is what `class_hate` and C3's
                       graveyard check both key on; the raw tag is unused.

No new rule was added: every class this task names already had either an
existing Role/Resource or an unmapped-but-real Tagger slug precise enough to
use directly, so writing a regex would have meant duplicating a taxonomy the
community already maintains — the opposite of the `rules.py` doctrine, which
reaches for text rules only where Tagger has no tag at all.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import BaseModel, Field

from .composition import is_cedh
from .vocabulary import Resource, Role

# --------------------------------------------------------------------------
# Shared: role typing and tag-closure membership
# --------------------------------------------------------------------------


def _typed_roles(role_weights: Mapping[str, float]) -> dict[Role, float]:
    """`diagnostics._typed_roles`/`cuts._typed`'s duplicate.

    Role names off the graph are untyped strings; importing either of those
    modules here would circular-import (both reach into this one). Same
    discipline as both: a role outside the vocabulary is dropped rather than
    raised on, so a stale edge cannot take the grid down.
    """
    typed: dict[Role, float] = {}
    for name, weight in role_weights.items():
        try:
            typed[Role(name)] = weight
        except ValueError:
            continue
    return typed


_TAG_MEMBERS_QUERY = """
UNWIND $slugs AS slug
MATCH (root:Tag {slug: slug})-[:PARENT_OF*0..]->(t:Tag)<-[:TAGGED]-(c:Card)
WHERE c.oracle_id IN $oracle_ids
RETURN slug, collect(DISTINCT c.oracle_id) AS oracle_ids
"""


def _tag_members(slugs: Sequence[str], oracle_ids: Sequence[str]) -> dict[str, set[str]]:
    """Which of `oracle_ids` carry each of `slugs`, taxonomy-closure expanded.

    `graph.cards_for_tag`/`count_for_tag` answer "which cards carry this tag"
    over the *whole* corpus; nothing exposes it restricted to one decklist or
    candidate pool, which is the module-level query the round's ownership
    note calls for rather than a `graph.py` edit two other agents are
    mid-diff in. Mirrors `cards_for_tag`'s own traversal (`PARENT_OF*0..`)
    exactly, so a tag with taggings only on its children is still found.
    """
    ids = list(dict.fromkeys(oracle_ids))
    slugs = list(dict.fromkeys(slugs))
    if not ids or not slugs:
        return {slug: set() for slug in slugs}

    # Imported here, not at module level: `tests/conftest.py`'s `no_live_graph`
    # fixture monkeypatches `graph.driver` and relies on every caller reading
    # it fresh at call time (`search.py`'s `search`/`facets` do the same) — a
    # module-level `from .graph import driver` would bind the pre-patch
    # function and quietly open a real connection from a unit test.
    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        found = {
            record["slug"]: set(record["oracle_ids"])
            for record in session.run(_TAG_MEMBERS_QUERY, slugs=slugs, oracle_ids=ids)
        }
    return {slug: found.get(slug, set()) for slug in slugs}


# --------------------------------------------------------------------------
# C1 — the interaction grid
# --------------------------------------------------------------------------

SILENCE_TAG = "silence"
ARTIFACT_HATE_TAG = "null-rod"
ABILITY_HATE_TAG = "hate-activation"

_ROWS: tuple[str, ...] = ("stack", "proactive_protection", "permanent_answer", "class_hate")
_COLUMNS: tuple[str, ...] = ("free", "cheap", "held_up")

# class_hate's subdivision, where a tag says so precisely enough to tell. Not
# exhaustive by design (v1, per the task file) — a card that produces
# `tax_effect`/`resource_denial` but matches none of the three specific
# slugs below still earns the row, filed under "other" (rhystic taxes, storm
# hate, tutor hate — real class_hate, just without a narrow-enough slug to
# name its target here).
_CLASS_HATE_TAG_SLUGS: dict[str, str] = {
    "artifact": ARTIFACT_HATE_TAG,
    "ability": ABILITY_HATE_TAG,
}


class InteractionCell(BaseModel):
    """One row/column intersection: how many cards, and which."""

    count: int = 0
    cards: list[str] = Field(default_factory=list)


class InteractionRow(BaseModel):
    row: str
    cells: dict[str, InteractionCell]
    # Populated only on the `class_hate` row — see `_CLASS_HATE_TAG_SLUGS`.
    # A card can appear under more than one class (an effect can hose both
    # artifacts and abilities) or under "other".
    classes: dict[str, list[str]] | None = None


class InteractionGrid(BaseModel):
    rows: list[InteractionRow]


def _column(cmc: float, produces: set[str]) -> str:
    """A card's cheapest casting mode. Free beats cheap beats held up."""
    if Resource.FREE_SPELL.value in produces:
        return "free"
    if cmc <= 1:
        return "cheap"
    return "held_up"


def build_interaction_grid(
    cards: Sequence[Mapping[str, Any]],
    card_roles: Sequence[Mapping[str, Any]],
    resources_by_card: Mapping[str, Mapping[str, set[str]]],
    speed: float,
) -> InteractionGrid | None:
    """The cEDH interaction grid. `None` below bracket 5 (`is_cedh(speed)`).

    A thin fetch-and-delegate wrapper — `_tag_members` is the one thing here
    that touches the graph, so `_assemble_interaction_grid` carries all of
    the actual row/column logic and stays a pure function `test_interaction.py`
    exercises directly, the same split `search.py` draws between `search`
    (fetches) and `build_cypher` (pure, and what that module's own tests
    actually cover).
    """
    if not is_cedh(speed):
        return None

    oracle_ids = [card["oracle_id"] for card in cards]
    tag_hits = _tag_members([SILENCE_TAG, *_CLASS_HATE_TAG_SLUGS.values()], oracle_ids)
    return _assemble_interaction_grid(cards, card_roles, resources_by_card, tag_hits)


def _assemble_interaction_grid(
    cards: Sequence[Mapping[str, Any]],
    card_roles: Sequence[Mapping[str, Any]],
    resources_by_card: Mapping[str, Mapping[str, set[str]]],
    tag_hits: Mapping[str, set[str]],
) -> InteractionGrid:
    """`build_interaction_grid`'s pure half, given tag membership already
    fetched.

    Row membership is additive — a card lands in every row it earns:

      stack                 `Role.COUNTERSPELL` present.
      proactive_protection  carries the `silence` Tagger tag (or a
                             descendant) — the "opponents can't cast" class,
                             narrower than the generic `Role.PROTECTION`
                             most single-creature protection also holds.
      permanent_answer      `Role.SPOT_REMOVAL` or `Role.BOARD_WIPE` present.
      class_hate             `Role.GRAVEYARD_HATE` present, or the card
                             produces `tax_effect`/`resource_denial` (the
                             STAX role's *resource* side — not the whole
                             role, which also covers effects with no row
                             here, e.g. plain tax creatures with no
                             denial/graveyard component).

    Column is a property of the card, independent of which row(s) it earns
    (`_column`). `resources_by_card` is `graph.deck_card_resources`'s shape —
    the caller already has it for the theme profile, so this does not pay a
    second fetch for it. `tag_hits` carries at least `SILENCE_TAG` and every
    slug in `_CLASS_HATE_TAG_SLUGS` — missing keys read as "no cards", so a
    caller that only cares about testing one slug's effect need not stub them
    all.
    """
    by_id = {card["oracle_id"]: card for card in cards}
    roles_by_id = {row["oracle_id"]: _typed_roles(row["roles"]) for row in card_roles}

    cells: dict[str, dict[str, InteractionCell]] = {
        row: {col: InteractionCell() for col in _COLUMNS} for row in _ROWS
    }
    class_cards: dict[str, list[str]] = {"other": []}
    for cls in _CLASS_HATE_TAG_SLUGS:
        class_cards[cls] = []
    class_cards["graveyard"] = []

    for oracle_id, card in by_id.items():
        qty = int(card.get("qty") or 0)
        if qty <= 0:
            continue
        name = card.get("name") or oracle_id
        roles = roles_by_id.get(oracle_id, {})
        produces = {r for r in resources_by_card.get(oracle_id, {}).get("produces", set()) if r}
        col = _column(card.get("cmc") or 0.0, produces)

        earned: list[str] = []
        if roles.get(Role.COUNTERSPELL, 0.0):
            earned.append("stack")
        if oracle_id in tag_hits.get(SILENCE_TAG, ()):
            earned.append("proactive_protection")
        if roles.get(Role.SPOT_REMOVAL, 0.0) or roles.get(Role.BOARD_WIPE, 0.0):
            earned.append("permanent_answer")

        is_gy_hate = bool(roles.get(Role.GRAVEYARD_HATE, 0.0))
        is_tax_denial = bool({Resource.TAX_EFFECT.value, Resource.RESOURCE_DENIAL.value} & produces)
        if is_gy_hate or is_tax_denial:
            earned.append("class_hate")
            if is_gy_hate:
                class_cards["graveyard"].append(name)
            matched_specific = False
            for cls, slug in _CLASS_HATE_TAG_SLUGS.items():
                if oracle_id in tag_hits.get(slug, ()):
                    class_cards[cls].append(name)
                    matched_specific = True
            if is_tax_denial and not is_gy_hate and not matched_specific:
                class_cards["other"].append(name)

        for row in earned:
            cell = cells[row][col]
            cell.count += qty
            cell.cards.append(name)

    return InteractionGrid(
        rows=[
            InteractionRow(
                row=row,
                cells=cells[row],
                classes=(
                    {cls: sorted(set(names)) for cls, names in class_cards.items() if names}
                    if row == "class_hate"
                    else None
                ),
            )
            for row in _ROWS
        ]
    )


# --------------------------------------------------------------------------
# C2 — the cEDH board-wipe coverage discount
# --------------------------------------------------------------------------

# Measured (2026-09-01, `cedh_profiles` machinery over the cached `/cedh`
# synthetic decks — 66 commanders clearing `CEDH_MIN_DECKS`, 43,950 pooled
# bracket-5 decks; the task file's own count of 41 is stale, the corpus has
# grown since it was written): board_wipe's deck-count-weighted share of
# those decks' own INTERACTION coverage is **8.6%** — single-digit percent,
# as the task predicted. Per-commander share ranges 0%-41.5% (one outlier,
# Kefka-adjacent decks running several one-sided sweepers), median 7.8%.
#
# 0.1 is chosen close to that measured 8.6% pooled share (rounded to a clean
# constant) rather than invented: at cEDH, a board wipe now contributes
# roughly what board wipes actually turned out to be worth in real
# stack-interaction-heavy lists — not zero (a wrath is not *nothing*, and a
# deck that boards a Cyclonic Rift end-of-turn is doing something real), but
# close to it, matching the task file's own framing ("nearly worthless").
#
# Verified safe against the corridor: zeroing board_wipe entirely (the
# extreme case) would move the pooled cEDH mean from 20.7 to 18.9, still
# comfortably inside the measured `CEDH` template's INTERACTION corridor
# (15.8-26.2, `composition.py`) — board_wipe's own share is too small for any
# reasonable weight choice to put the corridor itself at risk. The choice is
# about making the *individual-deck* miscount this task names visible, not
# about protecting the corridor from a threat that measurement shows does
# not exist. See `test_interaction.py` for the 3-wrath casual-list proof.
BOARD_WIPE_CEDH_WEIGHT = 0.1


def discount_board_wipe(role_weights: Mapping[Any, float], *, cedh: bool) -> dict[Any, float]:
    """Scale a card's `board_wipe` role weight down for cEDH coverage math.

    Called wherever INTERACTION bucket coverage is computed — the
    diagnostics report (`diagnostics.build_diagnostics`), cut scoring
    (`cuts.score_cuts`/`cuts.shape_delta`), and the fill solver
    (`solver._fill_deck`) — so all three read the same number for the same
    deck, per the task file's warning that one scorer disagreeing with
    another is worse than not fixing it at all.

    Takes and returns the *same* mapping shape it is given — `Role`-keyed
    (the diagnostics/cuts path, via `_typed_roles`) or plain-string-keyed
    (the solver's `Candidate.roles`) — because `Role` is a `StrEnum`, so
    `Role.BOARD_WIPE` hashes and compares equal to the literal string
    `"board_wipe"` either way; no branch needed for which one arrived.

    `board_wipe` only ever feeds `Bucket.INTERACTION`
    (`vocabulary.BUCKET_ROLES`), so this has no effect on any other bucket's
    coverage — scoped by construction, not by a bucket check here.
    """
    if not cedh or Role.BOARD_WIPE not in role_weights:
        return dict(role_weights)
    adjusted = dict(role_weights)
    adjusted[Role.BOARD_WIPE] = adjusted[Role.BOARD_WIPE] * BOARD_WIPE_CEDH_WEIGHT
    return adjusted


def is_cedh_template(template: Any) -> bool:
    """Whether a `DeckTemplate` is the cEDH one, including its `+custom`/
    `+curve` variants.

    `composition.apply_overrides`/`apply_curve` rename `"cedh"` to
    `"cedh+custom"` / `"cedh+curve"` (and both, in sequence) rather than
    replacing it, so a prefix check survives every combination — checked
    against `composition.CEDH`'s and both helpers' source directly, not
    assumed. Exists because `cuts.py` builds templates through
    `conditioned_template` and never carries `speed` down into
    `score_cuts`/`shape_delta` alongside them; reaching for the template's
    own name avoids adding a parameter to functions two other agents' diffs
    also touch this round.
    """
    return getattr(template, "name", "").startswith("cedh")


# --------------------------------------------------------------------------
# C3 — the asymmetry check
# --------------------------------------------------------------------------

# Measured (2026-09-01), over the same 60 resolvable `/cedh` synthetic decks
# as the board-wipe share above — a real-deck sample, not an invented number.
# Each threshold sits at roughly the measured p75: the point past which a
# deck's own dependence on the resource a candidate would hose is in the top
# quarter of real cEDH lists, not merely "runs a few".
#
#   own mana-rock weight (Role.MANA_ROCK, summed):  min 2.0  p25 6.0
#     median 9.0  p75 11.0  p90 12.0  max 15.0   -> threshold 10.0
#   own recursion weight (Role.RECURSION, summed):  min 0.0  p25 2.0
#     median 3.0  p75 5.4  p90 7.0  max 11.0     -> threshold 5.0
#   own mana-dork weight (Role.MANA_DORK, summed):  min 0.0  p25 0.0
#     median 1.0  p75 5.0  p90 8.0  max 13.0     -> threshold 5.0
#
# The task names a compound "mana_dork + activated-ability density" signal
# for the ability-hate check. Measured and dropped: pooling in the generic
# `activated-ability` Tagger tag (any creature with any activated ability)
# pushed the median to 9 and p75 to 16, because most cEDH creature bases
# carry a few utility-ability bodies that Cursed Totem-class effects do not
# meaningfully threaten (a "{T}: scry 1" creature is not a ramp engine).
# Mana-dork weight alone is the precise, honest core of "this candidate
# would shut off my own ramp too" — v1 is deliberately narrow (task file),
# and a noisy compound signal is not narrower than its precise half.
ARTIFACT_HATE_EXPOSURE_THRESHOLD = 10.0
GRAVEYARD_HATE_EXPOSURE_THRESHOLD = 5.0
ABILITY_HATE_EXPOSURE_THRESHOLD = 5.0


_SYMMETRIC_TAG_MEMBERS_QUERY = """
UNWIND $slugs AS slug
MATCH (root:Tag {slug: slug})-[:PARENT_OF*0..]->(t:Tag)<-[:TAGGED]-(c:Card)
WHERE c.oracle_id IN $oracle_ids
RETURN slug, c.oracle_id AS oracle_id, c.oracle_text AS oracle_text
"""


def classify_asymmetry_candidates(oracle_ids: Sequence[str]) -> dict[str, set[str]]:
    """Which of `oracle_ids` are artifact-hate (Null Rod class) or
    ability-hate (Cursed Totem class), by the narrow Tagger slugs surveyed
    at the top of this module — filtered to the *symmetric* members of each.

    Both closures turned out to hold a real one-sided minority once checked
    against live text: Karn, the Great Creator reads "activated abilities of
    artifacts **your opponents** control", not "artifacts", and 13 of
    `hate-activation`'s 32 cards (Drana and Linvala, Harsh Mentor, Treasure
    Nabber, Anointed Peacekeeper, ...) are the same shape — a one-sided
    effect that favours the pilot, the mechanical opposite of what C3 checks
    for. Filtered on the one signal that separated all 38 surveyed cards
    perfectly: every one-sided member's text names "opponent"; no symmetric
    member's does. A future card that mentions an opponent for an unrelated
    reason (a second ability on the same card) would be a false exclusion —
    accepted rather than parsing which clause the word sits in, because the
    failure mode is "misses one card", not "wrongly demotes a candidate that
    only hurts the table".
    """
    if not oracle_ids:
        return {"artifact": set(), "ability": set()}

    from .config import settings
    from .graph import driver

    ids = list(dict.fromkeys(oracle_ids))
    result: dict[str, set[str]] = {ARTIFACT_HATE_TAG: set(), ABILITY_HATE_TAG: set()}
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(
            _SYMMETRIC_TAG_MEMBERS_QUERY,
            slugs=[ARTIFACT_HATE_TAG, ABILITY_HATE_TAG],
            oracle_ids=ids,
        ):
            text = (record["oracle_text"] or "").lower()
            if "opponent" in text:
                continue
            result[record["slug"]].add(record["oracle_id"])

    return {"artifact": result[ARTIFACT_HATE_TAG], "ability": result[ABILITY_HATE_TAG]}
