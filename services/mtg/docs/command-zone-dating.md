# Command Zone Dating

"Commander Tinder" for the mtg app, mobile-first. Swipe through Commanders; the
Commander swipes back. A joke on top, real Commander discovery underneath.
Builds on `feat/advisor-unified` (move gallery, card profiles).

Design settled in a grilling session on 2026-11-17. Phase 1 is built on
`feat/command-zone-dating`. Still open in phase 1:

- tuning `MATCH_THRESHOLD` (`services/mtg-graph/src/deck_lab/dating.py`) to about 30% rejections
  from stored scores:
  `SELECT avg((status = 'Rejected')::int) FROM dating_swipe WHERE status IN ('Matched', 'Rejected') AND NOT super_like`
- the bio has no typical deck price: no source has one

## Rules that hold everywhere

- **Never a gate.** Every rejection or unmatch offers **No, come back**. Building is never blocked.
- **Honest reasons.** A rejection names a gap we measured in the player's profile, so the joke is also advice.
- **No "Tinder" in the UI** (trademark). The name lives only in the Release note joke.
- Logged-in players only. Mobile-first, desktop works with ♥/✕ buttons and ←/→.
- Each phase ships a Release note fragment.

## Phase 1: swiping and matches

**Pool.** Commanders whose EDHREC data is in the graph (`has_recommendations`).
A scheduled weekly `deck-lab warm-edhrec --top 1000` keeps it full; today the warm is
manual. Cold Commanders stay out until warmed: without their EDHREC page they have no
interests, salt or typical deck price.

**Stack order.** Popularity-weighted random, not by compatibility (or everything
matches). An occasional "Your type" card. Optional color filter.

**Card.** Art crop full-bleed, name, color pips, three **interests** (the Commander's
top EDHREC tags mapped onto our themes). Tap opens the bio: oracle text, popularity,
Commander price, typical deck price.

**Gestures.**

| Gesture | Effect |
|---|---|
| Left | Pass, permanent per user. Reset in settings. |
| Right | Like. The Commander answers with match or rejection. |
| Up | Super like: guaranteed match, one per day. Commanders only. |
| Rewind | Undo the last swipe, free. |

**The Commander swipes back.** It compares its preferences with the player's
**profile**:

- themes the player's decks play (`/diagnostics` per deck)
- colors, bracket, budget (`DeckSummary.price_eur`)
- salt: the average EDHREC salt of the player's Commanders (EDHREC pages carry no per-card salt)
- collection overlap with the Commander's `RECOMMENDS` cards: a bonus, never required

Target rejection rate among likes is about 30%, with the threshold measured against
real profiles, not guessed.

**Profile.** A server-side snapshot, rebuilt on opening when a deck changed since. Players
without decks fill a 3-question dating profile (colors, bracket, budget); deck
signals override it. "My dating profile" shows the player how Commanders see them.
It is private.

**Lines.** `frontend/mtg/src/assets/dating-lines/{en,de}.json`, keyed by card name, loaded lazily per
language: tagline, two match, two rejection and one comeback line per Commander. Written offline with an LLM for about the top 100 Commanders,
reviewed, committed as de and en locale files. Several variants per situation:
match, rejection per dimension (themes, salt, bracket, budget, colors), unmatch,
"No, come back". Every other Commander uses generic templates. No runtime LLM. German
terms follow `german-magic-terms.md`.

**Lists.** *Matches* and *Shot your shot* (liked but rejected, still buildable).
Both offer **Start a deck**: it creates the deck with the Commander in the Commander
zone, then asks how to build it. Phase 1 has only **Just build** (the normal deck page).
A match can start several decks. Unmatch moves an entry to *Shot your shot*.

**Entry.** A `/home` tile and a menu entry.

**UI.** Variant A of the mockup canvas (https://claude.ai/artifact/6T2bi4NuZJoUvNDxeSUbgw):

- full-bleed art card, with the next card peeking behind
- LIKE/PASS stamps while dragging
- color filter pips under the header
- bio as a bottom sheet on tap
- action row: rewind, pass, super like, like
- match and rejection as full-screen overlays; a rejection shows the measured gap as a chip

The mockup's markup is reference only; the build uses the shared components.

## Phase 2: Plan a date, then card swiping

Built on `feat/command-zone-dating`. A date is stored per deck (`dating_date`) so it can be
resumed; "That's all, date night" ends it early on the player's turn. Support tiers come from
the share of the Commander's 200 most-included recommended cards that fit a theme
(`SUPPORT_HIGH` 0.12, `SUPPORT_MID` 0.06 in `dating.py`). Card swiping is an overlay on the
advisor route (`?swipe=true`), opened from its header or after a date.

**Plan a date.**
- The Commander brings its interests, the player brings the profile's themes.
- They alternate picks, three each. Each pick sets one theme's `ThemeLevel` (avoid, light, core, all-in).
- A **chemistry meter** drops when the player sets a top interest to avoid, or goes all-in on a theme the Commander does not support. It rises on picks that line up.
- At zero the Commander unmatches. The deck stays; "No, come back" restores the match.
- The result is the deck's advisor theme levels.

**Card swiping** is the advisor's general swipe mode, built once:
- The stack is the advisor's suggestions. Each card shows its image, reason, impact badges and price.
- Right adds the card. Left puts it on the deck's `settings.ignored`. Rewind undoes the last swipe.
- The player can leave and resume from the advisor. An empty stack lands on the deck page.

## Phase 3: Blind Date

Built on `feat/command-zone-dating`: graph `/dating/blind` (proxied, rate limited like `/fill`)
rolls the themes, fills at the profile's bracket and returns lands plus the highest-inclusion
picks (theme fits first) until 35 slots are open; the frontend files them, writes the theme
levels and bracket, and reveals. A busy solver is retried quietly, up to eight times.

- It rolls theme levels within the Commander's own EDHREC themes, weighted by deck counts, at the profile's bracket. The themes stay hidden until the reveal.
- One `/fill` per date: up to 10 s, 3 concurrent fills service-wide, 429 when busy. The player sees "your date is getting ready…" while it retries quietly.
- **Certain** cards are added automatically: lands, plus cards that fit the rolled themes *and* appear in a high share of the Commander's EDHREC decks. The cut-off is measured so about 30–40 cards are left to swipe.
- Card swiping (phase 2) finishes the deck.

## Pointers

- Commander facts: `Card.can_be_commander`, `edhrec_rank`, `color_identity`
  (`services/mtg-graph/src/deck_lab/models.py`). The closest list endpoint today is `POST /search`
  with `is:commander`.
- EDHREC tags: `parse_taglinks`, `THEME_TAG_SLUGS` (`edhrec.py`). No endpoint returns them yet.
- Art: `PrintingModel.image_art_crop` (`services/mtg/src/models/printing/db.rs`).
- Collection: `collection_stock` (`services/mtg/src/models/collection/stock.rs`).
- Theme levels: `ThemePrefs.levels` (`services/mtg/src/models/deck/advisor.rs`).
- Gestures: `motion` drag, as in `frontend/mtg/src/components/goldfish-card.tsx`.
