"""Deck diagnostics — pure arithmetic over the graph, no LLM.

Answers three questions the plan says a human cannot easily answer by eye:

  Shape        Does the deck hit its composition quotas at this speed?
  Curve        Is the mana curve where the archetype wants it?
  Balance      What does this deck *want* that it does not *make*?

The balance table is the one no existing tool provides — "9 cards care about
artifacts; 3 make them" — and it falls straight out of the bipartite layer.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .composition import (
    CURVE_BUCKETS,
    BucketTarget,
    DeckTemplate,
    TargetOverride,
    bucket_coverage_from_cards,
    curve_targets,
    template_for,
    type_counts_from_cards,
)
from .themes import consistency as theme_consistency
from .vocabulary import Bucket, Role


class DeckEntry(BaseModel):
    oracle_id: str = Field(max_length=64)  # oracle_ids are 36-char UUIDs
    # 99 is a Commander deck's 99; nothing legal needs more of one card, and
    # basics and Relentless Rats are the cases that come closest.
    qty: int = Field(1, ge=1, le=99)


class BucketReport(BaseModel):
    bucket: str
    coverage: float
    low: float
    high: float
    deviation: float
    status: str  # "ok" | "low" | "high"


class CurveBucket(BaseModel):
    mv: int
    count: float
    target: float


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


class ThemeShare(BaseModel):
    theme: str
    label: str
    share: float


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


class Diagnostics(BaseModel):
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
    typal: list[TypalShare] = Field(default_factory=list)
    # Whether a commander was supplied to anchor the two profiles. Without one
    # both are read off the 99 alone, which is a materially weaker statement —
    # the caller should be able to tell which it is looking at.
    commander_anchored: bool = False


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


def _theme_shares(profile: dict[str, float]) -> list[ThemeShare]:
    from .themes import THEMES

    return [
        ThemeShare(theme=tid, label=THEMES[tid].label if tid in THEMES else tid, share=round(v, 3))
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
    typal_profile: dict[str, float] | None = None,
    typal_counts: dict[str, dict[str, int]] | None = None,
    commander_anchored: bool = False,
    speed: float = 0.5,
    overrides: dict[Bucket, TargetOverride] | None = None,
    requested: int = 0,
    unresolved: list[str] | None = None,
    template: DeckTemplate | None = None,
    type_source: str = "default",
) -> Diagnostics:
    """Assemble the report. Everything here is arithmetic over already-fetched data."""
    template = template or template_for(speed, overrides)
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

    coverage = bucket_coverage_from_cards(
        [(_typed_roles(entry["roles"]), entry["qty"]) for entry in card_roles]
    )
    buckets = []
    penalty = 0.0
    for bucket, value in coverage.items():
        target = template.buckets[bucket]
        buckets.append(
            BucketReport(
                bucket=str(bucket),
                coverage=round(value, 1),
                low=round(target.low, 1),
                high=round(target.high, 1),
                deviation=round(target.deviation(value), 1),
                status=_status(value, target),
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
    types = []
    for name, target in template.types.items():
        count = type_counts.get(name, 0.0)
        types.append(
            TypeReport(
                type=name,
                count=round(count, 1),
                low=round(target.low, 1),
                high=round(target.high, 1),
                deviation=round(target.deviation(count), 1),
                status=_status(count, target),
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
            CurveBucket(mv=mv, count=curve_counts[mv], target=round(targets[mv], 1))
            for mv in CURVE_BUCKETS
        ],
        roles={k: round(v, 2) for k, v in sorted(role_weights.items())},
        balance=balance_rows,
        penalty=round(penalty, 2),
        types=types,
        type_source=type_source,
        themes=_theme_shares(theme_profile or {}),
        consistency=round(theme_consistency(theme_profile or {}), 3),
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
    )


def diagnose(
    entries: list[DeckEntry],
    *,
    speed: float = 0.5,
    overrides: dict[Bucket, TargetOverride] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    allow_network: bool = False,
) -> Diagnostics:
    """Fetch from the graph and build the report.

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
    from .themes import deck_theme_profile, deck_typal_profile

    effective = effective_commanders(commander_oracle_id, commander_oracle_ids)

    deck = {entry.oracle_id: entry.qty for entry in entries}
    cards = fetch_deck(deck)

    found = {card["oracle_id"] for card in cards}
    unresolved = [oid for oid in deck if oid not in found]

    # Themes are weighted by how much of the deck they describe, so a card
    # present four times counts four times.
    resources_by_card = deck_card_resources(deck)
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

    profile = deck_theme_profile(card_resources, resource_idf(), commander=commander_resources)

    # --- type targets: conditioned on commander and, when decisive, theme --
    # Resolved here because this is the one place that knows both. The
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

    type_targets, type_source = resolve_type_targets(
        commander_name, profile, speed=speed, allow_fetch=allow_network
    )
    template = conditioned_template(speed, overrides, type_targets)

    # --- the typal axis, same shape, different data ------------------------
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

    # Raw deck counts behind each surviving type, so the report can show its
    # working rather than only a share.
    typal_counts: dict[str, dict[str, int]] = {}
    for creature_type in typal_profile:
        typal_counts[creature_type] = {
            "bodies": sum(1 for is_t, _, _ in card_types if creature_type in is_t),
            "payoffs": sum(1 for _, cares_t, _ in card_types if creature_type in cares_t),
            "makes": sum(1 for _, _, makes_t in card_types if creature_type in makes_t),
        }

    return build_diagnostics(
        cards,
        deck_role_weights(deck),
        deck_resource_balance(deck),
        deck_card_roles(deck),
        commander_resources=commander_resources,
        theme_profile=profile,
        typal_profile=typal_profile,
        typal_counts=typal_counts,
        commander_anchored=commander_resources is not None or commander_types is not None,
        speed=speed,
        overrides=overrides,
        requested=len(deck),
        unresolved=unresolved,
        template=template,
        type_source=type_source,
    )
