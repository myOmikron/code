import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link WatchListPriceNote}
 */
export type WatchListPriceNoteProps = {
    /**
     * When the prices on this page last came out of a catalog sync
     *
     * As the wire carries it; the only thing done with it is showing the day.
     */
    updatedAt?: string | null;
};

/**
 * Where the prices come from, and what they do not cover.
 *
 * The line that is always on screen is the one somebody needs without asking:
 * how old these numbers are. The caveats behind it matter exactly once, when an
 * alarm is set, and are noise on every visit after that, so they sit one tap
 * away rather than folded into the page. Folding them into the page was the
 * first attempt, and a disclosure triangle over a paragraph of small print is
 * something a phone reader scrolls straight past.
 *
 * @returns the line and the dialog behind it
 */
export function WatchListPriceNote({ updatedAt }: WatchListPriceNoteProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type={"button"}
                onClick={() => setOpen(true)}
                className={
                    "inline-flex min-h-8 items-center gap-1.5 self-start rounded-(--radius-pill) px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-950/5 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                }
            >
                <InformationCircleIcon className={"size-4 shrink-0"} />
                {updatedAt == null
                    ? t("heading.price-limits")
                    : t("label.prices-from", { date: new Date(updatedAt).toLocaleDateString() })}
            </button>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>{t("heading.price-limits")}</DialogTitle>
                <DialogBody className={"flex flex-col gap-3"}>
                    <Text>{t("description.price-source-long")}</Text>
                    <Text>{t("description.price-condition")}</Text>
                    <Text>{t("description.price-etched")}</Text>
                    <Text>{t("description.price-staleness")}</Text>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={() => setOpen(false)}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
