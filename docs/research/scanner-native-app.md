# Scanner: is a native app worth it?

Research for [#115](https://github.com/myOmikron/code/issues/115) (map: #99). Researched 2026-10-19.

Builds on two settled findings and does not redo them:

- [#100, browser speed](https://github.com/myOmikron/code/blob/research/scanner-browser-speed/docs/research/scanner-browser-speed.md):
  browser levers L1 to L11, ceiling about 30-40 cards per minute by hand, bounded by card swapping.
- [#101, server matcher](https://github.com/myOmikron/code/blob/research/scanner-server-matcher/docs/research/scanner-server-matcher.md):
  about 0.5-0.8 s per card with crop upload, about 3 GB RAM on 4 CPU cores, the real gain is
  verifying every printing.

Constraint carried over: correctness beats speed. Nothing may prune candidates in a way that changes
results, and anything that changes numbers (a different OCR engine, fp16 on a GPU, int8) has to pass
the 100-photo regression (name 90/100, exact printing 67/100) before it counts.

"Estimate" marks our own reasoning; everything else cites its source.

## Recommendation

**No native app now.** Do the browser levers from #100 and the server matcher from #101. A native
app buys speed in exactly the stage the server removes (the DINOv2 fallback) and buys little in the
stage that matters for most cards (detection plus OCR, already near the swap-bound ceiling once L1
and L2 land). It does nothing for the exact-printing rate (67/100), which is the real gap, while the
server attacks it directly. And it costs a second implementation of a pipeline whose preprocessing
must stay byte-identical with the index builder, in a second language, plus Android distribution
that tightens in 2027.

It flips if any of these turns out true (details in the last section):

1. Offline scanning without a server is a hard requirement (a table with no signal, many cards).
2. The browser levers land and measured per-card machine time is still above ~1 s on the fast path.
3. A camera control the phone's browser does not expose (checked with `getCapabilities()`) is shown
   to move the read or printing rate measurably.
4. The play group's phones turn out to make the PWA unusable in a way only native code fixes.

## What native access would buy on the target phone

The phone has an Arm 5th-gen GPU (Mali-G720/G725 class; Arm launched the architecture in 2023 with
Immortalis-G720 and Mali-G720, and the second family G925/G725/G625 in 2024,
[Arm newsroom](https://newsroom.arm.com/blog/arm-gpus-consumer-devices),
[Arm Mali-G725](https://arm.com/products/silicon-ip-multimedia/gpu/mali-g725)).

### ML inference: NNAPI is gone, LiteRT GPU goes through OpenCL

- NNAPI "was introduced in Android 8.1 ... and deprecated in Android 15". Google points to LiteRT
  (TensorFlow Lite in Google Play Services) and its GPU delegate instead
  ([NNAPI migration guide](https://developer.android.com/ndk/guides/neuralnetworks/migration-guide)).
  So NNAPI is not a target for new work.
- LiteRT's CompiledModel GPU accelerator uses OpenCL on Android: "OpenCL is used if the device
  supports it; otherwise, WebGPU is used"
  ([LiteRT benchmark docs](https://developers.google.com/edge/litert/next/benchmark)). Its GPU path
  is ML Drift, whose paper benchmarks the OpenCL backend on Arm Mali-G715 (Pixel 9) and
  Immortalis-G720 (Vivo X100 Pro) and "primarily utilizes FP16 for activations"
  ([ML Drift, arXiv:2505.00232](https://arxiv.org/html/2505.00232)). The paper has no ViT or
  image-retrieval numbers, only LLMs and Stable Diffusion.
- The classic GPU delegate lists 25 ops "in 16-bit and 32-bit float precision"; unsupported ops fall
  back to CPU and "the framework will only run a part of the graph on the GPU"
  ([LiteRT GPU delegates](https://developers.google.com/edge/litert/performance/gpu)).
- ONNX Runtime on Android has no generic GPU execution provider: NNAPI (deprecated by the OS),
  QNN (Qualcomm only), and XNNPACK for Arm CPUs, with pre-built `onnxruntime-android` packages
  ([ORT execution providers](https://onnxruntime.ai/docs/execution-providers/),
  [XNNPACK EP](https://onnxruntime.ai/docs/execution-providers/Xnnpack-ExecutionProvider.html)).
  So a native app keeps the existing `.onnx` only on the CPU; the GPU means converting DINOv2 to
  LiteRT (`litert-torch`, as noted in #100).

What this means for the Mali failure: the WebGPU bug lives in onnxruntime-web's WebGPU kernels on
Dawn (repo memory: non-finite outputs from fp32 DINOv2, every arrangement tried). LiteRT on Android
is a different kernel set on a different driver (OpenCL), so the bug probably does not carry over,
but nothing proves that DINOv2 runs correctly and fully on Mali via LiteRT either. Its default fp16
activations change the vectors, so the index would have to be rebuilt with the same runtime and the
regression rerun. Treat GPU embedding as plausible, unproven.

### Native OpenCV: NEON, threads and KleidiCV

- The shipped OpenCV.js is scalar and single-threaded (`USE_PTHREADS=0`, no SIMD baseline, verified
  in #100).
- OpenCV 4.11 for Android enables Arm's KleidiCV by default; Arm claims "up to 4x performance
  uplift" and "a typical performance uplift of 75 percent" on blur, filter, rotation and resize
  ([Arm newsroom](https://newsroom.arm.com/blog/arm-kleidicv-opencv-integration)). Vendor numbers on
  selected kernels; our detection is Canny plus contour and Hough work, which gains less.
- #101 measured native OpenCV against opencv-js on the same x86 machine: ORB detect+compute 9 vs
  16 ms, matching 1.6 vs 3.7 ms, so about 1.7-2.3x single-threaded. Peer-reviewed WASM vs native:
  "an average of 45% (Firefox) to 55% (Chrome)" slower, peaks 2.08x and 2.5x
  ([Jangda et al., USENIX ATC 2019](https://www.usenix.org/conference/atc19/presentation/jangda)).

### OCR: native Tesseract, or ML Kit

- Tesseract4Android wraps Tesseract 5.5.1 for Android, with a single-threaded and an OpenMP variant,
  and takes standard `.traineddata` files
  ([Tesseract4Android](https://github.com/adaptech-cz/Tesseract4Android)). The fine-tuned `mtg*`
  models would load unchanged (estimate: same engine major version as the training).
- ML Kit Text Recognition v2 recognises "Chinese, Devanagari, Japanese, Korean and Latin" scripts,
  about 260 KB unbundled via Play Services or about 4 MB bundled per script and architecture, and
  advises 16x16 px or more per character
  ([ML Kit v2](https://developers.google.com/ml-kit/vision/text-recognition/v2),
  [Android guide](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)). The
  docs say nothing about custom models and list no Cyrillic, so the Russian title model would have
  to stay Tesseract. ML Kit would throw away the fine-tuning work (stock `eng` read 111/185 titles
  exactly, the fine-tuned model 155/185, per the repo's OCR notes); whether ML Kit's general model
  beats the fine-tuned Tesseract on Magic's title typeface is unmeasured.

### Camera: CameraX vs getUserMedia

- CameraX `ImageAnalysis` delivers `YUV_420_888` (default) or `RGBA_8888`, with a keep-only-latest
  backpressure strategy, at a target resolution the app sets
  ([CameraX analyze](https://developer.android.com/media/camera/camerax/analyze)). It also gives tap
  to focus, torch and exposure control.
- The browser already gets up to 1920 px at 30 fps (`src/utils/use-camera.ts`), and the pipeline
  downsizes to 1280 px anyway (`FRAME_LONG_SIDE`). The repo's OCR notes record that raising the
  resolution and upscaling the strip did not raise the read rate. So full-resolution frames are not
  a demonstrated lever.
- `torch`, `focusMode`, `focusDistance` and `pointsOfInterest` are image-track constraints in the
  Media Capture spec ([MDN MediaTrackConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints));
  Chrome on Android has shipped Image Capture since 59
  ([Chrome blog](https://developer.chrome.com/blog/imagecapture)). The scanner uses none of them
  today (no `applyConstraints` or `torch` in `src/`). Whether Brave on this phone exposes them is a
  one-line check (`track.getCapabilities()`), and cheaper than an app.

## Per-stage speedups over today's WASM pipeline

All rows are estimates derived from the sources above; nothing here was measured on the phone. The
"browser after #100" column assumes L1 to L3 land.

| Stage | Today (WASM) | Browser after #100 | Native CPU | Native GPU (LiteRT) | Server (#101) |
|---|---|---|---|---|---|
| Detection | ~240 ms | ~100-160 ms (L1) | ~60-120 ms (NEON, threads, KleidiCV; 2-4x) | no (OpenCV is CPU) | stays on phone |
| Title OCR | ~80 ms | ~55-70 ms (Tesseract 7) | ~40-60 ms (WASM already SIMD; 1.3-2x) | ML Kit unknown, re-validation needed | stays on phone |
| Embedding (fallback only) | ~970 ms | ~350-650 ms (int8, L3) | ~200-450 ms (XNNPACK int8, all cores) | ~20-80 ms if the ViT runs fully on GPU (unproven on Mali) | 100-150 ms for 4 variants, plus upload |
| Verification | network bound, 0.6-0.9 s uncached | ~0.2-0.4 s (L11 prefetch) | same network cost, ORB ~2x faster | same | 15-70 ms, no downloads |

The verification row is the most important one and the least affected by native code: per card the
phone downloads 6-8 Scryfall references (#101), which a native app downloads just the same. Only the
server (precomputed descriptors) removes it.

## Does it move the cards-per-minute ceiling?

Using #100's model (`frames_to_agreement x frame_time + verify`, plus ~1.2 s swap, an assumption):

| Path | machine per card | with swap | cards/min |
|---|---|---|---|
| Browser after L1+L2+L8+L11 (from #100) | ~0.6-1.0 s | ~1.8-2.2 s | ~27-33 |
| Browser plus L7 or server verify (from #100) | ~0.4-0.6 s | ~1.6-1.8 s | ~33-38 |
| Native, fast path, client-side verify (estimate) | ~0.4-0.7 s | ~1.6-1.9 s | ~32-37 |
| Native, fast path, server verify (estimate) | ~0.3-0.4 s | ~1.5-1.6 s | ~37-40 |
| Fallback cards: browser + server (from #101) | ~0.5-0.8 s | ~1.7-2.0 s | ~30-35 |
| Fallback cards: native GPU, if it works (estimate) | ~0.5-0.8 s | ~1.7-2.0 s | ~30-35 |

Reading: on the fast path native gains a few cards per minute at most, because the 1.2 s swap
dominates once machine time is under ~0.6 s. On fallback cards (foils, glare, non-Latin) native GPU
and the server land in the same place, and the server also verifies more printings. The ceiling
stays at ~30-40 by hand in every option; past it needs a feeder, which is out of scope.

## Options compared

| Option | What it is | What it buys | Costs |
|---|---|---|---|
| TWA | The PWA in Chrome via Custom Tabs; "rendered by the user's browser, in exactly the same way"; "The host app doesn't have direct access to web content" ([Chrome docs](https://developer.chrome.com/docs/android/trusted-web-activity)) | A store listing. No native access, no speed | Play listing and verification for nothing technical; the PWA already installs |
| Capacitor with native plugins | The React app in Android System WebView, served from `https://localhost` by default ([Capacitor config](https://capacitorjs.com/docs/config)); API 24+, WebView Chrome 60+ ([Capacitor Android](https://capacitorjs.com/docs/android)); Kotlin plugins for the heavy stages | Keeps the UI; LiteRT, OpenCV, Tesseract natively behind plugins | WebView is not cross-origin isolated ("WebView does not support cross-origin isolation at all, regardless of whether web pages opt in via headers", Chromium issue 40914606 as quoted by [Hermit](https://hermit.chimbori.com/help/known-issues); a Capacitor maintainer saw the same, [capacitor#4520](https://github.com/ionic-team/capacitor/issues/4520)). So no SharedArrayBuffer, no WASM threads: the WASM pipeline gets *slower* in the shell, and every heavy stage must move to Kotlin to win anything. Frames must also cross the JS bridge unless the camera is native too |
| Kotlin app | CameraX + LiteRT + OpenCV Android + Tesseract4Android, own UI | The full native list above, in one process, no bridge | A second app: UI, auth (passkeys via Credential Manager), collection flows, API client, all duplicated |
| React Native (VisionCamera) | Native camera, JS worklets on a parallel runtime per frame ([VisionCamera Frame Output](https://visioncamera.margelo.com/docs/guides/frame-processors)) | Some React reuse; native plugins for OpenCV/LiteRT | Not the same React as the web app (no DOM, no Tailwind); still a second app plus native plugins |
| Flutter | Dart UI, platform channels or FFI for native libs | Good camera and FFI story | Nothing shared with the TypeScript codebase at all |

Effort, estimate for one person: Capacitor shell plus a native camera-and-recognition plugin about
3-5 weekends, a standalone Kotlin scanner app about 5-8, React Native or Flutter similar or more.
Maintenance is the larger cost: the scanner's correctness rests on query preprocessing being
identical to the index builder's (`embedding.ts`: a mismatch "just quietly returns the wrong card"),
which today holds by construction because both run the same TypeScript. A native pipeline is a
second implementation of crop, rectify, normalise and ORB that must be kept equal forever, or the
index must be rebuilt per runtime. The server matcher keeps that property if it reuses `src/scanner`
(#101, section 5).

## Distribution

- **Sideload / own APK**: fine for me and the play group today. Android developer verification
  starts 2026-09-30 for installs on certified devices in Brazil, Indonesia, Singapore and Thailand,
  and "Verification capability will be expanded globally for all apps on certified Android devices
  in 2027". Hobbyists get limited distribution accounts to "share apps with up to 20 devices without
  a government-issued ID or registration fee", and power users an "advanced flow" for unverified
  apps ([Android developer verification](https://developer.android.com/developer-verification)).
  A play group fits inside 20 devices, but it is one more account and process to keep alive.
- **F-Droid**: builds from source; "Apps which fail to rebuild (such as requiring Play Services)"
  are rejected and Play Services is forbidden in all apps
  ([Inclusion policy](https://f-droid.org/docs/Inclusion_Policy/)). That rules out ML Kit's
  unbundled model and Play-Services LiteRT for the main repo; bundled LiteRT and OpenCV would have to
  come from source or a trusted Maven repo.
- **Play Store**: new personal accounts need "a minimum of 12 testers who have been opted in
  continuously for at least 14 days" before production access
  ([Play Console help](https://support.google.com/googleplay/android-developer/answer/14151465)).
  Doable for a group of friends, but pure overhead for a private tool.
- **iOS**: a native Android app does nothing for iPhone users in the group; native iOS means a
  second app plus either $99 per year ([Apple Developer Program](https://developer.apple.com/programs/))
  or free provisioning profiles that "expire 7 days from issuance" on up to 3 devices
  ([Apple memberships](https://developer.apple.com/support/compare-memberships/)). The PWA and the
  server matcher serve both platforms with one codebase.

## Conditions that would flip the recommendation

1. **Offline is a hard requirement.** If bulk scanning must work at a table without connectivity and
   with unseen cards, the server path degrades to "name known, printing pending" (#101, section 6).
   A native app with LiteRT GPU embedding and a local descriptor store is then the only fast fully
   offline option, but note the descriptors are ~1.8 GB (#100, #101), so even native would have to
   ship a subset or fetch references.
2. **Measured fast path stays slow.** After L1, L2, L8 and L11, if `ScanReport.timings` on the phone
   still shows more than ~1 s machine time per card on the OCR path, native CPU (NEON, threads,
   KleidiCV) is the next lever. Test first whether ORT and OpenCV threads are really on in Brave.
3. **A camera control matters and the browser lacks it.** If `getCapabilities()` in Brave shows no
   `torch` or `focusMode`, and a test with a native camera shows glare or focus failures drop
   measurably, a thin native camera is justified. Try Chrome on the same phone before building.
4. **LiteRT on Mali is proven correct and fast for DINOv2,** and the server is off the table for
   another reason. A one-evening spike (convert, run LiteRT's `benchmark_model --use_gpu=true` on the
   phone, compare vectors against WASM fp32) would settle it cheaply if it ever matters.

None of these holds today. The goal on the map is cards per minute with exact printings, and the
cheapest path to both is browser levers for the fast path plus the server for verification and the
fallback.

## Open questions

- Do Brave and Chrome on this phone expose `torch` and `focusMode` in `getCapabilities()`?
- Does a LiteRT conversion of DINOv2-small run fully on the Mali GPU, and how far do its fp16
  vectors drift from WASM fp32?
- How does ML Kit's stock Latin recogniser compare with the fine-tuned Tesseract on the title strips?
- Is the WebView still non-isolated in current Android System WebView (check `crossOriginIsolated`
  in a Capacitor shell), should a Capacitor shell ever be revisited?
