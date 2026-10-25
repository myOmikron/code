import { PhotoIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useRouterState } from "@tanstack/react-router";
import {
    Button,
    Checkbox,
    CheckboxField,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Label,
    RequiredLabel,
    Strong,
    Text,
    Textarea,
} from "components";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { SendBugReportErrors } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { composeBugReport, DIAGNOSTICS, withoutQueryValues } from "src/utils/diagnostics";
import type { Diagnostics, ReportContext, ReportStart } from "src/utils/diagnostics";
import { isFormError } from "src/utils/error";
import { shrinkImage } from "src/utils/shrink-image";

/** Most images a Bug report carries, the scanner crop included */
const MAX_IMAGES = 3;
/** Fewest characters the text must have */
const TEXT_MIN = 5;
/** Most characters the text may have */
const TEXT_MAX = 5000;

/** The message per error the server answers with; literal keys for the translation scanner */
const SERVER_ERRORS: Record<keyof SendBugReportErrors, string> = {
    report_invalid: "error.bug-report-failed",
    text_missing: "error.bug-report-text-missing",
    text_too_long: "error.bug-report-text-too-long",
    too_many_images: "error.bug-report-too-many-images",
    image_too_large: "error.bug-report-image-too-large",
    image_invalid: "error.bug-report-image-invalid",
    rate_limited: "error.bug-report-rate-limited",
};

/**
 * The properties for {@link BugReportDialog}
 */
export type BugReportDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Where the Bug report is started, with what that place knows */
    start: ReportStart;
    /** What the text field starts with */
    initialText?: string;
};

/** An image the player attached, shrunk and ready to send */
type Attachment = { blob: Blob; preview: string };

/**
 * Dialog for sending a Bug report.
 *
 * Shows everything that goes along before it is sent. A failed send stays in the
 * dialog with what was written; a sent one thanks the player with its number.
 *
 * @returns the dialog
 */
export function BugReportDialog({ open, onClose, start, initialText = "" }: BugReportDialogProps) {
    const [tg] = useTranslation();
    const route = useRouterState({ select: (state) => state.location.href });
    const [text, setText] = useState(initialText);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [includeCrop, setIncludeCrop] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [number, setNumber] = useState<number | null>(null);
    const picker = useRef<HTMLInputElement>(null);

    const hasCrop = start.kind === "scanner" && start.crop !== null;
    const cropPreview = useMemo(
        () => (start.kind === "scanner" && start.crop ? URL.createObjectURL(start.crop) : null),
        [start],
    );
    useEffect(() => () => void (cropPreview && URL.revokeObjectURL(cropPreview)), [cropPreview]);

    const context = useMemo<ReportContext>(
        () => ({
            route: withoutQueryValues(route),
            release: __APP_VERSION__,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language,
        }),
        [route, open],
    );
    const preview = useMemo(() => (open ? DIAGNOSTICS.snapshot(start) : null), [open, start]);
    const room = MAX_IMAGES - (hasCrop && includeCrop ? 1 : 0) - attachments.length;

    useEffect(() => {
        if (!open) return;
        setText(initialText);
        setAttachments([]);
        setIncludeCrop(true);
        setError(null);
        setNumber(null);
    }, [open]);

    useEffect(() => () => attachments.forEach((attachment) => URL.revokeObjectURL(attachment.preview)), [attachments]);

    const pick = async (files: FileList | null) => {
        if (!files) return;
        const chosen = [...files].slice(0, Math.max(0, room));
        try {
            const shrunk = await Promise.all(chosen.map((file) => shrinkImage(file)));
            setAttachments((previous) => [
                ...previous,
                ...shrunk.map((blob) => ({ blob, preview: URL.createObjectURL(blob) })),
            ]);
        } catch {
            setError(tg("error.bug-report-image-invalid"));
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = text.trim();
        const characters = [...trimmed].length;
        if (characters < TEXT_MIN) {
            setError(tg("error.bug-report-text-missing"));
            return;
        }
        if (characters > TEXT_MAX) {
            setError(tg("error.bug-report-text-too-long"));
            return;
        }
        setSending(true);
        setError(null);
        try {
            const composed = composeBugReport(DIAGNOSTICS, {
                text: trimmed,
                images: attachments.map((attachment) => attachment.blob),
                start,
                includeCrop,
                context,
            });
            const response = await Api.bugReports.send(composed.report, composed.images);
            if (isFormError(response)) {
                const failed = Object.entries(response.error).find(([, value]) => value === true);
                setError(
                    tg(failed ? SERVER_ERRORS[failed[0] as keyof SendBugReportErrors] : "error.bug-report-failed"),
                );
            } else {
                setNumber(response.number);
            }
        } catch {
            setError(tg("error.bug-report-failed"));
        } finally {
            setSending(false);
        }
    };

    if (number !== null) {
        return (
            <Dialog open={open} onClose={onClose}>
                <DialogTitle>{tg("heading.bug-report-thanks")}</DialogTitle>
                <DialogDescription>{tg("description.bug-report-thanks", { number })}</DialogDescription>
                <DialogActions>
                    <PrimaryButton onClick={onClose}>{tg("button.close")}</PrimaryButton>
                </DialogActions>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} size={"xl"}>
            <DialogTitle>{tg("heading.report-bug")}</DialogTitle>
            <DialogDescription>{tg("description.report-bug")}</DialogDescription>
            <form onSubmit={(event) => void submit(event)}>
                <DialogBody>
                    <FieldGroup>
                        <Field>
                            <RequiredLabel>{tg("label.bug-report-text")}</RequiredLabel>
                            <Description>{tg("description.bug-report-text")}</Description>
                            <Textarea
                                autoFocus={true}
                                rows={5}
                                required={true}
                                minLength={TEXT_MIN}
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                            />
                        </Field>

                        {hasCrop ? (
                            <CheckboxField>
                                <Checkbox
                                    color={"lime"}
                                    checked={includeCrop}
                                    disabled={!includeCrop && attachments.length >= MAX_IMAGES}
                                    onChange={setIncludeCrop}
                                />
                                <Label>{tg("label.bug-report-crop")}</Label>
                                <Description>{tg("description.bug-report-crop")}</Description>
                            </CheckboxField>
                        ) : null}

                        <Field>
                            <Label>{tg("label.bug-report-images")}</Label>
                            <Description>{tg("description.bug-report-images")}</Description>
                            <div className={"mt-3 flex flex-wrap items-center gap-2"}>
                                {hasCrop && includeCrop && cropPreview ? (
                                    <img
                                        src={cropPreview}
                                        alt={tg("label.bug-report-crop")}
                                        className={
                                            "size-16 rounded-md object-cover ring-1 ring-zinc-950/10 dark:ring-white/10"
                                        }
                                    />
                                ) : null}
                                {attachments.map((attachment, index) => (
                                    <div key={attachment.preview} className={"relative"}>
                                        <img
                                            src={attachment.preview}
                                            alt={""}
                                            className={
                                                "size-16 rounded-md object-cover ring-1 ring-zinc-950/10 dark:ring-white/10"
                                            }
                                        />
                                        <button
                                            type={"button"}
                                            aria-label={tg("accessibility.remove-bug-report-image")}
                                            onClick={() =>
                                                setAttachments((previous) =>
                                                    previous.filter((_, position) => position !== index),
                                                )
                                            }
                                            className={
                                                "absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 text-zinc-700 ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-white/10"
                                            }
                                        >
                                            <XMarkIcon className={"size-3.5"} />
                                        </button>
                                    </div>
                                ))}
                                {room > 0 ? (
                                    <Button outline={true} onClick={() => picker.current?.click()}>
                                        <PhotoIcon />
                                        {tg("button.add-bug-report-image")}
                                    </Button>
                                ) : null}
                                <input
                                    ref={picker}
                                    type={"file"}
                                    accept={"image/*"}
                                    multiple={true}
                                    className={"hidden"}
                                    onChange={(event) => {
                                        void pick(event.target.files);
                                        event.target.value = "";
                                    }}
                                />
                            </div>
                        </Field>

                        {preview ? <SentAlong diagnostics={preview} context={context} /> : null}

                        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"} disabled={sending}>
                        {tg("button.send-bug-report")}
                    </PrimaryButton>
                </DialogActions>
            </form>
        </Dialog>
    );
}

/**
 * The properties for {@link SentAlong}
 */
type SentAlongProps = {
    /** The diagnostics as they stand when the dialog opened */
    diagnostics: Diagnostics;
    /** The browser around the Bug report */
    context: ReportContext;
};

/**
 * Everything a Bug report carries besides the player's text and images, folded away
 *
 * @returns the disclosure
 */
function SentAlong({ diagnostics, context }: SentAlongProps) {
    const [tg] = useTranslation();
    const lines = [
        tg("label.bug-report-page", { route: context.route }),
        tg("label.bug-report-release", { release: context.release }),
        tg("label.bug-report-browser", { browser: context.userAgent }),
        tg("label.bug-report-screen", { viewport: context.viewport, language: context.language }),
    ];

    return (
        <details className={"group"}>
            <summary className={"cursor-pointer"}>
                <Strong>{tg("label.bug-report-sent-along")}</Strong>
            </summary>
            <div className={"flex flex-col gap-3 pt-2"}>
                <ul className={"flex flex-col gap-1"}>
                    {lines.map((line) => (
                        <li key={line}>
                            <Text className={"break-all"}>{line}</Text>
                        </li>
                    ))}
                </ul>

                <div>
                    <Text>{tg("label.bug-report-requests", { count: diagnostics.requests.length })}</Text>
                    <ul className={"mt-1 flex flex-col gap-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400"}>
                        {diagnostics.requests.map((request, index) => (
                            <li key={index} className={"break-all"}>
                                {request.method} {request.path} {request.status ?? tg("label.bug-report-no-answer")}{" "}
                                {request.duration_ms} ms {request.trace_id ?? ""}
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <Text>{tg("label.bug-report-console", { count: diagnostics.console.length })}</Text>
                    <ul className={"mt-1 flex flex-col gap-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400"}>
                        {diagnostics.console.map((entry, index) => (
                            <li key={index} className={"break-all whitespace-pre-wrap"}>
                                {entry.message}
                                {entry.stack ? `\n${entry.stack}` : ""}
                            </li>
                        ))}
                    </ul>
                </div>

                {diagnostics.error ? (
                    <Text className={"break-all"}>
                        {tg("label.bug-report-error", { message: diagnostics.error.message })}
                    </Text>
                ) : null}

                {diagnostics.scanner ? (
                    <div>
                        <Text>
                            {tg("label.bug-report-recognitions", { count: diagnostics.scanner.recognitions.length })}
                        </Text>
                        <ul className={"mt-1 flex flex-col gap-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400"}>
                            {diagnostics.scanner.recognitions.map((recognition, index) => (
                                <li key={index} className={"break-all"}>
                                    {recognition.ocr_text} ({recognition.path}):{" "}
                                    {recognition.candidates
                                        .map(
                                            (candidate) =>
                                                `${candidate.name} ${candidate.set.toUpperCase()} ${candidate.collector_number} ${candidate.score.toFixed(2)}`,
                                        )
                                        .join(", ")}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </details>
    );
}
