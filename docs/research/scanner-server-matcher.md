# Scanner: what would a server-side matcher buy?

Research for [#101](https://github.com/myOmikron/code/issues/101) (map: #99). Question: what if the
phone sent crops or frames to `services/mtg` and recognition ran there? Covers upload latency,
server inference cost, index RAM/disk, offline behaviour, privacy, and a rough per-card latency
and hardware estimate against today's on-device path.

Measurements marked **[measured]** were taken for this note on an AMD Ryzen 9 5900X (12C/24T,
Linux, no GPU) on 2026-10-19 with the repo's own model and test fixtures; the method is in the
appendix. Everything else cites its source. Numbers for the phone come from the ticket and the
code comments, not from new phone measurements.

## Verdict in short

- A server matcher is cheap: one CPU, no GPU, about 3 GB of RAM for a full index including all
  ORB descriptors. Per frame the server work is roughly 100 to 200 ms on a desktop-class CPU and
  roughly twice that on a small mini-PC CPU.
- Upload is not the bottleneck: a rectified 488x680 crop is 30 to 110 KB, which is 10 to 80 ms at
  German median mobile upload rates. Only weak indoor signal (around 1 Mbit/s) makes it hurt.
- The real gain is correctness headroom, not raw speed: the server can verify every printing of a
  name (up to 898) and a much longer embedding shortlist against precomputed descriptors, instead
  of the 6 to 8 candidates the phone can afford to download from Scryfall per card.
- It also removes the per-card download of 6 to 8 reference JPEGs (about 100 KB each) from
  cards.scryfall.io, which today costs mobile data, time, and a third-party request at scan time.
- The price is that recognition needs the network. Today's path is only partly offline anyway,
  because verification needs reference images that are only cached for cards seen before.
- Estimated end to end per card: about 0.5 to 0.8 s with the server (one good frame) against about
  1 to 2 s on the phone's OCR fast path and about 2.5 to 3.5 s when the phone has to run DINOv2.
  The phone-side verification cost is the least certain number here and should be measured.

## 1. Today's on-device path (from the code)

`frontend/mtg/src/scanner/live-pipeline.ts` and `pipeline.ts`:

1. Detect card quads in the guide region (`card-detect.ts`), about 240 ms on the target phone.
2. Read the title with tesseract.js (`ocr.ts`), about 80 ms. If the name resolves and has at most
   `NAMED_WITHOUT_MODEL = 8` printings, all of them go to verification without the model.
3. Otherwise run DINOv2-small (`/models/dinov2-small.onnx`, 88.5 MB fp32, ViT-S/14 at 224 px,
   `HIDDEN_DIM = 384`) on WASM, about 970 ms, project to 128 dimensions and search the int8 flat
   index (111k x 128 int8 = 14 MB). Shortlist: `LIVE_SHORTLIST = 6`, or `NAMED_CANDIDATES = 6`
   among a long-tail name's printings.
4. Wait for `AGREEMENT_HITS = 2` frames to agree, then verify: fetch each candidate's
   `normal` image from `cards.scryfall.io` (`reference-cache.ts`: 3 concurrent, 2.5 s budget,
   32 decoded references kept in memory), compute ORB (500 keypoints) on it, ratio-test plus
   RANSAC homography, and break near ties with a difference mask (`discriminatePrintings`).

Why the descriptors are not shipped (`reference-images.ts`): 111k x 500 x 32 B is about 1.8 GB.
The service worker caches Scryfall images `CacheFirst` with `maxEntries: 3000`
(`frontend/mtg/vite.config.ts`).

Constraints a server must keep: index and query must go through byte-identical preprocessing
(`embedding.ts`: "a mismatch does not fail loudly, it just quietly returns the wrong card"), and
the index is built today in Node with onnxruntime-node from the same TypeScript.

## 2. Upload latency of a card crop

### Payload size [measured]

Real phone photos from `frontend/mtg/test/fixtures/`, resampled to the rectified size 488x680
and encoded with OpenCV 5.0.0:

| Photo | Source size | crop JPEG q80 | crop JPEG q90 | crop WebP q80 | full frame, long side 1280, JPEG q80 |
|---|---|---|---|---|---|
| inspired-charge | 1152x2048 | 49 KB | 74 KB | 29 KB | 112 KB |
| loki-god-of-mischief | 1152x2048 | 51 KB | 76 KB | 31 KB | 113 KB |
| tyvar-dsk-0408 | 720x1280 | 43 KB | 68 KB | 29 KB | 122 KB |
| sauron-ltr-0821 | 960x1280 | 76 KB | 111 KB | 63 KB | 241 KB |
| zada-hedron-grinder | 960x1280 | 88 KB | 127 KB | 79 KB | 313 KB |

So a crop is 30 to 110 KB and a downscaled frame 110 to 310 KB. For comparison, a Scryfall
`normal` reference is 84 to 113 KB [measured, 6 random cards].

### Link rates

- Ookla Speedtest Global Index, Germany, August 2026: mobile median 305 Mbit/s down,
  **44.1 Mbit/s up**, 20 ms latency; fixed broadband median 204 down, **67.2 up**, 21 ms.
- Opensignal Germany Mobile Network Experience, November 2025 (data July to September 2025),
  "Upload Speed Experience" which measures typical real-app use rather than speed tests:
  **Telekom 13.2, O2 11.1, Vodafone 10.8 Mbit/s**.

### Transfer time for a 60 KB crop (480 kbit)

| Link | Serialisation | Plus one RTT on a warm HTTP/2 connection |
|---|---|---|
| Wi-Fi to a host in the same LAN (assume 100 Mbit/s up) | 5 ms | about 10 ms |
| Mobile, Ookla median 44 Mbit/s | 11 ms | about 30 to 40 ms |
| Mobile, Opensignal typical 11 to 13 Mbit/s | 40 ms | about 60 to 80 ms |
| Weak indoor signal, 1 Mbit/s (assumption, no source) | 480 ms | about 0.5 to 0.6 s |

A full frame is 2 to 5 times that. A cold connection adds TCP plus TLS 1.3 handshakes (about two
more RTTs), so the client should keep one connection open for a scanning session. Response
payloads are tiny (a printing id and a few scores).

Data volume for a 500-card bulk session: about 30 MB up with crops, against roughly 500 x 7 x
100 KB = 350 MB down today if the reference images are not cached.

## 3. Server inference cost

### Embedding: DINOv2-small [measured]

The repo's `dinov2-small.onnx`, onnxruntime-node 1.27.0, CPU execution provider, input 1x3x224x224:

| intra-op threads | batch 1, ms per image | batch 8, ms per image |
|---|---|---|
| 1 | 130.5 | 117.8 |
| 2 | 74.6 | 63.9 |
| 4 | 48.9 | 37.1 |
| 8 | 42.8 | 25.6 |

(The machine was not idle, so these are upper bounds.) Compare about 970 ms on the phone on WASM.
On the server it is affordable to embed all four crop variants of a frame (two insets, upright and
upside down) in one batch of 4 for roughly 100 to 150 ms, instead of one variant per frame as the
live pipeline does now (`VARIANTS` in `live-pipeline.ts`).

Compute size: the timm card for `vit_small_patch14_dinov2.lvd142m` gives 22.1 M parameters and
46.8 GMACs at 518x518. Scaling the token count to 224 px (257 tokens instead of 1370) gives about
6 GMACs (about 12 GFLOP) per image, close to DeiT-S's 4.6 GFLOP at 196 tokens. A GPU would run
that in a few milliseconds, but at 25 to 50 ms on CPU the GPU buys little per scan. It would help
rebuilding the 111k index (about an hour of inference today, per the comment in
`pipeline.ts`), which is a batch job.

### ORB and verification [measured]

OpenCV 5.0.0 (opencv-python-headless), single thread, 488x680 grey, 500 keypoints:

| Step | native | opencv-js WASM in Node (same machine) |
|---|---|---|
| ORB detect + compute | 8.9 to 9.6 ms | 16.3 ms |
| BFMatcher Hamming knn k=2, 500 x 500, plus ratio test | 1.6 ms | 3.7 ms |
| findHomography RANSAC, true pair (74 good matches) | 0.25 ms | |
| findHomography RANSAC, wrong pair (18 matches) | 10.9 ms (runs to max iterations) | |
| JPEG decode of a 488x680 reference | 0.9 ms | |

With precomputed reference descriptors the server only computes ORB for the query crop(s), then
pays about 2 ms per candidate plus RANSAC on the ones that pass the ratio test. A minimum match
count before RANSAC (the code already has `MIN_MATCHES = 8`; raising it would skip most wrong
pairs) keeps wrong pairs cheap.

- 20 candidates: about 20 ms query ORB + 20 x (1.6 to 12) ms = 50 to 260 ms on one thread,
  15 to 70 ms on four.
- All 898 printings of the longest-tailed name: 898 x 1.6 ms = about 1.4 s on one thread,
  about 0.2 s on eight. For comparison, a single faiss `IndexBinaryFlat` query of 500
  descriptors against all 449k descriptors of those printings took 273 ms on one thread.

### Flat embedding search [measured]

faiss `IndexFlatIP`, one thread, 111k rows: 128-d float 2.3 ms per query, 768-d float 18.6 ms.
No ANN index is needed at this size, which matches the reasoning in `embedding-index.ts`.

### Small host scaling (estimate)

PassMark: Intel N100 single thread 1880, multithread 5305; Ryzen 9 5900X single thread 3465,
multithread 38885. A 4-core N100-class mini PC should be about 2x slower per thread than the
numbers above, so roughly 100 ms per embedding and 0.2 to 0.4 s of server work per frame. Not
measured.

## 4. RAM and disk for a full index

| Part | Size | Notes |
|---|---|---|
| Embedding vectors, today's packing 111k x 128 int8 | 14 MB | as shipped to the phone |
| Embedding vectors, full 111k x 768 float32 | 325 MiB | no PCA loss; flat search 19 ms |
| HNSW over 768-d float, faiss formula `d*4 + M*2*4`, M=32 | about 370 MB | not needed at 111k rows |
| ORB descriptors 111k x 500 x 32 B | 1.78 GB | faiss binary flat stores `d/8` = 32 B per descriptor |
| ORB keypoint positions 111k x 500 x 2 float32 | 0.44 GB | needed for the homography |
| faiss `IndexBinaryHNSW` M=16 over all 55.5M descriptors | +128 B each, about 7 GB more | not useful: verification is per candidate, not a global descriptor search |
| Reference JPEGs for the difference mask, `normal` | about 11 GB disk | 111k x about 100 KB; decoded only for ties |
| Model | 88.5 MB | fp32 ONNX |

Descriptors plus keypoints (about 2.2 GB) can be one flat file, memory-mapped, indexed by row,
so the page cache holds whatever is hot and a host with 4 GB free for this service is enough.
hnswlib's own guidance (memory "roughly `M * 8-10` bytes per stored element" on top of the data)
leads to the same conclusion: an ANN graph is overhead without a benefit at this row count.

## 5. Implementation fit

- **Rust**: the `ort` crate (docs for 2.0.0-rc.14) wraps ONNX Runtime and exposes execution
  providers such as CUDA, TensorRT and OpenVINO; its linking page documents static linking from
  a self-built ONNX Runtime. `services/mtg` is a static `x86_64-unknown-linux-musl` build
  (`services/mtg/Dockerfile`); whether a prebuilt ONNX Runtime exists for musl was not confirmed
  from the docs, and OpenCV from Rust (the `opencv` crate binds the C++ library) would add a
  native build dependency too. Doing it inside the musl webserver is the hardest option.
- **Sidecar**: the stack already runs a Python sidecar (`services/mtg-graph`, uv on Debian slim,
  reached as `http://graph:8000`). onnxruntime + opencv-python-headless + faiss-cpu is exactly
  the stack measured here.
- **Node sidecar reusing `src/scanner`**: the strongest correctness argument. The index builder
  already runs the app's TypeScript preprocessing under onnxruntime-node, so a Node service
  sharing `embedding.ts`, `card-detect.ts` and `feature-verify.ts` keeps query and index
  arithmetic identical by construction. Cost: opencv-js is about 1.7 to 2.3x slower than native
  OpenCV (table above), which is still well inside budget.

## 6. Offline behaviour

- Today: detection, OCR, model and index are local, but verification fetches reference images
  from cards.scryfall.io, and only cards whose candidates are in the service worker cache (up to
  3000 images) can be verified offline. A first scan of an unseen card offline already degrades
  to an unverified answer or none.
- Server path: no network means no recognition. Mitigation: store crops (30 to 110 KB each) in
  IndexedDB and match them when the connection returns. The Background Synchronization API can
  defer that to the service worker, but MDN marks it "limited availability" (not Baseline), so it
  has to be a progressive enhancement; a queue drained while the app is open works everywhere.
- Hybrid: keep on-device detection and OCR for instant name feedback and the capture gate, and
  ask the server only for the exact printing. Offline that degrades to "name known, printing
  pending", which fits bulk scanning into a queue.

## 7. Privacy

- A rectified crop contains the card and little else. A full frame can contain hands, faces,
  rooms; under GDPR Art. 4(1) images of an identifiable person are personal data, so sending
  frames is a step up from crops. Prefer crops and do not persist them beyond the request (or the
  offline queue).
- The host is self-run (`deploy/`, TLS via traefik), so crops do not leave infrastructure the
  operator controls.
- Today's path sends a request per candidate printing to cards.scryfall.io at scan time, which
  reveals the user's IP and which cards they are scanning to a third party. A server with a local
  copy of the references removes that. Scryfall states that "The direct file origins located at
  *.scryfall.io do not have rate limits", so mirroring the `normal` images once for the server is
  allowed by its API docs (images remain Wizards of the Coast copyright under the Fan Content
  Policy, as Scryfall's footer notes).

## 8. End-to-end latency per card

Per card means from a steady card in the guide to an answer. Phone numbers from the ticket;
server numbers from section 3 on the 5900X, doubled for an N100-class host in brackets.

| Step | On device, OCR fast path | On device, model path | Server, crop upload |
|---|---|---|---|
| Detect on phone | 240 ms | 240 ms | 240 ms (keeps the guide and capture gate) |
| OCR on phone | 80 ms | 80 ms | 80 ms optional, as a hint |
| Embedding | skipped | 970 ms | 100 to 150 ms for 4 variants (200 to 300) |
| Frames needed before verification | 2 (`AGREEMENT_HITS`) | 2 | 1 is plausible, since the server verifies every frame |
| Encode and upload crop, response | none | none | 30 to 100 ms on Wi-Fi or typical mobile |
| Reference images | 6 to 8 x about 100 KB from Scryfall, about 0.3 s each, 3 concurrent: 0.6 to 0.9 s uncached, 0 cached | same | 0 (local, precomputed) |
| ORB on references and matching | not measured on the phone; estimate 30 to 100 ms per reference from the WASM numbers | same | 15 to 70 ms for 20 candidates on 4 threads (30 to 140) |
| **Total, rough** | **about 1 to 2 s** | **about 2.5 to 3.5 s** | **about 0.5 to 0.8 s** (0.7 to 1.1 s) |

Caveats: the on-device verification cost is the least certain number. `ScanReport.timings`
already records `verify` per scan; reading it from live sessions on the Mali phone would replace
the estimate. Cards per minute in bulk scanning also include the time to swap cards, so beyond
about one second per card a faster matcher moves throughput less than a lower error rate does.

## 9. Hardware needed

- CPU: 4 modern x86 cores (an N100-class mini PC is enough for one scanner at a time; a desktop
  core count serves a play group scanning in parallel). No GPU for serving.
- RAM: about 3 GB for the matcher (vectors 0.3 GB, descriptors plus keypoints 2.2 GB mmapped,
  model and runtime a few hundred MB), on top of the existing stack.
- Disk: about 2.5 GB for vectors and descriptors, plus about 11 GB if reference images are kept
  locally for the difference mask (they could also be fetched on demand for ties only).
- A GPU only for the offline index rebuild, if an hour of CPU inference per rebuild is too long.

## 10. What it buys, concretely

1. **More candidates verified**, which is the lever on exact printing (67/100 today against
   90/100 for the name): the shortlist can grow from 6 to 20 or more, and long-tail names can be
   verified across all their printings instead of the top 6 by embedding.
2. **Better embeddings**: full 768-d float vectors instead of 128-d int8, and all four crop
   variants per frame instead of one, at no phone cost.
3. **No Scryfall at scan time**: no per-card reference downloads (about 0.7 MB per new card on
   mobile data), no third-party request, no failure when the CDN is slow.
4. **Faster on the target phone**, mainly by removing the 970 ms model run and the reference
   downloads.

Against: an online dependency for exact printing, a new service to build and run, and a
preprocessing equivalence that must be guaranteed (best: share the TypeScript).

## Appendix: how the measurements were taken

Scripts lived in the session scratchpad and are not committed.

- Embedding: Node 26 with the repo's `onnxruntime-node` (1.27.0), `InferenceSession` on
  `frontend/mtg/public/models/dinov2-small.onnx` with `executionProviders: ["cpu"]` and
  `intraOpNumThreads` 1/2/4/8, random input of the model's range, 3 warm-up runs, mean of 20
  (batch 1) or 5 (batch 8) runs.
- ORB and encode sizes: Python venv with `opencv-python-headless` 5.0.0, `cv2.setNumThreads(1)`,
  fixture photos resized to 488x680 with `INTER_AREA`, `ORB_create(500)`, `BFMatcher(NORM_HAMMING)`
  knn k=2, ratio 0.78, `findHomography(RANSAC, 4)`, mean of 50 runs.
- WASM comparison: the repo's `@techstark/opencv-js` under Node with `sharp` for decoding, same
  parameters, mean of 20 runs.
- Index search: `faiss-cpu` 1.15.1, `omp_set_num_threads(1)`, random unit vectors.
- Scryfall image sizes and fetch times: 6 random cards via `api.scryfall.com/cards/random`,
  `normal` image fetched with curl from this machine (0.28 to 0.32 s total each).

## Sources

- Repo: `frontend/mtg/src/scanner/{pipeline,live-pipeline,embedding,embedding-index,embedder,feature-verify,reference-images,reference-cache}.ts`,
  `frontend/mtg/vite.config.ts`, `services/mtg/Dockerfile`, `services/mtg-graph/Dockerfile`, `deploy/mtg/compose.yml`.
- Ookla Speedtest Global Index, Germany (August 2026): https://www.speedtest.net/global-index/germany
- Opensignal, Germany Mobile Network Experience Report, November 2025:
  https://insights.opensignal.com/reports/2025/11/germany/mobile-network-experience
- Scryfall API, rate limits: https://scryfall.com/docs/api/rate-limits
- Scryfall API, card imagery (sizes, `normal` 488x680 JPG): https://scryfall.com/docs/api/images
- timm model card `vit_small_patch14_dinov2.lvd142m`: https://huggingface.co/timm/vit_small_patch14_dinov2.lvd142m
- DeiT paper (DeiT-S 4.6 GFLOPs at 224): https://arxiv.org/abs/2012.12877
- faiss, Guidelines to choose an index (HNSW memory formula, Flat): https://github.com/facebookresearch/faiss/wiki/Guidelines-to-choose-an-index
- faiss, Binary indexes (bytes per vector, `BHNSW16` overhead): https://github.com/facebookresearch/faiss/wiki/Binary-indexes
- hnswlib, ALGO_PARAMS.md (memory per element vs M): https://github.com/nmslib/hnswlib/blob/master/ALGO_PARAMS.md
- ort crate docs: https://ort.pyke.io/ and https://ort.pyke.io/setup/linking
- MDN, Background Synchronization API: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- GDPR Art. 4 (definitions): https://eur-lex.europa.eu/eli/reg/2016/679/oj
- PassMark, Intel N100: https://www.cpubenchmark.net/cpu.php?cpu=Intel+N100&id=5157
- PassMark, AMD Ryzen 9 5900X: https://www.cpubenchmark.net/cpu.php?cpu=AMD+Ryzen+9+5900X&id=3870
