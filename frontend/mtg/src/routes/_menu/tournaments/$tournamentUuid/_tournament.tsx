import { NoSymbolIcon } from "@heroicons/react/20/solid";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Badge, Button, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { TournamentGuestUpgradeBanner } from "src/components/tournament-guest-upgrade-banner";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { formatDateTime } from "src/utils/format";
import i18n from "src/i18n";
import { clockSkew } from "src/utils/round-clock";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces("tournament");
        try {
            const [details, rounds] = await Promise.all([
                Api.tournaments.get(params.tournamentUuid),
                Api.tournaments.rounds.list(params.tournamentUuid),
            ]);
            // Biased by at most half the round trip, which a seconds display hides.
            const skewMs = clockSkew(rounds.server_time, Date.now());
            return { ...details, rounds: rounds.rounds, skewMs };
        } catch (error) {
            // 400 (denied) or 401 (no session): show the dead-link state, not the error screen.
            if (error instanceof ResponseError) return null;
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The frame around one tournament: name, status and tabs; reachable by guests
 *
 * @returns the tabbed frame around the current tab, or an empty state for a tournament the viewer
 * cannot reach
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const data = Route.useLoaderData();
    const [t] = useTranslation("tournament");

    if (data === null) {
        return (
            <EmptyState
                icon={<NoSymbolIcon />}
                title={t("error.tournament-gone")}
                action={<Button href={"/tournaments"}>{t("heading.tournaments")}</Button>}
            />
        );
    }

    const { tournament, viewer, rounds } = data;
    const started = tournament.status === "Running" || tournament.status === "Finished";
    const round = rounds.at(-1);
    const currentRoundLabel =
        round === undefined
            ? t("heading.rounds")
            : round.number != null
              ? t("heading.round-number", { number: round.number })
              : round.kind === "Draft"
                ? t("heading.draft")
                : t("heading.deckbuilding");

    return (
        <div className={"flex flex-col gap-2"}>
            <TabLayout
                heading={tournament.name}
                headingDescription={
                    <span className={"flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"}>
                        <Badge color={tournamentStatusColor(tournament.status)}>
                            {t(tournamentStatusLabelKey(tournament.status))}
                        </Badge>
                        {tournament.starts_at != null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span>{formatDateTime(tournament.starts_at)}</span>
                            </>
                        )}
                    </span>
                }
                tabs={
                    <TabMenu>
                        {/* Exact, since this path is a prefix of every other tab's. */}
                        <Tab
                            href={"/tournaments/$tournamentUuid"}
                            params={{ tournamentUuid }}
                            activeOptions={{ exact: true }}
                        >
                            {started ? currentRoundLabel : t("heading.tournament")}
                        </Tab>
                        {started && (
                            <Tab href={"/tournaments/$tournamentUuid/standings"} params={{ tournamentUuid }}>
                                {t("heading.standings")}
                            </Tab>
                        )}
                        {started && (
                            <Tab href={"/tournaments/$tournamentUuid/players"} params={{ tournamentUuid }}>
                                {t("heading.players")}
                            </Tab>
                        )}
                        {/* Direct navigation still works; `settings.tsx` shows an empty state then. */}
                        {viewer.is_organizer && (
                            <Tab href={"/tournaments/$tournamentUuid/settings"} params={{ tournamentUuid }}>
                                {t("heading.settings")}
                            </Tab>
                        )}
                    </TabMenu>
                }
            >
                <TournamentGuestUpgradeBanner tournamentUuid={tournamentUuid} participantUuid={viewer.participant} />
                <Outlet />
            </TabLayout>
        </div>
    );
}
