import { ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import {
    Button,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Text,
} from "components";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LiveFrameResult, ScannerStatus } from "src/scanner/scan-client";

/**
 * The properties for {@link ScanDiagnostics}
 */
export type ScanDiagnosticsProps = {
    open: boolean;
    onClose: () => void;
    status: ScannerStatus | null;
    frame: LiveFrameResult | null;
    /** Where the rectified crop is drawn, so a wrong answer can be looked at */
    cropRef: RefObject<HTMLCanvasElement | null>;
};

/** The four stages of a frame, in the order they run, with the colour each gets in the bar. */
const STAGES = [
    { key: "detect", className: "bg-sky-500" },
    { key: "ocr", className: "bg-emerald-500" },
    { key: "embed", className: "bg-violet-500" },
    { key: "search", className: "bg-amber-500" },
] as const;

/**
 * Where a frame's milliseconds went, as one bar.
 *
 * A bar rather than four numbers because the shape is the finding: with a name resolved the model
 * never runs, so its segment disappears entirely, and that is the difference between a frame that
 * costs 70 ms and one that costs the better part of a second.
 *
 * @returns the bar
 */
function TimingBar({ timings }: { timings: LiveFrameResult["timings"] }) {
    const total = STAGES.reduce((sum, stage) => sum + timings[stage.key], 0);
    if (total <= 0) return null;

    return (
        <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/10">
            {STAGES.map((stage) => (
                <div
                    key={stage.key}
                    className={stage.className}
                    style={{ width: `${(timings[stage.key] / total) * 100}%` }}
                />
            ))}
        </div>
    );
}

/**
 * What the pipeline did with the last frame, for when it did the wrong thing.
 *
 * @returns the dialog
 */
export function ScanDiagnostics({ open, onClose, status, frame, cropRef }: ScanDiagnosticsProps) {
    const [t] = useTranslation("scan");
    const [tg] = useTranslation();
    const panel = useRef<HTMLDivElement | null>(null);
    const [copied, setCopied] = useState(false);

    /**
     * Puts what the dialog says on the clipboard.
     *
     * Read off the rendered panel rather than assembled a second time: the two would drift, and
     * the thing worth sending is what was actually on screen when it went wrong.
     */
    const copy = () => {
        const text = panel.current?.innerText ?? "";
        void navigator.clipboard.writeText(text).then(
            () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
        );
    };

    return (
        <Dialog open={open} onClose={onClose} size={"xl"}>
            <DialogTitle>{t("heading.diagnostics")}</DialogTitle>
            <DialogBody>
                <div ref={panel} className="flex flex-col gap-4">
                    <canvas
                        ref={cropRef}
                        className="w-32 rounded-lg bg-zinc-900 ring-1 ring-zinc-950/10 dark:ring-white/10"
                    />

                    <DescriptionList>
                        {status ? (
                            <>
                                <DescriptionTerm>{t("label.diagnostics-backend")}</DescriptionTerm>
                                <DescriptionDetails>{`${status.backend} · ${status.strategy}`}</DescriptionDetails>
                            </>
                        ) : null}

                        <DescriptionTerm>{t("label.diagnostics-crop")}</DescriptionTerm>
                        <DescriptionDetails>
                            {frame?.fromGuide ? t("label.crop-guide") : t("label.crop-detected")}
                        </DescriptionDetails>

                        <DescriptionTerm>{t("label.diagnostics-reader")}</DescriptionTerm>
                        <DescriptionDetails>{frame?.ocrModel || "?"}</DescriptionDetails>

                        <DescriptionTerm>{t("label.diagnostics-frame")}</DescriptionTerm>
                        <DescriptionDetails>
                            {`${frame?.frameWidth ?? 0}×${frame?.frameHeight ?? 0} · ${((frame?.areaFraction ?? 0) * 100).toFixed(1)}%`}
                        </DescriptionDetails>

                        <DescriptionTerm>{t("label.diagnostics-title")}</DescriptionTerm>
                        <DescriptionDetails>
                            {frame?.ocrError ? frame.ocrError : `"${frame?.title ?? ""}"`}
                        </DescriptionDetails>

                        <DescriptionTerm>{t("label.diagnostics-decision")}</DescriptionTerm>
                        <DescriptionDetails>
                            {frame?.outcome
                                ? frame.outcome.status === "recognised"
                                    ? t("label.debug-inliers", { count: frame.outcome.inliers })
                                    : t("label.debug-rejected", { count: frame.outcome.bestInliers })
                                : t("label.debug-not-confirmed")}
                        </DescriptionDetails>
                    </DescriptionList>

                    {frame ? (
                        <div className="flex flex-col gap-1">
                            <TimingBar timings={frame.timings} />
                            <Text className="font-mono text-xs">
                                {STAGES.map((stage) => `${stage.key} ${frame.timings[stage.key].toFixed(0)}`).join(
                                    " · ",
                                )}
                                {` · ${frame.milliseconds.toFixed(0)} ms`}
                            </Text>
                        </div>
                    ) : null}

                    {status?.notes.map((note) => (
                        <Text key={note} className="font-mono text-xs">
                            {note}
                        </Text>
                    ))}
                </div>
            </DialogBody>
            <DialogActions>
                <Button outline onClick={copy}>
                    <ClipboardDocumentIcon className="size-5" />
                    {copied ? t("label.copied") : t("button.copy-diagnostics")}
                </Button>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
