import {
    AdjustmentsHorizontalIcon,
    ArrowLeftIcon,
    Cog6ToothIcon,
    RectangleStackIcon,
    SparklesIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert, AlertActions, AlertDescription, AlertTitle, Button, PrimaryButton, Text } from "components";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScanCapture } from "src/components/scan-capture-strip";
import { ScanCaptureStrip } from "src/components/scan-capture-strip";
import { ScanDiagnostics } from "src/components/scan-diagnostics";
import { ScanLoadGate } from "src/components/scan-load-gate";
import { ScanSettingsSheet } from "src/components/scan-settings-sheet";
import { ScanStagingSheet } from "src/components/scan-staging-sheet";
import type { ScanPhase } from "src/components/scan-viewfinder";
import { ScanViewfinder } from "src/components/scan-viewfinder";
import type { CardQuad } from "src/scanner/card-detect";
import {
    inspectScanDownload,
    keepScanDataStored,
    loadScanner,
    resetLiveTracking,
    scanLiveFrame,
} from "src/scanner/scan-client";
import type {
    LiveFrameResult,
    ScanDownload,
    ScanLanguageChoice,
    ScanLoadProgress,
    ScannerStatus,
} from "src/scanner/scan-client";
import { usePendingScans } from "src/context/pending-scans-context";
import { useScanScope } from "src/context/scan-scope-context";
import { useCamera } from "src/utils/use-camera";
import { loadScanLanguage, saveScanLanguage } from "src/utils/scan-language";
import { toCardRecord } from "src/utils/scanned-card";

export const Route = createFileRoute("/_collect/scan/live")({ component: LiveScannerRoute });

/** Widest a stored still is kept; a thumbnail never shows more and the strings add up. */
const STILL_WIDTH = 150;
/** Stills kept in memory. Older cards stay in the tally, they just lose their picture. */
const STILL_LIMIT = 40;
/**
 * Whether the browser says this connection is paid for by the megabyte.
 *
 * Advisory only: the Network Information API is not everywhere, and where it is it may report
 * nothing useful. A false answer only costs the extra warning, never the download itself.
 *
 * @returns whether to warn about the size
 */
function onMeteredConnection(): boolean {
    const connection = (navigator as { connection?: { saveData?: boolean; type?: string } }).connection;
    return Boolean(connection?.saveData) || connection?.type === "cellular";
}

/** Where the "this stack is foils" switch is kept, because a stack outlives a reload. */
const FOIL_KEY = "cardlens.scanFoil.v1";

/** How each phase paints the status dot. */
const DOT: Record<ScanPhase, string> = {
    loading: "bg-white/40",
    idle: "bg-white/40",
    warming: "animate-pulse bg-white/60",
    searching: "bg-white/50",
    preview: "bg-amber-300",
    confirmed: "bg-blue-400",
};

/**
 * Cuts the card out of the picture that is on screen right now.
 *
 * Taken from the video rather than from the worker's rectified crop, which only exists in debug
 * mode: this costs one canvas draw, needs no round trip and captures the frame the user was
 * actually looking at when it landed.
 *
 * @param video the running camera
 * @param quad where the card was found, in the frame's own pixels
 * @returns a jpeg data url, or an empty string when the frame could not be drawn
 */
function still(video: HTMLVideoElement, quad: CardQuad): string {
    const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    const left = Math.max(0, Math.min(...corners.map((corner) => corner.x)));
    const top = Math.max(0, Math.min(...corners.map((corner) => corner.y)));
    const width = Math.min(video.videoWidth - left, Math.max(...corners.map((corner) => corner.x)) - left);
    const height = Math.min(video.videoHeight - top, Math.max(...corners.map((corner) => corner.y)) - top);
    if (width <= 0 || height <= 0) return "";

    const canvas = document.createElement("canvas");
    canvas.width = STILL_WIDTH;
    canvas.height = Math.round((STILL_WIDTH * height) / width);
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(video, left, top, width, height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
}

/**
 * Live scanner on the rebuilt recognition chain.
 *
 * One frame is in flight at a time. Anything else buries a phone: frames arrive far faster than
 * a scan completes, and a queue of stale frames only delays the one that matters. Dropping
 * whatever arrives while busy keeps the answer about the card currently in view.
 *
 * The screen is the camera. Someone using this is holding a card in one hand and a phone in the
 * other, working through a stack, and the three states they need to tell apart are told apart by
 * the outline rather than by a sentence: dim corners mean keep looking, a warm outline means hold
 * still, a blue flash means the card is in. Everything else floats out of the way.
 *
 * @returns the page
 */
function LiveScannerRoute() {
    const [t, { language }] = useTranslation("scan");
    const [tg] = useTranslation();
    const navigate = useNavigate();
    const { scans, add: stage } = usePendingScans();
    const { codes: setScope, choose: chooseSets } = useScanScope();
    const camera = useCamera();
    const shell = useRef<HTMLElement | null>(null);
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [download, setDownload] = useState<ScanDownload | null>(null);
    const [consented, setConsented] = useState(false);
    const [progress, setProgress] = useState<ScanLoadProgress | null>(null);
    const [error, setError] = useState("");
    const [frame, setFrame] = useState<LiveFrameResult | null>(null);
    // Whether the chain has ever come back. Everything the scanner needs beyond the index and the
    // model is paid for on the first frame — the name reader boots, the model runs its first
    // inference — and that is seconds during which the camera is already live.
    const [warm, setWarm] = useState(false);
    const [captures, setCaptures] = useState<ScanCapture[]>([]);
    const [diagnostics, setDiagnostics] = useState(false);
    const [cameraNotice, setCameraNotice] = useState(false);
    const [staging, setStaging] = useState(false);
    const [settings, setSettings] = useState(false);
    const [forceFoil, setForceFoil] = useState(() => Boolean(localStorage.getItem(FOIL_KEY)));
    const [cardLanguage, setCardLanguage] = useState<ScanLanguageChoice>(loadScanLanguage);
    const foilRef = useRef(forceFoil);
    foilRef.current = forceFoil;
    const languageRef = useRef(cardLanguage);
    languageRef.current = cardLanguage;
    const scopeRef = useRef(setScope);
    scopeRef.current = setScope;
    const busy = useRef(false);
    const running = useRef(false);
    const diagnosticsRef = useRef(false);
    const staged = useRef("");
    const cropCanvas = useRef<HTMLCanvasElement | null>(null);
    diagnosticsRef.current = diagnostics;

    // The shell sits under whatever the app puts above it, today a version banner whose height
    // depends on how its sentence wraps. A viewport-tall element would then hang past the fold and
    // take the controls with it, so it is told how much room it actually has.
    useLayoutEffect(() => {
        const element = shell.current;
        if (!element) return;
        const measure = () => {
            const offset = element.getBoundingClientRect().top + window.scrollY;
            element.style.setProperty("--scan-offset", `${offset}px`);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        return () => observer.disconnect();
    }, []);

    // What a first scan costs, before anything is spent on finding out.
    useEffect(() => {
        let cancelled = false;
        inspectScanDownload()
            .then((found) => {
                if (!cancelled) setDownload(found);
            })
            .catch((reason: Error) => {
                if (!cancelled) setError(reason.message);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Started only once it is paid for: either the files are already on the device, in which case
    // there is nothing to ask about, or the size was put to the user and accepted.
    useEffect(() => {
        if (!download || (!download.cached && !consented)) return;
        let cancelled = false;
        loadScanner((update) => {
            if (!cancelled) setProgress(update);
        }, languageRef.current)
            .then((loaded) => {
                if (!cancelled) setStatus(loaded);
            })
            .catch((reason: Error) => {
                if (!cancelled) setError(reason.message);
            });
        return () => {
            cancelled = true;
        };
    }, [download, consented]);

    const step = useCallback(async () => {
        const video = camera.videoRef.current;
        if (!video || busy.current || video.readyState < 2) return;
        busy.current = true;
        try {
            const bitmap = await createImageBitmap(video);
            // What the element shows, not what the camera sends. `object-cover` crops a landscape
            // frame to a portrait phone, and a guide sized against the full frame lands outside it.
            const viewAspect = video.clientHeight > 0 ? video.clientWidth / video.clientHeight : 0;
            const result = await scanLiveFrame(
                bitmap,
                diagnosticsRef.current,
                languageRef.current,
                scopeRef.current,
                viewAspect,
            );
            setFrame(result);

            if (result.crop) {
                const canvas = cropCanvas.current;
                if (canvas) {
                    canvas.width = result.crop.width;
                    canvas.height = result.crop.height;
                    canvas.getContext("2d")?.drawImage(result.crop, 0, 0);
                }
                result.crop.close();
            }

            if (result.outcome?.status !== "recognised" && !result.quad) staged.current = "";
            if (result.outcome?.status === "recognised") {
                const { printing } = result.outcome;
                const id = printing.id;
                const thumbnail = result.quad ? still(video, result.quad) : "";
                // Once per card held up, not once per frame that agrees. A card stays in view for
                // as long as it takes to put it down, and every one of those frames confirms it
                // again: eleven copies of one Lightning Bolt after a couple of seconds. Cleared
                // below when the card leaves, so holding the same printing up twice does stage two.
                if (staged.current !== id) {
                    staged.current = id;
                    // Foil without being asked where there is nothing else to be: 19757 of the
                    // catalogue's printings were never sold unfoiled, and making someone tick a
                    // box whose answer the catalogue already knows is a step for nothing.
                    stage(toCardRecord(printing), printing.foilOnly || foilRef.current);
                }
                setCaptures((previous) =>
                    previous.some((entry) => entry.id === id)
                        ? previous
                        : [
                              {
                                  id,
                                  name: printing.name,
                                  set: printing.set.toUpperCase(),
                                  number: printing.collectorNumber,
                                  thumbnail,
                                  foil: printing.foilOnly,
                              },
                              ...previous,
                          ].slice(0, STILL_LIMIT),
                );
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            busy.current = false;
            // On the attempt finishing rather than on it succeeding: a chain that throws is going
            // to keep throwing, and leaving the scrim up would hide the error it is throwing.
            setWarm(true);
        }
    }, [camera.videoRef, stage]);

    // Raised again for each new failure rather than tied to the error itself, so dismissing the
    // notice does not also dismiss the next one. It was not dismissable at all: the alert took an
    // onClose that did nothing, which on a device without a usable camera left the screen stuck
    // behind a dialog with no way out.
    useEffect(() => {
        if (camera.error) setCameraNotice(true);
    }, [camera.error]);

    // The agreement window and the variant selector live in the worker and outlive this screen.
    // Left alone, a card half-recognised before someone walked away would still be sitting there
    // on the way back, agreeing with the first frame of whatever is held up next.
    useEffect(
        () => () => {
            resetLiveTracking();
            staged.current = "";
        },
        [],
    );

    useEffect(() => {
        if (!camera.active || !status) return;
        running.current = true;
        const tick = () => {
            if (!running.current) return;
            void step();
        };
        const timer = window.setInterval(tick, 200);
        return () => {
            running.current = false;
            window.clearInterval(timer);
        };
    }, [camera.active, status, step]);

    const confirmed = frame?.outcome?.status === "recognised" ? frame.outcome : null;
    const preview = frame?.preview ?? null;
    const phase: ScanPhase = !status
        ? "loading"
        : !camera.active
          ? "idle"
          : !warm
            ? "warming"
            : confirmed
              ? "confirmed"
              : preview
                ? "preview"
                : "searching";
    const message = !status
        ? t("label.scanner-loading")
        : !camera.active
          ? t("label.scanner-ready", {
                count: status.printings,
                amount: status.printings.toLocaleString(language),
                backend: status.backend,
            })
          : !warm
            ? t("label.scanner-warming")
            : confirmed
              ? t("label.card-confirmed")
              : preview
                ? t("label.hold-still", { name: preview.name })
                : t("label.point-at-card");

    return (
        <main
            ref={shell}
            style={{ height: "calc(100svh - var(--scan-offset, 0px))" }}
            className="relative flex items-center justify-center overflow-hidden bg-zinc-950 text-white"
        >
            {/* Full bleed on a phone, a card-shaped column on anything wider: a viewfinder two
                thousand pixels across puts the card in a tenth of the frame and the controls an
                arm's length from it. */}
            <div className="relative isolate size-full sm:aspect-3/4 sm:h-full sm:max-h-[44rem] sm:w-auto sm:overflow-hidden sm:rounded-2xl sm:ring-1 sm:ring-white/10">
                <ScanViewfinder videoRef={camera.videoRef} frame={frame} phase={phase} confirmations={captures.length}>
                    {/* Everything that is set once and then left alone lives up here, out of the
                        way of a thumb: a phone is held in one hand and the lower right corner is
                        the only part of the screen that hand reaches without shifting its grip. */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 pb-12">
                        <button
                            type="button"
                            aria-label={t("button.back")}
                            onClick={() => void navigate({ to: "/scan" })}
                            className="pointer-events-auto shrink-0 rounded-full bg-black/55 p-2 text-white/70 ring-1 ring-white/10 backdrop-blur hover:text-white"
                        >
                            <ArrowLeftIcon className="size-5" />
                        </button>

                        <p
                            role="status"
                            className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/55 px-3.5 py-2 text-sm ring-1 ring-white/10 backdrop-blur"
                        >
                            <span className={`size-2 shrink-0 rounded-full ${DOT[phase]}`} />
                            <span className="truncate">{message}</span>
                        </p>

                        {status ? (
                            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                                {setScope.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setSettings(true)}
                                        className="rounded-full bg-black/55 px-2.5 py-2 text-xs text-white/80 ring-1 ring-white/10 backdrop-blur"
                                    >
                                        {setScope.length === 1
                                            ? setScope[0].toUpperCase()
                                            : t("label.sets-limited", { count: setScope.length })}
                                    </button>
                                ) : null}

                                {/* For a stack that is all foils. The catalogue already marks the
                                    printings that were never sold any other way; this is for the
                                    ones where being foil is not in the data. */}
                                <button
                                    type="button"
                                    aria-pressed={forceFoil}
                                    aria-label={t("button.mark-foil")}
                                    onClick={() => {
                                        const next = !forceFoil;
                                        setForceFoil(next);
                                        localStorage.setItem(FOIL_KEY, next ? "1" : "");
                                    }}
                                    className={`rounded-full p-2 ring-1 backdrop-blur ${
                                        forceFoil
                                            ? "bg-blue-500/25 text-blue-200 ring-blue-400/40"
                                            : "bg-black/55 text-white/70 ring-white/10 hover:text-white"
                                    }`}
                                >
                                    <SparklesIcon className="size-5" />
                                </button>

                                <button
                                    type="button"
                                    aria-label={t("heading.scan-settings")}
                                    onClick={() => setSettings(true)}
                                    className="rounded-full bg-black/55 p-2 text-white/70 ring-1 ring-white/10 backdrop-blur hover:text-white"
                                >
                                    <Cog6ToothIcon className="size-5" />
                                </button>

                                <button
                                    type="button"
                                    aria-label={t("button.open-diagnostics")}
                                    onClick={() => setDiagnostics((previous) => !previous)}
                                    className="rounded-full bg-black/55 p-2 text-white/70 ring-1 ring-white/10 backdrop-blur hover:text-white"
                                >
                                    <AdjustmentsHorizontalIcon className="size-5" />
                                </button>
                            </div>
                        ) : null}
                    </div>

                    {/* Shown as soon as the scanner is ready, not only while the camera runs: the
                        staged cards outlive a reload, and hiding the way to them behind starting a
                        camera meant a stack scanned yesterday could not be reached at all. */}
                    <AnimatePresence>
                        {status ? (
                            <motion.div
                                initial={{ opacity: 0, y: 24 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 24 }}
                                className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-black/80 via-black/55 to-transparent p-4 pt-16"
                            >
                                {captures.length > 0 ? <ScanCaptureStrip captures={captures} /> : null}

                                <div className="flex items-center justify-end">
                                    {/* The one control reached for over and over, and the only one
                                        placed where a thumb already is. */}
                                    <button
                                        type="button"
                                        onClick={() => setStaging(true)}
                                        className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-3 text-white ring-1 ring-white/15 backdrop-blur hover:bg-black/70"
                                    >
                                        <RectangleStackIcon className="size-5" />
                                        <span className="text-base tabular-nums">{scans.length}</span>
                                        <span className="sr-only">{t("button.open-staged")}</span>
                                    </button>
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>

                    {!camera.active && status ? (
                        <div className="absolute inset-0 z-10 grid place-items-center bg-zinc-950/70">
                            <PrimaryButton onClick={() => void camera.start()}>
                                {t("button.start-camera")}
                            </PrimaryButton>
                        </div>
                    ) : null}

                    {!status ? (
                        <ScanLoadGate
                            total={download?.total ?? 0}
                            metered={onMeteredConnection()}
                            progress={progress}
                            error={error}
                            onConfirm={() => {
                                void keepScanDataStored();
                                setConsented(true);
                            }}
                        />
                    ) : null}
                </ScanViewfinder>

                <ScanSettingsSheet
                    open={settings}
                    onClose={() => setSettings(false)}
                    camera={camera}
                    language={cardLanguage}
                    onLanguage={(chosen) => {
                        setCardLanguage(chosen);
                        saveScanLanguage(chosen);
                    }}
                    sets={setScope}
                    onSets={chooseSets}
                />

                <ScanStagingSheet open={staging} onClose={() => setStaging(false)} />

                <ScanDiagnostics
                    open={diagnostics}
                    onClose={() => setDiagnostics(false)}
                    status={status}
                    frame={frame}
                    cropRef={cropCanvas}
                />

                {error ? (
                    <p className="absolute inset-x-3 bottom-20 z-30 rounded-lg bg-red-950/90 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/30">
                        {error}
                    </p>
                ) : null}
            </div>

            <Alert open={Boolean(camera.error) && cameraNotice} onClose={() => setCameraNotice(false)}>
                <AlertTitle>{t("heading.camera-unavailable")}</AlertTitle>
                <AlertDescription>{t(`description.camera-${camera.error ?? "missing"}`)}</AlertDescription>
                {/* Only the browser knows why a camera it has will not open — another app holding
                    it, a driver that gave up — and only it can say so. */}
                {camera.errorDetail ? (
                    <Text className="mt-3 font-mono text-xs break-all">{camera.errorDetail}</Text>
                ) : null}
                <AlertActions>
                    <Button plain onClick={() => setCameraNotice(false)}>
                        {tg("button.close")}
                    </Button>
                </AlertActions>
            </Alert>
        </main>
    );
}
