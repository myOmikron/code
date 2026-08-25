# Quantifying power level

What makes one card stronger than another, and which of it we can measure.

Measured against **2,431,633 real games** across five 17lands Limited sets
(KHM, STX, MID, VOW, MSH), 1,255 card-set observations above a 1,000-game
support floor.

---

## A correction, first

An earlier pass measured these features on **one** set (MSH, n=271) and
concluded that "power/toughness per mana shows nothing" and "evasion and
protection show nothing".

**That conclusion was wrong.** At n=271 the Spearman noise band is |ρ| > 0.119,
which is wider than most of the effects being looked for — the features were
*unresolvable*, not absent. At n=1,255 the band drops to 0.055 and both come
back significant:

| feature | n=271 (one set) | n=1,255 (five sets) |
|---|---|---|
| stats per mana | +0.027 "noise" | **+0.089 significant** |
| evasion keywords | +0.084 "noise" | **+0.184 significant** |

The lesson is the one this project keeps relearning: **an underpowered test does
not return "no", it returns "don't know"**, and reporting the first as the second
is how a good hypothesis gets discarded.

---

## What actually predicts winning

n=1,255 (618 creatures). Noise band |ρ| > 0.055 overall, 0.079 for creatures.

| feature | vs GIH WR | vs IWD | verdict |
|---|---|---|---|
| **rarity** | **+0.319** | **+0.371** | **strongest by far** |
| evasion keywords | +0.184 | +0.195 | significant |
| oracle text length | +0.180 | +0.178 | significant |
| keyword count | +0.116 | +0.061 | significant |
| total stats (P+T) | +0.091 | **+0.195** | significant |
| stats per mana | +0.089 | +0.059 | significant |
| value keywords | +0.081 | +0.072 | significant |
| protection keywords | +0.057 | +0.071 | **still unresolved** |
| cmc alone | +0.051 | +0.163 | noise on GIH WR |
| banned elsewhere | +0.042 | +0.068 | noise *in Limited* |
| reserved list | — | — | no variance in sample |

### Three things worth extracting

**Rarity is the strongest signal, and it is not a one-set artifact.** Checked per
set independently, every one clears its own band:

| set | ρ (rarity vs GIH WR) | its noise band |
|---|---|---|
| KHM | +0.361 | 0.122 |
| STX | +0.372 | 0.114 |
| MID | +0.302 | 0.135 |
| VOW | +0.336 | 0.134 |
| MSH | +0.209 | 0.119 |

This makes sense rather than being a curiosity: **rarity is Wizards' own power
budget.** Designers deliberately spend more power on rares.

**"Per mana" is the weaker framing.** Against IWD, raw `total_stats` scores
**+0.195** while `stats_per_mana` scores **+0.059** — dividing by mana cost
*destroys* signal rather than adding it, and `cmc` alone is noise against GIH WR.
So the useful version of the intuition is **"does a lot"**, not "does a lot per
mana". Oracle text length (+0.180), a crude proxy for "this card does a lot",
outperforms the entire hand-built magnitude model of `docs/magnitude.md` (+0.116
at n=29,948).

**Protection is still unresolved.** Hexproof/ward sits at +0.057 against a
creature band of 0.079. Not shown to be absent; just still too small to see.

---

## Cross-format transfer

Over the 31,623 commander-legal cards, counting bans and restrictions in
Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Brawl and Historic:

| banned/restricted in N formats | cards | median `edhrec_rank` | % game changers |
|---|---|---|---|
| 0 | 31,342 | 15,883 | 0.1% |
| 1 | 157 | 2,775 | 5.1% |
| 2 | 74 | 4,086 | 8.1% |
| 4 | 5 | 522 | **40%** |
| 5 | 2 | 1,055 | **50%** |

**Real, and almost no recall.** Banned-somewhere cards are 5.7× better ranked,
but only **281 cards (0.9%)** qualify. It is a top-end marker like
`game_changer`, not a scale. Face-validity is good — the corpus's most-banned
cards are Oko, Demonic Tutor (rank 61), Field of the Dead, Strip Mine, Gitaxian
Probe, Treasure Cruise.

It measures +0.042 against Limited win rates, inside the noise band — but that
is the wrong test: cards banned in Constructed barely appear in a Limited set.
The Commander evidence above is the evidence for this signal.

**The reserved list is an anti-signal.** 544 cards in the corpus, median
`edhrec_rank` **25,187** — worse than the corpus median. It tracks
collectability, not power. It is stored so this stays checkable, and
`tests/test_power.py` asserts it never becomes a scoring term.

**Vintage cube is not reachable.** 17lands' `Cube` / `Cube - Powered` /
`Cube - Planar` are Arena cube, not MTGO Vintage Cube.

---

## What is implemented

Signals stay **separate**. Nothing is blended into a single "power level" number,
for the reason `power.py` has always given: conflating popularity with power is
how such a number becomes meaningless.

| function | signal | status |
|---|---|---|
| `playability()` | `edhrec_rank`, log-scaled | popularity proxy, in use |
| `game_changer` | Scryfall flag, 53 cards | binary, in use |
| `rarity_weight()` | rarity, centred on 1.0 | **new**, wired into the *unranked floor only* |
| `banned_elsewhere()` | `banned_in`, 281 cards | **new**, not yet wired into ranking |

### Rarity holds up on EDH too, but only earns the floor

Checked against Commander data before wiring anything: **rarity vs playability
+0.396** at n=31,814 (noise band 0.011), with a clean monotonic gradient in
median `edhrec_rank` — common 21,253, uncommon 17,486, rare 10,501, mythic
6,692. So it is not a Limited artifact; it generalises.

**But it is not applied to ranked cards.** Rarity and playability correlate at
+0.396, so multiplying both into every score counts the same evidence twice, and
where a rank exists it is the better signal — it measures play directly rather
than predicting it.

Rarity therefore moves **only the unranked floor**, where nothing else is
available: 152 cards, 84 of them unreleased spoilers. Previously a newly spoiled
mythic and a newly spoiled common both scored a flat 0.15; now 0.180 and 0.1275.
A ranked card at #500 scores 0.4876, so a rank still dominates any floor.

Deliberately timid, because **the current eval cannot see this change at all** —
held-out cards are EDHREC cards and always have a rank. Confirmed: the
20-commander eval is byte-identical before and after, which is the control
proving the change is scoped to cold start and nothing else.

`rarity_weight` is centred on 1.0 with a deliberately narrow spread
(0.85 common → 1.20 mythic), for the same reason the bridge's relative IDF is
centred: a multiplier that changes a channel's *volume* makes an eval change
impossible to attribute. The narrow spread also keeps common staples reachable —
Counterspell is a common and Sol Ring is uncommon.

New on the `Card` node: `power`, `toughness`, `banned_in`, `reserved`.
17,812 cards carry power/toughness; 281 carry a ban; 544 are reserved.

---

## The caveat that bounds all of it

**Every win-rate number here comes from Limited.** A 40-card, 20-life,
two-player format that rewards efficient creatures and punishes durdling.
Commander is none of those things.

Rarity's edge is partly "bombs are rare, and Limited rewards bombs more than
Commander does". Note that `edhrec_rank` correlates **−0.113** with GIH WR —
Commander popularity and Limited performance are only weakly related, which is
itself the warning.

So these are the best-evidenced weights available, and they are evidenced on the
wrong format. Before wiring any of them into Commander ranking, read
`docs/evaluation.md` on why a Commander recall number cannot validate them
either: its gold set is popularity-derived.

## Reproducing

Scripts live in the session scratchpad, not the repo — the numbers are the
artefact worth keeping. To re-derive: download
`analysis_data/game_data/game_data_public.<SET>.PremierDraft.csv.gz` from
`17lands-public.s3.amazonaws.com`, aggregate GIH/GND per game (not per copy),
and Spearman against Scryfall features with **average ranks for ties**.

Two traps, both hit:

- **Older sets are gzipped tar archives** despite the `.csv.gz` name; MSH is a
  raw gzipped CSV. Sniff for `ustar` at offset 257. A wrong guess surfaces as
  `_csv.Error: line contains NUL`, which names nothing useful.
- **Sets before ~2021 do not exist.** ELD and ZNR return 403 under polite,
  spaced probing. A fast sweep 403s on *everything* including sets that serve
  normally either side of it, so throttled results prove nothing — probe slowly.

---

## Format coupling: what would have to move, and why it has not

Recorded 2026-08-06 while deciding whether to refactor for multiple formats.
The decision was **not yet** — EDH first — but the measurement is worth keeping
so the eventual split is cut on evidence rather than guesswork.

Coupling density, counting `commander|edhrec|color_identity|spellbook` mentions:

| already portable | | genuinely coupled | |
|---|---|---|---|
| `composition.py` | 1 / 243 | `power.py` | **22 / 127 (17%)** |
| `rules.py` | 3 / 276 | `evaluate.py` | **44 / 305 (14%)** |
| `tag_mapping.py` | 3 / 263 | `suggestions.py` | **61 / 591 (10%)** |
| `themes.py` | 5 / 402 | `edhrec.py`, `spellbook.py` | adapters, by definition |
| `vocabulary.py` | 6 / 364 | | |
| `solver.py` | 8 / 334 | | |
| `cuts.py` | 8 / 512 | | |

**Roughly 2,350 lines of extraction, composition and solving already
generalise.** `DeckTemplate` even carries `deck_size` as a parameter. The
coupling is concentrated in retrieval, power and evaluation — which is the same
conclusion `docs/magnitude.md` reached from a different direction: *the quota
machinery generalises, the edge weights do not.*

### Why no abstraction yet

**One implementation gives the wrong seams.** A format-strategy interface with a
single concrete implementation is guesswork. This repo already made that call
correctly once, deferring the `graph.py` split until Phase 6 showed where the
channels actually landed.

**Cube is a different problem shape, not another format.** Deck building is
"pick 99 for one commander". Cube building is "pick 360-540 so that N archetypes
each have enough playables across a power band" — set cover, not deck fill. The
useful part is that **CP-SAT is already the right shape for it**: archetypes
become buckets and "each archetype needs 20-30 playables" becomes the quota. A
cube would reuse composition, themes and power while needing almost nothing from
Commander retrieval, which makes it the honest second implementation to extract
an abstraction *from*.

**Card evaluation and its validation are coupled** and have to be designed
together. A per-format power score needs a per-format way to check it works, and
`docs/evaluation.md` records why the current harness cannot serve that role for
anything that is not popularity-shaped.
