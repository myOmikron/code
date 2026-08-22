# The theme layer

A theme is a gated, IDF-weighted expression over the closed `Resource`
vocabulary — auditable, adjustable without re-running extraction, and scoreable
against external ground truth. Definitions live in `themes.py`; this file
records the measurements behind them, the ideas that were tried and killed, and
the defects still open, so none of it is rediscovered from scratch.

The layer is 21 themes. Fourteen predate this document; five landed together
after the hidden-theme study below: `tribal` (restored), `stax`, `legends`,
`voltron`, `poison`. `stompy` landed separately — see its section, and
`vehicles` later still.

`vehicles` is deliberately not a slice of `artifacts`, though every Vehicle is
one. The two come apart in the case it was added for: a commander whose EDHREC
page is mostly vehicles, in a deck that plays none of them. Folded into
`artifacts` there is no way to say "not the vehicles" without also saying "not
the artifacts", which for such a commander is the whole deck. It gates on a
single resource — the Vehicles arrive structurally off the type line (202
cards) beside Artifact, Enchantment, Aura and Equipment, the payoffs from
`synergy-vehicle` and `animate-vehicle` (97 non-Vehicle cards between their
closures). Nothing reaches for `creature_token` or `artifact_matters` to pad
the weights: both would let decks that make bodies or play artifacts read as a
vehicles deck, which is the exact false positive the theme exists to let people
turn off.

## The hidden-theme study

**Question:** 167 of the 500 most popular commanders (33%) fired no theme at
all. What archetypes is the vocabulary missing?

**Method:** five proposing agents, each over a different lens of the uncovered
resource space; eight adversarial verifiers instructed to refute, re-measuring
every claim against the live 32,029-card graph; one synthesis pass. Every
number below was re-derived by a verifier, not carried from a proposal.

**Result:** four themes clear the bar. With the `counters` re-gate and the
restored `tribal`, the unexplained gap moved **167 → 115 (23%)**.

| theme | corpus | top-500 fires | newly explained (sole claim) |
|---|---|---|---|
| `stax` | 594 | 21 | 14 — Thalia, Grand Arbiter, Elesh Norn, Linvala |
| `tribal` | 2,617 | 67 | 9 — Krenko, Morophon, Tiamat |
| `legends` | 194 | 16 | 7 — Sisay, Jodah, Esika, Sakashima |
| `voltron` | 356 | 18 | 6 — Sram, Ardenn, Bruenor |
| `poison` | 142 | 5 | 2 — Skrelv, Skithiryx |

No commander is claimed by two of the new themes; pairwise corpus overlap
between them is 0–2 cards. The commit `feat(themes): five themes` carries the
extraction semantics worth knowing before editing any of them (non-transitive
legends rule, the prevent-activation prune, why aura/equipment have no
`RESOURCE_PARENTS` entries, poison's produces gate).

Honest limits: the 32 newly-explained are not more popular than the 115 still
unexplained (median rank 2,089 against 2,231), and the corpus is not one theme
short of complete — five proposers looked at the remainder and the best thing
any found beyond these four was a gate flip.

## The EDHREC agreement check

The strongest external check available: score each new theme against EDHREC's
tag pages (`json.edhrec.com/pages/tags/<slug>.json` — the `themes/` path 403s).
Their **High Synergy** lists are the tag-defining population; agreement there
is the number that matters.

| theme | vs tag | high-synergy agreement |
|---|---|---|
| `legends` | legends | **10/10** |
| `poison` | infect | **9/10** (miss: Thrummingbird, a proliferate card) |
| `stax` | stax | **8/10** (misses: Avacyn's Pilgrim, Birds of Paradise — dorks stax decks co-play to break parity; correct misses) |
| `voltron` | equipment | 6/10 → **8/10** after the fix below |
| `voltron` | auras | 3/10 → **6/10** after the fix below |

The auras number exposed a real gap: Tagger's `ethereal-armor` slug (the
"+X for each Aura" payoff family — All That Glitters, Ancestral Mask) and the
two attachment-tutor slugs were mapped to nothing. Three mapping lines fixed
it; voltron grew 328 → 356 and the corpus-wide fit delta was exactly those 28
cards. The remaining misses are co-played staples (Rancor, Swiftfoot Boots,
Rogue's Passage) — enablers a cares-gated theme is right to exclude.

Two readings to keep straight when repeating this check:

- **Top Commander agreement (25–75%) is a lower bound by construction.** Zur
  and Winota head EDHREC's stax page and neither has stax text — the *deck* is
  stax. Card-level themes cannot see that; the commander-anchored
  `deck_theme_profile` is the layer that answers it.
- **Atraxa tops the infect page and is deliberately not a `poison` member.**
  She proliferates poison but does not produce it, and a cares gate collapses
  the theme into +1/+1 counters at 71% overlap. The check confirms the
  documented trade rather than contradicting it.

## Theme id → EDHREC tag slug

`THEME_TAG_SLUGS` in [`edhrec.py`](../backend/src/deck_lab/edhrec.py) maps our
themes onto EDHREC's tag vocabulary so the type-target layer
(`docs/composition.md`) can reach the commander×theme subpages
(`pages/commanders/<slug>/<tag>.json` — note the *tag pages themselves* carry
no type distributions; only commander pages and their theme subpages do).
Every slug was verified against real `panels.taglinks` entries across the 24
cached commander pages on 2026-08-18.

Identity mappings: `landfall aristocrats blink tokens reanimator spellslinger
artifacts treasure lifegain aggro mill stax legends voltron stompy`. Renames:
`counters → plus-1-plus-1-counters`, `group_slug → group-slug`,
`poison → infect`.

Absent on purpose, so the subpage tier simply never fires for them:

- `tribal` — EDHREC has no single tribal tag, only per-type slugs
  (`elves`, `dinosaurs`, …). The typal axis, not the theme mapping, is where
  that conditioning would come from.
- `untap_combo` — no tag observed in any cached taglinks.

The mapping is re-checked against the commander's own taglinks at lookup
time, so a slug EDHREC retires degrades to the commander-page tier rather
than 404-looping.

## Stompy — the twentieth theme

Prompted by Ilharg, the Raze-Boar, whose profile read `aristocrats 0.22`
off his self-death trigger while his defining tag — `sneak-creature`, the
cheat-into-play family — mapped to nothing. Built on a new `high_power`
resource: every creature printed at power ≥ 4 produces it structurally
(4,282 cards — the `legendary_matters` shape), and the caring side is a
text rule plus four curated tags.

**The polarity trap is the reason it is not a tag mapping.** Tagger's
`power-matters` closure (1,419) contains `synergy-low-power` — Delney and
Tetsuko, "power 2 or less" — and curating child slugs still leaked 35
low-power cards through shared parents, making Tetsuko a *sole-claim
stompy commander*. The threshold in oracle text cannot point the wrong
way: the `high_power_payoff` rule matches "power [4+] or greater" (168
cards) with a guard that drops the same template used as hate — "destroy
all creatures with power 4 or greater" is Elspeth checking for fatties in
order to kill them (38 dropped). Four slugs carry what the regex cannot
see: `scales-with-power` (Fling, fights), `greatest-power-matters`, and
`sneak-creature`/`sneak-from-library` (Ilharg, Kaalia, Sneak Attack — the
intent side of the archetype).

Measured on the live graph: 1,053 corpus cards (mean fit 0.795), 46 of
the top 500 commanders, **6 sole claims** — both Ghaltas, Xenagos, Loot,
Eladamri, Bugenhagen — equalling voltron's bar. Cares-gated like
landfall: a produces gate would fire on every deck with incidental
fatties. Deck-level sanity: a proxy Ilharg list reads `stompy 80%`
anchored; a Krenko list stays `tribal 90%` with stompy at 4%. Tetsuko
and Delney do not fire. Corpus overlap with `aggro` is 197 of 1,053.

Known gap, recorded: characteristic-defined power (`*`) parses to null,
so Multani-shaped creatures are not structural producers however large
the board makes them.

## Defects fixed along the way

Recorded with their commits; each body carries the measurements.

- **The ceiling bug.** An empty resource scored `log(N/1)` — the maximum IDF —
  and its only possible effect was inflating a theme's ceiling. `tribal_lord`
  (zero edges, weight 1.0) suppressed Typal entirely: fit 0.043 against a 0.12
  threshold, 0 fires corpus-wide. Empty resources now score 0.0;
  `unsupported_weights()` and `dominant_weights()` report the zero and
  near-zero forms at build time.
- **`tax_effect` did not mean tax.** 415 producers from one mapping; 13
  carried `cast-tax`, 136 were ward. Thalia, Winter Orb and Smokestack
  produced none of it. Replaced with fifteen explicit slugs (336 cards,
  overlap 32), ward remapped to `protection`, and a structural correction
  removes the ten self-facing taxers.
- **A sacrificed land does not die.** `sacrifice-outlet` mapped land-only
  outlets to `death_trigger`; Hearthhull read as an aristocrats enabler. The
  `sacrifice_land` event now carries both sides (177 outlets, 21 payoffs) and
  117 land-only outlets lost the false edge.
- **`counters` gated on one side of a two-sided archetype.** The new `either`
  gate fires 83 of the top 500 (was 28) and darkens none; a plain `produces`
  flip darkens two (Hamza, Pearl-Ear). Deck-level share stays at a mean 11.9%.

## Open defects, verified but not yet fixed

- **All four counter kinds share one byte-identical CARES set** (1,301 cards,
  from `counters-matter` and the proliferate rule). No cares-gated
  counter-kind theme — superfriends, charge, experience — can discriminate
  until this is split. Every theme that would consume the split was measured
  and rejected (see the ledger below), so this is a data-honesty debt with no
  live consumer. The clean fix is hierarchical, not additive: a kind-agnostic
  parent resource that `counters-matter` and proliferate care about, with the
  four kinds as `RESOURCE_PARENTS` children carrying only kind-specific
  sources — bolting specific rules onto the shared blob leaves every kind
  still containing all 1,301 generics, which discriminates nothing.

## Defect ledger — five fixed, one resolved (August 2026)

Each fix reproduced the ledger's number first; the commit bodies carry the
full measurements.

- **Mill conflation, fixed.** The `mill` tag mapping (a zero-tagging taxonomy
  parent whose closure is mostly `mill-self`) is gone; the broadened text rule
  is the sole source. 965 → 269 producers, Mill fires 28 → 5 of the top 500,
  Bruvac's replacement phrasing now matches, and Etali/Ashiok-style
  exile-theft is excluded on purpose. The dredge theme is now unblocked.
- **Landfall/Blink, fixed.** A structural correction strips `etb_trigger`
  cares from lands-only payoffs (`thingfall`'s closure contains `landfall`).
  268 → 0 dual-carers; Blink fires 61 → 49 of the top 500.
- **`graveyard_instant_sorcery` noise, fixed.** The mapping narrows from
  `castable-from-nonhand` to its graveyard branch — foretell and suspend
  never wanted a stocked graveyard. Cares 1,638 → 1,203; no-graveyard-text
  noise 372 → 31.
- **`commander_protection`, re-derived.** The 880-card duplicate of
  `protection` is replaced by a text rule for protection that names the
  commander: 7 producers, Bastion Protector to Vexilus Praetor.
- **Land recursion, fixed.** `commander_recursion` now comes only from the
  reanimate branches that can return a commander. 960 → 630 producers;
  Crucible of Worlds and Splendid Reclamation out, Sun Titan still in.
- **Compleated planeswalkers, resolved — not a defect.** A forced re-fetch of
  Scryfall's `is:commander -type:creature` exceptions (96 cards) confirms
  none of the three are commanders; `can_be_commander = False` is correct and
  the ledger's expectation was wrong. No patch.

## Rejected, and why

The study's full ledger, condensed. These were measured, not dismissed —
re-proposing one should start by beating its number.

| idea | killed by |
|---|---|
| Lands-matter theme | weight map inert (fit set identical to the gate universe); 58% of members carry a ramp role; 1 commander over re-gating Landfall |
| Landfall produces-gate | the produces side is every fetchland and Rampant Growth — the ramp Role in a theme's name |
| Superfriends (3 constructions) | counter-CARES blob; produces-gate reaches 1 newly explained; next planeswalker commander is past rank 3,500 |
| Energy | healthiest bridge of the whole exercise (135/121) and 0 top-500 commanders; best is Satya at 6,255. Revisit if the window widens |
| Extra turns / extra combats | 0 consumers corpus-wide; Role.WINCON / aggro weight respectively |
| Enchantress (3 constructions) | produces-gate fires on all 3,636 enchantments ever printed; cares-gate is 244 cards, 2 newly explained. Loses on population, not shape |
| Experience / charge / −1/−1 counters | populations of 16 / relabelling / net 0 |
| Sagas, Vehicles, Constellation, Food-Clue-Blood | 0–2 newly explained; food/clue/blood is a pure relabelling of Artifacts by hierarchy construction |
| Control / Protection / graveyard-hate / alt-wincon themes | Roles and Buckets in costume — the quota system already measures them |
| Self-mill split, Flashback | blocked by the mill conflation and the `graveyard_instant_sorcery` noise above |
| Pillow fort, Hatebears, Land destruction as separate themes | strict subsets of stax's population; three themes over 600 cards would split the signal |
| Punisher/tax theme | cleanest regex anyone wrote (148 cards, kept on file in the study report); marginal gain over stax is 4 commanders |
| Devotion | no Tagger support at all, and the produces side would be every coloured permanent |

## What would falsify the current layer

- Any of the four new themes' extraction landing at zero population after a
  clean re-ingest (`unsupported_weights` will say so at build time).
- A blind 50-card precision read of `stax` under 70%. Two partial samples
  bracket 68–85%; the direction fix removed the known self-facing class, but
  the full read has not been done.
- The retrieval eval regressing as `legendary_matters`' 4,134 structural
  producers mute the bridge for legends decks. `mechanical_only` moved
  17 → 16 hits when the themes landed (ranking jitter; retrieval unchanged).
  If it grows, that structural rule is the first thing to pull — the theme
  axis scores identically without it.

## Product wiring still open

The backend emits more than the UI shows: `Diagnostics.themes`,
`Diagnostics.typal` and `commander_anchored` are unrendered;
`Provenance.js` has no `typal_bridge` chip; the filter dialog does not
highlight the open deck's present themes; and the combo channel still ignores
`Combo.bracket` (the bracket-gating decision is made — suppress Ruthless
completions at low brackets — but not implemented).
