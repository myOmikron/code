import { EyeSlashIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import { Suggestion } from "src/api/graph-generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckAdvisorWhy } from "src/components/deck-advisor-why";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorCardDialog}
 */
export type DeckAdvisorCardDialogProps = {
    /** The suggestion being looked at, or null while the dialog is closed */
    suggestion: Suggestion | null;
    /** The batch it arrived in, which every axis is normalised against */
    batch: Array<Suggestion>;
    /** The resolved card, or null when the catalog could not place the name */
    printing: Printing | null;
    /** Called when the card should go into the deck */
    onAdd: (suggestion: Suggestion) => void;
    /** Called when the card should never be suggested again */
    onIgnore: (suggestion: Suggestion) => void;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Whether an add is in flight, disabling the button */
    busy: boolean;
};

/**
 * A suggested card, close up, with the whole argument for it underneath.
 *
 * One place for both halves of the decision: what the card actually does —
 * rules text, printing, price — and why this tool put it in front of you,
 * axis by axis with the points. The gallery outside carries the silhouette
 * and one clause; everything that used to crowd the list lives here, where
 * somebody has asked for it.
 *
 * Acting from here closes the dialog, because the card it is showing is about
 * to leave the list either way.
 *
 * @returns the dialog
 */
export function DeckAdvisorCardDialog({
    suggestion,
    batch,
    printing,
    onAdd,
    onIgnore,
    onClose,
    busy,
}: DeckAdvisorCardDialogProps) {
    const [t] = useTranslation("advisor");

    return (
        <CardDetailDialog
            printing={suggestion === null ? null : printing}
            onClose={onClose}
            actions={
                suggestion === null ? undefined : (
                    <>
                        <Button
                            plain
                            onClick={() => {
                                onIgnore(suggestion);
                                onClose();
                            }}
                        >
                            <EyeSlashIcon />
                            {t("button.ignore-card")}
                        </Button>
                        <Button
                            color={"blue"}
                            disabled={busy || printing === null}
                            onClick={() => {
                                onAdd(suggestion);
                                onClose();
                            }}
                        >
                            <PlusIcon />
                            {t("button.add-card")}
                        </Button>
                    </>
                )
            }
        >
            {/* No divider of its own: the dialog already rules a line above
                whatever it is handed. */}
            {suggestion !== null && (
                <>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.why-card")}</h3>
                    <DeckAdvisorWhy suggestion={suggestion} batch={batch} />
                </>
            )}
        </CardDetailDialog>
    );
}
