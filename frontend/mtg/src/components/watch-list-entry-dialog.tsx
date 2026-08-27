import { PhotoIcon, TrashIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Divider,
    ErrorMessage,
    Field,
    FieldGroup,
    Input,
    Label,
    PrimaryButton,
    Text,
    Textarea,
} from "components";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WatchListEntryResponse } from "src/api/generated";
import { hapticTap } from "src/utils/haptics";

/** What an edit hands back, in the shape the api takes */
export type WatchListEntryEdit = {
    /** How many copies the account is after */
    wanted: number;
    /** What the entry is for */
    note: string;
    /** Alarm below this price in euro cents, `null` for no alarm */
    alarm_price_cents: number | null;
};

/**
 * The properties for {@link WatchListEntryDialog}
 */
export type WatchListEntryDialogProps = {
    /** The entry being edited, or `null` to keep the dialog closed */
    entry: WatchListEntryResponse | null;
    /** Called when the dialog should close without having saved anything */
    onClose: () => void;
    /** Saves the edit */
    onSave: (entry: WatchListEntryResponse, edit: WatchListEntryEdit) => Promise<void>;
    /** Takes the card off the list */
    onRemove: (entry: WatchListEntryResponse) => void;
    /** Opens the printing picker for this entry */
    onChangePrinting: (entry: WatchListEntryResponse) => void;
};

/**
 * What one card on a watch list is being watched for.
 *
 * Only the settings that are worth a form. The two match switches used to live
 * here and now sit on the row itself, because they are the ones somebody wants
 * to try both ways and watch the numbers move — which a dialog cannot show.
 * What is left is what you set once and forget: how many, at what price, and
 * why.
 *
 * @returns the dialog
 */
export function WatchListEntryDialog({
    entry,
    onClose,
    onSave,
    onRemove,
    onChangePrinting,
}: WatchListEntryDialogProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const [wanted, setWanted] = useState(1);
    const [note, setNote] = useState("");
    const [alarm, setAlarm] = useState("");
    const [busy, setBusy] = useState(false);

    // The dialog stays mounted, so the fields have to be pointed at whatever it
    // is opened on.
    useEffect(() => {
        if (entry === null) return;
        setWanted(entry.wanted);
        setNote(entry.note);
        setAlarm(entry.alarm_price_cents == null ? "" : String(entry.alarm_price_cents / 100));
    }, [entry]);

    if (entry === null) return null;

    const threshold = alarm.trim() === "" ? null : Number(alarm.trim().replace(",", "."));
    const alarmInvalid = threshold !== null && (!Number.isFinite(threshold) || threshold < 0);

    /**
     * Hands the edit over and closes on success
     */
    async function save() {
        if (entry === null || alarmInvalid) return;
        setBusy(true);
        try {
            await onSave(entry, {
                wanted,
                note,
                alarm_price_cents: threshold === null ? null : Math.round(threshold * 100),
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={true} onClose={onClose}>
            <DialogTitle>{entry.card?.name ?? t("heading.edit-entry")}</DialogTitle>
            <DialogBody>
                <FieldGroup>
                    {/* A stepper, not a number field: on a phone a numeric
                        keyboard for a value that is almost always one to four
                        is a keyboard nobody wanted. */}
                    <Field>
                        <Label>{t("label.wanted")}</Label>
                        <Description>{t("description.wanted")}</Description>
                        <div className={"mt-2 flex items-center gap-3"}>
                            <Stepper
                                label={"−"}
                                disabled={wanted <= 1}
                                onClick={() => {
                                    hapticTap();
                                    setWanted((copies) => Math.max(1, copies - 1));
                                }}
                            />
                            <span
                                className={
                                    "w-10 text-center text-xl font-semibold text-zinc-950 tabular-nums dark:text-white"
                                }
                            >
                                {wanted}
                            </span>
                            <Stepper
                                label={"+"}
                                onClick={() => {
                                    hapticTap();
                                    setWanted((copies) => Math.min(99, copies + 1));
                                }}
                            />
                        </div>
                    </Field>

                    <Field>
                        <Label>{t("label.alarm")}</Label>
                        <Description>{t("description.alarm")}</Description>
                        <Input
                            type={"number"}
                            min={0}
                            step={"0.01"}
                            inputMode={"decimal"}
                            placeholder={t("label.alarm-none")}
                            invalid={alarmInvalid}
                            value={alarm}
                            onChange={(e) => setAlarm(e.target.value)}
                        />
                        {alarmInvalid && <ErrorMessage>{t("error.alarm-invalid")}</ErrorMessage>}
                        <Text className={"mt-2 text-xs"}>{t("description.price-source")}</Text>
                    </Field>

                    <Field>
                        <Label>{t("label.note")}</Label>
                        <Description>{t("description.note")}</Description>
                        <Textarea rows={2} maxLength={1024} value={note} onChange={(e) => setNote(e.target.value)} />
                    </Field>

                    <Divider />

                    {/* Full-width rows rather than buttons in the action bar:
                        both leave the form, and both are easier to hit by
                        accident than to find when they are crowded in beside
                        Save. */}
                    <div className={"flex flex-col gap-1"}>
                        <SheetAction
                            icon={<PhotoIcon />}
                            label={t("button.change-printing")}
                            onClick={() => onChangePrinting(entry)}
                        />
                        <SheetAction
                            icon={<TrashIcon />}
                            label={t("button.remove-entry")}
                            tone={"danger"}
                            onClick={() => onRemove(entry)}
                        />
                    </div>
                </FieldGroup>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={busy || alarmInvalid} onClick={() => void save()}>
                    {t("button.save-entry")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}

/**
 * The properties for {@link Stepper}
 */
type StepperProps = {
    /** The sign it carries */
    label: string;
    /** What it does */
    onClick: () => void;
    /** Whether it has hit its end of the range */
    disabled?: boolean;
};

/**
 * One half of the copies stepper, sized for a thumb
 *
 * @returns the button
 */
function Stepper({ label, onClick, disabled = false }: StepperProps) {
    return (
        <button
            type={"button"}
            disabled={disabled}
            aria-label={label}
            onClick={onClick}
            className={
                "flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) bg-zinc-950/5 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-950/10 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
            }
        >
            {label}
        </button>
    );
}

/**
 * The properties for {@link SheetAction}
 */
type SheetActionProps = {
    /** The mark in front of the label */
    icon: ReactNode;
    /** What the row says */
    label: string;
    /** What it does */
    onClick: () => void;
    /** Whether it destroys something */
    tone?: "danger";
};

/**
 * A full-width row that leaves the form
 *
 * @returns the row
 */
function SheetAction({ icon, label, onClick, tone }: SheetActionProps) {
    return (
        <button
            type={"button"}
            onClick={onClick}
            className={clsx(
                "flex min-h-11 w-full items-center gap-2.5 rounded-(--radius-control) px-3 text-left text-sm font-medium transition *:data-[slot=icon]:size-4",
                tone === "danger"
                    ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    : "text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/10",
            )}
        >
            <span className={"shrink-0 *:size-4"}>{icon}</span>
            {label}
        </button>
    );
}
