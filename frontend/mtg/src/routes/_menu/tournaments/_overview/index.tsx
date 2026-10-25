import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Timeframe } from "src/api/generated";
import type { TimeframeChoice, TournamentFilter } from "src/components/tournament-filters";
import { TournamentFilters } from "src/components/tournament-filters";
import { TournamentList } from "src/components/tournament-list";

/**
 * Search params of the public Tournament overview; upcoming Tournaments when the timeframe is left out
 */
export type TournamentOverviewSearch = {
    /** Past or all Tournaments instead of the upcoming ones */
    timeframe?: Exclude<TimeframeChoice, typeof Timeframe.Upcoming>;
    /** Only this format, by its slug */
    format?: string;
    /** Only locations containing this text */
    location?: string;
};

const overviewFrame = getRouteApi("/_menu/tournaments/_overview");

export const Route = createFileRoute("/_menu/tournaments/_overview/")({
    validateSearch: (search: Record<string, unknown>): TournamentOverviewSearch => {
        const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
        return {
            timeframe: search.timeframe === Timeframe.Past || search.timeframe === "All" ? search.timeframe : undefined,
            format: text(search.format),
            location: text(search.location),
        };
    },
    loaderDeps: ({ search }) => ({ timeframe: search.timeframe, format: search.format, location: search.location }),
    loader: ({ deps }) =>
        Api.tournaments.listPublic({
            timeframe: deps.timeframe === "All" ? undefined : (deps.timeframe ?? Timeframe.Upcoming),
            format: deps.format,
            location: deps.location,
        }),
    component: RouteComponent,
});

/**
 * The public Tournaments, upcoming ones soonest first unless the filters say otherwise.
 *
 * @returns the filters and the list
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournaments } = Route.useLoaderData();
    const { formats } = overviewFrame.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });

    const filter: TournamentFilter = {
        timeframe: search.timeframe ?? Timeframe.Upcoming,
        format: search.format,
        location: search.location,
    };
    const filtering = search.timeframe !== "All" || search.format !== undefined || search.location !== undefined;

    return (
        <div className={"flex flex-col gap-6"}>
            <TournamentFilters
                filter={filter}
                formats={formats}
                onChange={(next) =>
                    void navigate({
                        search: {
                            timeframe: next.timeframe === Timeframe.Upcoming ? undefined : next.timeframe,
                            format: next.format,
                            location: next.location,
                        },
                        replace: true,
                    })
                }
            />
            {tournaments.length > 0 ? (
                <TournamentList tournaments={tournaments} showOwner={true} />
            ) : filtering ? (
                <EmptyState
                    icon={<TrophyIcon />}
                    title={t("heading.no-matching-tournaments")}
                    description={t("description.no-matching-tournaments")}
                />
            ) : (
                <EmptyState
                    icon={<TrophyIcon />}
                    title={t("heading.no-public-tournaments")}
                    description={t("description.no-public-tournaments")}
                />
            )}
        </div>
    );
}
