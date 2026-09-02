"""Deck diagnostics — pure arithmetic over the graph, no LLM.

Answers three questions the plan says a human cannot easily answer by eye:

  Shape        Does the deck hit its composition quotas at this speed?
  Curve        Is the mana curve where the archetype wants it?
  Balance      What does this deck *want* that it does not *make*?

The balance table is the one no existing tool provides — "9 cards care about
artifacts; 3 make them" — and it falls straight out of the bipartite layer.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from pydantic import BaseModel, Field

from .composition import (
    CURVE_BUCKETS,
    BucketTarget,
    DeckTemplate,
    TargetOverride,
    bucket_contributions_from_cards,
    bucket_coverage_from_cards,
    curve_targets,
    is_cedh,
    template_for,
    type_contributions_from_cards,
    type_counts_from_cards,
    type_flexible_from_cards,
)
from .interaction import InteractionGrid, discount_board_wipe
from .meta import MetaGradeReport, grade_deck
from .themes import ThemeEvidence
from .themes import consistency as theme_consistency
from .vocabulary import Bucket, Resource, Role


class DeckEntry(BaseModel):
    oracle_id: str = Field(max_length=64)  # oracle_ids are 36-char UUIDs
    # 99 is a Commander deck's 99; nothing legal needs more of one card, and
    # basics and Relentless Rats are the cases that come closest.
    qty: int = Field(1, ge=1, le=99)


class CountedCard(BaseModel):
    """One card behind a count, and how much of that count it is.

    Carries the amount rather than only the name because neither count is a
    headcount: a bucket takes each card at its strongest role's weight, so
    Storm-Kiln Artist is 0.7 of a ramp piece, and a type counts every copy, so
    eight Mountains are eight of the Land row. A bare list of names would not
    add up to the number it opens from — which is the one thing it is for.
    """

    name: str
    amount: float


class BucketReport(BaseModel):
    bucket: str
    coverage: float
    low: float
    high: float
    deviation: float
    status: str  # "ok" | "low" | "high"
    # What the bracket alone would have asked for, before the builder's own
    # corridor replaced it — equal to `low`/`high` when nothing was moved.
    # Sent so the panel can keep the default in view behind the edit: a target
    # the user may move is only an offer while they can still see what was
    # offered.
    default_low: float = 0.0
    default_high: float = 0.0
    # The deck cards behind `coverage`, largest contribution first — so the
    # overlap between buckets is inspectable rather than surprising. A deck can
    # read 42 mana sources at 30 lands and be perfectly correct; only the list
    # says whether the other twelve are rocks and dorks or a mistake.
    cards: list[CountedCard] = Field(default_factory=list)


class CurveBucket(BaseModel):
    mv: int
    count: float
    target: float
    # The bracket's own target for this mana value, for the same reason as
    # `BucketReport.default_low`.
    default_target: float = 0.0


class ResourceBalance(BaseModel):
    resource: str
    # Cards, counted honestly. These stay the physical truth of the list — the
    # commander's reliability is expressed in `gap`, not by inflating a column
    # that says "how many cards".
    produced: int
    wanted: int
    # wanted - produced, positive meaning the deck wants what it lacks, with
    # the commander counted as `COMMANDER_SUPPLY` sources rather than one.
    gap: int
    # Whether the commander is one of the sources, which is why a row can show
    # a small `produced` and a gap smaller still. Shown, not hidden: a number
    # the reader cannot derive from the other two has to explain itself.
    from_commander: bool = False
    # The deck cards behind `produced`/`wanted`, by name — so a count is never
    # a number the reader has to take on faith.
    produced_cards: list[str] = Field(default_factory=list)
    wanted_cards: list[str] = Field(default_factory=list)


class ThemeShare(BaseModel):
    theme: str
    label: str
    share: float
    # How many copies in the deck actually read as this theme. The share is a
    # slice of the deck's theme signal and says nothing about how much signal
    # there was; this says. A share of 0.34 off four cards is a coincidence
    # with a percentage sign on it, and only this number can tell the reader
    # which one they are looking at.
    cards: int = 0


class TypalShare(BaseModel):
    """A creature type's share of the deck's typal identity.

    Kept apart from `ThemeShare` rather than merged into one list. They come
    from different axes and answer different questions — "what does this deck
    do" against "what is it made of" — and a Goblin deck is usually also an
    aristocrats or tokens deck. Merging them would force a card to choose.
    """

    creature_type: str
    share: float
    # Deck counts, so the UI can say "24 Goblins, 6 payoffs" rather than a
    # bare percentage the user cannot check. `makes` is carried separately
    # because token makers count as supply — without it a Chatterfang deck
    # reads "0 bodies" at a high share and looks like a bug.
    bodies: int
    payoffs: int
    makes: int = 0


class TypeReport(BaseModel):
    """One primary type's count against its empirical target.

    A third axis beside `BucketReport` and `CurveBucket`, kept separate
    because it measures a different thing: the buckets are functional (a
    creature can be ramp), the types are material — and a deck can sit
    inside every functional quota while holding forty creatures.
    """

    type: str
    count: float
    low: float
    high: float
    deviation: float
    status: str  # "ok" | "low" | "high"
    # What the archetype alone asked for, before the builder's own corridor
    # replaced it — same contract as `BucketReport.default_low`, and equal to
    # `low`/`high` while nothing has been moved.
    default_low: float = 0.0
    default_high: float = 0.0
    # The slice of `count` that is optional-face credit — MDFC land faces
    # whose front is a spell, and transform back-face halves. The firm floor
    # is `count - flexible`; a UI renders the Land row as "28–32 with
    # MDFCs" from exactly these two numbers. Zero for every row without a
    # double-faced contributor, and additive to the schema (older clients
    # simply ignore it).
    flexible: float = 0.0
    # The deck cards behind `count`, same contract as `BucketReport.cards`.
    cards: list[CountedCard] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Task D (cEDH Pro round) — the consistency-math counts
# --------------------------------------------------------------------------
#
# D3's tapped-land extraction. Surveyed live (`deck-lab tag <slug>`, per the
# task file's own warning against inventing a slug that doesn't exist —
# `interaction.py`'s survey comment is the precedent) before writing anything:
# Tagger already draws exactly the line the task names, as two disjoint root
# tags rather than one that needs a regex to split:
#
#   tapland               482 lands (incl. descendants) — unconditional
#                         "enters tapped", no escape: bouncelands, gainlands,
#                         creature lands, Ravnica-block Karoo lands, Cloudpost.
#                         Spot-checked 20: Celestial Colonnade, Cloudpost,
#                         Hissing Quagmire, Restless Cottage, Manor Gate,
#                         Tranquil Cove, Golgari Rot Farm, Icatian Store,
#                         Submerged Boneyard, Wintermoon Mesa, Birnin Zana
#                         Plaza, Cliffgate, Elvenking's Halls, Graypelt
#                         Refuge, Mirrorpool, Night Market, Scattered Groves,
#                         Teferi's Isle, Thriving Moor, Undercity Sewers —
#                         every one always enters tapped, no condition.
#   conditional-tapland   161 lands — the shockland / checkland / fastland /
#                         slowland family, each with its own escape ("unless
#                         you pay 2 life", "unless you control a Mountain",
#                         "unless you control two or fewer other lands").
#                         Spot-checked 20: Blackcleave Cliffs (fastland),
#                         Castle Embereth and Glacial Fortress (checklands),
#                         Sea of Clouds (slowland), Foul Roads, Rocky Roads,
#                         Boggart Trawler, Dalkovan Encampment, Dreamroot
#                         Cascade, Elven Passage, Frostboil Snarl, Gilt-Leaf
#                         Palace, Murmuring Bosk, Realm of Koh, Rockfall Vale,
#                         Sea Gate Restoration, Shatterskull Smashing,
#                         Shifting Woodland, Spectator Seating, Turntimber
#                         Symbiosis — every one is untapped-capable, none
#                         unconditional.
#
# 8 lands (the LOTR "Roads" cycle, plus Rivendell/Barad-dûr/The Shire) carry
# *both* tags. `conditional-tapland` wins that overlap: the cEDH convention
# this task names is "can it come in untapped when I need it", and every
# overlap member can. `tapped_land_count` is therefore `tapland` **minus**
# `conditional-tapland`, not `tapland` alone — closing the exact shockland
# trap the task file warns about (a bare "enters tapped" regex would count
# Steam Vents as tapped) by set difference over real tags instead of a
# regex neither tag needed writing.
#
# Measured over the whole corpus (1,196 lands): 474 unconditionally tapped,
# 161 conditional/untapped-capable, 561 carrying neither tag. Spot-checked 15
# of the 561: Underground Sea, Scalding Tarn, Verdant Catacombs, Exotic
# Orchard, Treasure Vault, Cave of Temptation, Ipnu Rivulet, Rath's Edge,
# Alchemist's Refuge, Arena, Avengers Tower, Dragon-Cursed Halls, Geier Reach
# Sanitarium, Hammerheim, Sanctum of Eternity — original duals, fetches, and
# untapped utility lands, every one entering untapped. No new rule was added
# to `rules.py`/`tag_mapping.py`: the community's own taxonomy already drew
# the line D3 needed.
TAPLAND_TAG = "tapland"
CONDITIONAL_TAPLAND_TAG = "conditional-tapland"

_LAND_TAG_QUERY = """
UNWIND $slugs AS slug
MATCH (root:Tag {slug: slug})-[:PARENT_OF*0..]->(t:Tag)<-[:TAGGED]-(c:Card)
WHERE c.oracle_id IN $oracle_ids
RETURN slug, collect(DISTINCT c.oracle_id) AS oracle_ids
"""


def _land_tag_membership(oracle_ids: Sequence[str]) -> dict[str, set[str]]:
    """Which land `oracle_ids` carry `tapland`/`conditional-tapland`, taxonomy-
    closure expanded.

    `interaction._tag_members`'s duplicate — same query, same reason it is
    not shared: that module is Task C's, out of scope for a D3 edit, and a
    module-level Neo4j query has to read `graph.driver` fresh at call time
    (imported inside the function, not at module load) for
    `tests/conftest.py`'s `no_live_graph` fixture to be able to monkeypatch
    it — a `from .graph import driver` at import time would bind the
    pre-patch function and quietly open a real connection from a unit test.
    """
    ids = list(dict.fromkeys(oracle_ids))
    slugs = [TAPLAND_TAG, CONDITIONAL_TAPLAND_TAG]
    if not ids:
        return {slug: set() for slug in slugs}

    from .config import settings
    from .graph import driver

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        found = {
            record["slug"]: set(record["oracle_ids"])
            for record in session.run(_LAND_TAG_QUERY, slugs=slugs, oracle_ids=ids)
        }
    return {slug: found.get(slug, set()) for slug in slugs}


def tapped_land_counts(cards: Sequence[Mapping], speed: float) -> tuple[float, float]:
    """`(tapped, untapped)` land counts, quantity-weighted.

    `(0.0, 0.0)` below `is_cedh(speed)` — the same short-circuit
    `interaction.build_interaction_grid` uses, for the same reason: a casual
    deck never reads this block, so a unit test can call this with no live
    graph exactly the way `test_interaction.py` calls that one. Callers pass
    the result into `build_diagnostics(tapped_lands=...)`, never computed
    inside it — `build_diagnostics` is arithmetic over already-fetched data
    (see its own docstring) and must stay callable, as every existing test
    of it does, with no live Neo4j.
    """
    if not is_cedh(speed):
        return 0.0, 0.0

    lands = [card for card in cards if card.get("is_land")]
    land_count = sum(card["qty"] for card in lands)
    if not lands:
        return 0.0, 0.0

    tag_hits = _land_tag_membership([card["oracle_id"] for card in lands])
    tapland_ids = tag_hits[TAPLAND_TAG]
    conditional_ids = tag_hits[CONDITIONAL_TAPLAND_TAG]

    tapped = sum(
        card["qty"]
        for card in lands
        if card["oracle_id"] in tapland_ids and card["oracle_id"] not in conditional_ids
    )
    return float(tapped), float(land_count - tapped)


class CedhStats(BaseModel):
    """The consistency-math counts a competitive player already works out by
    hand (Task D, cEDH Pro round) — `None` on `Diagnostics.cedh_stats` below
    bracket 5, additive, every other field on `Diagnostics` unaffected.

    `fast_mana_count` is the union of `Resource.FAST_MANA` and
    `Resource.RITUAL_MANA` producers — what a cEDH player means by "fast
    mana" includes Dark Ritual (see the comment at the computation);
    `free_spell_count` is `Resource.FREE_SPELL`'s own producer count — the same headcount
    `ResourceBalance.produced` already reports for every resource, read here
    off the same `balance` data rather than recomputed. `tutor_count` is
    `Role.TUTOR`'s fractional weight (`tutor-to`, the reach-but-don't-quite
    tag, scores 0.8 — see `tag_mapping.py`), the same number
    `Diagnostics.roles["tutor"]` already carries. `mean_mana_value` repeats
    `Diagnostics.average_mv` — same computation, same value — so a cEDH
    consumer reads every consistency number off this one block instead of
    reaching back into the shape report for one of them.

    `land_count`/`tapped_land_count`/`untapped_land_count` are exact,
    quantity-weighted card counts (see `tapped_land_counts` for the D3
    extraction); only `tutor_count` genuinely carries a fraction.
    """

    fast_mana_count: float
    tutor_count: float
    free_spell_count: float
    mean_mana_value: float | None
    land_count: float
    untapped_land_count: float
    tapped_land_count: float


class Diagnostics(BaseModel):
    # The *observed* count — what the submitted entries sum to — not the
    # request's target `deck_size`, which only sizes the quotas graded against.
    deck_size: int
    resolved: int
    unresolved: list[str] = Field(default_factory=list)
    speed: float
    template: str
    lands: int
    average_mv: float | None
    buckets: list[BucketReport]
    curve: list[CurveBucket]
    roles: dict[str, float]
    balance: list[ResourceBalance]
    penalty: float
    # Card-type counts against commander/theme-conditioned targets. Empty
    # when the template carries no type targets (direct `build_diagnostics`
    # callers); `diagnose` always resolves at least the default tier.
    types: list[TypeReport] = Field(default_factory=list)
    # Where the type targets came from — "edhrec:<slug>",
    # "edhrec:<slug>/<tag> (N decks)", or "default" — so every target the
    # report shows is auditable back to its data.
    type_source: str = "default"
    themes: list[ThemeShare] = Field(default_factory=list)
    # Normalised inverse entropy of the theme profile. 1.0 is a deck that is
    # entirely one thing; near 0 is "a bit of everything".
    consistency: float = 0.0
    # Copies reading as at least one theme. The missing denominator for every
    # share above: `consistency` measures how *focused* the signal is and is
    # happily 1.0 on a deck with a single themed card, which is exactly the
    # reading that must never be shown on its own. Held against the deck's
    # non-land count by the reader — a land carries a theme only rarely.
    themed_cards: int = 0
    typal: list[TypalShare] = Field(default_factory=list)
    # Whether a commander was supplied to anchor the two profiles. Without one
    # both are read off the 99 alone, which is a materially weaker statement —
    # the caller should be able to tell which it is looking at.
    commander_anchored: bool = False
    # The cEDH interaction grid (Task C, cEDH Pro round) — `None` below
    # bracket 5, additive field, every field above this one byte-identical to
    # before it existed. A casual deck keeps its plain INTERACTION bucket
    # view; a bracket-5 deck gets both.
    interaction_grid: InteractionGrid | None = None
    # The Task D consistency-math counts (cEDH Pro round) — `None` below
    # bracket 5, additive, same non-consumer-moving contract as
    # `interaction_grid` right above it. The frontend's hypergeometric panel
    # (`consistency.ts`) is the intended reader: mean MV, tapped-land share
    # and opening-hand odds for fast mana/tutors are all built from this one
    # block's counts.
    cedh_stats: CedhStats | None = None
    # The Task E sub-archetype classification (cEDH Pro round follow-up) —
    # `None` below bracket 5, additive, same contract as `interaction_grid`
    # and `cedh_stats` above. Above bracket 5 this is always one of
    # `cedh_archetypes.ArchetypeClass`'s string values — `"turbo"`,
    # `"midrange"`, `"stax"`, or the honest `"unclassified"` miss — never
    # `None`, so a reader can tell "not cEDH" apart from "cEDH but the
    # classifier could not place it". `template` above already names the
    # selected template (`"cedh-turbo"` etc.); this field is what picked it,
    # exposed on its own so a caller does not have to parse the template
    # name back apart.
    cedh_class: str | None = None
    # The Task H meta grade (cEDH Pro round) — `None` below bracket 5 or
    # while the scene's threat table is unmeasured, additive, same contract
    # as its three siblings above. Attached here rather than to `/lines`
    # because the grade consumes `interaction_grid`, which this report
    # already built — a `/lines`-side grade would recompute the grid from
    # scratch for one consumer, and the cockpit reads one response either
    # way (the smallest-additive-surface call TASK-H asked to be justified).
    meta_grade: MetaGradeReport | None = None


def _counted(contributions: list[tuple[str, float]]) -> list[CountedCard]:
    """Itemised contributions as wire rows, largest first.

    Ordered by what each card is worth to the count rather than
    alphabetically: the reader opening a total is asking what makes it up, and
    the answer starts with whatever makes up most of it. Nameless rows are
    dropped — a card the deck rows could not name is one this list cannot
    honestly show, and a blank line would read as a bug in the deck.
    """
    return [
        CountedCard(name=name, amount=round(amount, 2))
        for name, amount in sorted(contributions, key=lambda row: (-row[1], row[0]))
        if name
    ]


def _status(coverage: float, target: BucketTarget) -> str:
    """The verdict, from the target's own definition of over and short.

    Deliberately not `coverage < low` / `> high`: a bucket a card past its
    bound is inside the noise of fractional role weights, and this verdict is
    read far beyond the badge — the saturation demotion and the cross-bucket
    swap pairing both key off it. See `STATUS_TOLERANCE`.
    """
    if target.is_short(coverage):
        return "low"
    if target.is_over(coverage):
        return "high"
    return "ok"


_IDF_CACHE: dict[str, dict] = {}


def resource_idf() -> dict:
    """Corpus IDF, computed once. A full-graph scan per request is wasteful and
    the corpus only changes on re-ingest."""
    if "idf" not in _IDF_CACHE:
        from .graph import resource_corpus_counts
        from .themes import build_idf

        counts, total = resource_corpus_counts()
        _IDF_CACHE["idf"] = build_idf(counts, total)

    return _IDF_CACHE["idf"]


def resource_relative_idf() -> dict:
    """IDF centred on 1.0, for the retrieval channels. See `build_relative_idf`.

    Cached alongside `resource_idf` and invalidated the same way — both are
    functions of the corpus, which only changes on re-ingest.
    """
    if "relative_idf" not in _IDF_CACHE:
        from .graph import resource_corpus_counts
        from .themes import build_relative_idf

        counts, total = resource_corpus_counts()
        _IDF_CACHE["relative_idf"] = build_relative_idf(counts, total)

    return _IDF_CACHE["relative_idf"]


def role_weight_ceiling() -> dict[str, float]:
    """Each role's highest weight in the corpus, computed once. See CHANNEL_ROLES.

    Cached beside the IDF caches and invalidated the same way — like them it is
    a function of the corpus, which only changes on re-ingest.
    """
    if "role_weight_ceiling" not in _IDF_CACHE:
        from .graph import role_weight_ceilings

        _IDF_CACHE["role_weight_ceiling"] = role_weight_ceilings()

    return _IDF_CACHE["role_weight_ceiling"]


def typal_density() -> dict[str, float]:
    """Payoff density per creature type, computed once. See `themes.py`.

    Cached beside the IDF caches and invalidated the same way — like them it is
    a function of the corpus, which only changes on re-ingest.
    """
    if "typal_density" not in _IDF_CACHE:
        from .graph import typal_corpus_counts
        from .themes import typal_density as build

        bodies, payoffs = typal_corpus_counts()
        _IDF_CACHE["typal_density"] = build(bodies, payoffs)

    return _IDF_CACHE["typal_density"]


def _as_resources(names: set[str]) -> set:
    """Graph returns resource names as strings; drop anything not in the enum."""
    from .vocabulary import Resource

    out = set()
    for name in names:
        try:
            out.add(Resource(name))
        except ValueError:
            continue
    return out


def _typed_roles(role_weights: dict[str, float]) -> dict[Role, float]:
    """Graph returns role names as strings.

    Anything outside the vocabulary is dropped rather than raising, so a stale
    edge cannot take diagnostics down.
    """
    typed: dict[Role, float] = {}
    for name, weight in role_weights.items():
        try:
            typed[Role(name)] = weight
        except ValueError:
            continue
    return typed


def _theme_shares(
    profile: dict[str, float], cards: dict[str, int] | None = None
) -> list[ThemeShare]:
    from .themes import THEMES

    return [
        ThemeShare(
            theme=tid,
            label=THEMES[tid].label if tid in THEMES else tid,
            share=round(v, 3),
            cards=(cards or {}).get(tid, 0),
        )
        for tid, v in sorted(profile.items(), key=lambda kv: -kv[1])
    ]


# How many cards' worth of supply the commander is, when the balance asks
# whether the deck can reach a resource.
#
# A commander is not one card, because you always have it. A singleton in the
# 99 has been seen in roughly 11 of 99 cards by turn five; the commander is in
# the command zone every game, castable again after removal. That argues for a
# far larger number than this one — the cap is deliberate. The balance drives
# what the resource bridge asks for, and a commander that erased its own
# resource entirely would stop the deck being offered the redundancy it still
# wants: Shorikai is reliable, not unkillable, and a deck with one self-mill
# outlet and no other is one Swords away from doing nothing.
#
# Matches `themes.COMMANDER_ANCHOR` in magnitude and is kept separate on
# purpose: that one answers "what is this deck about", this one answers "can
# this deck reach this", and they are free to diverge as either is measured.
COMMANDER_SUPPLY = 3


def build_diagnostics(
    cards: list[dict],
    role_weights: dict[str, float],
    balance: dict[str, dict[str, int]],
    card_roles: list[dict],
    *,
    commander_resources: tuple[set, set] | None = None,
    theme_profile: dict[str, float] | None = None,
    theme_evidence: ThemeEvidence | None = None,
    typal_profile: dict[str, float] | None = None,
    typal_counts: dict[str, dict[str, int]] | None = None,
    commander_anchored: bool = False,
    speed: float = 0.5,
    overrides: dict[Bucket, TargetOverride] | None = None,
    curve: dict[int, float] | None = None,
    requested: int = 0,
    unresolved: list[str] | None = None,
    template: DeckTemplate | None = None,
    defaults: DeckTemplate | None = None,
    type_source: str = "default",
    interaction_grid: InteractionGrid | None = None,
    tapped_lands: tuple[float, float] | None = None,
    cedh_class: str | None = None,
    meta_grade: MetaGradeReport | None = None,
) -> Diagnostics:
    """Assemble the report. Everything here is arithmetic over already-fetched data.

    `interaction_grid` is built by the caller (`diagnose`), which already has
    the resource-per-card data the grid needs and would otherwise have to be
    fetched a second time here — this just carries it onto the response.

    `cedh_class` is the same story (Task E follow-up, cEDH Pro round):
    `diagnose` already holds the `cards`/`card_roles`/`resources_by_card`
    trio `cedh_archetypes.deck_features` was built to accept — the same trio
    `interaction_grid` is built from, one line above it — so classification
    happens there, once, and rides onto the response as a plain string
    rather than being recomputed (or re-fetched) here.

    `defaults` is the same template without the builder's overrides — what the
    bracket alone would have asked for. It rides along in the report so the
    panel can show what it is offering to replace; without one the template's
    own numbers stand in, which is exactly right for a caller that overrode
    nothing.

    `tapped_lands` is `(tapped, untapped)`, from `tapped_land_counts` — a
    graph read, so it is built by the caller for the same reason
    `interaction_grid` is: this function has to stay callable with no live
    Neo4j, which every existing test of it relies on. `None` (the default for
    every caller that predates Task D) reads as "no tapped lands measured"
    rather than as a missing value — the safe direction, since it only
    understates a mana-base problem D3 exists to surface, never invents one.
    """
    template = template or template_for(speed, overrides, curve)
    defaults = defaults or template
    unresolved = unresolved or []

    deck_size = sum(card["qty"] for card in cards)
    lands = sum(card["qty"] for card in cards if card["is_land"])

    # Lands have no meaningful cost and would drag the average toward zero.
    spells = [card for card in cards if not card["is_land"]]
    spell_count = sum(card["qty"] for card in spells)
    average_mv = (
        round(sum(card["cmc"] * card["qty"] for card in spells) / spell_count, 2)
        if spell_count
        else None
    )

    curve_counts = dict.fromkeys(CURVE_BUCKETS, 0.0)
    for card in spells:
        curve_counts[min(6, int(card["cmc"]))] += card["qty"]

    targets = curve_targets(template, spell_count)
    default_targets = curve_targets(defaults, spell_count)

    # cEDH board-wipe coverage discount (Task C2, cEDH Pro round) — applied
    # once, here, to the same typed-role dicts both `coverage` and
    # `contributions` read, so a drill-down panel never disagrees with the
    # total it opens from (`composition.bucket_contributions_from_cards`'s
    # own contract). `cuts.py` and `solver.py` apply the identical discount
    # at their own coverage computations — see `interaction.discount_board_wipe`.
    cedh = is_cedh(speed)
    typed_roles = {
        entry["oracle_id"]: discount_board_wipe(_typed_roles(entry["roles"]), cedh=cedh)
        for entry in card_roles
    }

    # Task D's consistency-math block — `None` below bracket 5, see
    # `CedhStats`. `tapped_lands` defaults to "none measured" rather than
    # invented (the docstring above states which direction that errs).
    tapped, untapped = tapped_lands if tapped_lands is not None else (0.0, float(lands))
    cedh_stats = (
        CedhStats(
            # FAST_MANA plus RITUAL_MANA: at a cEDH table "fast mana" means
            # Dark Ritual as much as it means Chrome Mox, and the vocabulary
            # split between the two exists for the bridge's benefit (rocks
            # broaden to rituals, not vice versa), not for this headcount.
            # Summing is safe because the producer sets are disjoint —
            # measured live: 14 fast_mana, 59 ritual_mana, overlap 0.
            fast_mana_count=float(balance.get(Resource.FAST_MANA, {}).get("produced", 0))
            + float(balance.get(Resource.RITUAL_MANA, {}).get("produced", 0)),
            tutor_count=role_weights.get(Role.TUTOR, 0.0),
            free_spell_count=float(balance.get(Resource.FREE_SPELL, {}).get("produced", 0)),
            mean_mana_value=average_mv,
            land_count=float(lands),
            untapped_land_count=untapped,
            tapped_land_count=tapped,
        )
        if cedh
        else None
    )

    coverage = bucket_coverage_from_cards(
        [(typed_roles[entry["oracle_id"]], entry["qty"]) for entry in card_roles]
    )
    # `card_roles` carries the oracle id, not the name — the names live on the
    # deck rows fetched above, so the two are joined here rather than widening
    # the role query for a display concern.
    names = {card["oracle_id"]: card["name"] for card in cards}
    contributions = bucket_contributions_from_cards(
        [
            (names.get(entry["oracle_id"], ""), typed_roles[entry["oracle_id"]], entry["qty"])
            for entry in card_roles
        ]
    )
    buckets = []
    penalty = 0.0
    for bucket, value in coverage.items():
        target = template.buckets[bucket]
        preset = defaults.buckets.get(bucket, target)
        buckets.append(
            BucketReport(
                bucket=str(bucket),
                coverage=round(value, 1),
                low=round(target.low, 1),
                high=round(target.high, 1),
                deviation=round(target.deviation(value), 1),
                status=_status(value, target),
                default_low=round(preset.low, 1),
                default_high=round(preset.high, 1),
                cards=_counted(contributions.get(bucket, [])),
            )
        )
        penalty += target.penalty(value)

    penalty += template.curve_weight * sum(
        abs(curve_counts[mv] - targets[mv]) for mv in CURVE_BUCKETS
    )

    # The type axis — reported in a stable order so two decks' reports line
    # up row for row, and penalised through the same BucketTarget arithmetic
    # as the functional buckets. Land's weight is zero by construction (see
    # `type_targets.targets_from_counts`), so its row informs but never fines.
    type_counts = type_counts_from_cards(cards)
    type_contributions = type_contributions_from_cards(cards)
    type_flexible = type_flexible_from_cards(cards)
    types = []
    for name, target in template.types.items():
        count = type_counts.get(name, 0.0)
        preset = defaults.types.get(name, target)
        types.append(
            TypeReport(
                type=name,
                count=round(count, 1),
                low=round(target.low, 1),
                high=round(target.high, 1),
                deviation=round(target.deviation(count), 1),
                status=_status(count, target),
                default_low=round(preset.low, 1),
                default_high=round(preset.high, 1),
                flexible=round(type_flexible.get(name, 0.0), 1),
                cards=_counted(type_contributions.get(name, [])),
            )
        )
        penalty += target.penalty(count)

    # What the commander supplies, by name, so the gap can count it as the
    # several cards its reliability is worth.
    commander_supplies = {r.value for r in commander_resources[0]} if commander_resources else set()

    # Sorted by gap: what the deck most wants but does not make comes first.
    balance_rows = sorted(
        (
            ResourceBalance(
                resource=name,
                produced=counts["produced"],
                wanted=counts["wanted"],
                gap=counts["wanted"]
                - counts["produced"]
                - (COMMANDER_SUPPLY - 1 if name in commander_supplies else 0),
                from_commander=name in commander_supplies,
                produced_cards=counts.get("produced_cards", []),
                wanted_cards=counts.get("wanted_cards", []),
            )
            for name, counts in balance.items()
            if counts["produced"] or counts["wanted"]
        ),
        key=lambda row: (-row.gap, -row.wanted),
    )

    return Diagnostics(
        deck_size=deck_size,
        resolved=len(cards),
        unresolved=unresolved,
        speed=speed,
        template=template.name,
        lands=lands,
        average_mv=average_mv,
        buckets=sorted(buckets, key=lambda b: b.bucket),
        curve=[
            CurveBucket(
                mv=mv,
                count=curve_counts[mv],
                target=round(targets[mv], 1),
                default_target=round(default_targets[mv], 1),
            )
            for mv in CURVE_BUCKETS
        ],
        roles={k: round(v, 2) for k, v in sorted(role_weights.items())},
        balance=balance_rows,
        penalty=round(penalty, 2),
        types=types,
        type_source=type_source,
        themes=_theme_shares(theme_profile or {}, theme_evidence.cards if theme_evidence else None),
        consistency=round(theme_consistency(theme_profile or {}), 3),
        themed_cards=theme_evidence.themed if theme_evidence else 0,
        typal=[
            TypalShare(
                creature_type=creature_type,
                share=round(share, 3),
                bodies=(typal_counts or {}).get(creature_type, {}).get("bodies", 0),
                payoffs=(typal_counts or {}).get(creature_type, {}).get("payoffs", 0),
                makes=(typal_counts or {}).get(creature_type, {}).get("makes", 0),
            )
            for creature_type, share in (typal_profile or {}).items()
        ],
        commander_anchored=commander_anchored,
        interaction_grid=interaction_grid,
        cedh_stats=cedh_stats,
        cedh_class=cedh_class,
        meta_grade=meta_grade,
    )


def diagnose(
    entries: list[DeckEntry],
    *,
    speed: float = 0.5,
    overrides: dict[Bucket, TargetOverride] | None = None,
    curve: dict[int, float] | None = None,
    type_overrides: dict[str, TargetOverride] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    deck_size: int = 99,
    allow_network: bool = False,
) -> Diagnostics:
    """Fetch from the graph and build the report.

    `deck_size` is the deck's *target* card count outside the command zone —
    Rule 0 decks may aim at 60 or 150. Every quota this report grades against
    is tuned for a 99-card deck, so the bucket ranges and type-target means
    are scaled by deck_size/99. The response's own `deck_size` field stays
    the observed count.

    `curve` is the builder's own target curve, as shares per mana value. It
    replaces the archetype's interpolated shape wholesale — the panel that
    sets it shows the deck against these numbers, so the report has to grade
    against them too, or the advice and the picture disagree.

    `commander_oracle_id` anchors both profiles. It is optional because the
    diagnostics endpoint is also used on partial lists that have no commander
    yet, but supplying it changes the answer materially: someone building
    Krenko is building Goblins, and the 99 will not say so until the deck is
    most of the way finished.

    `commander_oracle_ids` is every card the deck fields as a commander —
    partners, backgrounds, Rule 0 extras. The anchor inputs to both profiles
    become the *union* across all of them: a WU+RG partner pair anchors both
    halves of its strategy. Type targets stay keyed on the primary alone —
    see the comment at their resolution below.

    `allow_network` gates the commander×theme subpage fetch inside type-target
    resolution. The bare diagnostics endpoint keeps it off — that path must
    never pay an HTTP round trip, so a cold commander reads default type
    targets until the first suggestion request warms the cache. The
    suggestion, swap, and fill paths pass True; they already tolerate lazy
    EDHREC ingest.
    """
    from .graph import (
        deck_card_resources,
        deck_card_roles,
        deck_card_types,
        deck_resource_balance,
        deck_role_weights,
        fetch_deck,
    )
    from .suggestions import effective_commanders
    from .themes import deck_theme_breakdown, deck_typal_profile

    effective = effective_commanders(commander_oracle_id, commander_oracle_ids)

    deck = {entry.oracle_id: entry.qty for entry in entries}
    cards = fetch_deck(deck)

    # As cast, not as printed — an eminence discount (The Ur-Dragon) moves the
    # curve and the average here exactly as the statistics tab counts them.
    from .eminence import apply_discount, discount_for

    apply_discount(cards, discount_for(cards, effective))

    found = {card["oracle_id"] for card in cards}
    unresolved = [oid for oid in deck if oid not in found]

    # Themes are weighted by how much of the deck they describe, so a card
    # present four times counts four times.
    resources_by_card = deck_card_resources(deck)

    # `card_roles` is fetched here — earlier than every prior version of this
    # function needed it — because the cEDH sub-archetype classifier (Task E
    # follow-up, cEDH Pro round) has to run before the type-target block
    # below builds this deck's `conditioned_template`, and classification
    # needs it alongside `cards`/`resources_by_card` just fetched. The single
    # fetch still does both jobs: this classification and, further down,
    # `build_interaction_grid`'s.
    card_roles = deck_card_roles(deck)

    # `None` below bracket 5 — the same short-circuit `build_interaction_grid`
    # uses, for the same reason: a casual deck has no turbo/midrange/stax to
    # sort into. `cedh_archetypes.deck_features` was built to accept exactly
    # this `cards`/`card_roles`/`resources_by_card` trio (its own docstring
    # names this call site), so classifying costs one pure function call, no
    # second fetch. An empty deck (no resolved cards) reads as the honest
    # `unclassified` miss rather than `None` — `None` means "not cEDH", not
    # "cEDH but nothing to classify".
    cedh_class: str | None = None
    if is_cedh(speed):
        from .cedh_archetypes import ArchetypeClass, classify, deck_features

        features = deck_features(cards, card_roles, resources_by_card)
        cedh_class = (
            classify(features).value if features is not None else ArchetypeClass.UNCLASSIFIED.value
        )

    empty = {"produces": set(), "cares_about": set()}
    card_resources = [
        (
            _as_resources(resources_by_card.get(card["oracle_id"], empty)["produces"]),
            _as_resources(resources_by_card.get(card["oracle_id"], empty)["cares_about"]),
        )
        for card in cards
        for _ in range(card["qty"])
    ]

    # The anchor is the union across every effective commander that resolved.
    # A union preserves `COMMANDER_ANCHOR`'s zero-floor: it only widens which
    # themes *can* be scaled, and a theme with no deck cards still stays zero.
    commander_resources = None
    for seat_id in effective:
        if seat_id not in resources_by_card:
            continue
        entry = resources_by_card[seat_id]
        if commander_resources is None:
            commander_resources = (set(), set())
        commander_resources[0].update(_as_resources(entry["produces"]))
        commander_resources[1].update(_as_resources(entry["cares_about"]))

    # `effective`, not `commander_resources`: the seat count is what the deck
    # claims to field, and a Rule 0 extra the graph could not resolve still
    # pays a Bastion Protector at the table. Counting only resolved seats would
    # make an unknown commander quietly *lower* the theme.
    profile, theme_evidence = deck_theme_breakdown(
        card_resources,
        resource_idf(),
        commander=commander_resources,
        seats=max(len(effective), 1),
    )

    # --- the typal axis, same shape, different data ------------------------
    # Computed before the type-target block below because that block's
    # typal candidate (a tribe reaching the commander×tag subpage tier)
    # needs this profile as an input. Pure reordering: reads only
    # `deck`/`cards`/`effective`, nothing the type-target block produces.
    types_by_card = {row["oracle_id"]: row for row in deck_card_types(deck)}
    card_types = [
        (
            set(types_by_card.get(card["oracle_id"], {}).get("is_type") or []),
            set(types_by_card.get(card["oracle_id"], {}).get("cares_type") or []),
            set(types_by_card.get(card["oracle_id"], {}).get("makes_type") or []),
        )
        for card in cards
        for _ in range(card["qty"])
    ]

    # Union across the command zone, like `commander_resources` above — and
    # with the same zero-floor: the typal anchor only scales types the deck
    # already supplies.
    commander_types = None
    for seat_id in effective:
        if seat_id not in types_by_card:
            continue
        row = types_by_card[seat_id]
        if commander_types is None:
            commander_types = (set(), set())
        commander_types[0].update(row["is_type"] or [])
        commander_types[1].update(row["cares_type"] or [])

    typal_profile = deck_typal_profile(card_types, typal_density(), commander_types=commander_types)

    # --- type targets: conditioned on commander and, when decisive, theme
    # or tribe -----------------------------------------------------------
    # Resolved here because this is the one place that knows all three. The
    # commander usually sits outside the deck entries, so its name may need
    # one extra single-row fetch.
    #
    # Deliberately keyed on the *primary* commander alone, even when the deck
    # fields several: each target set is one page's empirical distribution,
    # and a union of distributions would be invented data no table ever held.
    # `type_source` already discloses which page anchored.
    from .type_targets import conditioned_template, resolve_type_targets

    commander_name = None
    if commander_oracle_id:
        commander_name = next(
            (c["name"] for c in cards if c["oracle_id"] == commander_oracle_id), None
        )
        if commander_name is None:
            rows = fetch_deck({commander_oracle_id: 1})
            commander_name = rows[0]["name"] if rows else None

    scale = deck_size / 99
    type_targets, type_source = resolve_type_targets(
        commander_name,
        profile,
        speed=speed,
        allow_fetch=allow_network,
        scale=scale,
        typal_profile=typal_profile,
    )
    template = conditioned_template(
        speed,
        overrides,
        type_targets,
        scale=scale,
        curve=curve,
        type_overrides=type_overrides,
        cedh_class=cedh_class,
    )
    # The same template without the builder's hand on it, so the report can
    # carry both numbers and the panel can show what it offered before the
    # handles moved. Same `cedh_class` as the overridden template above — the
    # defaults panel is "what this bracket alone would ask for", not "what
    # the pooled CEDH template asks for", so a turbo deck's defaults still
    # show the turbo corridor.
    defaults = (
        template
        if not overrides and not curve and not type_overrides
        else conditioned_template(speed, None, type_targets, scale=scale, cedh_class=cedh_class)
    )

    # Raw deck counts behind each surviving type, so the report can show its
    # working rather than only a share.
    typal_counts: dict[str, dict[str, int]] = {}
    for creature_type in typal_profile:
        typal_counts[creature_type] = {
            "bodies": sum(1 for is_t, _, _ in card_types if creature_type in is_t),
            "payoffs": sum(1 for _, cares_t, _ in card_types if creature_type in cares_t),
            "makes": sum(1 for _, _, makes_t in card_types if creature_type in makes_t),
        }

    # The cEDH interaction grid (Task C1, cEDH Pro round) — `None` below
    # bracket 5. Built here rather than inside `build_diagnostics` because
    # this is the one place that already has `resources_by_card` in hand
    # (fetched above for the theme profile, alongside `card_roles`, fetched
    # earlier still for the classifier); a second `deck_card_resources`
    # round trip inside `build_diagnostics` would fetch the same rows twice.
    from .interaction import build_interaction_grid

    interaction_grid = build_interaction_grid(cards, card_roles, resources_by_card, speed)
    # The scene string is data at this call site (00-OVERVIEW decision 1b):
    # bracket-5 Commander is the "cedh" scene; `grade_deck` returns None
    # whenever the grid is None (below bracket 5) or the scene is
    # unmeasured, so this line moves nothing for casual decks.
    meta_grade = grade_deck("cedh", interaction_grid)

    # Task D's tapped-land extraction (D3) — `(0.0, 0.0)` below bracket 5, the
    # same short-circuit as the interaction grid above, and for the same
    # reason it is computed here rather than inside `build_diagnostics`: this
    # is a graph read, and that function must stay callable with no live
    # Neo4j.
    tapped_lands = tapped_land_counts(cards, speed)

    return build_diagnostics(
        cards,
        deck_role_weights(deck),
        deck_resource_balance(deck),
        card_roles,
        commander_resources=commander_resources,
        theme_profile=profile,
        theme_evidence=theme_evidence,
        typal_profile=typal_profile,
        typal_counts=typal_counts,
        commander_anchored=commander_resources is not None or commander_types is not None,
        speed=speed,
        overrides=overrides,
        curve=curve,
        requested=len(deck),
        unresolved=unresolved,
        template=template,
        interaction_grid=interaction_grid,
        tapped_lands=tapped_lands,
        defaults=defaults,
        type_source=type_source,
        cedh_class=cedh_class,
        meta_grade=meta_grade,
    )
