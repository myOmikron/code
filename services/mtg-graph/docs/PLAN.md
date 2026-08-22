# MTG Commander Deck Advisor — Graph-Backed Retrieval

## Context

Exploring whether GraphRAG can meaningfully assist Commander deckbuilding. Deckbuilding is a hybrid problem: a **retrieval** task (which of ~30k cards relate to what I'm doing), a **constraint satisfaction** task (mana curve, role quotas, land count), and a **creative** task (theme/subtheme balance, consistency, "does this card fit the story"). Naive RAG handles none of these well; a graph handles the first, plain code handles the second, and an LLM handles the third.

The design thesis is that **synergy should not be inferred from card text alone**. Two independent signals already exist and should be fused:

1. **Empirical** — EDHREC has already aggregated millions of real decklists into per-commander inclusion rates and *synergy scores* (inclusion rate for this commander vs. baseline). This is a pre-computed synergy graph, free.
2. **Mechanical** — a `PRODUCES` / `CARES_ABOUT` bipartite layer extracted from oracle text against a closed vocabulary. Synergy becomes a 2-hop traversal: `A -PRODUCES-> resource <-CARES_ABOUT- B`.

Signal 2 is what justifies the graph. It generalizes to cards with **zero decklist data** (every new set release), and it surfaces off-meta cards that pure popularity data structurally cannot. It also produces a diagnostic EDHREC cannot: *"9 cards in your deck care about artifacts; 3 make them."*

**Scope decisions (confirmed):** Commander/EDH only. First milestone is **upgrading an existing decklist** (ranked adds + cuts with rationale), not generation from scratch. Card pool unconstrained, with a **budget cap** filter; collection ownership deferred.

**Target location — single monorepo** at `/Volumes/Code/personal/scry-before-you-buy`:
- `frontend/` — Next.js (pages router), owning the `/deck-lab` route.
- `backend/` — Python service + Neo4j. Next.js API routes proxy to it.

> **Revised 2026-08-04.** This originally split across two repos: the frontend as a
> new route inside the existing `nur-magic-homepage`, the backend as a separate
> `mtg-deck-graph`. Superseded by a monorepo — the reusable pieces
> (`magicTokens.js`, `scryfall.js`) are **copied in** rather than shared, so
> `nur-magic-homepage` is untouched and the two projects can diverge freely.
> Where the Frontend section below says "a new route in `nur-magic-homepage`",
> read "the `frontend/` workspace here".

---

## Non-negotiable design constraints

**Neo4j must run locally in Docker, not on AuraDB Free.** The free tier caps at ~200k nodes / 400k relationships. Confirmed empirically: tags plus the semantic layer already stand at **326,962 relationships** before a single EDHREC or combo edge. Card nodes are trivial (~28k), but relationship volume from co-occurrence and the semantic layer will exceed the cap. The Aura instance created on 2026-08-03 is not suitable — leave those credentials unused.

**Hard constraints never go to the LLM.** Land count, mana curve, color identity legality, and role quotas are arithmetic. An LLM will confidently return a 97-card deck with 12 lands. These are computed and enforced in Python.

**The LLM never sees raw card text at synthesis time.** It receives a compressed structured deck summary (role counts, curve histogram, resource balance, synergy clusters) plus a candidate list annotated with *why each card was retrieved*. That provenance is what keeps rationales honest instead of plausible-sounding fiction.

**Rules and combo interactions are never LLM-reasoned.** Use Commander Spellbook as ground truth.

---

## Data sources (all verified available)

| Source | Access | Use |
|---|---|---|
| [Scryfall bulk `oracle_cards`](https://scryfall.com/docs/api/bulk-data) | Free, no auth. **Gzipped JSONL** via `jsonl_download_uri` (~24MB compressed), refreshed every 12–24h | Card ground truth: types, oracle text, mana cost, color identity, legalities, prices, `edhrec_rank` |
| [Scryfall Tagger `oracle_tags`](https://tagger.scryfall.com) | Same bulk endpoint, no auth. 4,523 curated functional tags in a parent/child taxonomy | **Covers 99.4% of the corpus at 6.5 tags/card.** Replaces most of the Phase 2 LLM extraction |
| [pyedhrec](https://github.com/stainedhat/pyedhrec) → `json.edhrec.com` | Unofficial, no key, 24h client-side cache | Per-commander inclusion rate, **synergy score**, high-synergy cards, real decklists |
| [Commander Spellbook](https://backend.commanderspellbook.com/schema/swagger/) | Documented REST, MIT-licensed, OpenAPI schema | `/variants` (combo corpus), `/find-my-combos` (POST decklist), `/estimate-bracket` |

**Scryfall compliance is mandatory, not optional:** descriptive `User-Agent` identifying the app with contact info, `Accept: application/json`, sustained traffic under 10 req/s, and local caching for at least 24h. Bulk downloads are the intended refresh path — do not iterate the card API. Confirmed in practice: Scryfall returns **`400 generic_user_agent`** for default HTTP-library agents. Browsers send their own UA and forbid scripts from setting the header, so the frontend applies it only when `typeof window === "undefined"`.

**EDHREC is unofficial and undocumented.** Persist everything fetched to local disk, load lazily per-commander on demand rather than bulk-crawling, and treat schema breakage as expected. Never hammer it.

---

## Architecture

### Layer 0 — Ingestion (offline batch)
Download Scryfall `oracle_cards` bulk → filter to `legalities.commander == "legal"` → `Card` nodes. Ingest Commander Spellbook `/variants` → `Combo` nodes + `USES` edges. EDHREC pulled lazily per-commander (see Layer 2).

### Layer 1 — Semantic extraction (the differentiator)
An LLM batch pass over oracle text producing typed triples against a **closed vocabulary**. The closed vocabulary is the single most important detail here: free-form extraction yields thousands of near-duplicate resource names (`"treasure token"` / `"Treasures"` / `"treasure_tokens"`) and the 2-hop join then matches nothing.

Fixed enums, roughly:
- **Resources (~60–80):** `treasure`, `food`, `clue`, `blood`, `creature_token`, `plus_one_counter`, `charge_counter`, `energy`, `card_draw`, `lifegain`, `mill`, `graveyard_creature`, `graveyard_instant_sorcery`, `land_drop`, `landfall_trigger`, `untap_permanent`, `sacrifice_outlet`, `etb_trigger`, `death_trigger`, `attack_trigger`, `cast_trigger`, `discard`, `blink`, `copy_spell`, `extra_combat`, `extra_turn`, `proliferate`, `storm_count`, …
- **Roles (~12–16):** `ramp`, `card_advantage`, `spot_removal`, `board_wipe`, `tutor`, `recursion`, `protection`, `graveyard_hate`, `stax`, `wincon`, `combo_piece`, `land`, `mana_fixing`, `evasion`

Edges carry qualifiers: `PRODUCES {amount, conditional}`, `CARES_ABOUT {payoff_magnitude, requires_count}`.

Run with **Haiku 4.5 via the Batch API** (50% discount) plus prompt caching on the shared vocabulary/instruction block — ~28k cards at a few hundred tokens each is cheap, and it's a one-time cost re-run only on set releases.

**Build a hand-labeled validation set of ~150 cards first and measure extraction precision/recall before trusting the output.** If extraction is noisy, every downstream layer inherits the noise silently. Do not skip this.

### Layer 2 — Graph (local Neo4j 5.x, Docker)

Nodes: `Card`, `Resource`, `Role`, `Combo`, `Theme`, `Deck`

```
(:Card)-[:PRODUCES {amount, conditional}]->(:Resource)
(:Card)-[:CARES_ABOUT {payoff_magnitude}]->(:Resource)
(:Card)-[:FILLS_ROLE {weight}]->(:Role)
(:Card)-[:RECOMMENDS {synergy, inclusion_rate, deck_count}]->(:Card)   // commander → card, from EDHREC
(:Combo)-[:USES]->(:Card)
```

**Do not materialize full pairwise card co-occurrence** — it is quadratic (one commander's ~500-card pool alone is ~125k pairs). Reify it as directed `RECOMMENDS` edges from the commander card, populated lazily only for commanders actually queried. That keeps v1 in the low tens of thousands of edges.

Add a native vector index on an oracle-text embedding for "something *like* this" fallback retrieval when a role is underfilled and structured retrieval comes up short.

### Layer 3 — Candidate generation (deterministic Cypher, zero LLM)
Given a decklist + commander:
1. **Hard filters:** color identity ⊆ commander identity, commander-legal, within budget cap (Scryfall `prices`), not already in deck.
2. **Union four retrieval channels**, each tagging its results with provenance:
   - `edhrec_synergy` — `RECOMMENDS` ordered by synergy score
   - `resource_bridge` — 2-hop: cards that `CARES_ABOUT` resources this deck over-produces, and cards that `PRODUCES` resources this deck over-wants. *This is the channel that finds off-meta cards.*
   - `combo_completion` — combos where the deck already holds n−1 of n pieces (via `/find-my-combos`)
   - `vector_knn` — semantic neighbors for underfilled roles
3. Score, dedupe, keep top ~200–400.

### Layer 4 — Diagnostics (pure code, zero LLM)
Curve histogram vs. target · role coverage vs. the Commander template (~10 ramp / ~10 draw / ~8–10 interaction / 36–38 lands) · **resource balance table** (produced vs. cared-about, surfacing unmatched pairs) · color pip requirements vs. mana base · bracket estimate via `/estimate-bracket`.

### Layer 5 — LLM synthesis
Compressed deck summary + provenance-annotated candidates in → ranked adds, ranked cuts, theme coherence commentary out. Handles the soft requirements stated in natural language ("budget, no infinite combos, keep it janky, lean tribal").

### Layer 6 — Evaluation harness
This is what determines whether the project is real rather than a plausible demo.

- Pull held-out real decklists via `get_commander_decks`
- Mask 10 random cards from each; ask the system for 25 suggestions
- Measure **recall@25** against the masked cards
- **Baseline: "top 25 EDHREC cards by raw inclusion rate."**

The system is only worth building if it beats that baseline — or matches it while scoring materially higher on **novelty@k** (suggestions with low global inclusion rate that the deck actually ran). Measure per-channel recall too, so it's visible whether `resource_bridge` is contributing or the whole thing is EDHREC with extra steps.

---

## Frontend (React / Next.js, reusing Scry Before You Buy)

Built as a new route in `nur-magic-homepage`, following the established split: a thin page entry in `pages/` doing data fetching, with all UI in a component directory — mirroring [`pages/scry-before-you-buy/index.js`](/Volumes/Code/personal/nur-magic-homepage/pages/scry-before-you-buy/index.js) → [`src/components/scry-before-you-buy/ScryBeforeYouBuy.js`](/Volumes/Code/personal/nur-magic-homepage/src/components/scry-before-you-buy/ScryBeforeYouBuy.js).

New: `pages/deck-lab/index.js` → `src/components/deck-lab/DeckLab.js`.

### Reuse — already written, do not rebuild

[`src/lib/scryfall.js`](/Volumes/Code/personal/nur-magic-homepage/src/lib/scryfall.js) is the entire deck-input layer and needs no changes:
- `parseDeck()` — handles Moxfield export format, set codes, collector numbers, foil markers, section headers (`Commander`, `Sideboard`, …), and `//` comments
- `parseMoxfieldCsv()` — full CSV parser with quote escaping
- `formatDeckList()`, `normalizeText()`
- `fetchCards()` — batched Scryfall `/cards/collection` lookup (75/batch) with not-found reporting

The UI patterns transfer almost directly to the new use case:

| Existing | Reused as |
|---|---|
| `.stats` / `.stat-n` tiles (3-up counters) | Deck diagnostics: curve, role coverage, bracket |
| `.cards-grid` + `CardButton` | Suggested adds/cuts grid, with the packed/checked state becoming accepted/rejected |
| `.tabs` sticky tab bar | Diagnostics · Adds · Cuts · Combos |
| `.scry-app` sidebar + main grid | Decklist input sidebar, results main |
| `.deck-input` textarea + CSV upload row | Identical — decklist entry |
| `AuthContext` + Firestore `users/{uid}/…` sync | Saved decks per user, same debounced-`setDoc` pattern |

`src/components/MagicCard.js` is a simpler standalone card renderer (Scryfall `named?format=image` with local-src fallback) — useful for one-off card display, but `CardButton`'s grid pattern fits the suggestion list better.

### Required refactor: extract design tokens

The design system currently exists **only** as an inline `createGlobalStyle` block inside `ScryBeforeYouBuy.js` — a grep for `#e8193c` / `Barlow Condensed` across the repo returns that one file. Before building a second page on it, extract:

`src/styles/magicTokens.js` — the CSS custom properties (`--black`, `--red: #e8193c`, `--white`, `--border`, `--green`, the Barlow/Barlow Condensed import) plus the shared primitives: `.stats`/`.stat`, `.tabs`/`.tab`, `.cards-grid`/`.card-item`, `.btn-run`, `.field-label`, `.status`, and the 900px responsive block.

Scope them under a shared class (e.g. `.mtg-page`) rather than `.scry-page`, then have both pages consume it. Keep this a pure extraction with no visual change — verify Scry Before You Buy renders identically before building on top of it.

Two additions the deck advisor needs beyond the existing vocabulary: a **mana curve bar chart** and a **resource-balance table** (produced vs. cared-about). Both should be built from existing tokens — no new color values, no charting library.

### Frontend/backend boundary

Scryfall calls stay client-side, exactly as today. Everything requiring the graph goes through new Next.js API routes (`pages/api/deck-lab/*`) that proxy to the Python service, keeping the Neo4j connection and the Anthropic API key server-side. This matches the existing `pages/api/magiccon-artists.js` proxy pattern.

### Small pre-existing fix worth making

`fetchCards()` uses `REQUEST_DELAY_MS = 100`, but Scryfall documents a **tighter 2 requests/second cap specifically on `/cards/collection`** (500ms). Harmless for a 100-card deck (2 batches), but the deck advisor will call it far more. Raise the delay to 500ms on that path.

---

## The builder track

Added after Phase 6. `/deck-lab` proved the *advisor*: paste a decklist, get it
read back. It could not build a deck, and a tool that diagnoses a deck you must
maintain somewhere else is a tool you visit rather than use.

`/build` is a Commander deckbuilder with the advisor beside it, taking
Moxfield's information architecture and rendering it in this project's brand.
That fusion is the product thesis made structural: **Moxfield can build and
cannot advise; EDHREC can advise and cannot build.** A suggestion here is one
click from being in the deck.

| Sub-phase | Deliverable |
|---|---|
| builder 1 | ✅ Deck store, Scryfall search, add/remove/quantity, localStorage persistence |
| builder 1 | ✅ Search as a dropdown (Enter takes the top hit); card drag-and-drop by art |
| builder 2 | ✅ Three views, five grouping axes, five sorts, row menu, printings, import, statistics |
| builder 3 | ✅ IndexedDB card cache, deck library, undo/redo, keyboard shortcuts |
| builder 4 | ✅ The advisor as a live inspector panel, coalesced on the deck signature |
| builder 5 | Supabase (anonymous auth, decks table, debounced sync). Local Docker first |
| builder 6 | Graph-backed search filters — the ones Scryfall cannot express |

### The two decisions worth not relitigating

**The deck document holds scalars only.** Art, oracle text and prices live in a
separate card cache keyed by Scryfall id. Every undo frame is a snapshot of the
document and every save ships it, so letting the fat data in turns a ~15KB
write into a ~350KB one on a 1.2s debounce. It would present as vague slowness,
never as an error.

**`deckSignature` is what stops the analysis thrashing.** It content-addresses
exactly what the backend sees — mainboard oracle ids summed across printings,
plus speed and overrides. Because it is derived from that projection and
nothing else, a printing swap, a rename, a category edit or a move to the
maybeboard is *structurally incapable* of triggering a request. That is far
more robust than remembering to exclude them at each call site, and it is
verified by test.

### What the builder still owes

- **Supabase.** Decks live in `localStorage` today. The library index already
  has the shape that table will query.
- **Graph-backed search.** Scryfall answers "t:creature cmc<=3"; it cannot
  answer "produces treasure" or "cares about +1/+1 counters". Those are this
  project's differentiator and they need an endpoint the backend does not
  expose yet — `graph.py` has the data and the CLI reaches it, but nothing
  serves it over HTTP.
- **Cuts and combos.** Both tabs are still placeholders. `/find-my-combos` is
  already ingested; cuts wait on Phase 7's synthesis pass.

---

## Build order

| Phase | Deliverable |
|---|---|
| 0 | ✅ **Done.** Monorepo scaffold; `magicTokens.js` + `scryfall.js` ported into `frontend/`; `/deck-lab` shell resolving a real decklist against Scryfall |
| 1 | ✅ **Done.** Scryfall ingestion → Neo4j `Card` nodes, constraints, indexes. Docker compose. 31,623 commander-legal cards, ~8s. |
| 2 | Closed vocabulary ✅ · Tagger ontology ingested ✅ · deterministic rule layer · extraction prompt. **Gate: adjudicated disagreement sample.** See [docs/extraction.md](docs/extraction.md) |
| 3 | Deterministic rule layer ✅ (10 rules, 13,061 cards). LLM extraction deferred — Tagger + rules cover 91.6%; Layer C is for the residue only. See [docs/extraction.md](docs/extraction.md) |
| 4 | ✅ **Done.** EDHREC lazy loader (disk-cached, `RECOMMENDS` edges) + Commander Spellbook `find-my-combos`. |
| 5 | ✅ **Done.** Diagnostics (Layer 4) + `/deck-lab` diagnostics tab with a live speed slider, FastAPI service, Next.js proxy route. First user-visible milestone. |
| 6 | ✅ **Three of four channels.** `edhrec_synergy` · `resource_bridge` · `combo_completion`, unioned with provenance and a multi-channel bonus. `vector_knn` deferred until Phase 8 measures whether it is needed. |
| 7 | Adds with grouping and focus ✅ · cuts and swaps ✅ · replacement with shape deltas ✅. Tune screen (frontend) and LLM synthesis outstanding. |
| 8 | ✅ **Built, and it returned a negative result.** `resource_bridge` scores 0.017 recall@25 — identical to the popularity baseline. See [docs/evaluation.md](docs/evaluation.md). |

Phases 5 and 8 are the honesty checks. Phase 5 ships something genuinely useful even if retrieval never gets good — and because the input layer and design system already exist, it is mostly diagnostics logic plus wiring. Phase 8 tells you whether the retrieval earned its keep.

---

## Stack

**Backend** (`mtg-deck-graph`): Python 3.12 · FastAPI · `neo4j` driver · `pydantic` (closed-vocab enums as the schema, enforced at extraction) · `httpx` · `pyedhrec` · `anthropic` (Haiku 4.5 + Batch API for extraction; Opus/Sonnet for synthesis) · Neo4j 5.x via Docker Compose.

**Frontend** (`nur-magic-homepage`): existing stack, no new dependencies — Next.js 13.1 pages router, React 18, `styled-components` `createGlobalStyle`, Firebase auth/Firestore. MUI is installed but the Scry design system doesn't use it; don't introduce it here. No charting library — the curve chart is CSS bars.

---

## Known risks

1. **Regression to the mean.** The LLM will happily rebuild the exact deck everyone already has. Mitigation: rank on *synergy score* (relative to baseline) rather than inclusion rate (absolute), and expose an explicit "spice" knob that penalizes high global inclusion rate. Track novelty@k as a first-class metric, not an afterthought.
2. **EDHREC endpoint instability.** Unofficial and undocumented. Cache aggressively to local disk; isolate all access behind one adapter module so breakage is a single-file fix.
3. **Extraction quality silently poisoning everything downstream.** Mitigated by the Phase 2 gate.
4. **Cold start on new sets** — this is the problem the mechanical layer exists to solve; verify it works by holding out a recent set entirely and checking that `resource_bridge` still retrieves its cards sensibly.

---

## Verification

- **Phase 0:** ✅ `npm run build` clean; `/deck-lab` SSRs with the tokens applied; `parseDeck` / `parseMoxfieldCsv` / `fetchCards` verified against live Scryfall including a double-faced card, a set+collector lookup, and a deliberate not-found entry.
- **Phase 1:** ✅ 22 tests green; live ingest loads 31,623 cards. Cypher spot-checks confirm banned cards (Black Lotus, Balance, Golos) excluded, double-faced cards keep both faces, and planeswalker commanders are detected via the "can be your commander" grant.
- **Layer 1:** extraction precision/recall against the 150-card hand-labeled set, reported per resource category.
- **Layer 2:** Cypher spot-checks — `Krark-Clan Ironworks` should `PRODUCES` artifact-mana resources and known artifact payoffs should `CARES_ABOUT artifact_etb`. Verify a 2-hop bridge query returns sane pairs for a known archetype.
- **Layer 4:** run diagnostics on 3–5 decklists you already know well and confirm the resource-balance and role-gap output matches your own read of them. This is the fastest reality check in the whole plan.
- **Phase 5 end-to-end:** paste a real Moxfield export into `/deck-lab`, confirm `parseDeck` → `fetchCards` → diagnostics renders correctly, including a deck with a commander header line and set codes. Test the CSV upload path too.
- **Layer 5:** confirm every LLM rationale traces to actual retrieval provenance rather than invention — spot-check by disabling a channel and verifying the corresponding rationales disappear.
- **Layer 6:** recall@25 and novelty@25 vs. the EDHREC popularity baseline, broken out per retrieval channel.
- **Responsive:** verify the 900px breakpoint — the sidebar collapses and `cards-grid` reflows to 135px minimum. The diagnostics tables must not overflow horizontally on mobile.
