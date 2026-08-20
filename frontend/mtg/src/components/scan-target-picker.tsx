import { ArchiveBoxIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, EmptyState, Strong, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse } from "src/api/generated";
import { useAccount } from "src/context/account.tsx";
import type { ScanTarget } from "src/utils/scan-sessions";

/**
 * The properties for {@link ScanTargetPicker}
 */
export type ScanTargetPickerProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The session's current target, shown as selected */
    target: ScanTarget | null;
    /** Called with the chosen collection */
    onSelect: (target: ScanTarget) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Pick the collection a scan session transfers into.
 *
 * Only shelf collections are offered — a deck's own collection is managed through the deck, and
 * scanning cards straight into one is not a thing this flow does.
 *
 * @returns the dialog
 */
export function ScanTargetPicker({ open, target, onSelect, onClose }: ScanTargetPickerProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();
    const me = useAccount();
    const loggedIn = me.account !== null;
    const [collections, setCollections] = useState<CollectionOverviewResponse[] | null>(null);

    useEffect(() => {
        if (!open || !loggedIn) return;
        let dropped = false;
        void Api.collections.list().then((all) => {
            if (!dropped) setCollections(all.filter((overview) => overview.collection.deck == null));
        });
        return () => {
            dropped = true;
        };
    }, [open, loggedIn]);

    return (
        <Dialog open={open} onClose={onClose} size="lg">
            <DialogTitle>{t("heading.choose-target")}</DialogTitle>
            <DialogBody>
                {!loggedIn ? (
                    <Text>{t("description.needs-login")}</Text>
                ) : collections === null ? (
                    <Text>{t("label.loading-collections")}</Text>
                ) : collections.length === 0 ? (
                    <EmptyState
                        variant="bare"
                        icon={<ArchiveBoxIcon />}
                        title={t("heading.no-collections")}
                        description={t("description.no-collections")}
                    />
                ) : (
                    <ul className="flex flex-col divide-y divide-zinc-950/5 dark:divide-white/5">
                        {collections.map(({ collection, cards }) => (
                            <li key={collection.uuid}>
                                <button
                                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-zinc-950/5 dark:hover:bg-white/5 ${collection.uuid === target?.uuid ? "bg-zinc-950/5 dark:bg-white/5" : ""}`}
                                    onClick={() => onSelect({ uuid: collection.uuid, name: collection.name })}
                                >
                                    <ArchiveBoxIcon className="size-5 shrink-0 text-zinc-400" />
                                    <span className="min-w-0 flex-1">
                                        <Strong className="block truncate">{collection.name}</Strong>
                                        <Text className="truncate">
                                            {tg("label.cards", { count: cards, amount: cards })}
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
            </DialogActions>
        </Dialog>
    );
}
