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

from enum import StrEnum

import structlog
from pydantic import BaseModel, Field

from .composition import (
    CURVE_BUCKETS,
    DeckTemplate,
    bucket_coverage_from_cards,
    curve_targets,
    primary_type,
    type_counts_from_cards,
)
from .interaction import discount_board_wipe, is_cedh_template
from .poolquery import PoolFilter
from .suggestions import Phrase, _theme_gate_sides, _theme_vocabulary
from .themes import FIT_THRESHOLD
from .vocabulary import BUCKET_ROLES, COMMAND_ZONE_RESOURCES, TRIGGER_RESOURCES, Bucket, Role

log = structlog.get_logger(__name__)


class CutCode(StrEnum):
    """Why a card is offered as a cut. The frontend translates these."""

    BUCKET_CROWDED = "bucket-crowded"
    COMBO_PIECE = "combo-piece"
    EXCLUDED_THEME = "excluded-theme"
    IMPROVES_SHAPE = "improves-shape"
    RARELY_PLAYED = "rarely-played"
    STAPLE = "staple"
    STRANDED = "stranded"
    SUPPLIES_SCARCE = "supplies-scarce"
    TUTOR_FLOOR = "tutor-floor"


class CutPhrase(Phrase):
    """A cut reason: a Phrase whose code is drawn from the closed set.

    A separate subclass, not a narrowing of `Phrase.code` itself — `Phrase` is
    the shared schema component `SuggestionReport.notes` also uses, and those
    notes carry free-form codes.
    """

    code: CutCode


def cut_phrase(code: CutCode, text: str, **params: object) -> CutPhrase:
    """A cut reason, with its params stringified for a stable wire shape."""
    return CutPhrase(code=code, params={k: str(v) for k, v in params.items()}, text=text)


# A card is only worth proposing as a cut if it is at least this redundant.
# Below it the deck is being churned rather than improved.
MIN_CUT_SCORE = 0.05

# The theme-preference terms in `score_cuts`, scaled by the card's own share
# of the theme (`theme_share_among`, Task 1) rather than applied flat. Both
# start at the scale of the scarce defence term (`0.6` per scarce resource,
# below) as unmeasured starting points — house style, revisit once Phase D
# has numbers to tune against.
CUT_EXCLUDED_THEME = 0.6
CUT_PINNED_THEME = 0.6

# The weak-card prosecution. Cut scoring used to be pure shape: a card could
# only ever become a cut when some axis was over, so a stranded, rarely
# played card in an in-corridor bucket was invisible — observed live as
# Anhelo, the Painter (playability 0.09, payoff role, synergy bucket inside
# its corridor) never appearing while Demonic Tutor did. "Rarely played" was
# already *said* as a reason; now it scores, normalised over the sub-0.25
# band it fires in, and gated on the removal being shape-neutral or better —
# an obscure card in an *under*-target bucket is a hole, not a cut.
CUT_RARELY_PLAYED = 0.5

# The rarely-played band `upgrade_candidates` draws from — the same 0.25 line
# `score_cuts` fires its own rare-card term on above, named here because a
# second module-level use of a bare "0.25" is a second place to get it wrong.
# A card this weak is not defended by shape (the bare-cut gate that keeps it
# off the cut list), but *is* fair game to trade for something stronger in
# the same bucket — the swap leaves the bucket no worse off, so the gate's
# reason for existing does not apply.
UPGRADE_PLAY_FLOOR = 0.25

# The floor a theme must clear to count as "what this card is for", used to
# derive replace-run pins from the target card. `FIT_THRESHOLD` is the fits
# side's "does this card read as the theme at all" bar; a pin derived from
# one card needs the stronger question answered, so the floor is that bar
# doubled. Measured on Windfall: 0.77 `wheels` clears it, while its 0.34
# `spellslinger` and 0.30 `reanimator` riders do not — which is the point,
# those are not what a Windfall replacement is being asked for.
REPLACE_THEME_FLOOR = 2 * FIT_THRESHOLD
# Same reasoning as `suggestions.DETECTED_THEME_LIMIT`, applied to one card
# instead of a deck: two themes are enough to say what a slot is for.
REPLACE_THEME_LIMIT = 2

# What makes a land a mana source. Every *other* role a land fills is a rider
# on a slot the deck was spending anyway — see the land branch in `score_cuts`.
_MANA_SOURCE_ROLES = BUCKET_ROLES[Bucket.MANA_SOURCES]

# The same prosecution's structural half: a card whose every cared-about
# resource has zero producers in the deck is an engine with no fuel, whatever
# its playrate. Strict on purpose — one supported want and the card is merely
# narrow, not stranded.
CUT_STRANDED = 0.5

# The deck-relative defences — the cut side finally reading the same evidence
# the add side argues with, so the tool stops recommending a card at rank 3
# and offering it as a cut in the same breath (observed live: Demonic Tutor,
# added on the advisor's own advice, listed as a cut the next request).
# Sized above any single prosecution term: a defence that fires should win
# against everything but a genuine shape overage.
CUT_TUTOR_FLOOR = 1.5
CUT_COMBO_PIECE = 1.5

# How far below the card it replaces an add may sit before the swap is a
# downgrade rather than an exchange.
#
# The graph cannot read a card, so it cannot know that The One Ring draws more
# than Smuggler's Copter. The nearest honest proxy is how many real decks run
# each — a comparison that means anything only when the two cards do the same
# job, which is exactly the case a swap constructs. `power.playability` is a
# global measure computed the same way on both sides, so the two are on one
# scale here even though they arrive by different queries.
#
# It is a band, not a threshold: inside it the two cards are a sidegrade and
# the shape argument decides, which is the whole point of the pairing. Outside
# it the proposal is "play a worse card", and no curve improvement redeems that.
#
# Blocking a pairing does not suppress the add — the loop keeps walking the cut
# list for a weaker partner, and the card still stands in the suggestions list
# either way. All this decides is what it gets offered against.
DOWNGRADE_MARGIN = 0.12


class CutCandidate(BaseModel):
    oracle_id: str
    name: str
    cmc: float = 0.0
    type_line: str = ""
    price_usd: float | None = None
    playability: float = 0.0
    score: float = 0.0
    # Structured so a localised UI can word them itself; each still carries its
    # English rendering for the CLI and anything without translations.
    reasons: list[CutPhrase] = Field(default_factory=list)


class Swap(BaseModel):
    """One proposed exchange, with the shape change it causes."""

    add_oracle_id: str
    add_name: str
    cut: CutCandidate
    # Roles the two share, which is why cutting this one makes room without
    # tearing a hole somewhere else.
    shared_roles: list[str] = Field(default_factory=list)
    # The other kind of exchange: out of a bucket the deck is over on, into one
    # it is short of. There is no shared role in that case — the point is that
    # the card does something *different* — so these carry the reason instead.
    frees: list[str] = Field(default_factory=list)
    fills: list[str] = Field(default_factory=list)
    # A third kind: same bucket, weaker card out, stronger card in — the pair
    # `score_cuts` alone could never produce, because a card in a short bucket
    # is defended from the bare-cut list on purpose (see `upgrade_candidates`).
    # Additive and defaulted so every existing consumer, and the wire shape
    # `/swaps` already serialises, is unchanged.
    upgrade: bool = False


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
    pinned_share: dict[str, tuple[float, str]] | None = None,
    excluded_share: dict[str, tuple[float, str]] | None = None,
    produced_counts: dict[str, int] | None = None,
    combo_partners: dict[str, list[str]] | None = None,
    tutor_floor_ids: set[str] | None = None,
) -> list[CutCandidate]:
    """Rank in-deck cards by how little removing them costs.

    `wanted_resources` maps a resource to the deck's unmet demand for it, so a
    card supplying something scarce is defended even if its role is redundant.

    `pinned_share` and `excluded_share` are the theme-preference terms, both
    optional and both defaulting to nothing — a caller with no theme prefs to
    thread through (or an older test) gets byte-identical scores to before
    these existed. Each maps an oracle id to `(share, label)`: how much of
    *that card's own* identity (`theme_share_among`'s card-normalised,
    membership-gated share) falls inside the pinned or excluded theme that
    won the `max` across themes, and that theme's own display label — an
    excluded-theme card is a *better* cut in proportion to its share, a
    pinned-theme card a *worse* one — a term, not a hard protection, so a
    pinned theme with too many weak cards still sheds its weakest. The
    excluded-theme term additionally requires the share to clear
    `FIT_THRESHOLD` and to dominate the same card's pinned share before it
    fires at all — see the comment at the reason site.

    The last three are the deck-relative terms, same inert defaults:
    `produced_counts` (resource -> how many deck cards produce it) arms the
    stranded prosecution, `combo_partners` (oracle id -> the other pieces of
    a *complete* line it holds together) and `tutor_floor_ids` (the best
    tutors the bracket's target claims — cutting one of *these* reopens
    the gap; a surplus tutor beyond the floor stays cuttable) arm the two
    defences that stop the cut side contradicting the add side.
    """
    protected = protected or set()
    pinned_share = pinned_share or {}
    excluded_share = excluded_share or {}
    combo_partners = combo_partners or {}
    by_id = {card["oracle_id"]: card for card in cards}

    # cEDH board-wipe coverage discount (Task C2, cEDH Pro round) — applied
    # once here, so every downstream coverage read in this function (`coverage`,
    # `base`, every `trimmed`/`kept` variant, `after_coverage`) inherits it
    # automatically, and reads the same INTERACTION number the diagnostics
    # report and the fill solver do for this deck. See
    # `interaction.discount_board_wipe`.
    cedh = is_cedh_template(template)
    entries = [
        (discount_board_wipe(_typed(row["roles"]), cedh=cedh), row["qty"]) for row in card_roles
    ]
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

        # A nonbasic land's non-mana roles are riders: Plaza of Heroes supplies
        # `protection` without costing a nonland slot, so a crowded interaction
        # bucket is not a reason to cut it — that overage is paid by cutting a
        # spell. Observed live: a deck with five Forests, two Mountains and six
        # Plains was told to cut Plaza of Heroes ahead of both basics, because
        # dropping it relieved `mana_sources` *and* `interaction` while a
        # Mountain relieved only the first.
        #
        # Asymmetric on purpose, which is what `min` buys. The rider may still
        # defend the land — if interaction is *short*, losing the protection is
        # a real cost and should count against the cut — so the rider can only
        # ever lower the case for cutting, never raise it. Basics and roleless
        # lands have no riders at all, so both deltas coincide and their score
        # is byte-identical to before.
        #
        # Gated on the card actually *being* a mana source (holding a
        # `_MANA_SOURCE_ROLES` weight), not just on `is_land` — a card can
        # carry the `is_land` flag for reasons that have nothing to do with
        # producing mana (`_shape_neutral_payoffs` in the test suite rides it
        # purely to dodge curve/type accounting, and holds no `land` role at
        # all). Without this, a card whose *entire* role set is non-mana
        # would have that whole set added back as a "rider", netting its
        # delta to zero regardless of how crowded its own bucket is — the
        # premise "the rider rides a mana slot the deck was spending anyway"
        # only holds when there is a mana slot to ride.
        is_mana_source = card["is_land"] and bool(weights.keys() & _MANA_SOURCE_ROLES)
        if is_mana_source:
            riders = {
                role: weight for role, weight in weights.items() if role not in _MANA_SOURCE_ROLES
            }
            if riders:
                # One copy of the riders added back, against the one copy of the
                # whole card `trimmed` took out: the rider survives the cut for
                # scoring purposes and nets out of the delta. The type row is
                # deliberately not touched — the land itself is genuinely gone.
                kept = [*trimmed, (riders, 1)]
                delta = min(
                    delta, base - _shape_penalty(kept, trimmed_curve, template, trimmed_types)
                )

        reasons: list[CutPhrase] = []

        # Same rule as the delta above: a land's riders do not argue for the
        # cut, so they must not be named as a reason for it either.
        arguing_roles = _typed(row["roles"]).keys()
        if is_mana_source:
            arguing_roles = arguing_roles & _MANA_SOURCE_ROLES

        if delta > 0.01:
            # Named, not scored. The delta is a penalty difference in units
            # nobody outside this module has a feel for — "+2.85" told a
            # reader nothing about which target, or which way. What they can
            # act on is the bucket that is over and the fact that this card
            # is in it.
            crowded = [
                str(bucket)
                for bucket, roles in BUCKET_ROLES.items()
                if arguing_roles & roles
                and (target := template.buckets.get(bucket)) is not None
                and target.is_over(coverage.get(bucket, 0.0))
            ]
            if crowded:
                spelled = [bucket.replace("_", " ") for bucket in crowded]
                named = (
                    spelled[0]
                    if len(spelled) == 1
                    else " and ".join([", ".join(spelled[:-1]), spelled[-1]])
                )
                reasons.append(
                    cut_phrase(
                        CutCode.BUCKET_CROWDED,
                        f"the deck is over on {named}, and this card is in it",
                        buckets=named,
                        # The slugs behind the prose. `buckets` is an English
                        # sentence fragment — two bucket names welded together
                        # with "and" — which a localised UI can neither
                        # translate nor lay out one bucket at a time. The list
                        # it can: these are the same names `BUCKET_ROLES` is
                        # keyed by, which every consumer already knows how to
                        # word for itself.
                        bucket_slugs=",".join(crowded),
                    )
                )
            else:
                reasons.append(
                    cut_phrase(
                        CutCode.IMPROVES_SHAPE,
                        "cutting it moves the deck closer to its target shape",
                    )
                )

        # Weakly played cards are easier to defend cutting than staples.
        #
        # Basics are the exception, and it is the exception that puts them at
        # the head of a land cut. Playability measures format ubiquity, and
        # an Island's is enormous — every deck plays them because they are
        # free — so the tiebreak read the fifth Island of a three-colour
        # deck as a staple to protect while offering an off-colour fetch and
        # an obscure utility land first (observed live). The marginal basic
        # is fungible *by definition*: nothing else in the ninety-nine is
        # cheaper to spare, at any playrate. Full redundancy, no staple
        # defence — the shape delta alone decides whether a land cut is
        # right, and once it is, the basic leads it.
        play = card.get("playability") or 0.0
        is_basic = card["type_line"].startswith("Basic")
        redundancy = 1.0 if is_basic else 1.0 - play
        if play < 0.25 and not is_basic:
            reasons.append(cut_phrase(CutCode.RARELY_PLAYED, "rarely played in decks like this"))
        elif play > 0.55 and not is_basic:
            # Every card in an over-full bucket has the same marginal delta, so
            # without this they tie and the list reads as arbitrary. How played
            # a card is, is the tiebreak that makes the ordering defensible.
            reasons.append(
                cut_phrase(
                    CutCode.STAPLE,
                    f"a staple ({play:.0%}) — cut something else first",
                    rate=f"{play:.0%}",
                )
            )

        # A card supplying something the deck is short of is defended.
        supplies = card_resources.get(oracle_id, {}).get("produces", set())
        scarce = [r for r in supplies if wanted_resources.get(r, 0) > 0]
        if scarce:
            listed = ", ".join(sorted(scarce)[:2])
            reasons.append(
                cut_phrase(
                    CutCode.SUPPLIES_SCARCE,
                    f"supplies {listed}, which the deck wants",
                    listed=listed,
                )
            )

        # The weak-card prosecution, both halves gated on the removal being
        # shape-neutral or better — a weak card in an under-target bucket is
        # a hole to fill with something stronger, not a cut. Lands are out of
        # the rare half entirely: a land's job is mana, not a playrate, and
        # scoring obscurity against lands put the obscure utility land back
        # above the fifth Island — the exact ordering the basics fix exists
        # to prevent. See the constants for the observed failures.
        #
        # "Can the deck spare one of these" is asked of the buckets and the
        # type row, deliberately not the curve or a delta threshold. The
        # first gate was `delta > -tolerance`, and any scalar was wrong for
        # someone: Anhelo's removal read −1.16 purely from the curve dent of
        # taking one mv-3 spell out of sixty, which no reader would call
        # unsparable when his type row sat at 14 against 12–18. The curve
        # keeps its full say in the *ranking* (via `delta` above); it just
        # does not veto a prosecution one card of sixty cannot meaningfully
        # move.
        rare = 0.0
        stranded = False
        after_coverage = bucket_coverage_from_cards(trimmed)
        buckets_spare = all(
            after_coverage.get(bucket, 0.0) >= target.low
            or after_coverage.get(bucket, 0.0) == coverage.get(bucket, 0.0)
            for bucket, target in template.buckets.items()
        )
        type_target = template.types.get(cut_type)
        type_spare = type_target is None or trimmed_types.get(cut_type, 0.0) >= type_target.low
        if buckets_spare and type_spare:
            if play < 0.25 and not card["is_land"]:
                rare = (0.25 - play) / 0.25
            # Material resources only: trigger events have natural sources no
            # producer count can see — a "whenever ~ attacks" card makes its
            # own trigger by attacking, and the first version told Cecily,
            # Haunted Mage she "wants attack_trigger, which nothing in the
            # deck makes". Zone-supplied resources are the same misread from
            # the other zone: a Lieutenant card's fuel is the commander in
            # the command zone, which the produced counts (built from the 99)
            # can never contain — observed live on Tyrant's Familiar in a
            # three-commander deck. See `TRIGGER_RESOURCES` and
            # `COMMAND_ZONE_RESOURCES` in vocabulary.py.
            cares = card_resources.get(oracle_id, {}).get("cares_about", set())
            material = {
                r for r in cares if r not in TRIGGER_RESOURCES and r not in COMMAND_ZONE_RESOURCES
            }
            if material and produced_counts is not None:
                stranded = all(produced_counts.get(r, 0) == 0 for r in material)
                if stranded:
                    wants = ", ".join(sorted(material)[:2])
                    reasons.append(
                        cut_phrase(
                            CutCode.STRANDED,
                            f"wants {wants}, which nothing in the deck makes",
                            wants=wants,
                        )
                    )

        # The deck-relative defences. Voiced like the staple defence — a
        # defended card that still surfaces should say why it fought — and
        # sized to win against anything but a genuine shape overage.
        tutor_defended = oracle_id in (tutor_floor_ids or ())
        if tutor_defended:
            reasons.append(
                cut_phrase(
                    CutCode.TUTOR_FLOOR,
                    "the deck is at its tutor count for this bracket — cutting one reopens the gap",
                )
            )
        partners = combo_partners.get(oracle_id) or []
        if partners:
            with_cards = " + ".join(partners[:2])
            reasons.append(
                cut_phrase(
                    CutCode.COMBO_PIECE,
                    f"holds a complete combo line together with {with_cards}",
                    with_cards=with_cards,
                )
            )

        # A card that reads as a theme the user excluded is a *better* cut,
        # proportionally to how much of it is the theme — the cut-scoring
        # mirror of `_apply_theme_exclusions` in suggestions.py, working the
        # score the other direction. The term and the chip fire together or
        # not at all, gated on both halves of "does this actually read as
        # the excluded theme":
        #
        # - `excluded >= FIT_THRESHOLD` — the fits side's own "reads as the
        #   theme at all" line (themes.py), reused here to keep one threshold
        #   vocabulary. `theme_share_among`'s membership gate already zeroes
        #   a card whose identity has nothing in the theme's `requires_any`
        #   (a rider that merely brushes the vocabulary is not membership),
        #   but a genuine, minor member of a big-identity card can still
        #   clear membership at a token share — the floor is what stops that
        #   remainder from reading as an accusation.
        # - `excluded > pinned` — the user's own preferences argue back.
        #   Defy Death reads 0.444 reanimator (favored, via `pinned_share`)
        #   against 0.333 tribal (excluded, cleared only by its "+1/+1
        #   counter if it's a Spirit" rider): the arithmetic already knows
        #   the card is more favored than excluded, so the sentence should
        #   too — a card that reads more as a favored theme than the
        #   excluded one is not "off-theme".
        #
        # Zero when `excluded_share` was not passed at all (share defaults
        # to 0.0, so the floor trivially fails), so a caller that has not
        # computed it stays at today's score. No reason and no score
        # contribution when the gate fails — a score bump with no visible
        # reason was explicitly rejected in the theme-prefs round.
        excluded, excluded_label = excluded_share.get(oracle_id, (0.0, ""))
        pinned, _ = pinned_share.get(oracle_id, (0.0, ""))
        if excluded >= FIT_THRESHOLD and excluded > pinned:
            reasons.append(
                cut_phrase(
                    CutCode.EXCLUDED_THEME,
                    f"reads as {excluded_label}, which you excluded",
                    theme=excluded_label,
                )
            )
        else:
            excluded = 0.0

        # The other direction: a pinned-theme card is defended proportionally
        # to its own share of that theme. No reason entry — a defence that
        # fired and still lost is not a reason to cut, and this is a term,
        # not a hard protection: a pinned theme with too many weak cards
        # must still shed its weakest. Untouched by the dominance gate above
        # — a pinned card is defended at its full share regardless of what
        # else it reads as.

        score = (
            max(delta, 0.0) * (0.4 + 0.6 * redundancy)
            - 0.6 * len(scarce)
            + CUT_EXCLUDED_THEME * excluded
            - CUT_PINNED_THEME * pinned
            + CUT_RARELY_PLAYED * rare
            + (CUT_STRANDED if stranded else 0.0)
            - (CUT_TUTOR_FLOOR if tutor_defended else 0.0)
            - (CUT_COMBO_PIECE if partners else 0.0)
        )

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

    # Basics lead a tie. `redundancy` already puts them ahead of any nonbasic
    # with a playrate, but a nonbasic at 0.0 ties exactly, and "cut the
    # Mountain" is the answer a builder expects — the marginal basic is the
    # one card in the ninety-nine that is fungible by definition.
    return sorted(out, key=lambda c: (-c.score, not c.type_line.startswith("Basic")))


def upgrade_candidates(
    cards: list[dict],
    card_roles: list[dict],
    template: DeckTemplate,
    *,
    protected: set[str] | None = None,
    tutor_floor_ids: set[str] | None = None,
    combo_partners: dict[str, list[str]] | None = None,
) -> list[CutCandidate]:
    """Weak cards worth trading for a stronger card of the same job.

    `score_cuts` will not offer these — the sparable gate refuses to bare-cut
    a card from a bucket that is not over, and rightly so: a short bucket does
    not want a hole in it. But a same-bucket *replacement* leaves the bucket
    exactly as full as before, so the gate's reason not to fire does not apply
    to a swap. Observed live: Anhelo, the Painter (playability 0.09, `payoff`
    role) sat in the Kess deck's `synergy_wincon` bucket, which read genuinely
    low — never a cut, while the add side kept suggesting stronger payoffs
    with nothing to pair them against.

    These candidates never join the `cuts` list `suggest_swaps` returns; they
    exist only for `pair_swaps` to reach for, the same way `score_cuts`'s own
    output does. The defences are identical to a bare cut's — protected,
    tutor floor, combo partners — because trading away a defended card is no
    more acceptable than removing it outright.
    """
    protected = protected or set()
    tutor_floor_ids = tutor_floor_ids or set()
    combo_partners = combo_partners or {}
    by_id = {card["oracle_id"]: card for card in cards}

    out: list[CutCandidate] = []
    for row in card_roles:
        oracle_id = row["oracle_id"]
        card = by_id.get(oracle_id)
        if card is None or oracle_id in protected:
            continue
        if oracle_id in tutor_floor_ids or oracle_id in combo_partners:
            continue

        play = card.get("playability") or 0.0
        if play >= UPGRADE_PLAY_FLOOR:
            continue
        # Mana-base upgrades are the fixing channel's job, not this one's —
        # same exception `score_cuts` carves out for the rare-card term.
        if card["is_land"] or card["type_line"].startswith("Basic"):
            continue

        roles = _typed(row["roles"]).keys()
        # Roleless cards have no "same bucket" to be upgraded within.
        in_a_bucket = any(
            bucket in template.buckets and roles & members
            for bucket, members in BUCKET_ROLES.items()
        )
        if not in_a_bucket:
            continue

        score = (UPGRADE_PLAY_FLOOR - play) / UPGRADE_PLAY_FLOOR
        out.append(
            CutCandidate(
                oracle_id=oracle_id,
                name=card["name"],
                cmc=card["cmc"],
                type_line=card["type_line"],
                price_usd=card.get("price_usd"),
                playability=play,
                score=round(score, 3),
                reasons=[cut_phrase(CutCode.RARELY_PLAYED, "rarely played in decks like this")],
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
    buckets: list | None = None,
    upgrades: list[CutCandidate] | None = None,
) -> list[Swap]:
    """Match each add with the cuts that make room for it.

    Three kinds of exchange qualify. The second and third both exist because
    the first alone produced a contradiction the reader could see:

    **Same role.** "To add this ramp piece, cut one of these ramp pieces." The
    shape is preserved by construction, and the swap is a quality upgrade —
    which `DOWNGRADE_MARGIN` is what makes true.

    **Out of a full bucket, into an empty one.** Shared roles were once
    required, and for a balanced deck that is right: an arbitrary pairing fixes
    one quota by breaking another. But when a card is cut *because its bucket is
    over*, a same-bucket replacement leaves the deck exactly as over as before —
    so the advisor printed "the deck is over on synergy wincon, and this card is
    in it" and then offered six more synergy wincon cards for the slot. The
    reason and the remedy contradicted each other on screen. A cut from a full
    bucket may therefore pair with an add to a short one, no shared role needed:
    that exchange is the only one that answers the reason given.

    **Same bucket, weaker card out.** The mirror problem: a bucket that is
    *short* correctly defends its weak cards from a bare cut (`score_cuts`
    will not prosecute a removal that digs the bucket deeper), so a genuinely
    bad card sitting in a short bucket was invisible to both of the above —
    neither a same-role cut (it is not offered as a cut at all) nor a
    cross-bucket one (its own bucket is short, not over). `upgrades` —
    `upgrade_candidates`'s output, ranked weakest-first — is the pairer's
    only way to reach it: an add whose roles land in a short bucket may pair
    with an upgrade candidate that shares that bucket, provided it is a real
    upgrade (`DOWNGRADE_MARGIN`, used in the strict direction this time — the
    add must clear the bar, not merely avoid falling far short of it). The
    bucket count does not move, so the gate that kept the card off the bare
    cut list never had anything to say about this exchange.

    Partners are ranked by what the exchange does to the deck's shape, with the
    cut's own score as the tiebreak, so the composition-fixing pairing leads and
    the lateral one is the fallback rather than the default. Requires `buckets`
    — the diagnostics rows — to know which is which; without them this is the
    shared-role pairing exactly as before, and `upgrades` (which reads the same
    rows) has nothing to pair against either.

    Cuts arrive ranked by how much removing them helps the deck's shape, and a
    well-played card in an over-full bucket scores highly on exactly that, so
    the untested pairing also offered the deck's best cards as the thing to
    remove and asked for a weaker card of the same kind in return. See
    `DOWNGRADE_MARGIN`.
    """
    over = {str(row.bucket) for row in buckets or [] if row.status == "high"}
    short = {str(row.bucket) for row in buckets or [] if row.status == "low"}

    def held(roles: dict[str, float]) -> set[str]:
        """Which composition buckets a card's roles put it in."""
        live = _typed(roles).keys()
        return {str(bucket) for bucket, members in BUCKET_ROLES.items() if live & members}

    # (cut rank, -gain, add rank, swap). Sorted at the end rather than appended
    # in order, because the two dimensions disagree: this loop picks the best
    # cuts *for an add*, while the view groups by cut and reads the adds under
    # it. Ordering only the inner choice left each group in add-rank order, so
    # the card that answered the cut's stated reason could sit below one that
    # merely shared a role with it.
    ordered: list[tuple[int, float, int, Swap]] = []
    by_add: dict[str, list[tuple[float, int, Swap]]] = {}
    reserved_adds: set[str] = set()

    for index, add in enumerate(adds):
        wanted = {role for role, weight in add_roles.get(add["oracle_id"], {}).items() if weight}
        add_buckets = held(add_roles.get(add["oracle_id"], {}))
        scored: list[tuple[float, int, Swap]] = []

        for rank, cut in enumerate(cuts):
            # The basics channel bypasses the already-in-deck filter, so a
            # Mountain already in the deck can appear in `adds` while
            # `score_cuts` independently offers that same Mountain as a cut —
            # and the shared `land` role would otherwise qualify the pair.
            if add["oracle_id"] == cut.oracle_id:
                continue

            shared = wanted & {
                role for role, weight in cut_roles.get(cut.oracle_id, {}).items() if weight
            }
            # Buckets this cut would drain that the deck is over on — the
            # reason the cut is being offered at all.
            frees = held(cut_roles.get(cut.oracle_id, {})) & over
            fills = add_buckets & short

            if not shared and not (frees and fills):
                continue

            # A game changer is powerful on an authoritative list rather than a
            # popular one, so a modest rank is not evidence against it.
            if (
                not add.get("game_changer")
                and cut.playability - add.get("playability", 0.0) > DOWNGRADE_MARGIN
            ):
                continue

            # What the exchange is worth to the deck's shape: buckets it leaves
            # for good, plus shortfalls it answers. A card that returns to the
            # bucket it just drained earns nothing for it, which is what sinks
            # the lateral swap below the one that actually moves the needle.
            gain = len(frees - add_buckets) + len(fills)

            scored.append(
                (
                    gain,
                    rank,
                    Swap(
                        add_oracle_id=add["oracle_id"],
                        add_name=add["name"],
                        cut=cut,
                        shared_roles=sorted(shared),
                        frees=sorted(frees - add_buckets),
                        fills=sorted(fills),
                    ),
                )
            )

        scored.sort(key=lambda entry: (-entry[0], entry[1]))
        # One slot held back for the upgrade pass when this add's roles land
        # in a short bucket and upgrades are in play at all. Without the
        # reservation the feature was dead on arrival — measured on the live
        # deck it was built for: every synergy-bound add found `per_add`
        # ordinary pairs here, so the third pass never got a turn and zero
        # upgrade swaps surfaced. An add whose reserved slot finds no
        # qualifying upgrade gets the held-back pair restored below, so
        # reserving costs nothing when there is nothing to reserve for.
        reserved = bool(upgrades) and bool(add_buckets & short)
        take = per_add - 1 if reserved and per_add > 1 else per_add
        if take < per_add:
            reserved_adds.add(add["oracle_id"])
        ordered.extend((cut_rank, -gain, index, swap) for gain, cut_rank, swap in scored[:take])
        # Kept whole, so the second pass can reach a pairing this add had no
        # room for. `per_add` bounds how many cuts one add is *offered* against;
        # it was never meant to decide what a given cut gets shown.
        by_add[add["oracle_id"]] = scored

    # Second pass: every cut on display answers the reason printed beside it.
    #
    # The first pass gives each add its best cuts, which is the wrong dimension
    # for a view that groups by cut — a shape-fixing add spends its slots on the
    # top two cuts and the third is left with same-bucket partners, so a cut
    # reading "the deck is over on interaction" was offered three more removal
    # spells. One extra pairing per cut fixes that without reordering the rest,
    # and the cap keeps a cut from filling up with near-identical mana rocks.
    # One entry per exchange, everywhere: the second pass and the
    # reservation backfill below both reach into `by_add`'s full rankings,
    # and without this ledger the two could fish out the same row — the
    # reader then saw the identical add twice inside one cut's offers
    # (observed live in the refine view).
    seen = {(swap.add_oracle_id, swap.cut.oracle_id) for _, _, _, swap in ordered}

    answered = {swap.cut.oracle_id for _, _, _, swap in ordered if swap.fills}
    for cut_rank, cut in enumerate(cuts):
        if cut.oracle_id in answered:
            continue
        if not any(swap.cut.oracle_id == cut.oracle_id for _, _, _, swap in ordered):
            continue
        best = min(
            (
                (-gain, index, swap)
                for index, scored in enumerate(by_add.values())
                for gain, rank, swap in scored
                if rank == cut_rank
                and swap.fills
                and (swap.add_oracle_id, swap.cut.oracle_id) not in seen
            ),
            default=None,
        )
        if best is not None:
            ordered.append((cut_rank, best[0], best[1], best[2]))
            seen.add((best[2].add_oracle_id, best[2].cut.oracle_id))

    # Third pass: the same-bucket upgrade. Only for an add still short of
    # `per_add` partners after the first two passes — an add already well
    # supplied by real cuts has no need of this — and only into a bucket its
    # own roles land in that the deck's report reads as short: that is what
    # licenses pairing against a card `score_cuts` would never offer as a
    # bare cut (see `upgrade_candidates`).
    #
    # Ranks after every ordinary cut (`len(cuts) + rank` cannot collide with
    # a real `cut_rank`, which stays below `len(cuts)`), so an upgrade pairing
    # never displaces a cut that actually answers the deck's shape — it only
    # fills a slot the first two passes left empty.
    #
    # `per_add` doubles as the reuse cap on the upgrade candidate itself: the
    # weakest card in a short bucket would otherwise be dangled in front of
    # every strong add that bucket attracts. One qualifying partner per add,
    # first match on the weakest-first walk, mirrors how the cap above bounds
    # what a single add is *offered* — here it bounds what a single candidate
    # is *offered against*.
    if upgrades:
        partner_counts: dict[str, int] = {}
        for _, _, _, swap in ordered:
            partner_counts[swap.add_oracle_id] = partner_counts.get(swap.add_oracle_id, 0) + 1
        upgrade_uses: dict[str, int] = {}
        # A card the cut list already offers is reachable through the first
        # two passes on its own terms — pairing it here as well would show
        # the same exchange twice, once with the badge and once without.
        cut_ids = {cut.oracle_id for cut in cuts}
        upgraded_adds: set[str] = set()

        for index, add in enumerate(adds):
            add_id = add["oracle_id"]
            # A reserved add held one slot back in the first pass expressly
            # for this moment, and keeps its claim even where the second pass
            # (which ignores the per-add budget by design) topped it back up.
            if partner_counts.get(add_id, 0) >= per_add and add_id not in reserved_adds:
                continue

            wanted = {role for role, weight in add_roles.get(add_id, {}).items() if weight}
            fillable = held(add_roles.get(add_id, {})) & short
            if not fillable:
                continue
            add_play = add.get("playability", 0.0)

            for rank, candidate in enumerate(upgrades):
                if candidate.oracle_id == add_id or candidate.oracle_id in cut_ids:
                    continue
                if upgrade_uses.get(candidate.oracle_id, 0) >= per_add:
                    continue
                candidate_roles = cut_roles.get(candidate.oracle_id, {})
                if not (held(candidate_roles) & fillable):
                    continue
                # The strict direction: a sidegrade is not enough here, unlike
                # the downgrade veto above — this pairing exists to answer
                # "cut the weak payoff for the strong one", not "these two are
                # close enough".
                if add_play < candidate.playability + DOWNGRADE_MARGIN:
                    continue

                shared = wanted & {r for r, w in candidate_roles.items() if w}
                swap = Swap(
                    add_oracle_id=add_id,
                    add_name=add["name"],
                    cut=candidate,
                    shared_roles=sorted(shared),
                    upgrade=True,
                )
                ordered.append((len(cuts) + rank, 0, index, swap))
                partner_counts[add_id] = partner_counts.get(add_id, 0) + 1
                upgrade_uses[candidate.oracle_id] = upgrade_uses.get(candidate.oracle_id, 0) + 1
                upgraded_adds.add(add_id)
                break

        # A reservation that found no qualifying upgrade must not cost the
        # add its ordinary pair: restore the held-back pairing from the
        # first pass's full ranking, exactly as it would have been taken.
        for index, add in enumerate(adds):
            add_id = add["oracle_id"]
            if add_id not in reserved_adds or add_id in upgraded_adds:
                continue
            scored = by_add.get(add_id) or []
            if len(scored) >= per_add:
                gain, cut_rank, swap = scored[per_add - 1]
                if (swap.add_oracle_id, swap.cut.oracle_id) not in seen:
                    ordered.append((cut_rank, -gain, index, swap))
                    seen.add((swap.add_oracle_id, swap.cut.oracle_id))

    ordered.sort()
    return [swap for *_, swap in ordered]


def _theme_shares(
    theme_ids: list[str] | None, deck_oracle_ids: list[str]
) -> dict[str, tuple[float, str]]:
    """Per-card (max share, winning theme's label) across `theme_ids`'s vocabulary.

    Feeds `score_cuts`' `pinned_share`/`excluded_share` — the same mechanism
    `_apply_theme_exclusions` uses in `suggestions.py`: one `theme_share_among`
    query per theme (gate-side semantics via `_theme_gate_sides`, vocabulary
    via `_theme_vocabulary`, membership via `theme.requires_any`), merged by
    `max` across themes so a card belonging to two of them is not double-
    counted. The label rides along with the max, not just the number — with
    two or more excluded themes, `score_cuts`' chip needs to name the one
    that actually won, or a user with several exclusions cannot tell which
    fired (`theme.label`, e.g. "Typal" — service labels are the frontend's
    display strings by design, see `deck-advisor-themes.tsx`). `THEMES.get`'s
    raw-ids posture — an id the graph does not know contributes nothing
    rather than erroring. Themes resolve over the deck's own oracle ids, not
    the candidate pool `theme_share_among` is otherwise queried against.
    """
    from .graph import theme_share_among
    from .themes import THEMES

    shares: dict[str, tuple[float, str]] = {}
    for theme_id in theme_ids or []:
        theme = THEMES.get(theme_id)
        if theme is None:
            continue
        for row in theme_share_among(
            deck_oracle_ids,
            sorted(_theme_vocabulary(theme)),
            _theme_gate_sides(theme),
            sorted(str(r) for r in theme.requires_any),
        ):
            oracle_id = row["oracle_id"]
            share = row.get("share") or 0.0
            if share > shares.get(oracle_id, (0.0, ""))[0]:
                shares[oracle_id] = (share, theme.label)
    return shares


def suggest_swaps(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    curve: dict | None = None,
    type_overrides: dict | None = None,
    focus: str | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    excluded: list[str] | None = None,
    identity: list[str] | None = None,
    deck_size: int = 99,
    protected: list[str] | None = None,
    limit: int = 24,
    per_add: int = 3,
    pool_filter: PoolFilter | None = None,
    allow_network: bool = True,
) -> dict:
    """Adds paired with the cuts that make room for them.

    `allow_network` and `identity` thread straight through to the `suggest()`
    call below — see its doc comment. The `diagnose()` call just above stays
    unconditional: it only ever touches the small, now-tombstoned theme-page
    fetch, and diagnostics is colour-blind anyway.

    `deck_size` (the deck's target count outside the command zone) threads
    into both — and into the cut-scoring template, so a Rule 0 deck's cuts
    are judged against the same resized quotas its report shows.
    """
    from .diagnostics import DeckEntry, diagnose
    from .eminence import apply_discount, discount_for
    from .graph import deck_card_resources, deck_card_roles, fetch_deck
    from .suggestions import effective_commanders, suggest

    deck = quantities or dict.fromkeys(deck_oracle_ids, 1)
    cards = fetch_deck(deck)
    # As cast, not as printed — cut scoring's curve has to bucket the way the
    # report it argues against does.
    apply_discount(
        cards, discount_for(cards, effective_commanders(commander_oracle_id, commander_oracle_ids))
    )
    card_roles = deck_card_roles(deck)
    card_resources = deck_card_resources(deck)

    # The commander anchors the profile here exactly as it does in suggest()'s
    # internal diagnose — without it, cut scoring's shortfall view followed
    # whatever the 99 happened to be rather than the deck's intent.
    report = diagnose(
        [DeckEntry(oracle_id=oid, qty=qty) for oid, qty in deck.items()],
        speed=speed,
        overrides=overrides,
        curve=curve,
        type_overrides=type_overrides,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        deck_size=deck_size,
        allow_network=True,
    )
    wanted = {row.resource: row.gap for row in report.balance if row.gap > 0}

    # The commander is never a cut candidate, and neither is anything this
    # tool just talked the user into playing. Accepting a suggestion changes
    # the shape every other card is scored against, so a card added to a bucket
    # that was already full scores as a cut on the very next request — the
    # advisor arguing against its own advice one click later.
    defended = set(protected or ())
    defended.update(commander_oracle_ids or ())
    if commander_oracle_id:
        defended.add(commander_oracle_id)

    # Cut scoring runs against the *reported* type targets, not a fresh
    # resolution — re-resolving could flip the prior tier between the report
    # and the score, and a mismatch there is silent when wrong. `cedh_class`
    # (Task E follow-up, cEDH Pro round) is the same story one level up: the
    # report already classified this deck, and re-classifying here could not
    # possibly disagree (same cards) but would be a second, pointless pass
    # over `card_roles`/`resources_by_card` — reading `report.cedh_class`
    # is both cheaper and the only way to guarantee cut scoring bucket-corridor
    # matches the report byte for byte.
    from .type_targets import conditioned_template, targets_from_report

    # The report's rows are already deck-sized; the scale resizes only the
    # interpolated buckets to match them.
    template = conditioned_template(
        speed,
        overrides,
        targets_from_report(report.types, speed=speed),
        scale=deck_size / 99,
        curve=curve,
        cedh_class=report.cedh_class,
    )

    # The deck-relative evidence the add side already argues with, handed to
    # the cut side so the two stop contradicting each other (Demonic Tutor
    # was suggested at rank 3 and offered as a cut in the same session):
    # which cards hold a *complete* combo line together, and whether the
    # deck sits at its bracket's tutor floor. The combo lookup is the local
    # graph query the combo channel uses; an unreachable Spellbook fallback
    # must not break cuts, hence the guard.
    combo_partners: dict[str, list[str]] = {}
    complete_lines = 0
    try:
        from .spellbook import deck_combos

        included = deck_combos(list(deck), deck_card_names or None)["included"]
        complete_lines = len(included)
        deck_ids = set(deck)
        for combo in included:
            for oid, piece in zip(combo.uses, combo.card_names, strict=False):
                if oid in deck_ids and oid not in combo_partners:
                    combo_partners[oid] = [n for n in combo.card_names if n != piece]
    except Exception as exc:  # noqa: BLE001 — an external API must not break cuts
        log.warning("cuts.combos_failed", error=str(exc))

    from math import ceil

    from .suggestions import _tutor_target

    tutor_target = _tutor_target(
        speed, deck_size_scale=deck_size / 99, complete_combos=complete_lines
    )
    # The floor defends the *best* tutors the target claims, by playrate —
    # a deck one tutor over its floor should be offered its weakest tutor,
    # never Demonic Tutor (observed: at 6 tutors against a floor of 5, the
    # boolean version left the best one cuttable and the cut list picked
    # it). Below or at the floor this defends every tutor; above it, the
    # surplus tail stays honest cut material.
    # Nonland only, mirroring `_TUTOR_TO_NONLAND` in graph.py: fetch lands
    # carry `Role.TUTOR` too, at fetch-land playrates — left in, the floor
    # defended Misty Rainforest through Scalding Tarn and left the deck's
    # actual best tutor cuttable (observed live, the exact card this
    # defence exists for).
    lookup = {card["oracle_id"]: card for card in cards}
    deck_tutors = sorted(
        (
            row["oracle_id"]
            for row in card_roles
            if Role.TUTOR in _typed(row["roles"])
            and not (lookup.get(row["oracle_id"]) or {}).get("is_land")
        ),
        key=lambda oid: -((lookup.get(oid) or {}).get("playability") or 0.0),
    )
    tutor_floor_ids = set(deck_tutors[: ceil(tutor_target - 1e-9)])

    # Cut scoring gets the same theme prefs the adds side already receives
    # (`pinned_themes`/`excluded_themes`, above) — resolved to per-card shares
    # over the deck's own oracle ids, once per list.
    cuts = score_cuts(
        cards,
        card_roles,
        card_resources,
        wanted,
        template,
        protected=defended,
        pinned_share=_theme_shares(pinned_themes, list(deck)),
        excluded_share=_theme_shares(excluded_themes, list(deck)),
        # The stranded prosecution reads production off the same balance the
        # report shows — a resource absent from it has no producers either.
        produced_counts={row.resource: row.produced for row in report.balance},
        combo_partners=combo_partners,
        tutor_floor_ids=tutor_floor_ids,
    )

    # The same defences, for the same reason: a card too weak to bare-cut but
    # still commander/keep, tutor-floor, or combo-locked is too weak to trade
    # away as well. These never join `cuts` — they exist only for `pair_swaps`
    # below to reach when a short bucket hides a genuinely bad card.
    upgrades = upgrade_candidates(
        cards,
        card_roles,
        template,
        protected=defended,
        tutor_floor_ids=tutor_floor_ids,
        combo_partners=combo_partners,
    )

    adds = suggest(
        deck_oracle_ids,
        deck_card_names,
        quantities=deck,
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        limit=limit,
        pool_filter=pool_filter,
        speed=speed,
        overrides=overrides,
        curve=curve,
        type_overrides=type_overrides,
        focus=focus,
        pinned_themes=pinned_themes,
        excluded_themes=excluded_themes,
        excluded=excluded,
        identity=identity,
        deck_size=deck_size,
        # Same deck, quantities, speed, overrides, and commander as the
        # diagnose above — handing it over halves the round trips /swaps pays.
        diagnostics=report,
        allow_network=allow_network,
    )

    from .graph import cards_role_weights

    add_ids = [s.oracle_id for s in adds.suggestions]
    add_roles = cards_role_weights(add_ids)
    cut_roles = {row["oracle_id"]: row["roles"] for row in card_roles}

    swaps = pair_swaps(
        [
            {
                "oracle_id": s.oracle_id,
                "name": s.name,
                "playability": s.playability,
                "game_changer": s.game_changer,
            }
            for s in adds.suggestions
        ],
        cuts,
        add_roles,
        cut_roles,
        per_add=per_add,
        # The same rows the composition report shows, so a swap can answer the
        # shortfall the reader is looking at rather than only preserving shape.
        buckets=report.buckets,
        upgrades=upgrades,
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
    # cEDH board-wipe coverage discount (Task C2, cEDH Pro round) — see the
    # identical comment in `score_cuts`; the same reasoning applies to a
    # single add/remove preview.
    cedh = is_cedh_template(template)
    entries = [
        (discount_board_wipe(_typed(row["roles"]), cedh=cedh), row["qty"]) for row in card_roles
    ]
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
        after_entries.append((discount_board_wipe(_typed(add_roles), cedh=cedh), 1))
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


def _job_match(
    target_themes: dict[str, float],
    target_roles: dict[str, float],
    candidate_themes: dict[str, float],
    candidate_roles: dict[str, float],
) -> float:
    """How much of the target's job the candidate does.

    Overlap by `min` on both layers, so a candidate is credited for what it
    shares and never for exceeding it: a card reading `wheels` at 1.0 against
    a target's 0.77 does the target's wheel job completely, not 130% of it.
    Themes carry the "same effect" signal — `wheels` is the whole reason Wheel
    of Fortune answers Windfall — and roles the coarser "same slot" one. Both
    layers are already on a 0-1 scale per member, so a plain sum needs no
    weighting between them.

    Measured on the live corpus, Windfall's alternatives out of a Kess deck:
    Wheel of Fortune 2.11, the next twelve candidates 1.34 down to 1.00, and
    the role-only matches a flat 0.70. The signal separates cleanly.
    """
    themes = sum(
        min(target_themes[theme_id], candidate_themes[theme_id])
        for theme_id in target_themes.keys() & candidate_themes.keys()
    )
    roles = sum(
        min(target_roles[role], candidate_roles[role])
        for role in target_roles.keys() & candidate_roles.keys()
    )
    return round(themes + roles, 4)


def find_replacements(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    target_oracle_id: str,
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    speed: float = 0.5,
    overrides: dict | None = None,
    curve: dict | None = None,
    type_overrides: dict | None = None,
    limit: int = 10,
    pool_filter: PoolFilter | None = None,
    pinned_themes: list[str] | None = None,
    excluded_themes: list[str] | None = None,
    excluded: list[str] | None = None,
    identity: list[str] | None = None,
    deck_size: int = 99,
    allow_network: bool = True,
) -> dict:
    """Alternatives to one card the user has marked.

    The mechanism is simply running the normal channels against the deck *minus*
    the marked card: `_HARD_FILTER` excludes whatever deck list it is handed, so
    the card stops being filtered out as "already in the deck" and its own
    replacements become reachable. No new query is needed.

    `allow_network`, `identity`, `pinned_themes`, and `excluded_themes` thread
    straight through to the `suggest()` call below.
    """
    from .graph import cards_role_weights, cards_theme_fits, deck_card_roles, fetch_deck
    from .suggestions import effective_commanders, suggest

    # Any seat in the command zone is refused, not just the anchor's — a
    # co-commander is no more replaceable than the commander itself.
    if target_oracle_id in effective_commanders(commander_oracle_id, commander_oracle_ids):
        return {"target": None, "replacements": [], "notes": ["The commander cannot be replaced."]}

    deck = quantities or dict.fromkeys(deck_oracle_ids, 1)
    cards = fetch_deck(deck)
    # As cast, not as printed — the shape deltas below bucket the deck's own
    # rows, and the adds arrive already discounted from `suggest`.
    from .eminence import apply_discount, discount_for

    apply_discount(
        cards, discount_for(cards, effective_commanders(commander_oracle_id, commander_oracle_ids))
    )
    card_roles = deck_card_roles(deck)

    target = next((c for c in cards if c["oracle_id"] == target_oracle_id), None)
    if target is None:
        return {"target": None, "replacements": [], "notes": ["That card is not in the deck."]}

    target_role_weights = {
        role: weight
        for row in card_roles
        if row["oracle_id"] == target_oracle_id
        for role, weight in row["roles"].items()
        if weight
    }
    target_roles = set(target_role_weights)

    # The one edge in the layer that knows two cards do the same job. Without
    # it, retrieval here is purely deck-gap driven and the answer to "what
    # else does this" is "whatever this deck was short of anyway" — measured
    # live on a Kess deck, Windfall's alternatives were two cantrips and a
    # cost reducer, while Wheel of Fortune (`wheels` at fit 1.0 against
    # Windfall's 0.77) never entered the pool the theme channel draws from,
    # because a Kess list with one wheel in it does not detect `wheels`
    # (`DETECTED_THEME_LIMIT` is 2, and this deck's two were `tutors` and
    # `treasure`). Pinning the target's own strongest themes is what makes
    # CHANNEL_THEMES reach for them.
    #
    # A derived pin never overrides a stated exclusion. `_resolve_theme_prefs`
    # resolves pin-versus-exclude in the pin's favour, which is right when
    # both came from the user and wrong here: the exclusion is the user's,
    # this pin is the advisor's guess about one slot.
    target_fits = cards_theme_fits([target_oracle_id]).get(target_oracle_id, {})
    ruled_out = set(excluded_themes or ())
    derived_pins = [
        theme_id
        for theme_id, _ in sorted(
            (
                (theme_id, fit)
                for theme_id, fit in target_fits.items()
                if fit >= REPLACE_THEME_FLOOR and theme_id not in ruled_out
            ),
            key=lambda item: -item[1],
        )[:REPLACE_THEME_LIMIT]
    ]

    remaining = [oid for oid in deck_oracle_ids if oid != target_oracle_id]
    remaining_names = [n for n in deck_card_names if n != target["name"]]

    report = suggest(
        remaining,
        remaining_names,
        quantities={oid: qty for oid, qty in deck.items() if oid != target_oracle_id},
        commander_oracle_id=commander_oracle_id,
        commander_oracle_ids=commander_oracle_ids,
        limit=max(limit * 6, 60),
        pool_filter=pool_filter,
        speed=speed,
        overrides=overrides,
        curve=curve,
        type_overrides=type_overrides,
        pinned_themes=list(dict.fromkeys([*(pinned_themes or []), *derived_pins])),
        excluded_themes=excluded_themes,
        excluded=excluded,
        identity=identity,
        deck_size=deck_size,
        allow_network=allow_network,
    )

    # The target is reachable as a candidate here — `remaining` drops it from
    # the deck precisely so `_HARD_FILTER` stops vetoing it — so it has to be
    # dropped explicitly, or the card is offered as its own replacement.
    report.suggestions = [s for s in report.suggestions if s.oracle_id != target_oracle_id]

    candidate_roles = cards_role_weights([s.oracle_id for s in report.suggestions])
    candidate_themes = cards_theme_fits([s.oracle_id for s in report.suggestions])

    # Commander-tier type targets only: this path never diagnoses the deck
    # itself, so there is no theme profile and no typal profile to condition
    # on. The gap is the theme/tribe tier, not the axis — a 40-creature deck
    # still shows its creature rows moving — and threading a full diagnose
    # through here costs a round trip /replace was shaped to avoid. The same
    # gap skips `cedh_class` (Task E follow-up, cEDH Pro round) for the
    # identical reason: classifying a deck needs the `card_roles`/
    # `resources_by_card` a diagnose-shaped fetch produces, which this path
    # does not make. A bracket-5 /replace therefore scores against the
    # pooled `CEDH` template rather than the deck's own measured turbo/
    # midrange/stax corridor — `conditioned_template`'s `cedh_class` stays at
    # its `None` default below, on purpose, recorded here rather than hidden,
    # the same way the theme/tribe gap just above is.
    from .type_targets import conditioned_template, resolve_type_targets

    commander_name = None
    if commander_oracle_id:
        rows = fetch_deck({commander_oracle_id: 1})
        commander_name = rows[0]["name"] if rows else None
    scale = deck_size / 99
    type_targets, _ = resolve_type_targets(commander_name, {}, speed=speed, scale=scale)
    template = conditioned_template(
        speed,
        overrides,
        type_targets,
        scale=scale,
        curve=curve,
        type_overrides=type_overrides,
    )
    notes: list[str] = []

    scored: list[tuple[float, Replacement]] = []
    for suggestion in report.suggestions:
        roles = candidate_roles.get(suggestion.oracle_id, {})
        shared = target_roles & {r for r, w in roles.items() if w}

        # Shape-preserving by construction: a replacement that shares no role
        # with what it replaces is not a replacement, it is a different card.
        if target_roles and not shared:
            continue

        match = _job_match(
            target_fits, target_role_weights, candidate_themes.get(suggestion.oracle_id, {}), roles
        )
        scored.append(
            (
                match,
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
                ),
            )
        )

    if not scored and target_roles:
        notes.append(
            f"Nothing sharing a role with {target['name']} cleared this deck's colours and budget."
        )
    if not target_roles:
        notes.append(
            f"{target['name']} fills no role the graph knows about, so "
            "replacements cannot be shape-matched."
        )

    # Job match first: this endpoint is asked "what else does what this card
    # does", and that question is answered by the theme and role layers, not
    # by the deck's shape. Shape was the primary key and could not work —
    # `penalty_after` is a continuous float in the tens that two candidates
    # essentially never tie on, so the `-score` term below it was dead code
    # and 1%-level shape noise ordered the whole answer. Measured live, that
    # put Wheel of Fortune fifth among Windfall's alternatives while it held
    # the highest score in the list. Shape stays as the tiebreak it can
    # actually serve as: among cards that do the same job, take the one that
    # leaves the deck in better shape, and among those, the stronger card.
    scored.sort(
        key=lambda item: (
            -item[0],
            item[1].delta.penalty_after if item[1].delta else 0.0,
            -item[1].score,
        )
    )
    out = [replacement for _, replacement in scored]

    return {"target": target, "replacements": out[:limit], "notes": notes}
