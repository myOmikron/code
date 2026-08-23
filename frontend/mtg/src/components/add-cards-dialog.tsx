import { CheckIcon, Squares2X2Icon, ViewColumnsIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Strong,
    Text,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckZone } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import type { SearchConstraint } from "src/components/card-search-panel";
import { useDeckLabels, ZONE_ORDER } from "src/components/deck-labels";
import type { Printing } from "src/utils/scryfall";

/** How many of the cards just added are named back */
const RECENT_LIMIT = 12;

/**
 * The properties for {@link AddCardsDialog}
 */
export type AddCardsDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Which zone a picked card goes into */
    zone: DeckZone;
    /** The zones this deck format offers */
    zones?: Array<DeckZone>;
    /** Records a different zone to file into */
    onChangeZone: (zone: DeckZone) => void;
    /** What the search is held to: the format, and the colours the deck may play */
    constraints: Array<SearchConstraint>;
    /** How many copies of a hit already sit in the zone being filed into */
    countOf: (printing: Printing) => number;
    /**
     * Whether a hit already sits in the deck at all, whichever zone holds it.
     *
     * What the "already in" filter hides. Wider than `countOf` on purpose:
     * the counter and the minus act on the zone being filed into, while the
     * filter asks about the whole deck. Falls back to `countOf` where absent.
     */
    includedOf?: (printing: Printing) => boolean;
    /** Files a card, and answers once it is in */
    onAdd: (printing: Printing) => Promise<void>;
    /** Takes a copy back out, and answers once it is gone */
    onRemove: (printing: Printing) => Promise<void>;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Searching for cards with the whole window to do it in.
 *
 * Building a deck is a long run of searches, so the search gets the room and
 * the deck stays where it was: the dialog does not close on a hit, it counts up
 * what went in and names the last few. Squeezing the same search into a column
 * beside the list gave both halves too little to be usable.
 *
 * @returns the dialog
 */
export function AddCardsDialog({
    open,
    zone,
    zones = ZONE_ORDER,
    onChangeZone,
    constraints,
    countOf,
    includedOf,
    onAdd,
    onRemove,
    onClose,
}: AddCardsDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();

    const [added, setAdded] = useState<Array<string>>([]);
    const [twoColumns, setTwoColumns] = useState(false);

    // What is already in the deck is dropped from the hits, but only what was
    // in before this run started: a card added a second ago has to stay on
    // screen, or the minus beside it would be out of reach the moment it is
    // needed.
    const included = includedOf ?? ((printing: Printing) => countOf(printing) > 0);
    const held: Array<SearchConstraint> = [
        ...constraints,
        {
            key: "owned",
            label: t("label.constraint-owned"),
            exclude: (printing) => included(printing) && !added.includes(printing.name),
        },
    ];

    /**
     * Files a hit and remembers that it went in
     *
     * @param printing the card that was picked
     */
    async function add(printing: Printing) {
        await onAdd(printing);
        setAdded((previous) => [printing.name, ...previous]);
    }

    /**
     * Closes the dialog and forgets what this run added
     */
    function close() {
        setAdded([]);
        onClose();
    }

    return (
        <Dialog open={open} onClose={close} size={"6xl"} className={"flex max-h-[calc(100dvh-5rem)] flex-col"}>
            <DialogTitle>{t("heading.add-cards")}</DialogTitle>
            <DialogBody className={"!mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
                <div className={"flex flex-col gap-4"}>
                    <CardSearchPanel
                        unique={"cards"}
                        twoColumns={twoColumns}
                        stickySearch={true}
                        hideInfoOnMobile={true}
                        toolbar={
                            <div className={"flex flex-wrap items-center gap-3"}>
                                <Listbox
                                    value={zone}
                                    aria-label={t("label.add-to-zone")}
                                    onChange={onChangeZone}
                                    className={"w-56"}
                                >
                                    {zones.map((option) => (
                                        <ListboxOption key={option} value={option}>
                                            <ListboxLabel>
                                                {t("label.add-to", { zone: labels.zone(option) })}
                                            </ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                                {added.length > 0 && (
                                    <Badge color={"green"}>
                                        <CheckIcon className={"size-3"} />
                                        {t("label.added-count", { count: added.length })}
                                    </Badge>
                                )}
                                <span
                                    className={
                                        "ml-auto flex items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
                                    }
                                >
                                    {[false, true].map((option) => (
                                        <button
                                            key={String(option)}
                                            type={"button"}
                                            aria-pressed={twoColumns === option}
                                            aria-label={t(option ? "label.columns-two" : "label.columns-one")}
                                            title={t(option ? "label.columns-two" : "label.columns-one")}
                                            onClick={() => setTwoColumns(option)}
                                            className={
                                                twoColumns === option
                                                    ? "rounded-[calc(var(--radius-control)-0.125rem)] bg-(--surface-card) p-1.5 text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                                                    : "rounded-[calc(var(--radius-control)-0.125rem)] p-1.5 text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                                            }
                                        >
                                            {option ? (
                                                <ViewColumnsIcon className={"size-4"} />
                                            ) : (
                                                <Squares2X2Icon className={"size-4"} />
                                            )}
                                        </button>
                                    ))}
                                </span>
                            </div>
                        }
                        constraints={held}
                        countOf={countOf}
                        onAdd={(printing) => void add(printing)}
                        onRemove={(printing) => void onRemove(printing)}
                    />

                    {added.length > 0 && (
                        <div className={"flex flex-col gap-1 border-t border-zinc-950/10 pt-3 dark:border-white/10"}>
                            <Strong className={"text-xs"}>{t("label.added-just-now")}</Strong>
                            <Text className={"text-xs"}>
                                {added.slice(0, RECENT_LIMIT).join(", ")}
                                {added.length > RECENT_LIMIT && " …"}
                            </Text>
                        </div>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button onClick={close}>{tg("button.close")}</Button>
            </DialogActions>
        </Dialog>
    );
}
