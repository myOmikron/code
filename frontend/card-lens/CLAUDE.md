# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CardLens is a mobile-first PWA that recognizes Magic: The Gathering cards from photos using perceptual image hashing — no OCR, no backend. It lives in `frontend/card-lens` inside a pnpm-workspace monorepo (workspace root two levels up; dependencies are pinned via the workspace `catalogs` in `pnpm-workspace.yaml`). The Rust services in the monorepo are unrelated to this app. UI strings and the README are in German.

## Commands

Run from this directory (or use `pnpm --filter card-lens <script>` from the repo root):

```bash
pnpm dev                # Vite dev server, binds 127.0.0.1:4173 only
pnpm check              # tsc --noEmit
pnpm build              # tsc && vite build
pnpm test               # vitest unit tests
pnpm vitest run src/imageHash.test.ts   # single unit test file
pnpm test:image         # headless-Chromium image regression tests (needs `chromium` on PATH)
bash test/run-image-regression.sh tyvar-regression.html   # single regression page
pnpm index:build        # build the full Scryfall index (all sets, needs ~4GB heap)
pnpm index:build:sets   # small ltr,dsk index; or: node scripts/build-scryfall-index.mjs --sets ltr,dsk,woe
```

The image regression tests serve `test/*-regression.html` through Vite and assert `data-status="passed"` in the dumped DOM. They match real card photos in `test/fixtures/` end-to-end through the browser pipeline — run them after any change to `src/imageHash.ts`.

## Architecture

The core idea: a Node script precomputes perceptual signatures for every card printing from Scryfall bulk data; the browser computes the same signatures from a camera photo and matches against the index. Two implementations of the same signature algorithm must stay in lockstep:

- `scripts/build-scryfall-index.mjs` — Node/sharp implementation. Downloads Scryfall `default_cards` bulk data and card images (resumable cache in `.cache/`), computes signatures, writes the sharded index to `public/data/all-card-index/` (`manifest.json` + `routing.json` + `shards/<set>.json`, atomically republished every 25 sets).
- `src/imageHash.ts` — Browser/canvas implementation. Card-edge detection, crop normalization to 252×352, then dHash/aHash plus color/edge/title/artwork vectors and print-specific region fingerprints (set symbol, footer, The-List stamp).

**Version-bump invariant:** any change to the signature algorithm or its constants must be made in both files, and requires bumping the index version strings together: `SELECTED_INDEX_VERSION`/`ALL_INDEX_VERSION` in `scripts/build-scryfall-index.mjs`, `INDEX_VERSION` in `src/referenceIndex.ts`, and the `CACHE` version in `public/sw.js` (currently all `v14`). After bumping, the index must be rebuilt.

Matching flow at runtime (`src/allCardIndex.ts`): load `manifest.json` + `routing.json` (network-first via the service worker), use the compact routing hashes to build a ~1200-candidate shortlist across all ~110k cards, lazily fetch only the needed set shards (cached in the PWA cache), then fine-rank — first identify the card via artwork/title, then disambiguate printings via the print-specific regions. Top match plus two alternatives go to the UI for confirmation.

Other modules:

- `src/App.tsx` — the entire UI (single file): scan/collection tabs, camera/file capture, match confirmation.
- `src/collectionStore.ts` — collection persistence in `localStorage` (stays on-device).
- `src/referenceIndex.ts` — smaller precomputed ltr/dsk index (`public/data/reference-index.json`) cached in IndexedDB; the scan UI uses the sharded all-card index instead.
- `public/sw.js` — hand-written service worker: network-first for manifest/routing, cache-first for shards and shell.
