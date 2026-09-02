"""Candidate generation — ranked adds, with provenance.

Three retrieval channels, unioned and scored. No LLM: this stage decides *what
is plausible*, and every result carries the reason it surfaced.

  edhrec_synergy     Empirical. EDHREC's synergy score — inclusion rate for this
                     commander minus the card's baseline rate. Says what people
                     actually run. A bracket-5 deck (`is_cedh(speed)`) with a
                     large enough cEDH sample also reads the commander's
                     `/cedh` subpage — `edhrec_synergy_cedh`, scored on its
                     own weight because that page runs much hotter synergy.
  resource_bridge    Mechanical. Cards supplying a resource the deck wants more
                     of than it makes, matched through the resource hierarchy.
                     This is the channel that justifies the graph: it works on
                     cards with no decklist history and finds off-meta answers
                     popularity data structurally cannot.
  combo_completion   Curated. Commander Spellbook combos the deck is exactly one
                     card short of.

A card found by more than one channel scores higher than the sum of its parts.
That fusion is the whole thesis — empirical and mechanical agreeing is much
stronger evidence than either alone — so it is an explicit bonus, not an
accident of addition.

`vector_knn` from the plan is deliberately absent. It needs an embedding index
and exists to cover underfilled roles when structured retrieval comes up short;
until the three concrete channels are measured (Phase 8), adding a fuzzy one
would make the measurement harder to read, not better.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import structlog
from pydantic import BaseModel, Field

from .composition import SPEED_BRACKET_FIVE, is_cedh
from .poolquery import PoolFilter
from .power import weight_within_group
from .type_targets import CEDH_MIN_DECKS
from .vocabulary import Resource, Role

if TYPE_CHECKING:
    from .diagnostics import Diagnostics
    from .themes import Theme

log = structlog.get_logger(__name__)

# Combo lookup runs on a thread overlapped with the graph work. With the combo
# corpus ingested it is a ~10ms local query and the overlap is free; on the
# pre-ingest HTTP fallback it is the ~3s Spellbook round trip that used to
# dominate /suggestions wall-clock, and the overlap is the difference between
# adding that to the graph work and hiding the graph work inside it. A small
# shared pool, not a thread per request: under load combos queue rather than
# multiplying sockets.
_SPELLBOOK_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="spellbook")

# Channel weights. Deliberately blunt: these are starting points to be moved by
# the Phase 8 eval, not tuned constants. Recording them here rather than
# scattering magic numbers keeps that honest.
WEIGHT_EDHREC = 1.0
# cEDH pages run much hotter synergy than the casual page `WEIGHT_EDHREC`
# was measured against — see the `edhrec_synergy_cedh` row in the second
# measured table below.
WEIGHT_EDHREC_CEDH = 0.3
# How much the *casual* page is worth once the cEDH page has answered for the
# same seat.
#
# The two channels are layered, not swapped: the cEDH page holds ~200 cards to
# the casual page's ~275, so dropping the casual one outright would cost real
# recall, and a card both pages recommend deserves to read as doubly evidenced.
# But layering them at face value put the ordering exactly backwards. Measured
# at speed 1.0 over six cEDH commanders, the casual channel emitted a 1.72
# median against the cEDH channel's 0.89 — so for a deck that has *claimed*
# cEDH, a card only the casual page knows outranked a card only the cEDH page
# knows, which is the complaint this whole round exists to answer.
#
# Damping the casual side is the honest correction rather than inflating the
# cEDH side: when a better-matched corpus has answered, the casual page is not
# wrong so much as *about a different deck*, and evidence about a different
# deck should count for less. Inflating cEDH instead would have pushed it past
# `combo_completion` and flattened every shape channel under it. Same shape as
# `_basic_scale`, which already damps a channel's voice as the bracket climbs.
#
# 0.4 puts the casual channel at ~0.69 against cEDH's ~0.89 — cEDH evidence
# now leads, both stay in the same band as `fixing_lands` (0.83), and neither
# swamps `role_gap` (0.42).
EDHREC_CASUAL_SCALE_AT_CEDH = 0.4
WEIGHT_BRIDGE = 0.8
WEIGHT_COMBO = 0.9
WEIGHT_ROLE = 0.7
# **The constants above are not on a common scale, and this is where that bit.**
#
# Each channel multiplies its weight by a different, undocumented factor —
# EDHREC by `synergy * 10`, the theme channel by `fit * (0.25 + playability)`,
# the bridge by `min(gap, 6) / 2 * weight * specificity`. So a reader comparing
# `WEIGHT_THEME = 1.2` against `WEIGHT_ROLE = 0.7` and concluding a theme hit
# outweighs a role gap was comparing numbers in different units. This comment
# used to make exactly that claim.
#
# Measured over six decks (Prosper, Atraxa, Sram, Anje, Veyran, Baylen), the
# per-hit score each channel actually emits:
#
#     channel              n   median     p90      max
#     basic_lands         14     8.00    8.00     8.00
#     fixing_lands       100     1.70    1.96     2.36
#     combo_completion    58     1.12    1.12     1.12
#     edhrec_synergy     242     0.67    1.38     2.40
#     resource_bridge     54     0.56    1.05     1.60
#     role_gap           217     0.48    0.57     0.70
#     typal_bridge        16     0.23    0.26     0.27
#     theme_fit           68     0.19    0.33     0.38
#
# `theme_fit` was the weakest positive channel in the layer — and it is the one
# carrying the user's explicit "argue for this". Pinning a theme summed to 3.76
# against EDHREC's 140.85 across a 45-card answer, so a pin moved Xorn from
# 8.30 to 8.52 and the returned list was byte-identical. That is the defect
# this split exists to fix.
#
# Reproduce the table with `deck-lab channel-scale`.
#
# The same table at **speed 1.0**, measured over every commander whose `/cedh`
# subpage is cached in this dev stack — 41 of them (`ls /data/edhrec/*/cedh.json`;
# Animar, Baylen, Breya, Chatterfang, Derevi, Dihada, Esika, Etali, Fire Lord
# Azula, Flubs, Glarb, Godo, Gwenom, Hashaton, Heliod, Jhoira, Kaalia, Kefka,
# Kenrith, Kess, Kinnan, Korvold, Krenko, K'rrik, Lumra, Magda, Najeela,
# Niv-Mizzet, Selvala, Shorikai, Sisay, Slicer, Talion, The Gitrog Monster,
# Urza, Vivi Ornitier, Y'shtola, Yuriko, Zhulodok, Zirda, Zur), each seeded
# from its own `/cedh` page, with `WEIGHT_EDHREC_CEDH = 0.3` and
# `EDHREC_CASUAL_SCALE_AT_CEDH = 0.4`:
#
#     channel                n   median      p90      max
#     combo_completion     629     3.60     3.60     3.60
#     basic_lands           45     1.50     3.00     4.33
#     fixing_lands         172     0.84     1.65     2.36
#     edhrec_synergy_cedh 1718     0.74     1.36     2.04
#     edhrec_synergy      1807     0.57     1.51     2.71
#     role_gap             712     0.45     0.64     0.89
#     resource_bridge      148     0.33     0.67     1.00
#     typal_bridge         176     0.26     0.33     0.47
#     tutor_access          85     0.23     0.51     0.82
#     theme_fit            258     0.17     0.22     0.38
#
# Two things worth reading off it. The cEDH channel leads the casual one (0.74
# to 0.57), which is the ordering a deck that claimed cEDH should get and is
# *not* what layering the two at face value produces — undamped
# (`EDHREC_CASUAL_SCALE_AT_CEDH = 1.0`), the casual channel outweighs the cEDH
# one, exactly the "Champion of Lambholt over Silence" defect this round
# exists to fix. And the damped casual channel's 0.57 sits close to the 0.67
# it has always emitted elsewhere (a real commander mix skews the exact number
# either way — the six-commander pass this table replaces read 0.63), so
# bracket 5 is where the casual page finally behaves like every other channel
# rather than dominating the answer.
#
# Reproduce with `deck-lab channel-scale --speed 1.0 --commanders "..."`, which
# seeds each deck from the same corpus it is measuring.

# A theme the user *declared* — pinned, or the target of a focus. Priced
# against EDHREC's p90 (1.38) rather than its median, because a declared theme
# is a stronger statement than "cards that go with your commander": at a
# typical fit of 0.8 and playability 0.1 this emits 1.40. It stays a score and
# not an override — `_reserve_pinned_slots` is what guarantees the theme a
# place in the answer, and doing that with weight alone would need a number
# big enough to bury the mana base.
WEIGHT_THEME_DECLARED = 5.0
# Detected themes — typal's trigger, generalised. A pin says "argue for
# landfall"; the deck's own profile says "this *is* a counters deck" without
# anyone typing it, exactly as the typal channel already anchors on the
# deck's own tribe. Nobody declared it, so the evidence is priced below a
# pin and scaled by how much of the deck reads that way.
#
# Deliberately left where it was when `WEIGHT_THEME_DECLARED` moved. This is
# the weight on every request that pins nothing, so raising it would change
# the ranking for decks whose owners never asked for anything — the opposite
# of the complaint. The gap between the two is now the whole point: before
# the split, pinning a theme the deck already read as merely swapped one
# formula for another of near-identical magnitude (a 1.3-2.3x factor on ~1%
# of the total), which is why it looked like nothing happened.
WEIGHT_THEME_DETECTED = 0.9
# A theme below this share is a whisper, not an identity — and only the two
# loudest fire, mirroring the restraint of `report.typal[:3]`.
DETECTED_THEME_FLOOR = 0.15
DETECTED_THEME_LIMIT = 2
# The voiceless-seat voice: a commander with no EDHREC page (obscure Rule 0
# picks; Far Traveler is tombstoned outright) contributes nothing through the
# empirical channel, and the deck-wide theme read cannot speak for it until
# the deck already holds its cards — measured live on a WRG zone whose white
# seat fits `blink` at 1.00 while the deck read blink at 0.078: three white
# cards in the top 120, ranked 98th and below, the zone's whole white leg
# silent. The graph still knows what the seat *is*, so its strongest themes
# are argued the way `/replace` argues a cut slot's — the same floor and cap
# as `derived_pins` (see `REPLACE_THEME_FLOOR` in cuts.py; re-derived here
# because cuts imports this module) — and quietly: `SEAT_VOICE` takes the
# detected formula's share term at its floor, scaled by how well the
# commander fits the theme, which is the one piece of evidence this voice
# has.
SEAT_VOICE = 0.5
SEAT_VOICE_THEME_LIMIT = 2

# The seat grant: `commander_matters` argued from the command zone's *size*,
# for a deck that fields two or more commanders while running none of the
# family. Detection stays honest — the radar reads zero, `deck_theme_breakdown`
# multiplies and never grants — which is exactly why this lives on the
# retrieval side: four seats are a reason to play Bastion Protector, not
# evidence that the deck already does. `seat_scale(seats) - 1.0` takes the
# detected formula's `(0.5 + 0.5 * share)` seat: 0.35 at two seats, ~0.55 at
# three, 0.70 at four — a partner pair argues below any detected theme's floor
# multiplier, a Rule 0 zone of three like a detected theme at an ~11% share.
# The typal axis. Weighted near EDHREC because for a deck that *has* a tribe the
# tribe is the deckbuilding constraint — not a preference to be balanced against
# the others. It is scaled by the type's share of the deck, so a deck with no
# tribe contributes nothing rather than being nudged toward one.
WEIGHT_TYPAL = 1.0

# Evidence strength by relation, from `channel_typal`. A card that cares about
# Goblins is a payoff and the scarce half of the bridge; one that makes them
# supplies it; one that merely is a Goblin is a body, and bodies are abundant.
#
# The spread is deliberately narrow. An earlier version ran 1.0/0.7/0.45 and,
# multiplied by share and by playability, drove a typal hit to ~0.07 against
# `role_gap`'s ~0.21 and `combo_completion`'s flat 1.8. The eval caught it
# exactly as the arm design intends: `typal_only` found 80 of 210 held-out
# cards, and only 10 of them survived into the top 25 of the mechanical arm.
# Retrieval was never the problem; the channel was priced out of its own hits.
TYPAL_RELATION_WEIGHT = {
    "CARES_ABOUT_TYPE": 1.0,
    "MAKES_TYPE": 0.8,
    "IS_TYPE": 0.7,
}

# Candidates a short bucket contributes to the pool, and the depth each of its
# roles is retrieved to. The two are the same number but not the same job: the
# retrieval depth is per role (see CHANNEL_ROLES), so a six-role bucket reads
# well past this before the best of them are kept. Capping the contribution is
# what keeps a large shortfall in one bucket from crowding out every other gap
# the deck has.
PER_BUCKET_LIMIT = 25
MULTI_CHANNEL_BONUS = 0.5

# Cards of bucket shortfall at which a shortfall's urgency stops growing —
# the shortfall belongs in the *reason*, not the magnitude (see
# `_role_provenance`). The fill solver's piecewise under-penalty saturates at
# the same depth by importing this, so "the solver prices a famine exactly as
# the ranking does" is enforced rather than asserted in a comment.
ROLE_SHORTFALL_SATURATION = 4

# Supply-side connection: a payoff is on-profile when the deck already makes
# more of the resource it consumes than it spends. Both floors keep the
# signal meaningful: a surplus of one card is noise, and a surplus of a
# resource vaguer than the corpus average (relative IDF < 1 — half the deck
# produces "etb trigger") says nothing about what the deck is doing.
SUPPLY_SURPLUS_FLOOR = 2
SUPPLY_IDF_FLOOR = 1.0

# Resources retrieval must never shop directly, however real the deficit.
# `tribal_payoff` is the one member today: `creatures_supply_typal`
# (graph.py) gives every creature in the corpus a PRODUCES edge to it, on
# purpose — the correction's own comment there explains why the balance
# needs the fact that a producer exists at all. That makes it the vaguest
# resource in the corpus (relative IDF 0.138), so a deficit here reads as
# "any creature qualifies" to a bridge with no specificity check — a Dragon
# deck's gap gets offered Human Shamans and Goblin lords alike. The typal
# axis already models *which* type (`channel_typal`, the on-profile boost);
# this resource-level deficit is not actionable by retrieval, for any deck.
# Not an IDF floor: the deficit stays real and visible in diagnostics
# (`wanted`, below) — only retrieval is blind to it.
BRIDGE_UNSHOPPABLE = frozenset({"tribal_payoff"})

# One flat multiplicative boost for a synergy_wincon candidate connected to
# the deck's own strategy — by tribe, theme, or resource surplus — applied
# once, never stacked. Still an unmeasured starting point.
ON_PROFILE_BOOST = 1.5

# Commander-page corroboration for synergy_wincon candidates: a card in 40%
# of this commander's decks is deck-relative evidence, the good kind of
# popularity. Scaled by inclusion so 2% and 60% are not the same argument:
# score *= 1 + SPAN * inclusion_rate (≤ 1.5x at a hypothetical 100%).
EDHREC_CORROBORATION_SPAN = 0.5
# The guardrail: corroboration only fires when the deck demonstrably plays
# like the commander's usual builds. Below the overlap floor the page's
# inclusion rates describe someone else's deck — an off-theme build must
# not be dragged back toward the usual one. A deck below the size floor
# has not declared a strategy yet, which proves nothing either way, so
# corroboration stays off until it has. Basics are excluded from the
# overlap on both sides — thirty Mountains say nothing about strategy.
PAGE_OVERLAP_FLOOR = 0.25
PAGE_OVERLAP_MIN_DECK = 20

# Type saturation: a flat demotion for every candidate whose primary type the
# deck is already over target on. Flat per type, not scaled per card, because
# saturation is a fact about the *deck* — the goal is fewer creatures
# suggested, not a reshuffle of which creatures, so the ordering among them
# is deliberately preserved. Scaled by how far over the deck is and capped a
# shade under a combo's flat 1.8: at its loudest, saturation argues against
# a creature almost as hard as a completed combo argues for one, never
# harder. At the observed failure mode (40 creatures against a high of ~35)
# the demotion is −1.3 — a single-channel mid creature nets ≈0 and sinks
# below any noncreature with a reason to exist; a multi-channel standout
# survives with the demotion on display.
WEIGHT_TYPE_SATURATION = 1.5
TYPE_SATURATION_RAMP = 6.0  # cards over target at which the demotion saturates

# The same idea one axis over: a card that joins a bucket the deck is already
# past the top of. Types answer "too many creatures"; buckets answer "too much
# interaction", which is the question a composition report actually raises and
# the one nothing was asking of the adds.
#
# Weighed against the channels it competes with rather than against the type
# penalty: `edhrec_synergy` multiplies synergy by ten and reaches 7 on a
# well-covered commander, so a demotion of 1.5 moves ranks without ever
# silencing a card the empirical layer is certain about. That asymmetry is
# deliberate — a bucket being full is a reason to prefer something else, not
# a reason to refuse a card three other channels agree on.
WEIGHT_BUCKET_SATURATION = 1.5
# Cards over the corridor at which the demotion stops growing. Buckets run
# larger than type counts — a mana base is thirty-odd cards — so this is
# wider than TYPE_SATURATION_RAMP.
BUCKET_SATURATION_RAMP = 8.0

# The asymmetry check (Task C3, cEDH Pro round): a stax/hate candidate that
# would hose the pilot's own board about as much as the table's is demoted,
# never banned — `_apply_type_saturation`'s shape exactly, and weighed the
# same (1.5, alongside the other two demotion passes) for the same reason:
# a card three other channels agree on should lose rank, not disappear.
WEIGHT_ASYMMETRY = 1.5

# Basic lands: the one under-representation the adds list must shout about.
# Every other channel excludes cards already in the deck and prices a gap on
# a saturating curve — correct for spells, absurd for a mana base: an 88-card
# mono-red deck on 9 lands does not want a slightly better spell, it wants
# Mountains before anything else. The score is proportional to the Land
# shortfall against the commander-conditioned type target and keeps climbing
# far past every fused spell score: ~1.0 at 3 lands short (a strong staple's
# voice), capped only against absurd input. Basics are merged directly
# rather than retrieved, because they are the one suggestion the
# already-in-deck filter must not veto — singleton does not apply, and
# owning nine Mountains is no argument against a tenth.
#
# The shortfall is measured to the target's *centre*, not the range's low
# edge. The range is a tolerance band for the report; the empirical mean is
# what the archetype actually runs, and pricing the gap to the low edge let
# the channel fade to silence 4–8 lands under it — a Necrobloom deck at 25
# lands against a 39 mean scored as 6 short, not 14, and heard less about
# lands with every one it added. The gate stays on the row's `low` status:
# inside the band the deck is fine, below it the argument is to the mean.
#
# Devalued as power rises: an optimized mana base answers a land shortfall
# with fetches and duals, so at brackets 4-5 a basic is a weaker form of the
# same advice, not a different diagnosis. The scale damps the *voice*, never
# the shortfall — the type targets do not move with speed (recorded gap in
# `type_targets.py`), so this is the mana-base channel's only speed response.
# Floored at half rather than ramping to zero: a cEDH deck nine lands short
# still needs land drops before better spells, it just wants them less
# loudly in basic form.
#
# Exempt from the damping: decks where lands are the payoff. The fetches-
# and-duals rationale inverts for a landfall deck — land quantity (and for
# name-counting commanders, land *names*) is the strategy, and a bracket-4
# Necrobloom wants its basics at full voice. The exemption fires on either
# evidence: a land-name payoff in the deck (mechanical, per-card) or a
# landfall share in the theme profile. The share floor sits below the 0.35
# "decisive identity" bar deliberately — even a secondary lands theme wants
# its land count — and 0.2 is a judgment stated as one.
WEIGHT_BASIC_LAND = 1.0
BASIC_LAND_RAMP = 3.0  # cards short per weight-unit of score
BASIC_LAND_CAP = 8.0
BASIC_FLOOR_BRACKET_FIVE = 0.5
LANDS_THEME_SHARE_FLOOR = 0.2

# Fixing lands: the other half of the mana base. The basics channel says when
# there are not enough lands; this one says when they are the wrong ones — a
# statement no other channel could make, because a fetch's EDHREC synergy is
# ~0 everywhere (baseline-popular) and the mana-sources quota ranks lands by
# global playrate with no idea what fixes *this* identity. The target is a
# blunt 6 fixing lands per colour — 12 for a two-colour deck, 30 for five —
# a starting point for the eval to move, like every channel weight. Scored
# per candidate through `weight_within_group` so Command Tower speaks over an
# obscure gate.
#
# Sized to be heard: at half this weight the observed failure — an Orzhov
# deck on 35 basics and 2 fixing lands — put Command Tower at 0.78 against
# a top-40 cut of ~2.0, and the channel was a whisper into a void. Ten
# short is a colour-screwed mana base and argues like a strong staple
# (~2.4 after the rank weight); two short tapers to ~0.5. Capped well under
# the basics famine: a deck that cannot make land drops hears about
# Mountains first; one that can hears how to untangle its colours.
# Mono-colour decks skip it — their lands cannot be the wrong colour.
WEIGHT_FIXING_LAND = 1.0
FIXING_LANDS_PER_COLOR = 6
FIXING_RAMP = 4.0  # fixing lands short per weight-unit of score
FIXING_CAP = 2.5
FIXING_LIMIT = 20

# Tutor access — the bracketed channel that fixes Kess and other toolbox decks.
# Unlike combos/game changers, tutors are legal and normal at *every* bracket,
# so the ramp does not floor at zero. WotC's brackets place no restriction on
# tutors anywhere (they are not called out in the bracket document at all),
# so this ramp models what changes with power: *how many* tutors, and *how hard*
# the shortfall argues.
#
# TUTOR_TARGET_BRACKET_FIVE is a judgment call, not a measured number —
# type_targets.py's own docstring documents that EDHREC aggregates carry no
# bracket conditioning, so there is no corpus to measure this against. It
# first shipped at 3, and the round's own headline deck showed that was too
# timid: a bracket-4 Kess holding 4 tutors read as satisfied (target 2.5),
# so Demonic Tutor rode on role_gap alone — and one forgotten corridor
# override on synergy_wincon made him vanish entirely. The channel exists
# to be the corridor-immune voice for tutors; a ceiling the bracket's real
# decks exceed by half makes it mute exactly where it matters. Anchored
# instead to what lists actually run: cEDH staples come to ~7-10 tutor
# effects, optimized bracket-4 lists ~4-6. A ceiling of 6 puts bracket 4
# (speed 0.75) at ~4.75 — a deck on 4 tutors hears a nudge, not a famine.
TUTOR_TARGET_BASE = 1  # what any deck, any bracket, is assumed to want
TUTOR_TARGET_BRACKET_FIVE = 6  # anchored to real cEDH tutor counts, see above

# The bracket is not the only thing that raises tutor demand: a combo line is
# a *specific* set of cards, and a deck holding several complete lines needs
# to find them, not merely draw at random — tutors are how combos leave the
# ninety-nine and reach play. So the deck's own complete-combo count sets a
# second floor under the target: one tutor per line it already runs, capped —
# past the cap more lines share the same tutors, they do not each demand a
# fresh one. Counted from Spellbook's `included` list, which the channel
# already fetches and previously threw away.
TUTOR_COMBO_TARGET_CAP = 8

# The combo channel is capped. Uncapped it flooded: a bracket-4 Kess list got
# ~30 of its 45 suggestions from this channel, every one at the same flat
# boosted score — there is an upper limit to how many lines one deck can
# support, and thirty interchangeable completions crowd out every staple,
# role and theme argument. The strongest few by Spellbook popularity (then
# playability) speak; the rest are counted in a note. Twelve is a judgment
# call sized against the 45-slot window: still a strong voice at the
# brackets where combos are the point, no longer two thirds of the answer.
COMBO_SUGGESTION_LIMIT = 12

# The joker bump: in play, a tutor *is* a combo completion for a deck whose
# lines are already in the ninety-nine — it fetches whichever piece is
# missing from hand, where a named completion only ever adds one specific
# piece. So once the deck holds enough complete lines, piece-finding tutors
# (hand or top destinations — see `joker_destinations` in graph.py) score on
# the combo channel's own power ramp, not just the quota shortfall. Value
# grows with the lines a joker can serve: `min(lines, cap) / cap` of a full
# completion's score, so at `TUTOR_COMBO_TARGET_CAP` lines a Demonic Tutor
# argues exactly like a completion, and below the gate the bump is silent —
# one line makes a tutor a redundant copy, not a joker. Four is the gate the
# user who reported the gap named ("once the deck contains 4-6 combos").
TUTOR_JOKER_MIN_LINES = 4
WEIGHT_TUTOR_ACCESS = 0.7  # ~WEIGHT_ROLE; this replaces role_gap's silent share for tutors
TUTOR_RAMP = 3.0  # tutors short per weight-unit of score
TUTOR_CAP = 2.5

_BASIC_FOR_COLOR = {
    "W": "Plains",
    "U": "Island",
    "B": "Swamp",
    "R": "Mountain",
    "G": "Forest",
}


def _basic_names(identity: list[str]) -> list[str]:
    """The basics a deck of this identity can run. Colourless decks get Wastes."""
    names = [_BASIC_FOR_COLOR[c] for c in identity if c in _BASIC_FOR_COLOR]
    return names or ["Wastes"]


def _suggested_land_names(identity: list[str], counts_land_names: bool) -> list[str]:
    """The basics to merge, doubled with snow twins where land names count.

    The Necrobloom and Field of the Dead count lands with *different names*,
    and a snow-covered basic is the one extra name a mana base gets for free —
    those decks run Swamp and Snow-Covered Swamp side by side. Every basic
    including Wastes has a snow printing, so the twin is built by prefix
    rather than a second table.
    """
    names = _basic_names(identity)
    if counts_land_names:
        names += [f"Snow-Covered {name}" for name in names]
    return names


def _basic_scale(speed: float, *, lands_theme: bool = False) -> float:
    """Full voice through bracket 3, ramping down across 4, floored at cEDH.

    `lands_theme` skips the ramp entirely: when lands are the deck's payoff
    the fetches-and-duals rationale for damping is inverted, at any speed.
    """
    if lands_theme or speed < SPEED_BRACKET_FOUR:
        return 1.0
    if speed >= SPEED_BRACKET_FIVE:
        return BASIC_FLOOR_BRACKET_FIVE
    position = (speed - SPEED_BRACKET_FOUR) / (SPEED_BRACKET_FIVE - SPEED_BRACKET_FOUR)
    return 1.0 - position * (1.0 - BASIC_FLOOR_BRACKET_FIVE)


def _fixing_provenance(row: dict, current: int, target: int, colors: int) -> Provenance:
    shortfall = target - current
    return Provenance(
        channel="fixing_lands",
        detail=f"fixes {colors} colours — {current} fixing lands against ~{target}",
        code="fixing-lands",
        params={"colors": str(colors), "current": str(current), "target": str(target)},
        score=WEIGHT_FIXING_LAND
        * min(shortfall / FIXING_RAMP, FIXING_CAP)
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
        key="Land",
    )


def _basic_land_provenance(count: float, low: float, high: float, scale: float = 1.0) -> Provenance:
    # The shortfall runs to the target's centre — the empirical mean,
    # recovered as the midpoint since Land's half-width is flat and its low
    # never clips — not to the band's low edge. See the channel comment.
    target = (low + high) / 2
    shortfall = target - count
    detail = f"deck runs {count:.0f} lands against a target of ~{target:.0f} ({low:.0f}–{high:.0f})"
    # Provenance, not a silent reweight — same contract as combo damping.
    if scale < 1.0:
        detail += " · damped at this speed"
    return Provenance(
        channel="basic_lands",
        detail=detail,
        code="basic-lands-damped" if scale < 1.0 else "basic-lands",
        params={
            "amount": f"{count:.0f}",
            "target": f"{target:.0f}",
            "low": f"{low:.0f}",
            "high": f"{high:.0f}",
        },
        score=WEIGHT_BASIC_LAND * min(shortfall / BASIC_LAND_RAMP, BASIC_LAND_CAP) * scale,
        key="Land",
    )


def _tutor_target(speed: float, deck_size_scale: float = 1.0, complete_combos: int = 0) -> float:
    """How many nonland tutors a deck at this speed is expected to run.

    Flat at `TUTOR_TARGET_BASE` through bracket 3 — tutors carry no bracket
    restriction, so there is no floor-at-zero the way combos have one below
    bracket 3. Climbs from bracket 4's `SPEED_BRACKET_FOUR` (the same
    boundary `_power_scale` uses) to `TUTOR_TARGET_BRACKET_FIVE` at
    `SPEED_BRACKET_FIVE` and flat after — cEDH is a format, not a louder
    bracket 4, same rationale as `_power_scale`'s ceiling.

    `complete_combos` is the deck's own count of complete Spellbook lines,
    and it floors the target at one tutor per line (capped at
    `TUTOR_COMBO_TARGET_CAP`): a combo has to be *found* before it is
    played, so a combo-dense deck wants tutors regardless of what the
    bracket alone would ask. Gated at bracket 3, the same line below which
    combos are not scored at all — the caller cannot even hand a count in
    below it, because the Spellbook fetch is never made. Deliberately not
    scaled by deck size: five lines need finding whether they sit in 60
    cards or 99.
    """
    if speed < SPEED_BRACKET_FOUR:
        target = TUTOR_TARGET_BASE
    elif speed >= SPEED_BRACKET_FIVE:
        target = TUTOR_TARGET_BRACKET_FIVE
    else:
        position = (speed - SPEED_BRACKET_FOUR) / (SPEED_BRACKET_FIVE - SPEED_BRACKET_FOUR)
        target = TUTOR_TARGET_BASE + position * (TUTOR_TARGET_BRACKET_FIVE - TUTOR_TARGET_BASE)
    target *= deck_size_scale
    if speed >= SPEED_BRACKET_THREE and complete_combos > 0:
        target = max(target, float(min(complete_combos, TUTOR_COMBO_TARGET_CAP)))
    return target


def _tutor_provenance(
    row: dict, current: float, target: float, scale: float, *, combo_lines: int = 0
) -> Provenance:
    """`combo_lines` is nonzero only when the deck's own complete-combo count
    set the target (see `_tutor_target`) — the detail then says so, because
    "you run six combo lines" is a materially different argument from "this
    bracket runs more tutors" and the reader deserves to know which one is
    being made."""
    shortfall = target - current
    if combo_lines > 0:
        detail = (
            f"finds your combo pieces — {current:.0f} tutor{'' if current == 1 else 's'} "
            f"against ~{target:.0f} for {combo_lines} complete combo lines"
        )
        code = "tutor-access-combos"
    else:
        detail = f"tutors your best card — {current:.0f} against ~{target:.0f} at this bracket"
        code = "tutor-access-damped" if scale < 1.0 else "tutor-access"
    return Provenance(
        channel="tutor_access",
        detail=detail,
        code=code,
        params={
            "current": f"{current:.0f}",
            "target": f"{target:.0f}",
            "combos": str(combo_lines),
        },
        score=WEIGHT_TUTOR_ACCESS
        * min(shortfall / TUTOR_RAMP, TUTOR_CAP)
        * scale
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
    )


def _tutor_joker_provenance(row: dict, complete_combos: int, combo_scale: float) -> Provenance:
    """A tutor scored as the combo piece it effectively is.

    Rides the combo channel — same channel name, same `_power_scale` ramp —
    because that is the claim being made: with `complete_combos` lines in
    the deck, this card completes whichever one is closest, in a way a
    single named piece cannot. The fraction of a full completion's score it
    collects is the joker's reach, `min(lines, cap) / cap` (see
    `TUTOR_JOKER_MIN_LINES`), and `weight_within_group` keeps a Demonic
    Tutor louder than an obscure transmute the way every count-driven
    channel does.
    """
    reach = min(complete_combos, TUTOR_COMBO_TARGET_CAP) / TUTOR_COMBO_TARGET_CAP
    return Provenance(
        channel="combo_completion",
        detail=(
            f"a joker for your {complete_combos} complete combo lines — "
            "finds whichever piece is missing"
        ),
        code="combo-joker",
        params={"combos": str(complete_combos)},
        score=WEIGHT_COMBO
        * 2.0
        * combo_scale
        * reach
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
    )


def _tutor_scale(speed: float) -> float:
    """How loud the tutor access channel argues once it fires.

    Flat 1.0 at every bracket the channel is enabled for — the target curve
    above already carries the bracket effect; do not stack two ramps without
    a measured reason to. Only add a separate scale if empirical scoring
    (Task B4, the real Kess deck) shows a flat weight either buries Demonic
    Tutor under staples or overpowers it.
    """
    return 1.0


# Fast mana & free interaction — the demand side of the two resources
# `build-semantics` gave real `PRODUCES` edges (14 fast-mana cards, 21
# free-interaction cards). Until now nothing in the advisor asked for either:
# a bracket-5 deck holding zero Sol Rings heard nothing about it.
#
# Both ramp like `_tutor_target` — climbing across bracket 4, full at
# `SPEED_BRACKET_FIVE`, flat after, the same "format, not a louder bracket 4"
# ceiling — but floor at zero rather than `TUTOR_TARGET_BASE`: WotC's bracket
# document is silent on tutors at every power level, but fast mana and free
# spells are named parts of what makes bracket 5 a different format (see
# CEDH-PLAN.md's addendum), so a deck below bracket 4 is told nothing about
# either — running Sol Ring is always fine, it is just not *demanded* until
# the format that is built around it.
#
# `FAST_MANA_TARGET_BRACKET_FIVE` is measured, not guessed: for each of the 41
# commanders carrying `RECOMMENDS_CEDH` edges in the dev graph (2026-09-01),
# summing every fast-mana card's own per-commander `inclusion_rate` is an
# unbiased estimate of how many of the format's 14 a typical list for that
# commander runs (linearity of expectation holds regardless of correlation
# between the cards). That gave mean 6.51, median 6.67, range 3.66-8.66 across
# the sample — rounds to 7. A real cEDH list runs about half the format's fast
# mana, not all of it: several carry a real cost a pilot weighs against a
# cleaner rock (Mox Diamond discards a land, Lotus Petal is one-shot, Ancient
# Tomb/City of Traitors punish getting blown out).
FAST_MANA_TARGET_BRACKET_FIVE = 7

# Sized, like `WEIGHT_FIXING_LAND`, to argue as a strong staple rather than a
# famine. `FAST_MANA_RAMP`/`FAST_MANA_CAP` are `fixing_lands`' own numbers
# reused outright — both are shortfall-against-a-small-target channels at
# bracket 5 — and only `WEIGHT_FAST_MANA` needed recalibrating.
#
# Calibrated against a deliberately fast-mana-free deck, not `deck-lab
# channel-scale`: a real cEDH seed already holds most of the 14, which is the
# small-shortfall regime that command measures (see the call site for that
# row — it lands far under 0.8, the same way `tutor_access` itself measures
# 0.40 there for an identical reason). Scoring an empty-of-fast-mana Kinnan
# list at speed 1.0, the per-hit median across the 14 fast-mana candidates
# landed at 0.81 at this weight, matching `fixing_lands`' own measured median
# in the standard table (0.83). A deck actually missing its fast mana argues
# as loud as one missing its fixing; a deck that already holds most of it
# (the common case) argues much quieter.
WEIGHT_FAST_MANA = 0.85
FAST_MANA_RAMP = 4.0
FAST_MANA_CAP = 2.5

# Free interaction cannot share a single fixed target the way fast mana does.
# Every one of the 14 fast-mana cards is colourless (`color_identity: []`,
# confirmed live), so every identity can run all of them — but the 21
# free-interaction cards are sharply colour-skewed: 12 blue, 2 each of
# white/black/red/green, 1 colourless. A mono-white list can no more run six
# free counterspells than it can run six blue ones, and measuring blue and
# non-blue lists against the same flat number is exactly the "bracket 4 with
# a louder voice" defect this round exists to fix.
#
# So the target scales off `resource_identity_supply("free_spell", identity)`
# — how many of the 21 this identity's colours can even cast — rather than a
# flat constant. `FREE_SPELL_CASTABLE_RATIO` is the measured share of that
# castable pool a real list actually runs: pooled across the same 41
# commanders, per-commander (measured free-interaction count) / (that
# commander's castable count) has mean 0.306, median 0.305, and holds across
# both ends of the colour spread — Godo (mono-red, castable 3) measures 0.44,
# Talion (blue-black, castable 15) measures 0.47, Kenrith (five colour,
# castable 21) measures 0.21. 0.3 is the round number in the middle. On a
# mono-white identity (castable 3) that is a target of ~1 — "maybe 2", which
# is the neighbourhood the round's own survey named; on a blue two-colour
# identity (castable 15) it is ~4.5, and the ramp below still lets a real
# shortfall argue past that on a strongly blue list the way "6+" describes.
FREE_SPELL_CASTABLE_RATIO = 0.3

# See `WEIGHT_FAST_MANA` — same reasoning and the same fast-mana-free-deck
# calibration method, run against Kinnan (blue, the colour that carries most
# of the format's free interaction): median 0.81 at this weight, against
# `fixing_lands`' 0.83. Free interaction is quieter than fast mana by design
# once a deck's colours are not blue-heavy — see `FREE_SPELL_CASTABLE_RATIO`
# above — so this is calibrated against the colour that can actually reach
# the target, the way `fixing_lands` itself only ever argues loudly on a
# multicolour deck. A mono-red identity (Krenko) measures a 0.15 median on
# the same empty deck — the castable pool is 3 cards, and arguing "add your
# fourth free interaction spell" as loud as a blue deck's shortfall would be
# the exact defect `FREE_SPELL_CASTABLE_RATIO` exists to avoid.
WEIGHT_FREE_SPELL = 1.8
FREE_SPELL_RAMP = 4.0
FREE_SPELL_CAP = 2.5


def _fast_mana_target(speed: float, deck_size_scale: float = 1.0) -> float:
    """How many fast-mana cards a deck at this speed is expected to run.

    Zero below `SPEED_BRACKET_FOUR`, climbing across bracket 4 to
    `FAST_MANA_TARGET_BRACKET_FIVE` at `SPEED_BRACKET_FIVE` and flat after —
    see the constant's own comment for the ramp's rationale and the measured
    anchor.
    """
    if speed < SPEED_BRACKET_FOUR:
        return 0.0
    if speed >= SPEED_BRACKET_FIVE:
        target = float(FAST_MANA_TARGET_BRACKET_FIVE)
    else:
        position = (speed - SPEED_BRACKET_FOUR) / (SPEED_BRACKET_FIVE - SPEED_BRACKET_FOUR)
        target = position * FAST_MANA_TARGET_BRACKET_FIVE
    return target * deck_size_scale


def _free_spell_target(speed: float, castable: int, deck_size_scale: float = 1.0) -> float:
    """How many free-interaction cards a deck at this speed, in this
    identity, is expected to run.

    Same zero-through-bracket-3, ramp-across-4, flat-from-5 shape as
    `_fast_mana_target` — the only difference is the ceiling is
    `castable * FREE_SPELL_CASTABLE_RATIO` rather than a fixed constant, so a
    mono-white and a mono-blue deck climb to different targets. `castable` is
    `resource_identity_supply("free_spell", identity)` — deck-agnostic, so a
    caller computes it once per request rather than once per candidate.
    """
    if speed < SPEED_BRACKET_FOUR:
        return 0.0
    ceiling = castable * FREE_SPELL_CASTABLE_RATIO
    if speed >= SPEED_BRACKET_FIVE:
        target = ceiling
    else:
        position = (speed - SPEED_BRACKET_FOUR) / (SPEED_BRACKET_FIVE - SPEED_BRACKET_FOUR)
        target = position * ceiling
    return target * deck_size_scale


def _fast_mana_provenance(row: dict, current: float, target: float) -> Provenance:
    """Shortfall-proportional and capped — the `_tutor_provenance` shape,
    without the combo-line floor tutors carry (fast mana has no analogous
    second demand signal)."""
    shortfall = target - current
    return Provenance(
        channel="fast_mana",
        detail=f"fast mana — {current:.0f} against ~{target:.0f} at this bracket",
        code="fast-mana",
        params={"current": f"{current:.0f}", "target": f"{target:.0f}"},
        score=WEIGHT_FAST_MANA
        * min(shortfall / FAST_MANA_RAMP, FAST_MANA_CAP)
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
    )


def _free_spell_provenance(row: dict, current: float, target: float) -> Provenance:
    """Same shape as `_fast_mana_provenance` — `target` already carries the
    identity's castable scaling (see `_free_spell_target`)."""
    shortfall = target - current
    return Provenance(
        channel="free_spell",
        detail=f"free interaction — {current:.0f} against ~{target:.0f} at this bracket",
        code="free-spell",
        params={"current": f"{current:.0f}", "target": f"{target:.0f}"},
        score=WEIGHT_FREE_SPELL
        * min(shortfall / FREE_SPELL_RAMP, FREE_SPELL_CAP)
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
    )


# The power ramp, applied to combos and game changers. The bracket system's
# own rules, not taste: brackets 1-2 play without intentional two-card
# infinite combos and without game changers, and bracket 3 tolerates only
# late-game combos — so the flat completion score was telling battlecruiser
# decks to finish Thassa's Oracle piles.
#
# The speed value maps to brackets in fifths of [0, 1] — `bracketSpeed` in the
# frontend's `utils/deck-advisor.ts` is exactly that mapping, and it is the
# only thing that sets the speed, so these boundaries and that function must
# move together or the deck's claimed bracket buys it the wrong advice.
# Bracket 3 gets a floor rather than ramping from zero: "late-game combos
# tolerated" is worth something the moment a deck *is* bracket 3, and a
# zero-score entry at the band's edge would contradict the bracket it claims.
#
# The ramp does not stop at 1.0: brackets 4-5 are where combos go from
# "legal" to "the point". At full value a bare completion scored 1.8 — under
# a famine basic, under a strong two-channel fusion — which ranked the win
# condition of a cEDH deck like a mid staple. The climb across bracket 4
# reaches double value at the bracket 5 line and holds there: 3.6 for a bare
# completion, above any single-channel hit, and any empirical co-signal
# pushes it past the strongest fusions. Flat across 5 rather than climbing
# on, for the same reason bracket 5 is called "cEDH" and not "High 4" — it is
# a format, not a louder bracket 4.
#
# The Phase 8 eval cannot arbitrate these constants. Its target is EDHREC
# popularity, combo pieces are popular, so damping them will likely *cost*
# eval hits while being right — recorded here so the numbers are not "fixed"
# back by an eval run.
SPEED_BRACKET_THREE = 0.4
SPEED_BRACKET_FOUR = 0.6
# SPEED_BRACKET_FIVE now lives in `composition.py` — the shape layer needs the
# same boundary, and it may not import this module. Re-exported here (see the
# import at the top of the file) so every existing reader still finds it.
COMBO_FLOOR_BRACKET_THREE = 0.25
COMBO_CEILING_BRACKET_FIVE = 2.0
# Bracket 3's Game Changer allowance — mirrored from the mtg service's
# `BRACKETS` table (services/mtg/src/models/format.rs), which is what the
# legality band the user actually sees warns against. Brackets 1-2 allow
# zero, 4-5 are unlimited; those two ends need no constant because they are
# "all withheld" and "nothing withheld".
GAME_CHANGER_CAP_BRACKET_THREE = 3


# Spellbook's own read of where a combo belongs, carried on `Combo.bracket`.
# "R" is Ruthless — Thassa's Oracle lines, the cEDH end of the taxonomy — and
# recommending one into a bracket-3 deck moves the deck up a bracket whether
# its owner meant to or not.
COMBO_BRACKET_RUTHLESS = "R"


def _gate_combos_for_bracket(combos: list, speed: float) -> tuple[list, Phrase | None]:
    """The completions a deck at this bracket should actually be offered.

    `_power_scale` decides how *loud* the channel is; this decides what it may
    say at all, and the two questions came apart in a real deck: a bracket-3
    list got 27 of its 45 suggestions from this channel, half of them
    two-card infinites — Kiki lines, champion Elementals — every one damped
    to the same flat score and none of them hidden. WotC's bracket 3 draws
    its bright line at exactly that: two-card infinite combos are a 4-5
    play. Below bracket 4, a completion must need three or more pieces and
    must not carry Spellbook's Ruthless tag.

    Piece count is the *combo's* size, not what is missing — a two-card
    infinite the deck already half-owns is still a two-card infinite.
    Brackets 4 and up gate nothing: `_power_scale`'s boost is the statement
    there. Returns the survivors and the note saying how many were hidden —
    None when nothing was, the same contract as `_withhold_bracket_breakers`.
    """
    if speed >= SPEED_BRACKET_FOUR:
        return combos, None
    kept = [
        combo
        for combo in combos
        if len(combo.card_names) >= 3 and combo.bracket != COMBO_BRACKET_RUTHLESS
    ]
    hidden = len(combos) - len(kept)
    if not hidden:
        return kept, None
    return kept, phrase(
        "combos-hidden-below-bracket-four",
        f"{hidden} combo completion{_plural(hidden)} hidden — two-card "
        "infinites and Ruthless-rated combos are a bracket 4+ "
        "play. Raise the bracket to see them.",
        amount=hidden,
    )


# Spellbook's `produces` text is free text ("Infinite magecraft triggers",
# "Infinite mana", "Infinite tokens", ...). Most of it names a resource an
# empty board still wants (mana, tokens, damage) — but a *trigger* is not a
# payoff by itself, it is an input to one. "Infinite magecraft triggers"
# does nothing for a deck that runs no card caring about magecraft; the
# trigger has to land on something. Matched against `Resource`'s own
# `_TRIGGER` vocabulary (`vocabulary.py`) rather than invented separately,
# so a new trigger resource only has to be taught to the tag mapping once.
_TRIGGER_PAYOFF_RESOURCES = {
    "magecraft trigger": Resource.MAGECRAFT_TRIGGER,
    "prowess trigger": Resource.PROWESS_TRIGGER,
    "landfall trigger": Resource.LANDFALL_TRIGGER,
    "enters the battlefield trigger": Resource.ETB_TRIGGER,
    "etb trigger": Resource.ETB_TRIGGER,
    "leaves the battlefield trigger": Resource.LTB_TRIGGER,
    "death trigger": Resource.DEATH_TRIGGER,
    "attack trigger": Resource.ATTACK_TRIGGER,
    "combat damage trigger": Resource.COMBAT_DAMAGE_TRIGGER,
    "cast trigger": Resource.CAST_TRIGGER,
    "upkeep trigger": Resource.UPKEEP_TRIGGER,
    "end step trigger": Resource.END_STEP_TRIGGER,
    "lifegain trigger": Resource.LIFEGAIN_TRIGGER,
}


def _combo_payoff_resource(produces: Iterable[str]) -> Resource | None:
    """The trigger-type payoff a combo's output names, if any.

    `None` for combos that produce a direct resource (mana, tokens, damage)
    or anything else outside the trigger vocabulary — those need no payoff
    check, the produced thing is already the point.
    """
    for text in produces:
        lowered = text.lower()
        for needle, resource in _TRIGGER_PAYOFF_RESOURCES.items():
            if needle in lowered:
                return resource
    return None


def _gate_combos_for_payoff(combos: list, balance: list) -> tuple[list, Phrase | None]:
    """Combos whose produced trigger this deck can actually use.

    A combo that goes infinite on a trigger (magecraft, landfall, ETB, ...)
    is only a plan if the deck already runs a card that cares about that
    trigger — `ResourceBalance.wanted` is exactly that count, independent of
    the supply/demand `gap` math. Zero payoffs means the combo would be the
    only card in the 99 that cares what it produces, which is not a
    completion worth suggesting. Combos producing a direct resource, or a
    trigger this deck already has a payoff for, pass through untouched.
    """
    payoffs = {row.resource for row in balance if row.wanted > 0}
    kept = []
    hidden = 0
    for combo in combos:
        resource = _combo_payoff_resource(combo.produces)
        if resource is not None and str(resource) not in payoffs:
            hidden += 1
            continue
        kept.append(combo)
    if not hidden:
        return kept, None
    return kept, phrase(
        "combos-hidden-no-payoff",
        f"{hidden} combo completion{_plural(hidden)} hidden — they produce "
        "triggers this deck runs no payoff for.",
        amount=hidden,
    )


def _power_scale(speed: float) -> float:
    """Zero through brackets 1-2, a floored ramp across 3, a climb across 4,
    ceiling from 5 up."""
    if speed < SPEED_BRACKET_THREE:
        return 0.0
    if speed >= SPEED_BRACKET_FIVE:
        return COMBO_CEILING_BRACKET_FIVE
    if speed >= SPEED_BRACKET_FOUR:
        position = (speed - SPEED_BRACKET_FOUR) / (SPEED_BRACKET_FIVE - SPEED_BRACKET_FOUR)
        return 1.0 + position * (COMBO_CEILING_BRACKET_FIVE - 1.0)
    position = (speed - SPEED_BRACKET_THREE) / (SPEED_BRACKET_FOUR - SPEED_BRACKET_THREE)
    return COMBO_FLOOR_BRACKET_THREE + position * (1.0 - COMBO_FLOOR_BRACKET_THREE)


class Phrase(BaseModel):
    """A sentence the backend composes and a UI is free to word itself.

    `text` is the English rendering and stays authoritative for anything with
    no translations to reach for — `cli.py` prints these, and a consumer given
    a bare key instead of a sentence is worse off than one given English.
    `code` and `params` are what a localised frontend uses instead; an unknown
    code falls back to `text` rather than rendering a key at the reader.

    Codes are stable identifiers, kebab-case, and must not be recycled: the
    frontend keys off them, so reusing one for a different sentence silently
    mistranslates rather than failing.
    """

    code: str
    params: dict[str, str] = Field(default_factory=dict)
    text: str


def phrase(code: str, text: str, **params: object) -> Phrase:
    """A phrase, with its params stringified for a stable wire shape."""
    return Phrase(code=code, params={k: str(v) for k, v in params.items()}, text=text)


def _plural(amount: int) -> str:
    """The English plural suffix for a note's count. Translations pluralise
    through i18next's own suffixing on the `amount` param, not through this."""
    return "s" if amount != 1 else ""


class Provenance(BaseModel):
    channel: str
    detail: str
    score: float
    # The translatable form of `detail`. Defaulted rather than required so a
    # channel that has not been given a code yet still renders — as English,
    # which is what `detail` has always been.
    code: str = ""
    params: dict[str, str] = Field(default_factory=dict)
    # The theme id for theme_fit / theme_excluded entries, and the creature
    # type for typal_bridge — so grouping, the exclusion pass, and the
    # frontend's identity axis can tell them apart without parsing the
    # detail string.
    key: str | None = None


class Suggestion(BaseModel):
    oracle_id: str
    name: str
    cmc: float
    type_line: str
    price_usd: float | None
    score: float
    provenance: list[Provenance]
    playability: float = 0.0
    game_changer: bool = False

    @property
    def channels(self) -> set[str]:
        return {p.channel for p in self.provenance}


class SuggestionGroup(BaseModel):
    """Suggestions gathered under the gap they close.

    A flat ranked list answers "what could I add"; the question people actually
    have is "what is my deck missing". The group carries the shortfall so the
    heading states the case rather than just naming a category.
    """

    key: str  # "bucket:ramp" | "theme:landfall" | "resource:etb_trigger" | "staples"
    label: str
    reason: str
    suggestions: list[Suggestion]


# When the answer leans on a theme the deck does not play, and the reader
# should be offered the chance to say so.
#
# A commander's EDHREC page is its *popular* build, and popularity is measured
# across other people's decks. Build the archetype that page ignores and the
# empirical channel keeps answering for the archetype it knows: a Shorikai
# reanimator deck, reading 71% graveyard and no vehicles, was shown 13 vehicles
# in its top 25. Nothing was wrong with any individual suggestion — they are
# genuinely what Shorikai decks play — which is exactly why this needs saying
# out loud rather than fixing silently.
#
# A fifth of the answer is the point where a theme is shaping the page rather
# than appearing on it. The deck-side ceiling is deliberately near zero: this
# is for archetypes the deck has *declined*, not ones it is light on, and a
# deck with a real 10% vehicle sub-theme should not be asked to disown it.
OFF_THEME_SHARE = 0.2
OFF_THEME_DECK_CEILING = 0.05


class ThemeLean(BaseModel):
    """A theme the suggestions read as, that the deck itself does not play.

    Offered so the reader can exclude it in one click. Not applied — the whole
    point is that this is a judgement only the deck's owner can make, and an
    off-theme build is a choice, not a mistake to be corrected.
    """

    theme: str
    label: str
    # Share of the suggestions reading as this theme, and what the deck reads
    # as. Both are reported so the chip can state the case it is making.
    share: float
    deck_share: float


class Focus(BaseModel):
    """What the user asked to see more of."""

    kind: str  # "bucket" | "theme" | "resource"
    value: str
    label: str = ""


class SuggestionReport(BaseModel):
    commander: str | None
    # The resolved names of every card the deck fields as a commander, anchor
    # first. Additive: the singular `commander` stays the anchor's own name.
    commanders: list[str] = Field(default_factory=list)
    commander_inferred: bool
    identity: list[str]
    considered: int
    suggestions: list[Suggestion]
    # The flat list stays alongside the groups: a caller that only wants "the
    # top 20 things to add" should not have to flatten a grouping first.
    groups: list[SuggestionGroup] = Field(default_factory=list)
    focus: Focus | None = None
    # What steered this run: the pinned themes, echoed back resolved so a
    # caller can see which of its preferences actually applied.
    pinned: list[Focus] = Field(default_factory=list)
    # The same, for what was steered away from. Resolved, so it carries labels
    # for themes the deck does not read as — the only ones an excluded theme
    # can be, and so the only place a caller can learn to call `vehicles`
    # "Vehicles" once it has stopped appearing in the profile.
    excluded: list[Focus] = Field(default_factory=list)
    # Themes this answer leans on that the deck does not play, for the reader
    # to accept or exclude. Never applied automatically.
    off_theme: list[ThemeLean] = Field(default_factory=list)
    # Structured so a localised UI can word them itself; each still carries
    # its English rendering for the CLI and for anything without translations.
    notes: list[Phrase] = Field(default_factory=list)


@dataclass
class _Candidate:
    oracle_id: str
    name: str
    cmc: float = 0.0
    type_line: str = ""
    price_usd: float | None = None
    playability: float = 0.0
    game_changer: bool = False
    provenance: list[Provenance] = field(default_factory=list)

    def score(self) -> float:
        total = sum(p.score for p in self.provenance)
        # Agreement across independent channels is the strong signal — and only
        # channels arguing *for* the card count. A theme_excluded entry is a
        # demotion; letting it earn the bonus would refund half of it.
        distinct = len({p.channel for p in self.provenance if p.score > 0})
        return total + MULTI_CHANNEL_BONUS * max(distinct - 1, 0)


def _merge(pool: dict[str, _Candidate], row: dict, provenance: Provenance) -> None:
    candidate = pool.get(row["oracle_id"])

    if candidate is None:
        candidate = _Candidate(
            oracle_id=row["oracle_id"],
            name=row["name"],
            cmc=row.get("cmc") or 0.0,
            type_line=row.get("type_line") or "",
            price_usd=row.get("price_usd"),
            playability=row.get("playability") or 0.0,
            game_changer=bool(row.get("game_changer")),
        )
        pool[row["oracle_id"]] = candidate

    candidate.provenance.append(provenance)


def _edhrec_provenance(
    row: dict, *, commander: str | None = None, cedh: bool = False, scale: float = 1.0
) -> Provenance:
    """`commander` names the seat whose EDHREC page recommended the card.

    Passed only when the deck fields more than one commander — with three
    seats the UI must be able to say who recommended a card, while a
    single-commander report keeps its exact historical shape.

    `cedh=True` marks a row sourced from the commander's `/cedh` subpage
    rather than its casual page — a distinct channel
    (`edhrec_synergy_cedh`) and code (`edhrec-synergy-cedh`), scored by
    `WEIGHT_EDHREC_CEDH` rather than `WEIGHT_EDHREC`. Necessary, not
    cosmetic: the cEDH page runs much hotter synergy, so at a shared weight
    it would bury `role_gap`, `theme_fit` and `combo_completion` in every
    cEDH answer. See the measured table beside `WEIGHT_EDHREC_CEDH`.

    `scale` damps the casual page when the cEDH page also answered for this
    seat — see `EDHREC_CASUAL_SCALE_AT_CEDH`.
    """
    synergy = row.get("synergy") or 0.0
    rate = (row.get("inclusion_rate") or 0.0) * 100
    params = {"synergy": f"{synergy:+.2f}", "rate": f"{rate:.0f}"}
    if commander is not None:
        params["commander"] = commander
    whose = f"{commander} " if commander is not None else ""
    corpus = "cEDH " if cedh else ""
    return Provenance(
        channel="edhrec_synergy_cedh" if cedh else "edhrec_synergy",
        detail=f"{synergy:+.2f} synergy · in {rate:.0f}% of {whose}{corpus}decks",
        code="edhrec-synergy-cedh" if cedh else "edhrec-synergy",
        params=params,
        # Synergy is roughly [-0.1, 0.3] on the base page (higher on the cEDH
        # page); clamp the floor so a popular staple with negative synergy
        # cannot drag a multi-channel card down.
        score=(WEIGHT_EDHREC_CEDH if cedh else WEIGHT_EDHREC) * scale * max(synergy, 0.0) * 10,
    )


def _bridge_provenance(row: dict, idf: Mapping[str, float] | None = None) -> Provenance:
    """Scaled by playability and by how specific the shared resource is.

    A common that makes one Treasure and Smothering Tithe both PRODUCES
    treasure, and the bridge scored them identically. Among the 179 cards that
    produce Treasure the EDHREC rank spans 63 to 27,670 — that spread is the
    difference between a suggestion and a shrug. See `power.py`.

    The second term is specificity. Sharing `evasion` (5,773 cards) was evidence
    exactly as strong as sharing `landfall_trigger` (646), which is what a
    bridge with no frequency weighting does. `themes.py` has computed IDF since
    the theme layer landed and this channel never consumed it.

    **Max, not sum, across the matched resources.** A card matching three
    resources is not three times the hit — it is one hit, as strong as its most
    specific term. Summing would rank a card touching several vague resources
    above one that answers a rare, precise want, which is the ranking this
    change exists to fix.
    """
    resources = row.get("resources") or []
    gap = row.get("gap") or 0
    listed = ", ".join(str(r).replace("_", " ") for r in resources[:2])
    weight = weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity"))

    specificity = 1.0
    if idf and resources:
        matched = [idf[str(r)] for r in resources if str(r) in idf]
        if matched:
            specificity = max(matched)

    return Provenance(
        channel="resource_bridge",
        detail=f"supplies {listed} — deck wants {gap} more than it makes",
        code="resource-bridge",
        params={"listed": listed, "gap": str(gap)},
        score=WEIGHT_BRIDGE * min(gap, 6) / 2 * weight * specificity,
    )


def _role_provenance(
    row: dict, label: str, *, on_profile: bool = False, corroboration: float = 0.0
) -> Provenance:
    """Score a bucket shortfall.

    Capped hard: an incomplete deck can be 30 cards short of its land count, and
    an uncapped term would rank every basic-adjacent card above a genuine
    synergy hit. The shortfall belongs in the *reason*, not the magnitude.

    `on_profile` is set only for synergy_wincon candidates connected to the
    deck's own strategy (see the bucket-shortfall loop) — by tribe today,
    soon also theme and resource supply — a payoff, wincon or tutor built on
    what the deck is doing over one that merely carries the same role tag by
    coincidence. Multiplicative rather than an added constant, so it reorders
    candidates within the bucket instead of nudging them: a boost too small
    to outrank a more globally popular generic payoff would not have done
    anything. Still a boost, not a filter — an off-profile candidate keeps
    its unboosted score and stays in the pool on that alone.

    `corroboration` is the card's inclusion rate on the commander's own page
    (0 = none) — deck-relative empirical evidence, a separate axis from
    `on_profile`'s mechanical connection, which is why it is the one thing
    allowed to stack on top of it rather than being folded into the same
    union. It only ever arrives gated on page alignment: the caller passes 0
    whenever the deck does not demonstrably play like the commander's usual
    builds, so an off-theme build never sees its score move on playrate
    alone.
    """
    shortfall = row.get("shortfall") or 0.0
    # Already normalised against the role's own ceiling by CHANNEL_ROLES, so a
    # payoff and a tutor are compared on how well each fills its role rather
    # than on which role grants the louder weight.
    weight = row.get("weight") or 1.0
    score = (
        WEIGHT_ROLE
        * min(shortfall / ROLE_SHORTFALL_SATURATION, 1.0)
        * weight
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity"))
    )
    if on_profile:
        score *= ON_PROFILE_BOOST
    if corroboration:
        score *= 1.0 + EDHREC_CORROBORATION_SPAN * corroboration
    return Provenance(
        channel="role_gap",
        detail=f"fills {label} — deck is {shortfall:.1f} short at this speed",
        code="role-gap",
        params={"label": label, "shortfall": f"{shortfall:.1f}"},
        score=score,
    )


def _theme_provenance(row: dict) -> Provenance:
    fit = row.get("fit") or 0.0
    label = row.get("theme_label") or "the theme"
    return Provenance(
        channel="theme_fit",
        detail=f"reads as {label} ({fit:.0%} fit)",
        code="theme-fit",
        params={"label": label, "fit": f"{fit:.0%}"},
        score=WEIGHT_THEME_DECLARED * fit * (0.25 + (row.get("playability") or 0.0)),
        key=row.get("theme_id"),
    )


def _detected_theme_provenance(row: dict, share: float) -> Provenance:
    """`_theme_provenance`, but the ask came from the deck, not the user."""
    fit = row.get("fit") or 0.0
    label = row.get("theme_label") or "the theme"
    return Provenance(
        channel="theme_fit",
        detail=f"reads as {label} ({fit:.0%} fit) — {share:.0%} of the deck",
        code="theme-detected",
        params={"label": label, "fit": f"{fit:.0%}", "share": f"{share:.0%}"},
        score=WEIGHT_THEME_DETECTED
        * fit
        * (0.5 + 0.5 * share)
        * (0.25 + (row.get("playability") or 0.0)),
        key=row.get("theme_id"),
    )


def _seat_theme_provenance(row: dict, seats: int) -> Provenance:
    """`_detected_theme_provenance`, but the ask came from the zone's size.

    No share in the wording on purpose: the deck's share of this theme is
    zero — saying "reads as Commander matters" would be a lie the radar
    visibly contradicts. The seats are the whole argument, so the sentence
    names them.
    """
    from .themes import seat_scale

    fit = row.get("fit") or 0.0
    label = row.get("theme_label") or "the theme"
    return Provenance(
        channel="theme_fit",
        detail=f"{label} — paid once per commander, and this deck fields {seats}",
        code="theme-seats",
        params={"label": label, "seats": str(seats)},
        score=WEIGHT_THEME_DETECTED
        * fit
        * (seat_scale(seats) - 1.0)
        * (0.25 + (row.get("playability") or 0.0)),
        key=row.get("theme_id"),
    )


def _seat_voice_provenance(row: dict, commander: str, commander_fit: float) -> Provenance:
    """`_detected_theme_provenance` for a seat the data cannot speak for.

    The sentence names the commander, not the deck: "reads as" would claim a
    share the radar visibly lacks. The seat is the evidence, so the seat is
    the subject.
    """
    fit = row.get("fit") or 0.0
    label = row.get("theme_label") or "the theme"
    return Provenance(
        channel="theme_fit",
        detail=f"{commander}'s own theme — {label}, argued from mechanics",
        code="theme-seat-voice",
        params={"label": label, "commander": commander},
        score=WEIGHT_THEME_DETECTED
        * fit
        * (SEAT_VOICE * commander_fit)
        * (0.25 + (row.get("playability") or 0.0)),
        key=row.get("theme_id"),
    )


def _detected_theme_targets(theme_shares, declared: set[str]) -> list:
    """The deck-profile themes worth arguing from.

    Floored, capped, and never a theme the user already declared: a focus or
    pin fired at full weight, and an exclusion outranks detection outright.
    Relies on `report.themes` arriving sorted by share, descending.
    """
    targets = []
    for row in theme_shares:
        if row.share < DETECTED_THEME_FLOOR:
            break  # sorted descending — nothing further clears the floor
        if row.theme in declared:
            continue
        targets.append(row)
        if len(targets) == DETECTED_THEME_LIMIT:
            break
    return targets


def _deck_theme_ids(theme_shares, pinned: list[str], excluded: set[str]) -> list[str]:
    """The deck's theme identity, the non-tribal analog of `deck_tribes`.

    Detected themes above the share floor (capped at `DETECTED_THEME_LIMIT`),
    plus anything pinned, minus anything excluded — from both sides. Raw
    param ids on purpose: an invalid pin simply never matches a FITS_THEME
    edge, while an excluded theme must never grant the boost. Relies on
    `theme_shares` arriving sorted by share, descending, same as
    `_detected_theme_targets`.

    The `tribal` theme is dropped from both sides: it is type-blind, so
    granting the boost through it would bless another tribe's lords in a
    Dragons deck — the Goblin Sledder failure `_drop_off_tribe_rows` exists
    to prevent. The tribe connection belongs to `_typal_hits`, which checks
    the deck's actual tribes.
    """
    ids = [
        row.theme
        for row in theme_shares
        if row.share >= DETECTED_THEME_FLOOR and row.theme not in excluded and row.theme != "tribal"
    ][:DETECTED_THEME_LIMIT]
    ids += [t for t in pinned if t not in excluded and t not in ids and t != "tribal"]
    return ids


def _deck_surplus(balance_rows: list, idf: Mapping[str, float]) -> list[str]:
    """Resources the deck makes more of than it spends, for the supply boost.

    `ResourceBalance.gap = wanted - produced` (commander supply already folded
    in), so a strongly negative gap is a surplus, not a deficit — the bridge
    channel reads the same field the other direction. Both floors keep the
    signal meaningful: `SUPPLY_SURPLUS_FLOOR` so one spare card is not a
    strategy, `SUPPLY_IDF_FLOOR` so a resource vaguer than the corpus average
    says nothing about what the deck is doing. Capped at 12, the same cap
    the resource-bridge channel's own `wanted` list uses — biggest surplus
    first, because `balance_rows` arrives sorted by gap *descending* (deficits
    first) and slicing its tail uncorrected would keep the twelve weakest
    surpluses instead.
    """
    qualifying = [
        row
        for row in balance_rows
        if row.gap <= -SUPPLY_SURPLUS_FLOOR and idf.get(row.resource, 0.0) >= SUPPLY_IDF_FLOOR
    ]
    return [row.resource for row in sorted(qualifying, key=lambda row: row.gap)][:12]


def _theme_vocabulary(theme: Theme) -> set[str]:
    """The resource vocabulary a theme is defined by: weights ∪ requires_any.

    Extracted from `_supply_match_targets`'s exclusion loop so the same
    definition of "what resources does this theme own" reaches every place
    that needs to subtract a theme's identity from something else — the
    supply-match filter here, the resource-bridge exclusion filter, and the
    card-normalised exclusion strength (`theme_share_among`).
    """
    return {str(r) for r in (*theme.weights, *theme.requires_any)}


def _theme_gate_sides(theme: Theme) -> list[str]:
    """Which FITS_THEME relation types a card's identity is read from, for
    exclusion purposes.

    The same effective gate the stored `FITS_THEME` edges were written
    against — `theme.retrieve_on` when the theme sets one, `theme.gate_on`
    otherwise (`theme_fit(..., retrieval=True)` in `themes.py`). Exclusion
    strength has to read the side those edges do, or a produces-side share
    and a cares-side fit would be answering different questions about the
    same card.

    Load-bearing (TRAP 1): counting the produces side for a cares-gated
    theme like `artifacts` would make Sol Ring — which produces `mana_rock`,
    one BROADER hop from `artifact_matters` — read as 100% artifacts, and an
    artifacts exclusion would then zero every mana rock in the pool. Sol
    Ring cares about nothing, so the cares-only gate leaves it at share 0.
    """
    gate = theme.retrieve_on or theme.gate_on
    if gate == "produces":
        return ["PRODUCES"]
    if gate == "either":
        return ["CARES_ABOUT", "PRODUCES"]
    return ["CARES_ABOUT"]


def _supply_match_targets(idf: Mapping[str, float], excluded_theme_ids: Iterable[str]) -> set[str]:
    """Resources a supply match may land on.

    Two filters, one purpose — the boost may only conclude things the deck's
    owner would recognise as strategy:

    - The IDF floor, applied at the *match* level. `_deck_surplus` applies it
      to the surplus resource, but the BROADER walk matches consumers at any
      ancestor, and an ancestor vaguer than the floor re-admits exactly the
      conclusion the floor rejected: `artifact_matters` (IDF 0.49) was never
      a surplus, yet every artifact payoff matched through `mana_rock`'s one
      BROADER hop. Filtering where the match lands closes the laundering.

    - Excluded themes. A theme is a weighted resource vocabulary, so "not
      artifacts" has an exact meaning here: no match may land on any resource
      the excluded theme is defined by (`_theme_vocabulary`). The surplus
      itself is untouched — exclusion removes conclusions, not facts — so a
      treasure surplus still feeds treasure payoffs unless the user excluded
      the theme that owns treasure. Raw ids on purpose, like
      `_deck_theme_ids`: an unknown id simply matches no theme.
    """
    from .themes import THEMES

    allowed = {r for r, weight in idf.items() if weight >= SUPPLY_IDF_FLOOR}
    for theme_id in excluded_theme_ids:
        theme = THEMES.get(theme_id)
        if theme is not None:
            allowed -= _theme_vocabulary(theme)
    return allowed


def _page_aligned(deck_n: int, hits: int) -> bool:
    """Whether the deck plays enough like the commander's usual builds to trust playrate."""
    return deck_n >= PAGE_OVERLAP_MIN_DECK and hits >= deck_n * PAGE_OVERLAP_FLOOR


def _row_is_off_tribe(ref: dict, tribes: list[str]) -> bool:
    """Whether a tribal-channel card is bound to tribes this deck does not play.

    The `tribal` theme is type-blind on purpose — detection's question is
    "does typal matter here, whichever type". Retrieval's question is not:
    a mono-red Dragons deck reads 67% tribal, the channel dutifully returned
    the best type-blind tribal cards in red, and the fill solver — shopping
    the deep pool for cheap curve-fillers — put Goblin Sledder and Falkenrath
    Pit Fighter into a deck with zero Goblins and zero Vampires. Their only
    provenance was `theme_fit(tribal)`.

    A card is off-tribe only when every signal points away from the deck: it
    references specific creature types — what it is, cares about, or makes,
    or a type named in its text — and none of them is a deck tribe. Both
    reference directions matter, in both roles. What-it-is condemns the lords
    the extraction cannot parse (Goblin Sledder's whole payoff is "Sacrifice
    a Goblin:" and his only graph fact is IS Goblin); the text scan condemns
    the edge-less rest (Goblin Grenade) and *rescues* Dragonlord's Servant, a
    Goblin whose Dragon-ness exists only as the word in his text.

    Two escape hatches, both for cards that are every tribe at once:
    Changelings by rule, and the "choose a creature type" template — Adaptive
    Automaton is a Construct and Metallic Mimic a Shapeshifter, and dropping
    the format's premier any-tribe lords for the type on their own type line
    would be this filter failing at its own game.

    A card referencing no type at all is tribe-agnostic support — Cavern of
    Souls, the banners, Pyre of Heroes — and is exactly what the channel is
    *for* once the deck's own tribe is already argued by the typal channel.
    """
    if ref.get("changeling"):
        return False
    text = ref.get("oracle_text") or ""
    if "choose a creature type" in text.lower():
        return False
    types = set(ref.get("types") or [])
    if not types:
        return False
    return not (types & set(tribes))


def _drop_off_tribe_rows(rows: list[dict], tribes: list[str]) -> list[dict]:
    """Filter the type-blind `tribal` rows against the deck's known tribes.

    Only the `tribal` theme's rows are touched, and only when the deck has a
    typal profile to check against — a Morophon-style deck with no fixed tribe
    keeps the channel exactly as it was. Rows are dropped, not demoted: this
    is the channel declining to make an argument, so a card with other
    channels behind it stays in the pool on those merits alone.
    """
    if not tribes:
        return rows
    tribal = [row for row in rows if row.get("theme_id") == "tribal"]
    if not tribal:
        return rows

    from .graph import tribe_references

    refs = {ref["oracle_id"]: ref for ref in tribe_references([r["oracle_id"] for r in tribal])}
    kept = [
        row
        for row in rows
        if row.get("theme_id") != "tribal"
        or not _row_is_off_tribe(refs.get(row["oracle_id"], {}), tribes)
    ]
    if dropped := len(rows) - len(kept):
        log.debug("tribal.off_tribe_dropped", dropped=dropped, tribes=tribes)
    return kept


def _drop_off_tribe_bridge_rows(rows: list[dict], tribes: list[str]) -> list[dict]:
    """Filter resource-bridge rows against the deck's known tribes.

    The bridge's functional analog of `_drop_off_tribe_rows`: every row here
    is a candidate — there is no `theme_id` split to narrow first, because
    the resource bridge is not the `tribal` theme channel — and the
    reference dict comes from `ability_tribe_references` rather than
    `tribe_references`, so a supplier is condemned by what its granted
    ability *references*, never by its own type line (Goblin King, not
    Anger). `_row_is_off_tribe` itself is unchanged; this only sources it a
    differently-gathered `ref` dict of the same shape.

    Dropped silently, like the theme-channel filter — the bridge declining
    to argue for an off-tribe supplier, not refusing it outright, so a row
    with other channels behind it stays in the pool on those merits alone.
    Empty `tribes` is a no-op, matching `_drop_off_tribe_rows`'s contract for
    a tribeless deck (or one with `tribal` excluded).
    """
    if not tribes or not rows:
        return rows

    from .graph import ability_tribe_references

    refs = {
        ref["oracle_id"]: ref
        for ref in ability_tribe_references([row["oracle_id"] for row in rows])
    }
    kept = [row for row in rows if not _row_is_off_tribe(refs.get(row["oracle_id"], {}), tribes)]
    if dropped := len(rows) - len(kept):
        log.debug("bridge.off_tribe_dropped", dropped=dropped, tribes=tribes)
    return kept


def _row_is_on_tribe(ref: dict, tribes: list[str]) -> bool:
    """Whether a role-gap candidate is actually built on one of the deck's own tribes.

    `_row_is_off_tribe`'s escape hatches, read the other way: a changeling or
    a "choose a creature type" card plays as every tribe at once, which is as
    strong an argument for a hyper-focused typal deck as a literal type
    match. A card with no type reference at all is tribe-agnostic support
    (Cavern of Souls, a signet) — a real thing to suggest, just not what this
    boost is for, so it reads as off-tribe here rather than neutral.
    """
    if ref.get("changeling"):
        return True
    text = (ref.get("oracle_text") or "").lower()
    if "choose a creature type" in text:
        return True
    types = set(ref.get("types") or [])
    return bool(types & set(tribes))


def _typal_hits(rows: list[dict], tribes: list[str]) -> set[str]:
    """oracle_ids among `rows` that are built on one of the deck's own tribes.

    One round trip for the whole bucket rather than per card — `rows` is
    already capped at `PER_BUCKET_LIMIT`, the same shape `_drop_off_tribe_rows`
    queries for the tribal theme channel.
    """
    if not rows or not tribes:
        return set()

    from .graph import tribe_references

    oracle_ids = [row["oracle_id"] for row in rows]
    refs = {ref["oracle_id"]: ref for ref in tribe_references(oracle_ids)}
    return {oid for oid in oracle_ids if _row_is_on_tribe(refs.get(oid, {}), tribes)}


def _theme_hits(rows: list[dict], theme_ids: list[str]) -> set[str]:
    """oracle_ids among `rows` that fit one of the deck's own themes.

    The theme analog of `_typal_hits`: membership in the precomputed
    FITS_THEME edges, one round trip over at most PER_BUCKET_LIMIT rows.
    Nothing to check → the graph is never asked.
    """
    if not rows or not theme_ids:
        return set()

    from .graph import fits_theme_among

    oracle_ids = [row["oracle_id"] for row in rows]
    return {r["oracle_id"] for r in fits_theme_among(oracle_ids, theme_ids)}


def _supply_hits(rows: list[dict], made: list[str], allowed: set[str]) -> set[str]:
    """oracle_ids among `rows` that consume a resource the deck makes in surplus.

    The supply analog of `_theme_hits`: membership over the same capped
    per-bucket rows, one round trip. `allowed` is forwarded to
    `cares_about_supply` unchanged — this stays a thin wrapper, the floor and
    exclusion policy live where `allowed` is computed. Nothing to check →
    the graph is never asked.
    """
    if not rows or not made or not allowed:
        return set()

    from .graph import cares_about_supply

    return cares_about_supply([row["oracle_id"] for row in rows], made, allowed)


def _typal_provenance(row: dict) -> Provenance:
    """Score a typal hit.

    Max, not sum, across the matched relations — for the same reason the bridge
    takes a max across resources. A Goblin lord that also makes Goblin tokens is
    one hit as strong as its best claim, not two stacked.
    """
    creature_type = row.get("creature_type") or "the tribe"
    share = row.get("share") or 0.0
    relations = row.get("relations") or []

    strength = max((TYPAL_RELATION_WEIGHT.get(r, 0.4) for r in relations), default=0.4)
    if "CARES_ABOUT_TYPE" in relations:
        code = "typal-cares"
        detail = f"{creature_type} payoff — {share:.0%} of your deck"
    elif "MAKES_TYPE" in relations:
        code = "typal-makes"
        detail = f"makes {creature_type}s — {share:.0%} of your deck"
    else:
        code = "typal-is"
        detail = f"is a {creature_type} — {share:.0%} of your deck"

    # Share is a boost, not a multiplier. `deck_typal_profile` already applied a
    # floor, so anything reaching this channel is a confirmed tribe — scaling by
    # share a second time only penalises a deck that runs two of them.
    return Provenance(
        channel="typal_bridge",
        detail=detail,
        code=code,
        params={"type": creature_type, "share": f"{share:.0%}"},
        score=WEIGHT_TYPAL
        * (0.5 + 0.5 * share)
        * strength
        * weight_within_group(row.get("edhrec_rank"), rarity=row.get("rarity")),
        key=creature_type,
    )


def _parse_focus(focus: str | None) -> Focus | None:
    """`"theme:landfall"`, `"bucket:ramp"`, `"resource:etb_trigger"`.

    A bare value is treated as a theme, since that is what a user picking from
    a list of themes will send.
    """
    if not focus or not focus.strip():
        return None

    raw = focus.strip()
    kind, _, value = raw.partition(":")
    if not value:
        return Focus(kind="theme", value=raw, label=raw)
    if kind not in {"theme", "bucket", "resource"}:
        return Focus(kind="theme", value=raw, label=raw)

    return Focus(kind=kind, value=value, label=value.replace("_", " "))


def _resolve_theme_prefs(
    pinned: list[str] | None,
    excluded: list[str] | None,
    focus_value: str | None,
    notes: list[Phrase],
) -> tuple[list, list]:
    """Validate stored theme preferences against the live theme layer.

    Preferences are per-deck state that outlives releases, so an id that no
    longer names a theme is expected, not an error: it is dropped with one
    aggregated note, never a 422. Precedence, each with a note:

    - pinned ∩ excluded: the pin wins. Stored preferences should never hold
      both, but a stale sync can.
    - a `focus` naming an excluded theme: the focus wins for this request —
      it is the explicit per-request ask, the exclusion is standing state.
    - a `focus` naming a pinned theme: deduplicated, the channel runs once.
    """
    from .themes import THEMES

    unknown = [t for t in (*(pinned or []), *(excluded or [])) if t not in THEMES]
    if unknown:
        names = ", ".join(sorted(set(unknown)))
        notes.append(phrase("themes-unknown", f"Ignoring unknown themes: {names}.", names=names))

    pins = [THEMES[t] for t in dict.fromkeys(pinned or []) if t in THEMES]
    outs = [THEMES[t] for t in dict.fromkeys(excluded or []) if t in THEMES]

    overlap = {t.id for t in pins} & {t.id for t in outs}
    if overlap:
        labels = ", ".join(sorted(THEMES[t].label for t in overlap))
        notes.append(
            phrase(
                "themes-pin-wins",
                f"{labels}: pinned and excluded at once — the pin wins.",
                labels=labels,
            )
        )
        outs = [t for t in outs if t.id not in overlap]

    if focus_value and any(t.id == focus_value for t in outs):
        label = THEMES[focus_value].label
        notes.append(
            phrase(
                "themes-focus-wins",
                f"{label} is excluded, but you asked to focus on it — the focus wins here.",
                label=label,
            )
        )
        outs = [t for t in outs if t.id != focus_value]

    if focus_value:
        pins = [t for t in pins if t.id != focus_value]

    return pins, outs


def _off_theme_lean(
    top: list[Suggestion], deck_themes: list, already: list[str]
) -> list[ThemeLean]:
    """Themes the answer reads as that the deck does not play.

    Deliberately measured on the cards that were *shown*, not on the pool. The
    pool is everything the channels reached and nobody sees it; the question
    being answered is "what does this page look like it is about", and only the
    page can answer that.

    Read off `FITS_THEME`, which is why it catches the case that matters: a
    vehicle arriving through `edhrec_synergy` carries no theme provenance at
    all, so anything counting channel entries would report nothing while half
    the page was vehicles.

    Themes already excluded are skipped — their cards are demoted but still
    present, and offering to exclude what is already excluded reads as the
    setting having failed.
    """
    from .graph import fits_theme_among
    from .themes import THEMES

    if not top:
        return []

    deck_share = {row.theme: row.share for row in deck_themes}
    skip = set(already)
    candidates = [t for t in THEMES if t not in skip]

    rows = fits_theme_among([s.oracle_id for s in top], candidates)
    hits: dict[str, int] = {}
    for row in rows:
        # A card counts once for a theme it fits, whatever its fit — this is a
        # share of the page, not a weighted score. Below a real fit the theme
        # is incidental and would make every page look like everything.
        if (row.get("fit") or 0.0) >= 0.5:
            hits[row["theme_id"]] = hits.get(row["theme_id"], 0) + 1

    out = [
        ThemeLean(
            theme=theme_id,
            label=THEMES[theme_id].label,
            share=round(count / len(top), 3),
            deck_share=round(deck_share.get(theme_id, 0.0), 3),
        )
        for theme_id, count in hits.items()
        if count / len(top) >= OFF_THEME_SHARE
        and deck_share.get(theme_id, 0.0) <= OFF_THEME_DECK_CEILING
    ]
    return sorted(out, key=lambda t: -t.share)


def _apply_theme_exclusions(
    candidates: list[_Candidate],
    fits_rows: list[dict],
    labels: dict[str, str],
    share_rows: list[dict] | None = None,
) -> tuple[list[_Candidate], int]:
    """Demote, not ban: cancel the card's case in proportion to how much of it
    is the excluded theme.

    Each candidate fitting an excluded theme gains a *visible negative*
    provenance entry — max-fit theme only, max-not-sum, the bridge's rule. A
    card with other reasons to exist sinks in the ranking with the demotion on
    display; a card whose only reason was the excluded theme ends below
    everything that has one.

    That last sentence was the intent from the start and the arithmetic did not
    deliver it. Subtracting "exactly what a pin would have granted" — then
    `WEIGHT_THEME * fit * (0.25 + playability)`, peaking near -1.1 (the
    constant is `WEIGHT_THEME_DECLARED` now, and larger) — assumed the
    theme channel was what put the card there. Usually it was not: an
    `edhrec_synergy` entry reaches 7, so the demotion moved a card a few places
    and left it on the page. Measured: a deck reading 71% reanimator and no
    vehicles, with vehicles excluded, kept 10 of its 13 vehicle suggestions.

    So the demotion is scaled to the candidate's own score rather than to a
    channel constant. A card that entirely *is* the excluded theme — fit 1.0,
    which every real Vehicle has — loses its whole argument and lands at zero,
    below everything with a reason to be there. One that half-fits keeps half.
    Nothing to restate when a channel weight moves, and no ban: the entry is
    still visible, still explains itself, and a caller that wants the card can
    still see why it was pushed down.

    `fit` still answers the wrong question for that scaling, though: it is
    theme-normalised (matched weight over the *theme's* whole weighted
    vocabulary), which is what detection needs and exclusion does not — a
    card that is entirely one of the theme's five terms and nothing else
    reads as a 20% fit, and a card below `FIT_THRESHOLD` or failing the gate
    has no `FITS_THEME` edge to read at all. `share_rows` (from
    `theme_share_among`) is card-normalised instead — how much of *the
    card's own* identity the theme accounts for — and the demotion strength
    used per candidate-theme pair is `max(card_share, stored_fit)`: never a
    replacement, so a card the stored edge already condemned never demotes
    *less* than it did before this fix, only more once the card's own
    identity says so. `share_rows` is optional and defaults to none, so a
    caller that has not computed it yet — or a test exercising `fits_rows`
    alone — gets exactly today's stored-fit-only behaviour.

    Clamped at zero first, so a candidate already demoted below it by an
    earlier pass is not handed a *positive* entry by the double negative.

    Defensively, `theme_fit` entries for excluded themes are stripped first
    and candidates left with no provenance at all are dropped. Unreachable
    through `suggest()` — resolution guarantees a theme is never both pinned
    and excluded, and only pins and the focus create `theme_fit` entries —
    but stored preferences arrive from outside and this function should hold
    on its own terms. Returns the survivors and how many were demoted.
    """
    excluded_ids = set(labels)
    strength: dict[tuple[str, str], float] = {}
    for row in fits_rows:
        key = (row["oracle_id"], row["theme_id"])
        fit = row.get("fit") or 0.0
        if fit > strength.get(key, 0.0):
            strength[key] = fit
    for row in share_rows or []:
        key = (row["oracle_id"], row["theme_id"])
        share = row.get("share") or 0.0
        if share > strength.get(key, 0.0):
            strength[key] = share

    best_fit: dict[str, tuple[str, float]] = {}
    for (oracle_id, theme_id), value in strength.items():
        current = best_fit.get(oracle_id)
        if current is None or value > current[1]:
            best_fit[oracle_id] = (theme_id, value)

    kept: list[_Candidate] = []
    demoted = 0

    for candidate in candidates:
        candidate.provenance = [
            p
            for p in candidate.provenance
            if not (p.channel == "theme_fit" and p.key in excluded_ids)
        ]
        if not candidate.provenance:
            continue

        hit = best_fit.get(candidate.oracle_id)
        if hit is not None:
            theme_id, fit = hit
            candidate.provenance.append(
                Provenance(
                    channel="theme_excluded",
                    detail=f"reads as {labels[theme_id]} ({fit:.0%} fit) — a theme you excluded",
                    code="theme-excluded",
                    params={"label": labels[theme_id], "fit": f"{fit:.0%}"},
                    score=-fit * max(candidate.score(), 0.0),
                    key=theme_id,
                )
            )
            demoted += 1
        kept.append(candidate)

    return kept, demoted


def _apply_bucket_saturation(
    candidates: list[_Candidate],
    bucket_rows: list,
    roles_by_card: Mapping[str, Mapping[str, float]],
) -> tuple[list[_Candidate], int]:
    """Demote candidates that join a bucket the deck is already over on.

    `_apply_type_saturation`'s shape exactly: a visible negative provenance
    entry, never a ban, and penalty-only. The positive side belongs to the
    role-gap channel, which knows a card *fills* a shortfall; a bonus for
    merely sitting in a hungry bucket would recommend bad ramp, which is the
    complaint inverted rather than answered.

    A card in two buckets is judged on both, which is the honest reading of a
    real tension: `mana_rock` sits in ramp *and* mana_sources, so a deck short
    on ramp and long on mana sources gets no free lunch from a signet — the
    demotion it earns on one axis offsets the shortfall it serves on the other,
    and a land-ramp spell that only touches ramp ends up preferred.

    Negative entries are excluded from the multi-channel bonus by `score()`,
    so a demotion can never refund half of itself.
    """
    from .vocabulary import BUCKET_ROLES

    over = {str(row.bucket): row for row in bucket_rows if row.status == "high"}
    if not over:
        return candidates, 0

    # Which roles put a card in an over-full bucket, resolved once.
    roles_over = {
        name: {str(role) for role in BUCKET_ROLES[bucket]}
        for bucket in BUCKET_ROLES
        if (name := str(bucket)) in over
    }

    demoted = 0
    for candidate in candidates:
        held = roles_by_card.get(candidate.oracle_id, {})
        roles = {role for role, weight in held.items() if weight}
        for name, roles_in_bucket in roles_over.items():
            if not roles & roles_in_bucket:
                continue
            row = over[name]
            overage = row.coverage - row.high
            candidate.provenance.append(
                Provenance(
                    channel="bucket_saturation",
                    detail=(
                        f"deck already holds {row.coverage:.0f} {name.replace('_', ' ')} "
                        f"against a target of {row.low:.0f}–{row.high:.0f}"
                    ),
                    code="bucket-saturation",
                    # Kebab so the wording can nest the bucket's own
                    # translated name: `$t(label.bucket-{{bucket}})`.
                    params={
                        "coverage": f"{row.coverage:.0f}",
                        "bucket": name.replace("_", "-"),
                        "low": f"{row.low:.0f}",
                        "high": f"{row.high:.0f}",
                    },
                    score=-WEIGHT_BUCKET_SATURATION * min(1.0, overage / BUCKET_SATURATION_RAMP),
                    key=name,
                )
            )
            demoted += 1

    return candidates, demoted


def _apply_type_saturation(
    candidates: list[_Candidate], type_rows: list
) -> tuple[list[_Candidate], int]:
    """Demote candidates whose primary type the deck is already over on.

    `_apply_theme_exclusions`' shape: a visible negative provenance entry,
    never a ban. Penalty-only by design — under-representation is served by
    the positive channels, and a bonus for "is an instant" would recommend
    bad instants, the original defect inverted. Land is never demoted: its
    target weight is zero (the mana_sources bucket owns land count) and
    "you have too many lands" is a cut question, not an adds question.

    Negative entries are excluded from the multi-channel bonus by `score()`,
    so the demotion can never refund half of itself.
    """
    from .composition import primary_type

    over = {row.type: row for row in type_rows if row.status == "high" and row.type != "Land"}
    if not over:
        return candidates, 0

    demoted = 0
    for candidate in candidates:
        row = over.get(primary_type(candidate.type_line))
        if row is None:
            continue
        overage = row.count - row.high
        candidate.provenance.append(
            Provenance(
                channel="type_saturation",
                detail=(
                    f"deck holds {row.count:.0f} {row.type.lower()} cards "
                    f"against a target of {row.low:.0f}–{row.high:.0f}"
                ),
                code="type-saturation",
                params={
                    "amount": f"{row.count:.0f}",
                    "type": row.type,
                    "low": f"{row.low:.0f}",
                    "high": f"{row.high:.0f}",
                },
                score=-WEIGHT_TYPE_SATURATION * min(1.0, overage / TYPE_SATURATION_RAMP),
                key=row.type,
            )
        )
        demoted += 1

    return candidates, demoted


# The three classes C3 checks, and what they are weighed against. Order
# matters only for which reason wins when a candidate happens to clear more
# than one class's tag — rare (Cursed Totem is not also Null Rod), and
# harmless either way since every class still gets its own provenance entry.
#
#   class       candidate test                    deck-exposure role
#   artifact    `null-rod` Tagger tag (Null Rod,   Role.MANA_ROCK, summed
#               Collector Ouphe, Stony Silence...)
#   graveyard   Role.GRAVEYARD_HATE                Role.RECURSION, summed
#   ability     `hate-activation` Tagger tag       Role.MANA_DORK, summed
#               (Cursed Totem...)
#
# Thresholds and their derivation live in `interaction.py`, next to the
# measurement that produced them — this module only reads the constants.
_ASYMMETRY_EXPOSURE_ROLE: dict[str, Role] = {
    "artifact": Role.MANA_ROCK,
    "graveyard": Role.RECURSION,
    "ability": Role.MANA_DORK,
}


def _apply_asymmetry_check(
    candidates: list[_Candidate],
    roles_by_card: Mapping[str, Mapping[str, float]],
    tag_hits: Mapping[str, set[str]],
    deck_roles: Mapping[str, float],
) -> tuple[list[_Candidate], int]:
    """Demote a stax/hate candidate that would hose the pilot's own board too.

    v1's three narrow, measurable cases (`TASK-C-INTERACTION-GRID.md` C3):
    artifact hate (Null Rod class) against the deck's own artifact-mana
    count, graveyard hate against its own recursion, ability hate (Cursed
    Totem class) against its own mana-dork count. Deliberately does *not*
    depend on Task B's fold data — the deck's own role edges are read
    directly, so this stays parallel with Wave 1's other tasks.

    `_apply_type_saturation`'s shape exactly: a visible negative provenance
    entry, demote-not-ban, excluded from the multi-channel bonus by `score()`
    because the entry's score is negative.
    """
    from .interaction import (
        ABILITY_HATE_EXPOSURE_THRESHOLD,
        ARTIFACT_HATE_EXPOSURE_THRESHOLD,
        GRAVEYARD_HATE_EXPOSURE_THRESHOLD,
    )

    thresholds = {
        "artifact": ARTIFACT_HATE_EXPOSURE_THRESHOLD,
        "graveyard": GRAVEYARD_HATE_EXPOSURE_THRESHOLD,
        "ability": ABILITY_HATE_EXPOSURE_THRESHOLD,
    }

    demoted = 0
    for candidate in candidates:
        held = roles_by_card.get(candidate.oracle_id, {})
        is_member = {
            "artifact": candidate.oracle_id in tag_hits.get("artifact", ()),
            "graveyard": bool(held.get(str(Role.GRAVEYARD_HATE), 0.0)),
            "ability": candidate.oracle_id in tag_hits.get("ability", ()),
        }
        for cls, member in is_member.items():
            if not member:
                continue
            threshold = thresholds[cls]
            exposure = deck_roles.get(str(_ASYMMETRY_EXPOSURE_ROLE[cls]), 0.0)
            if exposure <= threshold:
                continue
            overage = exposure - threshold
            candidate.provenance.append(
                Provenance(
                    channel="asymmetry",
                    detail=(
                        f"deck runs {exposure:.0f} of its own {cls} supply — "
                        "likely to hurt its own side about as much as the table's"
                    ),
                    # One static code, not one per class — `code="..."` is
                    # what `test_translations.py` extracts by regex, and a
                    # dynamic `f"asymmetry-{cls}"` would be invisible to it.
                    # `class` distinguishes the three the same way
                    # `why-bucket-saturation`'s `$t(label.bucket-{{bucket}})`
                    # nests a per-value label inside one translated sentence.
                    code="asymmetry",
                    params={
                        "class": cls,
                        "exposure": f"{exposure:.0f}",
                        "threshold": f"{threshold:.0f}",
                    },
                    score=-WEIGHT_ASYMMETRY * min(1.0, overage / threshold),
                    key=cls,
                )
            )
            demoted += 1

    return candidates, demoted


def _matches_focus(candidate: _Candidate, focus: Focus) -> bool:
    """Whether a candidate speaks to what was asked for."""
    for provenance in candidate.provenance:
        if (
            focus.kind == "theme"
            and provenance.channel == "theme_fit"
            and provenance.key == focus.value
        ):
            return True
        wanted = focus.value.replace("_", " ")
        if (
            focus.kind == "bucket"
            and provenance.channel == "role_gap"
            and wanted in provenance.detail
        ):
            return True
        if (
            focus.kind == "resource"
            and provenance.channel == "resource_bridge"
            and wanted in provenance.detail
        ):
            return True
    return False


def _combo_provenance(combo, partner_names: list[str], scale: float = 1.0) -> Provenance:
    produces = combo.produces[0] if combo.produces else "a combo"
    with_cards = " + ".join(partner_names[:2]) or "cards you already run"
    detail = f"completes {with_cards} → {produces}"
    # The reweight is provenance, not silent, in both directions: the row and
    # the score radar print this detail, so the user sees *why* the number is
    # small — or, at brackets 4-5, why it is large.
    if scale < 1.0:
        detail += " · damped at this speed"
    elif scale > 1.0:
        detail += " · boosted at this speed"
    return Provenance(
        channel="combo_completion",
        detail=detail,
        code=("combo-damped" if scale < 1.0 else "combo-boosted" if scale > 1.0 else "combo"),
        params={"with": with_cards, "produces": produces},
        score=WEIGHT_COMBO * 2.0 * scale,
    )


def _withhold_bracket_breakers(
    candidates: list[_Candidate],
    speed: float,
    *,
    deck_game_changers: int = 0,
    flags: dict[str, dict[str, bool]] | None = None,
) -> tuple[list[_Candidate], list[Phrase]]:
    """Suggestions that would trip the claimed bracket's own legality band.

    Withheld entirely rather than down-weighted: a mispriced score still
    surfaces the card, and "we suggest fewer of these" is not a
    bracket-legal deck. Three rules, mirroring the `BRACKETS` table the band
    reads (services/mtg/src/models/format.rs):

    - **Game changers.** Brackets 1-2 play none, so below bracket 3 every one
      is withheld — the layer's original job. Bracket 3 allows three, and
      the deck's own count is what decides: a deck already at the cap gets
      no game-changer suggestions, because accepting any one of them makes
      the legality band contradict the advisor that put it there. Under the
      cap they stay — a single accepted suggestion cannot exceed it, and
      the fill solver carries the count constraint for multi-card adds.
    - **Extra turns** and **mass land denial.** The band flags any of either
      through bracket 3 (`extra_turns: false`, `mass_land_denial: false`),
      so through bracket 3 neither is a suggestion. `flags` carries the
      per-candidate answers from `bracket_breakers`, the same patterns the
      catalog sync stamps onto the cards the band counts.

    Brackets 4-5 withhold nothing. Returns the survivors and one note per
    class actually withheld — a note about zero cards would be noise
    wearing honesty.
    """
    if speed >= SPEED_BRACKET_FOUR:
        return candidates, []

    flags = flags or {}

    # One withholding shape for all three rules: drop what the predicate
    # condemns, count the dropped, say so in the rule's own words. The
    # game-changer rule differs only in when it is armed — always below
    # bracket 3, at bracket 3 once the deck is at its cap — and in which of
    # two notes explains the drop.
    def game_changer_note(dropped: int) -> Phrase:
        if speed < SPEED_BRACKET_THREE:
            return phrase(
                "game-changers-withheld",
                f"{dropped} game changer{_plural(dropped)} withheld at this power level — "
                "brackets 1 and 2 play none. Raise the power level to see them.",
                amount=dropped,
            )
        return phrase(
            "game-changers-at-cap",
            f"{dropped} game changer{_plural(dropped)} withheld — the deck already "
            f"plays bracket 3's {GAME_CHANGER_CAP_BRACKET_THREE}. "
            "Raise the bracket to see them.",
            amount=dropped,
            cap=GAME_CHANGER_CAP_BRACKET_THREE,
        )

    def band_note(code: str, told: str):
        def note(dropped: int) -> Phrase:
            return phrase(
                code,
                f"{dropped} {told}{_plural(dropped)} withheld — brackets 1 through 3 "
                "play none. Raise the bracket to see them.",
                amount=dropped,
            )

        return note

    rules = (
        (
            speed < SPEED_BRACKET_THREE or deck_game_changers >= GAME_CHANGER_CAP_BRACKET_THREE,
            lambda c: c.game_changer,
            game_changer_note,
        ),
        (
            True,
            lambda c: bool(flags.get(c.oracle_id, {}).get("extra_turns")),
            band_note("extra-turns-withheld", "extra-turn spell"),
        ),
        (
            True,
            lambda c: bool(flags.get(c.oracle_id, {}).get("mass_land_denial")),
            band_note("mass-land-denial-withheld", "mass-land-denial card"),
        ),
    )

    notes: list[Phrase] = []
    kept = candidates
    for armed, breaks, note in rules:
        if not armed:
            continue
        survivors = [c for c in kept if not breaks(c)]
        if dropped := len(kept) - len(survivors):
            notes.append(note(dropped))
        kept = survivors

    return kept, notes


# A card usually surfaces from more than one channel. It appears once, under the
# gap its strongest provenance speaks to, while the card itself still lists
# every channel that found it.
_GROUP_FOR_CHANNEL = {
    "role_gap": "bucket",
    "basic_lands": "bucket",
    "fixing_lands": "bucket",
    "tutor_access": "bucket",
    "fast_mana": "bucket",
    "free_spell": "bucket",
    "resource_bridge": "resource",
    "combo_completion": "combo",
    "theme_fit": "theme",
    "typal_bridge": "typal",
    "edhrec_synergy": "staples",
    "edhrec_synergy_cedh": "staples",
}


# Group membership is decided by priority, not by score. EDHREC synergy scores
# an order of magnitude above a bucket shortfall, so picking the highest-scoring
# provenance filed every card under "staples" and the grouping said nothing.
# What matters is what a card does *for this deck*: closing a gap outranks being
# popular, even when the popularity score is larger.
# `typal_bridge` sits directly under an explicit theme focus and above a bucket
# shortfall: if the deck is Goblins, "this is a Goblin card" is what the user
# wants the heading to say, not "fills interaction".
_CHANNEL_PRIORITY = (
    "theme_fit",
    "typal_bridge",
    # Above role_gap: fixing only ever fires on lands, and "fixes your
    # colours" is the honest heading for one — a fetch also fills the tutor
    # role, and seating it under Synergy by that technicality scattered the
    # mana base across the grouping. Tutors are similarly a fetch's secondary
    # role; a deck actually short on tutors should read as "Tutors", not
    # "Synergy" by incidence.
    "fixing_lands",
    "tutor_access",
    # Same technicality as tutors: a Mox is a body a resource_bridge want
    # could also claim, and a deck genuinely short on fast mana or free
    # interaction at bracket 5 should read as exactly that, not "Resources".
    "fast_mana",
    "free_spell",
    "role_gap",
    "resource_bridge",
    "combo_completion",
)


# How much of the answer a pinned theme is guaranteed, when the pool can fill
# it. Not a quota the solver enforces — a floor applied to the ranked list.
#
# 0.30 rather than something larger because a pin is "argue for this", not
# "show me nothing else": `focus` is the narrowing ask and it already exists.
# At limit=45 this is 13 slots, which against the 9 a treasure-heavy Prosper
# deck was already getting is a visible change without turning the other
# thirty-two into an afterthought.
PINNED_THEME_SHARE = 0.30


def _promote_floor(
    ranked: list[_Candidate],
    limit: int,
    floor: int,
    is_wanted,
    is_protected=None,
) -> tuple[list[_Candidate], int]:
    """Guarantee `is_wanted` cards a floor of the answer, by promotion not score.

    Scores alone cannot deliver what a floor promises. The theme channel is the
    weakest in the layer (see the measured table beside the weights) and the
    answer is truncated at `limit`, so a wanted card that ranks 46th is simply
    absent however much its own term is raised — and raising it far enough to
    beat a basic-land shortfall at 8.00 would bury the mana base to surface a
    Treasure. Promotion says the thing the product means: *some* of this
    answer is the thing asked for, chosen best-first, and the rest is still
    the best advice available.

    Displacement comes off the bottom of the kept window and never takes a
    card that is wanted itself — otherwise two floors would evict each other
    and be met by cards that were already there — nor one `is_protected`
    guards, which is how a later floor keeps its hands off an earlier one's
    promotions.

    A no-op when the floor is empty, when the pool holds no more wanted cards
    than already made the cut, or when `limit` exceeds the candidate count
    (nothing is being truncated, so nothing needs rescuing).
    """
    if floor <= 0 or limit <= 0 or len(ranked) <= limit:
        return ranked, 0

    kept, rest = ranked[:limit], ranked[limit:]
    have = sum(1 for c in kept if is_wanted(c))
    if have >= floor:
        return ranked, 0

    # Best-first among the wanted cards that missed the cut, and only as many
    # as the floor is short by.
    waiting = [c for c in rest if is_wanted(c)][: floor - have]
    if not waiting:
        return ranked, 0

    # Evict the weakest unwanted, unprotected cards in the window, worst first.
    evictable = [
        c for c in reversed(kept) if not is_wanted(c) and not (is_protected and is_protected(c))
    ][: len(waiting)]
    if len(evictable) < len(waiting):
        waiting = waiting[: len(evictable)]
        evictable = evictable[: len(waiting)]
    if not waiting:
        return ranked, 0

    # Identity, not equality: `_Candidate` is a plain dataclass, so `in` would
    # compare every field including the provenance list — quadratic, and it
    # would conflate two candidates that happened to match.
    evicted = {id(c) for c in evictable}
    rescued = {id(c) for c in waiting}
    promoted = [c for c in kept if id(c) not in evicted] + waiting
    promoted.sort(key=lambda c: -c.score())
    demoted = [c for c in rest if id(c) not in rescued] + evictable
    demoted.sort(key=lambda c: -c.score())
    return promoted + demoted, len(waiting)


def _carries_pinned(candidate: _Candidate, wanted: set[str]) -> bool:
    """Whether any of the candidate's arguments is one of the pinned themes."""
    return any(p.channel == "theme_fit" and p.key in wanted for p in candidate.provenance)


def _reserve_pinned_slots(
    ranked: list[_Candidate], pins: list, limit: int
) -> tuple[list[_Candidate], int]:
    """Guarantee pinned themes `PINNED_THEME_SHARE` of the answer.

    The mechanics and their rationale live at `_promote_floor`; this binds
    them to the pins.
    """
    if not pins:
        return ranked, 0
    wanted = {theme.id for theme in pins}
    return _promote_floor(
        ranked, limit, int(limit * PINNED_THEME_SHARE), lambda c: _carries_pinned(c, wanted)
    )


# The seat reserve's ceiling. The floor is `min(seats, 4)` — it *is* the seat
# count, which is the user's sentence made mechanism: two commanders, two
# slots; a Rule 0 zone of four, four. Capped because the request admits up to
# eight seats and eight slots of a 40-card answer would stop being a floor and
# start being a focus.
SEAT_THEME_SLOTS = 4

# The voice reserve is one slot *per argued theme*, not a headcount. A total
# floor was tried first and measured wrong on the deck that prompted all
# this: Far Traveler's `enchantress` riders landed on Bear Umbra and
# Asceticism — in the answer already, on other merits — the floor read
# "satisfied", and `blink`, the seat's 1.00-fit theme, still never landed a
# card. Per-theme floors are the promise kept: every theme the seat argues
# places its best card. The theme count is capped by `SEAT_VOICE_THEME_LIMIT`
# per seat and `SEAT_THEME_SLOTS` overall.


def _reserve_seat_slots(
    ranked: list[_Candidate], pins: list, seats: int, limit: int
) -> tuple[list[_Candidate], int]:
    """Guarantee the seat grant a visible sliver of the answer.

    The grant's own scores cannot do it: the family's fits run ~0.4–0.6 and
    the seat term tops out at 0.70, so a grant-only card scores ~0.2–0.6
    against top-40 cutoffs that a themed deck holds above 1.2 — measured on a
    three-seat Dragons deck, where exactly 4 of 81 family cards reached the
    top 120 and none the top 40. Promotion, not weight, for
    `_reserve_pinned_slots`'s reason: raising the weight until Bastion
    Protector beats a Dragon lord would distort every score to fix a
    visibility problem.

    Fires only where the grant fired (a no-op otherwise: nothing carries the
    code), and never evicts a pinned card — the pin floor ran first and said
    something the user asked it to say.
    """
    if seats < 2:
        return ranked, 0
    wanted = {theme.id for theme in pins}

    def is_seat(candidate: _Candidate) -> bool:
        return any(p.code == "theme-seats" for p in candidate.provenance)

    return _promote_floor(
        ranked,
        limit,
        min(seats, SEAT_THEME_SLOTS),
        is_seat,
        lambda c: _carries_pinned(c, wanted),
    )


def _reserve_voice_slots(
    ranked: list[_Candidate], pins: list, voiced: dict, limit: int
) -> tuple[list[_Candidate], int]:
    """Guarantee each voiced theme its best card in the answer.

    Same promotion mechanics as `_reserve_seat_slots` and for the same
    measured reason — voice scores land at ~0.2–0.5 against themed-deck
    cutoffs above 1.2 — but floored per theme (see the constants block for
    the Bear Umbra failure a total floor produced). Strongest seat fit
    first, so when the overall cap truncates, the themes that define the
    seat survive. Runs after the pin and seat-grant floors and protects
    both, plus every voice card already placed — each earlier floor said
    something this one must not unsay. A no-op when every seat has data:
    nothing is voiced.
    """
    if not voiced:
        return ranked, 0
    wanted = {theme.id for theme in pins}

    def protected(candidate: _Candidate) -> bool:
        return _carries_pinned(candidate, wanted) or any(
            p.code in ("theme-seats", "theme-seat-voice") for p in candidate.provenance
        )

    themes = sorted(voiced, key=lambda t: -voiced[t][1])[:SEAT_THEME_SLOTS]
    total = 0
    for theme_id in themes:

        def is_voice(candidate: _Candidate, theme_id: str = theme_id) -> bool:
            return any(
                p.code == "theme-seat-voice" and p.key == theme_id for p in candidate.provenance
            )

        ranked, promoted = _promote_floor(ranked, limit, 1, is_voice, protected)
        total += promoted
    return ranked, total


def _primary_group(suggestion: Suggestion) -> tuple[str, str]:
    """The group key and label a card belongs under."""
    by_channel = {p.channel: p for p in suggestion.provenance}
    best = next(
        (by_channel[c] for c in _CHANNEL_PRIORITY if c in by_channel),
        max(suggestion.provenance, key=lambda p: p.score),
    )
    kind = _GROUP_FOR_CHANNEL.get(best.channel, "staples")

    if kind == "bucket":
        # Basics, fixing lands, and tutors carry a shortfall sentence, not a
        # "fills X" detail — their seat is the bucket by definition, never
        # parsed from prose. basic_lands and fixing_lands both sit in the
        # mana bucket; tutors get their own.
        if best.channel in ("basic_lands", "fixing_lands"):
            return "bucket:mana sources", "Mana Sources"
        if best.channel == "tutor_access":
            return "bucket:tutors", "Tutors"
        bucket = best.detail.split(" — ")[0].removeprefix("fills ").strip()
        return f"bucket:{bucket}", bucket.replace("_", " ").title()
    if kind == "resource":
        resource = best.detail.removeprefix("supplies ").split(" — ")[0].split(",")[0].strip()
        return f"resource:{resource}", resource.title()
    if kind == "typal":
        # "Goblin payoff — 62% of your deck" / "is a Goblin — …": the type is the
        # first word either way, and the dash separates it from the share.
        creature_type = best.detail.split(" — ")[0].removeprefix("is a ").removeprefix("makes ")
        creature_type = creature_type.removesuffix(" payoff").removesuffix("s").strip()
        return f"typal:{creature_type}", creature_type
    if kind == "theme":
        # Per-theme when the entry knows which theme it is — several pinned
        # themes must not pool under one anonymous heading. The keyless form
        # survives for reports serialized before `key` existed.
        if best.key:
            from .themes import THEMES

            theme = THEMES.get(best.key)
            if theme is not None:
                return f"theme:{theme.id}", theme.label
        return "theme:focus", "Theme"
    if kind == "combo":
        return "combo", "Completes a combo"
    return "staples", "Commander staples"


def _build_groups(
    suggestions: list[Suggestion], bucket_reasons: dict[str, str]
) -> list[SuggestionGroup]:
    grouped: dict[str, list[Suggestion]] = {}
    labels: dict[str, str] = {}

    for suggestion in suggestions:
        key, label = _primary_group(suggestion)
        grouped.setdefault(key, []).append(suggestion)
        labels[key] = label

    groups = [
        SuggestionGroup(
            key=key,
            label=labels[key],
            reason=bucket_reasons.get(key, ""),
            suggestions=members,
        )
        for key, members in grouped.items()
    ]

    # Worst shortfall first, then the rest by how much they have to offer.
    # Staples last: they answer "what do people run", not "what am I missing".
    def order(group: SuggestionGroup) -> tuple[int, float]:
        if group.key == "staples":
            return (2, 0.0)
        if group.key.startswith("bucket:"):
            return (0, -sum(s.score for s in group.suggestions))
        return (1, -sum(s.score for s in group.suggestions))

    return sorted(groups, key=order)


def effective_commanders(primary: str | None, extras: list[str] | None) -> list[str]:
    """Ordered dedup, primary first — the anchor keeps its seat."""
    out: list[str] = []
    for oracle_id in (primary, *(extras or ())):
        if oracle_id is not None and oracle_id not in out:
            out.append(oracle_id)
    return out


def suggest(
    deck_oracle_ids: list[str],
    deck_card_names: list[str],
    *,
    quantities: dict[str, int] | None = None,
    commander_oracle_id: str | None = None,
    commander_oracle_ids: list[str] | None = None,
    limit: int = 40,
    pool_filter: PoolFilter | None = None,
    include_combos: bool = True,
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
    channels: set[str] | None = None,
    diagnostics: Diagnostics | None = None,
    allow_network: bool = True,
) -> SuggestionReport:
    """Union the retrieval channels and rank the result.

    `identity` is the deck's claimed colours (Rule 0 house rules) — WUBRG
    letters. `None` derives from the commander; `[]` is a deliberate
    "colourless only", which the retrieval filter's subset semantics make
    mean exactly that. Every channel, the basics, and the fixing-lands gate
    read the resolved value, so an override scopes the whole run.

    `pool` restricts the card pool retrieval draws from — the per-card price
    cap and a compiled Scryfall-style query (see `poolquery`). It reaches
    every channel through the shared hard filter. Basic lands sit outside it
    by design (they are merged by name below, and "the deck cannot make its
    land drops" stays true in any pool); the standalone combo listing asks
    about cards already in the deck and is likewise unscoped.

    `commander_oracle_ids` is every card the deck fields as a commander —
    partners, backgrounds, Rule 0 extras. The singular `commander_oracle_id`
    stays the validated analysis anchor; the extras widen the derived
    identity to the union of all commanders' colours and join the channels'
    exclusion list, so no channel ever offers a commander as an add.

    `deck_size` is the deck's target card count outside the command zone —
    Rule 0 decks may aim at 60 or 150. The quotas the internal `diagnose`
    grades against and the fixing-lands target are tuned for 99 cards and
    scale by deck_size/99; the `deck-size-scaled` note says when they did.

    `diagnostics` lets a caller that has already diagnosed this exact deck —
    same entries, quantities, speed, overrides, and commander — hand the report
    over instead of paying `diagnose()` twice (/swaps did, for every request).
    It is trusted only while the caller's commander survives validation; if the
    commander is rejected or inferred here, the anchor differs and the deck is
    re-diagnosed.

    `allow_network` gates the EDHREC ingest for a cold commander (same name and
    semantics as `diagnose`'s flag). `True` (CLI, default) fetches inline as
    before. `False` skips the fetch — the caller has already scheduled a
    background warm instead — and the commander's note becomes "pending"
    rather than "missing" unless it is tombstoned, in which case asking again
    would not help either way.
    """
    from .diagnostics import (
        DeckEntry,
        diagnose,
        resource_relative_idf,
        role_weight_ceiling,
    )
    from .graph import (
        cards_by_name,
        cards_role_weights,
        cards_theme_fits,
        channel_bridge,
        channel_edhrec,
        channel_roles,
        channel_theme,
        channel_themes,
        channel_typal,
        find_commander,
        fits_theme_among,
        has_recommendations,
        has_recommendations_cedh,
        is_legal_commander,
        theme_share_among,
    )

    notes: list[Phrase] = []
    # Said, not silent — the same contract as the identity override below:
    # every target and range in this answer is resized from its 99-card
    # tuning, and the reader must know they are reading a rescaling rather
    # than measured data.
    if deck_size != 99:
        notes.append(
            phrase(
                "deck-size-scaled",
                f"Targets are scaled to a {deck_size}-card deck from their 99-card "
                "tuning — treat the ranges as guidance rather than measured data.",
                size=deck_size,
            )
        )
    inferred = False
    # Remembered before validation: a precomputed `diagnostics` was anchored on
    # this id, and is only reusable while the id survives unchanged.
    caller_commander = commander_oracle_id

    # A caller-supplied commander comes from the decklist's `Commander` header
    # (or its first line). Trust it only if the card can legally be one — a
    # plain export whose first line happens to be Sol Ring must not scope the
    # whole search to colourless.
    #
    # The rejection is *said*, not silent. Quietly swapping the user's stated
    # commander for a guess is exactly the failure "provenance or silence"
    # exists to prevent — and while a frontend cache bug was the actual cause
    # the day this note was added, the silent fallback here is what made that
    # bug unreadable from the UI: "(inferred)" alone cannot distinguish "you
    # sent nothing" from "you sent something and it was rejected".
    if commander_oracle_id is not None and not is_legal_commander(commander_oracle_id):
        commander_oracle_id = None
        notes.append(
            phrase(
                "commander-rejected",
                "The nominated commander was rejected — it is not in the card graph "
                "or cannot legally be a commander — so one was inferred instead.",
            )
        )

    if commander_oracle_id is None:
        found = find_commander(deck_oracle_ids)
        if found is None:
            return SuggestionReport(
                commander=None,
                commander_inferred=False,
                identity=[],
                considered=0,
                suggestions=[],
                notes=[
                    *notes,
                    phrase(
                        "no-legal-commander",
                        "No legal commander found in the decklist, so nothing can be scoped.",
                    ),
                ],
            )
        commander_oracle_id = found["oracle_id"]
        inferred = True

    from .graph import fetch_deck

    # One fetch for the whole command zone. The extras are deliberately
    # unvalidated — Rule 0 permits commanders `is_legal_commander` would
    # refuse, and the request cap (max 8 ids) is the guard — so an extra the
    # graph does not know is simply absent from the rows.
    effective = effective_commanders(commander_oracle_id, commander_oracle_ids)
    commander_by_id = {row["oracle_id"]: row for row in fetch_deck(dict.fromkeys(effective, 1))}
    commander = commander_by_id.get(commander_oracle_id)
    if commander is None:
        return SuggestionReport(
            commander=None,
            commander_inferred=inferred,
            identity=[],
            considered=0,
            suggestions=[],
            notes=[
                *notes,
                phrase("commander-not-in-graph", "Commander is not in the card graph."),
            ],
        )

    # As cast, not as printed: with The Ur-Dragon in the command zone every
    # Dragon candidate is a column cheaper, and the curve maths downstream
    # (solver fill, swap deltas) read the discounted value off `Suggestion`.
    from .eminence import discounted_cmc, eminence_discount

    discount = eminence_discount(row["name"] for row in commander_by_id.values())

    # The choke point every channel reads from: an override replaces the
    # derived identity here and everything downstream follows for free.
    # Derived is the union across the command zone, in WUBRG order — a WU+RG
    # partner deck is a four-colour deck, not a WU deck that happens to hold
    # a second commander.
    union = {colour for row in commander_by_id.values() for colour in row["color_identity"]}
    derived = [colour for colour in "WUBRG" if colour in union]
    if identity is not None and set(identity) != set(derived):
        # Said, not silent — same contract as the commander rejection above:
        # a run scoped to colours the commander does not have must say so.
        claimed = "".join(identity) or "colourless"
        notes.append(
            phrase(
                "identity-overridden",
                f"Suggestions are scoped to the deck's claimed colours ({claimed}) "
                f"rather than {commander['name']}'s own identity — a Rule 0 house rule.",
                colors=claimed,
                # The English above interpolates the name directly; without it as
                # a param a translation cannot name the commander at all.
                commander=commander["name"],
            )
        )
    identity = derived if identity is None else identity
    # Explicitly, not via `deck_oracle_ids` happening to hold them: every
    # effective commander joins the exclusion list the channels receive, so
    # no channel ever offers a commander as an add — even for a caller whose
    # card list does not include the command zone.
    retrieval_deck = list(dict.fromkeys((*deck_oracle_ids, *effective)))
    pool: dict[str, _Candidate] = {}

    # Channel selection exists for the evaluation harness: measuring whether
    # the mechanical layer contributes requires being able to switch the
    # empirical one off. `None` means all of them.
    enabled = channels or {
        "edhrec_synergy",
        "resource_bridge",
        "role_gap",
        "combo_completion",
        "typal_bridge",
        # Gates only the *detected*-theme pass. A focus or pin is user-driven
        # and bypasses the set; the automatic pass must not, or eval arms
        # with explicit channel lists would stop being isolated.
        "theme_fit",
        # The demotion passes, gated like channels so eval arms with explicit
        # lists automatically run without them and stay comparable to their
        # recorded history.
        "type_saturation",
        "bucket_saturation",
        # The asymmetry demotion (Task C3, cEDH Pro round) — gated the same
        # way, and only ever fires at `is_cedh(speed)` regardless of this
        # flag, so it costs eval nothing below bracket 5.
        "asymmetry",
        # Deliberately absent from the eval sets too: eval decks are built
        # from EDHREC card lists, which carry no basics, so every arm would
        # read as land-starved and Mountains would displace real hits.
        "basic_lands",
        # Unlike basics, eval decks *do* hold their nonbasic lands, so this
        # channel competes for eval hits on equal terms.
        "fixing_lands",
        # Mechanical, not empirical — counts a resource, not EDHREC data — so
        # eval decks (which carry their real spells, tutors included) compete
        # on equal terms, the same reasoning as fixing_lands above.
        "tutor_access",
        # Same reasoning again: eval decks carry their real fast mana and
        # free spells, so these compete on equal terms rather than needing
        # exclusion the way basics do.
        "fast_mana",
        "free_spell",
    }

    # The combo lookup needs nothing computed below — only the deck itself —
    # so it starts here and is collected at channel 5, overlapping it with
    # EDHREC and every graph query in between.
    combo_scale = _power_scale(speed)
    combo_future: Future | None = None
    if include_combos and "combo_completion" in enabled and combo_scale > 0.0:
        from .spellbook import deck_combos

        combo_future = _SPELLBOOK_POOL.submit(deck_combos, deck_oracle_ids, deck_card_names or None)

    # --- Channel 1: EDHREC ------------------------------------------------
    # Fetched on demand. The plan always called for lazy per-commander loading;
    # requiring a manual pre-fetch leaked a CLI command into the UI. When
    # `allow_network` is False the caller (a request handler) has already
    # scheduled a background warm instead — this just skips the inline fetch
    # and says so via the note below.
    #
    # One pass per effective commander: each seat has its own EDHREC page, its
    # own cold/tombstoned state, and its own note. `_merge` unions the pools —
    # a card two pages both recommend keeps one row and gains provenance, each
    # entry naming the seat that recommended it.
    #
    # The union of every seat's page, best inclusion kept — the raw material
    # for the corroboration boost below (and its self-gate: with the channel
    # disabled or the page cold this stays empty and nothing fires).
    page_inclusion: dict[str, float] = {}
    if "edhrec_synergy" in enabled:
        multi = len(effective) > 1
        for seat_id in effective:
            seat = commander_by_id.get(seat_id)
            if seat is None:
                # An extra the graph does not know — simply absent, as the
                # fetch above documents. It has no name to ingest or note.
                continue
            cold = not has_recommendations(seat_id)
            ingest_failed = False
            if cold and allow_network:
                try:
                    from .edhrec import ingest_commander

                    ingest_commander(seat["name"])
                except Exception as exc:  # noqa: BLE001 — unofficial API, must not break adds
                    log.warning("suggestions.edhrec_failed", commander=seat["name"], error=str(exc))
                    ingest_failed = True

            edhrec_rows = channel_edhrec(seat_id, retrieval_deck, identity, pool_filter=pool_filter)

            # --- cEDH subpage, retrieved before the casual page is priced --
            # `is_cedh(speed)` is the deck's own claim to bracket 5 — the
            # same switch `resolve_type_targets` uses for the card-count
            # shape. The sample floor mirrors tier 0 there too:
            # `bracket_counts["5"]` clearing `CEDH_MIN_DECKS`, because
            # EDHREC serves a `/cedh` page for every commander, including
            # ones with no real cEDH presence — the floor is mandatory, not
            # defensive. `load_bracket_counts` reads the *base* page's panel
            # from disk only, so a commander this loop just warmed above
            # already has it; one this request never manages to warm (cold
            # and `allow_network=False`) reads zero decks and skips the cEDH
            # pass for this one request. That is the fallback the edges were
            # built to guarantee: never fewer suggestions than the base page
            # already gives.
            #
            # Retrieved *before* the casual rows are merged, and not merely
            # appended after them, because whether the cEDH page answered is
            # what decides the casual page's price — see
            # `EDHREC_CASUAL_SCALE_AT_CEDH`.
            cedh_rows: list[dict] = []
            if is_cedh(speed):
                from .edhrec import load_bracket_counts

                bracket_decks = load_bracket_counts(seat["name"]).get(5, 0)
                if bracket_decks >= CEDH_MIN_DECKS:
                    cedh_cold = not has_recommendations_cedh(seat_id)
                    if cedh_cold and allow_network:
                        try:
                            from .edhrec import ingest_commander_cedh

                            ingest_commander_cedh(seat["name"])
                        except Exception as exc:  # noqa: BLE001 — unofficial API, must not break adds
                            log.warning(
                                "suggestions.edhrec_cedh_failed",
                                commander=seat["name"],
                                error=str(exc),
                            )

                    cedh_rows = channel_edhrec(
                        seat_id, retrieval_deck, identity, pool_filter=pool_filter, cedh=True
                    )

            # A deck that claimed cEDH and got a cEDH answer should not then
            # be ranked mostly by what casual decks play. Full voice whenever
            # the cEDH page said nothing, so no deck ever loses evidence it
            # would have had before this channel existed.
            casual_scale = EDHREC_CASUAL_SCALE_AT_CEDH if cedh_rows else 1.0

            if not edhrec_rows:
                from .edhrec import is_tombstoned

                # Three-way: cold and EDHREC has not already said no reads as
                # "on its way" (the warm — inline above or scheduled by the
                # caller — has not landed yet); everything else (already
                # ingested with nothing useful, tombstoned, or the inline fetch
                # itself just failed) reads as the older, flatter "missing" —
                # asking again would not change the answer.
                if cold and not ingest_failed and not is_tombstoned(seat["name"]):
                    notes.append(
                        phrase(
                            "edhrec-pending",
                            f"EDHREC statistics for {seat['name']} are on their way — "
                            "ask again in a moment.",
                            commander=seat["name"],
                        )
                    )
                else:
                    notes.append(
                        phrase(
                            "edhrec-missing",
                            f"EDHREC has no deck statistics for {seat['name']}, "
                            "so suggestions come from card mechanics and combos only.",
                            commander=seat["name"],
                        )
                    )
            for row in edhrec_rows:
                rate = row.get("inclusion_rate") or 0.0
                if rate > page_inclusion.get(row["oracle_id"], 0.0):
                    page_inclusion[row["oracle_id"]] = rate
                _merge(
                    pool,
                    row,
                    _edhrec_provenance(
                        row,
                        commander=seat["name"] if multi else None,
                        scale=casual_scale,
                    ),
                )

            for row in cedh_rows:
                rate = row.get("inclusion_rate") or 0.0
                if rate > page_inclusion.get(row["oracle_id"], 0.0):
                    page_inclusion[row["oracle_id"]] = rate
                _merge(
                    pool,
                    row,
                    _edhrec_provenance(row, commander=seat["name"] if multi else None, cedh=True),
                )

    # --- Channel 2: resource bridge --------------------------------------
    # The resource bridge asks what the deck is short of, and "short of" is
    # defined by the template. Diagnosing at a fixed speed here meant the
    # slider moved the diagnostics but never the suggestions.
    # Quantities matter: diagnosing at qty=1 collapses nine Forests into one
    # and every shortfall the bridge reports is inflated by the difference.
    counts = quantities or dict.fromkeys(deck_oracle_ids, 1)
    # The commander is passed through so both profiles are anchored on it. Without
    # it a half-built Krenko list reads as whatever its 40 cards happen to be,
    # and the suggestions follow the accident rather than the intent.
    #
    # A caller-supplied report is reused only if the commander it was anchored
    # on is still the commander — rejection or inference above changes the
    # anchor, and an anchor mismatch is silent when wrong.
    if diagnostics is not None and commander_oracle_id == caller_commander:
        report = diagnostics
    else:
        report = diagnose(
            [DeckEntry(oracle_id=oid, qty=counts.get(oid, 1)) for oid in deck_oracle_ids],
            speed=speed,
            overrides=overrides,
            curve=curve,
            type_overrides=type_overrides,
            commander_oracle_id=commander_oracle_id,
            commander_oracle_ids=commander_oracle_ids,
            deck_size=deck_size,
            allow_network=True,
        )
    wanted = [{"resource": row.resource, "gap": row.gap} for row in report.balance if row.gap > 0][
        :12
    ]

    # Excluding the `tribal` theme is the user saying "stop pushing my
    # tribe": it empties the argued tribes, which silences the on-profile
    # typal arm and the bridge/theme off-tribe filters below, and skips the
    # typal channel — one switch for every tribe-driven argument. The deck's
    # typal *profile* in diagnostics is untouched: facts stay, conclusions go.
    tribes_silenced = "tribal" in (excluded_themes or [])
    # The deck's argued tribes — computed once, ahead of the resource bridge
    # so its own off-tribe filter can read it below, and shared from here
    # with the bucket-shortfall loop's typal arm, the typal channel, and the
    # theme loops further down. Empty for a deck with no fixed tribe (a
    # Morophon-style pile) or when the tribal theme is excluded, which is
    # what gates every use of it below.
    deck_tribes = [] if tribes_silenced else [row.creature_type for row in report.typal[:3]]

    if "resource_bridge" in enabled:
        # `wanted` stays a fact — the "no gaps" note below still reads the
        # deck's real deficits, excluded theme or not. What the channel is
        # allowed to *argue for* is narrower: the same conclusions-not-facts
        # rule the supply arm follows (`_supply_match_targets`), a deficit
        # whose resource belongs to an excluded theme's own vocabulary never
        # reaches `channel_bridge`. The deck may genuinely want artifact
        # supply; with artifacts excluded the advisor stops feeding it.
        from .themes import THEMES

        excluded_vocabulary: set[str] = set()
        for theme_id in excluded_themes or []:
            theme = THEMES.get(theme_id)
            if theme is not None:
                excluded_vocabulary |= _theme_vocabulary(theme)
        # BRIDGE_UNSHOPPABLE merges into the same subtraction rather than
        # gating separately, so `tribal_payoff` never reaches `channel_bridge`
        # whether or not the request excludes anything.
        bridge_drop = excluded_vocabulary | BRIDGE_UNSHOPPABLE
        bridge_wanted = (
            [row for row in wanted if row["resource"] not in bridge_drop] if bridge_drop else wanted
        )

        # Cached on the corpus, so this is a dict lookup after the first call.
        bridge_idf = {str(r): w for r, w in resource_relative_idf().items()}
        bridge_rows = channel_bridge(
            bridge_wanted, retrieval_deck, identity, pool_filter=pool_filter
        )
        # Suppliers whose granted ability is bound to a tribe the deck does
        # not play — Goblin King, Two-Headed Sliver — sail through on
        # resources like `combat_damage_trigger` that say nothing about
        # tribe. `_drop_off_tribe_bridge_rows` is a no-op for a tribeless
        # deck, so this costs nothing there.
        for row in _drop_off_tribe_bridge_rows(bridge_rows, deck_tribes):
            _merge(pool, row, _bridge_provenance(row, bridge_idf))

    if not wanted:
        notes.append(
            phrase(
                "bridge-no-gaps",
                "Deck produces everything it wants — the resource bridge found no gaps.",
            )
        )

    # --- Channel 3: bucket shortfall --------------------------------------
    # Responds to the speed slider through the target template — the ratios
    # it fills against are the template's. (Combos and game changers respond
    # to speed too, through the power ramp rather than the template.)
    from .vocabulary import BUCKET_ROLES, Bucket

    bucket_reasons: dict[str, str] = {}
    # The deck's theme identity, for the same boost one axis over: detected
    # themes above the share floor, plus anything the user pinned, minus
    # anything they excluded. Raw param ids on purpose — an invalid pin
    # simply never matches a FITS_THEME edge; an excluded theme must never
    # grant the boost.
    deck_theme_ids = _deck_theme_ids(report.themes, pinned_themes or [], set(excluded_themes or []))
    # The deck's supply side, the same boost a third axis over: resources the
    # deck already produces past what it spends. `bridge_idf` is branch-local
    # to the resource_bridge channel, so this builds its own re-keyed dict —
    # cheap, the corpus scan behind it is cached. Skipped with an empty
    # balance (no cards yet, or a stub report): nothing to check, so the
    # corpus scan behind the IDF cache is never triggered.
    if report.balance:
        supply_idf = {str(r): w for r, w in resource_relative_idf().items()}
        deck_surplus = _deck_surplus(report.balance, supply_idf)
        supply_targets = _supply_match_targets(supply_idf, excluded_themes or [])
    else:
        deck_surplus = []
        supply_targets = set()

    # The guardrail, per explicit user requirement: playrate is only evidence
    # when the deck actually plays like the commander's usual builds. An
    # off-theme build (Voltron under a typal commander) makes the page's
    # inclusion rates argue for someone else's deck, so corroboration below
    # stays off unless the deck's own card pool overlaps that page enough to
    # trust it. `channel_edhrec` cannot answer this itself — its hard filter
    # excludes cards already in the deck, which is exactly the set this asks
    # about — hence the separate `deck_page_overlap` query. Skipped entirely
    # when `page_inclusion` is empty: a cold/tombstoned page or a disabled
    # channel must not pay a round trip for a boost that cannot fire anyway.
    # Excluded themes are handled independently, further down: a candidate
    # fitting an excluded theme is demoted by `_apply_theme_exclusions`
    # whether or not it was corroborated here. The commanders themselves sit
    # in the deck list and are never RECOMMENDS targets of their own page — a
    # one-or-two-card drag on the fraction, accepted; the floor has room for
    # it.
    page_aligned = False
    if page_inclusion:
        from .graph import deck_page_overlap

        deck_n, hits = deck_page_overlap(effective, retrieval_deck)
        page_aligned = _page_aligned(deck_n, hits)

    # Queried per bucket, not once across all of them. A half-built deck is
    # short on everything, and a single query ordered by shortfall gives every
    # slot to the largest gap — 120 mana sources and nothing else. Each short
    # bucket gets its own allowance so all of them are represented.
    for bucket_report in report.buckets:
        if "role_gap" not in enabled or bucket_report.status != "low":
            continue
        try:
            bucket = Bucket(bucket_report.bucket)
        except ValueError:
            continue

        wanted = [
            {
                "role": str(role),
                "bucket": str(bucket),
                "shortfall": bucket_report.deviation,
            }
            for role in BUCKET_ROLES[bucket]
        ]
        label = str(bucket).replace("_", " ")
        bucket_reasons[f"bucket:{label}"] = (
            f"{bucket_report.coverage} against {bucket_report.low}-{bucket_report.high}"
            f" — {bucket_report.deviation} short"
        )

        rows = channel_roles(
            wanted,
            retrieval_deck,
            identity,
            limit=PER_BUCKET_LIMIT,
            pool_filter=pool_filter,
            ceilings=role_weight_ceiling(),
        )
        # Gated to synergy_wincon — every other bucket is scored exactly as
        # before. Within it, a deck with no tribe and no qualifying theme
        # contributes nothing either, which keeps a Morophon-style pile
        # byte-identical to today.
        on_profile: set[str] = set()
        if bucket == Bucket.SYNERGY_WINCON:
            if deck_tribes:
                on_profile |= _typal_hits(rows, deck_tribes)
            if deck_theme_ids:
                on_profile |= _theme_hits(rows, deck_theme_ids)
            if deck_surplus:
                on_profile |= _supply_hits(rows, deck_surplus, supply_targets)
        # Scored first, capped second. `channel_roles` retrieves each of the
        # bucket's roles to `PER_BUCKET_LIMIT`, so a six-role bucket hands
        # back several times that — deep enough for the on-profile boost to
        # have something on-tribe to find, which is the whole point of
        # retrieving past the popular head of one role. What the bucket
        # *contributes* stays capped at PER_BUCKET_LIMIT, after the boost has
        # had its say, so the fairness that constant buys between buckets is
        # unchanged and a wide bucket cannot crowd out every other gap.
        scored = [
            (
                row,
                _role_provenance(
                    row,
                    label,
                    on_profile=row["oracle_id"] in on_profile,
                    corroboration=(
                        page_inclusion.get(row["oracle_id"], 0.0)
                        if page_aligned and bucket == Bucket.SYNERGY_WINCON
                        else 0.0
                    ),
                ),
            )
            for row in rows
        ]
        scored.sort(key=lambda pair: -pair[1].score)
        for row, provenance in scored[:PER_BUCKET_LIMIT]:
            _merge(pool, row, provenance)

    # --- Channel 3b: the mana base ----------------------------------------
    # Fires on the Land row of the type targets, not the mana-sources quota:
    # rocks and dorks can satisfy the bucket while the deck still cannot make
    # its land drops. Basics are resolved by name and merged directly rather
    # than retrieved — they are the one suggestion the already-in-deck filter
    # must not veto.
    if "basic_lands" in enabled:
        land_row = next((r for r in report.types if r.type == "Land"), None)
        if land_row is not None and land_row.status == "low":
            from .graph import land_name_payoffs, resolve_names

            payoffs = land_name_payoffs(list({*effective, *deck_oracle_ids}))
            basic_ids = resolve_names(_suggested_land_names(identity, bool(payoffs)))
            # Lands-as-payoff evidence, either kind: a name-counting payoff
            # in the deck, or a landfall share in the theme profile.
            lands_theme = bool(payoffs) or any(
                t.theme == "landfall" and t.share >= LANDS_THEME_SHARE_FLOOR for t in report.themes
            )
            provenance = _basic_land_provenance(
                land_row.count,
                land_row.low,
                land_row.high,
                scale=_basic_scale(speed, lands_theme=lands_theme),
            )
            # The snow twin carries its own reason on top of the shortfall —
            # without it, Snow-Covered Swamp next to Swamp reads as a
            # duplicate rather than an extra land name.
            snow_provenance = (
                provenance.model_copy(
                    update={
                        "detail": f"{provenance.detail} · a different land name for {payoffs[0]}"
                    }
                )
                if payoffs
                else provenance
            )
            for row in fetch_deck(dict.fromkeys(basic_ids.values(), 1)):
                is_snow = row["name"].startswith("Snow-Covered ")
                _merge(pool, row, snow_provenance if is_snow else provenance)
            bucket_reasons.setdefault(
                "bucket:mana sources",
                f"{land_row.count:.0f} lands against {land_row.low:.0f}-{land_row.high:.0f}",
            )

    # --- Channel 3c: fixing lands -----------------------------------------
    # The other half of the mana base: 3b says when there are not enough
    # lands, this one says when they are the wrong ones — so it fires on the
    # fixing count, never on the Land row, and the two argue independently.
    # "Fixing" is structural, not a tag; see `_FIXING_LAND` in graph.py.
    if "fixing_lands" in enabled and len(identity) >= 2:
        from .graph import channel_fixing, deck_fixing_count

        fetch_types = _basic_names(identity)
        fixing_count = deck_fixing_count(
            {oid: counts.get(oid, 1) for oid in deck_oracle_ids}, fetch_types
        )
        # Per-99 tuning like every quota, resized to the deck's target size.
        fixing_target = round(FIXING_LANDS_PER_COLOR * len(identity) * deck_size / 99)
        if fixing_count < fixing_target:
            for row in channel_fixing(
                retrieval_deck, identity, fetch_types, limit=FIXING_LIMIT, pool_filter=pool_filter
            ):
                _merge(
                    pool, row, _fixing_provenance(row, fixing_count, fixing_target, len(identity))
                )
            bucket_reasons.setdefault(
                "bucket:mana sources",
                f"{fixing_count} fixing lands against ~{fixing_target} for {len(identity)} colours",
            )

    # --- Channel 4: typal -------------------------------------------------
    # Driven by the deck's own typal profile, which is commander-anchored, so
    # this fires only for decks that actually have a tribe. `deck_typal_profile`
    # applies a share floor; anything reaching here is a real constraint rather
    # than the two Elves in a deck that is not an Elf deck.
    if "typal_bridge" in enabled and report.typal and not tribes_silenced:
        wanted_types = [
            {"creature_type": row.creature_type, "share": row.share} for row in report.typal[:3]
        ]
        for row in channel_typal(wanted_types, retrieval_deck, identity, pool_filter=pool_filter):
            _merge(pool, row, _typal_provenance(row))

    # --- Channel 5: combo completion -------------------------------------
    # The fetch itself was submitted before channel 1; this only collects it.
    # The count of *complete* lines the deck already holds rides out of this
    # block for channel 3d below — a deck dense in finished combos wants the
    # tutors that find them more than it wants yet another line.
    complete_combos = 0
    if include_combos and "combo_completion" in enabled:
        if combo_scale == 0.0:
            # Silent rather than damped to a sliver: a zero-score provenance
            # entry would still collect the multi-channel bonus, and the
            # external lookup is not worth making for cards we will not score.
            notes.append(
                phrase(
                    "combos-below-bracket-three",
                    "Combo completions are not scored below bracket 3 — "
                    "two-card combos are a higher-power play. "
                    "Raise the power level to score them.",
                )
            )
        else:
            try:
                combo_result = combo_future.result()
                complete_combos = len(combo_result.get("included") or [])
                combos = combo_result["almost_included"]
                one_short = [c for c in combos if len(c.missing) == 1]
                one_short, hidden_note = _gate_combos_for_bracket(one_short, speed)
                if hidden_note:
                    notes.append(hidden_note)
                one_short, payoff_note = _gate_combos_for_payoff(one_short, report.balance)
                if payoff_note:
                    notes.append(payoff_note)

                by_name: dict[str, list] = {}
                for combo in one_short:
                    by_name.setdefault(combo.missing[0], []).append(combo)

                rows = cards_by_name(
                    list(by_name), retrieval_deck, identity, pool_filter=pool_filter
                )
                # Strongest lines first, then the cap — every completion
                # scores the same flat boosted number, so without this order
                # the cut between shown and hidden would be arbitrary. See
                # COMBO_SUGGESTION_LIMIT for why there is a cap at all.
                ranked = sorted(
                    rows,
                    key=lambda row: (
                        -max(c.popularity for c in by_name[row["matched"]]),
                        -(row.get("playability") or 0.0),
                    ),
                )
                for row in ranked[:COMBO_SUGGESTION_LIMIT]:
                    combo = max(by_name[row["matched"]], key=lambda c: c.popularity)
                    partners = [n for n in combo.card_names if n != row["matched"]]
                    _merge(pool, row, _combo_provenance(combo, partners, combo_scale))
                capped = len(ranked) - COMBO_SUGGESTION_LIMIT
                if capped > 0:
                    notes.append(
                        phrase(
                            "combo-suggestions-capped",
                            f"{capped} more combo completion{_plural(capped)} not shown — "
                            "a deck supports only so many lines, so the "
                            f"{COMBO_SUGGESTION_LIMIT} most popular are argued.",
                            amount=capped,
                            limit=COMBO_SUGGESTION_LIMIT,
                        )
                    )
            except Exception as exc:  # noqa: BLE001 — an external API must not break adds
                log.warning("suggestions.combos_failed", error=str(exc))
                notes.append(
                    phrase(
                        "combos-unavailable",
                        f"Combo lookup unavailable: {exc}",
                        error=str(exc),
                    )
                )

    # --- Channel 3d: tutor access -----------------------------------------
    # Independent of the SYNERGY_WINCON bucket's own status: a synergy-dense
    # deck reads "full" on that bucket from payoffs and recursion alone, which
    # starved this role entirely (see TUTORS-PLAN.md) — tutors argue on their
    # own count against their own bracket-scaled target, the fixing_lands
    # precedent, not on the bucket's shared shortfall. Numbered 3d but placed
    # after channel 5 because the target has a second input: the deck's own
    # complete-combo count from the block above raises it (`_tutor_target`) —
    # lines have to be found before they are played.
    if "tutor_access" in enabled:
        from .graph import channel_tutors, deck_tutor_count

        tutor_scale = _tutor_scale(speed)
        tutor_count = deck_tutor_count({oid: counts.get(oid, 1) for oid in deck_oracle_ids})
        bracket_target = _tutor_target(speed, deck_size_scale=deck_size / 99)
        tutor_target = _tutor_target(
            speed, deck_size_scale=deck_size / 99, complete_combos=complete_combos
        )
        combo_driven = tutor_target > bracket_target
        short = tutor_count < tutor_target
        # The joker bump arms on the deck's lines alone, not the quota: a
        # deck already at its tutor count still values the tutor that
        # completes whichever line is closest, and the two are different
        # arguments — "you are short" vs "this is a combo piece in play".
        # `complete_combos` is only ever nonzero when the combo channel ran
        # (it is set inside channel 5), so an eval arm without that channel
        # keeps this silent for free; `combo_scale` zeroes it below bracket
        # 3, the same line real completions stop being scored at.
        joker_armed = complete_combos >= TUTOR_JOKER_MIN_LINES and combo_scale > 0.0
        if short or joker_armed:
            for row in channel_tutors(retrieval_deck, identity, pool_filter=pool_filter):
                if short:
                    _merge(
                        pool,
                        row,
                        _tutor_provenance(
                            row,
                            tutor_count,
                            tutor_target,
                            tutor_scale,
                            combo_lines=complete_combos if combo_driven else 0,
                        ),
                    )
                # Only piece-finders joker: a land fetcher shares the role
                # but cannot put a combo piece in hand — see graph.py.
                if joker_armed and row.get("joker_destinations"):
                    _merge(pool, row, _tutor_joker_provenance(row, complete_combos, combo_scale))
        if short:
            bucket_reasons.setdefault(
                "bucket:tutors",
                f"{tutor_count:.0f} tutors against ~{tutor_target:.0f}"
                + (
                    f" for {complete_combos} complete combo lines"
                    if combo_driven
                    else " at this bracket"
                ),
            )

    # --- Channel 3e: fast mana & free interaction --------------------------
    # Both targets are exactly zero below `SPEED_BRACKET_FOUR` by construction
    # of `_fast_mana_target`/`_free_spell_target` — gated here too so a deck
    # below that speed does not pay two graph round trips for a channel
    # guaranteed to merge nothing, the same reasoning `combo_scale == 0.0`
    # already applies to the combo channel above.
    if speed >= SPEED_BRACKET_FOUR and ("fast_mana" in enabled or "free_spell" in enabled):
        from .graph import channel_resource_supply, deck_resource_count, resource_identity_supply

        held = {oid: counts.get(oid, 1) for oid in deck_oracle_ids}

        if "fast_mana" in enabled:
            fast_mana_count = deck_resource_count(Resource.FAST_MANA, held)
            fast_mana_target = _fast_mana_target(speed, deck_size_scale=deck_size / 99)
            if fast_mana_count < fast_mana_target:
                for row in channel_resource_supply(
                    Resource.FAST_MANA, retrieval_deck, identity, pool_filter=pool_filter
                ):
                    _merge(pool, row, _fast_mana_provenance(row, fast_mana_count, fast_mana_target))
                bucket_reasons.setdefault(
                    "bucket:fast mana",
                    f"{fast_mana_count:.0f} fast mana against ~{fast_mana_target:.0f} "
                    "at this bracket",
                )

        if "free_spell" in enabled:
            # Deck-agnostic and identity-only, so one query answers for the
            # whole request regardless of what is already in the 99 — see
            # `resource_identity_supply`.
            castable = resource_identity_supply(Resource.FREE_SPELL, identity)
            free_spell_count = deck_resource_count(Resource.FREE_SPELL, held)
            free_spell_target = _free_spell_target(speed, castable, deck_size_scale=deck_size / 99)
            if free_spell_count < free_spell_target:
                for row in channel_resource_supply(
                    Resource.FREE_SPELL, retrieval_deck, identity, pool_filter=pool_filter
                ):
                    _merge(
                        pool, row, _free_spell_provenance(row, free_spell_count, free_spell_target)
                    )
                bucket_reasons.setdefault(
                    "bucket:free interaction",
                    f"{free_spell_count:.0f} free interaction against ~{free_spell_target:.0f} "
                    "at this bracket",
                )

    # --- Focus: what the user asked for more of ---------------------------
    parsed_focus = _parse_focus(focus)

    if parsed_focus and parsed_focus.kind == "theme":
        from .themes import THEMES

        theme = THEMES.get(parsed_focus.value)
        if theme is None:
            notes.append(
                phrase(
                    "focus-unknown-theme",
                    f"No theme called {parsed_focus.value!r}.",
                    value=parsed_focus.value,
                )
            )
            parsed_focus = None
        else:
            parsed_focus = Focus(kind="theme", value=theme.id, label=theme.label)
            for row in channel_theme(theme.id, retrieval_deck, identity, pool_filter=pool_filter):
                _merge(pool, row, _theme_provenance(row))

    # --- Theme preferences: standing per-deck state, not a per-request ask --
    focus_theme = parsed_focus.value if parsed_focus and parsed_focus.kind == "theme" else None
    pins, outs = _resolve_theme_prefs(pinned_themes, excluded_themes, focus_theme, notes)

    # A pin runs the focus's channel without the focus's pool narrowing:
    # pinning landfall means "argue for landfall cards", not "show me nothing
    # else". Several pins coexist, each grouped under its own theme heading —
    # one round trip for all of them; each row carries its theme_id.
    # `deck_tribes`, computed above the resource bridge, is reused here: both
    # theme loops below run their type-blind rows past it — pinning "Typal"
    # in a Dragons deck means more typal cards, not other tribes' lords.

    for row in _drop_off_tribe_rows(
        channel_themes([t.id for t in pins], retrieval_deck, identity, pool_filter=pool_filter),
        deck_tribes,
    ):
        _merge(pool, row, _theme_provenance(row))

    # --- Detected themes: typal's trigger, generalised ---------------------
    # The deck's own theme read — already computed for diagnostics — argues
    # the way the deck's own tribe already does. After the declared themes so
    # a focus or pin never fires twice, and behind `enabled` so eval arms
    # with explicit channel lists stay isolated.
    # What the voiceless seats argued below: theme -> (seat name, the seat's
    # own fit). Read by the voice reserve and its note, which must know
    # nothing when the channel never ran.
    voiced: dict[str, tuple[str, float]] = {}
    if "theme_fit" in enabled:
        declared = {t.id for t in pins} | {t.id for t in outs}
        if focus_theme:
            declared.add(focus_theme)
        targets = _detected_theme_targets(report.themes, declared)
        share_by_theme = {t.theme: t.share for t in targets}
        rows = _drop_off_tribe_rows(
            channel_themes(list(share_by_theme), retrieval_deck, identity, pool_filter=pool_filter),
            deck_tribes,
        )
        for row in rows:
            _merge(pool, row, _detected_theme_provenance(row, share_by_theme[row["theme_id"]]))

        # --- Seats: the command zone's size as its own reason ---------------
        # A deck fielding two or more commanders is offered the
        # commander-matters family even when it runs none of it — see the
        # comment at `_seat_theme_provenance` and the constants block. Skipped
        # whenever the theme already has a voice (detected, pinned, focused),
        # because this is the quiet fallback and not a second argument; an
        # exclusion outranks it through `declared`, the same way it outranks
        # detection. Same off-tribe pass as the loops above: a family card
        # bound to a tribe the deck does not play stays a lie here too.
        seats = len(effective)
        seat_theme_quiet = (
            "commander_matters" not in declared and "commander_matters" not in share_by_theme
        )
        if seats >= 2 and seat_theme_quiet:
            for row in _drop_off_tribe_rows(
                channel_themes(
                    ["commander_matters"], retrieval_deck, identity, pool_filter=pool_filter
                ),
                deck_tribes,
            ):
                _merge(pool, row, _seat_theme_provenance(row, seats))

        # --- Voiceless seats: the commander's own themes as its voice -------
        # See the constants block. `has_recommendations` is read *after* the
        # EDHREC loop above, so a seat this request managed to warm counts as
        # voiced and stays silent here; a tombstoned one never will and gets
        # its themes argued from mechanics instead. Skipped per theme when a
        # louder voice exists (detected, pinned, focused — and an exclusion
        # outranks everything through `declared`), and `commander_matters`
        # belongs to the seat grant above whenever the zone holds two or more.
        # Two voiceless seats claiming a theme keep the better commander fit.
        from .themes import FIT_THRESHOLD

        voice_floor = 2 * FIT_THRESHOLD  # REPLACE_THEME_FLOOR's bar
        for seat_id in effective:
            seat = commander_by_id.get(seat_id)
            if seat is None or has_recommendations(seat_id):
                continue
            fits = cards_theme_fits([seat_id]).get(seat_id, {})
            strongest = sorted(
                ((t, f) for t, f in fits.items() if f >= voice_floor),
                key=lambda item: -item[1],
            )[:SEAT_VOICE_THEME_LIMIT]
            for theme_id, fit in strongest:
                if theme_id in declared or theme_id in share_by_theme:
                    continue
                if theme_id == "commander_matters" and seats >= 2:
                    continue
                if theme_id not in voiced or fit > voiced[theme_id][1]:
                    voiced[theme_id] = (seat["name"], fit)
        if voiced:
            for row in _drop_off_tribe_rows(
                channel_themes(list(voiced), retrieval_deck, identity, pool_filter=pool_filter),
                deck_tribes,
            ):
                seat_name, seat_fit = voiced[row["theme_id"]]
                _merge(pool, row, _seat_voice_provenance(row, seat_name, seat_fit))

    # The ignore list, dropped after every channel has argued: one filter here
    # covers combos and fusion alike, where filtering per channel would have
    # to be remembered at each call site.
    if excluded:
        for oracle_id in excluded:
            pool.pop(oracle_id, None)

    candidates = list(pool.values())

    if outs:
        fits_rows = fits_theme_among(list(pool), [t.id for t in outs])
        # The card-normalised half of the exclusion strength, one query per
        # excluded theme — `theme_share_among` needs each theme's own
        # vocabulary and gate sides, so a single batched call across themes
        # would blur them together. Exclusion lists are short; this is
        # acceptable the same way `fits_theme_among` per pin loop already is.
        share_rows = [
            {**row, "theme_id": theme.id}
            for theme in outs
            for row in theme_share_among(
                list(pool),
                sorted(_theme_vocabulary(theme)),
                _theme_gate_sides(theme),
                sorted(str(r) for r in theme.requires_any),
            )
        ]
        candidates, demoted = _apply_theme_exclusions(
            candidates, fits_rows, {t.id: t.label for t in outs}, share_rows=share_rows
        )
        if demoted:
            notes.append(
                phrase(
                    "demoted-excluded-themes",
                    f"{demoted} suggestion{_plural(demoted)} demoted — "
                    "they read as themes you excluded.",
                    amount=demoted,
                )
            )

    if "bucket_saturation" in enabled and report.buckets:
        over_buckets = [row for row in report.buckets if row.status == "high"]
        if over_buckets:
            # One query over the candidates, the same way `suggest_swaps` reads
            # roles for the cuts. Only asked when a bucket is actually over.
            candidates, crowded = _apply_bucket_saturation(
                candidates,
                report.buckets,
                cards_role_weights([c.oracle_id for c in candidates]),
            )
            if crowded:
                told = ", ".join(
                    f"{row.coverage:.0f} {str(row.bucket).replace('_', ' ')} "
                    f"against ~{row.high:.0f}"
                    for row in over_buckets
                )
                notes.append(
                    phrase(
                        "demoted-bucket-saturation",
                        f"{crowded} suggestion{_plural(crowded)} demoted — they add to a "
                        f"bucket the deck is already over ({told}).",
                        amount=crowded,
                        buckets=told,
                    )
                )

    if "type_saturation" in enabled and report.types:
        candidates, saturated = _apply_type_saturation(candidates, report.types)
        if saturated:
            over_rows = [r for r in report.types if r.status == "high" and r.type != "Land"]
            told = ", ".join(
                f"{r.count:.0f} {r.type.lower()} cards against ~{r.high:.0f}" for r in over_rows
            )
            notes.append(
                phrase(
                    "demoted-type-saturation",
                    f"{saturated} suggestion{_plural(saturated)} demoted — the deck is "
                    f"over its type targets ({told}).",
                    amount=saturated,
                    types=told,
                )
            )

    # The asymmetry check (Task C3, cEDH Pro round) — bracket 5 only, the
    # same `is_cedh(speed)` switch every other cEDH-gated pass in this
    # service reads. Casual decks never see this note: a Null Rod in a deck
    # running two mana rocks is not a self-inflicted wound, and below bracket
    # 5 nobody is being asked to evaluate a table of stack interaction in the
    # first place.
    if "asymmetry" in enabled and is_cedh(speed) and candidates:
        from .interaction import classify_asymmetry_candidates

        candidate_ids = [c.oracle_id for c in candidates]
        tag_hits = classify_asymmetry_candidates(candidate_ids)
        candidates, hosed = _apply_asymmetry_check(
            candidates,
            cards_role_weights(candidate_ids),
            tag_hits,
            report.roles,
        )
        if hosed:
            notes.append(
                phrase(
                    "demoted-asymmetry",
                    f"{hosed} suggestion{_plural(hosed)} demoted — "
                    "they would hurt this deck's own board about as much as the table's.",
                    amount=hosed,
                )
            )

    # Before focus narrowing: a withheld card is not a suggestion at this
    # speed no matter what the user asked to see more of. One flag query
    # serves both sides of the question — the candidates' own breakers and
    # the deck's game-changer count that decides bracket 3's cap — and it
    # only runs when a bracket below 4 can actually withhold something. The
    # deck's ids ride along only in the band that reads their count: below
    # bracket 3 every game changer is withheld regardless.
    if candidates and speed < SPEED_BRACKET_FOUR:
        from .graph import bracket_breakers

        deck_ids = set(deck_oracle_ids) if speed >= SPEED_BRACKET_THREE else set()
        flags = bracket_breakers(
            list(dict.fromkeys((*(c.oracle_id for c in candidates), *deck_ids)))
        )
        candidates, withheld_notes = _withhold_bracket_breakers(
            candidates,
            speed,
            deck_game_changers=sum(1 for oid in deck_ids if flags.get(oid, {}).get("game_changer")),
            flags=flags,
        )
        notes.extend(withheld_notes)

    # A focus narrows the pool rather than reordering it: asking for landfall
    # and being shown three landfall cards among forty is not an answer.
    if parsed_focus:
        narrowed = [c for c in candidates if _matches_focus(c, parsed_focus)]
        if narrowed:
            candidates = narrowed
        else:
            notes.append(
                phrase(
                    "focus-no-matches",
                    f"Nothing matched {parsed_focus.label or parsed_focus.value!r} "
                    "within this deck's colours and budget — showing everything instead.",
                    focus=parsed_focus.label or parsed_focus.value,
                )
            )

    ranked = sorted(candidates, key=lambda c: -c.score())
    ranked, promoted = _reserve_pinned_slots(ranked, pins, limit)
    if promoted:
        told = ", ".join(t.label for t in pins)
        notes.append(
            phrase(
                "promoted-pinned-themes",
                f"{promoted} suggestion{_plural(promoted)} promoted to make room for "
                f"{told} — the themes you favoured.",
                amount=promoted,
                themes=told,
            )
        )
    # After the pin floor, which it must not evict from — see the guard inside.
    ranked, seat_promoted = _reserve_seat_slots(ranked, pins, len(effective), limit)
    if seat_promoted:
        notes.append(
            phrase(
                "promoted-seat-theme",
                f"{seat_promoted} suggestion{_plural(seat_promoted)} promoted — "
                f"commander-matters cards are paid once per commander, and this "
                f"deck fields {len(effective)}.",
                amount=seat_promoted,
                seats=len(effective),
            )
        )
    # Last of the three floors, protecting the other two — see the function.
    # `voiced` was recorded where the voice ran: recomputing the cold check
    # here would be a second graph round trip for a question already
    # answered, and an empty dict is exactly "nothing to reserve".
    ranked, voice_promoted = _reserve_voice_slots(ranked, pins, voiced, limit)
    if voice_promoted:
        told = ", ".join(sorted({name for name, _ in voiced.values()}))
        notes.append(
            phrase(
                "promoted-seat-voice",
                f"{voice_promoted} suggestion{_plural(voice_promoted)} promoted — "
                f"no play data exists for {told}, so its own themes argue from "
                f"mechanics instead.",
                amount=voice_promoted,
                commanders=told,
            )
        )

    top = [
        Suggestion(
            oracle_id=c.oracle_id,
            name=c.name,
            cmc=discounted_cmc(c.cmc, c.type_line, discount),
            type_line=c.type_line,
            price_usd=c.price_usd,
            playability=c.playability,
            game_changer=c.game_changer,
            score=round(c.score(), 2),
            provenance=c.provenance,
        )
        for c in ranked[:limit]
    ]

    return SuggestionReport(
        commander=commander["name"],
        commanders=[commander_by_id[oid]["name"] for oid in effective if oid in commander_by_id],
        commander_inferred=inferred,
        identity=identity,
        considered=len(pool),
        focus=parsed_focus,
        pinned=[Focus(kind="theme", value=t.id, label=t.label) for t in pins],
        excluded=[Focus(kind="theme", value=t.id, label=t.label) for t in outs],
        off_theme=_off_theme_lean(top, report.themes, already=[t.id for t in outs]),
        # Grouped and flat are the same cards in the same order, so a caller
        # that wants "the top 20" does not have to flatten a grouping first.
        suggestions=top,
        groups=_build_groups(top, bucket_reasons),
        notes=notes,
    )
