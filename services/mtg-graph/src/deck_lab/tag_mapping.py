"""Scryfall Tagger slugs → our closed vocabulary.

Tagger has 4,523 tags; most are flavour or meta (`alliteration`,
`french-vanilla`, `namesake-spell`, `cycle-*`) and map to nothing. This file
covers the functional head of the distribution — the tags that actually carry
corpus volume.

Each mapping is applied over the tag's **transitive closure**, so mapping
`sacrifice-outlet` reaches all 14 of its children automatically. That is why a
mapping this small covers so much of the corpus.

Semantics, which matter for the bipartite bridge to join correctly:

  produces     this card creates or enables the resource
  cares_about  this card gets better when the resource is present

A sacrifice outlet therefore *produces* `death_trigger` (it makes creatures
die) and *cares about* `creature_token` (it needs fodder). An aristocrats
payoff cares about `death_trigger`. The two meet on the resource, which is the
whole point of the layer.

Role weights are fractional on purpose — `docs/composition.md` needs them that
way, and a generic `removal` tag is weaker evidence than `spot-removal`.
"""

from __future__ import annotations

from dataclasses import dataclass

from .vocabulary import Resource as R
from .vocabulary import Role


@dataclass(frozen=True, slots=True)
class TagMapping:
    produces: tuple[R, ...] = ()
    cares_about: tuple[R, ...] = ()
    roles: tuple[tuple[Role, float], ...] = ()
    # Withhold the roles from lands. The tag hierarchy has no way for a child
    # to refuse its parent's meaning, and some parents mean something a land
    # child does not: `bounce` is pseudo-removal when it returns an opponent's
    # creature and a drawback when it returns your own land, which is what a
    # Karoo does. Tagger even tags those `drawback`.
    lands_exempt: bool = False
    # Subtrees to subtract from this tag's closure — the general form of the
    # problem `lands_exempt` solves for one case. A child that *inverts* its
    # parent cannot be fixed by picking a narrower parent, because Tagger's
    # taxonomy has no narrower one: `mm-counters-matter` is a direct child of
    # `counters-matter`, and the closure therefore told the graph that every
    # Hapatra and Necroskitter wants +1/+1 counters. Curating child slugs
    # instead is what leaked 35 low-power cards into `stompy` through shared
    # parents (see `high_power_payoff` in rules.py); subtracting the subtree
    # states the exception once and survives Tagger adding children to it.
    excludes: tuple[str, ...] = ()


def _m(*, produces=(), cares=(), roles=(), lands_exempt=False, excludes=()) -> TagMapping:
    return TagMapping(tuple(produces), tuple(cares), tuple(roles), lands_exempt, tuple(excludes))


MAPPINGS: dict[str, TagMapping] = {
    # --- Mana and ramp -----------------------------------------------------
    "ramp": _m(roles=[(Role.RAMP_OTHER, 0.7)]),
    "mana-rock": _m(roles=[(Role.MANA_ROCK, 1.0)], produces=[R.MANA_ROCK]),
    "mana-dork": _m(roles=[(Role.MANA_DORK, 1.0)], produces=[R.MANA_DORK]),
    "mana-producer": _m(roles=[(Role.RAMP_OTHER, 0.5)]),
    # Tagger's actual tag for the actual mechanic — "Spells that add mana."
    # Dark Ritual, Cabal Ritual, Pyretic Ritual, Seething Song, Culling the
    # Weak. It was never mapped, so **not one** of them produced `ritual_mana`.
    "ritual": _m(produces=[R.RITUAL_MANA, R.STORM_COUNT], roles=[(Role.RAMP_OTHER, 0.7)]),
    # The role only. This used to produce `ritual_mana`, which inverted the
    # resource: `refund` is "Immediately get mana or untapped lands back", and
    # its biggest arm is `mini-refund` — "no more than about one-third of the
    # mana cost you paid", i.e. cards that give back *less* than they cost.
    # Arcane Signet ({2}, taps for one) is the median member, not an edge case.
    # 671 mana rocks, Banners and Bobbleheads produced `ritual_mana` while the
    # rituals produced none of it.
    "refund": _m(roles=[(Role.RAMP_OTHER, 0.5)]),
    "utility-land": _m(roles=[(Role.LAND, 1.0)]),
    "cycle-land": _m(roles=[(Role.LAND, 1.0)], produces=[R.MANA_FIXING]),
    # Land ramp is what *produces* landfall triggers. Without these, landfall
    # payoffs had no counterparty and the bridge returned nothing for it.
    "land-ramp": _m(
        produces=[R.LAND_RAMP, R.LANDFALL_TRIGGER, R.MANA_FIXING],
        roles=[(Role.LAND_RAMP, 1.0)],
    ),
    "tutor-land-basic": _m(produces=[R.LAND_RAMP, R.MANA_FIXING], roles=[(Role.LAND_RAMP, 0.8)]),
    "tutor-land-to-battlefield": _m(
        produces=[R.LAND_RAMP, R.LANDFALL_TRIGGER, R.TUTOR_TO_BATTLEFIELD],
        roles=[(Role.LAND_RAMP, 0.9)],
    ),
    "extra-land": _m(produces=[R.EXTRA_LAND_DROP, R.LANDFALL_TRIGGER]),
    "fetchland": _m(produces=[R.LANDFALL_TRIGGER, R.MANA_FIXING], roles=[(Role.LAND, 1.0)]),
    "untapper": _m(produces=[R.UNTAP_PERMANENT]),
    "tap-outlet": _m(cares=[R.UNTAP_PERMANENT]),
    # "Tap a creature to pay for/activate an effect" — 698 cards through the
    # closure, and the whole supply side of `tap_own_creature` in one line:
    # `crew` (182) hangs under `tap-fuel-power` under this, `convoke` and
    # `gives-convoke` directly under it, and the rest is the Springleaf Drum
    # family. Mana dorks are *not* in it, which is what makes it usable — a
    # creature tapping itself for mana is `mana-dork`, and if this tag meant
    # that too, every green deck would read as a tap deck.
    "tap-fuel-creature": _m(cares=[R.UNTAP_PERMANENT], produces=[R.TAP_OWN_CREATURE]),
    # The consumer side of burst mana, kept at the *bottomless* child only:
    # "if an arbitrary amount of mana is dumped into them, will probably win
    # you the game". That card genuinely wants a ritual.
    "bottomless-mana-sink": _m(cares=[R.RITUAL_MANA], roles=[(Role.WINCON, 0.3)]),
    # NOT the parent. `mana-sink` is "repeatable effects you can dump at least
    # 3 mana into each turn" — 1,016 cards, which is most utility lands and
    # most activated abilities. Rogue's Passage and Kher Keep do not want a
    # Dark Ritual, they want an untapped land, and pairing them with every
    # mana rock made `ritual_mana` a tautology true of every Commander deck.
    "mana-sink": _m(),
    # --- Card advantage ----------------------------------------------------
    "card-advantage": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 0.7)]),
    "draw": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 0.7)]),
    "pure-draw": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 0.9)]),
    "repeatable-draw": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 1.0)]),
    "repeatable-pure-draw": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 1.0)]),
    "draw-engine": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 1.0)]),
    "repeatable-card-advantage": _m(produces=[R.CARD_DRAW], roles=[(Role.CARD_ADVANTAGE, 1.0)]),
    "peek": _m(produces=[R.IMPULSE_DRAW]),
    "top-deck-manipulation": _m(produces=[R.TUTOR_TO_TOP]),
    "library-manipulation": _m(produces=[R.TUTOR_TO_TOP]),
    "hand-disruption": _m(produces=[R.DISCARD_OPPONENT]),
    "discard-outlet": _m(produces=[R.DISCARD_OWN, R.GRAVEYARD_CREATURE]),
    # The payoff side of discard, and until now the whole of it was missing:
    # `discard_own` had 1,242 producers and **zero** consumers, so a madness
    # card bridged to no looter and a looter bridged to no madness card. Anje
    # Falkenrath, Archfiend of Ifnir, Hollow One, Bone Miser and Tinybones
    # held no `CARES_ABOUT` edge of any kind.
    #
    # What this does *not* change is the theme layer: no discard theme cleared
    # the bar (see the ledger in docs/themes.md), so `deck-lab
    # theme-agreement` still reads the same 0/10 and 2/10 against EDHREC's
    # discard and madness pages as before. The win here is the bridge — the
    # suggestion channel and the resource diagnostics — not a new theme, and
    # nothing below should be read as claiming otherwise.
    #
    # `self-discard-matters`, not its parent `discard-matters`. The parent's
    # other arm is `opponent-discard-matters` — Tergrid, Liliana's Caress,
    # Geth's Grimoire — and those are `discard_opponent` payoffs. Mapping the
    # parent would pair a Faithless Looting with a Bloodchief Ascension, the
    # `mana-sink` error in a new place. The closure carries `madness` (all 61
    # of them) with it, which is the point: a madness card is unplayable
    # without an outlet, so it *wants* the discard.
    "self-discard-matters": _m(cares=[R.DISCARD_OWN]),
    # Disjoint from the above (3 cards shared) and the same want stated
    # differently: Tinybones, Asylum Visitor and Sea Gate Wreckage get better
    # as the hand empties, and a discard outlet is how it empties.
    "hellbent": _m(cares=[R.DISCARD_OWN]),
    # NOT `threshold`, and NOT `discarded-type-matters`. Threshold shares zero
    # cards with self-discard: it counts the graveyard, not the discard, and
    # Cabal Ritual does not care how the cards got there. `discarded-type-
    # matters` mixes polarity the way `discard-matters` does — Ledger Shredder
    # and Waste Not count what *opponents* pitch, and Thirst for Knowledge is
    # an outlet, not a payoff. Its genuinely self-facing members (Bone Miser,
    # Aclazotz) already arrive through `self-discard-matters`.
    # --- Tutors ------------------------------------------------------------
    # The generic tags carry the *role* only. They used to assert
    # `tutor_to_hand`, which their own children contradict — Entomb is tagged
    # `tutor-to-graveyard` and inherits from both of these, so the hierarchy
    # closure handed it "to hand" for a card that tutors to the graveyard.
    # It over-claimed by roughly two to one: 1,114 cards produced
    # `tutor_to_hand` where 521 are tagged for it. Nothing is lost by moving
    # the destination down — zero cards carry `tutor` without one of the
    # destination children below.
    "tutor": _m(roles=[(Role.TUTOR, 1.0)]),
    "tutor-to": _m(roles=[(Role.TUTOR, 0.8)]),
    "tutor-to-hand": _m(produces=[R.TUTOR_TO_HAND]),
    "tutor-to-battlefield": _m(produces=[R.TUTOR_TO_BATTLEFIELD]),
    "tutor-to-top": _m(produces=[R.TUTOR_TO_TOP]),
    # Deliberate graveyard filling, which is what the reanimator theme means
    # by it: Entomb and Buried Alive choose what goes there rather than
    # milling blind, but the resource they create is the same.
    "tutor-to-graveyard": _m(produces=[R.SELF_MILL, R.GRAVEYARD_CREATURE]),
    # --- Removal and interaction -------------------------------------------
    "removal": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.5)]),
    "spot-removal": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 1.0)]),
    "removal-creature": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.9)]),
    "removal-artifact": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.7)]),
    "removal-enchantment": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.7)]),
    "removal-planeswalker": _m(roles=[(Role.SPOT_REMOVAL, 0.5)]),
    "repeatable-removal": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 1.0)]),
    "multi-removal": _m(roles=[(Role.BOARD_WIPE, 0.6), (Role.SPOT_REMOVAL, 0.4)]),
    "sweeper": _m(produces=[R.MASS_REMOVAL], roles=[(Role.BOARD_WIPE, 1.0)]),
    "counterspell": _m(produces=[R.COUNTERSPELL], roles=[(Role.COUNTERSPELL, 1.0)]),
    "burn": _m(roles=[(Role.SPOT_REMOVAL, 0.4)]),
    "removal-burn": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.8)]),
    "burn-creature": _m(produces=[R.SPOT_REMOVAL], roles=[(Role.SPOT_REMOVAL, 0.7)]),
    "burn-player": _m(produces=[R.LIFELOSS_OPPONENT], roles=[(Role.WINCON, 0.3)]),
    "group-slug": _m(produces=[R.LIFELOSS_OPPONENT], roles=[(Role.WINCON, 0.4)]),
    "opponent-loses-life": _m(produces=[R.LIFELOSS_OPPONENT]),
    # Not for lands: the Ravnica bouncelands and their kin return a land you
    # own, and counting 110 of them as interaction put every deck that plays
    # one over its interaction target for a reason the reader could not see.
    "bounce": _m(roles=[(Role.SPOT_REMOVAL, 0.5)], lands_exempt=True),
    "tapper": _m(roles=[(Role.SPOT_REMOVAL, 0.3)]),
    "theft": _m(roles=[(Role.SPOT_REMOVAL, 0.5)]),
    "control-changing-effects": _m(roles=[(Role.SPOT_REMOVAL, 0.4)]),
    "protection": _m(produces=[R.PROTECTION], roles=[(Role.PROTECTION, 0.9)]),
    # NOT commander_protection: every one of this tag's 880 cards produced it,
    # duplicating `protection` byte for byte — zero independent information.
    # The `commander_protection` rule re-derives it from text that actually
    # says "commander".
    "protects-creature": _m(produces=[R.PROTECTION], roles=[(Role.PROTECTION, 1.0)]),
    "pinger": _m(roles=[(Role.SPOT_REMOVAL, 0.3)]),
    # --- Graveyard ---------------------------------------------------------
    "recursion": _m(produces=[R.RECURSION_TO_HAND], roles=[(Role.RECURSION, 0.8)]),
    "recursion-creature": _m(
        produces=[R.RECURSION_TO_HAND], cares=[R.GRAVEYARD_CREATURE], roles=[(Role.RECURSION, 0.9)]
    ),
    "regrowth": _m(
        produces=[R.RECURSION_TO_HAND],
        cares=[R.GRAVEYARD_INSTANT_SORCERY],
        roles=[(Role.RECURSION, 0.8)],
    ),
    # Reanimation is also commander recursion when the commander is expensive —
    # see the context rule in docs/composition.md. But only the branches that
    # can actually return a commander say so: `reanimate`'s closure includes
    # `reanimate-land` (Splendid Reclamation cannot return a commander),
    # the artifact/enchantment/aura/equipment-only branches, `reanimate-self`
    # (returns only itself) and `reanimate-from-opponent` (your commander is
    # never in their graveyard).
    # The parent says something comes back from a graveyard and nothing about
    # what. It used to claim `graveyard_creature`, which the hierarchy then
    # handed to every child — so Dance of the Manse, tagged `reanimate-artifact`
    # and `reanimate-enchantment` and returning no creature at all, read as a
    # reanimator card. Creature reanimation and artifact recursion are separate
    # archetypes and Tagger already separates them; only the mapping did not.
    # Moving the type down costs almost nothing: 10 cards carry `reanimate`
    # without one of the typed children below.
    "reanimate": _m(
        produces=[R.RECURSION_TO_BATTLEFIELD],
        cares=[R.GRAVEYARD_ANY],
        roles=[(Role.RECURSION, 1.0)],
    ),
    # `commander_recursion` on these four is a separate claim and unchanged:
    # a commander is a creature, so whatever can return one of those can
    # return it. The graveyard type is what is new.
    "reanimate-creature": _m(produces=[R.COMMANDER_RECURSION], cares=[R.GRAVEYARD_CREATURE]),
    "reanimate-permanent": _m(produces=[R.COMMANDER_RECURSION], cares=[R.GRAVEYARD_CREATURE]),
    "reanimate-nonland": _m(produces=[R.COMMANDER_RECURSION], cares=[R.GRAVEYARD_CREATURE]),
    # No graveyard type on this one: it means "castable from the graveyard"
    # and says nothing about what. Emry, Lurker of the Loch carries it for
    # artifacts, and a creature claim here read her as 84% reanimator inside
    # an artifact deck.
    "reanimate-cast": _m(produces=[R.COMMANDER_RECURSION]),
    # Returns a creature that is also an artifact, so it answers to both.
    "reanimate-artifact-creature": _m(
        produces=[R.COMMANDER_RECURSION],
        cares=[R.GRAVEYARD_CREATURE, R.GRAVEYARD_ARTIFACT],
    ),
    "reanimate-artifact": _m(cares=[R.GRAVEYARD_ARTIFACT]),
    "reanimate-land": _m(cares=[R.GRAVEYARD_LAND]),
    "mill-self": _m(produces=[R.SELF_MILL, R.GRAVEYARD_CREATURE, R.GRAVEYARD_INSTANT_SORCERY]),
    # NOT mapped: `mill`. The parent tag carries zero direct taggings — it is
    # pure taxonomy — and its closure is mostly `mill-self` (965 of 971 self-
    # millers produced mill_opponent through it). Even `mill-opponent` alone is
    # Tagger's broader notion: Etali carries it for exiling library tops to
    # cast, which is theft, not an attack on a library. The `mill_opponent`
    # text rule is the source of truth — "mills" is an errata'd keyword, so
    # oracle text is normalised and the word means the mechanic.
    # The graveyard branch only. `castable-from-nonhand`'s other arm is
    # `castable-from-exile` — foretell, suspend, impulse — and none of those
    # cards want a stocked graveyard; they were the 23% text noise the defect
    # ledger measured on this resource's cares side.
    "castable-from-graveyard": _m(cares=[R.GRAVEYARD_INSTANT_SORCERY]),
    "gives-castable-from-exile": _m(produces=[R.IMPULSE_DRAW]),
    # --- Sacrifice ---------------------------------------------------------
    "sacrifice-outlet": _m(
        produces=[R.DEATH_TRIGGER, R.SACRIFICE_OUTLET], cares=[R.CREATURE_TOKEN]
    ),
    "sacrifice-outlet-permanent": _m(
        produces=[R.DEATH_TRIGGER, R.SACRIFICE_OUTLET_PERMANENT], cares=[R.CREATURE_TOKEN]
    ),
    "recursion-land": _m(produces=[R.RECURSION_TO_HAND], cares=[R.GRAVEYARD_LAND]),
    "regrowth-land": _m(produces=[R.RECURSION_TO_HAND], cares=[R.GRAVEYARD_LAND]),
    "sacrifice-outlet-creature": _m(
        produces=[R.DEATH_TRIGGER, R.SACRIFICE_OUTLET_CREATURE], cares=[R.CREATURE_TOKEN]
    ),
    "repeatable-sacrifice-outlet": _m(
        produces=[R.DEATH_TRIGGER, R.FREE_SACRIFICE_OUTLET], cares=[R.CREATURE_TOKEN]
    ),
    # NOT mapped to death_trigger. `sacrifice-self` covers fetchlands, Clues and
    # other self-sacrificing permanents; most are not creatures, so the bridge
    # produced Evolving Wilds -> Skullclamp. Caught by the bridge spot-check.
    "sacrifice-self": _m(),
    # --- Tokens and counters -----------------------------------------------
    #
    # NOT `repeatable-token-generator`. Its closure is the *whole* token
    # branch — `repeatable-artifact-tokens`, `repeatable-noncreature-tokens`
    # and `repeatable-enchantment-tokens` all hang under it — so mapping the
    # parent to `creature_token` told the graph that every Treasure, Clue,
    # Food, Blood and Role maker creates creature tokens. Measured: 377 cards
    # produced `creature_token` with no creature-token tag anywhere on them
    # (Ancient Copper Dragon, Anje Maid of Dishonor, Bloodforged Battle-Axe).
    # Nothing was lost by dropping it — the parent carries exactly **one**
    # direct tagging of its own, and the creature arm is `repeatable-creature-
    # tokens` below.
    "repeatable-creature-tokens": _m(produces=[R.CREATURE_TOKEN]),
    "multiple-bodies": _m(produces=[R.CREATURE_TOKEN]),
    # The arm the line above used to swallow. Treasure, Food, Clue, Blood and
    # Powerstone already map individually; this covers the other 539 cards on
    # the branch, and `artifact_token -> artifact_matters` in the hierarchy
    # puts them where they belong instead of in the tokens theme.
    "repeatable-artifact-tokens": _m(produces=[R.ARTIFACT_TOKEN]),
    # The payoff side of the tokens bridge, and until now the whole of it was
    # missing. Every `cares_about(creature_token)` edge in the graph came from
    # the four `sacrifice-outlet` mappings above — 1,433 cards, all of them
    # aristocrats fodder-eaters, not one token payoff. A go-wide deck's
    # anthems, doublers and "whenever a token enters" cards read as caring
    # about nothing. `synergy-token` is the root of that branch and its
    # closure carries `synergy-token-creature` and `tokenfall` with it.
    "synergy-token": _m(cares=[R.CREATURE_TOKEN]),
    # Doublers and increasers (Anointed Procession, Mondrak, Primal Vigor).
    # Root of the branch, so `token-doubler` comes along in the closure.
    #
    # Cares only, deliberately. A doubler creates nothing on its own — it
    # multiplies whatever another card makes — and `produces` here would let
    # the composition layer count Anointed Procession as token supply in a
    # deck that has no token maker to double.
    "token-increaser": _m(cares=[R.CREATURE_TOKEN]),
    # A child of `tap-outlet`, so it already inherits `cares(untap_permanent)`.
    # What it does not say without this line is *which* permanents it taps:
    # Baylen, the Haymaker is the commander of a token deck and read as caring
    # about untap effects and nothing else.
    "tap-fuel-token": _m(cares=[R.CREATURE_TOKEN]),
    "gives-pp-counters": _m(produces=[R.PLUS_ONE_COUNTER]),
    "gains-pp-counters": _m(produces=[R.PLUS_ONE_COUNTER]),
    "repeatable-pp-counters": _m(produces=[R.PLUS_ONE_COUNTER]),
    # +1/+1 only. Asserting all four counter types over this closure gave every
    # counter kind the *identical* 1,308 consumers — including
    # `experience_counter`, which exists on **16 cards** in Magic. Mycoloth and
    # Primal Vigor (`pp-counters-matter`) and Staff of the Storyteller
    # (`counter-fuel-aesthetic`, Tagger's own tag for "counters with no rules
    # meaning") were all recorded as wanting a commander-only mechanic they
    # have no text for.
    #
    # The bridge does not lose its consumer side: the `proliferate` rule still
    # cares about every counter type, which is what it was added for.
    #
    # The mm subtree is subtracted rather than left to the closure. Tagger
    # hangs `mm-counters-matter` directly under this tag, so a Hapatra, a
    # Necroskitter and a Blowfly Infestation were all recorded as wanting
    # +1/+1 counters — 82 cards whose oracle text carries "-1/-1" and never
    # "+1/+1" were members of the +1/+1 counters theme, and EDHREC's
    # `minus-1-minus-1-counters` high-synergy list landed 8/10 inside it.
    # There is no narrower parent to pick: the polarity flip *is* a direct
    # child.
    "counters-matter": _m(cares=[R.PLUS_ONE_COUNTER], excludes=["mm-counters-matter"]),
    # The other polarity, given the term it never had. Producers and payoffs
    # both, so this is a bridge and not a supply-only resource: 224 + 74 cards
    # put the counters out, 57 + 11 pay them off.
    "gives-mm-counters": _m(produces=[R.MINUS_ONE_COUNTER]),
    "gains-mm-counters": _m(produces=[R.MINUS_ONE_COUNTER]),
    "mm-counters-matter": _m(cares=[R.MINUS_ONE_COUNTER]),
    "counter-fuel-mm": _m(cares=[R.MINUS_ONE_COUNTER]),
    # The broad claim, moved to the tag that actually means it — "Use any type
    # of counter as fuel", 32 cards instead of 1,308.
    "counter-fuel-any": _m(
        cares=[
            R.PLUS_ONE_COUNTER,
            R.MINUS_ONE_COUNTER,
            R.CHARGE_COUNTER,
            R.LOYALTY_COUNTER,
            R.EXPERIENCE_COUNTER,
        ]
    ),
    "counter-fuel-charge": _m(cares=[R.CHARGE_COUNTER]),
    "counter-fuel-loyalty": _m(cares=[R.LOYALTY_COUNTER]),
    # --- Trigger payoffs (the CARES_ABOUT side of the bridge) --------------
    "death-trigger": _m(cares=[R.DEATH_TRIGGER]),
    "death-trigger-self": _m(cares=[R.DEATH_TRIGGER]),
    "attack-trigger": _m(cares=[R.ATTACK_TRIGGER]),
    "attacking-matters": _m(cares=[R.ATTACK_TRIGGER]),
    "cast-trigger": _m(cares=[R.CAST_TRIGGER]),
    "cast-trigger-you": _m(cares=[R.CAST_TRIGGER]),
    "thingfall": _m(cares=[R.ETB_TRIGGER]),
    "saboteur": _m(cares=[R.COMBAT_DAMAGE_TRIGGER]),
    "landfall": _m(cares=[R.LANDFALL_TRIGGER]),
    # `delayed-trigger` used to map to `cares=[END_STEP_TRIGGER]`. The end step
    # is a timing, not a resource anything supplies — those cards do not want
    # an end step, they *are* the trigger. It bridged to nothing, by construction.
    "delayed-trigger": _m(produces=[R.END_STEP_TRIGGER]),
    # --- Combat and evasion ------------------------------------------------
    "evasion": _m(produces=[R.EVASION]),
    "power-boost-to-all": _m(produces=[R.POWER_BOOST]),
    "toughness-boost-to-all": _m(produces=[R.POWER_BOOST]),
    "power-matters": _m(cares=[R.POWER_BOOST]),
    # Also wants big bodies, not only pump: Fling, fights and Rishkar's
    # Expertise scale with whatever power is on the table. NOT mapped from
    # `power-matters` itself — its closure contains `synergy-low-power`
    # (Delney, Tetsuko), and "wants power 2 or less" gating a big-creature
    # theme is a polarity error. The `high_power_payoff` rule reads the
    # threshold out of oracle text instead; these four slugs carry the
    # phrasings the regex cannot see.
    "scales-with-power": _m(cares=[R.POWER_BOOST, R.HIGH_POWER]),
    "greatest-power-matters": _m(cares=[R.HIGH_POWER]),
    # Cheat effects want fatties in hand or library — Ilharg, Sneak Attack,
    # Kaalia, Elvish Piper. This is the intent side of stompy: nothing about
    # a sneak effect *is* big, it is only worth playing because something is.
    "sneak-creature": _m(cares=[R.HIGH_POWER]),
    "sneak-from-library": _m(cares=[R.HIGH_POWER]),
    "combat-trick": _m(produces=[R.POWER_BOOST]),
    "extra-combat-phase": _m(produces=[R.EXTRA_COMBAT], roles=[(Role.WINCON, 0.3)]),
    "extra-turn": _m(produces=[R.EXTRA_TURN], roles=[(Role.WINCON, 0.4)]),
    # --- Life --------------------------------------------------------------
    "lifegain": _m(produces=[R.LIFEGAIN]),
    "repeatable-lifegain": _m(produces=[R.LIFEGAIN]),
    # NOT `cares=[lifegain]`. Paying life is a cost, not a lifegain payoff —
    # that mapping bridged every fetchland to Soul Warden and reported an
    # Atraxa list as "16 cards want lifegain, 2 make it".
    "life-payment": _m(produces=[R.LIFE_PAYMENT]),
    # --- Typal and permanent-type synergies --------------------------------
    "typal": _m(cares=[R.TRIBAL_PAYOFF]),
    "typal-creature": _m(cares=[R.TRIBAL_PAYOFF]),
    "noncreature-typal": _m(cares=[R.TRIBAL_PAYOFF]),
    "synergy-artifact": _m(cares=[R.ARTIFACT_MATTERS]),
    "copy": _m(produces=[R.COPY_SPELL]),
    # --- Artifact-token economies ------------------------------------------
    "repeatable-treasures": _m(produces=[R.TREASURE]),
    "synergy-treasure": _m(cares=[R.TREASURE]),
    "repeatable-food": _m(produces=[R.FOOD, R.LIFEGAIN]),
    "synergy-food": _m(cares=[R.FOOD]),
    "repeatable-clues": _m(produces=[R.CLUE]),
    "synergy-clue": _m(cares=[R.CLUE]),
    # --- Blink -------------------------------------------------------------
    "flicker-creature": _m(produces=[R.BLINK], cares=[R.ETB_TRIGGER, R.LTB_TRIGGER]),
    "flicker-permanent": _m(produces=[R.BLINK], cares=[R.ETB_TRIGGER, R.LTB_TRIGGER]),
    "flicker-nonland": _m(produces=[R.BLINK], cares=[R.ETB_TRIGGER, R.LTB_TRIGGER]),
    # --- Misc --------------------------------------------------------------
    "pseudo-proliferate": _m(produces=[R.PROLIFERATE]),
    "synergy-proliferate": _m(cares=[R.PROLIFERATE]),
    # The storm bridge, both ends of it. `storm_count` means "many spells this
    # turn", which is a thing a deck *builds toward*, not a property of any one
    # cheap instant — see `instants_and_sorceries_supply_casts` in rules.py for
    # what it used to mean and why that was worth nothing.
    #
    # Produces: what actually gets the count up. Rituals (59) and the
    # instant/sorcery cost reducers (40 — Goblin Electromancer, Baral, Cloud
    # Key, Archmage of Runes) between them are 99 cards, so the resource can
    # discriminate instead of sitting on 18% of the corpus.
    #
    # NOT `free-cast-another`, though the name invites it. Its 371 cards are
    # the hideaway and cheat-into-play family — Mosswort Bridge, Windbrisk
    # Heights, Rishkar's Expertise, Etali — which cast one free spell off
    # exile and do nothing for a storm count. `donate-token` in a new place.
    "cost-reducer-instant": _m(produces=[R.STORM_COUNT]),
    "cost-reducer-sorcery": _m(produces=[R.STORM_COUNT]),
    # Cares: the payoffs. `storm-count-matters` (24) is Aetherflux Reservoir
    # and Thousand-Year Storm; `storm-like` (19) is the Dragonstorm/Empty the
    # Warrens family; `gives-storm` (4) grants the keyword. The 33 cards that
    # simply carry Storm come from the `storm_keyword` rule.
    "storm-count-matters": _m(cares=[R.STORM_COUNT]),
    "storm-like": _m(cares=[R.STORM_COUNT]),
    "gives-storm": _m(cares=[R.STORM_COUNT]),
    # `copy_spell` had 918 producers and zero consumers, and was declared
    # supply-only to say so. It is not: Storm-Kiln Artist, Archmage Emeritus,
    # Veyran, Ral Storm Conduit and Sedgemoor Witch are a payoff family with a
    # tag of its own, and they are the cards a spell-copy deck is built around.
    "synergy-copy": _m(cares=[R.COPY_SPELL]),
    # --- Filling resources the audit reported as having no edges at all -----
    "repeatable-blood": _m(produces=[R.BLOOD]),
    "synergy-blood": _m(cares=[R.BLOOD]),
    "powerstone-mana": _m(produces=[R.POWERSTONE]),
    # NOT `clone`. A clone enters as a copy of something — it *is* the copy,
    # and no token is created. The tag covers Copy Artifact, Mirrormade,
    # Sculpting Steel and Vesuva, which put a **land** in the tokens theme.
    # `clone` and `copy-token` are disjoint siblings under `copy`, so nothing
    # real is lost: the token-copy engines (Kiki-Jiki, Helm of the Host,
    # Splinter Twin) carry `repeatable-creature-tokens` and produce
    # `creature_token` on that axis already.
    "copy-token": _m(produces=[R.TOKEN_COPY]),
    "energy-generator": _m(produces=[R.ENERGY]),
    "counter-fuel-energy": _m(cares=[R.ENERGY]),
    "poison-opponents": _m(produces=[R.POISON_COUNTER]),
    "synergy-poison": _m(cares=[R.POISON_COUNTER]),
    "recursion-artifact": _m(produces=[R.RECURSION_TO_HAND], cares=[R.GRAVEYARD_ARTIFACT]),
    "regrowth-artifact": _m(produces=[R.RECURSION_TO_HAND], cares=[R.GRAVEYARD_ARTIFACT]),
    "animate-land": _m(produces=[R.LAND_ANIMATION]),
    "upkeep-cost": _m(produces=[R.UPKEEP_TRIGGER]),
    # Also closes the `lifegain` orphan: 2,426 cards gained life and nothing
    # was recorded as wanting it.
    "lifegain-matters": _m(produces=[R.LIFEGAIN_TRIGGER], cares=[R.LIFEGAIN]),
    "gives-haste": _m(produces=[R.HASTE_GRANT, R.ATTACK_TRIGGER]),
    "gains-haste": _m(produces=[R.HASTE_GRANT]),
    "magecraft": _m(cares=[R.MAGECRAFT_TRIGGER, R.CAST_TRIGGER]),
    # --- Taxing ------------------------------------------------------------
    #
    # This was one line, `"tax": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX,
    # 0.9)])`, and it did not mean what its name says. Tagger's `tax` closure is
    # 415 cards, of which **13** carry `cast-tax`. Measured composition: 227
    # `rhystic`, 169 `toll` (Soul Warden, Managorger Hydra — "whenever any
    # player does a thing, you get value") and **136 `ward`**, which Tagger files
    # here because ward reads "unless that player pays". Ward is protection, not
    # a tax.
    #
    # The consequence was silent and total: Thalia, Grand Arbiter Augustin IV,
    # Winter Orb and Smokestack produced **no** `tax_effect` at all, while 374
    # cards that do not tax anything produced it — and `Role.STAX` inherited the
    # same 415 cards, of which roughly 41 deserve it.
    #
    # Replaced with an explicit closure over the fifteen slugs that mean taxing.
    # 336 cards, overlapping the old set on only 32. Verified newly caught:
    # Thalia, Grand Arbiter, Sphere of Resistance, Thorn of Amethyst, Archon of
    # Emeria, Drannith Magistrate. Verified kept: Rhystic Study.
    #
    # Two gaps left open rather than papered over:
    #
    #   1. Discarding the `rhystic` subtree loses genuine taxers that have no
    #      other tag — The Tabernacle at Pendrell Vale, Amulet of Safekeeping,
    #      Power Taint, Lim-Dûl's Hex. They need a narrower predicate to recover.
    #   2. `cost-increaser` and `prevent-cast` carry a direction bug: roughly ten
    #      cards tax *you*, not your opponents (Jade Leech, Steel Golem,
    #      Nullhide Ferox, Derelor). A controller/opponent test belongs here and
    #      is not in this change. See the structural correction in `graph.py`.
    #
    # Winter Orb and Smokestack are still absent, and correctly so — they deny
    # resources rather than tax casts. That is `resource_denial`, a separate
    # member this change does not add.
    "cost-increaser": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.9)]),
    "cast-tax": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.9)]),
    "prevent-cast": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.9)]),
    "hatebear": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.9)]),
    "hate-storm": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "hate-flash": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "hate-off-turn-cast": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "hate-free-spell": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "hate-tutor": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "hate-nonhand-cast": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "kismet-effect": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.9)]),
    "hand-size-decrease": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "prevent-extra-turns": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.7)]),
    "tax-attack": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    "pillowfort": _m(produces=[R.TAX_EFFECT], roles=[(Role.STAX, 0.8)]),
    # Ward is "unless that player pays" on your own permanent — it protects the
    # creature, it does not tax the table. Mapped here so the 136 cards the tax
    # repair drops keep an edge rather than silently producing nothing.
    "ward": _m(produces=[R.PROTECTION]),
    # --- Resource denial ---------------------------------------------------
    # The other half of stax: not making things cost more, stopping them
    # happening. Winter Orb arrives via `mass-land-denial`, Smokestack via
    # `abyss`-adjacent slugs, Stasis by name. `prevent-activation` is
    # deliberately absent from this list — its closure holds the `detain`
    # subtree and 34 Pacifism-shaped Aura/Equipment shells, which are spot
    # removal, not denial. It is admitted pruned by a rule in `rules.py`.
    "mass-land-denial": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 1.0)]),
    "stasis": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 1.0)]),
    "abyss": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.9)]),
    "skip-untap-step": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 1.0)]),
    "hate-activation": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.9)]),
    "lockdown-land": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.9)]),
    "hate-ramp": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.8)]),
    "hate-nonbasic-land": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.8)]),
    "prevent-trigger": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.8)]),
    "hate-etb": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.8)]),
    "prevent-etb": _m(produces=[R.RESOURCE_DENIAL], roles=[(Role.STAX, 0.8)]),
    # --- Attachments -------------------------------------------------------
    # The measured closures already hold the whole family: `synergy-aura`
    # reaches uril-ability and synergy-modified (192 cards), `synergy-equipment`
    # reaches armament-ability and synergy-modified (223). `synergy-modified`
    # sits under both — deliberate, "modified" means either — which is how
    # Kodama of the West Tree gets both cares.
    "synergy-aura": _m(cares=[R.AURA_MATTERS]),
    "synergy-equipment": _m(cares=[R.EQUIPMENT_MATTERS]),
    # Found by scoring the themes against EDHREC's tag pages: their aura-deck
    # high-synergy list agreed with `voltron` at only 3/10, and the misses all
    # carried Tagger slugs mapped to nothing. `ethereal-armor` is the "+X for
    # each Aura/enchantment" payoff family — All That Glitters, Ancestral Mask,
    # Ethereal Armor itself — the exact cards an aura deck exists for. The two
    # tutor slugs are the attachment tutors (Open the Armory, Steelshaper's
    # Gift): fetching an Equipment is caring about Equipment.
    "ethereal-armor": _m(cares=[R.AURA_MATTERS]),
    "tutor-enchantment-aura": _m(cares=[R.AURA_MATTERS]),
    "tutor-artifact-equipment": _m(cares=[R.EQUIPMENT_MATTERS]),
    # --- Vehicles ----------------------------------------------------------
    # The cares side only. Vehicles themselves are read off the type line by
    # `permanents_supply_their_own_type`, so the tags worth mapping are the ones
    # whose closures are *not* mostly Vehicles: `synergy-vehicle` is 116 cards
    # of which 19 are Vehicles, `animate-vehicle` 15 of which 3. `crew` (182,
    # all 182 Vehicles), `alternative-crewing` and `crewless-vehicle` are
    # entirely the supply side and would only restate the structural edge.
    "synergy-vehicle": _m(cares=[R.VEHICLE_MATTERS]),
    "animate-vehicle": _m(cares=[R.VEHICLE_MATTERS]),
    # --- Tapping your own creatures ----------------------------------------
    # Tagger splits this payoff family exactly the way the vocabulary needs it:
    # `tapped-matters-self` (24) is "permanents that care about being tapped"
    # — every Survival creature, Kalamax, Archelos — and `synergy-tapped` (45)
    # is "effects that care about *your* tapped permanents" — Far Traveler,
    # Throne of the God-Pharaoh, Dragonscale General.
    #
    # `hate-tapped` is subtracted rather than trusted to stay out. Tagger files
    # Split Up and Thousand Winds under both, and a card that sweeps tapped
    # creatures is the opposite of one that wants yours tapped — exactly the
    # polarity the resource's own doc comment exists to protect.
    #
    # `uninspired` — "effects that trigger when something becomes tapped", 141
    # cards — is deliberately NOT mapped. It is polarity-blind: Psychic Venom,
    # Verity Circle and Gideon's Avenger sit in it beside Emmara, and there is
    # no narrower parent to pick. `rules.py` reads that family off the text
    # with a "you control" guard instead.
    "tapped-matters-self": _m(cares=[R.TAP_OWN_CREATURE], excludes=["hate-tapped"]),
    "synergy-tapped": _m(cares=[R.TAP_OWN_CREATURE], excludes=["hate-tapped"]),
    # Mapped to nothing on purpose, the `mana-sink` treatment: 156 cards that
    # *punish* a tapped permanent — Royal Assassin and the sweepers that only
    # hit tapped creatures — which is removal, not a resource. It is listed so
    # the two exclusions above name a slug this file actually knows about.
    "hate-tapped": _m(),
    # --- Poison ------------------------------------------------------------
    # `poison-opponents` and `synergy-poison` were already mapped; these close
    # the rest of the family. The keyword carriers themselves (Infect, Toxic)
    # arrive via a `rules.py` predicate on `c.keywords` — Tagger's slugs only
    # reach the grant-effects.
    "poisonous": _m(produces=[R.POISON_COUNTER]),
    "gives-infect": _m(produces=[R.POISON_COUNTER]),
    "gains-infect": _m(produces=[R.POISON_COUNTER]),
    "gives-toxic": _m(produces=[R.POISON_COUNTER]),
    "gains-toxic": _m(produces=[R.POISON_COUNTER]),
    "gives-poisonous": _m(produces=[R.POISON_COUNTER]),
    "synergy-infect": _m(cares=[R.POISON_COUNTER]),
    "synergy-toxic": _m(cares=[R.POISON_COUNTER]),
    "synergy-enchantment": _m(cares=[R.ENCHANTMENT_MATTERS]),
    "untapper-creature": _m(produces=[R.UNTAP_CREATURE]),
    "untapper-land": _m(produces=[R.UNTAP_LAND]),
    "untapper-artifact": _m(produces=[R.UNTAP_ARTIFACT]),
    # Evasive creatures are what a saboteur trigger is waiting for.
    "gives-evasion": _m(produces=[R.EVASION, R.COMBAT_DAMAGE_TRIGGER]),
    # --- Keyword breadth (Odric / Kathril) ----------------------------------
    # Breadth payoffs — Odric, Lunarch Marshal shares every keyword among your
    # creatures, Kathril, Aspect Warper turns them into keyword counters from
    # the graveyard — want the deck full of bodies carrying many of the twelve
    # keyword-counter keywords (Flying, First strike, Double strike,
    # Deathtouch, Haste, Hexproof, Indestructible, Lifelink, Menace, Reach,
    # Trample, Vigilance). `keyword-soup` is Tagger's own hand-curated
    # archetype membership: 23 cards — Odric (both), Kathril, Cairn Wanderer,
    # Soulflayer, Majestic Myriarch, Rayami, Animus of Predation, Selective
    # Adaptation, Urborg Scavengers, Death-Mask Duplicant, Crystalline Giant,
    # Eater of Virtue, Concerted Effort … A couple of members (Crystalline
    # Giant, Eater of Virtue) are enablers rather than payoffs — accepted
    # imprecision at n=23.
    "keyword-soup": _m(cares=[R.KEYWORD_SOUP]),
    # The produces side's tagged half: closure 140, `flying-counter`,
    # `deathtouch-counter` and the rest of the per-keyword children — cards
    # that create keyword breadth by putting a keyword counter on a creature.
    # The other producer — a creature that already carries two or more of the
    # twelve keywords printed — is the `keyword_rich_bodies` rule in
    # rules.py; Tagger has no tag for a body, only for the counter-putters.
    # `keywords-matter` (7 taggings, none in corpus) and `references-keyword`
    # (noise: Thousand-Year Storm) are deliberately not mapped.
    "keyword-counter": _m(produces=[R.KEYWORD_SOUP]),
}

# Any card that wants a resource but fills no other role is, by definition, a
# synergy payoff. Deriving this beats hunting for a "payoff" tag that does not
# exist, and it fills the largest composition bucket.
DERIVE_PAYOFF_WEIGHT = 0.6


def unmapped_resources() -> set[R]:
    """Vocabulary resources no tag currently reaches.

    These are the gaps Layer C (the LLM) and the deterministic rules must
    cover; surfaced as a test so the list stays honest.
    """
    reached = {r for m in MAPPINGS.values() for r in (*m.produces, *m.cares_about)}
    return set(R) - reached


def unmapped_roles() -> set[Role]:
    reached = {role for m in MAPPINGS.values() for role, _ in m.roles}
    return set(Role) - reached
