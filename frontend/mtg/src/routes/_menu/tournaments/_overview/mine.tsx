import { createFileRoute } from "@tanstack/react-router";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { EmptyState, Subheading, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import { TournamentList } from "src/components/tournament-list";

export const Route = createFileRoute("/_menu/tournaments/_overview/mine")({
    loader: () => Api.tournaments.mine(),
    component: RouteComponent,
});

/**
 * The reader's Tournaments: the ones it organizes and the ones it plays in, latest start first.
 *
 * @returns the two lists
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { organizing, participating } = Route.useLoaderData();

    return (
        <RequireAccount>
            {organizing.length === 0 && participating.length === 0 ? (
                <EmptyState
                    icon={<TrophyIcon />}
                    title={t("heading.no-my-tournaments")}
                    description={t("description.no-my-tournaments")}
                />
            ) : (
                <div className={"flex flex-col gap-8"}>
                    <section className={"flex flex-col gap-3"}>
                        <Subheading>{t("heading.organizing")}</Subheading>
                        {organizing.length === 0 ? (
                            <Text>{t("description.no-organizing")}</Text>
                        ) : (
                            <TournamentList tournaments={organizing} showOwner={true} />
                        )}
                    </section>
                    <section className={"flex flex-col gap-3"}>
                        <Subheading>{t("heading.participating")}</Subheading>
                        {participating.length === 0 ? (
                            <Text>{t("description.no-participating")}</Text>
                        ) : (
                            <TournamentList tournaments={participating} showOwner={true} />
                        )}
                    </section>
                </div>
            )}
        </RequireAccount>
    );
}
