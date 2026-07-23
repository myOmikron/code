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

The image regression tests serve `test/*-regression.html` through Vite and drive them in a real Chromium via the DevTools protocol (`test/cdp-run.mjs`), polling each page's `data-status` in real time. Real-time polling (not `--virtual-time-budget`) is required because the OCR fallback does real-time work in Tesseract's WASM worker. Pages match real card photos in `test/fixtures/` end-to-end — run them after any change to `src/imageHash.ts` or the OCR path. `printing-regression.mjs` is a shared harness for "correct printing" cases (asserts set code + collector number); it runs the full hybrid scan and **decodes fixtures via `createImageBitmap`** (matching the scan worker) rather than an `<img>` — card-edge detection is rasterization-sensitive, so this is required to reproduce the real runtime result on hard photos.

## Architecture

The core idea: a Node script precomputes perceptual signatures for every card printing from Scryfall bulk data; the browser computes the same signatures from a camera photo and matches against the index. Two implementations of the same signature algorithm must stay in lockstep:

- `scripts/build-scryfall-index.mjs` — Node/sharp implementation. Downloads Scryfall `default_cards` bulk data and card images (resumable cache in `.cache/`), computes signatures, writes the sharded index to `public/data/all-card-index/` (`manifest.json` + `routing.json` + `shards/<set>.json`, atomically republished every 25 sets).
- `src/imageHash.ts` — Browser/canvas implementation. Card-edge detection, crop normalization to 252×352, then dHash/aHash plus color/edge/title/artwork vectors and print-specific region fingerprints (set symbol, footer, The-List stamp).

**Version-bump invariant:** any change to the signature algorithm or its constants must be made in both files, and requires bumping the index version strings together: `SELECTED_INDEX_VERSION`/`ALL_INDEX_VERSION` in `scripts/build-scryfall-index.mjs` and `INDEX_VERSION` in `src/referenceIndex.ts` (currently `v14`). After bumping, the index must be rebuilt (then re-run `pnpm index:names`, since `names.json.gz` is derived from the shards and carries the same `indexVersion`). The `CACHE` version in `public/sw.js` (currently `v15`) is separate — it busts the service-worker caches and is bumped whenever cached assets must be invalidated wholesale; the shell is network-first so ordinary code deploys no longer need a bump.

Matching flow at runtime (`src/allCardIndex.ts`): load `manifest.json` + `routing.json` (network-first via the service worker), score all ~110k routes with `scoreRoute` and keep the top `ROUTE_SHORTLIST_SIZE` (1200) candidates per variant, lazily fetch only the needed set shards (cached in the PWA cache), then fully fine-rank every candidate — first identify the card via artwork/title, then disambiguate printings via the print-specific regions. Top match plus two alternatives go to the UI for confirmation. After the index loads, the worker background-prefetches all shards into memory so later scans hit a warm cache (`prefetchAllShards`).

**Perf vs. accuracy:** `hammingDistance` compares the 64-bit hashes as two 32-bit popcounts (not BigInt) — a bit-identical, free speedup that runs millions of times per scan. Approximations that *reduce* work (cheap route prefilter, smaller shortlist, shift-less/top-K fine-ranking) were tried and **reverted**: the matcher is margin-sensitive and the runtime input (worker `ImageBitmap`) differs subtly from the regression harness's `<img>`, so an approximation that passed all regression fixtures still mis-ranked a real card (Sauron) in the app. Don't reintroduce candidate-pruning speedups without a much larger labeled test set to validate recall.

Other modules:

- `src/App.tsx` — the entire UI (single file): scan/collection tabs, camera/file capture, match confirmation.
- `src/scanWorker.ts` + `src/scanClient.ts` — the heavy scan work runs off the main thread. `scanClient` is the main-thread wrapper (`loadCardIndex`, `scanImage`); the **module** worker owns the loaded index/shard cache and does image decode (`createImageBitmap`, `imageOrientation: "from-image"`), signature extraction, and perceptual matching. Because `imageHash.ts` is context-agnostic (uses `OffscreenCanvas` with a DOM-canvas fallback, guards `instanceof HTMLImageElement`), the same signature code runs in the worker and on the main thread (regression harness).
- **Hybrid OCR** (`src/hybridScan.ts`, `src/hybridDecision.ts`, `src/titleOcr.ts`, `src/nameIndex.ts`): every scan reads the **card title** with Tesseract.js and matches it against the closed vocabulary of real card names (`names.json.gz`). OCR runs on **every** scan (not just perceptual misses): a strong title read overrides even a "confident" perceptual match, because dark/low-detail art fools perceptual into a confident-wrong result (a Nazgûl matches an unrelated dark card at >0.8). `decideMatches` only lets OCR override when it *disagrees* with perceptual on the card (agreement keeps the perceptual printing). `titleOcr` feeds Tesseract **two crops** — the full title strip *and* an isolated title band (found via per-row horizontal-edge energy, excluding the artwork) — and the best name match across both wins; this rescues dark/artwork-heavy cards (Nazgûl, Lotus Field, borderless Marvel) without regressing cards the full strip already read. Cost: up to 2 OCR passes per scan, on top of always-on OCR — a deliberate correctness-over-speed trade. Name matching is **containment-based, not symmetric Dice** (fraction of the OCR fragment's bigrams found in the card name), with a minimum fragment length: a truncated-but-correct read like "Zada, Hedro" scores ~1.0 against "Zada, Hedron Grinder" instead of being penalised for the missing tail, while short garbage is gated out. OCR only overrides perceptual above `OCR_NAME_MIN` (0.85) — a clean read scores ~0.9+, garbled reads ~0.6–0.8 and must not hijack a correct-but-unconfident perceptual result. Among the identified card's printings, ones with (near-)identical artwork can't be told apart, so they're collapsed to the first; the rest are ranked by full visual similarity to pick the printing. **OCR runs on the main thread**, not in `scanWorker`: Tesseract needs `importScripts` (unavailable in a module worker), and calling it from the main thread spawns its own worker — so the OCR CPU stays off the main thread anyway. `scanClient` therefore orchestrates: worker does perceptual + (on a miss) hands back the normalized title `ImageBitmap` + signatures → main-thread OCR → worker resolves the printing from the name (`findMatchesByTitle`). `hybridScan.ts` is the single-thread reference of this flow used by the regression harness. Tesseract runtime + English model are self-hosted under `public/tesseract/` (see `pnpm ocr:assets`).
- `src/collectionStore.ts` — collection persistence in `localStorage` (stays on-device).
- `src/referenceIndex.ts` — smaller precomputed ltr/dsk index (`public/data/reference-index.json`) cached in IndexedDB; the scan UI uses the sharded all-card index instead.
- `public/sw.js` — hand-written service worker. **Network-first** for the app shell (`/`, `index.html`, navigations) so code deploys reach clients without a cache bump, and for the files that change every index build (`manifest.json`, `routing.json.gz`, `names.json.gz`); **cache-first** for hashed build assets, set shards, and the self-hosted OCR runtime under `/tesseract/`. Uses `skipWaiting()` + `clients.claim()` so an updated worker activates immediately. The `CACHE` version busts all caches when bumped.
