import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    PrimaryButton,
    Strong,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { DialogCloseButton } from "src/components/dialog-close-button";
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

/**
 * Where the staged cards go.
 *
 * The collection is picked here rather than when the box was opened, because this is when it is
 * known what is in it — a box turns out to hold two boxes often enough. The session remembers the
 * answer, so the next stack out of the same box is one button.
 *
 * Filing itself is the server's: every staged stack becomes a stack in the collection and the
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
    const [chosen, setChosen] = useState<string | null>(null);
    const [filing, setFiling] = useState(false);
    const copies = entries.reduce((sum, entry) => sum + entry.quantity, 0);

    // Reloaded on every open rather than held: a collection made in another tab, or on the way
    // here, has to be in the list, and this is a handful of rows.
    useEffect(() => {
        if (!open) return;
        let dropped = false;
        setChosen(active?.collection ?? null);
        void Api.collections.list().then((found) => {
            if (!dropped) setCollections(found);
        });
        return () => {
            dropped = true;
        };
    }, [open, active]);

    /**
     * Hands the staging area over to the chosen collection
     */
    async function hand() {
        if (chosen === null || filing) return;
        const target = collections?.find((overview) => overview.collection.uuid === chosen);
        setFiling(true);
        try {
            const filed = await file(chosen);
            if (filed !== null) {
                notify.success(
                    t("toast.filed", {
                        count: filed.copies,
                        amount: filed.copies,
                        name: target?.collection.name ?? "",
                    }),
                );
            }
            onClose();
        } finally {
            setFiling(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} size={"xl"} tall>
            <DialogTitle className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1 truncate"}>{t("heading.file-into")}</span>
                <DialogCloseButton onClose={onClose} />
            </DialogTitle>
            <DialogBody>
                <Text>{t("description.file-into", { count: copies, amount: copies })}</Text>

                {collections === null ? (
                    <Text className={"mt-6"}>{t("label.loading-collections")}</Text>
                ) : collections.length === 0 ? (
                    <Text className={"mt-6"}>{t("description.no-collections")}</Text>
                ) : (
                    <ul className={"mt-4 flex flex-col gap-1"}>
                        {collections.map((overview) => (
                            <li key={overview.collection.uuid}>
                                <button
                                    type={"button"}
                                    aria-pressed={chosen === overview.collection.uuid}
                                    onClick={() => setChosen(overview.collection.uuid)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ring-1 ${
                                        chosen === overview.collection.uuid
                                            ? "bg-zinc-950/5 ring-zinc-950/20 dark:bg-white/10 dark:ring-white/25"
                                            : "ring-transparent hover:bg-zinc-950/5 dark:hover:bg-white/5"
                                    }`}
                                >
                                    <CollectionMarker
                                        color={overview.collection.color}
                                        icon={overview.collection.icon}
                                        size={"md"}
                                    />
                                    <span className={"min-w-0 flex-1"}>
                                        <Strong className={"block truncate"}>{overview.collection.name}</Strong>
                                        <Text className={"truncate"}>
                                            {tg("label.cards", { count: overview.cards, amount: overview.cards })}
                                        </Text>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
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
