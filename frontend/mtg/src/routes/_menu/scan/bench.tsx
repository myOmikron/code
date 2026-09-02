import { createFileRoute } from "@tanstack/react-router";
import { HeadingLayout, PrimaryButton, Text } from "components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadScanner, scanFrame } from "src/scanner/scan-client";
import type { ScannerStatus } from "src/scanner/scan-client";
import type { ScanReport } from "src/scanner/pipeline";

export const Route = createFileRoute("/_menu/scan/bench")({ component: NewScannerRoute });

/**
 * Bench page for the rebuilt scanner: pick a photo, see what it makes of it.
 *
 * Deliberately separate from the live scanner. The chain has only ever run in Node so far, and
 * the first thing worth knowing is whether the model, OpenCV and the index behave the same in a
 * browser at all. Answering that on a page with no camera, no frame loop and no state machine
 * keeps a failure attributable.
 *
 * @returns the page
 */
function NewScannerRoute() {
    const [t] = useTranslation("scan");
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<ScanReport | null>(null);
    const [preview, setPreview] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        loadScanner((update) => {
            if (!cancelled) setProgress(update.stage);
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

    const run = useCallback(async (file: File) => {
        setBusy(true);
        setError("");
        setReport(null);
        setPreview(URL.createObjectURL(file));
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
            setReport(await scanFrame(bitmap));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    }, []);

    const outcome = report?.outcome;

    return (
        <HeadingLayout
            heading={t("heading.new-scanner")}
            headingDescription={<Text>{t("description.new-scanner")}</Text>}
        >
            <div className="mt-6 flex flex-col gap-4">
                <Text>
                    {status
                        ? t("label.scanner-ready", {
                              count: status.printings,
                              amount: status.printings.toLocaleString("de-DE"),
                              backend: status.backend,
                          })
                        : progress
                          ? t(`label.stage-${progress}`)
                          : t("label.scanner-loading")}
                </Text>

                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void run(file);
                    }}
                />
                <PrimaryButton disabled={!status || busy} onClick={() => fileInput.current?.click()}>
                    {busy ? t("button.scanning") : t("button.pick-photo")}
                </PrimaryButton>

                {error ? <Text className="text-red-600 dark:text-red-400">{error}</Text> : null}

                {preview ? (
                    <img
                        src={preview}
                        alt=""
                        className="max-h-96 self-start rounded-xl border border-zinc-950/10 dark:border-white/10"
                    />
                ) : null}

                {outcome ? (
                    <div className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
                        {outcome.status === "recognised" ? (
                            <>
                                <Text className="text-lg font-semibold">{outcome.printing.name}</Text>
                                <Text>
                                    {outcome.printing.set.toUpperCase()} {outcome.printing.collectorNumber} ·{" "}
                                    {t("label.inliers", { count: outcome.inliers })}
                                    {outcome.runnerUp ? ` · ${t("label.runner-up", { count: outcome.runnerUp })}` : ""}
                                </Text>
                            </>
                        ) : (
                            <Text>
                                {outcome.reason === "no-card"
                                    ? t("label.no-card")
                                    : t("label.weak-match", { count: outcome.bestInliers })}
                            </Text>
                        )}
                    </div>
                ) : null}

                {report ? (
                    <Text className="font-mono text-xs">
                        {`detect ${report.timings.detect.toFixed(0)} · embed ${report.timings.embed.toFixed(0)} · ` +
                            `search ${report.timings.search.toFixed(0)} · verify ${report.timings.verify.toFixed(0)} · ` +
                            `gesamt ${report.timings.total.toFixed(0)} ms · ${report.verified} geprüft`}
                    </Text>
                ) : null}
            </div>
        </HeadingLayout>
    );
}
