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

## The bridge learns whose tribe it is shopping for (August 2026)

A user screenshot showed the Ur-Dragon deck's "Tribal Payoff" bridge group
offering Anger, a Human Shaman, Goblin King and a Wall, and its "Combat
Damage Trigger" group offering Sliver- and Goblin-locked granters plus a
dice-gated one. Three defects, three layers:

1. `creatures_supply_typal` gives every creature a `tribal_payoff` PRODUCES
   edge (the balance needs the fact), and the bridge's `wanted` had no
   specificity check — so retrieval against that deficit selects "any
   creature" (relative IDF 0.138, the corpus's vaguest resource). The
   bridge now carries `BRIDGE_UNSHOPPABLE = {tribal_payoff}`: the deficit
   stays a visible fact in diagnostics, and the typal channel — the
   tribe-aware owner of that need — argues it instead.
2. Bridge rows were tribe-blind. They now pass an off-tribe filter fed by
   `ability_tribe_references` — text references plus CARES/MAKES edges,
   deliberately **not** `IS_TYPE`: what a card *is* is identity (Anger the
   Incarnation stays), what its ability *references* is function (Goblin
   King goes). Empty tribes → no-op, so tribeless decks and `tribal`-
   excluded decks are untouched.
3. `gives-evasion`'s closure swept in composition-gated granters. Audited:
   of 1,080 combat_damage_trigger producers, exactly two shapes gate the
   grant on deck composition (dice — Barbarian Class; controlling a named
   type — Way of the Thief). One structural correction strips those; level
   costs, equips and attacks-alone riders are play-pattern conditions and
   keep their edges, tribe-gates stay corpus-side untouched because the
   runtime filter owns deck-relative judgment (a Sliver deck wants
   Two-Headed Sliver).

**Measured 2026-08-29 (dev corpus, live decks):** Ur-Dragon — the Tribal
Payoff group is gone (Myr Battlesphere reseats under its real combo
argument); the combat-trigger offering is now Rogue's Passage, tunnels,
swords, Whispersilk Cloak — every card from the report's screenshot gone;
Steel Hellkite/Drakuseth shed their bogus "supplies tribal payoff" score
term while Sarkhan and There and Back Again (genuine Dragon-makers) climb
with honest bridge provenance. Elfball: byte-identical — on-tribe suppliers
untouched. Baylen: one traded row (Song of Totentanz, a Rat-maker, condemned
by the deck's argued Saproling tribe — the off-tribe contract's standing
trade). Correction applied live: 8 edges deleted.

## Keyword breadth — the Odric/Kathril axis (August 2026)

New vocabulary: `keyword_soup`. Cares side from Tagger's hand-curated
`keyword-soup` tag (22 corpus cards — both Odrics, Kathril, Cairn Wanderer,
Soulflayer, Majestic Myriarch …); produces side from the `keyword-counter`
closure (the Ikoria counter family) plus a deterministic rule over
`c.keywords`. New `keywords` theme, cares-gated with `retrieve_on="either"`
(the landfall precedent — the channel must offer the bodies, not only the
payoffs), ancillary weights calibrated by measured lift with `evasion`
deliberately excluded as near-tautological.

**The threshold was measured twice, and the first measurement rejected the
design.** At ≥2 of the twelve keyword-counter keywords the producer
population is 991 creatures and the rebuilt corpus put its relative IDF at
**0.859 — below the floor**, so every boost this codebase gates on
specificity would have ignored the new resource. At ≥3 (132 bodies + the
counter family = 247 producers) it lands at **1.226**, beside treasure
(1.275). The prediction anchor in the plan ("991 ≈ treasure's class") was
simply wrong — treasure has ~190 producers — and only the rebuild caught it.

**Measured 2026-08-29 (dev corpus):** flagship wiring — Odric fit 1.0,
Kathril 0.905 (cares and produces), Akroma/Zetalpa 0.771 as producers. A
synthetic Kathril deck detects `keywords` as its top theme (share 0.336,
6 cards) and gets a Keywords suggestion group offering Akroma, Slippery
Bogbonder, Scavenged Brawler. Regression: Elfball and Baylen byte-identical
through the full rebuild; Ur-Dragon's groups unchanged — the theme does not
leak into decks that are not the archetype.

## The top-50 audit and the gap rounds (August 2026)

The first systematic coverage measurement: EDHREC's top 50 commanders of the
past two years, each one's top-60 synergy pool run through the live
`diagnose()` as a proxy deck and compared against the commander's own tag
page (`TOP50-COVERAGE.md` at the repo root; all 50 EDHREC pages ingested as
a side effect). Verdict: 22 strong, 9 good, 10 partial, 9 weak — the typal
axis carried every tribal deck, and the weak nine clustered on a handful of
missing concepts rather than nine separate defects.

Four rounds followed, each planned with hard accept criteria and measured
against the same harness (results files at the repo root):

- **Mana-value bands** (`high_mv_spell`, `big_spells`): the payoff regex
  measured 62/62 eyeballed precision; the producer threshold was cut at
  cmc >= 4 off the payoff population's own N-distribution (8% say 3, 92%
  say 4–7). Retrieval worked immediately (Ulalek 0.10); detection did not —
  the anchor decks hold no second payoff card, only supply.
- **Commander-anchored supply gating** (`UNLOCK_WEIGHT`): when the deck's
  own commander cares about a resource a cares-gated theme weighs at >= 0.4,
  that deck's supply becomes detection evidence. Weights not gates (that is
  what catches Vivi via cast_trigger at 0.4); the floor was added after the
  unfloored rule flipped Caesar and Breya to tribal through creature_token
  at 0.2 — tribal_payoff is structurally produced by 55.9% of the corpus.
  Three top-theme changes it caused were adjudicated as corrections against
  the commanders' own tag pages (Sephiroth and Ygra to aristocrats,
  Necrobloom to landfall) and one as an upgrade (Breya to artifacts, her
  real #1 tag at a 4x margin).
- **Wheels** (`opponent_draw`): payoff regex 29/29, producer 85/85. The
  companion `discard` theme was built, measured, and dropped: 88.8% member
  overlap with reanimator — the same 1,253 cards the `discard-outlet`
  mapping hands both `discard_own` and `graveyard_creature` — despite
  Hashaton reading 0.698 on it. A good number on a theme that fails its
  overlap gate is still a fail.
- **Defenders and enchantress** (`high_toughness`): the stompy template on
  the other stat, with the "can attack as though it didn't have defender"
  self-unlock trap guarded out (24 of 31 raw matches were a Defender's own
  escape hatch). Enchantress ships over the existing 3,636 producers;
  `aura_matters` measured 7.5x lift but 33.7% voltron overlap and stayed out.

**Measured 2026-08-30 (dev corpus, full top-50 reruns per round):** seven of
the nine weak commanders now read their archetype as top theme — Y'shtola
big_spells .35 (themed 34→51), Vivi spellslinger .37, Azula spellslinger
.53, Bello enchantress .59, Glarb big_spells .40, Arcades defenders .92
(themed 14→51), Bumbleflower wheels .12 beside counters — with Nekusar
wheels .74, Kaalia stompy .50, Muldrotha reanimator .62, Esika legends .53
and Yuriko tribal .77 improving unasked. No Strong commander lost its top
theme and no deck's themed-card count dropped, in any round. Still open:
Kefka (his text makes nobody draw — structural), Kenrith (group hug and
politics remain unmodeled), counter-type breadth, superfriends, and the
lands-matter umbrella.

## Counter kinds and superfriends (August 2026)

Gap 7 closed, gap 6 half-closed. `superfriends` gates on produces — the
cares gate the plan specified read Carth the Lion (32 walkers) at 0.125,
because a superfriends deck supplies loyalty rather than caring about it in
the extraction sense; measured anchors after the change: Carth 0.319 rank 1,
Atraxa's default build unmoved at counters 0.826 with superfriends visible
at 0.024. The `energy` theme worked on its anchor (Satya 0.701 rank 1) and
was dropped anyway: 93.2% of its members also clear `counters`, from the
blanket proliferate cares rule plus a `tag_mapping.py` defect that hands
plain energy cards `plus_one_counter` — fix that mapping first, then energy
ships. Counters gained experience/charge at weight 0.1 (the planned 0.5/0.4
grew the ceiling 63.3% and moved three of the four stability commanders);
Animar held rank by 0.003 and any future counters round should re-check him.
