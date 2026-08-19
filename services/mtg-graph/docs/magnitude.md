# The magnitude problem

`PRODUCES` and `CARES_ABOUT` are booleans. Smothering Tithe and a common that
makes one Treasure once are the **same edge**. `docs/evaluation.md` names this as
the likeliest reason the resource bridge scores no better than generic
popularity, and `composition.md` specified an `amount` / `conditional` qualifier
that was never extracted.

This is research toward fixing it. The headline: **the obvious fix does not
work**, and knowing why changes what to build.

## What was measured

A per-instance magnitude model, extracted deterministically from oracle text:

| component | pattern | corpus coverage |
|---|---|---|
| quantity | `create/put <numeral>` | 20.3% |
| scaling | `for each`, `equal to the number of` | 8.9% |
| repeatability | `Whenever` trigger, or an activated `cost:` | 21.5% / 24.4% |
| one-shot | type line is Instant or Sorcery | 20.1% |

Composed as `quantity × repeatability × scaling` and correlated against
`playability` across 29,948 ranked cards:

| component | Spearman vs playability |
|---|---|
| quantity | +0.037 |
| repeatability | +0.097 |
| scaling | +0.064 |
| **combined** | **+0.116** |

Weak. And the failure is legible in one example — the 179 Treasure producers,
scored **without** playability:

```
mag  play  card
10.8  0.15  Burakos, Party Leader
 7.2  0.18  Cloud, Ex-SOLDIER
 4.0  0.34  Grim Hireling
 ...
 2.0  0.60  Smothering Tithe        <- the best card, mid-table
```

Smothering Tithe scores 2.0: it creates *one* Treasure, on a `Whenever`, with no
scaling phrase. Every term the model can see says "small".

## Why it fails

The model measures **effect size per trigger**. What makes Smothering Tithe
strong is **trigger frequency**: every opponent, every draw, every turn — call it
nine activations per turn cycle in a four-player game. Burakos triggers once per
combat.

Frequency is not a property of the text. It is a property of the *game state the
text refers to*. "Whenever an opponent draws a card" and "whenever you cast your
seventh spell this turn" are the same shape and differ by two orders of
magnitude in how often they fire.

That is the term the boolean is missing, and no regex reaches it.

## Options

**A. Per-instance magnitude, deterministic.** What was measured. +0.116, cheap,
format-agnostic, and genuinely distinguishes "makes one Treasure" from "makes
three for each artifact you control". Worth having; nowhere near sufficient.

**B. Repeatability from Tagger.** 33 `repeatable-*` tags covering 10,491 cards,
hand-curated and cleaner than the regex. Already ingested and currently used only
as *membership* — a card is or is not in `repeatable-treasures` — never as a
qualifier on the edge it produces. Cheapest real improvement available. Lags new
sets, as Tagger always does.

**C. LLM extraction of the qualifiers.** The original Layer C from
`composition.md`, and the only option that plausibly reaches trigger frequency:
a model can read "whenever an opponent draws a card" and judge that it fires
often, which is a judgement rather than a pattern. Scope it to the ~10k cards
that actually carry bridge edges rather than all 31.9k, and it is a fraction of
the batch originally budgeted.

**D. Fit magnitude from play data.** Learn edge weights so bridge output matches
observed play. Circular for Commander, and **unavailable for every other format**
— which is the reason this matters now rather than later.

**E. Model rate, not magnitude.** Effect per mana. `cmc` is already stored, so
this is free and format-agnostic. Weakest in Commander, decisive elsewhere.

## Recommendation

**B, then E, then C — and stop treating magnitude as one number.**

1. **Promote repeatability to an edge qualifier** (B). `PRODUCES {repeatable}`
   from Tagger with a regex fallback, since it was the strongest single
   component and has a clean semantic. Cheap, and it is the difference between
   an engine and a one-shot, which is the distinction that matters most often.
2. **Add rate** (E). `effect / cmc`. Free, and it is the term that carries other
   formats.
3. **Then** an LLM pass for frequency and conditionality (C), narrowly scoped,
   and only after 1 and 2 are measured — otherwise there is no way to tell what
   the LLM added.

Do **not** ship the composed score from A as-is. At +0.116 it would add noise to
the ranking while looking like progress.

Re-run `deck-lab eval` after each step. If the bridge's recall does not move, the
problem is not magnitude and this whole line of work should stop.

## Why other formats make this urgent

The current system leans on `playability`, derived from `edhrec_rank`. **That
number exists only for Commander.** In Modern, Pioneer or Limited there is no
equivalent in the data we ingest, so every place playability is currently doing
the work — ranking within a resource, breaking cut ties, scoring the bridge —
falls back to a boolean.

Worse, the formats where the crutch is missing are the ones where magnitude
matters *more*:

| | Commander | 60-card constructed |
|---|---|---|
| deck | 100, singleton | 60, up to 4-of |
| life | 40, multiplayer | 20 |
| clock | slow | turn 4-5 |
| consequence | a slow engine is fine | rate decides playability |

A card that makes one Treasure per turn is a reasonable Commander card and
unplayable in Modern. The vocabulary is mostly format-neutral and `DeckTemplate`
already parameterises composition by archetype, so the quota machinery
generalises. **The edge weights do not.**

So the honest sequencing is: magnitude is not a Commander nicety to be added
later, it is the prerequisite for the system meaning anything outside Commander.
Until it exists, a second format would ship with the mechanical layer carrying
all the weight and no evidence it can.

## Reproducing

The measurement scripts are throwaway and live in the session scratchpad rather
than the repo — the numbers above are the artefact worth keeping. Re-derive with
a Spearman over `c.playability` against the four patterns in the table.

One caution if you do: **rank ties must take average ranks.** A first pass using
ordinal ranks reported `quantity` at +0.941, because roughly 80% of cards share
`quantity = 1` and arbitrary tie-breaking manufactured a near-perfect
correlation out of nothing.

---

## Measured against real win rates (2026-08-06)

The obvious objection to everything above: `playability` is derived from
`edhrec_rank`, which counts *how many decks run a card*. It is popularity. The
magnitude model was being graded against the wrong answer key, and a card can be
strong without being popular.

17lands publishes real per-card performance. This tests the objection.

### Getting the data

17lands' `card_ratings/data` endpoint populates win-rate columns **only for
currently-live formats** — MSH returns 38 of 334 cards with a GIH WR, and ELD
(2019) returns a maximum of 4 games. For a real sample the game-level public
export has to be aggregated by hand.

From `game_data_public.MSH.PremierDraft.csv.gz`: **377,514 games, 339 cards**,
median 7,482 games per card. GIH WR and GND WR computed per game (not per copy),
IWD as their difference — matching 17lands' published definitions.

### The result: nothing is resolvable at one set

271 cards clear a 1,000-game support floor. Spearman, average ranks:

| component | vs GIH WR | vs IWD | vs playability |
|---|---|---|---|
| quantity | −0.016 | −0.021 | −0.050 |
| repeatability | −0.073 | −0.092 | +0.051 |
| scaling | −0.068 | +0.019 | +0.095 |
| **magnitude** | **−0.084** | **−0.077** | **+0.053** |

The playability column is a **within-card control** — the same 266 cards, so the
difference between columns is attributable to the target rather than to which
cards happened to be scoreable.

**But none of these numbers mean anything.** Under the null, Spearman is
approximately `N(0, 1/(n-1))`, so at n=271 the 95% noise band is **|ρ| < 0.119**.
Every value in that table is inside it, including the negative signs that look
like a finding:

| n | 95% threshold |
|---|---|
| 271 (this test) | 0.119 |
| 1,000 | 0.062 |
| 29,948 (the original) | 0.011 |

The original **+0.116 at n=29,948 was ~20 standard errors** — a real effect, and
a tiny one. This test cannot resolve effects of that size at all. Detecting
|ρ| = 0.084 at 95% needs **~545 cards**, which is at least two sets.

So the honest conclusion is not "magnitude fails against win rate". It is
**this experiment was underpowered and the question remains open.**

### Two hypotheses killed on the way

**The cost confound.** Textual magnitude ought to track mana cost, and Limited
punishes expensive cards — which would explain a negative sign. It does not
hold: `cmc vs GIH WR` is **−0.001** and `magnitude vs cmc` is **−0.032**.
Magnitude is not a cost proxy and cost does not predict win rate here.

**Rate (option E above).** Effect per mana, tested directly against real win
rates for the first time: `rate vs GIH WR` **−0.063**, `rate vs IWD` **−0.110**.
Also inside the noise band, so also unresolved — but there is no encouragement
here for promoting rate ahead of anything else.

> **Followed up at n=1,255** across five sets — see [power.md](power.md).
> "Unresolved" was the right word: several features that read as noise at n=271
> came back significant once the band dropped from 0.119 to 0.055. Rate-shaped
> features do carry signal, but the **"per mana" normalisation is the weak
> part** — against IWD, raw `total_stats` scores +0.195 where `stats_per_mana`
> scores +0.059. Dividing by mana cost destroys signal rather than adding it.

### What this changes

**Do not treat the popularity-vs-performance reframe as settled either way.** It
is untested, not refuted.

To test it properly needs 500+ cards with real win rates, i.e. several sets.
That needs the S3 bulk exports for older sets, and **their availability is
unresolved** — a 52-set sweep returned 403 for every one, but MSH returned 403
during that same sweep and served normally before and after, so the sweep
measured throttling rather than absence. Re-probe slowly.

One more caution for whoever does: Limited is a 40-card, 20-life, two-player
format. Even with enough cards, a magnitude model fitted to it measures what
Limited rewards. Hold out sets, and expect to have to argue the transfer.
