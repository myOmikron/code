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


# A theme is a *strategy*, not a deck component. `card_advantage` and `control`
# were tried and removed: both are composition buckets the quota system already
# measures, and `card_draw` sits on 6,898 cards, so as a theme it fired on
# nearly everything and drowned the real ones at ~35% of every profile.
#
# `voltron` was removed with them and is back — it is defined below. The first
# attempt gated on `commander_protection`, which is protection and not voltron
# (Teferi's Protection is not a voltron card), and the vocabulary had no term
# for what is attached to a creature. `aura_matters` and `equipment_matters`
# are that term, and the theme cleared the bar in the hidden-theme study: 356
# cards, 18 of the top 500, 6 sole claims. Do not re-delete it on the strength
# of this paragraph's former self.
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
    # Gate list (`requires_any`) is untouched below and pinned byte-identical
    # by a test — this widening is weights-only (`TOP50-COVERAGE.md` gap 6,
    # the rest of it once `energy` and `superfriends` claim their own kinds).
    # `energy` and `loyalty_counter` are deliberately excluded: both now have
    # their own theme, and double-homing a resource in two themes is the
    # exact overlap failure this codebase keeps measuring and refusing
    # (`wheels`/`discard`, `enchantress`/`aura_matters`). `minus_one_counter`
    # stays out too — its own comment in vocabulary.py documents the −1/−1
    # mis-membership this would recreate.
    #
    # Weights measured down from the plan's literal `EXPERIENCE_COUNTER: 0.5`
    # / `CHARGE_COUNTER: 0.4`, per the plan's own instruction ("If the ceiling
    # shift is larger, lower the new weights and remeasure rather than
    # accepting the drift"). At the literal values, `experience_counter`'s
    # IDF (5.426 — it is rarer in the corpus than `plus_one_counter` itself)
    # made it the single largest term in the theme's own ceiling — 23.3% of
    # it, ahead of `plus_one_counter`'s 18.0% — and `charge_counter` added
    # another 15.5%, growing the ceiling 63.3% (7.140 -> 11.659) with weight
    # that a plain +1/+1 deck never touches. Measured live against the
    # stability quartet, that shift alone moved Animar to `counters 0.319`
    # (baseline 0.48, a 0.161 drop) and Mothman to 0.351 (baseline 0.51, a
    # 0.159 drop) — both decisively outside the ±0.05 bar — purely from the
    # larger denominator, with no change to either deck's own cards. Lowered
    # to **0.1 each** (ceiling growth 20.9% -> checked again at this value:
    # 8.631, +20.9%) and remeasured: Atraxa 0.826 (baseline 0.84, Δ0.014),
    # Hakbal 0.167 (Δ0.023 from 0.19), Animar 0.436 (Δ0.044 from 0.48),
    # Mothman 0.483 (Δ0.027 from 0.51) — all four inside ±0.05, all four keep
    # their baseline rank. The known cost, recorded rather than hidden: 0.1
    # sits well below `UNLOCK_WEIGHT` (0.4), so — unlike the plan's literal
    # numbers — neither resource can unlock `counters` for a commander who
    # only cares about charge or experience counters via Round A's mechanism.
    # The plan's other stated purpose survives intact: an experience or
    # charge card still scores once a deck has gated in on `plus_one_counter`
    # or `proliferate`, without the retrieval channel ever starting to offer
    # charge artifacts to every +1/+1 deck (the gate itself is untouched).
    "counters": _t(
        "counters",
        "+1/+1 counters",
        [R.PLUS_ONE_COUNTER, R.PROLIFERATE],
        {
            R.PLUS_ONE_COUNTER: 1.0,
            R.PROLIFERATE: 0.8,
            R.POWER_BOOST: 0.3,
            R.EXPERIENCE_COUNTER: 0.1,
            R.CHARGE_COUNTER: 0.1,
        },
        "Counters accumulating, and the effects that multiply them.",
        gate_on="either",
    ),
    # Supply-and-payoff, like `counters`, and for the same reason: 2,144 cards
    # *make* creature tokens and far fewer care that they are there. Under the
    # default cares gate the tokens theme asked "does this card want tokens
    # around" — and the only thing in the graph that did was a sacrifice
    # outlet. A 97-card Baylen list with 43 token makers in it gated on nine
    # cards and reported itself as 6% tokens, behind tribal and counters.
    #
    # The weights are flat-ish on purpose. `token_copy` (121 cards) and
    # `populate` (26) have enormous IDF, and at 0.8/0.6 they took 38.7% and
    # 37.0% of the theme's ceiling while `creature_token` — the resource the
    # theme is named for — carried 18.6%. That is the `tribal_lord` failure in
    # its survivable form: the theme still fired, but a card that both makes
    # and pays off tokens could not score above 0.24, and FIT_THRESHOLD is
    # 0.12. Lowered until no term dominates and the theme is mostly about the
    # resource it is about.
    "tokens": _t(
        "tokens",
        "Tokens",
        [R.CREATURE_TOKEN, R.TOKEN_COPY],
        {R.CREATURE_TOKEN: 1.0, R.TOKEN_COPY: 0.35, R.POPULATE: 0.2, R.POWER_BOOST: 0.4},
        "Going wide, and the anthems and payoffs that reward it.",
        gate_on="either",
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
        # The landfall fix, third application. A spellslinger deck's own cheap
        # spells care about nothing, so a cares-only retrieval gate left Opt,
        # Brainstorm, Manamorphose, Frantic Search and Goblin Electromancer
        # unreachable by the channel named after them: EDHREC's spellslinger
        # high-synergy list scored 2/10 and its storm list 3/10. With either,
        # 7/10 and 9/10.
        #
        # Known cost, measured before shipping: the channel goes 208 -> 6,665
        # cards, roughly twice `counters` (3,949), the widest one before this.
        # That is what the produces side of magecraft and prowess *is* — every
        # instant and sorcery at cmc 4 or less — and the fit score still ranks
        # inside it. Detection is untouched at 208. If the retrieval eval
        # regresses, this is the first thing to pull.
        #
        # Detection was tried at 208 cards -> wider twice, for Vivi Ornitier
        # (`TOP50-COVERAGE.md` gap 2): his cantrip/ritual/X-spell engine is
        # entirely supply-side, so only 4 of his top-60 pool cared about
        # storm, copy, magecraft or prowess and the theme read 0.14 instead of
        # the >=0.30 target. Both candidates were measured against the top-50
        # audit and neither shipped:
        #
        # Narrow (adding CAST_TRIGGER to requires_any, so cast-trigger
        # payoffs alone gate the theme): Vivi 0.14 -> 0.19, short of 0.30.
        # Clean on the false-positive controls (Isshin, Frodo // Sam, Caesar
        # all stayed at 0.0) but did not fix the gap it was for.
        #
        # Broad (`gate_on="either"`, the counters/tokens precedent): Vivi
        # 0.14 -> 0.48, clearing 0.30, and the three named controls stayed
        # under the 0.10 false-positive ceiling (+0.04, +0.08, +0.07). But
        # checked against the full top 50 rather than only the three named
        # commanders, the same 0.10 threshold that defines a false positive
        # is crossed by 17 of them — Kenrith, Nekusar, Ulalek, Arcades, Yuriko
        # and a dozen more with no spellslinger identity on their pages — and
        # 47 of 50 gain some spellslinger share. Detection membership goes
        # from 208 to the same 6,665-card produces-side flood the retrieval
        # gate above already accepts; at the detection gate, unlike at the
        # retrieval gate, that is the exact "calls everything spellslinger"
        # failure this file's own module docstring names as the thing a
        # theme layer must not do. Neither option is clean; both are recorded
        # here rather than shipped. See `MANA-VALUE-RESULTS.md` for the full
        # per-commander diff.
        retrieve_on="either",
    ),
    # The Y'shtola gap (`TOP50-COVERAGE.md` gap 2): mana value as its own
    # trigger, distinct from spellslinger above, which counts a spell and
    # never asks how big it is. `high_mv_payoff` is the payoff side — Y'shtola,
    # Glarb, Bello, Imoti — and `high_mv_spell_producer` the structural supply,
    # nonland noncreature cards at cmc >= 4 (see both rules' comments in
    # rules.py for the measurement behind the regex and the threshold).
    #
    # Detection stays on the default cares gate — a deck that merely contains
    # a few big spells is not the archetype, the `stompy` logic applied to
    # this axis. `retrieve_on="either"` is load-bearing, the landfall fix's
    # fourth application: the channel must be able to offer the big spells
    # themselves, not only the rare payoffs that ask for them by name.
    #
    # Ancillaries are calibration, not coverage — membership is identical
    # without them, the `keywords`/`vehicles` treatment. Chosen from measured
    # lift over the 4,572-card retrieval population (produces or cares_about
    # `high_mv_spell`): `cost_reduction` 2.10x, `copy_spell` 1.58x — a big
    # spell wants to be cheaper to get there faster, and a copied big spell is
    # twice the payoff. `land_ramp` measured 1.58x too, close enough to be
    # noise, and stays out for being the less specific story: ramp serves
    # every expensive plan, not only this one. `ritual_mana` measured *below*
    # base rate (0.54x) and `impulse_draw` under both (1.28x) — the
    # `legends`/tutor_to_battlefield precedent for a dropped candidate.
    #
    # Detection stayed thin for the anchor cases measured against the top-50
    # audit: Y'shtola, Glarb and Bello each score big_spells only through
    # their own commander card (1 card, ~0.04 share) — their EDHREC top-60
    # pools carry zero *other* cares-gated payoffs, only the structural big
    # spells the payoffs want, which the cares gate does not read at
    # detection time. That is the `stompy` tradeoff working as designed
    # rather than a bug: the retrieval channel (4,572 cards, confirmed live
    # as FITS_THEME edges) is what actually reaches those cards. See
    # `MANA-VALUE-RESULTS.md` for the full measurement.
    "big_spells": _t(
        "big_spells",
        "Big spells",
        [R.HIGH_MV_SPELL],
        {R.HIGH_MV_SPELL: 1.0, R.COST_REDUCTION: 0.4, R.COPY_SPELL: 0.3},
        "Mana value as the trigger — payoffs that want the spell to be big.",
        retrieve_on="either",
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
        # The ancillaries are calibration, not coverage — the `legends`
        # treatment, applied for the same reason and two themes late. A
        # single-resource map makes *every* member's fit exactly 1.0, which is
        # not a score but a constant, and it made Sram, Senior Edificer read
        # `vehicles 1.0` above `voltron 0.73`: he draws off Auras, Equipment
        # **and** Vehicles, and the loudest theme won on arithmetic rather
        # than on evidence. Membership is identical with or without these —
        # the gate is `requires_any`, and a weight cannot admit a card.
        #
        # Chosen from measured lift over the 301-card population, and
        # deliberately from the combat axis: a Vehicle is a thing that
        # attacks. `artifact_matters` measures higher (4.92x) and stays out
        # for the reason the theme exists — a deck that plays artifacts must
        # be able to say "not the vehicles" — and `untap_permanent` (13.29x)
        # is `untap_combo`'s own 1.0 weight.
        {
            R.VEHICLE_MATTERS: 1.0,
            R.ATTACK_TRIGGER: 0.3,
            R.COMBAT_DAMAGE_TRIGGER: 0.3,
            R.POWER_BOOST: 0.25,
        },
        "Vehicles, and the crew that turns them on.",
        # Both sides: a deck of Vehicles supplies it, a deck of crew payoffs
        # wants it, and a Vehicle commander sits on the supply side alone.
        gate_on="either",
    ),
    # The other half of the crew question, and the reason `vehicles` cannot
    # answer it alone: a Vehicle is a thing you tap creatures *for*, and there
    # is a whole family of cards that pays off the tapping itself, whatever
    # did it. Survival creatures want to end the turn tapped; Emmara, Magda
    # and Judge of Currents trigger on becoming tapped; Far Traveler, Throne
    # of the God-Pharaoh and Harvest Season count your tapped creatures.
    #
    # `landfall`'s split, for `landfall`'s reason. **Detection gates on
    # cares**: a deck of Vehicles and convoke spells is a Vehicles deck, not a
    # tap-matters deck, exactly as eight ramp spells are not landfall.
    # **Retrieval reads either side**, because what such a deck is short of is
    # the fuel — the Vehicles, the Springleaf Drums, the convoke spells that
    # tap a creature without sending it into combat. Retrieving payoffs only
    # would answer "you like tapping creatures" with more things to tap.
    #
    # 141 corpus cards on the detection gate, 834 on the retrieval gate, 8 of
    # the top 500 commanders, 1 sole claim (Kona, Rescue Beastie) — the
    # `poison` band (142 / 5 / 2), and the same argument applies: it is a small
    # theme that is the *complete* answer for the commanders it claims.
    # Largest overlap with an existing theme is `counters` at 27 of 141.
    "tap_matters": _t(
        "tap_matters",
        "Tap matters",
        [R.TAP_OWN_CREATURE],
        # Ancillaries are calibration, not coverage — the `vehicles` treatment.
        # A single-resource map scores every member exactly 1.0, which is a
        # constant rather than a score; these two put the Vehicles at the top
        # of the retrieval answer, which is where a deck asking this question
        # wants them.
        #
        # Measured lift over the 834-card retrieval population:
        # `vehicle_matters` 24.4x, `power_boost` 3.7x. Two stronger terms are
        # deliberately left out. `untap_permanent` (17.7x) is `untap_combo`'s
        # own 1.0 weight and is nearly tautological here — `tap-fuel-creature`
        # maps to both sides, so 86% of the population carries it. And
        # `artifact_matters` (2.9x) stays out for the reason `vehicles` gives
        # for refusing it: a deck that plays artifacts must be able to say
        # "not this".
        {R.TAP_OWN_CREATURE: 1.0, R.VEHICLE_MATTERS: 0.4, R.POWER_BOOST: 0.25},
        "Creatures tapped for value instead of sent to attack, and what taps them.",
        retrieve_on="either",
    ),
    # Odric, Lunarch Marshal shares keywords, Kathril, Aspect Warper turns
    # them into counters from the graveyard — the archetype's own axis rather
    # than a slice of evasion or counters (see `KEYWORD_SOUP` in
    # vocabulary.py). `gate_on` stays the default `cares`: a deck DETECTS as
    # keywords through its payoffs, plus the commander anchor when
    # Kathril/Odric leads; a deck that merely contains keyword-rich creatures
    # is not the archetype — the exact false positive `vehicles`' comments
    # warn about.
    #
    # `retrieve_on="either"` is deliberate and load-bearing, the landfall
    # precedent: the channel must be able to offer the keyword-rich bodies a
    # keywords deck runs more of than anyone, not only the payoffs Odric and
    # Kathril already are.
    "keywords": _t(
        "keywords",
        "Keywords",
        [R.KEYWORD_SOUP],
        # A single-resource map scores every member exactly 1.0 — a constant,
        # not a score, the `vehicles`/`legends` calibration tradeoff their own
        # comments document. Unlike those two, this cannot ship with only the
        # one term: `test_no_theme_rests_on_a_single_weight` exists precisely
        # to refuse it, added after `vehicles` read `1.0` above `voltron`'s
        # `0.73` on evidence a flat weight could not see past.
        #
        # So the ancillary terms are chosen now rather than deferred, from
        # measured lift over the 1,119-card population the rule and the two
        # mappings above will produce (creatures with >=2 of the twelve
        # keywords, plus the `keyword-counter` and `keyword-soup` tag
        # closures — computed directly against the bulk and the corpus, since
        # the graph carries no `keyword_soup` edges to read until Task 3's
        # rebuild): `combat_damage_trigger` 2.05x, `attack_trigger` 1.69x.
        # `evasion` measured higher (3.47x, 64% of the population) and stays
        # out for the `tap_matters`/`untap_permanent` reason: four of the
        # twelve keywords (Flying, Menace, Reach, Trample) already are
        # evasion, so the term would mostly restate the gate under another
        # name. `high_power` (2.72x, 44%) stays out too — at that share it
        # risks the ceiling dominance `extra_combat` produced in `aggro`, and
        # "big creatures" is `stompy`, a different archetype from
        # "keyword-loaded creatures". Task 3's rebuild is the first chance to
        # confirm these against real IDF; revisit here if it does not hold.
        {R.KEYWORD_SOUP: 1.0, R.COMBAT_DAMAGE_TRIGGER: 0.3, R.ATTACK_TRIGGER: 0.25},
        "Keyword breadth as a resource — Odric shares it, Kathril inherits it.",
        retrieve_on="either",
    ),
    # Supply-and-payoff, for the third time (see `counters` and `tokens`).
    # 190 cards make Treasure and 49 care about it, so a cares gate is a gate
    # on `synergy-treasure` alone: Smothering Tithe and Old Gnawbone were not
    # members, and neither was a single ritual — in a theme named for them.
    #
    # This was masked until now. `mana-sink` wrongly claimed 1,016 cards cared
    # about `ritual_mana`, which gated the theme on a broad accident instead
    # of on Treasure, and let Rogue's Passage in while Dark Ritual stayed out.
    # Fixing the mapping made the real gate visible.
    "treasure": _t(
        "treasure",
        "Treasure & ritual mana",
        [R.TREASURE, R.RITUAL_MANA],
        {R.TREASURE: 1.0, R.RITUAL_MANA: 0.8, R.POWERSTONE: 0.6, R.UNTAP_LAND: 0.4},
        "Bursts of mana rather than steady ramp.",
        gate_on="either",
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
        # The landfall fix again. Every miss in all three of EDHREC's lists —
        # voltron, equipment, auras — was an enabler rather than a payoff:
        # Swiftfoot Boots, Lightning Greaves, Rancor, Sword of the Animist.
        # They *are* the Equipment and the Auras, so they sit on the produces
        # side that a cares-only gate never reads, and a voltron deck's
        # channel could not reach the cards a voltron deck is made of.
        # Measured: 5/10 -> 7/10, 8/10 -> 9/10, 6/10 -> 7/10; channel
        # 370 -> 2,183, inside the band `reanimator` (3,241) already occupies.
        # Detection stays on cares — owning a Rancor does not make a deck
        # voltron; counting what is attached does.
        retrieve_on="either",
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
    # Nekusar's own top EDHREC tag (`TOP50-COVERAGE.md` gap 1, 5.3k decks) and
    # 43 of the top 50's pages. Cares-gated by default — a group-hug deck of
    # Howling Mines is not a wheels deck any more than eight ramp spells are a
    # landfall deck; the punishers (Nekusar, Underworld Dreams, Fate
    # Unraveler) are the intent. `retrieve_on="either"` is load-bearing, the
    # landfall fix applied again: the channel must be able to offer the
    # wheels themselves (Wheel of Fortune, Windfall, Howling Mine), not only
    # the punishers that want them cast.
    #
    # Round A's commander-anchored unlock (`SUPPLY-GATE-RESULTS.md`) is what
    # makes this theme work for a Nekusar-led deck at detection time, not a
    # special case here: Nekusar cares about `opponent_draw` directly, so his
    # own wheel *producers* — the deck's actual Wheel of Fortune, Windfall,
    # Reforge the Soul copies — count as detection evidence for a deck built
    # around him, the same mechanism that rescues Y'shtola's big spells.
    #
    # Weight rationale, read against `UNLOCK_WEIGHT` (0.4): `opponent_draw`
    # sits at 1.0, so any commander caring about it (a punisher) unlocks the
    # theme automatically, as intended. `discard_opponent` is the plan's
    # named second weight at 0.5 — above the floor on paper, but it can never
    # actually unlock anything: nothing in the corpus produces a `CARES_ABOUT`
    # edge to `discard_opponent` (only `produces`, via the `hand-disruption`
    # tag mapping — see `vocabulary.py`'s `SUPPLY_ONLY` comment), so the
    # unlock check's cares-only read never sees it. The third weight,
    # `discard_own` (measured lift below), is capped at 0.3 — deliberately
    # *below* the floor despite its lift being the strongest of the three
    # candidates, because `discard_own` genuinely is on the cares side for an
    # unrelated archetype (hellbent, madness): a Tinybones-style commander who
    # cares about emptying their own hand is not a wheels deck, and letting
    # it unlock this theme would flood `wheels` for that archetype the exact
    # way `creature_token` at 0.2 flooded `tribal` for Caesar and Breya before
    # `UNLOCK_WEIGHT` existed.
    #
    # Ancillary measured over the 109-card retrieval population (`produces`
    # or `cares_about` `opponent_draw`, the union the payoff and producer
    # rules build): `discard_own` 3.958x corpus rate (19/109 vs 1,411/32,041),
    # `mill_opponent` 3.278x (3/109 vs 269/32,041), `lifeloss_opponent`
    # 2.170x (19/109 vs 2,574/32,041). All three clear base rate — none
    # dropped on that account, unlike `ritual_mana` in `big_spells` — but only
    # the single strongest (`discard_own`) is kept, per the plan's "at most
    # one more ancillary": a wheel effect discards the whole table's hand on
    # its way to refilling it, so a deck built around that also runs the
    # discard-payoff cards (madness, Wonder) that turn its own wheels into a
    # second upside.
    "wheels": _t(
        "wheels",
        "Wheels",
        [R.OPPONENT_DRAW],
        {R.OPPONENT_DRAW: 1.0, R.DISCARD_OPPONENT: 0.5, R.DISCARD_OWN: 0.3},
        "Everyone drawing extra cards, and the punishers who profit from it.",
        retrieve_on="either",
    ),
    # Arcades, the Strategist is the worst reader in the top 50 — 14/61
    # themed, no concept for "toughness matters" or Defender at all
    # (`TOP50-COVERAGE.md` gap 4). Cares-gated like `stompy`, its explicit
    # template: the produces side is 1,072 structural Defenders/big-toughness
    # bodies (`high_toughness_producer` in rules.py) and a deck with
    # incidental fatties is not a defenders deck — the gate wants the intent
    # side, Arcades- and High Alert-shaped payoffs. `retrieve_on="either"` is
    # load-bearing, the `landfall`/`wheels`/`voltron` fix applied again: the
    # channel must be able to offer the Walls themselves, not only the cards
    # that pay them off.
    #
    # Ancillary: none of the plan's three named candidates survive measured
    # lift over the 1,088-card retrieval population (`produces` or
    # `cares_about` `high_toughness`) — `etb_trigger` 1.027x (195/1,088 vs
    # 5,590/32,041, indistinguishable from noise), `protection` 0.802x
    # (39/1,088 vs 1,432/32,041, below base rate), `tax_effect` 0.712x
    # (8/1,088 vs 331/32,041, below base rate). Per the plan's own "drop what
    # measures below base rate", two are out outright and the third is too
    # weak to call a real signal. Measuring further rather than shipping a
    # weak or single-resource theme (`test_no_theme_rests_on_a_single_weight`
    # requires a second weight regardless): `mana_dork` measures **2.536x**
    # (36/1,088 vs 418/32,041) — the real pattern the plan's candidate list
    # missed. Mana Walls (Axebane Guardian, Overgrown Battlement, Wall of
    # Roots) are a load-bearing sub-shape of the archetype: a Defender that
    # taps for mana instead of attacking is exactly what "a creature that
    # doesn't attack" is *for*. `mana_dork` is `SUPPLY_ONLY` (no card in the
    # corpus ever cares about a mana dork), so this weight can never engage
    # Round A's commander-anchored unlock regardless of its value — capped at
    # 0.3 anyway, the `legends`/`vehicles` calibration-not-coverage role.
    "defenders": _t(
        "defenders",
        "Defenders",
        [R.HIGH_TOUGHNESS],
        {R.HIGH_TOUGHNESS: 1.0, R.MANA_DORK: 0.3},
        "Walls built to block, and the payoffs that turn defender or thick toughness into value.",
        retrieve_on="either",
    ),
    # The only "permanent type matters" archetype without a theme before this
    # round — artifacts, vehicles and voltron all have theirs
    # (`TOP50-COVERAGE.md` gap 5). Cares-gated: 3,636 producers are every
    # enchantment in the corpus, and a deck that merely plays enchantments is
    # not an enchantress deck any more than eight ramp spells make a landfall
    # one. `retrieve_on="either"` is load-bearing, the same fix applied every
    # theme built on a broad supply side: the channel must reach the
    # enchantments themselves (3,636 of them), not only the 249 cards that
    # pay them off.
    #
    # Ancillary lift measured over the 3,805-card retrieval population
    # (`produces` or `cares_about` `enchantment_matters`): `aura_matters`
    # 7.536x (1,277/3,805 vs 1,427/32,041), `protection` 1.441x (245/3,805 vs
    # 1,432/32,041), `lifegain` 1.093x (337/3,805 vs 2,597/32,041,
    # indistinguishable from noise — dropped, the `etb_trigger`/defenders
    # precedent above). `protection` is real and kept at 0.25: Sterling
    # Grove, Greater Auramancy and the shroud-granters are a genuine
    # sub-pattern (protecting the enchantments the deck's payoffs depend on).
    #
    # `aura_matters` is the plan's named overlap risk — `voltron` gates on it
    # at 1.0, and an Aura *is* an enchantment, so the lift is partly
    # definitional rather than a second, independent pattern. Built into the
    # weights and measured directly against the plan's ~30% bar, via the
    # live `FITS_THEME` edges rather than guessed: of `enchantress`'s 3,805
    # members, **1,284 (33.7%)** also clear `FIT_THRESHOLD` on `voltron` —
    # over the bar (and 58.8% of `voltron`'s own 2,183 members, the larger
    # side of the collision). Per the plan's explicit instruction, dropped
    # from the weights rather than forced through: `aura_matters` measured
    # the strongest lift of any candidate this round (7.536x) but an Aura
    # being definitionally an enchantment means a third of the population
    # that pattern would touch is `voltron`'s own membership, read under a
    # second name — the `wheels`/`discard` overlap precedent, not the
    # `legends`/`vehicles` one. `protection` alone is enough to clear
    # `test_no_theme_rests_on_a_single_weight`.
    "enchantress": _t(
        "enchantress",
        "Enchantments",
        [R.ENCHANTMENT_MATTERS],
        {R.ENCHANTMENT_MATTERS: 1.0, R.PROTECTION: 0.25},
        "Enchantments as the plan, and the payoffs that turn them into value or bodies.",
        retrieve_on="either",
    ),
    # Gap 7 (`TOP50-COVERAGE.md`): Esika's Prismatic Bridge line and Atraxa's
    # own second-most-famous build have no theme, though `loyalty_counter`
    # exists on both sides of the bridge already. `planeswalker_producer`
    # (rules.py) is the structural supply: 318 planeswalkers, 340 total
    # `loyalty_counter` producers after the rebuild (61 pre-existing
    # text-rule producers, 39 of which are themselves planeswalkers whose own
    # text says "loyalty counters").
    #
    # `gate_on="produces"` — measured, not the plan's literal "cares gate".
    # The plan's own framing for D1 ("Round A's unlock is the point: Atraxa
    # cares `loyalty_counter`, so her superfriends build's *planeswalker
    # supply* now counts at detection") assumed a cares-only gate needed
    # Round A's commander-anchored unlock to see a deck's own planeswalkers,
    # since they only ever *produce* loyalty. Measured directly against
    # Carth the Lion (this round's external anchor, ingested fresh — 32 of
    # his 60-pool cards are planeswalkers, all producers, zero of them
    # payoffs): a cares-only gate read him at `superfriends 0.125` — his own
    # card never touches `loyalty_counter` at all (he tutors and taxes
    # planeswalkers, produces `card_draw`/`legendary_matters`/
    # `tribal_payoff`, cares about `death_trigger`/`etb_trigger` — nothing
    # that unlocks this theme), so the unlock never fires for him and his 32
    # planeswalkers stayed invisible to detection; `counters` (0.134) outranked
    # `superfriends` outright. This is exactly the collision `poison`'s own
    # comment already documents and solves the same way: a cares gate on a
    # counter-kind resource that `proliferate` blanket-cares-about (rules.py's
    # `proliferate` rule cares about all seven counter kinds, `loyalty_counter`
    # included) pulls in every proliferate card in the corpus, not just
    # planeswalker decks — measured live, it also broke the D3 stability
    # quartet below (Atraxa's `counters` share fell to 0.305 with a cares- or
    # either-gated `superfriends` in the mix, because her own card cares about
    # `loyalty_counter` purely via the blanket proliferate rule and Round A's
    # unlock then widened every card in her pool). `gate_on="produces"` — the
    # `poison` precedent applied a second time — sidesteps both problems at
    # once: Carth's 32 planeswalkers are directly visible without needing the
    # unlock (`superfriends` 0.319, rank 1, clearing the 0.30 bar), and
    # Atraxa's proliferate-only cares edge can never open the gate at all
    # (`gate_on == "produces"` is checked before `commander_backed` in
    # `theme_fit`, the same hard guarantee `test_commander_backed_never_
    # widens_a_produces_gated_theme` pins for `poison`), so her `counters`
    # read is undisturbed by `superfriends` existing (0.024 share, 5 cards,
    # unranked).
    #
    # `retrieve_on="either"` stays, the `landfall`/`wheels`/`defenders`
    # fix: the channel must still be able to offer the proliferate-style
    # loyalty payoffs (127 cares-side cards) alongside the planeswalkers
    # themselves, even though detection reads produces only.
    #
    # Ancillary, measured over the 464-card retrieval population (`produces`
    # or `cares_about` `loyalty_counter`): `mass_removal` 2.440x (40/464 vs
    # 1132/32041), `tax_effect` 2.086x (10/464 vs 331/32041), `protection`
    # 1.591x (33/464 vs 1432/32041). All three of the plan's named candidates
    # clear base rate — but unlike every prior round's ancillary, adding even
    # the strongest one measurably cost the theme its own named accept
    # criterion: `mass_removal` at 0.3 (the `mana_dork`/`legends` calibration
    # weight) grew the ceiling 14.4% (6.973 -> 7.976, `loyalty_counter`
    # itself carrying only 53.1% of it afterward) and, because Carth's own
    # pool runs few board wipes, that pure dilution pulled his measured
    # `superfriends` share from 0.320 down to 0.295 — under the plan's own
    # 0.30 bar for the theme's headline anchor. Even a quarter of that weight
    # (0.1) still cost enough to leave only a 0.011 margin (0.311). Per "at
    # most one measured ancillary below 0.4", one is not owed — dropped
    # rather than shipped at a weight thin enough to be one corpus-drift away
    # from failing its own anchor again; `test_no_theme_rests_on_a_single_
    # weight` is already satisfied by `LOYALTY_COUNTER` + `PROLIFERATE`.
    "superfriends": _t(
        "superfriends",
        "Planeswalkers",
        [R.LOYALTY_COUNTER],
        {R.LOYALTY_COUNTER: 1.0, R.PROLIFERATE: 0.5},
        "Planeswalkers as the plan, and the proliferate effects that grow them.",
        gate_on="produces",
        retrieve_on="either",
    ),
    # An `energy` theme (`TOP50-COVERAGE.md` gap 6, "the strongest kind" —
    # 135 producers / 216 cares, the largest of the four counter kinds this
    # round touches) was built exactly to the plan's spec —
    # `requires_any=[R.ENERGY]`, `gate_on="cares"` (default), `retrieve_on=
    # "either"`, weights `{R.ENERGY: 1.0, R.PROLIFERATE: 0.4}` — and
    # **dropped** rather than shipped, on the plan's own mandatory overlap
    # check against `counters`.
    #
    # Measured live via `FITS_THEME` edges after a rebuild with the theme in
    # place, the `enchantress`/`aura_matters` and `discard`/`reanimator`
    # methodology: of `energy`'s 234-card either-population, **218 (93.2%)**
    # also clear `FIT_THRESHOLD` on `counters` — decisively past the plan's
    # ~30% bar, on the same order as `discard`'s 88.8% collision against
    # `reanimator` (`WHEELS-DISCARD-RESULTS.md`), not the 0-2-card pairwise
    # noise the four hidden-theme-study themes shipped at.
    #
    # Root-caused rather than left as a bare number, and it does not go away
    # under a narrower gate — checked directly before giving up on the theme.
    # Two independent causes stack:
    #
    # 1. The blanket `proliferate` rule (rules.py: cares about all seven
    #    counter kinds at once, "it multiplies every counter kind") gives
    #    every proliferate-producing card a `CARES_ABOUT energy` edge whether
    #    or not it has ever seen an energy counter — 95 of `energy`'s 216
    #    cares-side edges trace to exactly this (Tezzeret's Gambit, Reject
    #    Imperfection, Ezuri, Stalker of Spheres — none of which touch energy
    #    in their own text). This is the identical mechanism `poison`'s own
    #    comment already documents and solves with `gate_on="produces"`.
    # 2. But `gate_on="produces"` does not rescue this theme the way it
    #    rescues `superfriends` above: measured directly, `energy`'s
    #    PRODUCES-only population (135 cards — cards that literally grant or
    #    spend {E}) *still* overlaps `counters`' `FITS_THEME` membership at
    #    **88.1%** (119/135). Traced to a second, independent defect: plain
    #    Kaladesh-block energy cards with zero +1/+1 text (Aether Hub,
    #    Aethergeode Miner, Aethertide Whale) carry a `CARES_ABOUT
    #    plus_one_counter` edge of their own — the same shape of tag-closure
    #    over-attachment `vocabulary.py`'s own comment documents for
    #    `minus_one_counter` (82 cards wrongly swept into `plus_one_counter`
    #    via an unexcluded `mm-counters-matter` subtag), here on the energy
    #    side and outside `tag_mapping.py`, which this round's file list does
    #    not include.
    #
    # Because the second cause sits on `energy`'s own PRODUCES side — the one
    # side every gate variant must read — no `gate_on` choice available in
    # `themes.py` alone can separate `energy` from `counters`. Retrieval
    # channel confirmed dead on arrival too: `retrieve_on="either"` was the
    # plan's own spec and the wider either-population's overlap (93.2%) is
    # even worse than the produces-only figure.
    #
    # The theme's own numbers were otherwise strong and are recorded rather
    # than discarded along with it: Satya, Aetherflux Genius (this round's
    # external anchor, ingested fresh — `energy` is her own #1 EDHREC tag,
    # 3,218 decks, 6x her #2) read `energy 0.701` (47 cards, rank 1) against
    # the plan's 0.25 bar. A good number on a theme that fails its overlap
    # gate is still a fail — the plan's own instruction, applied here exactly
    # as `discard` applied it in `WHEELS-DISCARD-RESULTS.md`. `ENERGY` itself,
    # and its existing edges, are untouched; only the standalone theme is cut.
    # No `"energy"` entry exists in `edhrec.py`'s `THEME_TAG_SLUGS` for the
    # same reason `"discard"` has none there.
    # A `discard` theme — Hashaton's discard-to-copy engine and madness/
    # hellbent decks generally (`TOP50-COVERAGE.md` gap 1) — was built and
    # measured (`gate_on="cares"` on `[R.DISCARD_OWN]`, `retrieve_on="either"`,
    # weights `{DISCARD_OWN: 1.0, RECURSION_TO_HAND: 0.25}`) and **dropped**
    # rather than shipped, on the plan's mandatory overlap check against
    # `reanimator`, where `discard_own` is already weighted 0.6.
    #
    # Measured (full detail in `WHEELS-DISCARD-RESULTS.md`): of the
    # 1,411-card `discard_own` retrieval population, **1,253 (88.8%) also
    # clear `FIT_THRESHOLD` on `reanimator`** — the same 1,253 cards the
    # `discard-outlet` tag mapping assigns both `discard_own` and
    # `graveyard_creature` to at once (see tag_mapping.py), which is
    # `reanimator`'s own second-highest weight. This is not the ~0-2-card
    # pairwise overlap the four hidden-theme-study themes were accepted at;
    # it is the same population read twice under two names, decisively past
    # the plan's ~30% bar. The other half of the check passed clean —
    # Muldrotha and Teval both kept `reanimator` as their top theme, share
    # barely moved (0.633->0.624, 0.622->0.612) — but the overlap alone was
    # sufficient to drop per the plan's stated either/or.
    #
    # The theme's own numbers were otherwise excellent and are recorded
    # rather than discarded along with it: Hashaton read `discard 0.698` (28
    # cards, rank 1, unseating `reanimator` as his measured top theme) against
    # a 0.12 bar, and no Strong-22 commander's top theme or `themed_cards`
    # floor moved from adding it. A good-looking number on a theme that fails
    # its overlap gate is still a fail — recorded honestly rather than kept
    # for the number alone. `discard_own` itself, and its existing 0.6 weight
    # inside `reanimator`, are both untouched; only the standalone theme was
    # cut. Ancillary measurements taken before the drop, kept for the next
    # attempt: `graveyard_creature` measured 8.779x lift over the population
    # (1,253/1,411 vs 3,241/32,041 corpus-wide) but was excluded even before
    # the overlap check killed the theme outright — the `tap_matters`/
    # `untap_permanent` precedent (17.7x, excluded for restating the gate),
    # and the exact same 1,253 cards that turned out to sink the theme.
    # `impulse_draw` measured *below* base rate (0.652x, 52/1,411 vs
    # 1,812/32,041), the `ritual_mana` precedent for a dropped candidate.
    # `recursion_to_hand` was the one candidate that cleared the bar cleanly
    # (1.223x, 115/1,411 vs 2,136/32,041) — weak, but a graveyard looter that
    # gets its own discards back is a real, independent pattern (Bone Miser
    # regrowth lines) uninvolved in the reanimator collision.
    #
    # `wheels` above is unaffected: its own ancillary lift measurement used
    # `discard_own` as a *candidate weight inside `wheels`*, not as a gate,
    # and its membership overlap with this dropped theme's would-be
    # membership measured a modest 19 cards (of `wheels`' own 109-card
    # retrieval population) — nowhere near the collision that sank `discard`
    # against `reanimator`.
    #
    # A wide `lands` theme (`TOP50-COVERAGE.md` gap 8: `landfall` is
    # narrower than EDHREC's `lands-matter` umbrella, and the Titania/Gitrog/
    # Slogurk/Hearthhull graveyard-lands family reads as nothing at all —
    # Hearthhull himself measured `tokens 0.32` while his own page's #1 tag
    # is `lands-matter`, 2,973 decks) was built first, exactly to the plan's
    # literal spec — `requires_any=[R.GRAVEYARD_LAND, R.SACRIFICE_LAND]`,
    # `gate_on="cares"` (default), `retrieve_on="either"`, weights
    # `{GRAVEYARD_LAND: 1.0, SACRIFICE_LAND: 0.9, LANDFALL_TRIGGER: 0.3,
    # EXTRA_LAND_DROP: 0.3}`. It measured excellent on every named criterion
    # but one: both external anchors cleared their bars by a wide margin
    # (Titania 0.354 vs a 0.30 bar, Gitrog 0.510 vs a 0.20 bar, both rank 1),
    # Hearthhull flipped to it as his own rank-1 top theme (0.355, up from
    # `tokens` 0.321), the stability quartet
    # (Teval/Necrobloom/Muldrotha/Flubs) held, and zero Strong-22 commanders
    # changed top theme. But it collided with `reanimator`: of its 406-card
    # `FITS_THEME` membership, **209 (51.5%) also cleared `reanimator`'s
    # FITS_THEME**, decisively over the plan's ~30% bar. 198 of those 209
    # touch `graveyard_land`, and all 209 also carry `reanimator`'s own
    # `graveyard_creature` weight (0.8) — a card that mills its own land on
    # purpose is, definitionally, most of the way to being a "graveyard
    # matters" card the reanimator gate already reads. Both remediation
    # steps the plan prescribes were tried and measured: removing the
    # sub-floor ancillary weights changed the overlap not at all (byte-
    # identical, confirming neither was the offending term), and narrowing
    # the gate to `GRAVEYARD_LAND` alone made the collision *worse* (85.3%)
    # and additionally broke Gitrog's and Hearthhull's bars. Full numbers
    # for the wide theme's complete measured record, both remediation
    # attempts, and the first-pass drop: `LANDS-RESULTS.md`.
    #
    # Adjudicated rather than left dropped: the collision is telling the
    # truth about the ontology, not a tuning artifact. A graveyard-lands
    # deck *is* a graveyard deck — `reanimator` (labelled "Graveyard &
    # reanimator") already carries that family, and `GRAVEYARD_LAND` stays
    # in *its* weights (0.4) unchanged. The sacrifice half is the separable
    # archetype: narrowing the gate to `requires_any=[R.SACRIFICE_LAND]`
    # alone clears both overlap gates cleanly (12.8% vs `landfall`, 8.3% vs
    # `reanimator` — re-confirmed on this exact final config, see
    # `LANDS-RESULTS.md`'s iteration-2 section) and still fixes the
    # commander gap 8 is actually about: Hearthhull, whose page's #1 tag
    # (`lands-matter`, 2,973 decks) had no theme reading it at all — and
    # reads even stronger under the narrow scope than the wide one did
    # (0.371 vs 0.355, still rank 1). Titania's 0.30 bar was calibrated for
    # the wide theme's own width; it is not a hard bar against a
    # deliberately narrower one. Measured rather than assumed: both Titania
    # and Gitrog still keep `land_sacrifice` as their own rank-1 top theme
    # under the narrow scope (0.281 and 0.479 — `reanimator` stays their
    # own #2 read, not their top one), just below the wide theme's 0.354/
    # 0.510 and, for Titania, below the original 0.30 bar — the reweighting
    # (`SACRIFICE_LAND` up to 1.0 from 0.9, `GRAVEYARD_LAND` down to 0.3
    # from 1.0) shrinks the ceiling relative to the wide spec. Informational
    # under this scope, not a pass/fail bar (`LANDS-RESULTS.md`'s
    # iteration-2 section has the full numbers).
    #
    # Shipped under a new id, `land_sacrifice`, rather than reusing `lands`:
    # the id and label should not claim EDHREC's full `lands-matter` breadth
    # for a theme that only covers the half of it that survived.
    # `GRAVEYARD_LAND` stays in the weights at 0.3 — deliberately *below*
    # `UNLOCK_WEIGHT` (0.4), the `wheels`/`discard_own` precedent applied a
    # second time in this file: a commander who only cares about
    # `graveyard_land` (the reanimator family's own resource) must not
    # unlock this theme via Round A's commander-anchored mechanism — that
    # detection is `reanimator`'s job. Titania and Gitrog both still unlock
    # `land_sacrifice` for their own decks regardless, because their own
    # commander cards separately care about `sacrifice_land` itself (weight
    # 1.0, well above the floor). `LANDFALL_TRIGGER` and `EXTRA_LAND_DROP`
    # are kept at 0.3 each: both measured real lift over the narrowed
    # 180-card retrieval population (produces or cares_about
    # `sacrifice_land`) — `extra_land_drop` 6.055x (5/180 vs 147/32,041
    # corpus-wide), `landfall_trigger` 4.574x (23/180 vs 895/32,041),
    # `graveyard_land` itself 4.604x (6/180 vs 232/32,041, its own weight
    # already fixed at 0.3 above) — all three clear base rate comfortably,
    # and both stay below the unlock floor for the same reason
    # `graveyard_land` does: a landfall commander must not unlock this theme
    # either — `landfall` is its own theme and stays untouched (pinned by
    # `test_landfall_is_untouched_by_the_lands_theme` below).
    "land_sacrifice": _t(
        "land_sacrifice",
        "Land sacrifice",
        [R.SACRIFICE_LAND],
        {
            R.SACRIFICE_LAND: 1.0,
            R.GRAVEYARD_LAND: 0.3,
            R.LANDFALL_TRIGGER: 0.3,
            R.EXTRA_LAND_DROP: 0.3,
        },
        "Lands sacrificed on purpose, and the payoffs that turn the loss into value.",
        retrieve_on="either",
    ),
    # A user-reported gap, not from `TOP50-COVERAGE.md`'s own register:
    # building around extra turns (Narset, Enlightened Master) had no theme
    # to favour in the advisor's prefs, so the spells could not be pinned.
    # `extra_turn` is pre-measured (and re-confirmed live before shipping) at
    # **53 produces / 0 cares** — nothing "cares about" an extra turn the way
    # a landfall payoff cares about a land entering, because taking the turn
    # *is* the payoff; there is no downstream card that reads "whenever you
    # take an extra turn." A cares gate here could never fire, exactly the
    # `poison` shape (a closed, produces-only archetype whose own comment is
    # this theme's template): `gate_on="produces"` reads the only side that
    # exists, and it doubles as detection — a deck dense in turn spells reads
    # the theme without needing a payoff card that structurally cannot exist.
    # `retrieve_on` stays unset: the retrieval gate then reads the same
    # produces gate `gate_on` already names (`theme_fit`'s `(theme.retrieve_on
    # or theme.gate_on) if retrieval else theme.gate_on`), which with a
    # 0-cares resource is also exactly what `retrieve_on="either"` would give
    # — there is no cares side left to add.
    #
    # Being produces-gated keeps this theme outside the commander-anchored
    # supply-gate unlock by design, the same guarantee `poison` and
    # `superfriends` rely on: `theme_fit` checks `gate_on == "produces"`
    # before `commander_backed`
    # (`test_commander_backed_never_widens_a_produces_gated_theme`), and the
    # unlock only ever widens a *cares* gate to "either" — there is no cares
    # gate here to widen, and the produces gate is already as wide as the
    # archetype gets.
    #
    # Ancillary, measured over the 53-card produces population — the same
    # population the retrieval gate reads, since `retrieve_on` is unset:
    # `copy_spell` **0.000x** (0/53 vs 949/32,041 corpus-wide) — surprising
    # against the plan's own expectation that copying a turn spell is the
    # archetype's classic line, but measured rather than assumed: the
    # `COPY_SPELL` edge lands on the *copying* card (Reiterate, Twincast,
    # Strionic Resonator), never on the extra-turn spell it copies, so a
    # same-card lift check can only ever read zero here. Dropped, below base
    # rate. `tutor_to_hand` **1.042x** (1/53, Twice Upon a Time // Unlikely
    # Meeting) sits almost exactly at the count expected by base rate alone
    # (53 x 1.81% = 0.96 expected) — one card is the entire signal, and it is
    # indistinguishable from noise; not kept. `tutor_to_top` **1.768x** (3/53:
    # Regenerations Restored, The Legend of Kuruk // Avatar Kuruk, Ultimecia,
    # Time Sorceress) clears with three independent cards behind it rather
    # than one; kept, at **0.2** rather than the 0.3 ceiling to reflect how
    # thin the margin still is next to other rounds' ancillaries (`land_ramp`
    # at 5.951x, `mass_removal` at 2.440x). Satisfies
    # `test_no_theme_rests_on_a_single_weight` on its own; no second
    # ancillary was needed to clear it.
    #
    # `edhrec.py` maps this theme to the `extra-turns` slug, verified against
    # Narset, Enlightened Master's own cached page after ingesting her fresh
    # for this round (not her near-namesake, Narset, Enlightened Exile, a
    # different commander a prefix lookup would return first).
    "extra_turns": _t(
        "extra_turns",
        "Extra turns",
        [R.EXTRA_TURN],
        {R.EXTRA_TURN: 1.0, R.TUTOR_TO_TOP: 0.2},
        "Taking another turn, and the spells that chain into taking another.",
        gate_on="produces",
    ),
    # Tutor access — a toolbox theme for decks built around search effects.
    # Task 0 found 69 lands carry Role.TUTOR (fetch lands, shocks, etc.) and
    # 60/469 cards produce TUTOR_TO_BATTLEFIELD (the land-ramp overlap per
    # tag_mapping.py), so the theme gates on produces-side resources only,
    # not FILLS_ROLE — and drops TUTOR_TO_BATTLEFIELD from requires_any per
    # Option 1 of the plan (corpus-wide theme cannot splice a `WHERE NOT
    # c.is_land` filter into the generic retrieval query). This leaves
    # TUTOR_TO_HAND and TUTOR_TO_TOP, both clean.
    #
    # Supply-only precedent (stax): nothing in Magic "cares about" being
    # tutored, so this is produces-gated like stax/poison/extra_turns.
    #
    # Ancillary: RECURSION_ANY for looping tutors — Kess, Shaman of the
    # Pack and other mid-power toolbox commanders often chain search into
    # regrowth. Weights below are reasonable defaults; a measured lift pass
    # against the top-50 corpus can adjust these if needed.
    "tutors": _t(
        "tutors",
        "Tutors",
        [R.TUTOR_TO_HAND, R.TUTOR_TO_TOP],
        {
            R.TUTOR_TO_HAND: 1.0,
            R.TUTOR_TO_TOP: 0.8,
            R.RECURSION_ANY: 0.3,
        },
        "Consistency through search — the deck plays its best card on demand "
        "rather than drawing into it.",
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
    commander_backed: bool = False,
) -> float:
    """How strongly one card reads as this theme. 0 when the gate is unmet.

    The gate reads one side of the bridge (see `Theme.gate_on`); the weights
    read both, because once a card is in the theme, supplying it and paying it
    off both count. `retrieval` swaps in the theme's `retrieve_on` gate —
    membership for the suggestion channel, not deck identity.

    `commander_backed` is the commander-anchored supply gate
    (`SUPPLY-GATE-PLAN.md`): when the deck's own commander cares about a
    resource this theme weighs, the theme's *cares* gate widens to the
    "either" branch for this deck's cards, so a card that only supplies the
    resource — Cyclonic Rift under Y'shtola, a cantrip under Vivi — can now
    open it. `and not retrieval` keeps this out of the retrieval gate, which
    already reads `retrieve_on` and must not also read the commander; the
    `gate_on == "produces"` branch above still wins first, so a
    produces-gated theme is never widened by this, commander regardless.
    """
    produced = expand(produces)
    cared = expand(cares_about)
    gate_on = (theme.retrieve_on or theme.gate_on) if retrieval else theme.gate_on
    if gate_on == "produces":
        gate_set = produced
    elif gate_on == "either" or (commander_backed and not retrieval):
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

# Floor on which of a theme's weights are strong enough to unlock it for the
# commander-anchored supply gate below (`SUPPLY-GATE-PLAN.md`, round 2,
# measured against the top-50 audit — see `SUPPLY-GATE-RESULTS.md`).
# Ancillary weights are calibration, not coverage — the language `vehicles`,
# `legends` and `tap_matters` already use for their own ancillary terms: they
# rank a deck's cards once a theme has already fired, and were never meant to
# say what the theme is *about*. `creature_token` sits in `tribal`'s weights
# at 0.2 for exactly that reason, and unlocking `tribal` from it flipped
# Caesar and Breya — two token/artifact commanders with no typal identity —
# to a tribal top theme: `tribal_payoff` is produced structurally by 55.9% of
# the corpus, so once unlocked nearly any creature-heavy pool floods it.
# Every load-bearing unlock this round was built for sits at 0.4 or above —
# `cast_trigger` in `spellslinger` at exactly 0.4 (the Vivi case the weights
# rule exists for), `high_mv_spell` in `big_spells` at 1.0, `high_power` in
# `stompy` at 1.0, `landfall_trigger` in `landfall` at 1.0, the
# death-trigger family in `aristocrats` at 0.8+ — so the floor sits exactly
# on the lowest weight this round actually needs and excludes only the
# ancillary tier below it.
UNLOCK_WEIGHT = 0.4


@dataclass(frozen=True, slots=True)
class ThemeEvidence:
    """How many of the deck's cards actually read as each theme.

    The profile is a *distribution*: it divides by its own grand total, so a
    deck in which six cards read as anything at all still comes back as "34%
    aristocrats, 22% tokens". That is the right shape for ranking and the
    wrong number to show a human on its own — it cannot distinguish a built
    deck from a pile that happens to lean. These counts are the missing
    denominator, and the only thing that can say how much deck is behind a
    share.
    """

    # Theme id -> copies whose fit clears `FIT_THRESHOLD`.
    cards: dict[str, int]
    # Copies reading as at least one theme.
    themed: int
    # Copies looked at, so `themed` has something to be a fraction of.
    total: int


def deck_theme_breakdown(
    card_resources: list[tuple[set[R], set[R]]],
    idf: Mapping[R, float],
    *,
    commander: tuple[set[R], set[R]] | None = None,
) -> tuple[dict[str, float], ThemeEvidence]:
    """The theme profile and the card counts behind it, from one pass.

    Both answers read the same fits, so they are computed together rather
    than by scoring every card against every theme twice.
    """
    totals = dict.fromkeys(THEMES, 0.0)
    support = dict.fromkeys(THEMES, 0)
    themed = 0

    # Commander-anchored supply gating (`SUPPLY-GATE-PLAN.md`). Some decks are
    # all supply for a resource their commander is the payoff for — Y'shtola's
    # big spells, Vivi's cantrips, Kaalia's fatties — and under the default
    # cares gate the only card in the whole 99 that opens those themes is the
    # commander itself, so the deck reads at ~0.04 no matter how many of the
    # cards it actually is are in it. Fix, scoped to this one deck: a
    # cares-gated theme this commander's own `cares_about` weighs widens to
    # the "either" branch, so the deck's supply of that resource becomes
    # detection evidence too.
    #
    # Weights, not `requires_any`. The gates are the narrow admission set and
    # the weights are the wider evidence set — `cast_trigger` carries 0.4 in
    # `spellslinger` without being one of its gates — and the wider set is
    # what catches Vivi, whose ability doesn't match any gate resource
    # directly. `test_gate_resources_are_weighted` already guarantees weights
    # ⊇ gates, so this only ever widens, never narrows, what a gate resource
    # alone would unlock.
    #
    # Cares side only, never produces: producing a resource is supply, not
    # intent, and unlocking from it would make every commander that merely
    # ramps or draws cards a candidate for widening. Cares-gated themes only
    # (`theme.gate_on == "cares"`): the produces- and either-gated themes
    # already read supply by design, and widening them further is the global
    # widening this round explicitly rejects — see `spellslinger`'s own
    # comment above for the measured cost (Task B, `MANA-VALUE-RESULTS.md`:
    # 17/50 top-50 commanders gained a false-positive spellslinger share
    # >=0.10 from exactly this shape of change applied globally instead of
    # per-commander). Scoping the widening to one commander's own stated
    # `cares_about` is what keeps this from being that. `UNLOCK_WEIGHT`
    # (see its own comment above) further floors *which* of the theme's
    # weights are strong enough to unlock it — a resource merely brushing
    # the theme at ancillary strength must not be enough.
    anchor_cares = expand(commander[1]) if commander is not None else set()
    unlocked = {
        theme_id
        for theme_id, theme in THEMES.items()
        if theme.gate_on == "cares"
        and any(weight >= UNLOCK_WEIGHT for r, weight in theme.weights.items() if r in anchor_cares)
    }

    for produces, cares in card_resources:
        counted = False
        for theme_id, theme in THEMES.items():
            fit = theme_fit(produces, cares, theme, idf, commander_backed=theme_id in unlocked)
            if fit <= 0:
                continue
            totals[theme_id] += fit
            # The same bar the stored FITS_THEME edges are written at: below
            # it a card is brushing a weight, not playing the theme, and
            # counting it would put the overconfidence back one level down.
            if fit >= FIT_THRESHOLD:
                support[theme_id] += 1
                counted = True
        if counted:
            themed += 1

    if commander is not None:
        produces, cares = commander
        for theme_id, theme in THEMES.items():
            fit = theme_fit(produces, cares, theme, idf)
            if fit > 0:
                totals[theme_id] *= 1.0 + COMMANDER_ANCHOR * fit

    evidence = ThemeEvidence(
        cards={theme_id: count for theme_id, count in support.items() if count > 0},
        themed=themed,
        total=len(card_resources),
    )

    grand = sum(totals.values())
    if grand <= 0:
        return {}, evidence

    return {theme_id: value / grand for theme_id, value in totals.items() if value > 0}, evidence


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
    return deck_theme_breakdown(card_resources, idf, commander=commander)[0]


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
