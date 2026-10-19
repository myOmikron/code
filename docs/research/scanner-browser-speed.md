# How fast can a browser scanner get on Mali hardware?

Research for [#100](https://github.com/myOmikron/code/issues/100) (map: #99). Researched 2026-10-19.

## Question

Which levers make today's browser scanner (`frontend/mtg/src/scanner`) substantially faster on an
ARM Mali gen-5 phone (Brave/Android) without WebGPU, how do Delver Lens, ManaBox and Dragon Shield
do it, and what is a realistic ceiling in cards per minute?

Constraint carried over from earlier work: correctness beats speed. No lever may prune candidates
in a way that changes results. Every lever that changes numbers (quantisation, input size, a
different model) has to pass the existing 100-photo regression for name (90/100) and exact
printing (67/100) before it counts.

## Short answer

- The fast path (detection ~240 ms + title OCR ~80 ms) has two cheap, evidence-backed wins: an
  OpenCV.js build with WASM SIMD and threads (the shipped build has neither, verified below), and
  Tesseract.js 5.1.1 to 7.x (15-35 % faster per its release notes). Together a frame plausibly
  drops from ~320 ms to roughly 150-200 ms.
- The DINOv2 fallback (~970 ms) can come down with the ready-made int8 export (24 MB instead of
  88 MB) and possibly a smaller input; a 5-10x drop needs a different, much smaller model that
  would have to be trained and re-validated. It only runs when OCR fails (foils, glare, non-Latin),
  so it matters for the hard cards, not for the average card.
- WebNN is not an option on Android in 2026: Android was pulled from the Chrome origin trial and
  is CPU-only there. WebGPU deserves one more cheap retry on a different kernel set (see L6).
- Per card, the machine cost is "frames until agreement" plus "verification". Verification
  fetches reference images from cards.scryfall.io at scan time; moving verification server-side
  with precomputed ORB descriptors removes that network and decode cost without pruning anything.
- Realistic ceiling for hand-fed bulk scanning with one phone: about 30-40 cards per minute,
  bounded by the human swapping cards (estimate), not by the pipeline once the levers land.
  Dedicated feeder machines advertise 30 (Roca Sifter) to 70-80 (TCG Machines) cards per minute.
- What the commercial apps do is barely documented. ManaBox's developer states its scanner
  "works by interpreting the card's artwork" and offers a set lock; Delver Lens "scans the full
  card"; Dragon Shield says "advanced image recognition". None publishes architecture or speed.

## Current pipeline, as read from the code

- Camera: `getUserMedia` up to 1920 px, 30 fps (`src/utils/use-camera.ts`). Each recognition frame
  is `createImageBitmap(video)` resized to a 1280 px long side and transferred to one worker
  (`src/components/live-scanner.tsx`, `FRAME_LONG_SIDE = 1280`). Frames are processed strictly one
  at a time (`busy` flag); a 32x32 rest check skips unchanged scenes (`scan-rest.ts`).
- Detection: OpenCV.js, the guide region is reduced to `LIVE_WORKING_SIZE = 420` before edge
  detection (`live-pipeline.ts`), Canny on luminance and HSV saturation, contour and Hough quads
  (`card-detect.ts`, `hough-quads.ts`).
- OCR: Tesseract.js 5.1.1 with a fine-tuned model on the title strip, budget 350 ms (`ocr.ts`,
  `OCR_BUDGET`). The core directory already ships the `simd-lstm` variants, so OCR already uses
  WASM SIMD.
- Embedding: DINOv2-small fp32 (`public/models/dinov2-small.onnx`, 88,532,934 bytes, the same file
  as `onnx-community/dinov2-small/onnx/model.onnx`), 224 px input, onnxruntime-web 1.27.0,
  `numThreads = min(4, hardwareConcurrency)` when cross-origin isolated (COOP/COEP are set in
  `vite.config.ts` and `deploy/mtg/traefik/dynamic.yml`). Index: 111k rows of 128 int8, exhaustive
  search in a few ms (`embedding-index.ts`).
- Decision: a printing must recur `AGREEMENT_HITS = 2` times within `AGREEMENT_WINDOW = 4` frames
  before verification runs on up to `LIVE_SHORTLIST = 6` candidates.
- Verification: ORB + homography against 488x680 reference JPEGs from `cards.scryfall.io`, plus
  a difference mask for near-identical printings (`feature-verify.ts`, `reference-images.ts`).

## Verified facts about the runtimes in use

### OpenCV.js (`@techstark/opencv-js` 5.0.0-release.1): no SIMD, no threads

Loading the installed module in Node and printing `cv.getBuildInformation()` gives:

```
Version control:   5.0.0
Baseline:          (empty)
C++ flags (Release): -s SINGLE_FILE=1 -s USE_PTHREADS=0 ... -O3 -DNDEBUG
OpenCV modules:    calib core dnn features flann geometry imgproc js objdetect photo ptcloud stereo video
Parallel framework: none
```

The embedded WASM module imports no (shared) memory, consistent with `USE_PTHREADS=0`. The package
README says the file is the upstream build downloaded from docs.opencv.org
([TechStark/opencv-js](https://github.com/TechStark/opencv-js)). So every OpenCV call today is
scalar and single-threaded. `calcOpticalFlowPyrLK`, `goodFeaturesToTrack`, `ORB` and
`findHomography` are all present in this build.

OpenCV's own build script supports `--simd` and `--threads`; threads use Web Workers and
SharedArrayBuffer and only work in the browser
([OpenCV.js setup tutorial, source](https://raw.githubusercontent.com/opencv/opencv/4.x/doc/js_tutorials/js_setup/js_setup/js_setup.markdown)).
The PR that added both measured on x86 (2019): Threshold at 1080p about 4.5x with threads, 9.5x
with SIMD, about 30x combined; a face-recognition sample went from 3 to 26 fps
([opencv/opencv#15371](https://github.com/opencv/opencv/pull/15371)). Those are best-case kernels
on desktop cores; contour following and our own JS glue do not vectorise.

### WebAssembly feature support

From the WebAssembly feature table data
([WebAssembly/website features.json](https://github.com/WebAssembly/website/blob/main/features.json)):
Chrome ships fixed-width SIMD since 91, threads since 74, relaxed SIMD since 114, JSPI since 137.
Brave follows Chromium, so all of these are available on the target phone.

### onnxruntime-web

- Multi-threading requires WASM threads and `crossOriginIsolated`; `numThreads = 0` lets ORT pick
  ([ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)).
- For CPU, ORT recommends uint8 quantised models and warns that float16 is slow on CPU
  ([ORT web performance diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html)).
- Dynamic quantisation is the recommended mode for transformers; "Arm-based processors with
  dot-product instructions can get better performance in general"; quantisation is "not a
  loss-less transformation"; the page gives no speedup figures
  ([ORT quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)).
- In 1.27.0 the `onnxruntime-web/webgpu` bundle loads `ort-wasm-simd-threaded.asyncify.wasm`
  (the native C++ WebGPU EP), while the default bundle loads `ort-wasm-simd-threaded.jsep.wasm`
  (JSEP, the TypeScript WebGPU kernels). Verified by grepping both bundles in `node_modules`. ORT
  documents these as two separate implementations of the same operators
  ([JSEP to WebGPU EP migration design](https://github.com/microsoft/onnxruntime/blob/main/docs/design/onnxruntime_web_jsep_to_webgpu_ep_migration.md)).
  So the Mali failure was measured on the native EP only.
- ORT 1.29.0 announced the deprecation of WebGL and JSEP; 1.30.0 changed subgroup handling in the
  WebGPU EP (subgroup-size control, subgroup-matrix path in WASM builds); latest is 1.31.0
  (2026-10-09) ([ORT releases](https://github.com/microsoft/onnxruntime/releases),
  [#29716](https://github.com/microsoft/onnxruntime/pull/29716)). Per-vendor WebGPU correctness
  bugs are still being reported, e.g. corrupted output on Intel Iris Xe but clean on WASM and
  Adreno ([#29807](https://github.com/microsoft/onnxruntime/issues/29807)).

### Ready-made smaller DINOv2 exports

`onnx-community/dinov2-small` ships, besides the fp32 file used today: `model_int8.onnx` /
`model_quantized.onnx` / `model_uint8.onnx` (24.4 MB), `model_fp16.onnx` (44.4 MB), `model_q4.onnx`
(16.9 MB), `model_bnb4.onnx` (15.6 MB) (Hugging Face API tree listing,
[onnx-community/dinov2-small](https://huggingface.co/onnx-community/dinov2-small/tree/main/onnx)).
The repo notes that the fp16 export failed to load; the int8 export has not been tried.

### Tesseract.js

- v7.0.0 (2025-12-15): "Upgrading from v6 to v7 reduces runtimes by ~15-35 % (depending on device
  and use-case)", with a new `relaxedsimd` build; the core release adds optimisations to the
  existing SIMD build ([tesseract.js v7.0.0](https://github.com/naptha/tesseract.js/releases/tag/v7.0.0),
  [tesseract.js-core v7.0.0](https://github.com/naptha/tesseract.js-core/releases/tag/v7.0.0)).
- v6.0.0 fixed a long-standing memory leak and reduced runtime by disabling non-text outputs by
  default ([tesseract.js v6.0.0](https://github.com/naptha/tesseract.js/releases/tag/v6.0.0)).
- The repo is on 5.1.1, so both apply.

### WebNN

Chrome's Intent to Experiment for WebNN: Android was excluded from the origin trial on 2026-02-13
because the implementation there is immature; on Android only CPU inference is supported; the
desktop trial was delayed again on 2026-02-24
([blink-dev: Intent to Experiment: WebNN](https://groups.google.com/a/chromium.org/g/blink-dev/c/5CWKSChYo98/m/9mwAcwz3AAAJ)).
ORT's WebNN EP also requires the "Enables WebNN API" flag
([ORT WebNN EP](https://onnxruntime.ai/docs/tutorials/web/ep-webnn.html)). Not usable for this app.

### Other runtimes

LiteRT.js (`@litertjs/core`) runs on XNNPACK compiled to WASM, on WebGPU, or on WebNN; PyTorch
models convert via `litert-torch`. No WebGL backend is listed
([LiteRT.js](https://developers.google.com/edge/litert/web)). For TF.js, Google reported SIMD at
1.7-4.5x over plain WASM and threads another 1.8-2.9x on top, via XNNPACK
([TF.js blog, 2020](https://blog.tensorflow.org/2020/09/supercharging-tensorflowjs-webassembly.html)).
ORT's WASM EP already has SIMD and threads, so these numbers only say how much is left on the
table if either were missing.

### Model size reference points

- MobileNetV3-Large 1.0: 219 M multiply-adds, 5.4 M parameters, 51 ms on a single Pixel 1 large
  core in TFLite (Table 3 in [Howard et al., arXiv:1905.02244](https://arxiv.org/abs/1905.02244)).
- DINOv2 ViT-S/14: 21 M parameters ([Oquab et al., arXiv:2304.07193](https://arxiv.org/abs/2304.07193)).
  At 224 px that is 256 patches + 1 token, so roughly 2 x 21 M x 257 = about 11 GFLOP (about
  5.4 G multiply-adds) per run, our estimate, ignoring attention. That is about 25x the work of
  MobileNetV3-Large, which matches 970 ms against tens of ms.

### Scryfall image CDN

"The direct file origins located at *.scryfall.io do not have rate limits"; the API itself is
limited to 10/s (2/s for search)
([Scryfall rate limits](https://scryfall.com/docs/api/rate-limits)). `normal` images are 488x680
JPG, `grid` is the same size as WEBP ([Scryfall card imagery](https://scryfall.com/docs/api/images)).

## Levers

Gains are rough. "Evidence" says where the number comes from; "estimate" means our own reasoning,
to be confirmed on the phone with the existing per-stage timings.

| # | Lever | Stage | Expected gain | Evidence | Correctness risk | Effort |
|---|---|---|---|---|---|---|
| L1 | Own OpenCV.js build with `--simd` (+ `--threads`), only the modules we use | detection 240 ms | 1.5-2.5x on detection (estimate; x86 kernels showed 9.5x SIMD, 30x combined) | build info above; opencv#15371 | none, same algorithms (re-run regression for float differences) | medium: emsdk build in CI, 13 MB file becomes ours to maintain, smaller if modules are trimmed |
| L2 | Tesseract.js 5.1.1 to 7.x, `relaxedsimd` core | OCR 80 ms | 15-35 % | v7 release notes | low; fine-tuned `.traineddata` must still load, re-run regression | low |
| L3 | DINOv2-small int8 (`model_int8.onnx`) | embedding 970 ms | 1.5-3x (estimate; ORT promises "better performance" on Arm with dot product, no figures), plus 88 to 24 MB download | ORT quantization docs; HF listing | medium: vectors shift; the index must be rebuilt with the same model, then name and printing regression | low |
| L4 | Smaller embedding input (e.g. 168 px, 144 tokens instead of 256) | embedding | about 1.8x fewer FLOPs, more for attention (estimate) | ViT arithmetic | medium-high; rebuild index, regression | low to try |
| L5 | Different embedding model (MobileNetV3/EfficientNet-class, metric-trained on Scryfall images) | embedding | 5-20x (219 M vs ~5.4 G multiply-adds) | MobileNetV3 paper | high: DINOv2 was chosen for robustness; needs training and full re-validation | high |
| L6 | Retry WebGPU on other kernels: the JSEP bundle (default import) and ORT 1.31 native EP | embedding | if it passes the existing probe, likely several-x (unmeasured) | two kernel sets in ORT; subgroup changes in 1.30 | none, the finite/unit-length probe already gates it | low |
| L7 | Pipeline two stages across two workers (detect frame N+1 while OCR/embedding runs on N) | throughput | up to ~1.5x frames per second, same latency per frame (estimate) | code: frames are strictly serial today | none | medium |
| L8 | Cheaper frame hand-off: crop to the guide and resize in `createImageBitmap`, keep full resolution only for the rectified quad | detection | tens of ms (estimate, unmeasured: copy of a 1280 px RGBA frame into the WASM heap each frame) | code | none | low; profile first |
| L9 | Verification server-side with precomputed ORB descriptors (1.8 GB is fine on a server) | verify | removes up to 6 reference fetches + decodes + ORB describes per card; leaves one upload of a rectified crop (~tens of KB) | memory note: descriptors cannot ship to the client; Scryfall CDN has no rate limit but costs a round trip per image | none, can even verify a longer shortlist at no client cost | medium-high: new endpoint, server CPU |
| L10 | Whole recognition server-side (crop upload, fp32 DINOv2 + ORB on the server) | embed + verify | client cost drops to detection + OCR + one round trip; fallback latency set by RTT instead of 970 ms | estimate | none, same models | high; needs connectivity at the table |
| L11 | Prefetch and cache references: warm the cache for the OCR-named candidates while agreement is still being collected | verify | hides one network round trip per card (estimate) | Scryfall CDN no rate limit | none | low |
| L12 | Tracking instead of re-detection (`calcOpticalFlowPyrLK` is in the build) | detection | small for bulk scanning: each new card needs a fresh detection anyway, and the rest check already skips a static scene | code | low | medium; not recommended first |
| - | WebNN | embedding | none on Android in 2026 | blink-dev intent | - | ruled out |
| - | ORT WebGL EP | embedding | deprecated in ORT 1.29 | ORT release notes | - | ruled out |
| - | Fewer agreement frames, shorter shortlist | decision | faster, but changes results | - | violates the constraint | ruled out |

Before any of this: confirm threads are really on for ORT on the phone. The embedder already
reports `wasm: N threads · isolated: true/false`; if it says 1 thread, fixing isolation in Brave
is the biggest single embedding lever (TF.js saw 1.8-2.9x from threads).

## How the commercial apps do it

What is public is thin; none of the three publishes architecture or speed figures.

- **ManaBox** (SkillDevs): the store listing only says "Scan cards with the camera" and that card
  search works offline ([App Store](https://apps.apple.com/us/app/manabox-mtg/id1460407674),
  [manabox.app](https://manabox.app/)). In a developer reply on Google Play the team states "the
  scanner works by interpreting the card's artwork" and points to a "Lock Set" setting
  ([Google Play](https://play.google.com/store/apps/details?id=skilldevs.com.manabox)). So the
  printing is chosen from artwork, and same-art reprints are a known weak spot that the user
  works around by locking the set. User reviews on the same page report wrong sets and trouble
  with black-bordered and dark cards. Whether recognition runs on-device or online is not stated.
- **Delver Lens** (Delver Lab, one developer): "Recognition scans the full card. Make sure the
  border of the card is visible to the camera", "You can put cards on a blank paper to scan
  faster", "There are different options for scanning", "The technology has limitations"
  ([Google Play](https://play.google.com/store/apps/details?id=delverlab.delverlens)). Oracle text
  works offline; whether recognition does is not stated. The border advice implies a contour
  detector like ours in front of the recogniser.
- **Dragon Shield MTG Scanner** (bundle `pt.tscg.bigarmtg`): "Instantly scan cards in any language
  using advanced image recognition" and "Real-time translation of foreign-language cards"
  ([App Store](https://apps.apple.com/app/id1460657155)). Recognising any language from the
  picture suggests artwork-based matching rather than name OCR. No architecture, speed or
  offline statement.
- **Reference points with numbers**: TCGplayer's Roca Sifter feeder is rated at 1,800 cards per
  hour (30/min) and needs a network connection ([TCGplayer](https://seller.tcgplayer.com/roca-sifter));
  TCG Machines says its sorter tops 100 cards per minute, typically 70-80
  ([TCG Machines](https://www.tcgmachines.com/blog/launch-day)). Both are mechanical feeders, so
  they bound what any phone scanner held by hand can reach.

Takeaway: all three are native apps, all match the picture, and none claims exact-printing
accuracy. Our name-first OCR plus ORB verification is already a stricter design; the
competitors' advantage is native code and GPU access, not a smarter pipeline. A native app is not
needed to close most of the speed gap (L1-L3, L6-L11 are all browser or server levers).

## Ceiling in cards per minute

Per card, machine time is roughly `frames_to_agreement x frame_time + verify_time`; wall time adds
the human swapping the card. All numbers are estimates from the code constants and the measured
stage times; verification time on the phone is not measured yet and should be.

| | frame | 2 agreeing frames | verify | machine / card | with ~1.2 s swap | cards/min |
|---|---|---|---|---|---|---|
| today, OCR path | ~320 ms + 200 ms pacing | ~0.8-1.0 s | ~0.3-0.8 s (network, unmeasured) | ~1.1-1.8 s | ~2.3-3.0 s | ~20-26 |
| L1 + L2 + L8 + L11 | ~150-200 ms | ~0.4-0.6 s | ~0.2-0.4 s | ~0.6-1.0 s | ~1.8-2.2 s | ~27-33 |
| plus L7 or L9 | | ~0.3-0.4 s | ~0.1-0.2 s | ~0.4-0.6 s | ~1.6-1.8 s | ~33-38 |
| embedding fallback cards today | ~1.3 s | ~2.6 s+ | as above | ~3-3.5 s | ~4-4.5 s | ~13-15 |

Realistic ceiling: **about 30-40 cards per minute** hand-fed, once the pipeline is under ~0.6 s per
card; beyond that the person handling cards is the limit. The 1.2 s swap time is an assumption,
worth measuring once with a stopwatch on a real stack. Getting past ~40/min would need a feeder,
which is out of scope (hardware). Foils and non-Latin cards stay slower until L3-L6 or L10 land.

## Suggested order

1. Measure: thread count line from the embedder, verify time per card, swap time. Cheap and
   decides whether L9/L11 matter.
2. L2 (Tesseract 7) and L6 (WebGPU retry on JSEP and ORT 1.31): low effort, no correctness risk.
3. L1 (OpenCV SIMD/threads build): the biggest win on the fast path.
4. L3 (int8 DINOv2) with a rebuilt index, gated by the regression.
5. L11, then L9 if verification turns out to be the long pole.

## Open questions

- Is ORT actually multi-threaded in Brave on the phone (COEP `credentialless` in Brave)?
- How long does verification take on the phone, cache hit vs miss?
- Does the fine-tuned Tesseract model load unchanged in tesseract.js-core 7?
- Does int8 DINOv2 keep name 90/100 and printing 67/100 with a matching index?
