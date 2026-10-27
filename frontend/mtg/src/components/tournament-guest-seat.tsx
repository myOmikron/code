import { UserMinusIcon } from "@heroicons/react/20/solid";
import { Badge, Button, ConfirmDialog, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CheckIn, TournamentState } from "src/api/generated";
import type { TournamentResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";
import { forgetGuestSeat } from "src/utils/tournament-guest";
import { dropErrorKey } from "src/utils/tournament-participants";

/**
 * The properties for {@link TournamentGuestSeat}
 */
export type TournamentGuestSeatProps = {
    /** The Tournament the reader plays in as a Guest */
    tournament: TournamentResponse;
    /** Whether the Guest is checked in, `null` while unknown */
    checkedIn: boolean | null;
    /** Whether the Guest dropped already */
    dropped: boolean;
    /** Called once the Guest withdrew or dropped */
    onLeft: () => void;
};

/**
 * What a Guest sees of its own seat: whether the desk checked it in, and leaving the Tournament.
 *
 * Before the first Round a Guest withdraws, which ends its Guest seat; afterwards it drops and stays in the
 * standings.
 *
 * @returns the Guest's status and actions
 */
export function TournamentGuestSeat({ tournament, checkedIn, dropped, onLeft }: TournamentGuestSeatProps) {
    const [t] = useTranslation("tournament");
    const [busy, setBusy] = useState(false);
    const [dropping, setDropping] = useState(false);
    const registration = tournament.state === TournamentState.Registration;
    const running =
        !dropped && (tournament.state === TournamentState.Swiss || tournament.state === TournamentState.TopCut);

    /**
     * Withdraws the Guest's sign-up and forgets its Recovery code
     */
    async function withdraw() {
        setBusy(true);
        try {
            await Api.tournaments.participants.withdraw(tournament.uuid);
            forgetGuestSeat(tournament.uuid);
            notify.success(t("toast.sign-up-withdrawn"));
            onLeft();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Drops the Guest after the confirmation was accepted
     */
    async function drop() {
        setBusy(true);
        try {
            const result = await Api.tournaments.participants.dropOut(tournament.uuid);
            setDropping(false);
            if (isFormError(result)) {
                notify.error(t(dropErrorKey(result.error)));
                return;
            }
            notify.success(t("toast.dropped-self"));
            onLeft();
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={"flex flex-wrap items-center gap-3"}>
            <Badge color={"zinc"}>{t("label.guest")}</Badge>
            {registration && tournament.check_in !== CheckIn.Off && checkedIn !== null && (
                <Badge color={checkedIn ? "lime" : "orange"}>
                    {checkedIn ? t("label.checked-in") : t("label.check-in-at-desk")}
                </Badge>
            )}
            {registration && (
                <Button outline disabled={busy} onClick={() => void withdraw()}>
                    {t("button.withdraw-sign-up")}
                </Button>
            )}
            {running && (
                <Button outline disabled={busy} onClick={() => setDropping(true)}>
                    <UserMinusIcon />
                    {t("button.drop")}
                </Button>
            )}
            <ConfirmDialog
                open={dropping}
                onClose={() => setDropping(false)}
                onConfirm={drop}
                title={t("heading.drop-self")}
                description={t("description.drop-self")}
                confirmLabel={t("button.drop")}
            />
        </div>
    );
}
