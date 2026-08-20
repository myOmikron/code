import {
    BoltIcon,
    CameraIcon,
    CheckIcon,
    ChevronLeftIcon,
    PhotoIcon,
    PlusIcon,
    SparklesIcon,
    ViewfinderCircleIcon,
    XMarkIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import {
    Badge,
    Button,
    Description,
    EmptyState,
    Heading,
    Label,
    PrimaryButton,
    ProgressBar,
    Strong,
    Subheading,
    Switch,
    SwitchField,
    Text,
} from "components";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FoilMark } from "src/components/card-attribute-badge";
import { CardChooser } from "src/components/card-chooser";
import { CardImage } from "src/components/card-image";
import { ManaCost } from "src/components/mana-cost";
import { PrintingPicker } from "src/components/printing-picker";
import { useCardIndex } from "src/context/card-index-context";
import { useScanScope } from "src/context/scan-scope-context";
import { useScanSessions } from "src/context/scan-sessions-context";
import { FRESH_GUIDE_HISTORY, mayAddSameCard, mayScanAgain, observeGuide, thumbDiff } from "src/utils/live-scan-gate";
import { scanImage } from "src/utils/scan-client";
import type { ScanOverlay, ScanPhase } from "src/utils/scan-client";
import type { CardRecord, MatchCandidate } from "src/types";
import { printingCoordinate, quadPoints } from "src/utils/format";

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

export const Route = createFileRoute("/scan/sessions/$sessionId/_scanner/live")({ component: ScanLiveRoute });

/**
 * The camera screen: continuous live scanning plus the single-photo fallback.
 *
 * @returns the page
 */
function ScanLiveRoute() {
    const [t] = useTranslation("live");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { sessionId } = Route.useParams();
    const { status: indexStatus, progress: indexProgress, cardCount: indexCount } = useCardIndex();
    const { sessions, addEntry, removeEntry, replaceEntryCard } = useScanSessions();
    const { codes: setFilter } = useScanScope();
    // How many scans the surrounding session holds — what the list button counts.
    const stagedCount = sessions.find((session) => session.id === sessionId)?.entries.length ?? 0;
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
    const [correctingLiveId, setCorrectingLiveId] = useState<string | null>(null); // live entry whose printing is being fixed
    const pausedForPickRef = useRef(false); // mirror of the above for the async loop
    // The async scan loop outlives a render, so it must not close over a stale `t`.
    const tRef = useRef(t);
    tRef.current = t;

    const isScanning = phase === "detecting" || phase === "analyzing"; // no card yet, frame/analysis
    const live = phase === "reading"; // preliminary card shown, OCR still refining

    /**
     * Stages a freshly recognised card into the surrounding session
     *
     * @param card
     * @param foil the scan's foil toggle
     * @param alternatives the scan's runners-up
     * @returns what the live list shows, so the caller can undo exactly this add
     */
    function stageScan(card: CardRecord, foil: boolean, alternatives: CardRecord[] = []) {
        const entry = addEntry(sessionId, card, foil, alternatives);
        return { id: entry.id, card: entry.card, foil: entry.finish === "Foil" };
    }

    /**
     * Removes one staged scan from the surrounding session
     *
     * @param id the entry to drop
     */
    function unstageScan(id: string) {
        removeEntry(sessionId, id);
    }

    /**
     * Corrects a staged scan to another printing
     *
     * @param id the entry to correct
     * @param card the printing the user picked
     */
    function replaceCard(id: string, card: CardRecord) {
        replaceEntryCard(sessionId, id, card);
    }

    /**
     * Runs the full scan pipeline over a single still photo
     *
     * @param file the chosen image
     */
    async function scanFile(file: File) {
        if (!indexCount) {
            setMessage(tg("error.index-not-ready"));
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
            const result = await scanImage(
                file,
                (progress) => {
                    setPhase(progress.phase);
                    setOverlay(progress.overlay);
                    if (progress.matches.length) setMatches(progress.matches);
                    setAnalyzeProgress(progress.analyze);
                    setOcrProgress(progress.ocr);
                },
                undefined,
                setFilterRef.current,
            );
            setMatches(result.matches);
            setOverlay(result.overlay);
            setPhase("done");
            if (result.matches.length) setJustFound(true);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : t("error.scan-failed"));
            setPhase("idle");
        }
    }

    /**
     * Validates a file picked from the gallery and hands it to the scanner
     *
     * @param file the picked file, if any
     */
    function handleFile(file?: File) {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setMessage(t("error.pick-photo"));
            return;
        }
        void scanFile(file);
    }

    /**
     * The guide rectangle in video-source pixels (object-fit: cover mapping)
     *
     * @returns the source rectangle, or null while the video has no frame
     */
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

    /**
     * Crops the live video down to exactly the guide rectangle, in card aspect — the scan pipeline
     * then treats it as a pre-cropped card
     *
     * @returns the cropped frame, or null while the video has no frame
     */
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

    /**
     * A tiny grayscale thumbnail of the guide region + its luma standard deviation, for cheap
     * motion (frame-to-frame difference) and card-presence (variation) detection — no matching
     *
     * @returns the thumbnail, or null while the video has no frame
     */
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

    /**
     * Assesses the guide over a fixed short window: is a card present, and how much is it moving
     * right now (two thumbnails ~90ms apart)
     *
     * Measuring over a constant interval keeps "motion" meaning instantaneous hand-jitter/swap,
     * independent of how long a match takes.
     *
     * @returns the assessment, or null while the video has no frame
     */
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

    /**
     * Continuous multi-card scan
     *
     * Every loop grabs a cheap thumbnail first: frames that are empty (no card) or still moving are
     * NOT matched at all, which removes the transition/swap/blur frames. A steady frame is then
     * scanned with perceptual matching and title OCR running concurrently, and the card is added
     * only if OCR actually read its name (see the gate notes above). After an add the loop waits
     * for the card to be moved out before the next one.
     */
    async function liveScanLoop() {
        if (liveActiveRef.current) return; // already running
        liveActiveRef.current = true;
        lastAddedThumbRef.current = null;
        lastAddedIdRef.current = null;
        historyRef.current = FRESH_GUIDE_HISTORY;
        while (liveActiveRef.current) {
            // The picker is a modal over a running scanner: pause matching while it is open, or cards
            // keep landing in the very list the user is correcting.
            if (pausedForPickRef.current) {
                setLiveStatus(tRef.current("label.paused-picking"));
                await sleep(150);
                continue;
            }
            const guide = await assessGuide();
            if (!guide) {
                await sleep(200);
                continue;
            }
            const { present, motion, luma } = guide;

            // Track what has happened since the last add, then use it for two different decisions:
            // whether it is worth scanning at all, and (further down) whether the *same* card may be
            // counted a second time. Note the added card's id is deliberately NOT cleared here — that
            // guard is what stops the card still lying in the guide from being added again.
            historyRef.current = observeGuide(
                historyRef.current,
                { present, luma },
                lastAddedThumbRef.current,
                LIVE_CARD_CHANGE_DIFF,
            );
            if (lastAddedThumbRef.current && !mayScanAgain(historyRef.current)) {
                setLiveStatus(tRef.current("label.added-next-card"));
                await sleep(60);
                continue;
            }

            if (!present) {
                setLiveStatus(tRef.current("label.hold-card-in-frame"));
                await sleep(80);
                continue;
            }
            // Big movement = a card swap; skip matching entirely. Hand-jitter passes.
            if (motion > LIVE_MOTION_THRESHOLD) {
                setLiveStatus(tRef.current("label.hold-still"));
                await sleep(60);
                continue;
            }

            const blob = await captureGuideRegion();
            if (!blob) {
                await sleep(120);
                continue;
            }
            let scan: Awaited<ReturnType<typeof scanImage>> | null;
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
                setLiveAdded((entries) =>
                    [{ id: staged.id, card: staged.card, foil: staged.foil }, ...entries].slice(0, 30),
                );
                setJustFound(true);
                setLiveStatus(tRef.current("label.added-card", { name: top.card.name }));
            } else {
                // Deliberately not showing the perceptual guess: it is the signal we just refused to
                // trust, and naming it would invite the user to accept a card the scanner rejected.
                setLiveStatus(tRef.current("label.title-unreadable"));
            }
            await sleep(60);
        }
    }

    const correctingLive = liveAdded.find((entry) => entry.id === correctingLiveId) ?? null;

    /**
     * Closes the printing picker and resumes the live loop
     */
    function closeLivePicker() {
        pausedForPickRef.current = false;
        setCorrectingLiveId(null);
    }

    /**
     * Corrects the printing of a card the live loop added
     *
     * `lastAddedIdRef` is deliberately left alone: it tracks what the camera saw, not what the entry
     * now says, and clearing it would let the card still lying in the guide be added a second time.
     *
     * @param card the printing the user picked
     */
    function correctLivePrinting(card: CardRecord) {
        if (!correctingLive) return;
        replaceCard(correctingLive.id, card);
        setLiveAdded((entries) =>
            entries.map((entry) => (entry.id === correctingLive.id ? { ...entry, card } : entry)),
        );
        closeLivePicker();
    }

    /**
     * Undoes an auto-added card (removes one copy from the collection)
     *
     * @param index position in the session list
     */
    function undoLiveAdd(index: number) {
        const entry = liveAdded[index];
        if (!entry) return;
        unstageScan(entry.id);
        setLiveAdded((previous) => previous.filter((_, i) => i !== index));
        if (lastAddedIdRef.current === entry.card.id) lastAddedIdRef.current = null; // allow re-scan
    }

    /**
     * Opens a camera (a specific one by deviceId, else the rear camera) at high resolution, enables
     * continuous autofocus and detects torch support
     *
     * @param preferredId the camera to open, or undefined for the rear camera
     *
     * @returns the opened stream
     */
    async function openCamera(preferredId?: string): Promise<MediaStream> {
        const video: MediaTrackConstraints = preferredId
            ? { deviceId: { exact: preferredId }, width: { ideal: 2560 }, height: { ideal: 1440 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        streamRef.current = stream;
        const capabilities = track?.getCapabilities?.() as
            | (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean })
            | undefined;
        try {
            if (capabilities?.focusMode?.includes("continuous")) {
                await track.applyConstraints({
                    advanced: [{ focusMode: "continuous" }],
                } as unknown as MediaTrackConstraints);
            }
        } catch {
            // focus control unsupported — carry on
        }
        setTorchSupported(Boolean(capabilities?.torch));
        setTorchOn(false);
        setDeviceId(track?.getSettings?.().deviceId ?? preferredId ?? null);
        return stream;
    }

    /**
     * Hands the open stream to the `<video>` element and starts playback
     */
    function attachStream() {
        const video = videoRef.current;
        if (video && streamRef.current) {
            video.srcObject = streamRef.current;
            void video.play().catch(() => undefined);
        }
    }

    /**
     * Opens the camera and switches the screen into live-scan mode
     */
    async function startLive() {
        if (!indexCount) {
            setMessage(tg("error.index-not-ready"));
            return;
        }
        setFilterRef.current = setFilter.length > 0 ? setFilter : null; // the loop starts before the effect runs
        try {
            await openCamera();
            // Camera labels are only populated once permission is granted, so enumerate now.
            const devices = await navigator.mediaDevices.enumerateDevices();
            setCameras(devices.filter((d) => d.kind === "videoinput"));
            setPreview(null);
            setMatches([]);
            setOverlay(null);
            setMessage(null);
            setAdded(false);
            setPhase("idle");
            setLiveAdded([]);
            setLiveMode(true);
        } catch {
            setMessage(t("error.camera-unavailable"));
        }
    }

    /**
     * Switches to another physical camera (e.g. the macro lens) without leaving the live loop
     *
     * @param id the camera's device id
     */
    async function switchCamera(id: string) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        try {
            await openCamera(id);
            attachStream();
        } catch {
            setMessage(t("error.camera-switch-failed"));
        }
    }

    /**
     * Turns the camera's torch on or off
     */
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

    /**
     * Stops the live loop and releases the camera
     */
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

    /**
     * Resumes live scanning after a match was shown (user dismissed it to scan the next card)
     */
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
        return () => {
            liveActiveRef.current = false;
        };
        // Deliberately keyed on liveMode alone: re-running this on every render of the loop's
        // dependencies would restart the camera mid-scan.
    }, [liveMode]);

    // Release the camera if the scan screen unmounts (e.g. switching tabs).
    useEffect(
        () => () => {
            liveActiveRef.current = false;
            streamRef.current?.getTracks().forEach((track) => track.stop());
        },
        [],
    );

    // Keep the ref the async loop reads in sync with the session foil toggle.
    useEffect(() => {
        sessionFoilRef.current = sessionFoil;
    }, [sessionFoil]);
    // An empty selection means "all sets"; the matcher expects null for that.
    useEffect(() => {
        setFilterRef.current = setFilter.length > 0 ? setFilter : null;
    }, [setFilter]);

    const topMatch = matches[0];
    // Which candidate the user has settled on. Reset whenever a new scan comes in.
    const [chosenId, setChosenId] = useState<string | null>(null);
    const bestMatch = matches.find((match) => match.card.id === chosenId) ?? topMatch;
    // A printing picked by hand, which may be one the scan never ranked — so it is a card, not a
    // candidate, and it wins over `bestMatch` for both display and staging.
    const [pickedPrinting, setPickedPrinting] = useState<CardRecord | null>(null);
    const [pickingPrinting, setPickingPrinting] = useState(false);
    const shownCard = pickedPrinting ?? bestMatch?.card ?? null;

    // A new scan invalidates the previous choice; keying on the top match covers every path that
    // produces one (still photo, live loop, resuming after a result was dismissed).
    useEffect(() => {
        setChosenId(null);
        setPickedPrinting(null);
    }, [topMatch?.card.id]);
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
        // `confidenceRef` is read on purpose without being a dependency: the animation eases from
        // whatever is on screen right now.
    }, [confidence, bestMatch?.card.id]);

    // Clear the one-shot "found" flash after it has played.
    useEffect(() => {
        if (!justFound) return;
        const timer = setTimeout(() => setJustFound(false), 1000);
        return () => clearTimeout(timer);
    }, [justFound]);

    // Live pipeline HUD: the three stages the scan passes through and the current action.
    const stages: { key: ScanPhase; label: string }[] = useMemo(
        () => [
            { key: "detecting", label: t("label.stage-frame") },
            { key: "analyzing", label: t("label.stage-analysis") },
            { key: "reading", label: t("label.stage-ocr") },
        ],
        [t],
    );
    const phaseOrder: Record<string, number> = { idle: -1, detecting: 0, analyzing: 1, reading: 2, done: 3 };
    const stageState = (key: ScanPhase) => {
        const order = phaseOrder[phase] - phaseOrder[key];
        return order > 0 ? "done" : order === 0 ? "active" : "todo";
    };
    const stageLabel =
        phase === "detecting"
            ? t("label.detect-card-edge")
            : phase === "analyzing"
              ? analyzeProgress
                  ? t("label.analyzing-image-progress", { percent: Math.round(analyzeProgress * 100) })
                  : t("label.analyzing-image")
              : phase === "reading"
                ? t("label.reading-title", { percent: Math.round(ocrProgress * 100) })
                : "";
    const stageFraction =
        phase === "reading" ? ocrProgress : phase === "analyzing" ? Math.max(0.12, analyzeProgress) : 0.08;

    return (
        <main
            className="min-h-svh bg-(--surface-page) px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] lg:mx-auto lg:grid lg:max-w-[1440px] lg:[grid-template-columns:minmax(0,1.55fr)_minmax(380px,0.8fr)] lg:content-start lg:gap-x-10 lg:gap-y-6 lg:px-12 lg:py-10 lg:[grid-template-areas:'head_head''view_side']"
            data-scan-phase={phase}
        >
            <header className="mb-4 flex items-center justify-between gap-3 lg:mb-0 lg:[grid-area:head]">
                <div className="flex min-w-0 items-center gap-1">
                    <Button
                        plain
                        aria-label={t("accessibility.to-session")}
                        onClick={() => void navigate({ to: "/scan/sessions/$sessionId", params: { sessionId } })}
                    >
                        <ChevronLeftIcon className="size-5" />
                    </Button>
                    <Heading level={1} className="truncate">
                        {t("heading.scan-card")}
                    </Heading>
                </div>
                <Badge color={indexStatus === "ready" ? "blue" : indexStatus === "error" ? "red" : "amber"}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {indexStatus === "ready"
                        ? setFilter.length > 0
                            ? t("label.sets-selected", { amount: setFilter.length })
                            : t("label.all-sets-count", { amount: indexCount.toLocaleString("de-DE") })
                        : indexStatus === "loading"
                          ? indexProgress
                          : t("label.offline")}
                </Badge>
            </header>

            <section
                ref={viewfinderRef}
                className={clsx(
                    "relative grid min-h-[420px] w-full place-items-center overflow-hidden rounded-2xl border transition-shadow lg:min-h-[min(74svh,780px)] lg:[grid-area:view]",
                    preview || liveMode
                        ? "border-zinc-950/20 bg-zinc-950 dark:border-white/10"
                        : "border-dashed border-zinc-950/15 bg-zinc-50 dark:border-white/15 dark:bg-zinc-900",
                    // One-shot feedback the moment a scan resolves.
                    justFound && "ring-brand-500/70 ring-4",
                )}
            >
                {liveMode ? (
                    <>
                        <video
                            ref={videoRef}
                            className="absolute inset-0 z-0 size-full object-cover"
                            autoPlay
                            playsInline
                            muted
                        />
                        {/* The guide the crop math mirrors: `captureGuideRegion` assumes exactly this
                            63:88 box at 84% of the viewfinder height (LIVE_GUIDE_HEIGHT). */}
                        <div className="border-brand-400 pointer-events-none absolute top-1/2 left-1/2 z-2 aspect-[63/88] h-[84%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 shadow-[0_0_0_100vmax_rgba(9,9,11,0.5)]" />
                        {/* Controls float on the video, so their colors are fixed dark regardless of theme. */}
                        <div className="absolute top-3 right-3 left-3 z-4 flex items-center gap-2">
                            {torchSupported && (
                                <button
                                    className={clsx(
                                        "grid size-9 shrink-0 place-items-center rounded-full border backdrop-blur-sm",
                                        torchOn
                                            ? "border-brand-400 bg-brand-500 text-white"
                                            : "border-white/20 bg-zinc-950/60 text-white",
                                    )}
                                    onClick={toggleTorch}
                                    aria-label={t("accessibility.torch")}
                                >
                                    <BoltIcon className="size-4" />
                                </button>
                            )}
                            {cameras.length > 1 && (
                                <select
                                    className="max-w-[190px] min-w-0 rounded-lg border border-white/20 bg-zinc-950/60 px-2.5 py-2 text-xs text-white backdrop-blur-sm"
                                    value={deviceId ?? ""}
                                    onChange={(event) => switchCamera(event.target.value)}
                                    aria-label={t("accessibility.choose-camera")}
                                >
                                    {cameras.map((camera, index) => (
                                        <option key={camera.deviceId} value={camera.deviceId}>
                                            {camera.label || t("label.camera-fallback", { index: index + 1 })}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                className="ml-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/20 bg-zinc-950/60 text-white backdrop-blur-sm"
                                onClick={stopLive}
                                aria-label={t("accessibility.stop-live-scan")}
                            >
                                <XMarkIcon className="size-5" />
                            </button>
                        </div>
                        {!bestMatch && (
                            <div className="absolute bottom-4 left-1/2 z-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-950/70 px-3.5 py-2 text-xs font-medium text-white backdrop-blur-sm">
                                <span className="bg-brand-400 size-2 animate-pulse rounded-full" />
                                {liveStatus || t("label.hold-card-in-frame")}
                            </div>
                        )}
                    </>
                ) : preview ? (
                    <img
                        className="h-[420px] w-full object-contain lg:h-[min(74svh,780px)]"
                        src={preview}
                        alt={t("accessibility.captured-card")}
                    />
                ) : (
                    <EmptyState
                        variant="bare"
                        className="relative z-1 px-6"
                        icon={<ViewfinderCircleIcon />}
                        title={t("heading.align-card")}
                        description={t("description.even-light")}
                    />
                )}
                {preview && overlay && (
                    <svg
                        className="pointer-events-none absolute inset-0 z-2 size-full"
                        viewBox={`0 0 ${overlay.width} ${overlay.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden="true"
                    >
                        <polygon
                            className="fill-sky-400/15 stroke-sky-400 [stroke-width:1.75] [stroke-dasharray:7_4] [vector-effect:non-scaling-stroke]"
                            points={quadPoints(overlay.ocr)}
                        />
                        {overlay.perspective && (
                            <polygon
                                className="fill-none stroke-orange-400 [stroke-width:2] [stroke-dasharray:5_4] [vector-effect:non-scaling-stroke]"
                                points={quadPoints(overlay.perspective)}
                            />
                        )}
                        <polygon
                            className="stroke-brand-400 fill-none [stroke-width:2.5] [vector-effect:non-scaling-stroke]"
                            points={quadPoints(overlay.crop)}
                        />
                    </svg>
                )}
                {isScanning && <div className="absolute inset-0 z-5 bg-zinc-950/30" />}
                {(isScanning || live) && (
                    <div className="absolute top-3 left-1/2 z-6 flex w-[min(340px,88%)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3.5 py-3 backdrop-blur-sm">
                        <div className="flex gap-2">
                            {stages.map((stage) => {
                                const state = stageState(stage.key);
                                return (
                                    <span
                                        key={stage.key}
                                        className={clsx(
                                            "flex flex-1 items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase transition-colors",
                                            state === "active"
                                                ? "text-brand-300"
                                                : state === "done"
                                                  ? "text-zinc-400"
                                                  : "text-zinc-600",
                                        )}
                                    >
                                        <i
                                            className={clsx(
                                                "size-1.5 shrink-0 rounded-full",
                                                state === "active"
                                                    ? "bg-brand-400 animate-pulse"
                                                    : state === "done"
                                                      ? "bg-brand-400"
                                                      : "bg-zinc-600",
                                            )}
                                        />
                                        {stage.label}
                                    </span>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                            <span className="border-brand-400/25 border-t-brand-400 size-3.5 shrink-0 animate-spin rounded-full border-2" />
                            {stageLabel}
                        </div>
                        <ProgressBar progress={Math.round(stageFraction * 100)} />
                    </div>
                )}
                {preview && overlay && !isScanning && (
                    <div className="absolute bottom-3.5 left-1/2 z-3 flex -translate-x-1/2 gap-3.5 rounded-full bg-zinc-950/70 px-3 py-1.5 backdrop-blur-sm">
                        <span className="before:border-brand-400 inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-200 before:size-3 before:rounded-[3px] before:border-2 before:content-['']">
                            {t("label.legend-crop")}
                        </span>
                        {overlay.perspective && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-200 before:size-3 before:rounded-[3px] before:border-[1.5px] before:border-dashed before:border-orange-400 before:content-['']">
                                {t("label.legend-perspective")}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-200 before:size-3 before:rounded-[3px] before:border-[1.5px] before:border-dashed before:border-sky-400 before:bg-sky-400/15 before:content-['']">
                            {t("label.legend-ocr-title")}
                        </span>
                    </div>
                )}
            </section>

            <input
                ref={cameraInput}
                className="absolute size-px overflow-hidden [clip:rect(0,0,0,0)]"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <input
                ref={galleryInput}
                className="absolute size-px overflow-hidden [clip:rect(0,0,0,0)]"
                type="file"
                accept="image/*"
                onChange={(event) => handleFile(event.target.files?.[0])}
            />

            <div className="mt-4 flex flex-col gap-4 lg:sticky lg:top-10 lg:mt-0 lg:self-start lg:[grid-area:side]">
                {liveMode && (
                    <section className="rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10">
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <Text className="!text-xs">{t("label.live-scan")}</Text>
                                <Subheading>
                                    {tg("label.cards", { count: liveAdded.length, amount: liveAdded.length })}
                                </Subheading>
                            </div>
                            <SwitchField className="shrink-0">
                                <Label>{tg("label.foil")}</Label>
                                <Switch color="blue" checked={sessionFoil} onChange={setSessionFoil} />
                            </SwitchField>
                            <PrimaryButton
                                onClick={() => {
                                    stopLive();
                                    void navigate({ to: "/scan/sessions/$sessionId", params: { sessionId } });
                                }}
                            >
                                <CheckIcon className="size-4" /> {t("button.done")}
                            </PrimaryButton>
                        </div>
                        {liveAdded.length ? (
                            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                                {liveAdded.map((entry, index) => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center gap-3 rounded-(--radius-control) bg-(--surface-muted) p-2 ring-1 ring-zinc-950/5 dark:ring-white/10"
                                    >
                                        <button
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                            aria-label={t("accessibility.change-printing", { name: entry.card.name })}
                                            onClick={() => {
                                                pausedForPickRef.current = true;
                                                setCorrectingLiveId(entry.id);
                                            }}
                                        >
                                            <CardImage
                                                card={entry.card}
                                                className="h-[53px] w-[38px] shrink-0 rounded-[5px]"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <Strong className="block truncate !text-sm">{entry.card.name}</Strong>
                                                <Text className="truncate !text-xs">
                                                    {printingCoordinate(entry.card)}
                                                </Text>
                                            </span>
                                        </button>
                                        {entry.foil && <FoilMark finish="Foil" />}
                                        <Button
                                            plain
                                            aria-label={t("accessibility.undo")}
                                            onClick={() => undoLiveAdd(index)}
                                        >
                                            <XMarkIcon className="size-5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                variant="bare"
                                title={tg("heading.nothing-scanned")}
                                description={t("description.live-empty")}
                            />
                        )}
                    </section>
                )}

                {!bestMatch && !isScanning && !liveMode && (
                    <section className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-950/10 px-4 py-8 lg:min-h-[220px] dark:border-white/10">
                        {/* The shutter is the one control that stays bespoke: no library button carries a
                            ring-around-a-fill at this size, and it is the primary affordance of the screen. */}
                        <button
                            className="border-brand-500/40 grid size-[72px] place-items-center rounded-full border-2 disabled:opacity-45"
                            disabled={indexStatus !== "ready"}
                            onClick={() => void startLive()}
                            aria-label={t("accessibility.start-live-scan")}
                        >
                            <span className="bg-brand-600 grid size-[58px] place-items-center rounded-full text-white shadow-sm">
                                <CameraIcon className="size-7" />
                            </span>
                        </button>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button
                                plain
                                disabled={indexStatus !== "ready"}
                                onClick={() => galleryInput.current?.click()}
                            >
                                <PhotoIcon className="size-5" /> {t("button.choose-photo")}
                            </Button>
                            <Button
                                plain
                                onClick={() =>
                                    void navigate({ to: "/scan/sessions/$sessionId/scope", params: { sessionId } })
                                }
                            >
                                {setFilter.length > 0
                                    ? t("button.change-sets", { amount: setFilter.length })
                                    : t("button.change-all-sets")}
                            </Button>
                            {stagedCount > 0 && (
                                <Button
                                    plain
                                    onClick={() =>
                                        void navigate({ to: "/scan/sessions/$sessionId", params: { sessionId } })
                                    }
                                >
                                    {t("button.list", { amount: stagedCount })}
                                </Button>
                            )}
                        </div>
                    </section>
                )}

                {message && (
                    <Text className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 !text-xs !text-amber-700 dark:!text-amber-300">
                        {message}
                    </Text>
                )}

                {shownCard && bestMatch && !isScanning && !liveMode && (
                    <section
                        className={clsx(
                            "rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1",
                            live ? "ring-(--color-info)/40" : "ring-zinc-950/5 dark:ring-white/10",
                        )}
                    >
                        <div className="mb-4 flex items-center gap-2.5">
                            <div
                                className={clsx(
                                    "grid size-9 shrink-0 place-items-center rounded-full",
                                    live
                                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                        : "bg-brand-500/15 text-brand-600 dark:text-brand-400",
                                )}
                            >
                                {live ? <SparklesIcon className="size-5" /> : <CheckIcon className="size-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <Text className="!text-xs">
                                    {live ? t("label.live-preliminary") : t("label.match")}
                                </Text>
                                <Subheading className="truncate">
                                    {live ? t("heading.card-recognized-live") : t("heading.card-recognized")}
                                </Subheading>
                            </div>
                            {live && (
                                <Badge color="sky">
                                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                                    {t("label.refining")}
                                </Badge>
                            )}
                            <Button
                                plain
                                onClick={() => {
                                    if (liveMode) {
                                        resumeLive();
                                    } else {
                                        setPreview(null);
                                        setMatches([]);
                                        setOverlay(null);
                                        setPhase("idle");
                                    }
                                }}
                                aria-label={liveMode ? t("accessibility.continue-scanning") : tg("button.close")}
                            >
                                <XMarkIcon className="size-5" />
                            </Button>
                        </div>
                        {/* Pressing the card opens every printing of it — the printing is what the scanner is
                            least sure about, and its three candidates do not always contain the right one. */}
                        <button
                            className="flex w-full gap-3.5 rounded-(--radius-control) bg-(--surface-muted) p-3 text-left ring-1 ring-zinc-950/5 dark:ring-white/10"
                            onClick={() => setPickingPrinting(true)}
                            aria-label={t("accessibility.change-printing", { name: shownCard.name })}
                        >
                            <CardImage card={shownCard} className="h-[101px] w-[72px] rounded-md shadow-md" />
                            <div className="min-w-0 flex-1 pt-1 pb-0.5">
                                <div className="flex items-start justify-between gap-1.5">
                                    <Subheading className="truncate">{shownCard.name}</Subheading>
                                    <ManaCost value={shownCard.manaCost} />
                                </div>
                                <Text>{shownCard.setName}</Text>
                                <Text>{printingCoordinate(shownCard)}</Text>
                                {/* A hand-picked printing is not what the matcher scored, so showing its confidence
                                    next to it would be a number about a different card. */}
                                {pickedPrinting ? (
                                    <Badge className="mt-3">{t("label.printing-manual")}</Badge>
                                ) : (
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="flex-1">
                                            <ProgressBar progress={shownConfidence} />
                                        </span>
                                        <Strong className="!text-xs">{shownConfidence}%</Strong>
                                    </div>
                                )}
                            </div>
                        </button>
                        {/* Recognition is usually right about the card and shaky about the printing, so the
                            runners-up are offered directly instead of hidden behind a disclosure. */}
                        {matches.length > 1 && !pickedPrinting && (
                            <div className="mt-3">
                                <Text className="mb-2">{t("description.wrong-printing")}</Text>
                                <CardChooser
                                    cards={matches.map((match) => match.card)}
                                    selectedId={bestMatch.card.id}
                                    onSelect={(card) => setChosenId(card.id)}
                                    label={t("accessibility.choose-recognized-card")}
                                />
                            </div>
                        )}
                        <SwitchField className="my-4">
                            <Label>{t("label.foil-version")}</Label>
                            <Description>{t("description.foil-version")}</Description>
                            <Switch color="blue" checked={foil} onChange={setFoil} />
                        </SwitchField>
                        <Button
                            className="w-full"
                            color={added ? "zinc" : "blue"}
                            onClick={() => {
                                stageScan(
                                    shownCard,
                                    foil,
                                    matches.map((m) => m.card),
                                );
                                setAdded(true);
                            }}
                        >
                            {added ? (
                                <>
                                    <CheckIcon className="size-[20px]" /> {t("button.added")}
                                </>
                            ) : (
                                <>
                                    <PlusIcon className="size-[20px]" /> {t("button.add-to-list")}
                                </>
                            )}
                        </Button>
                    </section>
                )}

                <PrintingPicker
                    card={correctingLive?.card ?? null}
                    open={correctingLive !== null}
                    onClose={closeLivePicker}
                    onSelect={correctLivePrinting}
                />

                <PrintingPicker
                    card={shownCard}
                    open={pickingPrinting}
                    onClose={() => setPickingPrinting(false)}
                    onSelect={(card) => {
                        setPickedPrinting(card);
                        setPickingPrinting(false);
                        setAdded(false);
                    }}
                />
            </div>
        </main>
    );
}
