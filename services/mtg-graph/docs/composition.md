# Composition: balancing quotas, curve and synergy

How the advisor picks 99 cards. This is the part [`../PLAN.md`](../PLAN.md)
deferred as "hard constraints never go to the LLM" without saying what actually
does the work.

## Why ranking cannot work

The obvious approach — score every candidate by synergy, sort, take the top 99 —
produces 99 payoffs and no lands. The obvious fix, filling each bucket greedily
in turn, is also wrong, and it is wrong for a reason worth being precise about.

The target ranges overlap:

| Bucket | Target |
|---|---|
| Mana sources | 30–40 |
| Ramp | 10–12 |
| Card draw | 10–12 |
| Interaction | 10–14 |
| Synergy & win conditions | 30–35 |

Those sum to **90–113** against a 99-card deck. They are not a partition. A
Signet is a mana source *and* a ramp piece. Solemn Simulacrum is ramp *and* card
advantage *and* a body. Filling "ramp" before "card draw" throws away the
information that some ramp already draws, and the order you pick buckets in
changes the answer — which is a good sign the decomposition is wrong.

So the buckets cannot be satisfied one at a time. They have to be satisfied
*simultaneously*, which makes this a constrained optimisation, not a sort.

## The formulation

A binary integer program, solved with CP-SAT.

**Variables.** `x_c ∈ {0,1}` for each candidate `c` in the retrieved pool
(typically 200–400 cards after hard filtering). Basic lands are the exception:
one integer variable per basic type, since singleton does not apply.

**Hard constraints** — these are never traded off:

- `Σ x_c = 99`
- Colour identity ⊆ commander's identity *(pre-filtered, not a solver constraint)*
- Commander-legal, singleton *(pre-filtered)*
- `Σ price_c · x_c ≤ budget`
- Locked cards forced in, rejected cards forced out

**Soft constraints** — the quotas. For each bucket `b` with target `[L_b, U_b]`:

```
coverage_b = Σ_c w_{c,b} · x_c
under_b   ≥ L_b − coverage_b,   under_b ≥ 0
over_b    ≥ coverage_b − U_b,   over_b  ≥ 0
```

and `λ_b · (under_b + κ · over_b)` enters the objective as a penalty. Being one
ramp piece short is a cost, not a rejection — which is how a human builds.

`κ` is `OVER_TARGET_COST`, currently 0.35: a card spare costs about a third of
a card missing. They are not the same failure. A shortfall is functional — a
deck with too little ramp is slow and nothing else in the list makes up for it
— while a surplus is largely an artefact of how coverage is counted. The
buckets overlap, so a mana rock is both ramp and a mana source and the totals
sum well past 99; a deck over on several at once usually means its cards each
do more than one job. The type dimension makes the same point from the other
side: types partition the deck, so five creatures over target *is* five of
something else under it, already charged at full weight where it hurts.

Not free, though. Ninety-nine slots are fixed, so seven mana sources over
target really are seven cards that are not spells — and at zero nothing would
read as over, `score_cuts` would find no marginal delta, and the cut half of
the tool would stop working. The same `κ` applies in `BucketTarget.penalty` and
in the solver's objective; they are two readings of one model and a split
between them would have the fill optimise against the diagnostics that grade
its own output.

Whether a deck is *called* over is a separate question from what it costs, and
`STATUS_TOLERANCE` answers it: a surplus under about a card and a half is
inside the noise of fractional role weights and is not reported. Shortfalls
have no such band — they are read off the exact bound, for the same reason they
are priced at full weight.

**Objective.**

```
maximise   Σ_c (α·synergy_c + β·novelty_c + γ·theme_fit_c) · x_c
         − Σ_b λ_b · (under_b + over_b)
         − curve_weight · Σ_mv |count_mv − target_mv|
```

**Verified by spike**, not assumed: 400 candidates, 5 overlapping soft quotas,
`speed = 0.5`. CP-SAT returns `OPTIMAL` in **64 ms** with all five buckets
inside their ranges at once — 37.0 mana sources, 13.8 ramp, 13.0 draw, 13.0
interaction, 33.0 synergy. Note that the bucket totals sum to 109.8 against 99
cards, which is the overlap doing exactly what it should.

## Fractional role weights

The overlap is handled by making role membership continuous rather than
categorical. Solemn Simulacrum is not "ramp"; it is `{land_ramp: 0.8,
card_advantage: 0.5}`. Roles aggregate into buckets via
[`BUCKET_ROLES`](../backend/src/deck_lab/vocabulary.py), and a role feeding two
buckets contributes to both.

This is why `Role` and `Bucket` are separate enums. Roles are primitive and
extraction-facing; buckets are aggregate and user-facing. Collapsing them would
reintroduce exactly the double-counting the split exists to prevent.

## The speed meter

One scalar in `[0, 1]` interpolating between two archetype templates, in
[`composition.py`](../backend/src/deck_lab/composition.py):

| | Battlecruiser (0) | Tuned (1) |
|---|---|---|
| Mana sources | 37–40 | 30–34 |
| Ramp | 9–12 | 12–16 |
| Card draw | 11–14 | 9–12 |
| Interaction | 8–11 | 12–16 |
| Synergy & wincons | 31–36 | 26–31 |
| Curve peak | 3–4 | 1–2 |

The meter moves the ranges **and** the `λ` weights: a tuned list binds harder,
because a missing ramp slot matters more when the plan is to win on turn six.

The slider is a preset path through a target vector, not the model itself.
Advanced mode should edit the targets directly — the solver neither knows nor
cares that a slider produced them.

## The type axis: what the deck is made of

Landed August 2026, prompted by a real failure: a deck whose archetype plays
~29 creatures had drifted to 40, because every quota above is *functional* —
a deck can sit inside all five while being nothing but creatures — and every
high-synergy channel (EDHREC, typal, themes) skews creature-heavy. Nothing
pushed back.

The third dimension is **per-primary-type target ranges** on the template
(`DeckTemplate.types`), scored through the same `BucketTarget` arithmetic as
the quotas. A card files under exactly one type
([`primary_type`](../backend/src/deck_lab/composition.py), mirroring the
frontend's `primaryType` — Land wins, then Creature > Planeswalker > Instant
> Sorcery > Artifact > Enchantment > Battle), so unlike the buckets this
axis is a partition and its targets sum to ~99.

**The targets are empirical, not authored.** EDHREC commander pages carry an
average type distribution this project cached for two years and never
parsed; commander×theme subpages (`pages/commanders/<slug>/<tag>.json`)
carry the same panel conditioned on both. Resolution is three hard tiers,
each auditable through `Diagnostics.type_source`:

1. **commander×theme subpage** — when the deck's top detected theme has
   share ≥ 0.35, maps to a verified tag slug (table in
   [`themes.md`](themes.md)), and that tag carries ≥ 100 decks on this
   commander's page. Muldrotha averages ~30 creatures;
   muldrotha/spellslinger averages 21, and a spellslinger build gets the 21.
   The deck's top tribe reaches the same tier the same way, at a higher
   share floor (≥ 0.60 — typal shares run hot by construction) and through
   a slug generated from the type's plural forms rather than a table entry:
   a Goblins deck under Krenko reaches `krenko/goblins`, not a manufactured
   `tribal` row in `THEME_TAG_SLUGS`. When both a theme and a tribe clear
   their floor, the larger taglink sample wins and a tie goes to the theme.
2. **commander page** — Talrand 11 creatures, Gishath 35, Meren 36. The
   spread *is* the theme signal for most decks.
3. **default** — the median of the cached commander pages, measured
   2026-08-18 over 24 pages: 29 creatures / 9 instants / 9 sorceries /
   9 artifacts / 7 enchantments / 1 planeswalker / 0 battles / 35 lands
   (raw medians 8.5 and 6.5 rounded to sum 99).

A point estimate becomes a range of ± max(2, 0.20 × mean). The 0.20 is a
judgment stated as one: cross-commander creature counts spread with sd ≈ 6.9,
within-commander build variance must be smaller, and no decklist corpus
exists to measure it (the per-deck endpoint 403s). Land is the exception —
a flat ±3.5: its mean is the largest of any type, so the fractional rule
handed it the *widest* band (39 ± 7.8 for a landfall commander) when land
count is the tightest-distributed stat in the format (cached pages run
33–40 lands against creature means of 6–36). The observed failure: a
Necrobloom deck on 25 lands read as barely short because the band's low
edge sat at 31.2.

Three positions, taken deliberately:

- **Speed moves the weight, never the targets** (0.25 → 0.45 per card
  outside range). EDHREC aggregates carry no bracket conditioning, and
  shifting counts for a tuned deck would be inventing data. Recorded as a
  gap: empirical type targets have no speed dimension. The reconciliation
  runs the other way instead: the empirical land mean shifts the
  mana-sources quota by its deviation from the corpus median
  (`shift_mana_sources`, clamped to ±6), so the bucket that owns land
  count knows what the archetype runs. A shift, not a floor — the template
  keeps its speed effect, the archetype moves where the quota sits, and a
  user's override lands after the shift and beats it. Every scorer builds
  its template through `conditioned_template`, or one of them would score
  a mana quota the report never showed.
- **Land's weight is zero.** The mana-sources quota already binds land
  count at 3.0–4.0, the loudest weight in the system; a second penalty on
  the *same measure* is one signal counted twice. The Land row still
  reports against the empirical target — it informs, it never fines. This
  deferral is also why the quota must be archetype-shifted (above): before
  it was, the one signal that knew a landfall deck runs 39 lands was mute
  and the signal that owned land count did not know — 25 lands + 8 rocks
  sat *inside* the tuned 30–34 sources range.
- **Suggestions are demoted, never boosted, on type — with one carve-out.**
  The `type_saturation` channel appends a visible negative provenance entry
  (−1.5 × min(1, overage/6)) to candidates whose type the deck is over on.
  No symmetric bonus: under-representation is served by the positive
  channels, and a bonus for "is an instant" would recommend bad instants —
  the original defect inverted. Under-target types surface through the
  diagnostics `low` status instead.

  The carve-out is **lands**, where under-representation is exactly an adds
  problem and no other channel can answer it: every retrieval channel
  excludes cards already in the deck (nine Mountains in, Mountain
  unsuggestable) and `role_gap` saturates at a 4-card shortfall. The
  `basic_lands` channel fires on the Land row's `low` status, merges the
  identity's basics directly past the already-in-deck filter, and scores
  proportionally to the shortfall (shortfall/3, capped at 8). The shortfall
  runs to the target's *centre*, not the band's low edge — priced to the
  edge, the channel faded to silence 4–8 lands under the mean, and a deck
  heard less about lands with every one it added. The bracket-4+ damping
  (basics halve as fetches and duals become the better form of the advice)
  is skipped when lands are the deck's payoff: a land-name payoff in the
  deck or a landfall theme share ≥ 0.2 keeps basics at full voice at any
  speed. Absent from the eval sets by construction — eval decks are built
  from EDHREC card lists, which carry no basics, so every arm would read as
  land-starved.

The axis threads everywhere the shape does: the diagnostics report
(`Diagnostics.types`), cut scoring (`_shape_penalty`), the `/replace`
preview (`type:` rows in `ShapeDelta`), the fill solver (a soft constraint
at the same weight, or `/fill` would fight the very report it was built
from), and the suggestion demotion pass. `/replace` conditions on the
commander tier only — that path never diagnoses, so it has no theme profile;
recorded, not hidden.

The eval gained a `shaped` arm (`all_channels` + the demotion) and a
`creature_share_at_k` metric rather than editing the recorded arms. Expect
recall to *drop* on creature commanders — the held-out high-synergy cards
are often creatures, so the demotion is right exactly where it costs hits.
That trade is the point of measuring it.

## Multiple valid decks

Since the quotas overlap, a given composition genuinely has many solutions, and
presenting one as *the* answer would be dishonest. CP-SAT can enumerate a
solution pool, so the advisor asks for `k` solutions under a diversity
constraint — Hamming distance between any two ≥ `d` cards.

That maps onto how the choice actually gets made: "here are three shapes, one
leans on the graveyard, one on tokens, one is lower to the ground."

**Caveat the spike exposed.** A pure Hamming constraint gives *permitted*
diversity, not *meaningful* diversity. Asked for ≥15 different cards, the solver
returned alternatives sharing exactly 84/99 — it takes the minimum difference
allowed, because anything more costs objective value. Alternatives were found in
40–55 ms, so cost is not the issue; the formulation is.

Getting genuinely different builds needs the diversity to be *semantic* rather
than positional: re-solve with the theme weights `γ` shifted toward a different
theme, or forbid the top-N cards of the dominant theme cluster. Worth fixing
when alternatives ship, not before.

## Contextual rules

This is the layer that handles synergies which are not card-to-card at all.

Your Reanimate example is the clean case. Reanimate is not a graveyard card in a
deck with a five-drop commander — it is **commander recursion**. If the
commander dies you may send it to the graveyard rather than the command zone,
then rebuy it for `{B}` instead of paying `MV + 2` on every recast. The synergy
is between the card and the *deck's context*, and neither the oracle text nor
EDHREC's co-occurrence data expresses it directly.

So there is a third edge type beyond `PRODUCES` / `CARES_ABOUT`: a predicate over
deck context that grants a role or scales a score.

```yaml
- id: cheap_reanimation_dodges_command_tax
  when: commander.cmc >= 5
  matches: { produces: [graveyard_creature, recursion_to_battlefield], cmc: "<= 2" }
  grants: { role: payoff, weight: 0.8, resource: commander_recursion }
  why: "Rebuys your {commander.cmc}-drop commander for {C}{B} instead of paying command tax."

- id: blink_scales_with_etb_density
  when: deck.etb_trigger_count >= 12
  matches: { produces: [blink] }
  boost: 1.4
  why: "{deck.etb_trigger_count} enter-the-battlefield triggers to re-use."

- id: fixing_scales_with_colour_count
  when: commander.colour_count >= 3
  matches: { produces: [mana_fixing] }
  boost: 1.3
```

Three properties matter here:

- **Rules are data, not code.** Editable without a deploy, diffable, testable.
- **Every rule carries a `why`.** It fires or it does not, with a reason. That
  string is the provenance the synthesis pass quotes, which is what keeps the
  rationales honest rather than plausible-sounding.
- **Rules can imply other requirements.** The Reanimate rule silently assumes you
  can *get* the commander into the graveyard — so it should co-recommend a free
  sacrifice outlet (`FREE_SACRIFICE_OUTLET`) and say so. v1 keeps rules flat and
  notes the dependency; chained rules can wait until the flat set proves useful.

Expect on the order of 20–40 of these. They are the difference between a search
engine and something that feels like it plays the game.

## Themes: derived, not extracted

A second LLM pass asking "what themes does this card belong to?" would be fuzzy,
low-agreement and unauditable. Instead, define each theme as a weighted
expression over the closed vocabulary:

```yaml
aristocrats:
  requires_any: [sacrifice_outlet_creature, death_trigger]
  weights: { death_trigger: 1.0, sacrifice_outlet_creature: 0.9,
             creature_token: 0.5, lifeloss_opponent: 0.4 }
```

A card's `theme_fit` is the normalised dot product of its resource vector with
the theme's weights. Three consequences:

- The closed vocabulary stays the single source of truth.
- Themes are auditable and adjustable without re-running extraction.
- They are **measurable** — EDHREC publishes theme pages, so derived membership
  can be scored against them directly.

It also gives a real number for the thing that makes deckbuilding hard. A deck's
theme profile is the aggregate of its cards' fits, and the *concentration* of
that distribution — inverse entropy — is a consistency metric. "Your deck is
40% aristocrats, 30% blink, 30% nothing in particular" is precisely the
diagnosis a wobbling deck needs, and it falls straight out of the graph.

## Anti-synergy

The one direction pure retrieval structurally cannot see: Rest in Peace in a
graveyard deck scores well on "graveyard matters" and actively loses the game.
Model as a negative objective coefficient when a card's `EXILE_FROM_GRAVEYARD` /
`GRAVEYARD_HATE` output collides with the deck's own theme profile. A small
curated nonbo list covers the rest for v1.

## Where the LLM sits

Unchanged from the plan, and worth restating because the solver makes it
sharper. The LLM does not choose 99 cards. It receives:

- the compressed deck summary (bucket coverage, curve histogram, theme profile,
  resource balance)
- the solver's chosen list, with per-card provenance — which channel retrieved
  it, which rules fired, which quota it fills
- up to `k` alternative solutions

and it writes the explanation, handles the soft natural-language requirements
("budget, no infinite combos, keep it janky"), and picks between the alternatives
on feel. Arithmetic stays in the solver; judgement stays in the model.

## Build implications

This lands mostly in Phase 6, but two pieces move earlier:

- `Role` weights must be **fractional** in the Phase 2 extraction schema. Adding
  that after labelling 150 cards means relabelling them.
- `commander_recursion` and `free_sacrifice_outlet` are in the vocabulary from
  the start, because the Reanimate rule needs them and retrofitting a resource
  means re-running extraction over 31.6k cards.
