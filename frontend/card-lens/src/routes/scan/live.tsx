import { BoltIcon, CameraIcon, CheckIcon, PhotoIcon, PlusIcon, SparklesIcon, ViewfinderCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Badge, Button, Description, Divider, EmptyState, Heading, Label, ProgressBar, StackedList, StackedListFlexRow, Strong, Subheading, Switch, SwitchField, Text } from "components";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardImage } from "../../components/CardImage";
import { ManaCost } from "../../components/ManaCost";
import { useCardIndex } from "../../context/card-index-context";
import { useScanScope } from "../../context/scan-scope-context";
import { usePendingScans } from "../../context/pending-scans-context";
import { FRESH_GUIDE_HISTORY, mayAddSameCard, mayScanAgain, observeGuide, thumbDiff } from "../../liveScanGate";
import { scanImage } from "../../scanClient";
import type { CardQuad, ScanOverlay, ScanPhase } from "../../scanClient";
import type { CardRecord, MatchCandidate } from "../../types";
import { formatCurrency, quadPoints } from "../../utils/format";

// Live-scan guide: a card-shaped (63:88) box filling this fraction of the viewfinder height. The
// user aligns the card into it; we crop exactly this region, so it is already in card aspect and
// the scan pipeline skips edge detection entirely — the ManaBox approach.
const CARD_GUIDE_ASPECT = 63 / 88;
const LIVE_GUIDE_HEIGHT = 0.84;
// Multi-card live scanning precision (never add a wrong card). Two guards, in order:
//
//  1. A stability gate — only steady, card-filled frames are matched at all, so movement, swaps
//     and empty frames (blurred, half-visible cards) never even reach the matcher.
//  2. The identity gate — a card is only added when title OCR *read its name*. Perceptual
//     matching alone is not enough: on dark or low-detail art it is confidently wrong, and it is
//     wrong the same way on every frame, so repeating the scan cannot catch it (frame consensus
//     used to be the guard here and could not). The card name is an independent signal, and a
//     read above OCR_NAME_MIN was never wrong across the labeled dataset, while the perceptual
//     guess alone was wrong most of the time. When the title cannot be read we simply do not add
//     and ask the user to re-align — refusing beats guessing.
const LIVE_PRESENCE_STDEV = 16; // the guide must have at least this much luma variation to hold a card
// Only a BIG frame-to-frame change (a card being swapped out/in) blocks matching — normal
// hand-jitter must pass, so the user does not have to hold perfectly still.
const LIVE_MOTION_THRESHOLD = 28;
// How different the guide must look from the card just added to count as a new card. Well above
// the residual difference of the same card jittering in frame, well below a different artwork.
const LIVE_CARD_CHANGE_DIFF = 12;
// Cap on the title OCR wait per frame. Tesseract reads a legible title in ~200 ms but can grind
// for seconds on an unreadable one — exactly the frames we would refuse anyway. Cutting it short
// keeps every live frame well under a second and just retries on the next frame. The budget has
// to cover a failed title-bar read FOLLOWED by the full-art name banner read, which is the only
// way a full-art basic land is ever identified.
const LIVE_OCR_TIMEOUT_MS = 900;
const THUMB_W = 24;
const THUMB_H = 33;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const Route = createFileRoute("/scan/live")({ component: ScanLiveRoute });

function ScanLiveRoute() {
  const navigate = useNavigate();
  const { status: indexStatus, progress: indexProgress, cardCount: indexCount, setCount } = useCardIndex();
  const { scans, add: stageScan, remove: unstageScan } = usePendingScans();
  const { codes: setFilter } = useScanScope();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<ScanOverlay | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [phase, setPhase] = useState<ScanPhase | "idle">("idle"); // live pipeline stage
  const [analyzeProgress, setAnalyzeProgress] = useState(0); // 0..1 image-analysis progress
  const [ocrProgress, setOcrProgress] = useState(0); // 0..1 OCR progress
  const [message, setMessage] = useState<string | null>(null);
  const [foil, setFoil] = useState(false);
  const [added, setAdded] = useState(false);
  const [justFound, setJustFound] = useState(false); // one-shot flash when a scan resolves
  const [shownConfidence, setShownConfidence] = useState(0); // animated count-up of the confidence
  const [liveMode, setLiveMode] = useState(false); // live camera scanning is active
  const [liveStatus, setLiveStatus] = useState(""); // status text shown over the live feed
  const [liveAdded, setLiveAdded] = useState<{ id: string; card: CardRecord; foil: boolean }[]>([]); // this session's staged cards
  const [sessionFoil, setSessionFoil] = useState(false); // treat scanned cards as foil for this session
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]); // available video inputs
  const [deviceId, setDeviceId] = useState<string | null>(null); // selected camera
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewfinderRef = useRef<HTMLElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const liveActiveRef = useRef(false); // whether the continuous live-scan loop should keep running
  const lastAddedIdRef = useRef<string | null>(null); // last auto-added card (await removal before re-add)
  const lastAddedThumbRef = useRef<Float32Array | null>(null); // guide thumbnail of the added card
  const historyRef = useRef(FRESH_GUIDE_HISTORY); // what the guide has shown since that add
  const sessionFoilRef = useRef(false); // mirror of sessionFoil for the async loop
  const setFilterRef = useRef<string[] | null>(null); // mirror of setFilter for the async loop
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null); // reused tiny canvas for the thumbnail

  const isScanning = phase === "detecting" || phase === "analyzing"; // no card yet, frame/analysis
  const live = phase === "reading"; // preliminary card shown, OCR still refining

  async function scanFile(file: File) {
    if (!indexCount) {
      setMessage("Der Referenzindex ist noch nicht bereit.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setMatches([]);
    setOverlay(null);
    setMessage(null);
    setAdded(false);
    setJustFound(false);
    setAnalyzeProgress(0);
    setOcrProgress(0);
    setPhase("detecting");
    try {
      // The scan runs off the main thread and reports each stage live: the frame the instant it
      // is detected, image-analysis progress, the preliminary card the moment perceptual matching
      // resolves, then OCR progress before the refined final result replaces it.
      const result = await scanImage(file, (progress) => {
        setPhase(progress.phase);
        setOverlay(progress.overlay);
        if (progress.matches.length) setMatches(progress.matches);
        setAnalyzeProgress(progress.analyze);
        setOcrProgress(progress.ocr);
      }, undefined, setFilterRef.current);
      setMatches(result.matches);
      setOverlay(result.overlay);
      setPhase("done");
      if (result.matches.length) setJustFound(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Karte konnte nicht analysiert werden.");
      setPhase("idle");
    }
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Bitte wähle ein Foto aus.");
      return;
    }
    void scanFile(file);
  }

  // The guide rectangle in video-source pixels (object-fit: cover mapping).
  function guideCropRect(): { sx: number; sy: number; sw: number; sh: number } | null {
    const video = videoRef.current;
    const box = viewfinderRef.current;
    if (!video || !box || !video.videoWidth) return null;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const coverScale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
    const offsetX = (cw - video.videoWidth * coverScale) / 2;
    const offsetY = (ch - video.videoHeight * coverScale) / 2;
    const guideH = ch * LIVE_GUIDE_HEIGHT;
    const guideW = guideH * CARD_GUIDE_ASPECT;
    return {
      sx: ((cw - guideW) / 2 - offsetX) / coverScale,
      sy: ((ch - guideH) / 2 - offsetY) / coverScale,
      sw: guideW / coverScale,
      sh: guideH / coverScale,
    };
  }

  // Crop the live video down to exactly the guide rectangle, in card aspect — the scan pipeline
  // then treats it as a pre-cropped card.
  function captureGuideRegion(): Promise<Blob | null> {
    const video = videoRef.current;
    const rect = guideCropRect();
    if (!video || !rect) return Promise.resolve(null);
    const outH = 880;
    const outW = Math.round(outH * CARD_GUIDE_ASPECT);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const context = canvas.getContext("2d");
    if (!context) return Promise.resolve(null);
    context.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
  }

  // A tiny grayscale thumbnail of the guide region + its luma standard deviation, for cheap
  // motion (frame-to-frame difference) and card-presence (variation) detection — no matching.
  function captureGuideThumb(): { luma: Float32Array; stdev: number } | null {
    const video = videoRef.current;
    const rect = guideCropRect();
    if (!video || !rect) return null;
    const canvas = thumbCanvasRef.current ?? (thumbCanvasRef.current = document.createElement("canvas"));
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, THUMB_W, THUMB_H);
    const data = context.getImageData(0, 0, THUMB_W, THUMB_H).data;
    const luma = new Float32Array(THUMB_W * THUMB_H);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      luma[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sum += luma[p];
    }
    const mean = sum / luma.length;
    let variance = 0;
    for (const value of luma) variance += (value - mean) ** 2;
    return { luma, stdev: Math.sqrt(variance / luma.length) };
  }

  // Assess the guide over a fixed short window: is a card present, and how much is it moving right
  // now (two thumbnails ~90ms apart). Measuring over a constant interval keeps "motion" meaning
  // instantaneous hand-jitter/swap, independent of how long a match takes.
  async function assessGuide(): Promise<{ present: boolean; motion: number; luma: Float32Array } | null> {
    const first = captureGuideThumb();
    if (!first) return null;
    await sleep(90);
    const second = captureGuideThumb();
    if (!second) return { present: first.stdev >= LIVE_PRESENCE_STDEV, motion: Infinity, luma: first.luma };
    return {
      present: first.stdev >= LIVE_PRESENCE_STDEV && second.stdev >= LIVE_PRESENCE_STDEV,
      motion: thumbDiff(first.luma, second.luma),
      luma: second.luma,
    };
  }

  // Continuous multi-card scan. Every loop grabs a cheap thumbnail first: frames that are empty
  // (no card) or still moving are NOT matched at all, which removes the transition/swap/blur
  // frames. A steady frame is then scanned with perceptual matching and title OCR running
  // concurrently, and the card is added only if OCR actually read its name (see the gate notes
  // above). After an add the loop waits for the card to be moved out before the next one.
  async function liveScanLoop() {
    if (liveActiveRef.current) return; // already running
    liveActiveRef.current = true;
    lastAddedThumbRef.current = null;
    lastAddedIdRef.current = null;
    historyRef.current = FRESH_GUIDE_HISTORY;
    while (liveActiveRef.current) {
      const guide = await assessGuide();
      if (!guide) { await sleep(200); continue; }
      const { present, motion, luma } = guide;

      // Track what has happened since the last add, then use it for two different decisions:
      // whether it is worth scanning at all, and (further down) whether the *same* card may be
      // counted a second time. Note the added card's id is deliberately NOT cleared here — that
      // guard is what stops the card still lying in the guide from being added again.
      historyRef.current = observeGuide(historyRef.current, { present, luma }, lastAddedThumbRef.current, LIVE_CARD_CHANGE_DIFF);
      if (lastAddedThumbRef.current && !mayScanAgain(historyRef.current)) {
        setLiveStatus("✓ hinzugefügt – nächste Karte einlegen");
        await sleep(60);
        continue;
      }

      if (!present) {
        setLiveStatus("Karte in den Rahmen halten …");
        await sleep(80);
        continue;
      }
      // Big movement = a card swap; skip matching entirely. Hand-jitter passes.
      if (motion > LIVE_MOTION_THRESHOLD) {
        setLiveStatus("Karte ruhig halten …");
        await sleep(60);
        continue;
      }

      const blob = await captureGuideRegion();
      if (!blob) { await sleep(120); continue; }
      let scan: Awaited<ReturnType<typeof scanImage>> | null = null;
      try {
        // Perceptual matching and title OCR run concurrently inside this call; the OCR wait is
        // capped so an unreadable title costs a frame rather than seconds.
        scan = await scanImage(blob, undefined, LIVE_OCR_TIMEOUT_MS, setFilterRef.current);
      } catch {
        scan = null;
      }
      if (!liveActiveRef.current) break; // stopped mid-scan
      const top = scan?.matches[0];

      // The identity gate: add only when OCR actually read the card's name (a perceptual-only
      // result is never added on its own), and — for a repeat of the card just added — only when
      // it genuinely left the guide in between, which is what makes it a second copy rather than
      // the one still lying there.
      const isRepeat = top?.card.id === lastAddedIdRef.current;
      if (top && scan?.evidence.titleRead && (!isRepeat || mayAddSameCard(historyRef.current))) {
        const staged = stageScan(top.card, sessionFoilRef.current);
        lastAddedIdRef.current = top.card.id;
        lastAddedThumbRef.current = luma;
        historyRef.current = FRESH_GUIDE_HISTORY;
        setLiveAdded((entries) => [{ id: staged.id, card: staged.card, foil: staged.foil }, ...entries].slice(0, 30));
        setJustFound(true);
        setLiveStatus(`✓ ${top.card.name}`);
      } else {
        // Deliberately not showing the perceptual guess: it is the signal we just refused to
        // trust, and naming it would invite the user to accept a card the scanner rejected.
        setLiveStatus("Titel nicht lesbar – Karte gerade halten, mehr Licht");
      }
      await sleep(60);
    }
  }

  // Undo an auto-added card (removes one copy from the collection).
  function undoLiveAdd(index: number) {
    const entry = liveAdded[index];
    if (!entry) return;
    unstageScan(entry.id);
    setLiveAdded((previous) => previous.filter((_, i) => i !== index));
    if (lastAddedIdRef.current === entry.card.id) lastAddedIdRef.current = null; // allow re-scan
  }

  // Open a camera (a specific one by deviceId, else the rear camera) at high resolution, enable
  // continuous autofocus and detect torch support. Returns the stream, or throws.
  async function openCamera(preferredId?: string): Promise<MediaStream> {
    const video: MediaTrackConstraints = preferredId
      ? { deviceId: { exact: preferredId }, width: { ideal: 2560 }, height: { ideal: 1440 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = stream.getVideoTracks()[0];
    trackRef.current = track;
    streamRef.current = stream;
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }) | undefined;
    try {
      if (capabilities?.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints);
      }
    } catch {
      // focus control unsupported — carry on
    }
    setTorchSupported(Boolean(capabilities?.torch));
    setTorchOn(false);
    setDeviceId(track?.getSettings?.().deviceId ?? preferredId ?? null);
    return stream;
  }

  function attachStream() {
    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }

  async function startLive() {
    if (!indexCount) { setMessage("Der Referenzindex ist noch nicht bereit."); return; }
    setFilterRef.current = setFilter.length > 0 ? setFilter : null; // the loop starts before the effect runs
    try {
      await openCamera();
      // Camera labels are only populated once permission is granted, so enumerate now.
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setPreview(null); setMatches([]); setOverlay(null); setMessage(null); setAdded(false); setPhase("idle");
      setLiveAdded([]);
      setLiveMode(true);
    } catch {
      setMessage("Kamera nicht verfügbar – wähle stattdessen ein Foto.");
    }
  }

  // Switch to another physical camera (e.g. the macro lens) without leaving the live loop.
  async function switchCamera(id: string) {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    try {
      await openCamera(id);
      attachStream();
    } catch {
      setMessage("Kamerawechsel fehlgeschlagen.");
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  function stopLive() {
    liveActiveRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
    setLiveMode(false);
    setLiveStatus("");
    setTorchOn(false);
    setMatches([]);
    setJustFound(false);
  }

  // Resume live scanning after a match was shown (user dismissed it to scan the next card).
  function resumeLive() {
    setMatches([]);
    setOverlay(null);
    setJustFound(false);
    void liveScanLoop();
  }

  // Attach the stream to the <video> and start the scan loop once live mode is on.
  useEffect(() => {
    if (!liveMode) return;
    attachStream();
    void liveScanLoop();
    return () => { liveActiveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode]);

  // Release the camera if the scan screen unmounts (e.g. switching tabs).
  useEffect(() => () => {
    liveActiveRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // Keep the ref the async loop reads in sync with the session foil toggle.
  useEffect(() => { sessionFoilRef.current = sessionFoil; }, [sessionFoil]);
  // An empty selection means "all sets"; the matcher expects null for that.
  useEffect(() => { setFilterRef.current = setFilter.length > 0 ? setFilter : null; }, [setFilter]);

  const bestMatch = matches[0];
  const confidence = bestMatch ? Math.round(bestMatch.similarity * 100) : 0;

  // Count the confidence up to its target for a "live" feel, easing from whatever is shown now
  // (so a preliminary→refined update animates smoothly instead of snapping back to zero).
  const confidenceRef = useRef(0);
  useEffect(() => {
    const from = confidenceRef.current;
    const to = confidence;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 600);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (to - from) * eased);
      confidenceRef.current = value;
      setShownConfidence(value);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence, bestMatch?.card.id]);

  // Clear the one-shot "found" flash after it has played.
  useEffect(() => {
    if (!justFound) return;
    const timer = setTimeout(() => setJustFound(false), 1000);
    return () => clearTimeout(timer);
  }, [justFound]);

  // Live pipeline HUD: the three stages the scan passes through and the current action.
  const STAGES: { key: ScanPhase; label: string }[] = [
    { key: "detecting", label: "Rahmen" },
    { key: "analyzing", label: "Bildanalyse" },
    { key: "reading", label: "OCR" },
  ];
  const phaseOrder: Record<string, number> = { idle: -1, detecting: 0, analyzing: 1, reading: 2, done: 3 };
  const stageState = (key: ScanPhase) => {
    const order = phaseOrder[phase] - phaseOrder[key];
    return order > 0 ? "done" : order === 0 ? "active" : "todo";
  };
  const stageLabel =
    phase === "detecting" ? "Kartenrand erkennen"
    : phase === "analyzing" ? `Bild analysieren${analyzeProgress ? ` · ${Math.round(analyzeProgress * 100)}%` : " …"}`
    : phase === "reading" ? `Titel lesen (OCR) · ${Math.round(ocrProgress * 100)}%`
    : "";
  const stageFraction = phase === "reading" ? ocrProgress : phase === "analyzing" ? Math.max(0.12, analyzeProgress) : 0.08;

  return (
    <main className="min-h-svh bg-gradient-to-b from-[#141612] to-[#10110f] to-52% px-4 pt-[max(22px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))] lg:mx-auto lg:grid lg:max-w-[1560px] lg:content-start lg:gap-x-11 lg:gap-y-6 lg:px-12 lg:py-10 lg:[grid-template-areas:'head_head''view_side'] lg:[grid-template-columns:minmax(0,1.55fr)_minmax(380px,.8fr)]" data-scan-phase={phase}>
      <header className="mb-6 flex min-h-[52px] items-center justify-between px-1 lg:p-0 lg:[grid-area:head]">
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">VISUELLE ERKENNUNG</p>
          <Heading level={1}>Karte scannen</Heading>
        </div>
        <Badge color={indexStatus === "ready" ? "lime" : indexStatus === "error" ? "red" : "amber"}>
          <span className="size-1.5 rounded-full bg-current" />
          {indexStatus === "ready" ? (setFilter.length > 0 ? `${setFilter.length} SETS` : `ALLE SETS · ${indexCount.toLocaleString("de-DE")}`) : indexStatus === "loading" ? indexProgress : "Offline"}
        </Badge>
      </header>

      <section
        ref={viewfinderRef}
        className={`relative grid min-h-[410px] w-full place-items-center overflow-hidden rounded-[28px] border border-white/8 after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] after:bg-[length:28px_28px] after:content-[''] max-h-[750px]:min-h-[330px] lg:min-h-[min(74svh,780px)] lg:rounded-[32px] lg:[grid-area:view] ${preview || liveMode ? "bg-[#090a08]" : "bg-[radial-gradient(circle_at_50%_40%,#252920_0,#171914_50%,#11120f_100%)]"} ${justFound ? "before:pointer-events-none before:absolute before:inset-0 before:z-4 before:animate-found-flash before:rounded-[inherit] before:shadow-[inset_0_0_0_2px_var(--color-acid),inset_0_0_44px_rgba(213,254,82,.32),0_0_60px_rgba(213,254,82,.34)] before:content-['']" : ""} ${live ? "animate-live-glow" : ""}`}
      >
        {liveMode ? (
          <>
            <video ref={videoRef} className="absolute inset-0 z-0 size-full object-cover" autoPlay playsInline muted />
            <div className="pointer-events-none absolute top-1/2 left-1/2 z-2 aspect-[63/88] h-[84%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[2.5px] border-acid/90 shadow-[0_0_0_100vmax_rgba(6,7,5,.5),inset_0_0_22px_rgba(213,254,82,.2)]" />
            <div className="absolute top-3.5 right-3.5 left-3.5 z-4 flex items-center gap-2">
              {torchSupported && <button className={`grid size-[34px] shrink-0 place-items-center rounded-full border bg-[#0a0c09]/70 backdrop-blur-[6px] ${torchOn ? "border-acid bg-acid/20 text-acid shadow-[0_0_12px_rgba(213,254,82,.4)]" : "border-white/12 text-[#e7ecdb]"}`} onClick={toggleTorch} aria-label="Blitz/Licht"><BoltIcon className="size-[16px]" /></button>}
              {cameras.length > 1 && (
                <select className="max-w-[190px] min-w-0 rounded-[10px] border border-white/12 bg-[#0a0c09]/70 px-2.5 py-2 text-[11px] text-[#e7ecdb] backdrop-blur-[6px]" value={deviceId ?? ""} onChange={(event) => switchCamera(event.target.value)} aria-label="Kamera wählen">
                  {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Kamera ${index + 1}`}</option>)}
                </select>
              )}
              <button className="ml-auto grid size-[34px] shrink-0 place-items-center rounded-full border border-white/12 bg-[#0a0c09]/70 text-[#e7ecdb] backdrop-blur-[6px]" onClick={stopLive} aria-label="Live-Scan beenden"><XMarkIcon className="size-[18px]" /></button>
            </div>
            {!bestMatch && <div className="absolute bottom-4 left-1/2 z-4 flex -translate-x-1/2 items-center gap-2 rounded-full border border-acid/20 bg-[#0a0c09]/72 px-3.5 py-2 text-[11px] font-semibold text-[#e7ecdb] backdrop-blur-[8px]"><span className="size-2 animate-live-pulse rounded-full bg-acid shadow-[0_0_8px_var(--color-acid)]" />{liveStatus || "Karte in den Rahmen halten …"}</div>}
          </>
        ) : preview ? <img className="h-[410px] w-full object-contain brightness-78 max-h-[750px]:h-[330px] lg:h-[min(74svh,780px)]" src={preview} alt="Aufgenommene Karte" /> : <EmptyState
            variant="bare"
            className="relative z-1"
            icon={<ViewfinderCircleIcon />}
            title="Richte die Karte im Rahmen aus"
            description="Gleichmäßiges Licht liefert das beste Ergebnis."
          />}
        {preview && overlay && (
          <svg className="pointer-events-none absolute inset-0 z-2 size-full" viewBox={`0 0 ${overlay.width} ${overlay.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <polygon className="animate-ocr-reveal-late fill-live/18 stroke-live opacity-0 [stroke-dasharray:7_4] [stroke-width:1.75] [vector-effect:non-scaling-stroke]" points={quadPoints(overlay.ocr)} />
            {overlay.perspective && <polygon className="animate-ocr-reveal fill-none stroke-[#ff9d54] opacity-0 [stroke-dasharray:5_4] [stroke-width:2] [vector-effect:non-scaling-stroke]" points={quadPoints(overlay.perspective)} />}
            <polygon className="animate-frame-draw fill-none stroke-acid [filter:drop-shadow(0_0_4px_rgba(213,254,82,.5))] [stroke-dasharray:1] [stroke-dashoffset:1] [stroke-width:2.5] [vector-effect:non-scaling-stroke]" pathLength={1} points={quadPoints(overlay.crop)} />
          </svg>
        )}
        {!liveMode && <>
          <i className="absolute top-[21px] left-[21px] z-2 size-[35px] rounded-tl-[10px] border-t-2 border-l-2 border-acid [filter:drop-shadow(0_0_5px_rgba(213,254,82,.45))]" />
          <i className="absolute top-[21px] right-[21px] z-2 size-[35px] rounded-tr-[10px] border-t-2 border-r-2 border-acid [filter:drop-shadow(0_0_5px_rgba(213,254,82,.45))]" />
          <i className="absolute bottom-[21px] left-[21px] z-2 size-[35px] rounded-bl-[10px] border-b-2 border-l-2 border-acid [filter:drop-shadow(0_0_5px_rgba(213,254,82,.45))]" />
          <i className="absolute right-[21px] bottom-[21px] z-2 size-[35px] rounded-br-[10px] border-r-2 border-b-2 border-acid [filter:drop-shadow(0_0_5px_rgba(213,254,82,.45))]" />
        </>}
        {isScanning && <div className="absolute inset-0 z-5 grid place-items-center bg-[#070806]/34"><span className="absolute top-[14%] left-[10%] h-0.5 w-4/5 animate-scan-sweep bg-acid shadow-[0_0_14px_2px_rgba(213,254,82,.7)]" /></div>}
        {(isScanning || live) && (
          <div className="absolute top-[18px] left-1/2 z-6 flex w-[min(330px,84%)] -translate-x-1/2 animate-rise flex-col gap-[9px] rounded-2xl border border-acid/18 bg-[#0c0e0a]/84 px-3.5 py-3 shadow-[0_14px_34px_rgba(0,0,0,.42)] backdrop-blur-[13px]">
            <div className="flex gap-2">
              {STAGES.map((stage) => {
                const state = stageState(stage.key);
                return (
                  <span key={stage.key} className={`flex flex-1 items-center gap-1.5 text-[9px] font-extrabold tracking-[0.02em] transition-colors ${state === "active" ? "text-acid" : state === "done" ? "text-[#9aa48c]" : "text-[#686d5f]"}`}>
                    <i className={`size-[7px] shrink-0 rounded-full transition ${state === "active" ? "animate-live-pulse bg-acid shadow-[0_0_9px_var(--color-acid)]" : state === "done" ? "bg-acid" : "bg-[#3a3e33]"}`} />
                    {stage.label}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-[9px] text-[11px] font-semibold text-[#e9edda]"><span className="size-[13px] shrink-0 animate-spin-fast rounded-full border-2 border-acid/25 border-t-acid" />{stageLabel}</div>
            <ProgressBar progress={Math.round(stageFraction * 100)} />
          </div>
        )}
        {!preview && !liveMode && <div className="absolute right-[31px] bottom-[30px] z-3 flex items-center gap-[5px] rounded-[7px] border border-acid/18 bg-[#0b0c09]/75 px-[7px] py-[5px] font-mono text-[9px] text-[#a4b86a]"><BoltIcon className="size-[14px]" /> pHash · lokal</div>}
        {preview && overlay && !isScanning && <div className="absolute bottom-3.5 left-1/2 z-3 flex -translate-x-1/2 animate-legend-in gap-3.5 rounded-full bg-[#0a0c09]/72 px-3 py-1.5 opacity-0 backdrop-blur-[6px]">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#d3d6cc] before:size-3 before:rounded-[3px] before:border-2 before:border-acid before:content-['']">Crop</span>
            {overlay.perspective && <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#d3d6cc] before:size-3 before:rounded-[3px] before:border-[1.5px] before:border-dashed before:border-[#ff9d54] before:content-['']">Perspektive</span>}
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#d3d6cc] before:size-3 before:rounded-[3px] before:border-[1.5px] before:border-dashed before:border-live before:bg-live/18 before:content-['']">OCR-Titel</span>
          </div>}
      </section>

      <input ref={cameraInput} className="absolute size-px overflow-hidden [clip:rect(0,0,0,0)]" type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
      <input ref={galleryInput} className="absolute size-px overflow-hidden [clip:rect(0,0,0,0)]" type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} />

      <div className="flex flex-col gap-[18px] lg:sticky lg:top-10 lg:self-start lg:[grid-area:side]">
        {liveMode && (
          <section className="mx-1.5 mt-[-17px] animate-rise rounded-[22px] border border-line bg-[#1b1d19] p-4 shadow-[0_-10px_40px_rgba(0,0,0,.3)] lg:m-0">
            <div className="mb-3 flex items-center gap-3">
              <div><p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">LIVE-SCAN</p><Subheading>{liveAdded.length} {liveAdded.length === 1 ? "Karte" : "Karten"}</Subheading></div>
              <SwitchField className="ml-auto shrink-0">
                <Label className="!text-[11px]">Foil</Label>
                <Switch color="lime" checked={sessionFoil} onChange={setSessionFoil} />
              </SwitchField>
              <Button color="lime" onClick={() => { stopLive(); void navigate({ to: "/liste" }); }}><CheckIcon className="size-[18px]" /> Fertig</Button>
            </div>
            {liveAdded.length ? (
              <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                {liveAdded.map((entry, index) => (
                  <div key={entry.id} className="flex animate-rise items-center gap-[11px] rounded-xl border border-line bg-[#141512] p-2">
                    <CardImage card={entry.card} className="h-[53px] w-[38px] shrink-0 rounded-[5px]" />
                    <span className="flex min-w-0 flex-1 flex-col text-xs font-semibold text-[#e6e8df]">{entry.card.name}<small className="truncate text-[9px] font-medium text-[#757a6d]">{entry.card.setCode} · #{entry.card.collectorNumber}</small></span>
                    {entry.foil && <em className="shrink-0 text-[8px] font-black text-foil not-italic">FOIL</em>}
                    <button className="grid size-7 place-items-center rounded-full bg-[#292c26] text-[#a6aa9f]" aria-label="Rückgängig" onClick={() => undoLiveAdd(index)}><XMarkIcon className="size-[16px]" /></button>
                  </div>
                ))}
              </div>
            ) : <EmptyState variant="bare" title="Noch nichts gescannt" description="Halte Karten nacheinander in den Rahmen – jede wird automatisch erkannt und hinzugefügt." />}
          </section>
        )}

        {!bestMatch && !isScanning && !liveMode && (
          <section className="flex min-h-[130px] flex-col items-center justify-center gap-4 max-h-[750px]:min-h-[112px] lg:min-h-[220px] lg:rounded-3xl lg:border lg:border-dashed lg:border-white/10 lg:bg-white/2">
            {/* The shutter is the one control that stays bespoke: no library button carries a
                ring-around-a-fill at this size, and it is the primary affordance of the screen. */}
            <button
              className="grid size-[72px] place-items-center rounded-full border border-acid/44 disabled:opacity-45"
              disabled={indexStatus !== "ready"}
              onClick={() => void startLive()}
              aria-label="Live-Scan starten"
            >
              <span className="grid size-[58px] place-items-center rounded-full bg-acid text-[#161811] shadow-[0_9px_30px_rgba(213,254,82,.14)]">
                <CameraIcon className="size-7" />
              </span>
            </button>
            <div className="flex items-center gap-2">
              <Button plain disabled={indexStatus !== "ready"} onClick={() => galleryInput.current?.click()}>
                <PhotoIcon className="size-5" /> Foto wählen
              </Button>
              <Button plain onClick={() => void navigate({ to: "/scan" })}>
                {setFilter.length > 0 ? `${setFilter.length} Sets – ändern` : "Alle Sets – ändern"}
              </Button>
              {scans.length > 0 && (
                <Button plain onClick={() => void navigate({ to: "/liste" })}>
                  Liste ({scans.length})
                </Button>
              )}
            </div>
          </section>
        )}

        {message && <Text className="mx-1 my-3.5 rounded-xl border border-warn/20 bg-warn/7 px-3.5 py-3 !text-[11px] !text-[#e7a69f]">{message}</Text>}

        {bestMatch && !isScanning && !liveMode && (
          <section className={`relative z-6 mx-1.5 mt-[-17px] flyout rounded-[22px] border bg-[#1b1d19] p-[18px] lg:m-0 ${live ? "border-live/30 shadow-[0_-10px_40px_rgba(0,0,0,.3),0_0_0_1px_rgba(124,194,255,.14)]" : "border-line shadow-[0_-10px_40px_rgba(0,0,0,.3)]"}`}>
            <div className="mb-[15px] flex items-center gap-2.5">
              <div className={`grid size-9 place-items-center rounded-full ${live ? "animate-icon-pulse bg-live/14 text-live" : "bg-acid/12 text-acid"}`}>{live ? <SparklesIcon className="size-[19px]" /> : <CheckIcon className="size-[19px]" />}</div>
              <div><p className="mt-0 mb-0.5 text-[8px] font-extrabold tracking-[1.4px] text-acid">{live ? "LIVE · VORLÄUFIG" : "ÜBEREINSTIMMUNG"}</p><Subheading>{live ? "Karte erkannt …" : "Karte erkannt"}</Subheading></div>
              {live && <span className="ml-auto inline-flex items-center gap-[5px] rounded-full bg-live/14 px-2 py-1 text-[8px] font-extrabold tracking-[0.8px] text-live uppercase"><i className="size-1.5 animate-live-pulse rounded-full bg-live shadow-[0_0_8px_#7cc2ff]" />verfeinere</span>}
              <button className="ml-auto grid size-8 place-items-center rounded-full bg-[#292c26] text-[#a6aa9f]" onClick={() => { if (liveMode) { resumeLive(); } else { setPreview(null); setMatches([]); setOverlay(null); setPhase("idle"); } }} aria-label={liveMode ? "Weiter scannen" : "Schließen"}><XMarkIcon className="size-[18px]" /></button>
            </div>
            <div className="flex gap-3.5 rounded-[15px] border border-line bg-[#141512] p-3">
              <CardImage card={bestMatch.card} className="h-[101px] w-[72px] rounded-md shadow-[0_8px_18px_#090a08]" />
              <div className="min-w-0 flex-1 pt-[5px] pb-0.5">
                <div className="flex items-start justify-between gap-[5px]"><Subheading className="truncate">{bestMatch.card.name}</Subheading><ManaCost value={bestMatch.card.manaCost} /></div>
                <Text>{bestMatch.card.setName}</Text>
                <Text>{bestMatch.card.setCode} · #{bestMatch.card.collectorNumber}</Text>
                <div className="mt-3 flex items-center gap-2"><span className="flex-1"><ProgressBar progress={shownConfidence} /></span><Strong className="!text-[9px] !text-acid">{shownConfidence}%</Strong></div>
              </div>
            </div>
            <SwitchField className="mx-px my-3.5">
              <Label>Foil-Version</Label>
              <Description>Als glänzende Karte speichern</Description>
              <Switch color="lime" checked={foil} onChange={setFoil} />
            </SwitchField>
            <Button className="w-full" color={added ? "zinc" : "lime"} onClick={() => { stageScan(bestMatch.card, foil); setAdded(true); }}>{added ? <><CheckIcon className="size-[20px]" /> Hinzugefügt</> : <><PlusIcon className="size-[20px]" /> Zur Liste</>}</Button>
            {matches.length > 1 && <details className="mt-2.5 text-[10px] text-[#8b9083]"><summary className="cursor-pointer text-center">Andere mögliche Treffer</summary>{matches.slice(1).map((match) => <div key={match.card.id} className="mt-2 flex items-center gap-2"><CardImage card={match.card} className="h-[39px] w-7 rounded-[3px]" /><div><Strong className="block">{match.card.name}</Strong><Text>{Math.round(match.similarity * 100)}% ähnlich</Text></div></div>)}</details>}
          </section>
        )}
      </div>
    </main>
  );
}
