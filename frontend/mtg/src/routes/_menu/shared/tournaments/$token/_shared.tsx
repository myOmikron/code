import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { Badge, EmptyState, HeadingLayout } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { formatDateTime } from "src/utils/format";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("tournament");
        try {
            const [tournament] = await Promise.all([Api.shared.tournaments.get(params.token), strings]);
            return { tournament };
        } catch (error) {
            if (isDeadShareLink(error)) {
                await strings;
                return { tournament: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a tournament somebody shared: its name, status, format, when and where.
 *
 * One page rather than two tabs, the same call the authed side made: how full the event is and
 * who is in it are one glance, not two.
 *
 * Read-only by construction, like the rest of this section: no join code, no decklists, no
 * organizer usernames and no actions anywhere under this layout. See `SharedTournamentResponse`'s
 * own doc comment for why it is a type of its own rather than a redacted `TournamentResponse`.
 *
 * @returns the tabbed frame around the current tab, or the dead-link empty state
 */
function RouteComponent() {
    const { tournament } = Route.useLoaderData();
    const [t] = useTranslation("tournament");

    if (tournament === null) {
        return (
            <EmptyState
                icon={<LinkSlashIcon />}
                title={t("heading.share-link-dead")}
                description={t("description.share-link-dead")}
            />
        );
    }

    return (
        <div className={"flex flex-col gap-2"}>
            <HeadingLayout
                heading={tournament.name}
                headingDescription={
                    <span className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                        <Badge color={tournamentStatusColor(tournament.status)}>
                            {t(tournamentStatusLabelKey(tournament.status))}
                        </Badge>
                        <span aria-hidden={true}>·</span>
                        <span>{tournament.format}</span>
                        {tournament.starts_at != null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span>{formatDateTime(tournament.starts_at)}</span>
                            </>
                        )}
                    </span>
                }
            >
                <Outlet />
            </HeadingLayout>
        </div>
    );
}
