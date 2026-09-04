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
import { addTournamentGuest } from "src/utils/tournament-guest";

export const Route = createFileRoute("/_menu/join/claim/$token")({
    loader: async ({ params }) => {
        // `join` only — this page renders no `JoinCard` and needs none of `tournament`'s strings.
        await i18n.loadNamespaces("join");
        // `Api.join.claimLookup` bypasses `handleError` (see its comment in `api.tsx`) — a stale
        // or already-claimed token answers as a typed form error, not a thrown one, and is the
        // ordinary way this page fails to resolve, not something the router's error screen should
        // own. A thrown failure here (network, 5xx) is the genuinely unexpected case and is left
        // to rethrow.
        const response = await Api.join.claimLookup(params.token);
        return { target: isFormError(response) ? null : response };
    },
    component: RouteComponent,
});

/**
 * Where a scanned claim QR lands: the walk-in's own phone taking over the row an organizer just
 * typed them in under, either by signing in (the row becomes the account's) or by carrying on as
 * a guest (this device becomes the row's device).
 *
 * A dead or already-claimed token reads as an empty state, same shape as `/join/$code`'s own
 * unknown-code state. Otherwise the page names the seat and offers exactly one primary action —
 * claim under the signed-in account, or continue as a guest — plus, logged out, the two doors to
 * sign in or sign up without losing the token, exactly as `join-card.tsx` does for a join code.
 *
 * Reachable with no session at all, same as `/join/$code` — no `<RequireAccount>`.
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

    // Rebound under a name of its own: TypeScript's null-narrowing from the check above does not
    // reach into `claimSeat`/`continueAsGuest` below (control-flow narrowing does not cross a
    // nested function's boundary), but a `const` whose initializer is already narrowed gets that
    // narrowed type permanently, so `seat` is `ClaimTargetResponse` — never `null` — everywhere,
    // closures included.
    const seat = target;

    /** Attaches the signed-in account to the guest row the token names */
    async function claimSeat() {
        setWorking(true);
        setActionError(undefined);
        try {
            // Account-only and goes through `handleError` (see `api.tsx`) — only the typed form
            // error is this page's to render; a thrown failure is `handleError`'s own to report.
            const response = await Api.tournaments.claim(token);
            if (isFormError(response)) {
                if (response.error.already_registered) {
                    // The membership check nobody ran here missed it — a row already exists for
                    // this account. Either way they are in, so go to the tournament they have.
                    void navigate({
                        to: "/tournaments/$tournamentUuid/overview",
                        params: { tournamentUuid: seat.tournament },
                    });
                    return;
                }
                // `invalid_token` — the same message the empty state above would have shown had
                // the token already died before this page even loaded.
                setActionError(t("error.claim-invalid"));
                return;
            }
            notify.success(t("toast.seat-claimed"));
            void navigate({
                to: "/tournaments/$tournamentUuid/overview",
                params: { tournamentUuid: response.tournament },
            });
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
                // A guest request only ever sets `invalid_token` (see `ClaimErrors`' doc comment).
                setActionError(t("error.claim-invalid"));
                return;
            }
            // Remembered under the same token: reattach never consumes it, so this device can
            // fall back to it again the next time its session is lost.
            addTournamentGuest({
                tournamentUuid: response.tournament,
                participantUuid: response.participant,
                claimToken: token,
            });
            notify.success(t("toast.seat-attached"));
            void navigate({
                to: "/tournaments/$tournamentUuid/overview",
                params: { tournamentUuid: response.tournament },
            });
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
                        // Never flash the logged-out doors at an account still being resolved — a
                        // logged-in organizer's own claim is a different action from a guest's.
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
