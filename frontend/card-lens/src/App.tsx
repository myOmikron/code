import { useEffect, useMemo, useRef, useState } from "react";
import { addCard, collectionValue, loadCollection, removeCard, saveCollection, totalCards } from "./collectionStore";
import { loadCardIndex, scanImage } from "./scanClient";
import type { CardQuad, ScanOverlay, ScanPhase } from "./scanClient";
import type { CardRecord, CollectionEntry, MatchCandidate } from "./types";

type IconName =
  | "cards"
  | "scan"
  | "layers"
  | "camera"
  | "image"
  | "search"
  | "check"
  | "spark"
  | "chevron"
  | "plus"
  | "close"
  | "bolt";

const iconPaths: Record<IconName, React.ReactNode> = {
  cards: <><rect x="5" y="4" width="12" height="16" rx="2"/><path d="m9 4 1-1h7a2 2 0 0 1 2 2v12l-2 1"/></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="8" y="7" width="8" height="10" rx="1.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z"/><circle cx="12" cy="12" r="4"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  spark: <><path d="m12 3-1.4 4.1L6.5 8.5l4.1 1.4L12 14l1.4-4.1 4.1-1.4-4.1-1.4L12 3Z"/><path d="m5.5 14-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8-.8-2.2Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function ManaCost({ value }: { value: string }) {
  const symbols = value.match(/\{([^}]+)\}/g)?.map((symbol) => symbol.slice(1, -1)) ?? [];
  return <span className="mana-cost">{symbols.map((symbol, index) => <span key={`${symbol}-${index}`} className={`mana mana-${symbol.toLowerCase()}`}>{symbol}</span>)}</span>;
}

function CardImage({ card, className = "" }: { card: CardRecord; className?: string }) {
  return <img className={`card-image ${className}`} src={card.imageUrl} alt={`${card.name}, ${card.setName}`} loading="lazy" />;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// SVG polygon `points` string for a quad, clockwise from the top-left.
function quadPoints(quad: CardQuad): string {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((p) => `${p.x},${p.y}`).join(" ");
}

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
const LIVE_REMOVAL_FRAMES = 2; // steady-gone frames (moved out / empty) required before the next add
// Cap on the title OCR wait per frame. Tesseract reads a legible title in ~200 ms but can grind
// for seconds on an unreadable one — exactly the frames we would refuse anyway. Cutting it short
// keeps every live frame well under a second and just retries on the next frame. The budget has
// to cover a failed title-bar read FOLLOWED by the full-art name banner read, which is the only
// way a full-art basic land is ever identified.
const LIVE_OCR_TIMEOUT_MS = 900;
const THUMB_W = 24;
const THUMB_H = 33;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ScanScreen({
  indexCount,
  setCount,
  indexStatus,
  indexProgress,
  onAdd,
  onRemove,
}: {
  indexCount: number;
  setCount: number;
  indexStatus: "loading" | "ready" | "error";
  indexProgress: string;
  onAdd: (card: CardRecord, foil: boolean) => void;
  onRemove: (cardId: string, foil: boolean) => void;
}) {
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
  const [liveAdded, setLiveAdded] = useState<{ card: CardRecord; foil: boolean }[]>([]); // this session's auto-added cards
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
  const awaitingRemovalRef = useRef(false); // true while waiting for the added card to leave the frame
  const removalStreakRef = useRef(0);
  const sessionFoilRef = useRef(false); // mirror of sessionFoil for the async loop
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
      });
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

  function thumbDiff(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
    return sum / a.length;
  }

  // Assess the guide over a fixed short window: is a card present, and how much is it moving right
  // now (two thumbnails ~90ms apart). Measuring over a constant interval keeps "motion" meaning
  // instantaneous hand-jitter/swap, independent of how long a match takes.
  async function assessGuide(): Promise<{ present: boolean; motion: number } | null> {
    const first = captureGuideThumb();
    if (!first) return null;
    await sleep(90);
    const second = captureGuideThumb();
    if (!second) return { present: first.stdev >= LIVE_PRESENCE_STDEV, motion: Infinity };
    return {
      present: first.stdev >= LIVE_PRESENCE_STDEV && second.stdev >= LIVE_PRESENCE_STDEV,
      motion: thumbDiff(first.luma, second.luma),
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
    awaitingRemovalRef.current = false;
    removalStreakRef.current = 0;
    while (liveActiveRef.current) {
      const guide = await assessGuide();
      if (!guide) { await sleep(200); continue; }
      const { present, motion } = guide;

      // After an add, wait until the card is moved out (empty guide or a swap movement) before next.
      if (awaitingRemovalRef.current) {
        removalStreakRef.current = !present || motion > LIVE_MOTION_THRESHOLD ? removalStreakRef.current + 1 : 0;
        if (removalStreakRef.current >= LIVE_REMOVAL_FRAMES) {
          awaitingRemovalRef.current = false;
          lastAddedIdRef.current = null;
          setLiveStatus("Nächste Karte in den Rahmen halten …");
        } else {
          setLiveStatus("✓ hinzugefügt – Karte herausnehmen");
        }
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
        scan = await scanImage(blob, undefined, LIVE_OCR_TIMEOUT_MS);
      } catch {
        scan = null;
      }
      if (!liveActiveRef.current) break; // stopped mid-scan
      const top = scan?.matches[0];

      // The identity gate: add only when OCR actually read the card's name. A perceptual-only
      // result is shown as a hint but never added on its own.
      if (top && scan?.evidence.titleRead && top.card.id !== lastAddedIdRef.current) {
        onAdd(top.card, sessionFoilRef.current);
        lastAddedIdRef.current = top.card.id;
        awaitingRemovalRef.current = true;
        removalStreakRef.current = 0;
        setLiveAdded((entries) => [{ card: top.card, foil: sessionFoilRef.current }, ...entries].slice(0, 30));
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
    onRemove(entry.card.id, entry.foil);
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
    <main className="screen scan-screen" data-scan-phase={phase}>
      <header className="topbar scan-topbar">
        <div>
          <p className="eyebrow">VISUELLE ERKENNUNG</p>
          <h1>Karte scannen</h1>
        </div>
        <span className={`index-pill ${indexStatus}`}><span />{indexStatus === "ready" ? `ALLE SETS · ${indexCount.toLocaleString("de-DE")}` : indexStatus === "loading" ? indexProgress : "Offline"}</span>
      </header>

      <section ref={viewfinderRef} className={`viewfinder ${preview || liveMode ? "has-preview" : ""} ${justFound ? "found" : ""} ${live ? "live" : ""}`}>
        {liveMode ? (
          <>
            <video ref={videoRef} className="live-video" autoPlay playsInline muted />
            <div className="live-guide" />
            <div className="live-topbar">
              {torchSupported && <button className={`live-ctrl ${torchOn ? "on" : ""}`} onClick={toggleTorch} aria-label="Blitz/Licht"><Icon name="bolt" size={16} /></button>}
              {cameras.length > 1 && (
                <select className="live-camera" value={deviceId ?? ""} onChange={(event) => switchCamera(event.target.value)} aria-label="Kamera wählen">
                  {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Kamera ${index + 1}`}</option>)}
                </select>
              )}
              <button className="live-ctrl live-stop" onClick={stopLive} aria-label="Live-Scan beenden"><Icon name="close" size={18} /></button>
            </div>
            {!bestMatch && <div className="live-status"><span className="live-dot" />{liveStatus || "Karte in den Rahmen halten …"}</div>}
          </>
        ) : preview ? <img src={preview} alt="Aufgenommene Karte" /> : <div className="viewfinder-empty"><div className="card-ghost"><span /></div><p>Richte die Karte innerhalb<br />des Rahmens aus</p><small>Gleichmäßiges Licht liefert das beste Ergebnis</small></div>}
        {preview && overlay && (
          <svg className="scan-regions" viewBox={`0 0 ${overlay.width} ${overlay.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <polygon className="region-ocr" points={quadPoints(overlay.ocr)} />
            {overlay.perspective && <polygon className="region-perspective" points={quadPoints(overlay.perspective)} />}
            <polygon className="region-crop" pathLength={1} points={quadPoints(overlay.crop)} />
          </svg>
        )}
        {!liveMode && <><i className="corner corner-tl" /><i className="corner corner-tr" /><i className="corner corner-bl" /><i className="corner corner-br" /></>}
        {isScanning && <div className="scan-overlay"><span className="scan-line" /></div>}
        {(isScanning || live) && (
          <div className="stage-hud">
            <div className="stage-steps">{STAGES.map((stage) => <span key={stage.key} className={`stage-step ${stageState(stage.key)}`}><i />{stage.label}</span>)}</div>
            <div className="stage-now"><span className="stage-spinner" />{stageLabel}</div>
            <div className="stage-bar"><i style={{ width: `${Math.round(stageFraction * 100)}%` }} /></div>
          </div>
        )}
        {!preview && !liveMode && <div className="hash-badge"><Icon name="bolt" size={14} /> pHash · lokal</div>}
        {preview && overlay && !isScanning && <div className="region-legend"><span className="lg-crop">Crop</span>{overlay.perspective && <span className="lg-perspective">Perspektive</span>}<span className="lg-ocr">OCR-Titel</span></div>}
      </section>

      <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
      <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} />

      <div className="scan-side">
        {liveMode && (
          <section className="live-batch">
            <div className="live-batch-head">
              <div><p className="eyebrow">LIVE-SCAN</p><h2>{liveAdded.length} {liveAdded.length === 1 ? "Karte" : "Karten"}</h2></div>
              <label className="foil-toggle live-foil"><span><strong>Foil</strong></span><input type="checkbox" checked={sessionFoil} onChange={(event) => setSessionFoil(event.target.checked)} /><i /></label>
              <button className="primary-button live-done" onClick={stopLive}><Icon name="check" size={18} /> Fertig</button>
            </div>
            {liveAdded.length ? (
              <div className="live-batch-list">
                {liveAdded.map((entry, index) => (
                  <div key={`${entry.card.id}-${index}`}>
                    <CardImage card={entry.card} />
                    <span>{entry.card.name}<small>{entry.card.setCode} · #{entry.card.collectorNumber}</small></span>
                    {entry.foil && <em>FOIL</em>}
                    <button className="icon-button" aria-label="Rückgängig" onClick={() => undoLiveAdd(index)}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="live-batch-empty">Halte Karten nacheinander in den Rahmen – jede wird automatisch erkannt und hinzugefügt.</p>}
          </section>
        )}

        {!bestMatch && !isScanning && !liveMode && (
          <section className="scan-actions">
            <button className="capture-button" disabled={indexStatus !== "ready"} onClick={startLive} aria-label="Live-Scan starten"><span><Icon name="camera" size={27} /></span></button>
            <button className="gallery-button" disabled={indexStatus !== "ready"} onClick={() => galleryInput.current?.click()}><Icon name="image" size={19} /> Foto wählen</button>
            {indexCount > 0 && <small className="demo-link">Live-Scan · Karte in den Rahmen halten</small>}
          </section>
        )}

        {message && <div className="notice">{message}</div>}

        {bestMatch && !isScanning && !liveMode && (
          <section className={`match-panel flyout ${live ? "is-live" : ""}`}>
            <div className="match-heading">
              <div className={`success-icon ${live ? "pulsing" : ""}`}><Icon name={live ? "spark" : "check"} size={19} /></div>
              <div><p>{live ? "LIVE · VORLÄUFIG" : "ÜBEREINSTIMMUNG"}</p><h2>{live ? "Karte erkannt …" : "Karte erkannt"}</h2></div>
              {live && <span className="live-tag"><i />verfeinere</span>}
              <button className="icon-button" onClick={() => { if (liveMode) { resumeLive(); } else { setPreview(null); setMatches([]); setOverlay(null); setPhase("idle"); } }} aria-label={liveMode ? "Weiter scannen" : "Schließen"}><Icon name="close" size={18} /></button>
            </div>
            <div className="match-card">
              <CardImage card={bestMatch.card} />
              <div className="match-copy">
                <div><h3>{bestMatch.card.name}</h3><ManaCost value={bestMatch.card.manaCost} /></div>
                <p>{bestMatch.card.setName}</p>
                <span>{bestMatch.card.setCode} · #{bestMatch.card.collectorNumber}</span>
                <div className="confidence"><span><i style={{ width: `${shownConfidence}%` }} /></span><strong>{shownConfidence}%</strong></div>
              </div>
            </div>
            <label className="foil-toggle"><span><strong>Foil-Version</strong><small>Als glänzende Karte speichern</small></span><input type="checkbox" checked={foil} onChange={(event) => setFoil(event.target.checked)} /><i /></label>
            <button className={`primary-button ${added ? "added" : ""}`} onClick={() => { onAdd(bestMatch.card, foil); setAdded(true); }}>{added ? <><Icon name="check" size={20} /> Hinzugefügt</> : <><Icon name="plus" size={20} /> Zur Sammlung</>}</button>
            {matches.length > 1 && <details className="alternatives"><summary>Andere mögliche Treffer</summary>{matches.slice(1).map((match) => <div key={match.card.id}><CardImage card={match.card} /><span>{match.card.name}<small>{Math.round(match.similarity * 100)}% ähnlich</small></span></div>)}</details>}
          </section>
        )}
      </div>
    </main>
  );
}

function CollectionScreen({ entries }: { entries: CollectionEntry[] }) {
  const [query, setQuery] = useState("");
  const filtered = entries.filter((entry) => `${entry.card.name} ${entry.card.setName}`.toLowerCase().includes(query.toLowerCase()));
  const colorCount = new Set(entries.flatMap((entry) => entry.card.colors)).size;

  return (
    <main className="screen collection-screen">
      <header className="topbar brand-topbar"><div className="brand-mark"><Icon name="search" size={19} /></div><div><p className="eyebrow">CARDLENS</p><h1>Meine Sammlung</h1></div><button className="avatar">OM</button></header>
      <section className="summary-card">
        <div className="summary-glow" />
        <p>SAMMLUNGSWERT</p>
        <h2>{formatCurrency(collectionValue(entries))}</h2>
        <div><span><strong>{totalCards(entries)}</strong>Karten</span><span><strong>{entries.length}</strong>Unikate</span><span><strong>{colorCount}</strong>Farben</span></div>
      </section>
      <label className="search-field"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sammlung durchsuchen" /></label>
      <div className="section-title"><div><p className="eyebrow">DEINE KARTEN</p><h2>{query ? `${filtered.length} Treffer` : "Zuletzt hinzugefügt"}</h2></div><button>Alle <Icon name="chevron" size={15} /></button></div>
      {filtered.length ? <section className="collection-list">{filtered.map((entry) => <article key={entry.card.id}><CardImage card={entry.card} /><div><div><h3>{entry.card.name}</h3><ManaCost value={entry.card.manaCost} /></div><p>{entry.card.setName}</p><small>{entry.card.setCode} · #{entry.card.collectorNumber}</small></div><aside><strong>×{entry.quantity + entry.foilQuantity}</strong><span>{formatCurrency((entry.card.priceEur ?? 0) * (entry.quantity + entry.foilQuantity))}</span>{entry.foilQuantity > 0 && <em>FOIL</em>}</aside></article>)}</section> : <section className="empty-state"><div><Icon name="cards" size={30} /></div><h3>{entries.length ? "Keine Karte gefunden" : "Noch ist dein Binder leer"}</h3><p>{entries.length ? "Probiere einen anderen Suchbegriff." : "Scanne deine erste Karte – das dauert nur einen Augenblick."}</p></section>}
    </main>
  );
}

function DecksScreen({ entries }: { entries: CollectionEntry[] }) {
  const colorGroups = useMemo(() => {
    const labels: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
    return Object.entries(labels).map(([color, label]) => ({ color, label, count: entries.filter((entry) => entry.card.colors.includes(color)).reduce((sum, entry) => sum + entry.quantity + entry.foilQuantity, 0) }));
  }, [entries]);
  return <main className="screen decks-screen"><header className="topbar"><div><p className="eyebrow">SMART STACKS</p><h1>Deck-Werkstatt</h1></div><button className="round-button"><Icon name="plus" size={20} /></button></header><section className="deck-hero"><span><Icon name="layers" size={28} /></span><p>DECKBEREIT</p><h2>Deine Karten.<br />Neue Möglichkeiten.</h2><small>Stelle Decks direkt aus deiner Sammlung zusammen.</small><button>Neues Deck anlegen <Icon name="chevron" size={16} /></button></section><div className="section-title"><div><p className="eyebrow">FARBVERTEILUNG</p><h2>Dein Kartenpool</h2></div></div><section className="color-grid">{colorGroups.map((group) => <article key={group.color} className={`color-${group.color.toLowerCase()}`}><i>{group.color}</i><span><strong>{group.count}</strong>{group.label}</span></article>)}</section><section className="tip-card"><Icon name="spark" size={22} /><span><strong>Lens Tipp</strong><p>Scanne weitere Karten, um passende Deckvorschläge freizuschalten.</p></span></section></main>;
}

export function App() {
  const [activeTab, setActiveTab] = useState<"collection" | "scan" | "decks">("scan");
  const [indexCount, setIndexCount] = useState(0);
  const [setCount, setSetCount] = useState(0);
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [indexProgress, setIndexProgress] = useState("Index laden");
  const [collection, setCollection] = useState<CollectionEntry[]>(loadCollection);

  useEffect(() => {
    let active = true;
    void loadCardIndex((done, total) => active && setIndexProgress(`${done.toLocaleString("de-DE")}/${total.toLocaleString("de-DE")} Routing`))
      .then((summary) => { if (active) { setIndexCount(summary.cardCount); setSetCount(summary.setCount); setIndexStatus("ready"); } })
      .catch(() => { if (active) setIndexStatus("error"); });
    return () => { active = false; };
  }, []);

  useEffect(() => saveCollection(collection), [collection]);

  function handleAdd(card: CardRecord, foil: boolean) {
    setCollection((current) => addCard(current, card, foil));
  }

  function handleRemove(cardId: string, foil: boolean) {
    setCollection((current) => removeCard(current, cardId, foil));
  }

  return <div className="app-shell">
    {activeTab === "collection" && <CollectionScreen entries={collection} />}
    {activeTab === "scan" && <ScanScreen indexCount={indexCount} setCount={setCount} indexStatus={indexStatus} indexProgress={indexProgress} onAdd={handleAdd} onRemove={handleRemove} />}
    {activeTab === "decks" && <DecksScreen entries={collection} />}
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <button className={activeTab === "collection" ? "active" : ""} onClick={() => setActiveTab("collection")}><Icon name="cards" /><span>Sammlung</span></button>
      <button className={`scan-nav ${activeTab === "scan" ? "active" : ""}`} onClick={() => setActiveTab("scan")}><i><Icon name="scan" size={25} /></i><span>Scannen</span></button>
      <button className={activeTab === "decks" ? "active" : ""} onClick={() => setActiveTab("decks")}><Icon name="layers" /><span>Decks</span></button>
    </nav>
  </div>;
}
