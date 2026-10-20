import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/20/solid";
import { useNavigate } from "@tanstack/react-router";
import { Button, ConfirmDialog, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useAccount } from "src/context/account";

/**
 * The properties for {@link TournamentDropButton}
 */
export type TournamentDropButtonProps = {
    /** The tournament to drop from */
    tournamentUuid: string;
    /** The viewer's own participant row */
    participant: string;
    /** Whether the event is under way; before that, dropping deletes the row and is "leaving" */
    started: boolean;
    /** Called after a drop mid-event; leaving navigates away instead */
    onChanged: () => void | Promise<void>;
};

/**
 * A player's own way out of the event, behind a confirmation
 *
 * `drop` bypasses `handleError`, so a guest with a dead session gets a toast, not a login redirect.
 *
 * @returns the button and its confirmation
 */
export function TournamentDropButton({ tournamentUuid, participant, started, onChanged }: TournamentDropButtonProps) {
    const [t] = useTranslation("tournament");
    const me = useAccount();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    /** Drops the viewer, after the confirmation was accepted */
    async function drop() {
        try {
            await Api.tournaments.participants.drop(tournamentUuid, participant);
        } catch (error) {
            console.error(error);
            notify.error(t("error.action-failed"));
            return;
        }
        setOpen(false);
        if (started) {
            notify.success(t("toast.dropped"));
            await onChanged();
        } else {
            // The row is gone, and with it access to a private event.
            notify.success(t("toast.left"));
            await navigate({ to: me.account !== null ? "/tournaments" : "/join" });
        }
    }

    const label = started ? t("button.drop") : t("button.leave");

    return (
        <>
            <Button outline={true} onClick={() => setOpen(true)}>
                <ArrowRightStartOnRectangleIcon />
                {label}
            </Button>
            <ConfirmDialog
                open={open}
                onClose={() => setOpen(false)}
                onConfirm={drop}
                title={started ? t("heading.confirm-drop") : t("heading.confirm-leave")}
                description={started ? t("description.confirm-drop") : t("description.confirm-leave")}
                confirmLabel={label}
            />
        </>
    );
}
