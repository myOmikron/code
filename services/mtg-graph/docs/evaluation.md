# Does the mechanical layer earn its keep?

`PLAN.md` set the bar in its own words:

> The system is only worth building if it beats that baseline — or matches it
> while scoring materially higher on novelty@k. Measure per-channel recall too,
> so it's visible whether `resource_bridge` is contributing or the whole thing
> is EDHREC with extra steps.

It has now been measured. **The `resource_bridge` channel does not beat the
baseline.**

## Result

Six commanders, ten commander-distinctive cards held out of each, k=25:

| arm | recall@25 | novelty@25 | hits / 60 |
|---|---|---|---|
| `baseline_popularity` | 0.000 | 0.000 | 0 |
| `bridge_only` | **0.017** | 0.079 | **1** |
| `role_gap_only` | 0.033 | 0.041 | 2 |
| `mechanical_only` | 0.083 | 0.257 | 5 |
| `all_channels` | 1.000 | 0.408 | 60 |

**Re-measured 2026-08-25**, after the `run_arm` fix that gives
`baseline_popularity` the commander's real colour identity instead of an
empty one (the bug the old caveat named). Same six commanders, k=25,
hold-out=10, seed=7 — `--seed` is inert at this hold-out (it consumes every
distinctive card, so there is nothing to sample; see "Harness defects found
2026-08-06" below). All six commanders were fetched fresh from EDHREC this
run, since the dev graph had just been wiped and re-ingested for the
re-measurement.

**Before the fix** (2026-08-24, colour-identity bug — kept for the record):
`baseline_popularity` 0.017/1, `bridge_only` 0.017/1, `role_gap_only`
0.033/2, `mechanical_only` 0.083/5, `all_channels` 0.967/58.

The fix did not make `baseline_popularity` beat `mechanical_only` harder — if
anything the opposite happened: given the commander's real colour identity,
popularity now finds **zero** of the sixty held-out cards, down from one.
That puts `bridge_only` (1 hit) fractionally *above* `baseline_popularity` (0
hits) for the first time. At n=6 that is not a reversal of the headline
finding — it is the same noise the caveats below already name, now landing on
the other side of zero.

Per-channel, within the mechanical arm: **`combo_completion` 5, `typal_bridge`
3** (a held-out card credited to more than one channel counts toward each, so
the per-channel sum can exceed the arm's own hit total).

Read plainly:

- **The resource bridge still does not clear a meaningful bar.** With the
  commander's real colour identity, generic popularity finds nothing at all
  (0/60); `bridge_only` finds one. Neither number means anything at n=6 — read
  it as "indistinguishable from chance," not "the bridge wins."
- **`role_gap` finds two**, against a baseline of zero — a wider gap than
  before the fix, but still inside noise at n=60.
- **Everything the mechanical arm finds comes from Commander Spellbook and the
  typal bridge** — `combo_completion` and `typal_bridge` are the only
  channels with any hits; every other mechanical channel is still at zero.
- **`all_channels` at 1.000 still proves nothing.** The held-out cards *are*
  EDHREC high-synergy cards and the EDHREC channel reads that same data, so it
  scores by construction. It is reported only to make the circularity visible;
  quoting it as a win would be dishonest.

## Two harness bugs found before trusting the number

Both would have produced a confidently wrong headline.

**The proxy decks were 277 cards.** The first version handed the system EDHREC's
entire recommendation list. No bucket can be short of its quota in a 277-card
pile, so `role_gap` could not fire at all and its recall of 0.000 measured the
harness rather than the channel. The kept deck is now capped at 89 cards chosen
by inclusion rate, which is a plausible generic build and does have shortfalls.

**Per-channel counts came from the circular arm.** Attributing hits inside
`all_channels` shows the EDHREC channel finding everything, because it is
reading the answer key. They now come from `mechanical_only`.

## What this does and does not say

**It says**: the graph does not retrieve the cards that make a deck distinctive
better than a popularity ranking does. The central retrieval claim is
unsupported.

**It does not say** the graph is worthless. Three honest caveats, offered as
caveats and not as excuses:

1. **n=6.** One hit versus two is noise.
2. **The gold set is popularity-derived.** "High synergy" means *many decks with
   this commander run it*. The bridge retrieves mechanically related cards,
   which is a genuinely different target — it may be finding good cards nobody
   happens to play. But that is untestable without real decklists, and "the
   system is right and every deckbuilder is wrong" is not a defensible default.
3. **Real decklists would be a better test.** EDHREC's per-deck endpoint returns
   403, so this proxy is what was available.

## What follows

The diagnostic half of the project is untouched by this result and does not
depend on the bridge retrieving well: the resource balance table ("9 cards want
artifacts, 3 make them"), theme profiles and consistency, shape deltas, the
quota solver. Those read the same graph but ask it a different question — *what
is this deck?* rather than *what should I add?* — and that question it answers.

`PLAN.md` hedged exactly here, and the hedge turned out to be load-bearing:

> Phase 5 ships something genuinely useful even if retrieval never gets good.

So the sequencing was right. What should change:

- **Do not tune the channel weights to chase this number.** They are arbitrary
  and so is anything fitted to n=6.
- **The bridge needs a reason to work before it needs tuning.** The most likely
  culprit is that `PRODUCES` / `CARES_ABOUT` is a boolean with no magnitude —
  Smothering Tithe and a common that makes one Treasure are the same edge. The
  `amount` / `conditional` qualifier `composition.md` specified has never been
  extracted, and playability is a proxy standing in for it.
- **Real decklists are the highest-value unblock.** Every conclusion here is
  bounded by the proxy.

## Reproducing

```bash
uv run deck-lab eval "Atraxa, Praetors' Voice; Tatyova, Benthic Druid; \
Krenko, Mob Boss; Meren of Clan Nel Toth; Talrand, Sky Summoner; \
Omnath, Locus of Rage"
```

Seeded, so a run repeats. Names are semicolon-separated because commander names
contain commas.

---

## Harness defects found 2026-08-06

Both were found while measuring the IDF change (`docs/synergy-metric.md`), and
both had already produced numbers that looked like results.

**`--seed` was inert.** EDHREC returns exactly 10 `highsynergycards` per
commander and `hold_out` defaults to 10, so `rng.sample(distinctive, 10)`
returned all ten and only permuted an order that was then discarded into a set.
The harness had **zero sampling variance by construction**. Three seeds
returning identical numbers looked like a stable result; it meant nothing was
varying. `Case.saturated` now records this and the report says so. Lower
`--hold-out` below the distinctive count to get real variance.

**A cold EDHREC cache invalidates a before/after comparison.** Fetching a
commander writes `RECOMMENDS` edges, so a run that fetches partway through
serves a different graph to the arms that ran before the fetch than to those
after. Measured: on the same 20 commanders, `baseline_popularity` — which cannot
depend on any code under test — read **1 hit on a cold cache and 7 on a warm
one**. `evaluate` now checks `edhrec.is_cached` up front and reports which
commanders were fetched fresh, with the numbers marked not-comparable to earlier
runs.

The habit that caught both: **read the arm that cannot have changed.** A moved
baseline is the signal that the comparison, not the system, is what moved.

## Wider commander set

The original six-commander run is retained above for continuity. A 20-commander
run (200 held-out cards) is the current default for judging a change; it made
the popularity baseline look *stronger* (0.017 → 0.035), not weaker.

## The gold set is popularity-derived, and that may cap what this can prove

Recorded because it bounds every conclusion above, including the negative one.

`all_channels` is flagged as circular: the held-out cards are EDHREC
`highsynergycards` and the EDHREC channel reads that same data. But the same
objection applies more quietly to the comparison we treat as honest.

**`baseline_popularity` vs `bridge_only` is also graded against a
popularity-derived target.** A held-out card is one that *many decks run with
this commander*. So the question the harness actually asks is "does the
mechanical bridge predict popularity better than popularity does" — and a bridge
that surfaces genuinely synergistic cards **nobody plays** scores zero and is
recorded as a failure.

That is close to tautological, and it means "4 hits against 7" may be measuring
the target rather than the channel.

This does not rescue the bridge. Popularity is a reasonable proxy for "should I
be shown this card", and a channel that beats it would be unambiguously
valuable. But it does mean a negative result here is **weaker evidence than it
looks**, and it is the reason a non-popularity target matters:

- **Real decklists** (currently 403) would at least measure what people build
  rather than what EDHREC aggregates.
- **17lands win rates** measure whether you *won*, which no Commander source
  does. Tested against the magnitude model on 2026-08-06 and found underpowered
  at one set's worth of cards — see `docs/magnitude.md`.

Until one of those lands, read every recall number here as "agrees with EDHREC",
not as "is right".

## The `shaped` arm (August 2026)

The type-saturation demotion (`docs/composition.md`, "The type axis") joined
as a **new** arm — `all_channels` + `type_saturation` — rather than an edit
to the recorded sets, so every number above stays comparable. `ArmResult`
gained `creature_share_at_k`: the defect the pass corrects is "the advisor
over-recommends creatures", and recall cannot show that number moving.

Read the arm knowing its recall is expected to *drop* on creature
commanders: held-out high-synergy cards are often creatures, so the demotion
is right exactly where it costs hits — the same structural bind the combo
damping constants record in `suggestions.py`. The comparison that matters is
`shaped` vs `all_channels` on `creature_share_at_k`, with the recall delta
quoted beside it as the price.

**Measured 2026-08-18** — 24 commanders, k=25, 240 held-out cards, 20 pages
refetched mid-run (so not comparable to earlier tables; the arms within this
run are comparable to each other):

| arm | recall@k | novelty@k | creature@k | hits |
|---|---|---|---|---|
| baseline_popularity | 0.042 | 0.155 | 0.058 | 10 |
| typal_only | 0.379 | 0.237 | 0.780 | 91 |
| mechanical_only | 0.083 | 0.167 | 0.537 | 20 |
| all_channels | 0.958 | 0.362 | 0.585 | 230 |
| **shaped** | **0.958** | **0.362** | **0.590** | **230** |

The expected recall drop did not happen — the demotion was **inert on every
case**, and the reason is structural, not a bug: the kept deck is EDHREC's
generic-staple half, which sits at the commander's own average type shape by
construction. No type is over target, so the pass has nothing to fire on.
This harness *cannot* exercise the saturation pass; what it certifies
instead is the safety property that decks already in shape are untouched
(the 0.585 → 0.590 wiggle is tie reordering, not signal). The firing case is
a user-drifted deck, verified manually the same day: a Talrand list stuffed
to 25 creatures against its 8.8–13.2 target had all 122 creature candidates
demoted and zero creatures in the top 12, while Gishath at 40 creatures —
inside its own 28–42 — was left alone. `typal_only`'s creature@k of 0.780
against `baseline_popularity`'s 0.058 is the channel-level shape of the
original complaint, quantified.

## The on-profile boost (August 2026)

The `role_gap` channel filling `synergy_wincon` was deck-blind: any card with
a payoff/wincon/tutor-family role, ranked by global popularity. On a
hyper-focused typal deck that surfaced popular goodstuff with no connection
to the deck at all — the user-reported failure was Imperial Recruiter and
Burnished Hart offered to an Ur-Dragon list. The fix (2026-08-27) multiplies
a synergy_wincon candidate's role_gap score by `ON_PROFILE_BOOST` when it
connects to the deck's own strategy — its tribe (`_typal_hits`), a detected
or pinned theme (`_theme_hits`), or a resource the deck produces in surplus
(`_supply_hits`) — one union, one boost, never stacked. Independently, a
candidate on the commander's own EDHREC page scales by its inclusion rate
(`EDHREC_CORROBORATION_SPAN`), **gated on `deck_page_overlap`**: an off-theme
build shares few nonbasics with the page, and its inclusion rates then argue
for someone else's deck, so below the overlap floor playrate moves nothing.

**Measured 2026-08-27** (dev corpus, six-commander `channel-scale`): the
boost lifts `role_gap`'s p90 from 0.57 to 0.64 while median (0.48 → 0.49)
and max (0.70) hold — a top cohort rises without inflating the channel or
breaching `edhrec_synergy`'s band (median 0.67). A live A/B on Prosper
(boost constants neutralized in the B run, same corpus, same deck) shows
both mechanisms firing: Urza's Saga 0.42 → 0.68 (on-profile × corroboration),
fetches gaining their corroboration-only ×1.1–1.2, all other rows
byte-identical.

**What this harness cannot see:** `role_gap_only` recall stays at noise
(0/50 this run; 2/60 when last recorded) — expected, and worth saying
plainly. The held-out cards are EDHREC-distinctive cards, and the role_gap
*retrieval* (popularity-ordered role query) never surfaces them regardless
of how the ranking reorders its pool. The boost changes which retrieved
candidates win, not what is retrieved, so recall-against-EDHREC is the wrong
instrument; the channel-scale bands and the A/B probe above are the
measurements that can move. Separately, this run's six-commander eval came
back degenerate — `baseline_popularity` at recall 1.000 with the harness's
own "hold_out consumed every distinctive card" warning — which predates and
is untouched by this change (the boost cannot reach that arm); flagged here
rather than diagnosed.

## The supply arm's laundering, and where the floor now sits (August 2026)

A user report — artifact payoffs suggested for a mono-red Dragons deck that
had *excluded* the artifacts theme — exposed two defects in the boost's
supply arm, both invisible to the harness above for the same reason the
`role_gap_only` note gives: they lived in which candidates the arm blessed,
not in any recall the eval measures.

First, the boost had nothing real to bless until the retrieval fix that
rode along in this round: `CHANNEL_ROLES` capped all of a bucket's roles
under one `LIMIT` ordered by `f.weight`, and weight ceilings are per-role
facts (`tutor` 1.0, derived `payoff` 0.6, `wincon` 0.4), so synergy_wincon's
25 slots went to the popular head of the tutor role — the bucket could not
return a payoff for any deck. Weights are now normalised per role and each
role capped separately; the bucket's *contribution* stays at
`PER_BUCKET_LIMIT`, applied after scoring.

Second, with real payoffs in the pool, `CARES_ABOUT_SUPPLY`'s upward
`BROADER*0..` walk matched consumers at any ancestor of a surplus resource.
`_deck_surplus` floors the surplus by relative IDF, but the walk re-admitted
what the floor rejected: `artifact_matters` (IDF 0.49) through `mana_rock`
(1.16, one hop) and `treasure` (1.28, two hops) — and every Commander deck
carries a structural mana-rock surplus, so nearly any deck read as an
artifacts deck. The floor now also applies where the match *lands*
(`_supply_match_targets`), and an excluded theme's resource vocabulary
(weights ∪ requires_any) is subtracted from the same set: exclusion removes
conclusions, never the surplus facts.

**Measured 2026-08-29** (dev corpus, live Ur-Dragon deck): supply hits
18 → 2 — the survivors are the deck's genuine treasure payoffs (Academy
Manufactor, Xorn), which the artifacts exclusion then removes as well;
the typal arm's three hits are untouched. Three unrelated decks re-run as
regression: two byte-identical, one (a Baylen tokens deck) keeps every token
payoff and gains a single row — Impact Tremors entering the kept window that
falsely boosted artifact rows had been crowding.

## Theme preferences reach every surface (August 2026)

The supply-arm round above fixed one channel; this round made the exclusion
contract hold everywhere. The keystone: `_apply_theme_exclusions` scaled its
demotion by the stored FITS_THEME `fit`, which is theme-normalised (matched
weight over the theme's whole vocabulary) — a card that *is* one term of a
five-term theme read as a 20% fit, and a card below `FIT_THRESHOLD` or
failing the gate had no edge and was invisible. `theme_share_among` now asks
the card-normalised question at request time (gate-side resources through
BROADER, share inside the theme's vocabulary) and the demotion uses
`max(card_share, stored_fit)`. Side selection mirrors the theme's own gate —
counting the produces side of a cares-gated theme would make Sol Ring
(produces `mana_rock`, one hop from `artifact_matters`) read as 100%
artifacts and an exclusion would gut every mana base.

Also closed: the resource bridge no longer shops for excluded themes'
deficits; excluding `tribal` silences `typal_bridge` and the typal boost arm
(one switch for every tribe argument; diagnostics' typal profile untouched);
cut scoring gained proportional `excluded_share`/`pinned_share` terms (new
`CutCode.EXCLUDED_THEME`, translated both locales); `/replace` accepts the
prefs; the fill and replace dialogs send them.

**Measured 2026-08-29 (dev corpus, live decks):** card shares — Foundry
Inspector and Unwinding Clock 1.0 (stored fit was 0.153), Sol Ring absent,
Goblin Welder 0.25, Myr Battlesphere 0.0 (produces-side, recorded gap).
Ur-Dragon with artifacts excluded: zero artifact cards anywhere in the top
24, Dragon/typal groups intact. Ur-Dragon with tribal excluded: the Dragon,
Typal and Tribal Payoff groups all vanish. Baylen with tokens excluded:
Doubling Season 6.76 → 2.93, Parallel Lives 5.93 → 2.41, demotion visible in
provenance, cards surviving on combo evidence — demote, not ban. Baylen
cuts: token cards rise with the `excluded-theme` reason under exclusion;
pinning tokens drops 35 cut scores. `/replace` over HTTP mirrors all of it.
No-prefs runs on three decks: byte-identical to the previous round.
