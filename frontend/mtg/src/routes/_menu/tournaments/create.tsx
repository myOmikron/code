import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { notify } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import { TournamentForm } from "src/components/tournament-form";
import i18n from "src/i18n";

/** The dedicated Tournament creation page. */
export const Route = createFileRoute("/_menu/tournaments/create")({
    loader: async () => {
        const [offered] = await Promise.all([Api.decks.formats(), i18n.loadNamespaces(["tournament", "deck"])]);
        return { formats: offered.formats };
    },
    component: RouteComponent,
});

/** The dedicated page for creating a Tournament. */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { formats } = Route.useLoaderData();
    const navigate = useNavigate();
    return (
        <RequireAccount>
            <TournamentForm
                tournament={null}
                formats={formats}
                onClose={() => void navigate({ to: "/tournaments" })}
                onSaved={(saved) => {
                    notify.success(t("toast.tournament-created"));
                    void navigate({ to: "/tournaments/$tournamentUuid", params: { tournamentUuid: saved.uuid } });
                }}
            />
        </RequireAccount>
    );
}
