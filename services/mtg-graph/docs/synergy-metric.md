# Measuring synergy

`docs/evaluation.md` reports that the resource bridge does not beat a popularity
baseline. `docs/magnitude.md` reports that the obvious fix — extracting effect
size from oracle text — correlates at **+0.116** and is not worth shipping.

This is the next question: *is there a principled way to combine win rate,
inclusion rate and every other data point Magic has into a single synergy
metric?* We are not the first people to need one. This records what other fields
do, which of it we can actually reach, and the order to try it in.

**The headline: our target variable has been wrong.** Everything so far has been
measured against `playability`, which is derived from `edhrec_rank` and is
popularity, not performance. Real per-card win-rate data exists and is reachable.
That changes what "correct" even means for the weights.

---

## The frame: synergy is an interaction effect

Worth stating precisely, because it tells us what the number ought to be before
we pick a statistic to approximate it with.

A card's value in a deck is not intrinsic. It is its **marginal contribution
given the other 98 cards**. Cooperative game theory has a name for this — the
**Shapley value**: average the marginal contribution of card *i* across all
subsets it could join.

Synergy is then the **interaction index**: how much more a pair is worth
together than the sum of the two alone. Positive for Thassa's Oracle and
Demonic Consultation; negative for Rest in Peace in a graveyard deck. That
negative case is the anti-synergy problem `docs/extraction.md` has carried as an
open item since Phase 2 — and it falls out of this formalism for free, rather
than needing a bolted-on rule.

Exact computation is 2^n coalitions and hopeless. But this is the definition
every statistic below approximates, and naming it explains *why* each one fails
where it does — they all assume away some part of the interaction structure.

---

## What other fields ship

| Field | Method | Solves | Known failure |
|---|---|---|---|
| Retail / market basket | support, confidence, **lift**, NPMI | co-occurrence above chance | lift explodes on rare items; NPMI favours ubiquitous ones |
| NLP | PMI, **TF-IDF** | down-weight things that appear everywhere | needs a frequency floor |
| Recommenders | matrix factorisation + **content hybrid** | cold start | pure MF cannot rate an unseen item |
| Sports, A/B testing | **empirical-Bayes shrinkage** (beta-binomial), James-Stein | small-sample noise | needs a defensible prior |
| Search ranking | **learning to rank** (LambdaMART, XGBoost) | many heterogeneous signals → one score | needs labels; overfits at small n |
| Competitive games | Elo, Bradley-Terry, TrueSkill | strength from win/loss | needs head-to-head structure |
| Game theory | Shapley, interaction indices | marginal contribution | intractable exactly |

Two things stand out.

**Shrinkage is the missing tool, and we hit its absence twice.** The lift
experiment returned six marginal 7–14% cards at the top; NPMI returned basic
lands. Those are not two separate problems. They are the textbook rare-item and
ubiquitous-item failures, and the standard fix for both is the same: a support
floor plus shrinkage toward the population mean, so a card seen in 40 decks is
pulled toward the prior and a card seen in 40,000 is not. IMDb's weighted rating
is the same trick in its most familiar form.

**Learning to rank is the direct answer to the literal question asked** — it is
the machinery for turning many signals into one score, optimising ranking
quality directly. But it needs labels, and this is exactly where Commander has
been stuck: any Commander-derived label is popularity, so a ranker fitted to it
learns to reproduce EDHREC. `all_channels` scoring 0.967 in the eval is that
circularity already showing.

---

## What we can actually reach

Verified, not assumed:

| Source | Gives | Status |
|---|---|---|
| **17lands** | GIH WR, OH WR, GD WR, **IWD**, ALSA, game counts | **partly reachable — see below** |
| EDHREC | inclusion rate, `num_decks`, `potential_decks`, synergy | **lift recoverable from stored fields** — 0/287 undefined on Atraxa |
| Scryfall | `edhrec_rank`, `game_changer`, `cmc`, prices | ingested |
| Tagger | 33 `repeatable-*` tags over 10,491 cards | ingested, used only as membership |
| Commander Spellbook | combos | ingested; the only mechanical channel that scored in the eval |
| Playgroup.gg | 271,273 games, 22,746 decklists | **aggregate power-level only — no per-card win rates.** Not usable |

Two notes on EDHREC. Its published `synergy` is the old asymmetric
inclusion-rate-difference; it has since moved to lift, but commander pages are
not migrated, so what we ingest is still the old statistic. And the values look
**quantised** — six cards tied at exactly 1.76 — so treat published synergy as
ordinal, not continuous.

### What 17lands actually serves

An earlier draft of this doc said "verified live, 74 expansions". That was too
optimistic and is corrected here.

`card_ratings/data` returns a row per card for all 74 expansions, but the
**win-rate columns are populated only for currently-live formats.** Measured:

| | cards | with GIH WR | max `ever_drawn_game_count` |
|---|---|---|---|
| MSH (live) | 334 | 38 | 1,251 |
| ELD (2019, not live) | 249 | 0 | 4 |

`filters` confirms it — its `live_formats_by_expansion` lists only MSH, EOE, WAR
and one Cube. So the endpoint is a *current-set* API, not an archive.

Historical data lives in the public S3 bulk exports instead, and those are
**game-level rows, not aggregates** — GIH WR and IWD have to be computed
ourselves. Confirmed public: `analysis_data/cards/cards.csv` (1.6 MB) and
`analysis_data/game_data/game_data_public.MSH.PremierDraft.csv.gz` (31 MB).

**Which older sets are available is unresolved.** A sweep of 52 expansions
returned 403 for every one — but MSH, which had just returned 200, also returned
403 during that sweep and served normally again afterwards. That is throttling,
not absence, so the sweep proves nothing either way. Re-probe slowly, a few sets
at a time, before planning around it.

### Corpus overlap — measured

Matching 13,110 distinct 17lands names (front faces included) against the graph:

| | cards | with a 17lands row |
|---|---|---|
| corpus | 31,948 | **12,035 (37.7%)** |
| carrying a bridge edge | 31,816 | 12,001 (37.7%) |
| EDHREC-recommended | 1,359 | **811 (59.7%)** |

So a 17lands-derived label reaches roughly a third of the corpus and three
fifths of the cards EDHREC actually recommends. Enough to fit and validate a
magnitude model; **not** enough to score every card, so anything learned from it
has to generalise through features rather than be looked up per card.

### The reframe

17lands publishes **IWD** — increase in win rate when drawn. That is a
measurement of a card's marginal contribution to winning, from 100k+ real games.
It is the closest thing to an empirical Shapley value that exists for Magic, and
it is a *performance* target rather than a popularity proxy.

So the +0.116 in `magnitude.md` may be partly an artifact of the target. The
deterministic magnitude model was scored against how many Commander decks run a
card. Smothering Tithe looked mid-table because the model reads effect-size and
misses trigger frequency — but `playability` was never measuring effect size
either.

> **Tested 2026-08-06 — and the test could not answer it.** 377,514 MSH games
> aggregated from the public game-level export gave 271 cards above a
> 1,000-game support floor. Magnitude scored −0.084 against GIH WR and +0.053
> against playability on the same cards. But at n=271 the 95% noise band is
> **|ρ| < 0.119**, so *every* number measured — including the negative signs —
> is inside it. Resolving an effect that size needs ~545 cards, i.e. several
> sets. Full write-up in [magnitude.md](magnitude.md).
>
> Two hypotheses died there too: magnitude is **not** a mana-cost proxy
> (`magnitude vs cmc` −0.032, `cmc vs GIH WR` −0.001), and **rate (A3) showed
> no signal** against real win rates (−0.063 / −0.110, also inside the band).
>
> Treat the reframe as **open**, not confirmed and not refuted. The experiment
> is worth repeating the moment more sets are reachable.

---

## Plan

Both tracks, in sequence, designed for multiple formats from the start.

### Track A — statistical, format-neutral

Each step is measurable with the harness that already exists. Run
`deck-lab eval` after each, and record the number even when it does not move.

**A1. Lift with a support floor and shrinkage.** Compute lift ourselves from
`num_decks` / `potential_decks`. Shrink toward the population mean with a
beta-binomial prior, and floor the support. This is the fix for both failures
already observed.

**A2. Apply IDF to the bridge. — DONE, measured below.**

**A3. Rate.** Effect per mana; `cmc` is stored. Free, and it is the term that
carries formats where nothing else does.

**A4. Repeatability as an edge qualifier.** Promote Tagger's 33 `repeatable-*`
tags from membership to a qualifier on the `PRODUCES` edge, regex as fallback
for new sets. Strongest single component in the magnitude study, cleanest
semantics.

### Track B — learning to rank, once labels exist

**B1. Ingest 17lands.** Quarantined adapter with a disk cache, exactly as the
EDHREC one is — it is an unofficial endpoint and should break in one file.
Attach GIH WR, IWD, ALSA and game counts to `Card`. **First job is measuring
corpus overlap** — 17lands covers Arena sets only, and that number bounds
everything in this track. It is unmeasured because Neo4j was not running.

**B2. Feature matrix.** One row per (card, context): lift, IDF-weighted bridge
strength, role fit, theme fit, rate, repeatability, combo membership,
`game_changer`, cmc, colour.

**B3. Fit a ranker** — XGBoost or LambdaMART — with **cross-validation split by
set, never by card.** Cards from one set share mechanics; a random split leaks
and will report a number far better than the truth.

### Formats

17lands is the reason to do format work now rather than later: it is the only
source that can validate the mechanical layer against actual win rates, which
Commander structurally cannot. Every weight introduced above must be computable
without `edhrec_rank`, and `power.py` needs a format-aware source for
playability rather than the single Commander-only field it has now.

---

---

## A2 result: IDF doubles the bridge, and the bridge still loses

The bridge scored `min(gap, 6) / 2 * weight` and never consumed the IDF the
theme layer has computed since Phase 2. Sharing `evasion` was evidence exactly
as strong as sharing `landfall_trigger`.

Two decisions shaped the fix:

**IDF is normalised to mean 1.0, not used raw.** Raw `log(N/df)` averages ~3.9
on populated resources, so multiplying by it would make the bridge roughly four
times louder relative to EDHREC and any recall change would be a *volume*
change, not a *ranking* change. Centring keeps `WEIGHT_BRIDGE` meaningful and
makes the before/after attributable. Spread after centring: `tribal_payoff`
(18,567 cards, 58% of corpus) **0.14**; `populate` (26 cards) **1.89**.

**Max, not sum, across matched resources.** A card matching three resources is
one hit as strong as its most specific term. Summing would rank a card touching
several vague resources above one answering a rare, precise want — the exact
ranking this change exists to fix.

20 commanders, 200 held-out cards, warm cache, same run configuration:

| arm | without IDF | with IDF |
|---|---|---|
| `baseline_popularity` | 0.035 · 7 hits | 0.035 · 7 hits *(control)* |
| **`bridge_only`** | 0.010 · **2** · nov 0.044 | 0.020 · **4** · nov 0.092 |
| `role_gap_only` | 0.020 · 4 | 0.020 · 4 |
| `mechanical_only` | 0.065 · 13 | 0.070 · 14 |
| `resource_bridge` hits in mech arm | **0** | **1** |

**The bridge doubled, and it still loses to the baseline: 4 against 7.** The
first time `resource_bridge` has contributed anything to the mechanical arm —
but `docs/evaluation.md`'s conclusion stands. Widening from 6 commanders to 20
made the *baseline* look stronger, not weaker.

So A2 is a real improvement to a channel that has still not cleared the bar
`PLAN.md` set for it. It is worth keeping — the ranking is better on its own
terms and the novelty gain is genuine — but it is not the fix.

## Two harness defects found while measuring

Both produced numbers I nearly reported.

**`--seed` was inert.** Every commander has exactly 10 `highsynergycards` and
`hold_out` defaults to 10, so `rng.sample(x, len(x))` returned all of them and
only permuted an order immediately discarded into a set. The eval had **zero
sampling variance by construction** — three seeds returning identical numbers
read as a stable result when it actually meant nothing was varying. Forcing real
sampling with `--hold-out 5` gave baseline `1,1,1,0,0` against bridge
`1,0,1,1,1`: indistinguishable. The report now says so when it happens.

**A cold cache silently invalidated a comparison.** The first wide run fetched
EDHREC data for 14 new commanders as it went, which writes `RECOMMENDS` edges
*mid-run* — so arms executing before a fetch saw a different graph from those
after. `baseline_popularity`, which cannot depend on any code under test, read
**1 hit cold and 7 warm** on the same 20 commanders. Had I not been running a
control, the cold run's `bridge_only: 4` would have looked like a clean win over
a baseline of 1. `evaluate` now detects and reports uncached commanders.

The general lesson, and it is the same one `evaluation.md` already records:
**always read the arm that cannot possibly have changed.** It is the only thing
that distinguishes a real effect from a moved floor.

## What would falsify this

If A1–A4 land and bridge recall does not move, **magnitude is not the problem
and this line of work should stop.** `docs/magnitude.md` already sets that bar;
it applies here too. The likelier remaining explanation would be that mechanical
relatedness and deckbuilding relevance are genuinely different targets — that
the bridge finds real synergies nobody plays.

---

## Caveats, offered as caveats

**Limited is not Commander.** 17lands measures a 40-card, 20-life, two-player
format that rewards rate and tempo. Commander rewards engines. A magnitude model
fitted on Limited win rates may transfer poorly — that is a hypothesis to test
by holding out formats, not an assumption to build on.

**n is still small even at 20.** The eval now runs 20 commanders and 200
held-out cards, and the difference that matters is still 4 hits against 7. Two
of the three defects found so far were in the measurement rather than the
system. Treat any single-digit hit count as directional at best.

**IWD has its own bias.** It conditions on a card being drawn, and cards that
are drawn late in long games differ systematically from those drawn early. Use
game counts to weight it, and do not treat it as ground truth without one
sanity pass.

**17lands is someone else's service.** Cache aggressively, identify ourselves in
the User-Agent, and check their terms before anything ships publicly.

---

## Reproducing

17lands card data, verified 2026-08-06:

```bash
curl -H "User-Agent: <contact>" \
  "https://www.17lands.com/card_ratings/data?expansion=MSH&format=PremierDraft"
```

Returns a JSON array; the columns that matter are `ever_drawn_win_rate` (GIH
WR), `drawn_improvement_win_rate` (IWD), `avg_seen` (ALSA), and
`ever_drawn_game_count` for support. `https://www.17lands.com/data/filters`
lists available expansions and formats.
