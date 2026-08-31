# The theme layer

A theme is a gated, IDF-weighted expression over the closed `Resource`
vocabulary — auditable, adjustable without re-running extraction, and scoreable
against external ground truth. Definitions live in `themes.py`; this file
records the measurements behind them, the ideas that were tried and killed, and
the defects still open, so none of it is rediscovered from scratch.

The layer is 22 themes. Fourteen predate this document; five landed together
after the hidden-theme study below: `tribal` (restored), `stax`, `legends`,
`voltron`, `poison`. `stompy` landed separately — see its section, `vehicles`
later still, and `tap_matters` after that.

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
| `voltron` | equipment | 6/10 → **8/10** after the fix below → **9/10** with `retrieve_on` |
| `voltron` | auras | 3/10 → **6/10** after the fix below → **7/10** with `retrieve_on` |
| `voltron` | voltron | **7/10** (was 5/10; misses are Rogue's Passage and two commanders) |
| `spellslinger` | spellslinger | 2/10 → **7/10** with `retrieve_on` |
| `spellslinger` | storm | 1/10 → 3/10 with the storm split → **9/10** with `retrieve_on` |
| `counters` | minus-1-minus-1-counters | 8/10 → **3/10** — this one is scored *downward*: it measures a conflation, and the three left are proliferate |
| `counters` | plus-1-plus-1-counters | **10/10**, unchanged by the mm split |
| `reanimator` | discard / madness | 0/10 and 2/10 detection, 7/10 and 4/10 retrieval — **unchanged**, and recorded so the discard bridge fix is not mistaken for moving them |

Reproduce any row with `deck-lab theme-agreement [theme] [tag]`, `--retrieval`
for the second gate. Before that command existed every number here came from a
throwaway script and was re-derived from scratch each time somebody wanted one,
which is how a table like this goes stale without anybody noticing.

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

- `tap_matters` — EDHREC's nearest page, `tap-untap`, is the untap-combo and
  tapper axes instead; see the section on the theme for the scored comparison
- `tribal` — EDHREC has no single tribal tag, only per-type slugs
  (`elves`, `dinosaurs`, …). The typal axis, not the theme mapping, is where
  that conditioning comes from: `resolve_type_targets` takes an optional
  `typal_profile` and generates a candidate slug per plural form of the
  deck's loudest creature type at resolve time (`elf` → `elves`, `fungus`
  → `fungi`), rather than a table entry here — a per-commander taglink
  lookup still gates it, so a slug EDHREC does not carry for this commander
  degrades the same way a stale theme mapping would.
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

## Tap matters — the twenty-second theme

Prompted by a user asking why a deck built on Duskmourn Survivors and Far
Traveler was never told to play Vehicles. It was a fair question: the payoff
family — *tap a creature you control without attacking it* — had no term in
the vocabulary at all, so a deck could be all payoff and no fuel and nothing
in the layer could say so. Built on a new `tap_own_creature` resource (701
producers, 141 consumers; the extraction story, including why the payoff side
has to be a rule, is in `docs/extraction.md`).

**`landfall`'s split, for `landfall`'s reason.** Detection gates on **cares**:
a deck of Vehicles and convoke spells is a Vehicles deck, not a tap-matters
deck, exactly as eight ramp spells are not landfall. Retrieval reads
**either**, because the fuel is what such a deck is short of — answering "you
like tapping creatures" with more payoffs answers the wrong question.

Measured on the live graph: **141 corpus cards** on the detection gate, 834 on
the retrieval gate, **8 of the top 500 commanders**, **1 sole claim** (Kona,
Rescue Beastie). That is the `poison` band (142 / 5 / 2) and the same argument
applies — a small theme that is the *complete* answer for the commanders it
claims. Largest corpus overlap with an existing theme is `counters`, 27 of 141.

Weights are calibration, not coverage — the `vehicles` treatment, since a
single-resource map scores every member exactly 1.0, which is a constant and
not a score. Measured lift over the 834-card retrieval population:

| resource | lift | in the map? |
|---|---|---|
| `vehicle_matters` | 24.4x | 0.4 — puts the Vehicles at the top of the answer |
| `untap_permanent` | 17.7x | no — `untap_combo`'s own 1.0, and near-tautological here |
| `charge_counter` | 4.2x | no — 38 cards, all Station |
| `power_boost` | 3.7x | 0.25 — crew, saddle, teamwork and enlist all pay in power |
| `artifact_matters` | 2.9x | no — `vehicles`' reason: a deck that plays artifacts must be able to say "not this" |

`untap_permanent` is the one to understand before editing this. It sits on 86%
of the population because `tap-fuel-creature` maps to *both* sides, so weighting
it would be scoring the theme against itself — and it is the 1.0 weight of a
theme this one is deliberately not.

**Deck-level sanity, on the live dev corpus.** A proxy Emmara list (payoffs,
no fuel) reads `Tap matters 40.2%` as its top theme with `tap_own_creature
wants 11, makes 0` as its largest resource gap, and the answer leads with
Springleaf Drum, Cryptolith Rite, Holdout Settlement and Jaspera Sentinel. A
proxy Far Traveler list reads 48.1% / wants 14, makes 0, and — with no EDHREC
page for the commander at all, so mechanics only — the answer is Vehicles:
Smuggler's Copter, Weatherlight, Skysovereign, Parhelion II. That is the ask.
A Shorikai Vehicles list with no payoffs reads `Vehicles 58.7%` and does not
fire this theme at all, which is the cares gate doing its job.

**The EDHREC check is a confirmed trade, not a pass.** `tap-untap` is the only
live tag page in the neighbourhood and it scores 1/9 detection, 2/9 retrieval —
because it is a different concept. Seven of its nine High Synergy cards are the
two axes this layer deliberately splits out: untappers (Kiora's Follower,
Drumbellower, Murkfiend Liege, Tyvar) and cards that tap *an opponent's*
creatures (Verity Circle, Sharae, Solitary Sanctuary). Scored against the same
page, `untap_combo` gets **5/9** and its misses are exactly the tapper half.
The ninth, SPLIT UP, is the card `hate-tapped` is subtracted to exclude. So
`tap_matters` stays out of `THEME_TAG_SLUGS` — there is no EDHREC tag for it.

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
- **A symmetric Show and Tell read as ramp.** Braids, Conjurer Adept's two
  loudest themes were `landfall 0.84` and `stompy 0.57`, both wrong: Tagger
  tags her `land-ramp` and `sneak-creature` because her ability does put lands
  and creatures onto the battlefield, and it does it for **each player**. Ramp
  everyone gets is not your ramp — the mirror of `self_facing_tax_is_not_a_tax`
  and the same argument. `symmetric_permanent_dumps_are_not_ramp` strips
  `land_ramp`, `extra_land_drop`, `landfall_trigger` and `high_power` from the
  `show-and-tell` closure: exactly 8 cards (Braids, Show and Tell, Kynaios and
  Tiro, Wild Evocation, The Great Aurora, Hypergenesis, Eureka, Worlds Within
  Worlds), 24 edges removed. Deliberately not scoped to `symmetrical` (832
  cards, mostly wraths and wheels that make nobody's mana) or `group-hug`
  (401, whose closure holds Prismari Command and Into the Flood Maw — removal
  spells). Rampant Growth still reads landfall; Kaalia and Ilharg still read
  stompy.

- **Voltron could not retrieve the cards voltron is made of.** Its detection
  numbers were fine (equipment 8/10, auras 6/10) and every *miss* in all three
  of EDHREC's lists was an enabler — Swiftfoot Boots, Lightning Greaves,
  Rancor, Sword of the Animist. Those cards *are* the Equipment and the Auras,
  so they sit on the produces side a cares-only gate never reads. The earlier
  note calling them "co-played staples a cares-gated theme is right to
  exclude" is right about **detection** and was silently applied to
  **retrieval**, which is the distinction `retrieve_on` exists to draw.
  With `retrieve_on="either"`: voltron **5/10 → 7/10**, equipment
  **8/10 → 9/10**, auras **6/10 → 7/10**; channel 370 → 2,183, inside the
  band `reanimator` (3,241) already occupies.

- **`vehicles` scored every member exactly 1.0.** A single-resource weight map
  divides by its own only term, so the "score" was a constant — and it made
  Sram, Senior Edificer read `vehicles 1.0` above `voltron 0.73` when his text
  draws off Auras, Equipment and Vehicles alike. `legends` carries ancillary
  weights against exactly this and `vehicles` never got them. Added from
  measured lift over the 301-card population, from the combat axis: attack
  and combat-damage triggers (2.83x, 2.13x) and `power_boost` (6.00x).
  `artifact_matters` measures higher still (4.92x) and stays out — a deck
  that plays artifacts has to be able to say "not the vehicles" without
  saying "not the artifacts" — and `untap_permanent` (13.29x) is
  `untap_combo`'s own 1.0 weight. Membership is unchanged at 301 (a weight
  cannot admit a card; only `requires_any` can); Sram now reads
  `voltron 0.73` above `vehicles 0.69`, and Depala, a real vehicles
  commander, separates upward to 0.77. A test now pins that no theme rests
  on a single weight.

- **`storm_count` meant "a spell", which is not what storm means.** It was
  one of four resources asserted by a single rule over every instant and
  sorcery at cmc ≤ 4 — and the four produce-sets were **byte-identical**, all
  5,739 cards, 18% of the corpus. Its IDF was 1.49 against proliferate's 5.48,
  so wherever it was weighted it was worth nothing, and Kess and Krark fired
  no theme at all while Dark Ritual and Cabal Ritual read `treasure`. Cast,
  magecraft and prowess stay on that rule — a cheap instant genuinely is what
  they count, and their consumer sets differ (1,618 / 31 / 101). Storm now
  means "many spells this turn": produced by rituals (59) and the
  instant/sorcery cost reducers (40 — Goblin Electromancer, Baral, Cloud Key,
  Archmage of Runes), wanted by the 72 payoffs (`storm-count-matters`,
  `storm-like`, `gives-storm`, plus the 33 Storm carriers read off `keywords`
  the way `infect_toxic_keywords` reads Infect). 99 producers, 72 consumers,
  **IDF 1.49 → 5.24**. `copy_spell` came off the supply-only list in the same
  pass: `synergy-copy` (37 — Storm-Kiln Artist, Archmage Emeritus, Veyran,
  Ral Storm Conduit) is a real payoff family and it had never been mapped.

  Rejected in the same pass: `free-cast-another`, whose name invites the
  mapping and whose 371 cards are Mosswort Bridge, Windbrisk Heights,
  Rishkar's Expertise and Etali — hideaway and cheat-into-play, nothing to do
  with a spell count.

- **Spellslinger's own spells were outside its channel.** With the storm fix
  in, EDHREC's spellslinger high-synergy list still scored **2/10** and its
  storm list **3/10**, and every miss was a cheap spell — Opt, Brainstorm,
  Manamorphose, Frantic Search, Goblin Electromancer — that produces cast,
  magecraft and prowess triggers and wants nothing back. The landfall fix,
  third application: `retrieve_on="either"` takes them to **7/10 and 9/10**.
  Known cost, measured before shipping: the channel goes 208 → 6,665 cards,
  roughly twice `counters` (3,949), the widest before this. Detection is
  untouched at 208.

- **−1/−1 counters were members of the +1/+1 counters theme.** Tagger hangs
  `mm-counters-matter` directly under `counters-matter`, so the transitive
  closure that makes the mapping small also made every Hapatra, Necroskitter,
  Blowfly Infestation and Scorpion God want +1/+1 counters. Measured both
  ways: **82** cards whose oracle text carries "-1/-1" and never "+1/+1" were
  in the theme, and EDHREC's `minus-1-minus-1-counters` high-synergy list
  scored **8/10 inside it**. Fixed with a new `excludes` field on
  `TagMapping` — the general form of `lands_exempt`, subtracting a whole
  subtree from a closure — plus a `minus_one_counter` resource carrying the
  polarity's own 287 producers and 182 consumers. After: **25** cards and
  **3/10**, and every survivor is a proliferate card, which wants either
  polarity and is the one consumer the two kinds genuinely share. Curating
  child slugs instead is what leaked 35 low-power cards into `stompy`;
  the exclusion also survives Tagger adding children to the subtree.

  A −1/−1 *theme* was measured on top of the split and still does not clear
  the bar — see the ledger below. The win here is the false positive, not a
  new theme, which is what the earlier "net 0" verdict missed: it scored the
  idea as a theme and never as a defect.

- **`discard_own` was declared supply-only, and was not.** The resource had
  1,242 producers and **zero** consumers while `deck-lab audit` reported
  vocabulary health at 98%, because `SUPPLY_ONLY` membership tells the audit a
  missing consumer side is correct. Madness, Hellbent and the "whenever you
  discard" payoffs are that consumer side. `self-discard-matters` (163 cards,
  carrying all 61 madness cards in its closure) and `hellbent` (51, three
  shared) now map to `cares`, giving 211 consumers. Anje Falkenrath, Archfiend
  of Ifnir, Hollow One, Bone Miser and Tinybones held **no** `CARES_ABOUT`
  edge at all before this and now bridge to every looter in the format.

  It does not move the theme numbers, and should not be read as claiming to:
  no discard theme cleared the bar (see the ledger), so
  `deck-lab theme-agreement reanimator discard` still reads 0/10 detection
  and 7/10 retrieval, both unchanged. The win is the bridge — the suggestion
  channel and the resource diagnostics.
  Deliberately not mapped: `discard-matters` (the parent, whose other arm is
  `opponent-discard-matters` — Tergrid and Liliana's Caress want *your*
  opponents to pitch), `threshold` (108 cards, zero shared with self-discard —
  it counts the graveyard, not the discard) and `discarded-type-matters`
  (mixed polarity: Ledger Shredder and Waste Not count opponents' discards,
  Thirst for Knowledge is an outlet).

- **`counters` gated on one side of a two-sided archetype.** The new `either`
  gate fires 83 of the top 500 (was 28) and darkens none; a plain `produces`
  flip darkens two (Hamza, Pearl-Ear). Deck-level share stays at a mean 11.9%.

## Open defects, verified but not yet fixed

- **All four counter kinds share one byte-identical CARES set** (1,301 cards,
  from `counters-matter` and the proliferate rule). No cares-gated
  counter-kind theme — superfriends, charge, experience — can discriminate
  until this is split. **A fifth kind has since been taken out of the blob**
  — see the −1/−1 entry below — but that fix was a subtree exclusion for one
  inverted child, not the hierarchical rebuild this asks for. Every theme that would consume the split was measured
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
| Experience / charge counters | populations of 16 / relabelling |
| −1/−1 counter theme | re-measured after the polarity split above, on its own resource rather than inside the +1/+1 blob. Cares-gate: 182 corpus, 8 top-500 fires, **0 sole claims**; produces-or-cares: 406 corpus, 10 fires, still 0. Every commander it reaches (Yawgmoth, Atraxa, Ezuri, Tekuthal) is a proliferate deck another theme already explains, and the unexplained count does not move off 87. The original "net 0" verdict stands — but the *conflation* it was hiding did not |
| Sagas, Vehicles, Constellation, Food-Clue-Blood | 0–2 newly explained; food/clue/blood is a pure relabelling of Artifacts by hierarchy construction |
| Control / Protection / graveyard-hate / alt-wincon themes | Roles and Buckets in costume — the quota system already measures them |
| Self-mill split, Flashback | blocked by the mill conflation and the `graveyard_instant_sorcery` noise above |
| Gifts / group hug ("poisoned gifts") | **no coherent population to build it from**, which is a different answer from "too small". The obvious tag is a trap: `donate-token` (175) is removal that leaves compensation — Beast Within, Generous Gift, Pongify, Swan Song — and mapping it would file the format's best removal as a group-hug deck. `group-hug` (401) is no better; its closure holds Prismari Command and Into the Flood Maw. The clean populations do not pair: `donate` is 65 cards with 2 commanders inside rank 3,000, and the plausible payoff side, `punisher` (153), shares **2 cards** with the enabler side (`force-draw`, 316). EDHREC has no `poisoned-gifts` tag at all (403), and its `group-hug` page scores 0/10 against every theme we have. What did ship is the Braids correction above; the axis itself stays unmodelled until something bridges it |
| Storm theme | measured after the storm split above, on a resource that finally discriminates (IDF 5.24). Cares-gate: 72 corpus, **1** top-500 fire, 0 sole claims; produces-or-cares: 169 corpus, 3 fires, 1 sole (Baral). Commander storm is real and its commanders are not popular — Kess 3,126, Krark 3,528, Jeleva 14,205. The bridge and the IDF shipped; the theme did not, and `spellslinger` now ranks the storm pieces 3/10 → 9/10 against EDHREC's storm list without one |
| Discard/madness theme | measured after the bridge fix above. Cares-gate: 211 corpus, **5** top-500 fires, **1** sole claim (Chameleon) — under poison's 5/2. Produces-or-cares gate clears the bar on paper (1,411 corpus, 28 fires, 8 sole claims) and the sole claims are Baral, Nezahal and Kozilek — the landfall produces-gate trap, a deck of rummage effects reading as a discard deck. The bridge shipped; the theme did not |
| Pillow fort, Hatebears, Land destruction as separate themes | strict subsets of stax's population; three themes over 600 cards would split the signal |
| Punisher/tax theme | cleanest regex anyone wrote (148 cards, kept on file in the study report); marginal gain over stax is 4 commanders |
| Devotion | no Tagger support at all, and the produces side would be every coloured permanent |

## The retrieval eval, before and after the August 2026 pass

The falsification criterion below, actually run. Six commanders chosen to
cover every theme this pass touched — Atraxa, Krenko, Sram, Anje Falkenrath,
Hapatra, Veyran — `k=25`, `hold_out=10`, both runs on a warm EDHREC cache so
they are comparable (a cold run reports `baseline_popularity` at 0.333 rather
than 1.000 and the tool says so).

| arm | before | after |
|---|---|---|
| `mechanical_only` | 5 hits, recall 0.083, novelty 0.071 | **5 hits, recall 0.083**, novelty 0.089 |
| `bridge_only` | 1 hit, recall 0.017 | 0 hits, recall 0.000 |
| `typal_only` | 13 hits | 13 hits |

`mechanical_only` — the honest comparison, per the eval's own note that
`all_channels` is circular — is unchanged, which is the result the two widened
retrieval channels (spellslinger 208 → 6,665, voltron 370 → 2,183) had to
clear. `bridge_only` lost its single hit: one card on a 60-card held-out set,
the same magnitude the `legendary_matters` note calls ranking jitter, and
recorded here rather than rounded away. The channel breakdown moved
`combo_completion 5, typal_bridge 2` → `combo_completion 4, typal_bridge 3,
resource_bridge 1`, the resource bridge scoring on this set for the first
time.

Reproduce with
`deck-lab eval "Atraxa, Praetors' Voice; Krenko, Mob Boss; Sram, Senior Edificer; Anje Falkenrath; Hapatra, Vizier of Poisons; Veyran, Voice of Duality"`.

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
