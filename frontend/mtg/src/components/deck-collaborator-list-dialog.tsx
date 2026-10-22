import { Badge, Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckCollaboratorResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/**
 * The properties for {@link DeckCollaboratorListDialog}
 */
export type DeckCollaboratorListDialogProps = {
    /** The deck whose Collaborators are shown, `null` to keep the dialog closed */
    deckUuid: string | null;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * Who collaborates on a deck and at which level, as a Collaborator reads it.
 *
 * @returns the dialog
 */
export function DeckCollaboratorListDialog({ deckUuid, onClose }: DeckCollaboratorListDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();
    const [collaborators, setCollaborators] = useState<Array<DeckCollaboratorResponse>>([]);

    useEffect(() => {
        setCollaborators([]);
        if (deckUuid === null) return;
        let gone = false;
        Api.decks.collaborators
            .list(deckUuid)
            .then((list) => {
                if (!gone) setCollaborators(list.collaborators);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [deckUuid]);

    return (
        <Dialog open={deckUuid !== null} onClose={onClose} size={"lg"}>
            <DialogTitle>{t("heading.collaborators")}</DialogTitle>
            <DialogDescription>{t("description.collaborators-read-only")}</DialogDescription>
            <DialogBody>
                {collaborators.length === 0 ? (
                    <Text>{t("description.no-collaborators")}</Text>
                ) : (
                    <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {collaborators.map((collaborator) => (
                            <li key={collaborator.account} className={"flex items-center gap-3 py-2"}>
                                <span className={"min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                                    {collaborator.username}
                                </span>
                                <Badge color={"zinc"}>{labels.collaboratorLevel(collaborator.level)}</Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
