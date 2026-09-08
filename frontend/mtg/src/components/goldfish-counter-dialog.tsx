import { MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Field, Input, Label, PrimaryButton } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GoldfishCard } from "src/utils/goldfish";
import { COUNTER_KINDS } from "src/utils/goldfish";

/**
 * The properties for {@link GoldfishCounterDialog}
 */
export type GoldfishCounterDialogProps = {
    /** The card the counters go on, `null` while the dialog is closed */
    card: GoldfishCard | null;
    /** Books a change to one kind of counter */
    onChange: (card: GoldfishCard, kind: string, amount: number) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * What lies on a permanent.
 *
 * The four usual kinds are always offered. Anything else is typed once and
 * then stays in the list for as long as it is on the card.
 *
 * @returns the dialog
 */
export function GoldfishCounterDialog({ card, onChange, onClose }: GoldfishCounterDialogProps) {
    const [t] = useTranslation("goldfish");
    const [tg] = useTranslation();
    const [custom, setCustom] = useState("");

    const kinds = [...COUNTER_KINDS, ...Object.keys(card?.counters ?? {})].filter(
        (kind, index, all) => all.indexOf(kind) === index,
    );
    const step =
        "flex size-8 items-center justify-center rounded-full text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-200 dark:ring-white/20 dark:hover:bg-white/10 *:size-4";

    /**
     * Adds the typed counter
     */
    function addCustom() {
        const name = custom.trim();
        if (card === null || name === "") return;
        onChange(card, name, 1);
        setCustom("");
    }

    return (
        <Dialog open={card !== null} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.counters", { name: card?.name ?? "" })}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-3"}>
                    {kinds.map((kind) => {
                        const value = card?.counters[kind] ?? 0;
                        return (
                            <div key={kind} className={"flex items-center justify-between gap-3"}>
                                <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>{kind}</span>
                                <div className={"flex items-center gap-2"}>
                                    <button
                                        type={"button"}
                                        disabled={value === 0}
                                        aria-label={t("accessibility.decrease-counter", { kind })}
                                        onClick={() => card !== null && onChange(card, kind, -1)}
                                        className={step}
                                    >
                                        <MinusIcon />
                                    </button>
                                    <span
                                        className={clsx(
                                            "w-6 text-center text-sm tabular-nums",
                                            value === 0
                                                ? "text-zinc-400 dark:text-zinc-500"
                                                : "text-zinc-950 dark:text-white",
                                        )}
                                    >
                                        {value}
                                    </span>
                                    <button
                                        type={"button"}
                                        aria-label={t("accessibility.increase-counter", { kind })}
                                        onClick={() => card !== null && onChange(card, kind, 1)}
                                        className={step}
                                    >
                                        <PlusIcon />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    <Field>
                        <Label>{t("label.counter-name")}</Label>
                        <div className={"flex gap-2"}>
                            <Input
                                value={custom}
                                onChange={(event) => setCustom(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        addCustom();
                                    }
                                }}
                            />
                            <Button disabled={custom.trim() === ""} onClick={addCustom}>
                                {t("button.add-counter")}
                            </Button>
                        </div>
                    </Field>
                </div>
            </DialogBody>
            <DialogActions>
                <PrimaryButton onClick={onClose}>{tg("button.close")}</PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
