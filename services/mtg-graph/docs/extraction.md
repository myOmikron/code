# Extraction: how cards get their resources and roles

The plan's Phase 2 assumed one mechanism — an LLM batch pass over oracle text
against a closed vocabulary. Two things found during Phase 2 change that, and
both make the job cheaper and more accurate.

## Finding 1 — a curated ontology already exists

Scryfall's bulk index publishes `oracle_tags`: the **Scryfall Tagger** project,
a community-curated functional tagging of every card. Measured against our
corpus:

| | |
|---|---|
| Oracle tags | 4,523 |
| Cards in our corpus with ≥1 tag | 31,424 / 31,623 (**99.4%**) |
| Tags per card | mean 6.5, median 6, p10 3, max 46 |
| Taggings loaded into the graph | 205,196 |

The tags are functional, not flavourful: `sacrifice-outlet`, `mana-rock`,
`mana-dork`, `reanimate`, `landfall`, `sweeper`, `draw-engine`,
`repeatable-creature-tokens`, `extra-combat-phase`.

**The taxonomy is load-bearing, not decoration.** `sacrifice-outlet` carries
*zero* taggings of its own — all 2,440 sit on its 14 children. Reading direct
taggings alone reports that no card in Magic is a sacrifice outlet. Closure is a
`PARENT_OF*0..` traversal, and it is unbounded on purpose: the deepest chain is
exactly 6 levels (`tutor`), so any fixed bound sits on the boundary and
truncates silently the day Tagger adds a level.

Verified: 0 cycles in the live taxonomy, and the Cypher closure reproduces the
offline Python closure exactly (sacrifice-outlet 1,382 · reanimate 960 ·
mana-rock 348 · landfall 251 · tutor 1,097).

## Finding 2 — deterministic rules are precise but incomplete

Magic's oracle text is strictly templated, so the obvious question is whether a
grammar can replace the LLM outright. Ten regex rules, written in one pass as a
measurement rather than a feature, and
scored against the Tagger closure as ground truth:

| Rule | Precision | Recall | F1 |
|---|---|---|---|
| `extra-combat-phase` | 1.000 | 1.000 | 1.000 |
| `extra-turn` | 1.000 | 0.962 | 0.981 |
| `tutor` | 0.993 | 0.818 | 0.897 |
| `counterspell` | 0.998 | 0.809 | 0.893 |
| `mana-rock` | 0.885 | 0.799 | 0.840 |
| `landfall` | 1.000 | 0.713 | 0.833 |
| `mana-dork` | 0.804 | 0.672 | 0.732 |
| `sacrifice-outlet` | 0.982 | 0.435 | 0.603 |
| `reanimate` | 1.000 | 0.159 | 0.275 |
| `sweeper` | 0.869 | 0.148 | 0.254 |
| **mean** | **0.953** | **0.652** | 0.731 |

The shape is unambiguous and it is the useful kind of result: **when a rule
fires it is almost always right; it just does not fire often enough.**

Recall fails where one concept has many templates. "Sweeper" is
`destroy all creatures`, `exile all creatures`, `each player sacrifices`,
`-13/-13 until end of turn`, and damage-based wipes — each a separate pattern.
Reanimation is worse. Precision holds because templated text does not lie: if a
card says `takes an extra turn`, it takes an extra turn.

That is exactly the profile of a knowledge base you grow rather than a model you
trust: every rule added is permanent, auditable, and costs nothing to re-run.

## The resulting design

Three layers, cheapest and most certain first.

**Layer A — structural.** Free, exact, no inference. Type line, Scryfall
`keywords` (50.2% of cards), `produced_mana` (7.8%), colour identity, mana cost.

**Layer B — deterministic rules + Tagger.** Regex grammar over oracle text,
unioned with the Tagger closure mapped onto our vocabulary. High precision from
both sides; Tagger supplies the recall the rules lack. This is the extensible
knowledge base — rules live as data, and each one added is a permanent gain.

**Layer C — LLM, on the residue only.** Not 31.6k cards. Only:
- cards where A and B produce nothing
- cards where a rule and Tagger *disagree* (a genuine signal, worth adjudicating)
- the qualifiers neither layer supplies — `PRODUCES {amount, conditional}` and
  fractional `FILLS_ROLE` weights, which Tagger's boolean membership cannot express

## The mapping, and what it buys

[`tag_mapping.py`](../backend/src/deck_lab/tag_mapping.py) maps **137 tag slugs**
onto the vocabulary. Because each mapping is applied over the tag's transitive
closure, that small set reaches nearly the whole corpus:

| | Cards | Share |
|---|---|---|
| With ≥1 `PRODUCES` / `CARES_ABOUT` | 31,816 | 99.6% |
| **With any semantic edge** | **31,906** | **99.9%** |

Rebuild takes about 20 seconds end to end, so the mapping is cheap to iterate.

Two semantics worth stating, because getting them wrong is silent:

- **Role weights take the max, not the sum.** A card tagged both `removal` (0.5)
  and `spot-removal` (1.0) is one removal spell, not 1.5 of one.
- **Rebuild clears first.** `MERGE` is additive, so retiring a mapping would
  otherwise leave its edges in the graph forever.

`Role.PAYOFF` has no tag and cannot have one — "payoff" is relational, not
intrinsic. It is **derived**: any card that cares about a resource but fills no
other role is a payoff (5,746 cards). That fills the largest composition bucket
without inventing a tag.

### The bridge, spot-checked

```
landfall_trigger   Cultivate, Farseek, Evolving Wilds  ->  Tireless Provisioner
death_trigger      Victimize, Deadly Dispute           ->  Solemn Simulacrum, Skullclamp
treasure           Smothering Tithe                    ->  Academy Manufactor
plus_one_counter   The Great Henge                     ->  Hardened Scales
```

The spot-check earned its keep immediately. Two defects it caught:

- `sacrifice-self` mapped to `death_trigger`, producing
  **Evolving Wilds → Skullclamp**. The tag covers fetchlands and Clues, most of
  which are not creatures. Mapping removed.
- `landfall_trigger` had payoffs but **no producers**, so it bridged to nothing.
  Land ramp is what produces landfall. Added `land-ramp`, `fetchland`,
  `extra-land`, `tutor-land-to-battlefield`.

Both are the same failure mode — a resource with only one side of the bridge —
and it is invisible in coverage statistics. Every new resource needs a
producer-and-consumer check, not just a card count.

### The rule layer

[`rules.py`](../backend/src/deck_lab/rules.py) covers what Tagger cannot. **31
rules**, run as Cypher predicates so matching happens in the database with no
round trip.

The one that mattered most is the ETB producer, and the discriminator turned out
to be a single word:

| Template | Meaning | Examples |
|---|---|---|
| `When ~ enters` | the card's **own** trigger | Solemn Simulacrum, Gray Merchant, Eternal Witness |
| `Whenever ~ enters` | a **payoff** watching others | Impact Tremors, Guardian Project, Avenger of Zendikar |

4,464 producers and 1,059 payoffs, cleanly separated. `etb_trigger` now bridges
(`Solemn Simulacrum -> Garruk's Uprising`) and reads balanced on a real deck
instead of `wants 3, makes 0`.

Rules also cover the recall gaps where one concept has many templates — sweeper
(0.148) and reanimation (0.159) each got their remaining phrasings — plus
`graveyard_hate`, which Tagger has no concept for at all.

Every edge now carries a `source` property (`tagger` / `rule` / `structural`),
so provenance survives into the suggestion rationale. "Found by rule X" is
something the synthesis pass may say; "found somehow" is not.

### Polarity: the `tap_own_creature` family

The clearest case of the two layers doing different jobs, and the one to copy
when the next mechanic needs both.

The mechanic is *tapping a creature you control without attacking it* —
Duskmourn's Survival creatures, Emmara, Far Traveler, Kalamax on one side;
Vehicles, convoke, saddle, station, enlist, teamwork, harmonize and every
"Tap an untapped creature you control:" cost on the other. It matters because
the two halves are bought separately: a deck can be all payoff and no fuel,
and until this resource existed nothing in the layer could say so.

**Tagger owns the supply side outright.** `tap-fuel-creature` — "tap a creature
to pay for/activate an effect" — reaches 698 cards through its closure, with
`crew` under `tap-fuel-power` under it and `convoke` directly under it. The
tag is usable precisely because mana dorks are *not* in it: a creature tapping
itself for mana is `mana-dork`, and had the tag meant that too, every green
deck would read as a tap deck. The `tap_own_creature_supply` rule adds **3**
cards on today's corpus. It stays anyway — it is read off `c.keywords`, which
is what covers the next set three weeks before Tagger does.

**The rule layer owns the payoff side, because Tagger's tag has no polarity.**
`uninspired` (141 cards, "effects that trigger when something becomes tapped")
holds Psychic Venom, Verity Circle and Gideon's Avenger beside Emmara, and
there is no narrower parent to pick. A deck of the first three wants a tapper —
the *opposite* card — so mapping the tag would bridge Winter Orb decks to
Springleaf Drum. The two tags that *are* polarised (`tapped-matters-self` 24,
`synergy-tapped` 45) are mapped, minus the `hate-tapped` subtree, and reach 67
cards between them. The `tap_own_creature_payoff` rule reaches 121 and adds
**74** of them — the whole "whenever this creature becomes tapped" family that
is the archetype's centre.

The guard is one line and it is what makes the rule safe: a creature whose text
says "becomes tapped" without naming an opponent, an enchanted or equipped
permanent, or a land is talking about itself (66 cards; the four it drops —
Gideon's Avenger, Rhoda, Stinging Licid, Mine Layer — are all correct drops).
The state-check arm needs a comma for the same reason: `if this land is tapped
for mana` and `if this creature is tapped,` read identically until it, and
without the `[,.]` every storage land and Mana Vault joins the archetype.

Result on the 32,041-card corpus: **701 producers, 141 consumers** — the
`landfall_trigger` shape, two-sided, and the basis of the `tap_matters` theme
(see `docs/themes.md`).

Known and intended consequence: `derive_payoff_role` runs last and fires on any
card that wants a resource and fills no other role, so **40 cards** — the
Survival creatures, Emmara, Dragonscale General — now hold the `payoff` role
and count toward the synergy/wincon quota on the strength of this resource
alone. Spot-checked: every one of them is a synergy payoff, which is what the
derivation is for.

### Bridge resources vs. supply-only resources

Chasing the `blink` gap surfaced a distinction worth encoding. Not every
resource is traded *between* cards; some are supplied *to the deck*:

- **Two-sided.** `etb_trigger`, `treasure`, `death_trigger`, `landfall_trigger`.
  Producers with no consumers is a **defect** — landfall had payoffs and no
  producers and silently bridged to nothing.
- **Supply-only.** `counterspell`, `spot_removal`, `graveyard_hate`, `blink`.
  Nothing synergises with a counterspell. No consumer side is **correct**.

`SUPPLY_ONLY` in the vocabulary records which is which, and `deck-lab bridge`
says so rather than reporting a failure. Without it, expected silence and real
breakage look identical, which trains you to ignore the alarm that matters.

Blink is the instructive case: it looked like a hole, but blink cards want
`etb_trigger`, and that is where the bridge actually lives.

### The audit, and what it found

Every failure in this layer is silent. A resource with consumers and no producer
bridges to nothing; a resource with no edges makes any theme built on it read
zero; a role no card fills is invisible to the quota solver. None of them raise,
and none appear in a coverage percentage — the `landfall_trigger` bug sat behind
a 90% number for two commits.

`deck-lab audit` reports all three, and is hierarchy-aware in both directions so
a root whose children carry the edges, and a child whose parent holds the
consumers, both read as healthy rather than crying wolf.

Working the list it produced took the layer from **66% to 99%**:

| | before | after |
|---|---|---|
| resources with no edges | 27 | **1** (`tribal_lord`) |
| half-wired bridges | 13 | **0** |
| roles no card fills | 2 | **1** (`combo_piece`) |

Three modelling errors it forced out, each invisible to any other check:

- **`delayed-trigger → cares end_step_trigger` was backwards.** The end step is a
  timing, not a resource anything supplies. Those cards do not *want* an end
  step, they *are* the trigger.
- **Proliferate is the universal counter payoff.** Until it wanted every counter
  kind, charge, loyalty, experience, poison and energy each had producers and no
  consumer.
- **An artifact *is* what "artifacts matter" counts**, and an enchantment is what
  an enchantress payoff counts. Tagger tags the payoffs; nothing tags "this card
  is an artifact", because it is on the type line, exactly. That is a structural
  rule, not an inference.

`blink` used to appear here as a hole. It is not one — see the supply-only
distinction above. `stax` was unmapped until the `tax` tag was mapped, and
`graveyard_hate` until its rule was written.

## Sub-resources: specificity without fragmenting the join

Specific interactions need specific terms — a combo needs a *free* sacrifice
outlet, not any outlet — but a closed vocabulary only works because it is small
enough that both sides of a bridge land on the same term. Those pull in opposite
directions.

The resolution is a **hierarchy**, and we already built the traversal for it
when ingesting Tagger. A producer's resource matches a consumer's resource *or
any ancestor of it*:

```
(p:Card)-[:PRODUCES]->(pr:Resource)-[:BROADER*0..]->(r)<-[:CARES_ABOUT]-(w:Card)
```

Broad questions get recall from the roots; combo questions get precision from
the leaves. Measured on the live graph:

| Query | Cards |
|---|---|
| `sacrifice_outlet` (root, via `BROADER*0..`) | 1,382 |
| `free_sacrifice_outlet` (leaf, exact) | 846 |

Both are correct answers to different questions, from one set of edges.

It is a **DAG, not a tree**. A Treasure is an artifact token *and* a mana
source, and both parents carry real queries:

```
treasure -> ritual_mana
         -> artifact_token -> artifact_matters
```

So Old Gnawbone answers a `ritual_mana` query without ever being tagged as a
ritual, and answers an `artifact_matters` query for Academy Manufactor.

### The rule for when to add depth

This is the part that decides whether the vocabulary survives contact with
reality:

> **Is it a *kind of* the parent?** → child resource.
> **Is it a property of *this card's version* of the same thing?** → edge
> qualifier on `PRODUCES` (`amount`, `conditional`, `trigger`).

`free_sacrifice_outlet` is a kind of sacrifice outlet, so it is a child.
"makes a Treasure when a creature dies" is *not* a kind of Treasure — encoding
it as `treasure_from_death` begins a combinatorial explosion
(`treasure_from_etb`, `treasure_from_attack`, …) that leaves every leaf too
sparse to join, which is precisely the failure the closed vocabulary exists to
prevent. That belongs on the edge.

Applying the rule, the depth added so far is confined to places where a real
query needs it: sacrifice outlets (combos need "free"), untap effects (Kiki,
High Tide and Paradox Engine lines are different combos), recursion destination
(the command-tax rule needs "to battlefield" — a Regrowth does not dodge tax),
graveyard contents, and artifact tokens.

### Cost

Extraction does **not** get harder. Layer C targets whatever level it is
confident about and closure fills upward — the LLM never has to pick the leaf.
Adding a leaf later is additive and does not invalidate existing edges, which is
the property that makes this safe to grow incrementally.

## Creature types: a third axis

Magic has 379 creature subtypes. They must **not** become `Resource` members —
that is precisely the fragmentation the closed vocabulary exists to prevent, and
by the rule above a type is a *parameter*, not a kind. So types get their own
label and their own edges:

    (:Card)-[:IS_TYPE]->(:CreatureType)           what the card is
    (:Card)-[:CARES_ABOUT_TYPE]->(:CreatureType)  lords and payoffs
    (:Card)-[:MAKES_TYPE]->(:CreatureType)        token creation

The same bipartite bridge as everything else, on a different axis: 310 types,
30,196 bodies, 1,976 payoffs, 3,045 token makers.

Scored against Tagger's `typal` closure: **precision 0.830**, up from 0.355.
Four things carried that, each worth a measurable amount:

1. **Token creation is production, not care.** Creating a Goblin token *supplies*
   a Goblin; it does not care about Goblins. This was the single largest error.
2. **The type must be capitalised; the context must not.** Case sensitivity on
   the type is what stops "bear" matching inside prose. Applying it to the whole
   pattern instead loses every lord in the game, because oracle text opens
   sentences with "Other Goblins".
3. **The vocabulary's exclusion list is derived, not hardcoded.** A subtype seen
   more often on non-creatures than creatures is not a creature type: Forest
   arrives via Dryad Arbor, Equipment via Equipment Creatures, and both drove
   false positives. Deriving it means it stays true as sets are released.
4. **And/or lists are walked backwards.** Only the last item touches the context
   marker, so "Crabs, Lobsters, Nautiluses, Starfish, and/or Trilobites you
   control" yields two types without the walk and five with it.

Some remaining apparent misses are cards Tagger has not tagged rather than
errors — a newly spoiled lord reads correctly here and is absent there, which is
the cold-start case working as intended.

## Weight: not every producer is equal

A common that makes one Treasure and Smothering Tithe both `PRODUCES treasure`,
and the bridge scored them identically. Two signals fix that, kept deliberately
apart because conflating them is how a "power level" number becomes meaningless.

**Playability** — `edhrec_rank`, log-scaled to [0,1]. Among the 179 cards that
produce Treasure the rank spans 63 (Smothering Tithe) to 27,670, median 5,194: a
400-fold spread on exactly the axis the bridge was flattening. Logarithmic
because the gap between rank 63 and 600 matters far more than 20,000 to 20,500.

It measures *popularity*, not power — Command Tower is rank 1 and is ubiquitous
rather than strong. As a weight for "which of the cards that do this thing
should I be shown", popularity is the right proxy.

**Game changer** — Scryfall mirrors the official Commander Brackets list. 53
cards, binary, authoritative. This is the signal that speaks to power level, and
it is never averaged into a scale.

What remains unmeasured is **magnitude**: Smothering Tithe makes a Treasure per
opponent per draw; a common makes one, once. That is the `amount` /
`conditional` qualifier `composition.md` specifies for `PRODUCES` edges and which
has never been extracted. Playability is a proxy standing in for it, and it is
worth remembering that is what it is.

## Cold start: the corpus has to contain the card

`legalities.commander` reads `not_legal` for anything before its release date,
and the ingest filter tested `== "legal"`. Every newly spoiled card was
therefore dropped — the exact case the mechanical layer exists to serve.

It cascaded: a user building around a commander spoiled two days earlier found
the tool had inferred a different commander entirely, because
`is_legal_commander` returns false for a card that is simply absent, so the
commander read from their decklist header was rejected in favour of inference.

Ingest now takes commander-legal cards *or* spoilers with a future release date,
restricted to paper so Arena-only and Alchemy rebalances do not leak in. Banned
stays banned.

Ingesting the card then exposed the second half: it arrived with `produces: []`,
because Tagger cannot have tagged a card releasing in three months and the rule
layer had no mill rule and no landfall rule. Mill was reachable only through
Tagger, which is why a mill deck read as graveyard. Both rules now exist
(`landfall` P=0.938, the two mill rules P=0.982 combined), and they find mill
cards Tagger has not tagged.

## What this does to the Phase 2 gate

The plan's gate was "hand-label 150 cards, measure extraction precision/recall".
That was the main manual cost of the phase, and most of it is now unnecessary:
Tagger *is* a labelled set, curated by people who play the game, covering 99.4%
of the corpus.

The gate becomes narrower and more honest — hand-adjudicate a stratified sample
of **disagreements** between layers A/B and C, which is where the information
actually is. Agreement between two independent mechanisms is far stronger
evidence than one hand-labelled set, and it costs a fraction of the effort.

## Caveats worth carrying

- **Tagger is community-curated**, so it is uneven and a moving target. It is
  versioned through the same bulk endpoint, so a refresh is diffable — but
  coverage of a brand-new set will lag, which is precisely the cold-start case
  the mechanical layer exists to cover. The deterministic rules do not lag.
- **Tagger's vocabulary is not ours.** 4,523 tags map onto ~85 resources and 16
  roles, and that mapping is manual curation. The long tail is mostly cycle and
  flavour tags that map to nothing; the large tags cover most cards.
- **Tags are boolean.** No amount, no conditionality, no fractional role weight.
  Those are Layer C's job, and `docs/composition.md` needs the fractional
  weights for the solver.
- **205k relationships from tags alone**, before a single `PRODUCES` edge. With
  the semantic, typal and theme layers on top the graph is well past AuraDB
  Free's ~400k cap, which settles the local-Docker decision beyond argument.
- **Attribution.** Tagger data arrives through Scryfall's bulk endpoint under
  their terms; the UI should credit Scryfall and the Tagger project.
