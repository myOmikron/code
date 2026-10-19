# Voice satellite hardware without Home Assistant

Research for [#123](https://github.com/myOmikron/code/issues/123) (map [#118](https://github.com/myOmikron/code/issues/118)).
Question: what can serve as a room satellite (mic, speaker, wake word) for our own voice
pipeline on the Ryzen box, without Home Assistant, and at what firmware effort?
Sources checked October 2026.

## TL;DR

- There are two protocol families. **ESP32 satellites** (Voice PE, ReSpeaker Lite kit,
  ESP32-S3-BOX-3, Satellite1) run **ESPHome** and speak the **ESPHome native API**
  (protobuf over TCP 6053, the device is the server). **Linux satellites** (Pi + HAT)
  used to speak **Wyoming** (`wyoming-satellite`), but that project is archived; its
  successor `linux-voice-assistant` also speaks the **ESPHome native API**.
- So the ecosystem default is now "satellite = ESPHome API server, HA = client". Not
  "satellite = Wyoming client". Wyoming remains the protocol *between the
  pipeline and the STT/TTS/wake services* (Whisper, Piper, openWakeWord).
- The native API is not HA-only. It is a documented protobuf protocol with third-party
  clients (aioesphomeapi, ioBroker, a Homey app that drives stock Voice PE firmware
  without HA, and Rust crates). **Stock firmware works if our service implements the
  voice-assistant subset of the API client.** No reflashing needed for that.
- The alternative, custom firmware that talks Wyoming (or our own protocol) from an
  ESP32, has no maintained off-the-shelf implementation that I found. It would be our own
  ESPHome external component or ESP-IDF firmware.

## 1. How the ESPHome voice satellite protocol works

Primary source: [`api.proto`](https://github.com/esphome/esphome/blob/dev/esphome/components/api/api.proto)
(VOICE ASSISTANT section) and
[`voice_assistant.cpp`](https://github.com/esphome/esphome/blob/dev/esphome/components/voice_assistant/voice_assistant.cpp).

- Each ESPHome device runs its own API server on TCP 6053. Clients connect to it. It is
  "a custom TCP protocol" using protocol buffers. Encryption is optional, with a
  32-byte base64 PSK. Named non-HA users of the API: the ESPHome tool, ioBroker,
  and the Python library `aioesphomeapi`.
  ([ESPHome API docs](https://esphome.io/components/api/))
  The encrypted transport is Noise `NNpsk0_25519_ChaChaPoly_SHA256`
  ([ESPHome noise frame helper](https://api-docs.esphome.io/api__frame__helper__noise_8h_source)).
- Voice flow, by message (in `api.proto` "SOURCE_SERVER" means the device):
  1. Client sends `SubscribeVoiceAssistantRequest` (flag `API_AUDIO` = audio over the API
     connection instead of UDP).
  2. Device sends `VoiceAssistantRequest{start, conversation_id, flags (USE_VAD,
     USE_WAKE_WORD), audio_settings, wake_word_phrase}` when the wake word fires or a
     button is pressed.
  3. Client answers `VoiceAssistantResponse{port, error}`. Port 0 means API audio. A UDP
     port selects legacy UDP audio, which the source comments as "will eventually be
     deprecated".
  4. Mic audio arrives as `VoiceAssistantAudio{data, end}` (16 kHz, `SAMPLE_RATE_HZ =
     16000` in `voice_assistant.cpp`). `data2` carries an optional second mic channel.
  5. Client drives the device state with `VoiceAssistantEventResponse` events:
     `RUN_START`, `STT_VAD_START/END`, `STT_END`, `INTENT_START/PROGRESS/END`,
     `TTS_START`, `TTS_END`, `RUN_END`, `ERROR`. Values travel as name/value pairs.
  6. **TTS playback is a URL.** On `TTS_END` (or `INTENT_PROGRESS` with
     `tts_start_streaming=1`) the device reads the `url` data field and makes its
     `media_player` fetch and play it (`set_media_url(...).set_announcement(true)`).
     So our server must serve the TTS audio over HTTP reachable from the device.
     Without a media_player, audio can come back as `VoiceAssistantAudio` (or UDP) with
     `TTS_STREAM_START/END`.
- Extras usable without HA: `VoiceAssistantAnnounceRequest{media_id (URL), text,
  preannounce_media_id, start_conversation}` (push announcements, e.g. Reminders),
  `VoiceAssistantTimerEventResponse` (device-side timer UI), and
  `VoiceAssistantConfigurationRequest/SetConfiguration` (list and select on-device wake
  words).
- **One client at a time.** The component tracks a single `api_client_`. A second
  subscriber is rejected with "Multiple API Clients attempting to connect to Voice
  Assistant" (`VoiceAssistant::client_subscription` in `voice_assistant.cpp`). HA and our service cannot both drive the same satellite.
- ESPHome docs still frame `voice_assistant` as "stream the audio to Home Assistant" and
  require "Home Assistant 2023.5 or later". The non-HA path is not documented as such.
  It exists because the protocol is open, not because ESPHome supports it.
  ([voice_assistant docs](https://esphome.io/components/voice_assistant/))

### Existing non-HA clients (evidence it works with stock firmware)

- A Homey app "talks to the devices directly over your LAN using the ESPHome native
  API", needs no Home Assistant installation, supports encrypted devices, and lists the
  Voice PE on stock firmware. Its pipeline stages are pluggable (Whisper, Piper,
  Wyoming, OpenAI-compatible).
  ([Homey community thread](https://community.homey.app/t/a/142532))
- Rust: [`esphome-native-api`](https://docs.rs/esphome-native-api) (v3.0.0, "work in
  progress", client *and* server, encryption supported, one ESPHome API version per
  build. Voice messages are not mentioned. It ships `api.proto`-generated types, so
  they should be present, but this is unverified.)
  Also [`esphome-client`](https://docs.rs/esphome-client) and
  [`esphome-proto`](https://forge.wezm.net/wezm/esphome-proto).

## 2. Hardware candidates

| Device | Compute / audio front end | Firmware | Talks to non-HA server? | Local wake word | Price |
|---|---|---|---|---|---|
| **Home Assistant Voice PE** | ESP32-S3 (16 MB flash, 8 MB PSRAM) + **XMOS XU316** (AEC, noise removal, AGC), dual mics, speaker, 3.5 mm out (AIC3204), LED ring, rotary dial, hardware mute, Grove port | ESPHome, open source ([repo](https://github.com/esphome/home-assistant-voice-pe)); XMOS firmware open too | Yes, as an ESPHome API client. Stock firmware. | microWakeWord on device (okay_nabu, hey_jarvis, hey_mycroft, plus a "stop" model) | $69 / 59 EUR MSRP |
| **ReSpeaker Lite + XIAO ESP32S3** (Seeed kit) | XMOS XU316, 2 mics, I2S speaker out via AIC3204 | ESPHome YAML from Seeed (forked external components for `i2s_audio`/`respeaker_lite`); XMOS needs I2S DFU firmware flashed with `dfu-util` | Same as Voice PE (ESPHome API). Self-compiled. | microWakeWord on device | about 27 to 29 GBP at The Pi Hut; bare board, needs speaker and enclosure; buttons need soldering |
| **ESP32-S3-BOX-3** (Espressif) | ESP32-S3, 2 mics, speaker, touch LCD | Either ESPHome (HA's install page) or Espressif's ESP-BOX demo (ESP-SR, offline wake word and command recognition) | ESPHome build: same as above. Espressif firmware: own stack, no satellite protocol. | ESPHome: microWakeWord ("Okay Nabu", "Hey Jarvis", "Alexa"); ESP-SR: WakeNet | about $50 (Willow site) |
| **FutureProofHomes Satellite1** | XMOS XU316, 25 W amp (TAS2780), 3.5 mm out; can also sit on a Pi as a HAT | ESPHome, factory-installed, OTA | Same as above (ESPHome API) | on device | $69.99, backordered to 15 Nov 2026 |
| **Pi Zero 2 W + ReSpeaker 2-Mics HAT v2** | Linux; tlv320aic3x codec via Seeed device-tree overlay, out-of-tree module build on Zero W | `linux-voice-assistant` (current) or `wyoming-satellite` (archived) | LVA: ESPHome API server. wyoming-satellite: Wyoming, works with any Wyoming server in principle | openWakeWord or microWakeWord on the Pi | Pi + HAT, cheapest; no AEC hardware |

Sources: [Voice PE product page](https://www.home-assistant.io/voice-pe/),
[Voice PE YAML](https://github.com/esphome/home-assistant-voice-pe/blob/dev/home-assistant-voice.yaml),
[Seeed ReSpeaker Lite HA wiki](https://wiki.seeedstudio.com/respeaker_lite_ha/),
[The Pi Hut listing](https://thepihut.com/products/respeaker-lite-with-xiao-esp32s3),
[HA S3-BOX guide](https://www.home-assistant.io/voice_control/s3_box_voice_assistant/),
[espressif/esp-box](https://github.com/espressif/esp-box),
[Satellite1 dev kit](https://futureproofhomes.net/products/satellite1-pcb-dev-kit),
[ReSpeaker 2-Mics HAT v2 wiki](https://wiki.seeedstudio.com/respeaker_2_mics_pi_hat_raspberry_v2/),
[linux-voice-assistant](https://github.com/OHF-Voice/linux-voice-assistant),
[wyoming-satellite](https://github.com/rhasspy/wyoming-satellite).

### Notes per device

- **Voice PE stock firmware ties.** The YAML's `api.encryption` is commented "Uses key set
  by Home Assistant". The API has a `NoiseEncryptionSetKeyRequest`, so a non-HA client
  could set the key itself. A self-built firmware could also pin one. The wake word engine
  only starts in `voice_assistant.on_client_connected` (`micro_wake_word.start`). **No
  subscribed client means no wake word.** Our service has to hold the connection
  permanently. The LED ring shows "not ready" while no client is connected.
- **ReSpeaker Lite** is the same architecture as Voice PE (XU316 + ESP32-S3) as a bare
  board. Seeed's guide treats HA as essential, and the LED pulses red without an API
  connection. Firmware effort: compile ESPHome yourself and DFU the XMOS.
- **ESP32-S3-BOX-3**: only the BOX-3/3B is still sold. The older BOX and BOX-Lite are EOL.
  No XMOS, so AEC comes from Espressif's software AFE (ESP-SR), not a dedicated DSP.
- **Pi + HAT**: `wyoming-satellite` README: "This project is no longer maintained as it
  has been replaced by Linux Voice Assistant". The repo is archived. LVA requires
  aarch64/amd64, 512 MB RAM, Python 3.11+, and PipeWire/PulseAudio. It recommends
  Pi Zero 2W + Satellite1 HAT, or Pi 3 + ReSpeaker Lite (ReSpeaker Lite "has problems"
  on the Zero 2W). The 2-Mics HAT v2 is its "lower-budget option".
  wyoming-satellite offered webrtc noise suppression and AGC in software.

### Willow (alternative ESP32 firmware, not ESPHome)

[Willow](https://github.com/HeyWillow/willow) (Apache-2.0, release 0.4.3 July 2026)
targets the ESP32-S3-BOX family. It has on-device wake word ("Hi ESP", "Alexa") and sends
speech to the self-hosted Willow Inference Server, or recognizes commands on device.
Results go to Home Assistant, openHAB or **any generic REST endpoint via HTTP POST**
([heywillow.io](https://heywillow.io/)). It is a non-HA option with no firmware work, but
it brings its own server (WIS/WAS) instead of Wyoming. Recent commits are CI/dependency
maintenance only.

## 3. Wake word: on device vs. server

- **On device (ESP32-S3)**: [microWakeWord](https://esphome.io/components/micro_wake_word/)
  runs in ESPHome. Models come from the ESPHome models repo, or custom ones by URL/JSON
  (training per [kahrendt/microWakeWord](https://github.com/kahrendt/microWakeWord)). It
  has an optional VAD model, and `on_wake_word_detected` passes the phrase. A custom
  "Computer" wake word means training a microWakeWord model. None ships by default.
- **On device (Linux)**: openWakeWord or microWakeWord inside LVA. wyoming-satellite used
  `wyoming-openwakeword` with custom `.tflite` models.
- **On server**: the ESPHome protocol supports streaming continuously and letting the
  server detect (`VOICE_ASSISTANT_REQUEST_USE_WAKE_WORD` flag, `WAKE_WORD_START/END`
  events; HA's "wake word engine location" switch). Wyoming has `detect` / `detection`
  events for a remote wake word service. Cost: continuous 16 kHz audio per room
  over Wi-Fi, and the Ryzen box must be up for the wake word to work.

## 4. Wyoming protocol (for reference)

[OHF-Voice/wyoming](https://github.com/OHF-Voice/wyoming) (MIT, active): "A peer-to-peer
TCP protocol for voice assistants". Each message is a JSONL header (`type`, `data`,
`data_length`, `payload_length`), then optional extra JSON, then an optional binary
payload (PCM). Events: `audio-start/chunk/stop`, `describe`/`info`, `transcribe` →
`transcript`, `synthesize` (+ streaming variants), `detect` → `detection`,
`voice-started/stopped`, `recognize` → `intent`, `handled`, `played`, timer events,
`user-event`, and satellite events (`run-satellite`, `pause-satellite`,
`streaming-started/stopped`, `run-pipeline`). Nothing in it is HA-specific. Today it is
mainly the protocol to Whisper/Piper/openWakeWord services. The satellite side has moved
to the ESPHome API.

## 5. What a moving prop would add

Neither protocol has a "look at" channel. What exists:

- **"Speaking" state**: both carry it. ESPHome: `TTS_START`, `TTS_END`,
  `INTENT_PROGRESS` with streaming URL, `RUN_END`, plus `STT_VAD_START/END` for
  "user is talking". The Voice PE YAML already maps these to LED phases
  (listening, thinking, replying). Wyoming: `synthesize`, `audio-start/stop`,
  `played`, `voice-started/stopped`.
- **Custom signals**: Wyoming has a generic `user-event`. The ESPHome API has generic
  entities and services that a custom firmware could expose (for example a servo
  `number` entity or a user-defined action). This is not part of `voice_assistant`.
- **Direction** ("look at the speaker"): none of the sources expose direction-of-arrival
  through the satellite protocols. It would be a custom extension, and XU316 DoA support
  was not verified here.
- Lip-sync from audio: with URL-based TTS the device fetches the audio itself, so a prop
  on a *separate* controller would not see the stream unless the server also sends it
  (or the amplitude) on a side channel.

## Implications for the decision

These are inputs for the user, not decisions.

- "Room satellites via Wyoming" (map #118 Notes) no longer matches the ecosystem. Current
  satellite hardware and firmware (ESP32 and Linux) speak the **ESPHome native API**.
  Wyoming lives between pipeline and STT/TTS services. The realistic choice is between:
  - **(a)** the `home` voice stack acts as an **ESPHome API client** (protobuf + Noise,
    voice-assistant subset, TTS served over HTTP). This works with stock Voice PE /
    Satellite1 / ReSpeaker Lite / BOX-3 firmware and LVA on a Pi. Rust crates exist but
    are WIP.
  - **(b)** **custom satellite firmware** speaking Wyoming or our own protocol. This means
    real ESP32 firmware work (an ESPHome external component or ESP-IDF), and nothing
    maintained exists to start from.
  - **(c)** a Linux satellite with our own small daemon. The archived wyoming-satellite
    still works as a starting point, but the Pi HAT options lack hardware AEC.
- With (a), the satellite needs a permanently connected client or it has no wake word.
  Only one client can drive it, so HA and `home` cannot share a satellite.
- If the voice stack (Ryzen box) is the API client, satellites go deaf when that box is
  off. This matches the #118 note that voice may depend on it while lights and heating
  must not.
- A "Computer" wake word needs a trained microWakeWord (or openWakeWord) model either
  way.
- XMOS-based devices (Voice PE, ReSpeaker Lite, Satellite1) have hardware AEC/NS. That
  matters for barge-in and for a speaker playing GLaDOS output into the same mics.
- A prop's "speaking" channel can reuse the pipeline events. "Look at" would be a new,
  custom channel in any of the options.
