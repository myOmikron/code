import { ArrowDownTrayIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Strong, Subheading, Text, notify } from "components";
import { PrimaryButton } from "src/components/primary-button";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { FilingTarget, UUID } from "src/api/api";
import type { CollectionOverviewResponse, DeckOverviewResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { useScannerSessions } from "src/context/scanner-session-context";

/**
 * The properties for {@link FileIntoCollectionDialog}
 */
export type FileIntoCollectionDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Closes the dialog */
    onClose: () => void;
};

/** What the dialog has picked: a collection or one of the account's decks */
type Chosen = { kind: "collection"; uuid: UUID } | { kind: "deck"; uuid: UUID };

/**
 * Where the staged cards go.
 *
 * The target is picked here rather than when the box was opened, because this is when it is
 * known what is in it: a box turns out to hold two boxes often enough. The session remembers a
 * chosen collection, so the next stack out of the same box is one button. One of the account's
 * own decks is a target too: its Physical deck takes the cards, which is how a deck that was
 * already built gets recorded in one go.
 *
 * Filing itself is the server's: every staged stack becomes a stack in the target and the
 * staging area is emptied, both inside one transaction. Either the cards moved or they did not,
 * and there is no state in between for a dropped connection to leave behind.
 *
 * @returns the dialog
 */
export function FileIntoCollectionDialog({ open, onClose }: FileIntoCollectionDialogProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const { active, entries, file } = useScannerSessions();
    const [collections, setCollections] = useState<CollectionOverviewResponse[] | null>(null);
    const [decks, setDecks] = useState<DeckOverviewResponse[] | null>(null);
    const [chosen, setChosen] = useState<Chosen | null>(null);
    const [filing, setFiling] = useState(false);
    const copies = entries.reduce((sum, entry) => sum + entry.quantity, 0);

    // Reloaded on every open rather than held: a collection made in another tab, or on the way
    // here, has to be in the list, and this is a handful of rows.
    useEffect(() => {
        if (!open) return;
        let dropped = false;
        setChosen(active?.collection ? { kind: "collection", uuid: active.collection } : null);
        void Promise.all([Api.collections.list(), Api.decks.list()]).then(([foundCollections, foundDecks]) => {
            if (dropped) return;
            setCollections(foundCollections);
            setDecks(foundDecks);
        });
        return () => {
            dropped = true;
        };
    }, [open, active]);

    /**
     * Hands the staging area over to the chosen collection or deck
     */
    async function hand() {
        if (chosen === null || filing) return;
        const target: FilingTarget = chosen.kind === "deck" ? { deck: chosen.uuid } : { collection: chosen.uuid };
        setFiling(true);
        try {
            const filed = await file(target);
            if (filed !== null) {
                const counts = { count: filed.copies, amount: filed.copies };
                notify.success(
                    chosen.kind === "deck"
                        ? t("toast.filed-deck", {
                              ...counts,
                              name: decks?.find((overview) => overview.deck.uuid === chosen.uuid)?.deck.name ?? "",
                          })
                        : t("toast.filed", {
                              ...counts,
                              name:
                                  collections?.find((overview) => overview.collection.uuid === chosen.uuid)?.collection
                                      .name ?? "",
                          }),
                );
            }
            onClose();
        } finally {
            setFiling(false);
        }
    }

    /**
     * One pickable target
     *
     * @param target what picking the row chooses
     * @param marker the pictogram in front
     * @param name what the target is called
     * @param cards how many cards it holds
     * @returns the row
     */
    function row(target: Chosen, marker: ReactNode, name: string, cards: number) {
        const picked = chosen?.kind === target.kind && chosen.uuid === target.uuid;
        return (
            <li key={target.uuid}>
                <button
                    type={"button"}
                    aria-pressed={picked}
                    onClick={() => setChosen(target)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ring-1 ${
                        picked
                            ? "bg-zinc-950/5 ring-zinc-950/20 dark:bg-white/10 dark:ring-white/25"
                            : "ring-transparent hover:bg-lime-400/15 dark:hover:bg-lime-400/15"
                    }`}
                >
                    {marker}
                    <span className={"min-w-0 flex-1"}>
                        <Strong className={"block truncate"}>{name}</Strong>
                        <Text className={"truncate"}>{tg("label.cards", { count: cards, amount: cards })}</Text>
                    </span>
                </button>
            </li>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} size={"xl"}>
            <DialogTitle>{t("heading.file-into")}</DialogTitle>
            <DialogBody>
                <Text>{t("description.file-into", { count: copies, amount: copies })}</Text>

                {collections === null || decks === null ? (
                    <Text className={"mt-6"}>{t("label.loading-collections")}</Text>
                ) : (
                    <>
                        <Subheading className={"mt-6"}>{t("heading.collections")}</Subheading>
                        {collections.length === 0 ? (
                            <Text className={"mt-2"}>{t("description.no-collections")}</Text>
                        ) : (
                            <ul className={"mt-2 flex flex-col gap-1"}>
                                {collections.map((overview) =>
                                    row(
                                        { kind: "collection", uuid: overview.collection.uuid },
                                        <CollectionMarker
                                            color={overview.collection.color}
                                            icon={overview.collection.icon}
                                            size={"md"}
                                        />,
                                        overview.collection.name,
                                        overview.cards,
                                    ),
                                )}
                            </ul>
                        )}

                        {decks.length > 0 && (
                            <>
                                <Subheading className={"mt-6"}>{t("heading.decks")}</Subheading>
                                <Text className={"mt-1"}>{t("description.file-into-deck")}</Text>
                                <ul className={"mt-2 flex flex-col gap-1"}>
                                    {decks.map((overview) =>
                                        row(
                                            { kind: "deck", uuid: overview.deck.uuid },
                                            <span
                                                className={
                                                    "flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-950/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                                                }
                                            >
                                                <RectangleStackIcon className={"size-3.5"} />
                                            </span>,
                                            overview.deck.name,
                                            overview.cards,
                                        ),
                                    )}
                                </ul>
                            </>
                        )}
                    </>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={chosen === null || filing || copies === 0} onClick={() => void hand()}>
                    <ArrowDownTrayIcon className={"size-5"} />
                    {filing ? t("button.filing") : t("button.file-into")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
