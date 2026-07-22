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
pnpm index:names        # build names.json.gz from the existing shards (cheap; run after index:build)
pnpm ocr:assets         # copy self-hosted Tesseract runtime + English model into public/tesseract/
```

Both `public/data/` (index) and `public/tesseract/` (OCR assets) are generated, not committed. A fresh checkout needs `pnpm index:build` (or `:sets`), then `pnpm index:names`, then `pnpm ocr:assets` before the scanner and its tests work.

The image regression tests serve `test/*-regression.html` through Vite and drive them in a real Chromium via the DevTools protocol (`test/cdp-run.mjs`), polling each page's `data-status` in real time. Real-time polling (not `--virtual-time-budget`) is required because the OCR fallback does real-time work in Tesseract's WASM worker. Pages match real card photos in `test/fixtures/` end-to-end — run them after any change to `src/imageHash.ts` or the OCR path. `printing-regression.mjs` is a shared harness for "correct printing" cases (asserts set code + collector number); it runs the full hybrid scan.

## Architecture

The core idea: a Node script precomputes perceptual signatures for every card printing from Scryfall bulk data; the browser computes the same signatures from a camera photo and matches against the index. Two implementations of the same signature algorithm must stay in lockstep:

- `scripts/build-scryfall-index.mjs` — Node/sharp implementation. Downloads Scryfall `default_cards` bulk data and card images (resumable cache in `.cache/`), computes signatures, writes the sharded index to `public/data/all-card-index/` (`manifest.json` + `routing.json` + `shards/<set>.json`, atomically republished every 25 sets).
- `src/imageHash.ts` — Browser/canvas implementation. Card-edge detection, crop normalization to 252×352, then dHash/aHash plus color/edge/title/artwork vectors and print-specific region fingerprints (set symbol, footer, The-List stamp).

**Version-bump invariant:** any change to the signature algorithm or its constants must be made in both files, and requires bumping the index version strings together: `SELECTED_INDEX_VERSION`/`ALL_INDEX_VERSION` in `scripts/build-scryfall-index.mjs` and `INDEX_VERSION` in `src/referenceIndex.ts` (currently `v14`). After bumping, the index must be rebuilt (then re-run `pnpm index:names`, since `names.json.gz` is derived from the shards and carries the same `indexVersion`). The `CACHE` version in `public/sw.js` (currently `v15`) is separate — it busts the service-worker caches and is bumped whenever cached assets must be invalidated wholesale; the shell is network-first so ordinary code deploys no longer need a bump.

Matching flow at runtime (`src/allCardIndex.ts`): load `manifest.json` + `routing.json` (network-first via the service worker), use the compact routing hashes to build a ~1200-candidate shortlist across all ~110k cards, lazily fetch only the needed set shards (cached in the PWA cache), then fine-rank — first identify the card via artwork/title, then disambiguate printings via the print-specific regions. Top match plus two alternatives go to the UI for confirmation.

Other modules:

- `src/App.tsx` — the entire UI (single file): scan/collection tabs, camera/file capture, match confirmation.
- `src/scanWorker.ts` + `src/scanClient.ts` — the heavy scan work runs off the main thread. `scanClient` is the main-thread wrapper (`loadCardIndex`, `scanImage`); the **module** worker owns the loaded index/shard cache and does image decode (`createImageBitmap`, `imageOrientation: "from-image"`), signature extraction, and perceptual matching. Because `imageHash.ts` is context-agnostic (uses `OffscreenCanvas` with a DOM-canvas fallback, guards `instanceof HTMLImageElement`), the same signature code runs in the worker and on the main thread (regression harness).
- **Hybrid OCR fallback** (`src/hybridScan.ts`, `src/hybridDecision.ts`, `src/titleOcr.ts`, `src/nameIndex.ts`): when perceptual matching is not confident (top similarity < 0.8 — e.g. glare/shadow misleads the artwork/colour signatures), the scan falls back to reading the **card title** with Tesseract.js and fuzzy-matching it against the closed vocabulary of real card names (`names.json.gz`), which fixes identity for hard photos. Among the identified card's printings, ones with (near-)identical artwork can't be told apart, so they're collapsed to the first; the rest are ranked by full visual similarity to pick the printing. **OCR runs on the main thread**, not in `scanWorker`: Tesseract needs `importScripts` (unavailable in a module worker), and calling it from the main thread spawns its own worker — so the OCR CPU stays off the main thread anyway. `scanClient` therefore orchestrates: worker does perceptual + (on a miss) hands back the normalized title `ImageBitmap` + signatures → main-thread OCR → worker resolves the printing from the name (`findMatchesByTitle`). `hybridScan.ts` is the single-thread reference of this flow used by the regression harness. Tesseract runtime + English model are self-hosted under `public/tesseract/` (see `pnpm ocr:assets`).
- `src/collectionStore.ts` — collection persistence in `localStorage` (stays on-device).
- `src/referenceIndex.ts` — smaller precomputed ltr/dsk index (`public/data/reference-index.json`) cached in IndexedDB; the scan UI uses the sharded all-card index instead.
- `public/sw.js` — hand-written service worker. **Network-first** for the app shell (`/`, `index.html`, navigations) so code deploys reach clients without a cache bump, and for the files that change every index build (`manifest.json`, `routing.json.gz`, `names.json.gz`); **cache-first** for hashed build assets, set shards, and the self-hosted OCR runtime under `/tesseract/`. Uses `skipWaiting()` + `clients.claim()` so an updated worker activates immediately. The `CACHE` version busts all caches when bumped.
