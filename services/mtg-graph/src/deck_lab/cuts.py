"""What to cut — but only ever as the other half of a swap.

Cuts are the most socially sensitive output this tool produces. A standalone
list ranking someone's cards from worst to best is both the easiest thing to be
obviously wrong about and the most likely to feel like an insult, so the API
here is deliberately shaped to answer "to add X, cut one of these" rather than
"your deck is bad".

The score is a **marginal penalty delta**: recompute the deck's shape with one
card removed and compare. A positive delta means removing it moves the deck
*towards* its targets. That is affordable only because `build_diagnostics` is
pure arithmetic — the deck is fetched once and the ~100 recomputations happen in
memory with no further database work.

Two traps, both of which produce plausible-looking nonsense:

- Coverage must come from `bucket_coverage_from_cards`, the per-card path. The
  deck-level `bucket_coverage` double-counts a card holding two roles in one
  bucket, and `composition_penalty` uses that variant.
- Removing a card changes the resource balance too, not just the bucket totals.
  A card that is the deck's only producer of something it wants is a bad cut
  however redundant its role looks.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .composition import (
    CURVE_BUCKETS,
    DeckTemplate,
    bucket_coverage_from_cards,
    curve_targets,
    primary_type,
    type_counts_from_cards,
)
from .vocabulary import BUCKET_ROLES, Role

# A card is only worth proposing as a cut if it is at least this redundant.
# Below it the deck is being churned rather than improved.
MIN_CUT_SCORE = 0.05


class CutCandidate(BaseModel):
    oracle_id: str
    name: str
    cmc: float = 0.0
    type_line: str = ""
    price_usd: float | None = None
    playability: float = 0.0
    score: float = 0.0
    reasons: list[str] = Field(default_factory=list)


class Swap(BaseModel):
    """One proposed exchange, with the shape change it causes."""

    add_oracle_id: str
    add_name: str
    cut: CutCandidate
    # Roles the two share, which is why cutting this one makes room without
    # tearing a hole somewhere else.
    shared_roles: list[str] = Field(default_factory=list)


def _typed(role_weights: dict[str, float]) -> dict[Role, float]:
    out: dict[Role, float] = {}
    for name, weight in role_weights.items():
        try:
            out[Role(name)] = weight
        except ValueError:
            continue
    return out


def _shape_penalty(
    entries: list[tuple[dict[Role, float], int]],
    curve_counts: dict[int, float],
    template: DeckTemplate,
    type_counts: dict[str, float] | None = None,
) -> float:
    """The same arithmetic `build_diagnostics` reports, over a candidate deck."""
    coverage = bucket_coverage_from_cards(entries)
    penalty = sum(
        template.buckets[bucket].penalty(value)
        for bucket, value in coverage.items()
        if bucket in template.buckets
    )

    nonland = sum(curve_counts.values())
    if nonland:
        targets = curve_targets(template, nonland)
        penalty += template.curve_weight * sum(
            abs(curve_counts.get(mv, 0.0) - targets[mv]) for mv in CURVE_BUCKETS
        )

    if type_counts is not None:
        penalty += sum(
            target.penalty(type_counts.get(name, 0.0)) for name, target in template.types.items()
        )

    return penalty


def score_cuts(
    cards: list[dict],
    card_roles: list[dict],
    card_resources: dict[str, dict[str, set[str]]],
    wanted_resources: dict[str, int],
    template: DeckTemplate,
    *,
    protected: set[str] | None = None,
) -> list[CutCandidate]:
    """Rank in-deck cards by how little removing them costs.

    `wanted_resources` maps a resource to the deck's unmet demand for it, so a
    card supplying something scarce is defended even if its role is redundant.
    """
    protected = protected or set()
    by_id = {card["oracle_id"]: card for card in cards}

    entries = [(_typed(row["roles"]), row["qty"]) for row in card_roles]
    curve: dict[int, float] = dict.fromkeys(CURVE_BUCKETS, 0.0)
    for card in cards:
        if not card["is_land"]:
            curve[min(6, int(card["cmc"]))] += card["qty"]

    types = type_counts_from_cards(cards)

    # What each bucket currently holds, so a reason can name the one that is
    # full rather than quoting a penalty delta.
    coverage = bucket_coverage_from_cards(entries)

    base = _shape_penalty(entries, curve, template, types)
    out: list[CutCandidate] = []

    for index, row in enumerate(card_roles):
        oracle_id = row["oracle_id"]
        card = by_id.get(oracle_id)
        if card is None or oracle_id in protected:
            continue

        # One copy at a time: cutting one of nine Forests is a different
        # question from cutting all nine.
        trimmed = list(entries)
        weights, qty = trimmed[index]
        trimmed[index] = (weights, qty - 1)

        trimmed_curve = dict(curve)
        if not card["is_land"]:
            trimmed_curve[min(6, int(card["cmc"]))] -= 1

        trimmed_types = dict(types)
        cut_type = primary_type(card["type_line"])
        trimmed_types[cut_type] = trimmed_types.get(cut_type, 0.0) - 1

        delta = base - _shape_penalty(trimmed, trimmed_curve, template, trimmed_types)
        reasons: list[str] = []

        if delta > 0.01:
            # Named, not scored. The delta is a penalty difference in units
            # nobody outside this module has a feel for — "+2.85" told a
            # reader nothing about which target, or which way. What they can
            # act on is the bucket that is over and the fact that this card
            # is in it.
            crowded = [
                str(bucket).replace("_", " ")
                for bucket, roles in BUCKET_ROLES.items()
                if _typed(row["roles"]).keys() & roles
                and (target := template.buckets.get(bucket)) is not None
                and coverage.get(bucket, 0.0) > target.high
            ]
            if crowded:
                named = crowded[0] if len(crowded) == 1 else " and ".join(
                    [", ".join(crowded[:-1]), crowded[-1]]
                )
                reasons.append(f"the deck is over on {named}, and this card is in it")
            else:
                reasons.append("cutting it moves the deck closer to its target shape")

        # Weakly played cards are easier to defend cutting than staples.
        play = card.get("playability") or 0.0
        redundancy = 1.0 - play
        if play < 0.25:
            reasons.append("rarely played in decks like this")
        elif play > 0.55:
            # Every card in an over-full bucket has the same marginal delta, so
            # without this they tie and the list reads as arbitrary. How played
            # a card is, is the tiebreak that makes the ordering defensible.
            reasons.append(f"a staple ({play:.0%}) — cut something else first")

        # A card supplying something the deck is short of is defended.
        supplies = card_resources.get(oracle_id, {}).get("produces", set())
        scarce = [r for r in supplies if wanted_resources.get(r, 0) > 0]
        if scarce:
            reasons.append(f"supplies {', '.join(sorted(scarce)[:2])}, which the deck wants")

        score = max(delta, 0.0) * (0.4 + 0.6 * redundancy) - 0.6 * len(scarce)

        if score >= MIN_CUT_SCORE and reasons:
            out.append(
                CutCandidate(
                    oracle_id=oracle_id,
                    name=card["name"],
                    cmc=card["cmc"],
                    type_line=card["type_line"],
                    price_usd=card.get("price_usd"),
                    playability=play,
                    score=round(score, 3),
                    reasons=reasons,
                )
            )

    return sorted(out, key=lambda c: -c.score)


def pair_swaps(
    adds: list[dict],
    cuts: list[CutCandidate],
    add_roles: dict[str, dict[str, float]],
    cut_roles: dict[str, dict[str, float]],
    *,
    per_add: int = 3,
) -> list[Swap]:
    """Match each add with cuts that free the same kind of slot.

    Pairing on shared roles is what makes the framing honest — "to add this ramp
    piece, cut one of these ramp pieces" — rather than an arbitrary pairing that
    fixes one quota by breaking another.
    """
    swaps: list[Swap] = []

    for add in adds:
        wanted = {role for role, weight in add_roles.get(add["oracle_id"], {}).items() if weight}
        partners: list[Swap] = []

        for cut in cuts:
            shared = wanted & {
                role for role, weight in cut_roles.get(cut.oracle_id, {}).items() if weight
            }
            if not shared:
                continue

            partners.append(
                Swap(
                    add_oracle_id=add["oracle_id"],
                    add_name=add["name"],
                    cut=cut,
                    shared_roles=sorted(shared),
                )
            )
            if len(partners) >= per_add:
                break

        swaps.extend(partners)

    return swaps


def suggest_swaps(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    excluded: list[str] | None = None,
    limit: int = 24,
    per_add: int = 3,
    max_price: float | None = None,
) -> dict:
    """Adds paired with the cuts that make room for them."""
    from .diagnostics import DeckEntry, diagnose
    from .graph import deck_card_resources, deck_card_roles, fetch_deck
    from .suggestions import suggest

    deck = quantities or dict.fromkeys(deck_oracle_ids, 1)
    cards = fetch_deck(deck)
    card_roles = deck_card_roles(deck)
    card_resources = deck_card_resources(deck)

    # The commander anchors the profile here exactly as it does in suggest()'s
    # internal diagnose — without it, cut scoring's shortfall view followed
    # whatever the 99 happened to be rather than the deck's intent.
    report = diagnose(
        [DeckEntry(oracle_id=oid, qty=qty) for oid, qty in deck.items()],
        speed=speed,
        overrides=overrides,
        commander_oracle_id=commander_oracle_id,
        allow_network=True,
    )
    wanted = {row.resource: row.gap for row in report.balance if row.gap > 0}

    # The commander is never a cut candidate.
    protected = {commander_oracle_id} if commander_oracle_id else set()

    # Cut scoring runs against the *reported* type targets, not a fresh
    # resolution — re-resolving could flip the prior tier between the report
    # and the score, and a mismatch there is silent when wrong.
    from .type_targets import conditioned_template, targets_from_report

    template = conditioned_template(
        speed, overrides, targets_from_report(report.types, speed=speed)
    )

    cuts = score_cuts(
        cards,
        card_roles,
        card_resources,
        wanted,
        template,
        protected=protected,
    )

    adds = suggest(
        deck_oracle_ids,
        deck_card_names,
        quantities=deck,
        commander_oracle_id=commander_oracle_id,
        limit=limit,
        max_price=max_price,
        speed=speed,
        overrides=overrides,
        focus=focus,
        pinned_themes=pinned_themes,
        excluded_themes=excluded_themes,
        excluded=excluded,
        # Same deck, quantities, speed, overrides, and commander as the
        # diagnose above — handing it over halves the round trips /swaps pays.
        diagnostics=report,
    )

    from .graph import cards_role_weights

    add_ids = [s.oracle_id for s in adds.suggestions]
    add_roles = cards_role_weights(add_ids)
    cut_roles = {row["oracle_id"]: row["roles"] for row in card_roles}

    swaps = pair_swaps(
        [{"oracle_id": s.oracle_id, "name": s.name} for s in adds.suggestions],
        cuts,
        add_roles,
        cut_roles,
        per_add=per_add,
    )

    return {"adds": adds, "cuts": cuts, "swaps": swaps}


class BucketDelta(BaseModel):
    bucket: str
    before: float
    after: float
    low: float
    high: float

    @property
    def moved(self) -> bool:
        return abs(self.after - self.before) > 0.01


class ShapeDelta(BaseModel):
    """What a swap actually does to the deck.

    The number that makes a suggestion checkable: not "this card is good" but
    "this takes ramp from 10.2 to 10.9 and leaves everything else alone".
    """

    penalty_before: float
    penalty_after: float
    buckets: list[BucketDelta] = Field(default_factory=list)
    price_change: float | None = None

    @property
    def improves(self) -> bool:
        return self.penalty_after < self.penalty_before


class Replacement(BaseModel):
    oracle_id: str
    name: str
    cmc: float = 0.0
    type_line: str = ""
    price_usd: float | None = None
    playability: float = 0.0
    game_changer: bool = False
    score: float = 0.0
    shared_roles: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    delta: ShapeDelta | None = None


def shape_delta(
    cards: list[dict],
    card_roles: list[dict],
    template: DeckTemplate,
    *,
    remove: str | None = None,
    add_roles: dict[str, float] | None = None,
    add_cmc: float = 0.0,
    add_is_land: bool = False,
    add_type_line: str = "",
    price_change: float | None = None,
) -> ShapeDelta:
    """Recompute the deck's shape with one card out and another in.

    Both halves are optional, so this also answers "what if I just cut this"
    and "what if I just add this" — the pending-changes preview needs all three.
    """
    entries = [(_typed(row["roles"]), row["qty"]) for row in card_roles]
    by_id = {card["oracle_id"]: card for card in cards}

    curve: dict[int, float] = dict.fromkeys(CURVE_BUCKETS, 0.0)
    for card in cards:
        if not card["is_land"]:
            curve[min(6, int(card["cmc"]))] += card["qty"]

    types = type_counts_from_cards(cards)

    before_coverage = bucket_coverage_from_cards(entries)
    before = _shape_penalty(entries, curve, template, types)

    after_entries = list(entries)
    after_curve = dict(curve)
    after_types = dict(types)

    if remove is not None:
        for index, row in enumerate(card_roles):
            if row["oracle_id"] == remove:
                weights, qty = after_entries[index]
                after_entries[index] = (weights, qty - 1)
                break
        removed = by_id.get(remove)
        if removed:
            if not removed["is_land"]:
                after_curve[min(6, int(removed["cmc"]))] -= 1
            removed_type = primary_type(removed["type_line"])
            after_types[removed_type] = after_types.get(removed_type, 0.0) - 1

    if add_roles:
        after_entries.append((_typed(add_roles), 1))
        if not add_is_land:
            after_curve[min(6, int(add_cmc))] += 1

    # The add half of the type ledger keys off the type line, not `add_roles`
    # — a roleless card still occupies a creature slot.
    if add_type_line:
        added_type = primary_type(add_type_line)
        after_types[added_type] = after_types.get(added_type, 0.0) + 1

    after_coverage = bucket_coverage_from_cards(after_entries)
    after = _shape_penalty(after_entries, after_curve, template, after_types)

    return ShapeDelta(
        penalty_before=round(before, 2),
        penalty_after=round(after, 2),
        price_change=price_change,
        buckets=[
            BucketDelta(
                bucket=str(bucket),
                before=round(before_coverage.get(bucket, 0.0), 1),
                after=round(after_coverage.get(bucket, 0.0), 1),
                low=target.low,
                high=target.high,
            )
            for bucket, target in template.buckets.items()
        ]
        + [
            # Type rows ride the same list under a `type:` prefix so the wire
            # shape stays one model; a consumer that only knows buckets shows
            # the raw key and loses nothing.
            BucketDelta(
                bucket=f"type:{name}",
                before=round(types.get(name, 0.0), 1),
                after=round(after_types.get(name, 0.0), 1),
                low=target.low,
                high=target.high,
            )
            for name, target in template.types.items()
        ],
    )


def find_replacements(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    target_oracle_id: str,
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    limit: int = 10,
    max_price: float | None = None,
    excluded: list[str] | None = None,
) -> dict:
    """Alternatives to one card the user has marked.

    The mechanism is simply running the normal channels against the deck *minus*
    the marked card: `_HARD_FILTER` excludes whatever deck list it is handed, so
    the card stops being filtered out as "already in the deck" and its own
    replacements become reachable. No new query is needed.
    """
    from .graph import cards_role_weights, deck_card_roles, fetch_deck
    from .suggestions import suggest

    if target_oracle_id == commander_oracle_id:
        return {"target": None, "replacements": [], "notes": ["The commander cannot be replaced."]}

    deck = quantities or dict.fromkeys(deck_oracle_ids, 1)
    cards = fetch_deck(deck)
    card_roles = deck_card_roles(deck)

    target = next((c for c in cards if c["oracle_id"] == target_oracle_id), None)
    if target is None:
        return {"target": None, "replacements": [], "notes": ["That card is not in the deck."]}

    target_roles = {
        role
        for row in card_roles
        if row["oracle_id"] == target_oracle_id
        for role, weight in row["roles"].items()
        if weight
    }

    remaining = [oid for oid in deck_oracle_ids if oid != target_oracle_id]
    remaining_names = [n for n in deck_card_names if n != target["name"]]

    report = suggest(
        remaining,
        remaining_names,
        quantities={oid: qty for oid, qty in deck.items() if oid != target_oracle_id},
        commander_oracle_id=commander_oracle_id,
        limit=max(limit * 6, 60),
        max_price=max_price,
        speed=speed,
        overrides=overrides,
        excluded=excluded,
    )

    # The target is reachable as a candidate here — `remaining` drops it from
    # the deck precisely so `_HARD_FILTER` stops vetoing it — so it has to be
    # dropped explicitly, or the card is offered as its own replacement.
    report.suggestions = [s for s in report.suggestions if s.oracle_id != target_oracle_id]

    candidate_roles = cards_role_weights([s.oracle_id for s in report.suggestions])

    # Commander-tier type targets only: this path never diagnoses the deck
    # itself, so there is no theme profile to condition on. The gap is the
    # theme tier, not the axis — a 40-creature deck still shows its creature
    # rows moving — and threading a full diagnose through here costs a round
    # trip /replace was shaped to avoid.
    from .type_targets import conditioned_template, resolve_type_targets

    commander_name = None
    if commander_oracle_id:
        rows = fetch_deck({commander_oracle_id: 1})
        commander_name = rows[0]["name"] if rows else None
    type_targets, _ = resolve_type_targets(commander_name, {}, speed=speed)
    template = conditioned_template(speed, overrides, type_targets)
    notes: list[str] = []

    out: list[Replacement] = []
    for suggestion in report.suggestions:
        roles = candidate_roles.get(suggestion.oracle_id, {})
        shared = target_roles & {r for r, w in roles.items() if w}

        # Shape-preserving by construction: a replacement that shares no role
        # with what it replaces is not a replacement, it is a different card.
        if target_roles and not shared:
            continue

        out.append(
            Replacement(
                oracle_id=suggestion.oracle_id,
                name=suggestion.name,
                cmc=suggestion.cmc,
                type_line=suggestion.type_line,
                price_usd=suggestion.price_usd,
                playability=suggestion.playability,
                game_changer=suggestion.game_changer,
                score=suggestion.score,
                shared_roles=sorted(shared),
                reasons=[p.detail for p in suggestion.provenance],
                delta=shape_delta(
                    cards,
                    card_roles,
                    template,
                    remove=target_oracle_id,
                    add_roles=roles,
                    add_cmc=suggestion.cmc,
                    add_is_land="Land" in (suggestion.type_line or ""),
                    add_type_line=suggestion.type_line or "",
                    price_change=(
                        round((suggestion.price_usd or 0) - (target.get("price_usd") or 0), 2)
                        if suggestion.price_usd is not None
                        else None
                    ),
                ),
            )
        )

    if not out and target_roles:
        notes.append(
            f"Nothing sharing a role with {target['name']} cleared this deck's colours and budget."
        )
    if not target_roles:
        notes.append(
            f"{target['name']} fills no role the graph knows about, so "
            "replacements cannot be shape-matched."
        )

    # Best shape first, then strongest card — a replacement that improves the
    # deck matters more than one that merely scores well in isolation.
    out.sort(key=lambda r: (r.delta.penalty_after if r.delta else 0.0, -r.score))

    return {"target": target, "replacements": out[:limit], "notes": notes}
