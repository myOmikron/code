import { ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse, SourcedStackResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { groupByOrigin } from "src/utils/deck-sourcing";

/**
 * The properties for {@link DeckDissolveDialog}
 */
export type DeckDissolveDialogProps = {
    /** The deck to take apart, `null` to keep the dialog closed */
    deck: { uuid: string; name: string } | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after cards were sorted back */
    onDissolved: () => void | Promise<void>;
};

/**
 * Taking a deck apart, back into the collections the cards came out of.
 *
 * The list is grouped by where things belong rather than by card: what somebody
 * standing at a shelf needs to know is which collection to open next, and how much
 * goes in it. Cards that were bought straight into the deck remember no collection, so
 * they are the one thing this has to ask about.
 *
 * @returns the dialog
 */
export function DeckDissolveDialog({ deck, onClose, onDissolved }: DeckDissolveDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const [filed, setFiled] = useState<Array<SourcedStackResponse>>([]);
    const [collections, setBoxes] = useState<Array<CollectionOverviewResponse>>([]);
    const [target, setTarget] = useState<string>("");
    const [busy, setBusy] = useState(false);

    const uuid = deck?.uuid ?? null;
    useEffect(() => {
        if (uuid === null) return;

        let dropped = false;
        void (async () => {
            const [sourcing, collections] = await Promise.all([Api.decks.sourcing.read(uuid), Api.collections.list()]);
            if (dropped) return;
            const shelf = collections.filter((collection) => collection.collection.deck == null);
            setFiled(sourcing.filed);
            setBoxes(shelf);
            setTarget(shelf[0]?.collection.uuid ?? "");
        })();
        return () => {
            dropped = true;
        };
    }, [uuid]);

    const groups = groupByOrigin(filed);
    const homeless = filed.filter((stack) => stack.origin == null);
    const copies = filed.reduce((sum, stack) => sum + stack.quantity, 0);

    /**
     * Sorts everything back and closes
     */
    async function dissolve() {
        if (uuid === null) return;
        setBusy(true);
        try {
            const moved = await Api.decks.sourcing.returnAll(uuid, homeless.length > 0 ? target : null);
            notify.success(t("toast.cards-returned", { count: moved.returned }));
            onClose();
            await onDissolved();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={deck !== null} onClose={onClose}>
            <DialogTitle>{t("heading.dissolve-deck")}</DialogTitle>
            <DialogDescription>
                {t("description.dissolve-deck", { name: deck?.name ?? "", count: copies })}
            </DialogDescription>
            <DialogBody>
                {filed.length === 0 ? (
                    <Text>{t("description.deck-collection-empty")}</Text>
                ) : (
                    <div className={"flex flex-col gap-5"}>
                        <ul className={"flex flex-col gap-2"}>
                            {groups.map((group) => (
                                <li
                                    key={group.origin ?? "none"}
                                    className={
                                        "flex items-center gap-3 rounded-(--radius-control) bg-zinc-950/[0.03] px-3 py-2 dark:bg-white/5"
                                    }
                                >
                                    {group.origin === null ? (
                                        <CollectionMarker color={"zinc"} icon={"box"} size={"md"} />
                                    ) : (
                                        <CollectionMarker
                                            color={group.color ?? ""}
                                            icon={group.icon ?? ""}
                                            size={"md"}
                                        />
                                    )}
                                    <span className={"min-w-0 flex-1 truncate text-zinc-950 dark:text-white"}>
                                        {group.name ?? t("label.no-origin")}
                                    </span>
                                    <span className={"shrink-0 text-sm text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                        {tg("label.cards", {
                                            count: copiesIn(group.stacks),
                                            amount: copiesIn(group.stacks),
                                        })}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {homeless.length > 0 && collections.length > 0 && (
                            <Field>
                                <Label>{t("label.return-target")}</Label>
                                <Listbox value={target} onChange={setTarget}>
                                    {collections.map((collection) => (
                                        <ListboxOption
                                            key={collection.collection.uuid}
                                            value={collection.collection.uuid}
                                        >
                                            <ListboxLabel>{collection.collection.name}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                            </Field>
                        )}
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={busy || filed.length === 0} onClick={() => void dissolve()}>
                    <ArrowUturnLeftIcon />
                    {t("button.return-all")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}

/**
 * How many copies a group of stacks comes to
 *
 * @param stacks the stacks in one collection's group
 *
 * @returns the number of cards
 */
function copiesIn(stacks: Array<SourcedStackResponse>): number {
    return stacks.reduce((sum, stack) => sum + stack.quantity, 0);
}
