# Local voice stack on a GTX 1080

Research for [#122](https://github.com/myOmikron/code/issues/122) (map [#118](https://github.com/myOmikron/code/issues/118)).
Hardware: Ryzen 7 1700, GTX 1080 8 GB (Pascal, compute capability 6.1). Fully local, German speakers.
Sources checked 2026-10-19.

## 1. The Pascal problem: what still runs on CC 6.1

NVIDIA is retiring Pascal layer by layer. The stack works today, but only by pinning
below each cut-off.

| Layer | Status for Pascal | Source |
| --- | --- | --- |
| Driver | R580 is the last branch for Maxwell/Pascal/Volta; 590+ drops them. R580 becomes a legacy branch with occasional fixes. | [NVIDIA deprecation schedule](https://forums.developer.nvidia.com/t/unix-graphics-feature-deprecation-schedule/60588) |
| Driver on Arch | 590 dropped Pascal and `nvidia` became `nvidia-open` (Turing+ only). Pascal needs `nvidia-580xx-dkms` from the AUR. Only relevant if the Ryzen box runs Arch. | [Arch news](https://archlinux.org/news/nvidia-590-driver-drops-pascal-support-main-packages-switch-to-open-kernel-modules/) |
| CUDA toolkit | 13.0 removed offline compilation and library support for Maxwell, Pascal and Volta. 12.x is the last toolkit line that targets sm_61. | [CUDA 13.0 release notes](https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/index.html) |
| cuDNN | 9.9.0 deprecated pre-Turing; 9.11.0: "GPU architectures earlier than the NVIDIA Turing architecture (namely ... Maxwell, ... Pascal, and ... Volta) are no longer supported." | [cuDNN release notes](https://docs.nvidia.com/deeplearning/cudnn/backend/latest/release-notes.html) |
| PyTorch | From 2.8 the cu128/cu129 wheels have no Maxwell/Pascal kernels; cu126 wheels keep them. 2.14 is the last release with any CUDA 12.x wheel; from 2.15 Pascal means building from source. | [PyTorch dev-discuss (2.8)](https://dev-discuss.pytorch.org/t/cuda-toolkit-version-and-architecture-support-update-maxwell-and-pascal-architecture-support-removed-in-cuda-12-8-and-12-9-builds/3128), [PyTorch dev-discuss (2.15)](https://dev-discuss.pytorch.org/t/notice-cuda-12-6-wheels-will-no-longer-be-published-from-pytorch-2-15-drops-maxwell-pascal-volta/3432) |
| onnxruntime-gpu | PyPI wheels switched from CUDA 12 to CUDA 13 in 1.27.0 (1.26.0 is the last CUDA 12 build), so unpinned installs fall back to CPU. | [wyoming-faster-whisper Dockerfile.gpu](https://github.com/OHF-Voice/wyoming-faster-whisper/blob/main/Dockerfile.gpu) |
| vLLM | Requires compute capability 7.5 or higher. **Out.** | [vLLM GPU install docs](https://docs.vllm.ai/en/latest/getting_started/installation/gpu.html) |
| llama.cpp / whisper.cpp (ggml) | Default CUDA build adds `61-virtual` while the toolkit is < 13 (comment: "61 == Pascal, __dp4a instruction"). Works with a CUDA 12.x build. | [ggml-cuda CMakeLists.txt](https://github.com/ggml-org/llama.cpp/blob/master/ggml/src/ggml-cuda/CMakeLists.txt) |
| Ollama | "Supports Nvidia GPUs with compute capability 5.0+"; CC 5.0 to 6.2 need driver 570 or newer; GTX 1080 is listed. Ships a CUDA 12.8 runner built for `...;60;61;...` alongside a CUDA 13 one. | [Ollama GPU docs](https://github.com/ollama/ollama/blob/main/docs/gpu.mdx), [llama/server/CMakePresets.json](https://github.com/ollama/ollama/blob/main/llama/server/CMakePresets.json) |
| CTranslate2 (faster-whisper) | Wheels built with CUDA 12.8 and `CUDA_ARCH_LIST="Common"`, which for CUDA 11.1+ is 6.0, 6.1, 7.0, 7.5, 8.0, 8.6. Since 4.6.3, wheels build with `WITH_CUDNN=OFF` (pure CUDA conv1d), so the cuDNN 9.11 cut does not hit them. Latest is 4.8.3 (2026-10-13). | [build script](https://github.com/OpenNMT/CTranslate2/blob/master/python/tools/prepare_build_environment_linux.sh), [CMakeLists.txt](https://github.com/OpenNMT/CTranslate2/blob/master/CMakeLists.txt), [CMake select_compute_arch](https://gitlab.kitware.com/cmake/cmake/-/blob/master/Modules/FindCUDA/select_compute_arch.cmake), [PR #1949](https://github.com/OpenNMT/CTranslate2/pull/1949), [releases](https://github.com/OpenNMT/CTranslate2/releases) |

Seen in the field: Pascal users of faster-whisper images hit `CUDNN_STATUS_EXECUTION_FAILED` after an image
pulled cuDNN 9.11; linuxserver.io added a `gpu-legacy` tag for pre-Turing cards
([linuxserver/docker-faster-whisper#47](https://github.com/linuxserver/docker-faster-whisper/issues/47),
[SYSTRAN/faster-whisper#1383](https://github.com/SYSTRAN/faster-whisper/issues/1383)).

**What CC 6.1 gets inside CTranslate2:** int8 runs (as `int8_float32`); float16 and bfloat16 silently fall
back to float32, because FP16 is turned off without tensor cores (override: `CT2_CUDA_ALLOW_FP16=1`).
([CTranslate2 quantization docs](https://opennmt.net/CTranslate2/quantization.html),
[faster-whisper#42](https://github.com/SYSTRAN/faster-whisper/issues/42)). So on the 1080 the right
`compute_type` is `int8`.

**Pascal in llama.cpp:** no tensor cores, but MMQ kernels use `__dp4a`. FlashAttention (`-fa`) works and helps a little
(see the benchmarks below).

## 2. Speech-to-text

### Candidates

| Model | Size | German WER (lower is better) | Runtime on the 1080 | Licence |
| --- | --- | --- | --- | --- |
| Whisper large-v3 | 1.55 B | FLEURS 5.46, Common Voice 6.25, MLS 5.72 ([Voxtral paper, Tables 4 to 6](https://arxiv.org/abs/2507.13264)) | faster-whisper int8, whisper.cpp | MIT |
| Whisper large-v3-turbo | 809 M; decoder cut from 32 to 4 layers, "way faster ... minor quality degradation" ([model card](https://huggingface.co/openai/whisper-large-v3-turbo)) | Common Voice 19: 3.85 vs 3.48 for large-v3; Tuda-De 8.30 vs 7.88 ([primeline card](https://huggingface.co/primeline/whisper-large-v3-turbo-german)) | faster-whisper int8, whisper.cpp | MIT |
| primeline/whisper-large-v3-turbo-german | 809 M, German fine-tune | CV19 3.20, Tuda-De 6.44, MLS 2.07 ([card](https://huggingface.co/primeline/whisper-large-v3-turbo-german)) | needs conversion to CT2 or ggml | Apache-2.0 |
| NVIDIA Parakeet TDT 0.6B v3 | 600 M, 25 European languages incl. `de` | FLEURS 5.04, CoVoST 4.84 ([card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)) | sherpa-onnx (CPU int8 is the default in the Wyoming server) | CC-BY-4.0 |
| Qwen3-ASR 1.7B / 0.6B | German supported, streaming/offline in one model | No German numbers on the card ([card](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf)) | Transformers ≥ 5.13 + PyTorch, bf16 examples (Pascal: fp32, cu126 wheels only) | Apache-2.0 |
| Gemma 4 E4B (audio in) | see LLM section | FLEURS 0.08 (card does not say which languages) ([card](https://huggingface.co/google/gemma-4-E4B-it)) | llama.cpp `input_audio` ([multimodal docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)); audio limited to 30 s | Apache-2.0 |

### Memory and speed facts

- faster-whisper reference numbers (RTX 3070 Ti, 13 min audio, large-v2, beam 5): fp16 1m03s / 4525 MB;
  **int8 59 s / 2926 MB** ([faster-whisper README](https://github.com/SYSTRAN/faster-whisper)). That GPU has tensor cores; the 1080 has none.
- whisper.cpp memory: medium 1.5 GiB disk / ~2.1 GB RAM; large 2.9 GiB / ~3.9 GB ([whisper.cpp README](https://github.com/ggml-org/whisper.cpp)). Quantised ggml models are smaller.
- "The latest versions of `ctranslate2` only support CUDA 12 and cuDNN 9"; pin ctranslate2 4.4.0 for CUDA 12 + cuDNN 8, 3.24.0 for CUDA 11 ([README](https://github.com/SYSTRAN/faster-whisper)).
- **No primary benchmark exists for Whisper on a GTX 1080.** A maintainer remark: "A 1060 achieves approximately realtime transcription with the large-v3 model IIRC" ([faster-whisper#666](https://github.com/SYSTRAN/faster-whisper/issues/666)). Voice commands are 2 to 5 s long, but Whisper always encodes a 30 s window, so encoder cost is fixed per utterance. Must be measured.

### Wyoming server for STT

[wyoming-faster-whisper](https://github.com/OHF-Voice/wyoming-faster-whisper) (MIT, active) now has several backends:
`faster-whisper`, `transformers`, `qwen3-asr`, `sherpa` (Parakeet TDT v3, 25 languages; streaming Kroko models for `de`/`en`/`es`/`fr`).
Useful features for this project:
- `--vad-endpointing <s>`: server-side Silero VAD ends the command after that much silence.
- Name biasing: feeds entity, area and floor names into Whisper's prompt (≤ 223 tokens) so device names are not misheard. Built for the Home Assistant API, but `--initial-prompt` works without it.
- Distil-Whisper models are not compatible with name biasing.
- The GPU Dockerfile is not published; it is built locally on `nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04` and pins `onnxruntime-gpu <1.27`.

## 3. LLM with tool calling

### Runtime

- **vLLM is out** (CC ≥ 7.5).
- **llama.cpp `llama-server --jinja`** gives OpenAI-style tool calling. Native formats include Llama 3.x, Hermes 2/3, Qwen 2.5, Mistral Nemo, GPT-OSS, Gemma 4 (parser in `common/parsers/gemma4.cpp`); others fall back to a "Generic" handler that "may consume more tokens and be less efficient" ([function-calling.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)).
- `cache_prompt` is on by default: only the suffix that differs from the previous request is evaluated ([server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)). This matters for a fixed system prompt plus tool schemas.
- **Ollama** wraps llama.cpp (it now bundles `llama-server` builds) and supports CC 6.1 (section 1).

### Throughput on Pascal (llama-bench, Llama 2 7B Q4_0, 3.56 GiB)

From [llama.cpp discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013):

| GPU | prompt pp512 t/s | generation tg128 t/s |
| --- | --- | --- |
| **GTX 1080** (build 8745, [comment](https://github.com/ggml-org/llama.cpp/discussions/15013#discussioncomment-16516758)) | 789 (no FA) / 825 (FA) | 45.8 / 47.5 |
| GTX 1080 Ti | 1084 / 1138 | 62.5 / 61.4 |
| GTX 1070 | 631 | 41.8 |

Generation is memory-bandwidth bound, so it scales roughly inversely with model size. Estimates (not measured):
a 2.7 GB model ~ 60 t/s, a 5.7 GB model ~ 30 t/s.

### Model candidates (all Apache-2.0)

| Model | GGUF size (Q4_K_M) | Tool-use evidence | German | Notes |
| --- | --- | --- | --- | --- |
| [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) (2026-02) | 2.74 GB ([unsloth](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF)) | BFCL-V4 50.3, TAU2-Bench 79.9 | "201 languages and dialects" (German not named) | Hybrid Gated DeltaNet + attention (CUDA kernels exist in ggml). Thinking is on by default; turn it off with `enable_thinking: false` (the `/nothink` switch no longer works). |
| [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B) | 5.68 GB ([unsloth](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF)) | BFCL-V4 66.1, TAU2-Bench 79.1 | as above | Too big to share 8 GB with a separate Whisper plus KV cache. |
| [Gemma 4 E4B-it](https://huggingface.co/google/gemma-4-E4B-it) | 4.98 GB + ~1 GB mmproj ([unsloth](https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF)) | Tau2 42.2 % | 140+ languages pretrained, 35+ out of the box | **Takes audio directly** (ASR, 30 s per input). The [dnhkng/GLaDOS](https://github.com/dnhkng/GLaDOS) project's default profile does exactly this on llama.cpp, with no STT model. |
| [Gemma 4 12B-it](https://huggingface.co/google/gemma-4-12B-it) | 6.98 GB (Google QAT Q4_0, [repo](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf)) | Tau2 69.0 % | as above | Audio input too; fills the card on its own. |
| [Ministral 3 8B Instruct 2512](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512) | 5.2 GB ([official GGUF](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF)) | "native function calling"; no BFCL/Tau numbers on the card | German explicitly listed | |

BFCL and Tau2 are self-reported by each vendor under different setups, so compare them only within one vendor's
card. **Nobody publishes German tool-calling numbers.** That needs a small eval with this project's real tools.

### Does it all fit in 8 GB?

The GTX 1080 reports 8105 MiB. Budget (weights only, plus about 0.3 to 0.5 GB CUDA context per process):
- Whisper turbo int8 (CT2) is roughly 1 to 1.5 GB (estimate: half the 2.9 GB of large-v2 int8, since turbo has about half the parameters) + Qwen3.5-4B Q4_K_M 2.7 GB + KV cache: **fits with room to spare.**
- Whisper turbo + a 5 to 6 GB model (Qwen3.5-9B, Ministral 3 8B, Gemma 4 E4B with audio): **tight to impossible**, unless STT runs on CPU (Parakeet int8 via sherpa) or the LLM does STT itself (Gemma 4 E4B audio, about 6 GB total, one process).
- Piper TTS runs on CPU and needs no VRAM.

## 4. Text-to-speech

### Piper

- `rhasspy/piper` (MIT) is **archived**. Development moved to [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), which is **GPL-3.0** (it embeds espeak-ng). `pip install piper-tts`. The Open Home Foundation is "looking for maintainers for Piper".
- `--cuda` needs `onnxruntime-gpu` ([CLI docs](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md)). For Pascal that means onnxruntime-gpu < 1.27 (section 1). CPU is the normal way to run it.
- Wyoming server: [OHF-Voice/wyoming-piper](https://github.com/OHF-Voice/wyoming-piper) (MIT, active).
- Stock German voices include `de_DE-thorsten-high` (dataset CC0, [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/high/MODEL_CARD)).

### GLaDOS voices

- **German GLaDOS for Piper exists:** [systemofapwne/piper-de-glados](https://huggingface.co/systemofapwne/piper-de-glados) has `de_DE-glados-{low,medium,high}.onnx` and `de_DE-glados-turret-*`. It is fine-tuned from Thorsten (high) on the German Portal 1 and Portal 2 game voice lines. sherpa-onnx conversions: [csukuangfj/vits-piper-de_DE-glados-high](https://huggingface.co/csukuangfj/vits-piper-de_DE-glados-high) (and `-medium`, `-low`).
- **Licence:** the repo declares **no licence**. Its README says the training data "is intellectual property and copyright by Valve". The weights are derived from copyrighted voice recordings: fine for private home use, not something to ship or publish.
- English GLaDOS: the [dnhkng/GLaDOS](https://github.com/dnhkng/GLaDOS) project (MIT code; "GLaDOS and Portal belong to Valve. This is a fan project.") ships its own ONNX GLaDOS voice, an OpenAI-style `POST /v1/audio/speech` endpoint and Kokoro as an alternative. Default input language is English.
- Alternatives: any Piper German voice (Thorsten, CC0 data); Mistral [Voxtral-4B-TTS](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) exists but would compete for VRAM and needs a PyTorch stack (not evaluated).

## 5. Wake word

- [openWakeWord](https://github.com/dscripka/openWakeWord): code Apache-2.0, **pretrained models CC BY-NC-SA 4.0**. "Currently, openWakeWord only supports English", because the training TTS voices are English. One Raspberry Pi 3 core runs 15 to 20 models in real time. Optional Silero VAD gate and Speex noise suppression. Target: < 5 % false rejects and < 0.5 false accepts per hour.
- Custom words are trained on 100 % synthetic speech from [piper-sample-generator](https://github.com/rhasspy/piper-sample-generator) (MIT; the multi-speaker generator is English only) plus about 30,000 h of negative data. Colab notebook < 1 h; the detailed notebook gives better models.
- **"Computer" already exists** in the community collection [fwartner/home-assistant-wakewords-collection](https://github.com/fwartner/home-assistant-wakewords-collection/tree/main/en/computer) (MIT repo): `computer_v2` reacts to "Computer" and "Hey Computer". Self-reported accuracy 0.78 and recall 0.57 on its own validation set, so it is weak. Trained on English pronunciations; the German "Computer" sounds close but was not tested.
- [microWakeWord](https://github.com/kahrendt/microWakeWord) (Apache-2.0) is the TensorFlow-based alternative for microcontrollers (ESPHome satellites).
- For push-to-talk in the app (the first step on the map) no wake word is needed.

## 6. Wyoming protocol

[OHF-Voice/wyoming](https://github.com/OHF-Voice/wyoming) (MIT, "an open standard from the Open Home Foundation"):

- **Wire format:** a peer-to-peer TCP protocol. Each event is one JSON header line `{type, data, data_length, payload_length}\n`, then optional extra JSON data, then an optional binary payload (usually PCM).
- **What it standardises:** event types for audio (`audio-start/chunk/stop`), service discovery (`describe` / `info`, listing models and languages per service), program selection, ASR (`transcribe` → `transcript`, plus streaming `transcript-chunk`), TTS (`synthesize` plus streaming `synthesize-start/chunk/stop`), wake (`detect` → `detection` / `not-detected`), VAD (`voice-started/stopped`), intent recognition and handling (`recognize`, `intent`, `handled`, streaming `handled-chunk`), audio output (`played`), satellite control (`run-satellite`, `run-pipeline`, ...) and timers.
- **Security:** "no authentication or encryption, by design"; only for a trusted network.
- **Who speaks it:** servers for openWakeWord, microWakeWord, porcupine1, snowboy (wake); faster-whisper, whisper.cpp, Vosk (STT); Piper (TTS); handle-external (intent); mic/snd adapters. Home Assistant is the main client.
- **Satellites moved away from Wyoming.** [wyoming-satellite](https://github.com/rhasspy/wyoming-satellite) is **archived**, "replaced by [Linux Voice Assistant](https://github.com/OHF-Voice/linux-voice-assistant) that uses the ESPHome protocol" (media player, stop word, continue conversation, timers). The ESPHome API is tied to Home Assistant. So the "room satellites later (Wyoming)" note on the map rests on a deprecated satellite.
- No Rust implementation is listed. The protocol is simple enough (JSONL plus raw bytes over TCP) to speak directly from a Rust service.

## 7. End-to-end latency estimate (end of speech to first audio)

**Not measured.** This is built from the numbers above, so treat it as a planning range.

| Step | Estimate | Basis |
| --- | --- | --- |
| Endpointing (silence detection) | 0.5 to 0.8 s | `--vad-endpointing 0.7` style setting; push-to-talk release removes it |
| STT (Whisper turbo int8 on the 1080, 3 s command) | ~0.5 to 1.5 s | no primary 1080 benchmark; fixed 30 s encoder window |
| LLM prompt eval (new suffix only, ~100 to 300 tokens with prompt cache) | 0.1 to 0.4 s | ~800 t/s pp on a 7B Q4_0 |
| LLM tool call (~30 to 50 tokens) | 0.5 to 1.5 s | 30 to 60 t/s depending on model size |
| Tool execution via the service API | < 0.2 s | local HTTP to the Pi |
| LLM reply, first sentence (~15 to 25 tokens) | 0.3 to 0.8 s | as above, streamed |
| Piper first sentence (CPU) | ~0.2 to 0.5 s | not measured on the Ryzen 1700 |
| **Total** | **about 2 to 5 s** (push-to-talk: subtract endpointing) | |

Big levers: thinking mode off; a small model; prompt caching; streaming TTS by sentence (Wyoming
`synthesize-chunk`); and skipping the second LLM turn for plain commands by speaking a fixed confirmation.

## Implications for the decision

- The GTX 1080 is usable but **pinned to a frozen stack**: driver R580, CUDA 12.x, cuDNN ≤ 9.10 (or CTranslate2 ≥ 4.6.3 without cuDNN), PyTorch ≤ 2.14 cu126, onnxruntime-gpu < 1.27. Every image and wheel needs a pin, and Renovate will keep proposing upgrades that break the card. Whether that maintenance cost, or a used Turing+ card, is acceptable is the user's call.
- **vLLM is not an option.** That leaves llama.cpp (`llama-server`) and Ollama, which are the same engine underneath.
- 8 GB forces a choice: Whisper on GPU plus a ~4B LLM; a larger LLM with STT on CPU (Parakeet); or one multimodal model that hears audio directly (Gemma 4 E4B, as dnhkng/GLaDOS does).
- German tool-calling quality is unpublished for every candidate, so a short eval against the real tool set is needed before choosing a model.
- A German GLaDOS Piper voice exists, but it carries no licence and is Valve-derived: fine at home, never redistributed.
- openWakeWord is English-only. A community "Computer" model exists but is weak, so push-to-talk first (as the map already plans) avoids the problem for now.
- The Wyoming satellite path is deprecated in favour of an HA-bound ESPHome protocol. Wyoming is still alive as the protocol for STT/TTS/wake *servers*, so the service could talk Wyoming to those servers and run its own satellite or app audio path.
