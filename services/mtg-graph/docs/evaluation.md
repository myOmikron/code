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
| `baseline_popularity` | 0.017 | 0.068 | 1 |
| `bridge_only` | **0.017** | 0.080 | **1** |
| `role_gap_only` | 0.033 | 0.041 | 2 |
| `mechanical_only` | 0.083 | 0.181 | 5 |
| `all_channels` | 0.967 | 0.403 | 58 |

**Caveat:** these numbers predate a fix to `run_arm` that ran
`baseline_popularity` with an empty colour identity, which admits colourless
cards only and undercounts the popularity baseline. Re-measure before citing
them.

Per-channel, within the mechanical arm: **`combo_completion` 5, everything else
0.**

Read plainly:

- **The resource bridge scores exactly what generic popularity scores.** Given
  all 25 slots to itself, it finds one distinctive card out of sixty — the same
  as recommending staples while knowing nothing about the deck.
- **`role_gap` finds two.** At n=60 that is not distinguishable from the
  baseline's one.
- **Everything the mechanical arm does find comes from Commander Spellbook**,
  which is a curated external combo database, not our graph.
- **`all_channels` at 0.967 proves nothing.** The held-out cards *are* EDHREC
  high-synergy cards and the EDHREC channel reads that same data, so it scores
  by construction. It is reported only to make the circularity visible; quoting
  it as a win would be dishonest.

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
