import { UserMinusIcon } from "@heroicons/react/20/solid";
import { Badge, Button, ConfirmDialog, Text, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CheckIn, TournamentState } from "src/api/generated";
import type { TournamentResponse } from "src/api/generated";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";
import { claimErrorKey, forgetGuestSeat } from "src/utils/tournament-guest";
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
 * What a Guest sees of its own seat: whether the desk checked it in, leaving the Tournament, and keeping the seat
 * with an Account.
 *
 * Before the first Round a Guest withdraws, which ends its Guest seat; afterwards it drops and stays in the
 * standings. Logged in, it claims the Guest for its Account; logged out, it logs in first and comes back here.
 *
 * @returns the Guest's status and actions
 */
export function TournamentGuestSeat({ tournament, checkedIn, dropped, onLeft }: TournamentGuestSeatProps) {
    const [t] = useTranslation("tournament");
    const { account } = useAccount();
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
     * Keeps the seat as the logged-in Account's own Participant and forgets the Recovery code
     */
    async function claim() {
        setBusy(true);
        try {
            const result = await Api.tournaments.guests.claim(tournament.uuid);
            if (isFormError(result)) {
                notify.error(t(claimErrorKey(result.error)));
                return;
            }
            forgetGuestSeat(tournament.uuid);
            notify.success(t("toast.guest-seat-claimed"));
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
        <div className={"flex flex-col gap-3"}>
            <div
                className={
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 ring-1 ring-zinc-950/10 dark:ring-white/10"
                }
            >
                <Text>{t("description.keep-guest-seat")}</Text>
                {account !== null ? (
                    <Button outline disabled={busy} onClick={() => void claim()}>
                        {t("button.keep-guest-seat")}
                    </Button>
                ) : (
                    <Button outline href={"/auth/login"} search={{ redirect: window.location.pathname }}>
                        {t("button.log-in-to-keep-guest-seat")}
                    </Button>
                )}
            </div>
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
            </div>
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
