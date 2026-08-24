import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle, Badge, Button, HeadingLayout, PrimaryButton, Text } from "components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadScanner, resetLiveTracking, scanLiveFrame } from "src/scanner/scan-client";
import type { LiveFrameResult, ScannerStatus } from "src/scanner/scan-client";
import { useCamera } from "src/utils/use-camera";

export const Route = createFileRoute("/_collect/scan/live-neu")({ component: LiveScannerRoute });

/**
 * Live scanner on the rebuilt recognition chain.
 *
 * One frame is in flight at a time. Anything else buries a phone: frames arrive far faster than
 * a scan completes, and a queue of stale frames only delays the one that matters. Dropping
 * whatever arrives while busy keeps the answer about the card currently in view.
 *
 * The interface distinguishes three states rather than one, because they need different things
 * from the user: nothing detected means move the card into view, a preview means hold still, and
 * a confirmed card means it is done.
 *
 * @returns the page
 */
function LiveScannerRoute() {
    const [t] = useTranslation("scan");
    const camera = useCamera();
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [frame, setFrame] = useState<LiveFrameResult | null>(null);
    const [found, setFound] = useState<{ name: string; set: string; number: string; inliers: number }[]>([]);
    const [debug, setDebug] = useState(false);
    const busy = useRef(false);
    const running = useRef(false);
    const debugRef = useRef(false);
    const cropCanvas = useRef<HTMLCanvasElement | null>(null);
    debugRef.current = debug;

    useEffect(() => {
        let cancelled = false;
        loadScanner((update) => {
            if (!cancelled) setProgress(update);
        })
            .then((loaded) => {
                if (!cancelled) setStatus(loaded);
            })
            .catch((reason: Error) => {
                if (!cancelled) setError(reason.message);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const step = useCallback(async () => {
        const video = camera.videoRef.current;
        if (!video || busy.current || video.readyState < 2) return;
        busy.current = true;
        try {
            const bitmap = await createImageBitmap(video);
            const result = await scanLiveFrame(bitmap, debugRef.current);
            setFrame(result);

            // Drawn rather than kept in state: an ImageBitmap is a handle to memory, and holding
            // one per render would pile them up faster than they are released.
            if (result.crop) {
                const canvas = cropCanvas.current;
                if (canvas) {
                    canvas.width = result.crop.width;
                    canvas.height = result.crop.height;
                    canvas.getContext("2d")?.drawImage(result.crop, 0, 0);
                }
                result.crop.close();
            }
            if (result.outcome?.status === "recognised") {
                const { printing, inliers } = result.outcome;
                setFound((previous) =>
                    previous.some((entry) => entry.name === printing.name && entry.number === printing.collectorNumber)
                        ? previous
                        : [
                              {
                                  name: printing.name,
                                  set: printing.set.toUpperCase(),
                                  number: printing.collectorNumber,
                                  inliers,
                              },
                              ...previous,
                          ],
                );
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            busy.current = false;
        }
    }, [camera.videoRef]);

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

    return (
        <main className="min-h-svh px-5 py-8 lg:mx-auto lg:max-w-220 lg:px-12 lg:py-10">
            <HeadingLayout
                heading={t("heading.live-scanner")}
                headingDescription={<Text>{t("description.live-scanner")}</Text>}
            >
                <div className="mt-6 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge color={status ? "blue" : "zinc"}>
                            {status
                                ? t("label.scanner-ready", {
                                      count: status.printings,
                                      amount: status.printings.toLocaleString("de-DE"),
                                      backend: status.backend,
                                  })
                                : progress || t("label.scanner-loading")}
                        </Badge>
                        {frame ? <Badge color="zinc">{`${frame.milliseconds.toFixed(0)} ms`}</Badge> : null}
                        {frame?.preview ? (
                            <Badge color={frame.preview.score > 0.5 ? "zinc" : "amber"}>
                                {`cos ${frame.preview.score.toFixed(3)}`}
                            </Badge>
                        ) : null}
                        <Button plain onClick={() => setDebug((previous) => !previous)}>
                            {t("button.debug", { state: debug ? t("label.on") : t("label.off") })}
                        </Button>
                    </div>

                    <div className="relative overflow-hidden rounded-2xl border border-zinc-950/10 bg-zinc-900 dark:border-white/10">
                        <video
                            ref={camera.videoRef}
                            playsInline
                            muted
                            className="aspect-3/4 w-full object-cover sm:aspect-video"
                        />
                        {/* The viewBox is the frame's own pixel space and the slice fit matches
                            the video's object-cover, so the outline lands exactly where the
                            detector found it without any transform of our own. */}
                        {frame && frame.frameWidth > 0 ? (
                            <svg
                                viewBox={`0 0 ${frame.frameWidth} ${frame.frameHeight}`}
                                preserveAspectRatio="xMidYMid slice"
                                className="pointer-events-none absolute inset-0 size-full"
                            >
                                {/* Drawn from the region the worker reported rather than from a
                                    guess about the layout. The video is cropped by object-cover,
                                    so a guide positioned in the container's coordinates marks a
                                    different part of the frame than the one being searched. */}
                                <rect
                                    x={frame.region.x}
                                    y={frame.region.y}
                                    width={frame.region.width}
                                    height={frame.region.height}
                                    rx={frame.frameWidth / 60}
                                    className="fill-none stroke-white/40"
                                    strokeWidth={frame.frameWidth / 260}
                                    strokeDasharray={`${frame.frameWidth / 60} ${frame.frameWidth / 90}`}
                                />
                                {frame.quad ? (
                                    <polygon
                                        points={[
                                            frame.quad.topLeft,
                                            frame.quad.topRight,
                                            frame.quad.bottomRight,
                                            frame.quad.bottomLeft,
                                        ]
                                            .map((corner) => `${corner.x},${corner.y}`)
                                            .join(" ")}
                                        className={
                                            confirmed
                                                ? "fill-blue-500/25 stroke-blue-400"
                                                : "fill-blue-400/10 stroke-blue-300"
                                        }
                                        strokeWidth={frame.frameWidth / 120}
                                    />
                                ) : null}
                            </svg>
                        ) : null}
                        {!camera.active ? (
                            <div className="absolute inset-0 grid place-items-center">
                                <PrimaryButton disabled={!status} onClick={() => void camera.start()}>
                                    {t("button.start-camera")}
                                </PrimaryButton>
                            </div>
                        ) : null}
                    </div>

                    {camera.active ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                outline
                                onClick={() => {
                                    camera.stop();
                                    resetLiveTracking();
                                    setFrame(null);
                                }}
                            >
                                {t("button.stop-camera")}
                            </Button>
                            <Text>
                                {confirmed
                                    ? t("label.card-confirmed")
                                    : preview
                                      ? t("label.hold-still", { name: preview.name })
                                      : t("label.point-at-card")}
                            </Text>
                        </div>
                    ) : null}

                    {camera.error ? (
                        <Alert open onClose={() => undefined}>
                            <AlertTitle>{t("heading.camera-unavailable")}</AlertTitle>
                            <AlertDescription>
                                {camera.error === "denied"
                                    ? t("description.camera-denied")
                                    : t("description.camera-missing")}
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    {error ? <Text className="text-red-600 dark:text-red-400">{error}</Text> : null}

                    {debug ? (
                        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                            <canvas
                                ref={cropCanvas}
                                className="w-32 rounded-lg border border-zinc-950/10 dark:border-white/10"
                            />
                            <div className="flex flex-col gap-1">
                                {/* Why the run is on the slower backend. Without this the app
                                    quietly falls back and the only symptom is that every frame
                                    takes a second and a half. */}
                                {status ? (
                                    <Text className="font-mono text-xs">{`backend ${status.backend} · webgpu ${status.strategy}`}</Text>
                                ) : null}
                                {status?.notes.map((note) => (
                                    <Text key={note} className="font-mono text-xs">
                                        {note}
                                    </Text>
                                ))}
                                <Text className="font-mono text-xs">
                                    {t("label.debug-area", { percent: ((frame?.areaFraction ?? 0) * 100).toFixed(1) })}
                                </Text>
                                <Text className="font-mono text-xs">
                                    {frame
                                        ? `detect ${frame.timings.detect.toFixed(0)} · embed ${frame.timings.embed.toFixed(0)} · ` +
                                          `search ${frame.timings.search.toFixed(0)} · ocr ${frame.timings.ocr.toFixed(0)} ms`
                                        : ""}
                                </Text>
                                <Text className="font-mono text-xs">
                                    {frame?.ocrError ? `ocr ${frame.ocrError}` : `ocr "${frame?.title ?? ""}"`}
                                </Text>
                                <Text className="font-mono text-xs">
                                    {t("label.debug-frame", {
                                        width: frame?.frameWidth ?? 0,
                                        height: frame?.frameHeight ?? 0,
                                    })}
                                </Text>
                                <Text className="font-mono text-xs">
                                    {frame?.outcome
                                        ? frame.outcome.status === "recognised"
                                            ? t("label.debug-inliers", { count: frame.outcome.inliers })
                                            : t("label.debug-rejected", { count: frame.outcome.bestInliers })
                                        : t("label.debug-not-confirmed")}
                                </Text>
                            </div>
                        </div>
                    ) : null}

                    {found.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            <Text className="font-semibold">
                                {t("label.found-this-session", { count: found.length })}
                            </Text>
                            {found.map((entry) => (
                                <div
                                    key={`${entry.set}-${entry.number}`}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-950/10 px-4 py-3 dark:border-white/10"
                                >
                                    <Text className="font-medium">{entry.name}</Text>
                                    <Badge color="zinc">{`${entry.set} ${entry.number} · ${entry.inliers}`}</Badge>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </HeadingLayout>
        </main>
    );
}
