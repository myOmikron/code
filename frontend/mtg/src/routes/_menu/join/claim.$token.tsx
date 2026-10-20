import { NoSymbolIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, Heading, PrimaryButton, Text, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import { useAccount } from "src/context/account";
import i18n from "src/i18n";
import { isFormError } from "src/utils/error";
import { addTournamentGuest, removeTournamentGuest } from "src/utils/tournament-guest";

export const Route = createFileRoute("/_menu/join/claim/$token")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces("join");
        // A dead token is a typed refusal; anything thrown is unexpected and rethrown.
        const response = await Api.join.claimLookup(params.token);
        return { target: isFormError(response) ? null : response };
    },
    component: RouteComponent,
});

/**
 * Where a scanned claim QR lands: claim the guest row for the signed-in account, or continue on
 * this device as the guest; reachable without a session
 *
 * @returns the page
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { target } = Route.useLoaderData();
    const [t] = useTranslation("join");
    const navigate = useNavigate();
    const me = useAccount();

    const [working, setWorking] = useState(false);
    const [actionError, setActionError] = useState<string | undefined>();

    if (target === null) {
        return (
            <div className={"flex flex-col gap-6 p-4 sm:p-6"}>
                <EmptyState
                    icon={<NoSymbolIcon />}
                    title={t("error.claim-invalid")}
                    action={<Button href={"/join"}>{t("button.back-to-join")}</Button>}
                />
            </div>
        );
    }

    // A narrowed `const`, so the closures below see it as non-null.
    const seat = target;

    /**
     * Opens a tournament's page
     *
     * @param tournamentUuid the tournament
     */
    function openTournament(tournamentUuid: string) {
        void navigate({ to: "/tournaments/$tournamentUuid", params: { tournamentUuid } });
    }

    /** Attaches the signed-in account to the guest row the token names */
    async function claimSeat() {
        setWorking(true);
        setActionError(undefined);
        try {
            // Goes through `handleError`, so only typed refusals are handled here.
            const response = await Api.tournaments.claim(token);
            if (isFormError(response)) {
                // Already on the roster: they are in either way.
                if (response.error.already_registered) {
                    openTournament(seat.tournament);
                    return;
                }
                setActionError(t("error.claim-invalid"));
                return;
            }
            removeTournamentGuest(response.tournament);
            notify.success(t("toast.seat-claimed"));
            openTournament(response.tournament);
        } finally {
            setWorking(false);
        }
    }

    /** Points this device's guest session at the row, no account required */
    async function continueAsGuest() {
        setWorking(true);
        setActionError(undefined);
        try {
            const response = await Api.join.reattach(token);
            if (isFormError(response)) {
                setActionError(t("error.claim-invalid"));
                return;
            }
            // Reattach never consumes the token, so it can restore a lost session again later.
            addTournamentGuest({
                tournamentUuid: response.tournament,
                participantUuid: response.participant,
                claimToken: token,
            });
            notify.success(t("toast.seat-attached"));
            openTournament(response.tournament);
        } catch (error) {
            console.error(error);
            setActionError(t("error.claim-failed"));
        } finally {
            setWorking(false);
        }
    }

    return (
        <div className={"flex flex-col items-center gap-6 p-4 sm:p-6"}>
            <div className={"flex w-full max-w-md flex-col gap-4"}>
                <Heading>{t("heading.claim")}</Heading>
                <div
                    className={
                        "flex flex-col gap-3 rounded-(--radius-card) border border-zinc-950/10 p-4 dark:border-white/10"
                    }
                >
                    <Text>
                        {t("description.claim-seat", { name: seat.display_name, tournament: seat.tournament_name })}
                    </Text>

                    {me.loading ? (
                        <Text>{t("label.loading")}</Text>
                    ) : me.account !== null ? (
                        <div className={"flex flex-col gap-3"}>
                            <PrimaryButton loading={working} onClick={() => void claimSeat()}>
                                {t("button.claim-seat")}
                            </PrimaryButton>
                            {actionError !== undefined && <InlineError>{actionError}</InlineError>}
                        </div>
                    ) : (
                        <div className={"flex flex-col gap-3"}>
                            <PrimaryButton loading={working} onClick={() => void continueAsGuest()}>
                                {t("button.claim-continue-as-guest")}
                            </PrimaryButton>
                            {actionError !== undefined && <InlineError>{actionError}</InlineError>}
                            <div className={"flex flex-wrap gap-2"}>
                                <Button
                                    outline={true}
                                    href={"/auth/login"}
                                    search={{ redirect: `/join/claim/${token}` }}
                                >
                                    {t("button.login")}
                                </Button>
                                <Button
                                    outline={true}
                                    href={"/auth/signup"}
                                    search={{ redirect: `/join/claim/${token}` }}
                                >
                                    {t("button.signup")}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
