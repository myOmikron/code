import { PlusIcon, TicketIcon, TrophyIcon } from "@heroicons/react/20/solid";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    Badge,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListDescription,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { TournamentDialog } from "src/components/tournament-dialog";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { useAccount } from "src/context/account";
import i18n from "src/i18n";
import { isFormError } from "src/utils/error";
import { formatDateTime } from "src/utils/format";
import { listTournamentGuests, removeTournamentGuest } from "src/utils/tournament-guest";

export const Route = createFileRoute("/_menu/tournaments/")({
    loader: async () => {
        await i18n.loadNamespaces("tournament");
        try {
            return await Api.tournaments.list();
        } catch (error) {
            // An anonymous visitor with no account and no guest session gets the same opaque
            // 401 an unauthorized account would — the normal case for landing here fresh, and
            // exactly why this route is usable without one: an empty roster, not the error screen.
            if (error instanceof ResponseError && error.response.status === 401) return { tournaments: [] };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * Every event an account owns, co-organizes or plays in — or, for a guest, every event this
 * device's stored participant rows belong to.
 *
 * Usable logged out: a visitor with nothing but a code on a whiteboard can join without ever
 * making an account, which is the entire point of guests being first class.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournaments } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();
    const me = useAccount();
    const [creating, setCreating] = useState(false);

    // Once signed in, any guest row this device holds a claim token for gets attached to the
    // account automatically — the whole reason the token was kept locally in the first place.
    // Logged out for good (not just still checking), the same stored tokens instead re-attach the
    // guest session itself: a phone that cleared its cookies still has the token and lands back on
    // its own row without an account or a second registration.
    useEffect(() => {
        const stored = listTournamentGuests();
        if (stored.length === 0) return;
        // Still resolving the session: an account might yet turn up, and reattaching first would
        // be wasted work the claim branch below is about to make moot anyway.
        if (me.account === null && me.loading) return;

        let cancelled = false;
        void (async () => {
            if (me.account !== null) {
                let claimed = false;
                for (const entry of stored) {
                    try {
                        const response = await Api.tournaments.claimQuietly(entry.claimToken);
                        if (!isFormError(response)) claimed = true;
                        // Definitive answer either way — claimed for good, or the token was
                        // invalid/already used and holding onto it would only retry forever.
                        removeTournamentGuest(entry.tournamentUuid);
                    } catch (error) {
                        // A transient failure (dead wifi, server restart) is the one case the
                        // token must survive: the next visit simply retries the claim.
                        console.error(error);
                    }
                }
                if (!cancelled && claimed) {
                    notify.success(t("toast.guest-claimed"));
                    await router.invalidate();
                }
                return;
            }

            // Logged out for sure. `Api.join.reattach` never consumes the token (see its comment
            // in `api.tsx`), so a successful entry is kept: the session it just restored can lapse
            // again, and the same token is what restores it next time. A typed refusal is the
            // opposite — the only way a token stops resolving is somebody claiming the row for an
            // account, which is permanent, so that entry is dropped rather than retried on every
            // visit for the life of the device. Never routed through `handleError` either way: a
            // guest with no session must not be bounced into a login it cannot complete.
            let reattached = false;
            for (const entry of stored) {
                try {
                    const response = await Api.join.reattach(entry.claimToken);
                    if (isFormError(response)) removeTournamentGuest(entry.tournamentUuid);
                    else reattached = true;
                } catch (error) {
                    // Transient failure — the next visit simply retries, same reasoning as above.
                    console.error(error);
                }
            }
            if (!cancelled && reattached) {
                notify.success(t("toast.guest-reattached"));
                await router.invalidate();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [me.account, me.loading, router, t]);

    return (
        <div className={"flex flex-col gap-6 p-4 sm:p-6"}>
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <Heading>{t("heading.tournaments")}</Heading>
                <div className={"flex flex-wrap gap-3"}>
                    <Button outline={true} href={"/join"}>
                        <TicketIcon />
                        {t("button.join-by-code")}
                    </Button>
                    {me.account !== null && (
                        <PrimaryButton onClick={() => setCreating(true)} className={"max-sm:w-full"}>
                            <PlusIcon />
                            {t("button.create-tournament")}
                        </PrimaryButton>
                    )}
                </div>
            </div>

            {tournaments.length === 0 ? (
                <EmptyState
                    icon={<TrophyIcon />}
                    title={t("label.no-tournaments")}
                    action={
                        <Button outline={true} href={"/join"}>
                            {t("button.join-by-code")}
                        </Button>
                    }
                />
            ) : (
                <StackedList>
                    {tournaments.map(({ tournament, viewer, participant_count }) => (
                        <StackedListFlexRow key={tournament.uuid}>
                            <Link
                                to={"/tournaments/$tournamentUuid/overview"}
                                params={{ tournamentUuid: tournament.uuid }}
                                className={"flex min-w-0 flex-1 items-center justify-between gap-4"}
                            >
                                <StackedListItem>
                                    <StackedListTitle>{tournament.name}</StackedListTitle>
                                    <StackedListDescription>
                                        {tournament.starts_at != null ? formatDateTime(tournament.starts_at) : "—"}
                                    </StackedListDescription>
                                </StackedListItem>
                                <div className={"flex shrink-0 items-center gap-2"}>
                                    {viewer.is_organizer && <Badge color={"blue"}>{t("label.organizer")}</Badge>}
                                    <Badge color={"zinc"}>{t("label.players", { count: participant_count })}</Badge>
                                    <Badge color={tournamentStatusColor(tournament.status)}>
                                        {t(tournamentStatusLabelKey(tournament.status))}
                                    </Badge>
                                </div>
                            </Link>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
            )}

            <TournamentDialog
                open={creating}
                tournament={null}
                onClose={() => setCreating(false)}
                onSaved={(created) => {
                    setCreating(false);
                    notify.success(t("toast.tournament-created"));
                    if (created !== null) {
                        void navigate({
                            to: "/tournaments/$tournamentUuid/overview",
                            params: { tournamentUuid: created.uuid },
                        });
                    }
                }}
            />
        </div>
    );
}
