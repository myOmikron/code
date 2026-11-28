# Fast card recognition for the scanner

Research note for a possible overhaul of the `frontend/mtg` scanner. The trigger was a Reddit post on r/freemagic whose author says they trained a face-recognition-style model that recognises the exact printing of a Magic card locally at around 50 cards per second; the demo video seemed to show cards recognised while only partly in frame. This note tries to find what that is, which techniques give fast recognition of partly visible cards, what actually runs in a phone browser at that speed, and what training on Scryfall imagery involves. It ends with options for this scanner, framed as changes to the pipeline that exists today.

Every statement below is marked:

- **Verified**: stated by the cited primary source (docs, code, paper, model card), read on 2026-11-28.
- **Author claim**: a number or capability its owner publishes but nobody here has reproduced.
- **Inference**: this note's own reasoning; the reason is given.

Numbers about the current scanner come from its own harnesses (`pnpm scan:verify`, `scan:deck`, `test/live-timing.ts`), measured during the August 2026 rewrite on the target phone (ARM Mali gen-5, Brave on Android).

## Sources

| Short name              | Document                                                                                          | Where                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post                    | "I trained the fastest, most accurate ..." (title from the URL slug), r/freemagic, post `1xznjkr` | https://www.reddit.com/r/freemagic/comments/1xznjkr/i_trained_trained_the_fastest_most_accurate/                                                        |
| dhv-embed               | dhvazquez, "MTG Card Identification Model", Hugging Face model card, files dated 2026-05-21       | https://huggingface.co/dhvazquez/mtg_card_identification_embeddings                                                                                     |
| dhv-embed-train         | Training repo for dhv-embed (`scripts/_dataset.py`, `scripts/preprocess.py`)                      | https://github.com/diegovazquez/mtg_train_card_identification_embeddings                                                                                |
| dhv-pose                | dhvazquez, "MTG Card Pose Estimation: Round 4b", Hugging Face model card, 2026-05-19              | https://huggingface.co/dhvazquez/mtg_card_pose_estimation                                                                                               |
| dhv-pose-train          | Training repo for dhv-pose, incl. `web/app.js` browser demo                                       | https://github.com/diegovazquez/mtg_train_card_pose_estimation                                                                                          |
| dhv-data                | Synthetic dataset generator (Blender, Scryfall) and the published dataset                         | https://github.com/diegovazquez/mtg_synthetic_dataset_generator, https://huggingface.co/datasets/dhvazquez/mtg_synthetic_large_dataset                  |
| art-index               | neotoxicfr, "mtg-scanner-art-index", perceptual hash index per illustration                       | https://github.com/neotoxicfr/mtg-scanner-art-index                                                                                                     |
| hj3yoo                  | hj3yoo, "MTG Card Detector" (YOLO, then contours + pHash), 2018                                   | https://github.com/hj3yoo/mtg_card_detector                                                                                                             |
| ORT Web README          | onnxruntime-web 1.27.0 package README, compatibility table                                        | https://unpkg.com/onnxruntime-web@1.27.0/README.md                                                                                                      |
| ORT WebGL ops           | onnxruntime-web 1.27.0 WebGL operator list                                                        | https://unpkg.com/onnxruntime-web@1.27.0/docs/webgl-operators.md                                                                                        |
| ORT env                 | ONNX Runtime docs, "Environment flags and session options"                                        | https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html                                                                            |
| ORT perf                | ONNX Runtime docs, "Performance diagnosis"                                                        | https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html                                                                                    |
| TFJS platform           | TensorFlow.js guide, "Platform and environment"                                                   | https://www.tensorflow.org/js/guide/platform_environment                                                                                                |
| LiteRT.js               | Google AI Edge, "LiteRT for Web"                                                                  | https://developers.google.com/edge/litert/web                                                                                                           |
| MediaPipe embedder      | MediaPipe Image Embedder, web guide                                                               | https://developers.google.com/edge/mediapipe/solutions/vision/image_embedder/web_js                                                                     |
| EfficientNet-Lite       | tensorflow/tpu, EfficientNet-Lite README                                                          | https://github.com/tensorflow/tpu/tree/master/models/official/efficientnet/lite                                                                         |
| DINOv2                  | facebookresearch/dinov2 README; paper arXiv:2304.07193                                            | https://github.com/facebookresearch/dinov2, https://arxiv.org/abs/2304.07193                                                                            |
| ArcFace                 | Deng et al., "ArcFace: Additive Angular Margin Loss" (incl. sub-center ArcFace)                   | https://arxiv.org/abs/1801.07698                                                                                                                        |
| Random Erasing          | Zhong et al., "Random Erasing Data Augmentation"                                                  | https://arxiv.org/abs/1708.04896                                                                                                                        |
| Cutout                  | DeVries and Taylor, "Improved Regularization ... with Cutout"                                     | https://arxiv.org/abs/1708.04552                                                                                                                        |
| SuperPoint              | DeTone et al.                                                                                     | https://arxiv.org/abs/1712.07629                                                                                                                        |
| LightGlue               | Lindenberger et al.; ONNX port by fabio-sim                                                       | https://arxiv.org/abs/2306.13643, https://github.com/fabio-sim/LightGlue-ONNX                                                                           |
| XFeat                   | Potje et al., paper and repo                                                                      | https://arxiv.org/abs/2404.19174, https://github.com/verlab/accelerated_features                                                                        |
| LoFTR                   | Sun et al.                                                                                        | https://arxiv.org/abs/2104.00680                                                                                                                        |
| MobileSAM, EfficientSAM | Zhang et al.; Xiong et al.                                                                        | https://arxiv.org/abs/2306.14289, https://arxiv.org/abs/2312.00863                                                                                      |
| Ultralytics             | YOLO11 and segmentation docs                                                                      | https://docs.ultralytics.com/models/yolo11/, https://docs.ultralytics.com/tasks/segment/                                                                |
| Scryfall API            | "API Documentation" (use of data and images), "Rate Limits", "Card Imagery", "Bulk Data"          | https://scryfall.com/docs/api, https://scryfall.com/docs/api/rate-limits, https://scryfall.com/docs/api/images, https://scryfall.com/docs/api/bulk-data |
| Fan Content Policy      | Wizards of the Coast Fan Content Policy                                                           | https://company.wizards.com/en/legal/fancontentpolicy                                                                                                   |

## The current scanner, as the baseline

Read from `frontend/mtg/src/scanner/`. The chain is documented at the top of `pipeline.ts` and `live-pipeline.ts`.

| Stage            | Implementation                                                                                                                                                      | Cost on the target phone                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Detect           | OpenCV.js contours plus Hough quads, border-contrast gate on luminance and saturation (`card-detect.ts`, `hough-quads.ts`), rectified to Scryfall `normal` geometry | ~240 ms per live frame (553 ms on a 12 MP still)              |
| Read title       | Tesseract fine-tuned on card typefaces, `--psm 13`, matched against 35k names (`ocr.ts`)                                                                            | ~80 ms                                                        |
| Embed (fallback) | DINOv2-small fp32 ONNX (`/models/dinov2-small.onnx`, from `onnx-community/dinov2-small`), 224 px, CLS plus patch mean = 768 d (`embedder.ts`, `embedding.ts`)       | ~970 ms on WASM; WebGPU returns non-finite values on this GPU |
| Search           | PCA to 128 d, int8, flat exhaustive over 111k printings, 14 MB (`embedding-index.ts`)                                                                               | a few ms                                                      |
| Verify           | ORB plus homography against reference images fetched from `cards.scryfall.io`, then a difference mask between near-tied printings (`feature-verify.ts`)             | network bound                                                 |

Measured quality (100 photos of a sleeved deck against the full index): name 90/100, exact printing 67/100; with a perfect shortlist the verify chain scores 100/100. ORB inliers separate cleanly: correct printing around 156, same-art reprints 86 to 117, unrelated cards 4 to 6.

Two properties of this baseline frame everything below.

1. **The slow part is one model, and it only runs when OCR fails.** A frame on the OCR path costs ~320 ms; the embedding path ~1400 ms. A faster recogniser buys most on frames whose title is not legible.
2. **Detection requires a whole card.** The border-contrast gate demands a consistent edge along the full outline, and the quad must have card aspect. **Inference**: a card with one corner under a thumb or another card cannot produce a quad, so no change to the embedding model alone can make partly visible cards work. Partial visibility is a detection and matching problem first.

## 1. The Reddit project

The canonical post is https://www.reddit.com/r/freemagic/comments/1xznjkr/i_trained_trained_the_fastest_most_accurate/ (resolved from the share link `reddit.com/r/freemagic/s/zaHBLJsWdQ`), crossposted to https://www.reddit.com/r/TCG/comments/1xzo1kq/. Reddit refused every automated read from this environment, so the post text comes from phone screenshots the user supplied on 2026-11-28. The post links the app's site, https://app.mtgscan.org/, which states the architecture; its homepage, [roadmap](https://app.mtgscan.org/roadmap) and [privacy page](https://app.mtgscan.org/privacy) were read on 2026-11-28.

### What it is

**CardVision**, a free native app (Swift on iOS with Core ML, Kotlin on Android), by an independent developer, App Store version 0.2.0 since 19 November 2026, Android APK test from 1 December 2026. Not open source: neither the post nor the site mentions code or model weights. ([homepage](https://app.mtgscan.org/), [roadmap](https://app.mtgscan.org/roadmap))

The pipeline, in the author's words from the homepage (**Author claim**):

1. **Corners**: "First the app finds the card's four corners in the camera picture and straightens it. I use a pose detector for that, because it can still place a corner that a finger is covering."
2. **Artwork**: "a neural network turns the artwork into a fingerprint and compares it with the fingerprints of about 61,000 artworks stored on the phone. Face recognition works the same way. I trained the network myself, on card art."
3. **Set and number**: "Many printings share one artwork, so the app also checks the set symbol and reads the printed collector number. For a new set I add its fingerprints. The network doesn't have to be retrained."
4. **Parts**: "a YOLO pose detector, a ResNet-50 embedder trained with ArcFace, and Core ML on the iPhone." On Android, text recognition is Google ML Kit on the device ([privacy](https://app.mtgscan.org/privacy)).
5. If unsure, "it shows you the candidates and you pick." Catalogue "just over 100,000 printings". Recognition works offline; card images and printing lists come from Scryfall over the network.

Claims from the Reddit post only (**Author claim**, no numbers on the site): exact printing "even for basic lands"; lighting and sleeve glare "mostly stop mattering"; "around 50 cards per second", called theoretical, hardware not stated; "the phone's gyroscope deskews the shot before recognition even starts" (the site does not mention a gyroscope; there the pose detector straightens the card). Training on the author's own H100.

What the author admits: no accuracy figures yet ("So far I've only measured that on my own test sets", report planned), "It gets some cards wrong", Alpha and Beta not told apart, some old-school cards hard, Japanese cards may fail, no foil detection. ([roadmap](https://app.mtgscan.org/roadmap))

### What it means for this scanner (**Inference**)

- The "LLM" was loose wording: it is classic metric-learning retrieval, ArcFace on an **art crop**, with a learned **corner detector that tolerates occlusion**, and **OCR of the collector number** to pick the printing. That is options C and D below plus the text reading this scanner already does, not a new idea. It confirms the direction of this note from an independent, shipping product.
- Indexing **artworks (~61k), not printings (~100k)**, is the key design choice: the embedder only has to separate illustrations, and the printing is decided by cheap, exact signals (set symbol, collector number). It also makes new sets an index update without retraining.
- **The speed comes from native hardware, not from a small model.** ResNet-50 is about 4.1 GFLOPs at 224 px ([He et al. 2015](https://arxiv.org/abs/1512.03385), table 1), in the same range as DINOv2-S, which takes ~970 ms on the target phone's WASM backend. On an iPhone, Core ML can run it on the Neural Engine. A browser PWA on the Mali phone has no such path (WebGPU broken, WebGL without int8), so copying ResNet-50 would not give us the speed; the embedder has to be a much smaller CNN (EfficientNet-Lite0 class) for the same design to be fast here.
- "Partly visible" in the post means a corner covered by a finger, handled by the pose detector. Cards cut off by the frame edge are not claimed.

### Closest comparable open project: dhvazquez (May 2026)

Found by searching Hugging Face for MTG models. It is the only open, recent, end-to-end, browser-targeted MTG recogniser found, and its design matches what the post describes (self-trained, small, local, fast). **There is no evidence it is the post's project**; treat it as a comparable.

Pipeline (**Verified**, dhv-embed): `Image → Pose ONNX (warp) → Embedder ONNX → 256-d vector → similarity search`.

**Pose (corner) model** (dhv-pose, dhv-pose-train):

- **Verified**: DETRPose-S with an HGNetV2-B0 backbone, predicting the four card corners as keypoints; transformer shrunk to `hidden_dim` 128, 1 decoder layer, 4 queries, 3.6 M parameters total. Input 640×640. FP16 export 7.2 MB, target "ORT Web ≥ 1.26, WebGPU EP (primary), WASM fallback". Trained on 2× RTX 3090, ~2 h 17 min per epoch, converged after 1 epoch.
- **Author claim**: AP 0.999 and mean normalised corner error 0.00067 on its synthetic validation set; the CPU/WASM int8 artifact runs "51 ms vs 65 ms per 640×640 image" on the author's dev box (unnamed CPU, desktop).
- **Verified**, `web/app.js`: the demo prefers WASM on desktops and WebGPU on phones, but skips WebGPU when the adapter reports vendor `arm` and an architecture starting with `valhall`, as "known to be slower". **Inference**: an independent sign that Mali GPUs are a poor WebGPU target. Whether the user's gen-5 Mali reports `valhall` is not checked.

**Embedding model** (dhv-embed, dhv-embed-train):

- **Verified**: EfficientNet-Lite0 with a Sub-center ArcFace head, input 448×320, 256-d L2-normalised output, 82,115 training classes (one per reference image directory, i.e. per printing and language variant), 24 epochs, batch 128. ONNX sizes: fp32 14.8 MB, fp16 7.4 MB, int8 3.8 MB. MIT licence.
- **Verified**, `_dataset.py`: training augmentation is only resize, colour jitter (±0.2), rotation ±5°, and `CoarseDropout` of 1 to 2 holes up to 40 px. Inputs are already warped flat by the pose model, so perspective is handled by the warp, not learned.
- **Author claim**: Recall@1 94.1%, Recall@5 94.6% on the validation split. That split is synthetic renders, not phone photos. **Inference**: Recall@5 barely above Recall@1 means the misses are not near misses but cards the vector cannot separate at all, which is what same-art reprints look like. That matches this scanner's own finding that a single vector cannot decide printings.

**Training data** (dhv-data):

- **Verified**: Scryfall bulk data plus reference images (incl. other languages, alters, border colours), rendered in Blender 4.2 via BlenderProc2 with random HDRI lighting and random camera rotation; 7 train and 3 test renders per reference; 718,508 train and 307,932 test images, 173 GB, with corner keypoints and segmentation masks.
- **Inference**: the renders show whole, unobstructed cards with no sleeves, hands or other cards. Nothing in the data or the augmentations teaches partial visibility beyond two small dropout holes. **No latency for the embedder on a phone is published.**

### Other comparable projects

- **art-index** (**Verified**): one 1024-bit perceptual hash (grayscale plus B, G, R dHash) per Scryfall `illustration_id`, ~50,000 entries, crop interior to the art box (y 16 to 50%, x 14 to 86%), published daily as a ~37 MB SQLite file, with an optional 384-d int8 DINOv2-small embedding per artwork. It states that a match "returns the set of compatible printings" and leaves the printing to OCR or other signals. Queries are hashed at six art-box offsets to absorb imperfect rectification.
- **hj3yoo** (**Verified**, 2018): started with Tiny YOLOv3 detection (~20 to 25 fps on CPU via OpenCV DNN, **author claim**), switched to contours plus pHash. The author's own conclusion: the detector "Fails to spot some of the obscured cards", and the contour route needs "the entire card" visible; he gave up on overlapping cards because a hash of a fraction of the card does not match.
- **Not found / not verified**: a LinkedIn post describing YOLO plus SigLIP 2 plus LanceDB surfaced in search, but no repository was found, so it is not covered. Commercial apps (Delver, ManaBox, MagicFrame and others) publish no architecture.

## 2. Recognising partly visible cards

What has to hold: some stage must work on a fraction of the card, and the decision must still be safe. The options, by stage:

**Local feature matching (already in the pipeline).**

- **Verified**: ORB plus RANSAC homography is the printing decider today; inlier counts separate right from wrong by an order of magnitude.
- **Inference**: a homography can be estimated from any visible planar region with enough keypoints, so verification already tolerates occlusion. What it cannot do is search: ORB descriptors for 111k printings would be ~1.8 GB (measured), so it can only check a shortlist.
- Learned alternatives: SuperPoint (self-supervised detector and descriptor, **Verified** paper), LightGlue (learned matcher that is "adaptive to the difficulty", faster on easy pairs, **Verified** paper), LoFTR (detector-free dense matching), XFeat (lightweight CNN features). XFeat **Author claim**: real-time sparse matching on a laptop i5 CPU in vanilla PyTorch at VGA. **Verified**: XFeat's README lists ONNX export as a wish, not a feature; LightGlue-ONNX exists but targets ONNX Runtime and TensorRT on desktop GPUs. **Inference**: none of them has a documented browser path, and ORB is already measured as good enough on this data. Not worth the switch for speed.

**Region embeddings instead of whole-card embeddings.**

- **Verified**: art-index hashes only the art box, so the frame, title and text box can be covered without changing the hash.
- **Inference**: a card in a fanned hand shows its title strip and left edge; a card under a thumb usually still shows its art. Two small indexes, one over art crops (per `illustration_id`, ~50k) and the title OCR already in place, cover more occlusion patterns than one whole-card vector. The cost is that an art match is a group of printings, never one, so verification still decides.

**Occlusion in training (metric learning).**

- **Verified**: Random Erasing generates "training images with various levels of occlusion" and makes models "robust to occlusion"; Cutout masks random square regions. Sub-center ArcFace trains one class per identity with K sub-centres, tolerant to noisy samples.
- **Inference**: for this scanner that means training on rectified crops with erased regions sized like thumbs, sleeve edges, glare blobs and an overlapping second card, not two 40 px holes. The model then learns which parts of a card are identifying.

**Segmentation and corner models (detection).**

- **Verified**: YOLO11n-seg is 2.9 M parameters, 65.9 ms CPU ONNX at 640 px; YOLO11n-pose 52.4 ms (Ultralytics, CPU not named); YOLO11 is AGPL-3.0 or Enterprise licensed. YOLO26n-seg 53.3 ms. DETRPose (used by dhv-pose) is Apache-2.0.
- **Verified**: MobileSAM and EfficientSAM are lightweight Segment Anything variants aimed at mobile; they segment from a prompt and do not know what a card is.
- **Inference**: a corner model trained with occluded corners (keypoints placed where the hidden corner is) is the one detection change that directly enables partial cards, because the downstream rectify needs four corners, not four visible edges. A segmentation mask alone does not give the hidden corner. The current OpenCV detector is already robust on full cards (playmat 0/24 missed after the August fixes), so a learned detector earns its place only through partial visibility and speed.

## 3. What runs in a phone browser

**ONNX Runtime Web** (in use, 1.27).

- **Verified** (ORT Web README): WASM runs on every browser listed, "all operators" supported. WebGPU on Chrome/Edge Android needs Chromium 121+. WebGL is supported everywhere but "WebGL support is in maintenance mode. It is recommended to use WebGPU". WebNN only behind a command-line flag on Windows.
- **Verified** (ORT WebGL ops): the WebGL EP has no kernel for `DequantizeLinear`, `ConvInteger`, `MatMulInteger`, `QLinearConv`, `LayerNormalization`, `Gelu` or `Erf`. **Inference**: on WebGL, an int8 model cannot run at all and a ViT such as DINOv2 hits unsupported ops (falls back or fails); an fp32 CNN such as EfficientNet-Lite0 is the only model shape that has a GPU path on this phone.
- **Verified** (ORT perf): on WASM, "prefer uint8 quantized models" and "Avoid float16 models if possible" because CPUs lack native fp16. Use small model variants; multi-threading needs cross-origin isolation.
- **Verified** (ORT env): `numThreads` multi-threading requires `crossOriginIsolated`; `env.wasm.proxy` moves inference to a worker but "cannot work with WebGPU EP".
- **Verified** (repo): mtg already sends COOP `same-origin` and COEP `credentialless` (`deploy/mtg/traefik/dynamic.yml`, `vite.config.ts`), and `embedder.ts` uses up to 4 threads when isolated. Threads are already in use, so they are not a remaining speedup.

**TensorFlow.js** (**Verified**, TFJS platform): backends `webgl`, `wasm` (XNNPACK), `cpu`. On mobile, WebGL "might only support 16 bit floating point textures", a precision risk. Their own (2018 MacBook Pro) table: MobileNet v2 WebGL 37 ms vs WASM 94 ms; for tiny models WASM can beat WebGL due to per-op overhead. **Inference**: TFJS WebGL is a second GPU route that does not depend on WebGPU, but switching runtimes means a second model format and a second parity problem with the index builder (which uses onnxruntime-node).

**LiteRT.js** (**Verified**): Google's web runtime for `.tflite`, WebGPU for GPU, XNNPACK on WASM for CPU, WebNN emerging; WebGL is not mentioned. **Inference**: offers nothing on a phone where WebGPU is broken that ORT WASM does not.

**MediaPipe Image Embedder** (**Verified**): MobileNet-V3 small and large, 224×224, float32, optional scalar quantisation of the output to bytes. No custom model training path is documented on that page. **Inference**: a generic ImageNet embedder, not better suited to cards than DINOv2.

**Model size and cost.**

- **Verified**: DINOv2 ViT-S/14 has 21 M parameters (DINOv2 README). EfficientNet-Lite0 has 4.7 M parameters and 407 M multiply-adds at 224 px; on a Pixel 4 CPU with 4 threads (TFLite, native) 12 ms fp32 and 6.5 ms int8, with int8 accuracy 74.4% vs 75.1% fp32 (EfficientNet-Lite README).
- **Inference**: DINOv2-S at 224 px is roughly 2 × 21 M × 257 tokens ≈ 11 GFLOP; Lite0 at dhv-embed's 448×320 input is about 2.9× its 224 px cost, ≈ 2.3 GFLOP. That is about 5× less compute. Scaling the measured 970 ms for DINOv2 on WASM gives **~150 to 250 ms for Lite0 fp32 on the target phone's WASM**, and int8 should be faster (Google's native numbers show ~1.8×; WASM gains are usually smaller). At a 224×320 input it would roughly halve again. These are estimates; nothing here was run on the phone.
- **Inference**: small VLMs (the post's "LLM") are hundreds of millions of parameters at least; none fits a 200 ms budget on a phone CPU in a browser, and they do not solve the closed-set printing problem better than retrieval plus verification.

## 4. Training on Scryfall imagery

**Data volume** (**Verified**, Scryfall Bulk Data): `Default Cards` is 77.6 MB compressed ("every card object ... in English or the printed language"), `All Cards` 389 MB (every language), `Unique Artwork` 37.6 MB ("all unique artworks"). Images come in `normal` 488×680, `large` 672×936, `png` 744×1040, `art_crop` (varies) and new WebP variants (Card Imagery). `image_status` distinguishes `placeholder`, `lowres` and `highres_scan`; placeholders must be filtered (also an internal lesson from OCR training). The scanner index today holds 111k printings.

**Rate limits** (**Verified**, Rate Limits): `api.scryfall.com` is limited (10/s generally, 2/s for search and named); "The direct file origins located at \*.scryfall.io do not have rate limits"; bulk files are mandatory for resolving many images; cache at least 24 hours. Requests to the API need an accurate `User-Agent` and an `Accept` header.

**Licensing** (**Verified**, Scryfall API "Use of Scryfall Data and Images"): data and images are provided under the Wizards Fan Content Policy "for the primary purpose of creating additional Magic software, performing research, or creating community content". Conditions include: no paywalling of Scryfall data, no "repackage, republish, or proxy", software "must create additional value", and for displayed images: do not crop the copyright or artist name, do not distort, skew, blur, sharpen, desaturate or colour-shift. The Fan Content Policy requires fan content to be "F-R-E-E" and to carry the notice "Not approved/endorsed by Wizards".

- **Inference**: the display rules govern showing images to users. Training a model on augmented images, and shipping an index of derived vectors (as this scanner already does and as art-index does: "No card images or text are redistributed"), is a different use the terms do not address explicitly. The safe reading: keep the scanner free, keep the derived index non-reversible, do not ship augmented card images, and show Scryfall images unaltered. This is not legal advice and the terms do not mention machine learning.

**Synthetic augmentation.** dhv-data shows the 3D route (Blender, HDRI, random camera) at 173 GB and GPU render cost. **Inference**: this scanner already rectifies to Scryfall geometry, so the model never needs to learn perspective; augmentation can be 2D on the rectified crop: residual warp of a few percent (the detector is never exact), sleeve border and inset (measured: cosine 0.671 at the sleeve edge vs 0.820 trimmed), glare blobs and foil sheen, colour casts (grey-world is already applied), blur and JPEG, and occluders (thumb, second card, table edge). Most important: **train on the scanner's own crops of real photos** for validation. The internal lessons say mid-pipeline and synthetic numbers lie; dhv-embed's 94% is on synthetic data only.

## Options for this scanner

Ordered by expected value per effort. Each keeps ORB verification and the difference mask as the decider, because they are what makes answers correct, and the user's rule is correctness before speed. Latency estimates are **Inference** for a mid-range Android phone on ORT Web WASM, 4 threads, unless said otherwise.

### A. Measure dhv-embed as a drop-in for DINOv2 (no training)

- **Replaces**: `dinov2-small.onnx` and the index vectors (`embedding.ts` preprocessing to 448×320 with ImageNet normalisation, 256 d instead of 768; rebuild with `scan:embed`, the PCA and int8 packing stay).
- **Latency**: embed ~150 to 250 ms fp32, likely ~100 to 150 ms int8, against ~970 ms. Embedding-path frame ~500 ms instead of ~1400 ms.
- **Why first**: a day of work answers whether a CNN trained with ArcFace on Scryfall images beats DINOv2 on this scanner's own crops. The `Preprocessing` parameter and manifest checks already make it an A/B (`scan:ab`, `scan:verify --recall-only`).
- **Risks**: it was trained on dhv-pose warps, not this rectifier's crops, so the space may not match; its classes are only those 82k reference images, so the other ~30k printings in the index are unseen (open-set); MIT licence is clean but provenance of the training images falls under the Scryfall terms above. Decide only on end-to-end shortlist@20 and name/printing counts measured today on both sides, never on remembered baselines.

### B. Train our own metric embedder on our rectified crops

- **Replaces**: same as A, with our model. EfficientNet-Lite0 or MobileNetV3 backbone, Sub-center ArcFace, one class per printing (or per `illustration_id` for the art head), trained on Scryfall `normal`/`large` images through this repo's rectify geometry, with the 2D augmentations listed in section 4 including heavy erasing.
- **Latency**: as A, ~100 to 250 ms. Can also run fp32 on ORT WebGL as an experiment, since a pure CNN avoids the WebGL op gaps; measure, do not assume.
- **Risks**: synthetic-to-real gap (validate on the 100 deck photos and 24 playmat photos only); GPU time for ~110k classes; same-art reprints stay unseparable by design, which is fine because verification decides; every retrain means an index rebuild and a model/index version bump (the manifest check already enforces pairing).

### C. Art-region index for partly visible cards

- **Replaces**: nothing; adds a second lookup when no whole-card quad is found or the whole-card match is weak. Detect the art box (it is a strong rectangle inside the card, already used as a containment cue in `card-detect.ts`), embed or hash only that, look up ~50k illustrations, expand to printings, verify with ORB against the shortlist.
- **Latency**: hash ~10 ms, or a small embedder ~100 ms on a crop smaller than the whole card; plus verification as today.
- **Risks**: art-only matches always return several printings, so the printing still depends on ORB plus the mask seeing the set symbol and collector line, which may be the hidden part; then the honest answer is the card name with a printing choice, as art-index recommends. Basic lands and same-art reprints remain ambiguous.

### D. Learned corner detector trained with occlusion

- **Replaces**: or runs beside `card-detect.ts`. A small keypoint model (DETRPose-S style, Apache-2.0, or YOLO-pose if AGPL is acceptable) that outputs four corners even when one or two are hidden, trained with occluders, sleeves and playmats.
- **Latency**: at 320 px input ~50 to 120 ms on WASM, comparable to or better than the ~240 ms OpenCV path; the author of dhv-pose reports 51 ms at 640 px on a desktop CPU.
- **Risks**: highest effort (data generation with occluded corners and labels), and the current detector is already reliable on whole cards, so the gain is only on partial cards and speed. Must keep the border-contrast lesson: a learned detector can also lock onto the sleeve or the art box; measure detected-area distributions, not single images. Keep the OpenCV path as fallback until the learned one wins on every photo set.

### Not recommended

- **Replacing ORB with SuperPoint, LightGlue, LoFTR or XFeat**: no documented browser path, ORB already separates right from wrong by an order of magnitude, and the verification cost is dominated by fetching reference images.
- **A small VLM**: too large for the budget and no better at the closed-set printing problem than retrieval plus verification.
- **WebGPU on the target phone**: unchanged; broken for DINOv2 here and avoided for Mali Valhall by dhv-pose's own demo. Re-test only when onnxruntime-web changes, as the stored verdict already allows.
- **Pruning the shortlist for speed**: the card-lens lesson stands; pruning that passed regressions broke real cards.

### Suggested order

A first (cheap, answers whether a trained CNN embedder is worth it). If A or a quick B prototype matches DINOv2's shortlist@20 on today's photo sets, ship it for the speed alone. Then C for partial cards, since it reuses the existing verification. D only if C shows that missing quads, not missing matches, are what loses partial cards.

CardVision (section 1) ships essentially C plus D plus collector-number OCR, natively. It publishes no model or accuracy numbers to compare against. Its art-not-printing indexing is worth adopting in B and C; its ResNet-50 is not, for the browser reasons given there.
