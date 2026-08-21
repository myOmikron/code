"""Deck themes, derived from the closed vocabulary.

A theme is a weighted expression over `Resource`, not a label an LLM assigns. It
is therefore auditable, adjustable without re-running extraction, and scoreable
against EDHREC's theme pages. See `docs/composition.md`.

Two details make the difference between a theme layer that discriminates and one
that calls everything "spellslinger":

**Resources are expanded through the hierarchy before matching.** A Treasure
producer must count toward an artifacts theme via
`treasure -> artifact_token -> artifact_matters`. Skipping the expansion halves
every theme built on a broad resource.

**Resources are weighted by inverse document frequency.** Corpus counts vary
tenfold — `evasion` appears on 5,773 cards, `landfall_trigger` on 646. A plain
dot product would treat "has evasion" as evidence as strong as "triggers on
landfall", and every creature would read as an aggro card. IDF makes a rare
resource the discriminating signal it actually is.

Themes stay in Python rather than becoming graph nodes: `theme_fit` is
arithmetic over resources already fetched for diagnostics, and nodes would mean
a full rebuild every time a definition is edited.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field

from .vocabulary import Resource as R
from .vocabulary import resource_ancestors


@dataclass(frozen=True, slots=True)
class Theme:
    id: str
    label: str
    # At least one of these must be present or the card scores zero. The gate
    # stops a deck's incidental card draw from reading as every draw-adjacent
    # theme at once.
    requires_any: tuple[R, ...]
    weights: dict[R, float] = field(default_factory=dict)
    why: str = ""
    # Which side of the bridge the gate reads.
    #
    #   "cares"     payoff-defined. A landfall deck is one with landfall
    #               payoffs; ramp spells *produce* landfall triggers, and a
    #               deck with eight of them is not a landfall deck.
    #   "produces"  supply-defined. A control deck is one that *has*
    #               counterspells — nothing in Magic "cares about" a
    #               counterspell, so a payoff gate would never fire.
    #   "either"    both sides count. Some archetypes are defined by the loop
    #               rather than by one end of it: a +1/+1 counters deck is one
    #               that puts counters out *and* one that cares they are there,
    #               and picking a side loses whichever half a given commander
    #               happens to sit on.
    #
    # "either" is not a superset of "cares" in effect, but it is in membership,
    # so it is safe where "produces" is not — flipping `counters` from cares to
    # produces gains 48 top-500 commanders and *darkens two* (Hamza, Pearl-Ear)
    # that only pay counters off. Prefer "either" over flipping.
    gate_on: str = "cares"
    # The gate for *retrieval* — the FITS_THEME edges the theme channel and
    # the exclusion pass read — where it differs from detection. Detection
    # asks "is this deck the theme": a deck of ramp spells is not a landfall
    # deck, so the gate reads the cares side. Retrieval asks "does this card
    # belong in a deck that is" — and there the produces side is often the
    # point: the fetches and extra land drops a landfall deck runs more of
    # than anyone else were invisible to their own theme's channel. None
    # means the two questions share `gate_on`.
    retrieve_on: str | None = None


def _t(id, label, requires_any, weights, why, gate_on="cares", retrieve_on=None) -> Theme:
    return Theme(
        id=id,
        label=label,
        requires_any=tuple(requires_any),
        weights=weights,
        why=why,
        gate_on=gate_on,
        retrieve_on=retrieve_on,
    )


# A theme is a *strategy*, not a deck component. `card_advantage`, `control` and
# `voltron` were tried and removed: the first two are composition buckets the
# quota system already measures, and `card_draw` sits on 6,898 cards, so as a
# theme it fired on nearly everything and drowned the real ones at ~35% of every
# profile. `voltron` mis-gated — Teferi's Protection produces
# `commander_protection`, but that is protection, not voltron, and equipment on
# a commander is not something the vocabulary models.
#
# Defined only where the graph has the edges to support them. This used to be a
# hand-maintained list of which resources were still empty; it went stale, and
# themes stayed blocked long after the data arrived to support them.
# `unsupported_weights` checks it at build time instead.
THEMES: dict[str, Theme] = {
    "landfall": _t(
        "landfall",
        "Landfall",
        [R.LANDFALL_TRIGGER, R.EXTRA_LAND_DROP],
        {
            R.LANDFALL_TRIGGER: 1.0,
            R.EXTRA_LAND_DROP: 0.9,
            R.LAND_RAMP: 0.6,
            R.GRAVEYARD_LAND: 0.4,
        },
        "Cards that trigger on lands entering, and the effects that put them there.",
        # Retrieval takes both sides: a pinned landfall theme that could not
        # answer with a fetchland, Azusa or Exploration was a channel that
        # knew the payoffs and none of the fuel. Detection stays cares-gated
        # — the eight-ramp-spells deck is still not a landfall deck.
        retrieve_on="either",
    ),
    "aristocrats": _t(
        "aristocrats",
        "Aristocrats",
        [R.DEATH_TRIGGER, R.SACRIFICE_OUTLET, R.FREE_SACRIFICE_OUTLET],
        {
            R.DEATH_TRIGGER: 1.0,
            R.FREE_SACRIFICE_OUTLET: 0.9,
            R.SACRIFICE_OUTLET: 0.8,
            R.CREATURE_TOKEN: 0.5,
            R.LIFELOSS_OPPONENT: 0.4,
            R.RECURSION_TO_BATTLEFIELD: 0.3,
        },
        "Creatures dying on purpose, and the payoffs that make it pay.",
    ),
    "blink": _t(
        "blink",
        "Blink",
        [R.BLINK, R.ETB_TRIGGER],
        {R.BLINK: 1.0, R.ETB_TRIGGER: 0.7, R.LTB_TRIGGER: 0.3},
        "Re-using enter-the-battlefield triggers.",
    ),
    # Two-sided: 3,114 cards *produce* `plus_one_counter` and only 1,301 care
    # about it, so a payoff gate could not see a commander that only makes them.
    # Measured on the top 500: cares fires 28 / 12 newly, produces 76 / 23 but
    # **darkens Hamza and Pearl-Ear**, either 83 / 25 and darkens none.
    #
    # The size risk was checked rather than assumed, because `card_advantage`
    # was deleted for firing on ~35% of every profile. Over 20 EDHREC proxy
    # decks this takes a mean 11.9% share, exceeds 30% on exactly one — Atraxa,
    # which is a counters deck and barely moves (84.4% -> 85.3%) — and displaces
    # the correct top theme on none.
    "counters": _t(
        "counters",
        "+1/+1 counters",
        [R.PLUS_ONE_COUNTER, R.PROLIFERATE],
        {R.PLUS_ONE_COUNTER: 1.0, R.PROLIFERATE: 0.8, R.POWER_BOOST: 0.3},
        "Counters accumulating, and the effects that multiply them.",
        gate_on="either",
    ),
    "tokens": _t(
        "tokens",
        "Tokens",
        [R.CREATURE_TOKEN, R.TOKEN_COPY],
        {R.CREATURE_TOKEN: 1.0, R.TOKEN_COPY: 0.8, R.POPULATE: 0.6, R.POWER_BOOST: 0.3},
        "Going wide, and the anthems and payoffs that reward it.",
    ),
    "reanimator": _t(
        "reanimator",
        # Named for both halves it spans. Labelled "Graveyard" alone, a deck
        # built to cheat fatties into play read its own strategy back as
        # something broader and concluded reanimator was not modelled at all —
        # while the theme was firing at 43% under a name that hid it. The id
        # stays `reanimator`: it is what the preferences and the FITS_THEME
        # edges are keyed on, and the top weight is recursion to battlefield.
        "Graveyard & reanimator",
        # The gate is the creature axis, deliberately. `recursion_to_battlefield`
        # stays in the weights below but left the gate: artifact and enchantment
        # recursion produce it too, so with retrieval reading either side it let
        # Dance of the Manse — which returns no creature — into a deck that
        # wants creatures back. Cards that do reanimate creatures are unaffected;
        # Tagger types them `reanimate-creature`, which now carries
        # `graveyard_creature` itself.
        [R.GRAVEYARD_CREATURE, R.SELF_MILL],
        {
            R.RECURSION_TO_BATTLEFIELD: 1.0,
            R.GRAVEYARD_CREATURE: 0.8,
            R.SELF_MILL: 0.7,
            R.DISCARD_OWN: 0.6,
            R.RECURSION_TO_HAND: 0.4,
            R.COMMANDER_RECURSION: 0.4,
        },
        "Filling the graveyard on purpose and cheating things back out of it.",
        # Retrieval reads either side, the landfall fix applied to the same
        # shape of problem: Entomb and Buried Alive *make* the graveyard a
        # reanimator deck wants and care about nothing, so a cares-only gate
        # left the deck's own enablers unreachable by its own theme channel.
        # Detection stays on cares — owning Entomb does not make a deck a
        # reanimator deck; wanting what is in the graveyard does.
        retrieve_on="either",
    ),
    "spellslinger": _t(
        "spellslinger",
        "Spellslinger",
        [R.STORM_COUNT, R.COPY_SPELL, R.MAGECRAFT_TRIGGER, R.PROWESS_TRIGGER],
        {
            R.MAGECRAFT_TRIGGER: 1.0,
            R.PROWESS_TRIGGER: 0.9,
            R.COPY_SPELL: 0.8,
            R.STORM_COUNT: 0.6,
            R.GRAVEYARD_INSTANT_SORCERY: 0.6,
            R.CAST_TRIGGER: 0.4,
        },
        "Instants and sorceries as the engine rather than the support.",
    ),
    "artifacts": _t(
        "artifacts",
        "Artifacts",
        [R.ARTIFACT_MATTERS, R.ARTIFACT_TOKEN, R.TREASURE],
        {
            R.ARTIFACT_MATTERS: 1.0,
            R.ARTIFACT_TOKEN: 0.8,
            R.TREASURE: 0.6,
            R.MANA_ROCK: 0.4,
            R.POWERSTONE: 0.4,
        },
        "Artifact count as a resource in itself.",
    ),
    # Separate from `artifacts`, though every Vehicle is one. The two come apart
    # in the case that motivated this: a commander whose EDHREC page is mostly
    # vehicles, in a deck that plays none of them. Folded into `artifacts` there
    # is no way to say "not the vehicles" without also saying "not the
    # artifacts", which for such a commander is the whole deck.
    #
    # One resource, deliberately. The Vehicles arrive structurally off the type
    # line (202 cards) and the payoffs from `synergy-vehicle` and
    # `animate-vehicle`, which the closure measures at 97 non-Vehicle cards —
    # crew enablers, cost reducers, Mech Hangar. Nothing here reaches for
    # `creature_token` or `artifact_matters` to pad the weights: both would let
    # decks that make bodies or play artifacts read as a vehicles deck, which is
    # exactly the false positive this theme exists to let people turn off.
    "vehicles": _t(
        "vehicles",
        "Vehicles",
        [R.VEHICLE_MATTERS],
        {R.VEHICLE_MATTERS: 1.0},
        "Vehicles, and the crew that turns them on.",
        # Both sides: a deck of Vehicles supplies it, a deck of crew payoffs
        # wants it, and a Vehicle commander sits on the supply side alone.
        gate_on="either",
    ),
    "treasure": _t(
        "treasure",
        "Treasure & ritual mana",
        [R.TREASURE, R.RITUAL_MANA],
        {R.TREASURE: 1.0, R.RITUAL_MANA: 0.8, R.POWERSTONE: 0.6, R.UNTAP_LAND: 0.4},
        "Bursts of mana rather than steady ramp.",
    ),
    "lifegain": _t(
        "lifegain",
        "Lifegain",
        [R.LIFEGAIN, R.LIFEGAIN_TRIGGER],
        {R.LIFEGAIN_TRIGGER: 1.0, R.LIFEGAIN: 0.8, R.FOOD: 0.5, R.LIFE_PAYMENT: 0.3},
        "Life total as a resource, and the payoffs for gaining it.",
    ),
    "aggro": _t(
        "aggro",
        "Combat",
        [R.ATTACK_TRIGGER, R.COMBAT_DAMAGE_TRIGGER, R.EXTRA_COMBAT],
        {
            R.EXTRA_COMBAT: 1.0,
            R.COMBAT_DAMAGE_TRIGGER: 0.9,
            R.ATTACK_TRIGGER: 0.8,
            R.EVASION: 0.4,
            R.POWER_BOOST: 0.4,
            R.HASTE_GRANT: 0.4,
        },
        "Winning through the combat step.",
    ),
    "mill": _t(
        "mill",
        "Mill",
        [R.MILL_OPPONENT],
        {R.MILL_OPPONENT: 1.0, R.EXILE_FROM_GRAVEYARD: 0.3},
        "Attacking libraries rather than life totals.",
        gate_on="produces",
    ),
    "group_slug": _t(
        "group_slug",
        "Group slug",
        [R.LIFELOSS_OPPONENT],
        {R.LIFELOSS_OPPONENT: 1.0, R.DISCARD_OPPONENT: 0.5, R.GOAD: 0.5},
        "Damage that hits the whole table.",
        gate_on="produces",
    ),
    "untap_combo": _t(
        "untap_combo",
        "Untap combo",
        [R.UNTAP_PERMANENT, R.UNTAP_CREATURE, R.UNTAP_ARTIFACT, R.UNTAP_LAND],
        {
            R.UNTAP_PERMANENT: 1.0,
            R.UNTAP_CREATURE: 0.9,
            R.UNTAP_ARTIFACT: 0.9,
            R.UNTAP_LAND: 0.9,
            R.FREE_SACRIFICE_OUTLET: 0.4,
            R.RITUAL_MANA: 0.3,
        },
        "Untap effects, the backbone of most infinite loops.",
        gate_on="produces",
    ),
    # Deleted, then restored with the dead weight removed — both moves were
    # measured. `tribal_lord` (zero edges, weight 1.0) inflated the ceiling 12x
    # and suppressed the theme entirely; the first fix deleted the theme on the
    # argument that `deck_typal_profile` answers the question better. It answers
    # a *different* question better: which tribe. Four of the eleven commanders
    # this theme newly explains have no named tribe for that axis to see —
    # Morophon picks his type at game time, Tiamat fetches Dragons with no
    # CARES_ABOUT_TYPE edge — and for them "typal matters" is the complete
    # answer, not a coarse one. The two layers coexist: this says *typal*, the
    # profile says *Goblins*. 2,617 corpus cards (8.2%), 67 of the top 500.
    "tribal": _t(
        "tribal",
        "Typal",
        [R.TRIBAL_PAYOFF],
        {R.TRIBAL_PAYOFF: 0.9, R.CREATURE_TOKEN: 0.2},
        "Creature types as the deckbuilding constraint, whichever type it is.",
    ),
    # The four below came out of the hidden-theme study over the top 500
    # commanders, a third of which fired no theme at all. Together they explain
    # 32 commanders nothing could describe, with no commander claimed twice —
    # measured pairwise corpus overlap between them is 0-2 cards.
    "stax": _t(
        "stax",
        "Stax & prison",
        [R.RESOURCE_DENIAL, R.TAX_EFFECT],
        {
            R.RESOURCE_DENIAL: 1.0,
            R.TAX_EFFECT: 0.9,
            # Ranking only: these three change zero memberships — the two gate
            # resources alone give the identical fired set. Kept so a stax
            # deck's wipes and hate rank above its incidental cards.
            R.MASS_REMOVAL: 0.3,
            R.DISCARD_OPPONENT: 0.3,
            R.GRAVEYARD_HATE: 0.25,
        },
        "Denying the table its mana, untaps and casts, rather than answering each threat.",
        gate_on="produces",
    ),
    "legends": _t(
        "legends",
        "Legends matter",
        [R.LEGENDARY_MATTERS],
        # The ancillaries are calibration, not coverage — membership is
        # identical without them, but a single-resource map makes every fit
        # exactly 1.0, the loudest theme in the layer. Chosen from measured
        # lift over the 194 payoffs: protection 3.17x base rate, mana_fixing
        # 2.67x. (`tutor_to_battlefield` measured 0.43x — *below* base rate —
        # and was dropped from an earlier draft for it.)
        {R.LEGENDARY_MATTERS: 1.0, R.PROTECTION: 0.3, R.MANA_FIXING: 0.25},
        "Filling the 99 with legendary permanents, and the cards that count them.",
    ),
    "voltron": _t(
        "voltron",
        "Auras & Equipment",
        [R.AURA_MATTERS, R.EQUIPMENT_MATTERS],
        {
            R.AURA_MATTERS: 1.0,
            R.EQUIPMENT_MATTERS: 1.0,
            R.POWER_BOOST: 0.4,
            R.ATTACK_TRIGGER: 0.3,
            R.COMBAT_DAMAGE_TRIGGER: 0.3,
        },
        "Suiting one creature up, and the cards that count what is attached.",
    ),
    # Cares-gated like landfall, and for the same reason: the produces side is
    # every creature printed at power 4+ (4,282 structural producers — the
    # Ferocious line), and a deck with incidental fatties is not a stompy
    # deck. The gate wants the *intent* side: Ferocious-style payoffs, Fling
    # and fight effects, and the cheat effects (Ilharg, Sneak Attack, Kaalia)
    # that are only worth playing because something enormous is waiting.
    # Measured before shipping: 1,053 cares-side cards, 46 of the top 500
    # commanders, 6 sole claims (both Ghaltas, Xenagos, Loot, Eladamri,
    # Bugenhagen) — voltron's bar. The low-power polarity trap is handled at
    # extraction, not here: see `high_power_payoff` in rules.py and the
    # mapping note in tag_mapping.py.
    "stompy": _t(
        "stompy",
        "Stompy",
        [R.HIGH_POWER],
        {
            R.HIGH_POWER: 1.0,
            # Ranking only: once a deck gates, its Overruns and trample
            # grants should rank above its incidental cards.
            R.POWER_BOOST: 0.4,
            R.EVASION: 0.3,
        },
        "Big creatures as the plan — the payoffs that check for them, and the "
        "effects that cheat them out.",
    ),
    # The smallest theme in the layer, and correctly so: 84 of its members
    # carry Infect or Toxic outright and are unplayable outside the archetype.
    # Its ceiling is known exactly — 11-14 poison commanders exist in the whole
    # corpus. Atraxa and Vorinclex, Monstrous Raider are deliberately NOT
    # members: they proliferate poison but do not produce it, and a cares gate
    # here would collapse the theme into +1/+1 counters at 71% overlap.
    "poison": _t(
        "poison",
        "Infect & Toxic",
        [R.POISON_COUNTER],
        {R.POISON_COUNTER: 1.0, R.PROLIFERATE: 0.5, R.EVASION: 0.3},
        "A second life total, and the creatures that are unplayable without it.",
        gate_on="produces",
    ),
}


def expand(resources: set[R]) -> set[R]:
    """A card's resources plus every broader resource they imply."""
    out = set(resources)
    for resource in resources:
        out |= resource_ancestors(resource)
    return out


def build_idf(corpus_counts: Mapping[str, int], total_cards: int) -> dict[R, float]:
    """Inverse document frequency per resource.

    A resource on half the corpus says almost nothing about a card; one on 2%
    says a lot. Without this the common resources dominate every theme.
    """
    idf: dict[R, float] = {}

    for resource in R:
        count = corpus_counts.get(str(resource), 0)
        # **A resource with no cards scores zero, not the maximum.**
        #
        # This read `log(N / max(count, 1))` and justified it as "unseen
        # resources get the maximum weight they could earn, but the
        # `requires_any` gate means they still cannot carry a theme alone".
        # The gate reasoning is sound and the conclusion was still wrong,
        # because it only considers the *matched* side. No card can ever match
        # a resource with no edges, so the sole effect of its IDF is on the
        # theme's **ceiling** — where the maximum value silently suppresses
        # every real match.
        #
        # `tribal_lord` did exactly that. Zero edges, weighted 1.0 in the Typal
        # theme, IDF log(32029) = 10.37. Typal's ceiling went from 0.92 to
        # 11.30, and a card caring about `tribal_payoff` scored 0.043 instead
        # of 0.529 — under the 0.12 threshold. Typal fired on 0 of the 32,029
        # cards in the corpus and 0 of the 500 most popular commanders, and
        # read as a taste problem rather than a defect.
        #
        # `build_relative_idf` already excludes unpopulated resources from its
        # mean for this reason. The ceiling needed the same treatment.
        idf[resource] = math.log(total_cards / count) if count > 0 else 0.0

    return idf


def unsupported_weights(corpus_counts: Mapping[str, int]) -> dict[str, list[R]]:
    """Theme weights naming a resource the corpus has no cards for.

    Zeroing the IDF above stops an empty resource from suppressing its theme,
    but a theme whose *gate* is unpopulated still cannot fire, and one carrying
    dead weights is not measuring what its definition claims. Neither is
    visible from the outside: the theme simply returns nothing, which looks
    like a corpus with no such cards.

    Reported at build time rather than raised. A resource can be legitimately
    empty between an extraction change and the next re-ingest, and refusing to
    build the theme layer over it would be worse than saying so.
    """
    unsupported: dict[str, list[R]] = {}

    for theme_id, theme in THEMES.items():
        dead = [
            resource
            for resource in (*theme.weights, *theme.requires_any)
            if corpus_counts.get(str(resource), 0) == 0
        ]
        if dead:
            unsupported[theme_id] = sorted(set(dead), key=str)

    return unsupported


# A single resource above this share of a theme's ceiling is load-bearing enough
# that its corpus count decides whether the theme works at all. `tribal_lord` at
# 92% was fatal; `extra_combat` at 47% of aggro's ceiling on 45 cards is not
# fatal but compresses every aggro fit into [0.136, 0.667] and parks 1,248 of
# 3,184 firing cards on one value.
CEILING_DOMINANCE = 0.40


def dominant_weights(idf: Mapping[R, float]) -> dict[str, list[tuple[R, float]]]:
    """Weights carrying an outsized share of their theme's ceiling.

    The general form of the Typal bug. A theme's fit is normalised by the sum of
    `weight * idf` over *all* its weights, so a rare resource with a high weight
    dominates that sum and pushes every real match toward zero — whether or not
    the resource is empty. `unsupported_weights` catches only the zero case;
    this catches the near-zero one, which is the same failure with a survivor.
    """
    flagged: dict[str, list[tuple[R, float]]] = {}

    for theme_id, theme in THEMES.items():
        ceiling = sum(weight * idf.get(r, 0.0) for r, weight in theme.weights.items())
        if ceiling <= 0:
            continue
        heavy = [
            (r, weight * idf.get(r, 0.0) / ceiling)
            for r, weight in theme.weights.items()
            if weight * idf.get(r, 0.0) / ceiling > CEILING_DOMINANCE
        ]
        if heavy:
            flagged[theme_id] = sorted(heavy, key=lambda pair: -pair[1])

    return flagged


def build_relative_idf(corpus_counts: Mapping[str, int], total_cards: int) -> dict[R, float]:
    """IDF rescaled so the mean *populated* resource scores 1.0.

    `build_idf` returns raw `log(N/df)`, which is right for theme fit because a
    theme normalises against its own ceiling. The retrieval channels have no
    such ceiling: multiplying a bridge score by a raw IDF of 3.9 would make the
    channel roughly four times louder relative to EDHREC, and any change in
    recall would then be a volume change rather than a ranking change.

    Centring on the mean keeps the channel's overall magnitude where
    `WEIGHT_BRIDGE` put it and moves only the ordering *within* it. That is what
    makes the before/after eval attributable.

    Resources with no cards are excluded from the mean — an unpopulated resource
    has the maximum possible IDF and would drag the average toward a value no
    real match can reach.
    """
    raw = build_idf(corpus_counts, total_cards)
    populated = [raw[r] for r in R if corpus_counts.get(str(r), 0) > 0]

    if not populated:
        return {r: 1.0 for r in R}

    mean = sum(populated) / len(populated)
    if mean <= 0:
        return {r: 1.0 for r in R}

    return {r: raw[r] / mean for r in R}


def theme_fit(
    produces: set[R],
    cares_about: set[R],
    theme: Theme,
    idf: Mapping[R, float],
    *,
    retrieval: bool = False,
) -> float:
    """How strongly one card reads as this theme. 0 when the gate is unmet.

    The gate reads one side of the bridge (see `Theme.gate_on`); the weights
    read both, because once a card is in the theme, supplying it and paying it
    off both count. `retrieval` swaps in the theme's `retrieve_on` gate —
    membership for the suggestion channel, not deck identity.
    """
    produced = expand(produces)
    cared = expand(cares_about)
    gate_on = (theme.retrieve_on or theme.gate_on) if retrieval else theme.gate_on
    if gate_on == "produces":
        gate_set = produced
    elif gate_on == "either":
        gate_set = produced | cared
    else:
        gate_set = cared

    if not any(gate in gate_set for gate in theme.requires_any):
        return 0.0

    expanded = produced | cared
    matched = sum(
        weight * idf.get(resource, 1.0)
        for resource, weight in theme.weights.items()
        if resource in expanded
    )
    if matched <= 0:
        return 0.0

    # Normalised against the theme's own ceiling so themes with more terms are
    # not automatically stronger than focused ones.
    ceiling = sum(weight * idf.get(resource, 1.0) for resource, weight in theme.weights.items())
    return matched / ceiling if ceiling else 0.0


# How much the commander outweighs a card in the 99 when deciding what the deck
# is about. A commander is one card and picks the strategy — someone building
# Krenko is building Goblins, not burn, however many burn spells are in the
# list yet.
#
# Applied as a multiplier on the theme's deck total rather than as extra mass,
# which matters: a theme the commander fits but the deck has *no* cards for
# stays at zero instead of being conjured out of one card. A Krenko list with
# no Goblins in it is not a Goblin deck, it is a Goblin deck with a gap, and
# that is the bucket-shortfall report's job to say, not this one's.
COMMANDER_ANCHOR = 3.0


def deck_theme_profile(
    card_resources: list[tuple[set[R], set[R]]],
    idf: Mapping[R, float],
    *,
    commander: tuple[set[R], set[R]] | None = None,
) -> dict[str, float]:
    """Per-theme share of the deck, as a distribution summing to 1.

    Each entry is `(produces, cares_about)` for one card. `commander` is that
    same pair for the commander, which is *also* present in `card_resources` —
    it counts once as a card and then scales its own themes by `COMMANDER_ANCHOR`.
    """
    totals = {
        theme_id: sum(theme_fit(produces, cares, theme, idf) for produces, cares in card_resources)
        for theme_id, theme in THEMES.items()
    }

    if commander is not None:
        produces, cares = commander
        for theme_id, theme in THEMES.items():
            fit = theme_fit(produces, cares, theme, idf)
            if fit > 0:
                totals[theme_id] *= 1.0 + COMMANDER_ANCHOR * fit

    grand = sum(totals.values())
    if grand <= 0:
        return {}

    return {theme_id: value / grand for theme_id, value in totals.items() if value > 0}


# --------------------------------------------------------------------------
# Typal — the other axis
# --------------------------------------------------------------------------
#
# Creature types are not `Resource` members and must not become them: 321 of
# them would fragment the closed vocabulary the bridge joins on. They have their
# own axis (`typal.py`) and, until now, nothing consumed it — `typal_bridge`
# was a CLI helper and no theme, diagnostic or suggestion channel read it.
#
# The weight that makes this work is **payoff density**, not IDF. Measured over
# the corpus:
#
#     type      bodies  payoffs  density   type-IDF
#     Sliver       115      109     0.95       5.63
#     Dragon       421       94     0.22       4.33
#     Goblin       518       79     0.15       4.12
#     Human      4,485       81     0.018      1.97
#     Shaman       486        4     0.008      4.19
#
# IDF ranks Shaman *above* Goblin, because it measures rarity and cannot tell
# an uncommon type from a deckbuilding constraint. Density can: it asks how much
# of the type exists to reward playing the type. Sliver at 0.95 — nearly every
# Sliver is a lord — is the archetype in its purest form, and the metric finds
# it. Human at 0.018 is a type line, not a deck.

# Bodies to shrink a type's density toward the corpus mean. A type with three
# bodies and two payoffs is not a stronger archetype than Goblins, it is a small
# sample; without this, every obscure type with an incidental payoff outranks
# the real ones. This is the support-floor-plus-shrinkage fix `docs/synergy-
# metric.md` names as step A1, in its beta-binomial form.
TYPAL_PRIOR_BODIES = 50

# A payoff is direct evidence of intent; a body is circumstantial. One Goblin
# lord says more about what you are building than four Goblins do. Token makers
# sit between: creating Goblins supplies the deck without stating intent.
TYPAL_PAYOFF_WEIGHT = 4.0
TYPAL_TOKEN_WEIGHT = 2.0

# The commander picks the tribe outright, which is a stronger statement than it
# makes about a resource theme — hence the larger anchor than COMMANDER_ANCHOR.
# Caring about a type is intent; merely being one is much weaker, since a
# commander has a type line whether or not the deck cares.
COMMANDER_TYPAL_ANCHOR = 4.0
COMMANDER_TYPAL_IS_ANCHOR = 1.0

# Below this share a type is incidental — the two Elves in a deck that is not an
# Elf deck. Keeps the profile a statement rather than a census.
TYPAL_SHARE_FLOOR = 0.08


def typal_density(bodies: Mapping[str, int], payoffs: Mapping[str, int]) -> dict[str, float]:
    """How much each creature type functions as a deckbuilding constraint.

    `payoffs / bodies`, shrunk toward the corpus mean by `TYPAL_PRIOR_BODIES`
    so a type with a handful of cards cannot outrank Goblins on two payoffs.
    """
    total_bodies = sum(bodies.values())
    total_payoffs = sum(payoffs.get(t, 0) for t in bodies)
    mean = total_payoffs / total_bodies if total_bodies else 0.0

    return {
        creature_type: (payoffs.get(creature_type, 0) + TYPAL_PRIOR_BODIES * mean)
        / (count + TYPAL_PRIOR_BODIES)
        for creature_type, count in bodies.items()
    }


def deck_typal_profile(
    card_types: list[tuple[set[str], set[str], set[str]]],
    density: Mapping[str, float],
    *,
    commander_types: tuple[set[str], set[str]] | None = None,
) -> dict[str, float]:
    """Per-creature-type share of the deck, as a distribution summing to 1.

    Each entry is `(is_type, cares_about_type, makes_type)` for one card, one
    entry per copy. `commander_types` is `(is_type, cares_about_type)` for the
    commander.

    **Both terms are scaled by density.** An earlier version scaled only bodies,
    reasoning that density already encodes "this type has payoffs" so scaling
    both would double-count. That was wrong in effect: it left the two terms in
    incomparable units. Densities run ~0.15, so an unscaled payoff weight of 4.0
    made one payoff worth twenty-seven bodies rather than the four intended, and
    a Krenko list with two Dragon payoffs outranked its own eighteen Goblins.

    Density is a *specificity* weight, and applying it uniformly is what
    `theme_fit` already does with IDF across every matched resource. The corpus
    property and the deck-level count are different evidence.
    """
    # Supply and payoffs are accumulated apart so supply can gate. A deck
    # holding a Dragon lord and no Dragons is not a Dragon deck — measured on a
    # Krenko list, two Dragon payoffs against zero Dragon bodies scored 42% and
    # outranked 18 Goblins, because an ungated payoff weight of 4.0 beats
    # eighteen bodies at density 0.15. This is the `requires_any` gate the theme
    # layer already has, in its typal form.
    #
    # Token makers count as supply: Chatterfang has no Squirrels in the list and
    # is unambiguously a Squirrel deck.
    supply: dict[str, float] = {}
    payoff: dict[str, float] = {}

    for is_type, cares_type, makes_type in card_types:
        for creature_type in is_type:
            supply[creature_type] = supply.get(creature_type, 0.0) + density.get(creature_type, 0.0)
        for creature_type in makes_type:
            supply[creature_type] = supply.get(
                creature_type, 0.0
            ) + TYPAL_TOKEN_WEIGHT * density.get(creature_type, 0.0)
        for creature_type in cares_type:
            payoff[creature_type] = payoff.get(
                creature_type, 0.0
            ) + TYPAL_PAYOFF_WEIGHT * density.get(creature_type, 0.0)

    scores = {
        creature_type: value + payoff.get(creature_type, 0.0)
        for creature_type, value in supply.items()
        if value > 0
    }

    if commander_types is not None:
        commander_is, commander_cares = commander_types
        for creature_type in commander_cares:
            if creature_type in scores:
                scores[creature_type] *= 1.0 + COMMANDER_TYPAL_ANCHOR
        for creature_type in commander_is:
            if creature_type in scores:
                scores[creature_type] *= 1.0 + COMMANDER_TYPAL_IS_ANCHOR

    grand = sum(scores.values())
    if grand <= 0:
        return {}

    shares = {t: v / grand for t, v in scores.items() if v > 0}
    kept = {t: v for t, v in shares.items() if v >= TYPAL_SHARE_FLOOR}
    if not kept:
        return {}

    # Renormalise over what survived, so the reported shares still sum to 1.
    total = sum(kept.values())
    return {t: v / total for t, v in sorted(kept.items(), key=lambda kv: -kv[1])}


def consistency(profile: Mapping[str, float]) -> float:
    """How concentrated the deck's themes are, in [0, 1].

    Normalised inverse entropy. 1.0 is a deck that is entirely one thing; near 0
    is "a bit of everything", which is the failure mode that makes a deck feel
    like it does not do anything. This is the number that answers the question
    the whole project started from.
    """
    values = [v for v in profile.values() if v > 0]
    if len(values) <= 1:
        return 1.0 if values else 0.0

    entropy = -sum(v * math.log(v) for v in values)
    return 1.0 - entropy / math.log(len(values))


# Below this, a card's connection to a theme is incidental rather than real —
# one broad resource brushing a weight. Storing them would make every card a
# member of every theme and the search filter meaningless.
FIT_THRESHOLD = 0.12


def build_theme_edges() -> dict[str, int]:
    """Score every card against every theme and write FITS_THEME edges.

    Precomputed rather than derived per request: the fits are stable between
    ingests, and search needs to filter on them in Cypher rather than pulling
    30k cards into Python to sort.
    """
    import structlog

    from .diagnostics import _as_resources, resource_idf
    from .graph import all_card_resources, clear_themes, theme_stats, write_themes

    log = structlog.get_logger(__name__)
    idf = resource_idf()
    rows = []

    # Said out loud at build time. A theme resting on a resource the corpus has
    # no cards for cannot fire, and the failure is invisible from the outside —
    # it looks like a corpus with no such cards rather than a broken definition.
    from .graph import resource_corpus_counts

    counts, _ = resource_corpus_counts()
    if dead := unsupported_weights(counts):
        log.warning(
            "themes.unsupported_weights",
            themes={tid: [str(r) for r in rs] for tid, rs in dead.items()},
        )

    for card in all_card_resources():
        produces = _as_resources({r for r in card["produces"] if r})
        cares = _as_resources({r for r in card["cares_about"] if r})
        if not produces and not cares:
            continue

        fits = [
            {"theme": theme_id, "label": theme.label, "fit": round(fit, 4)}
            for theme_id, theme in THEMES.items()
            if (fit := theme_fit(produces, cares, theme, idf, retrieval=True)) >= FIT_THRESHOLD
        ]
        if fits:
            rows.append({"oracle_id": card["oracle_id"], "fits": fits})

    clear_themes()
    write_themes(rows)

    stats = theme_stats()
    log.info("themes.built", cards=len(rows), **stats)
    return stats
