import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BlockUnsavedChanges, Skeleton, Wizard, notify, wizardSearchSchema } from "components";
import { Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { tournamentFormats } from "src/utils/tournament-settings";
import { TournamentFormatsContext } from "src/wizards/field-types/tournament-rules";
import { createTournamentWizardStore } from "src/wizards/tournament.store";
import { createTournament } from "src/wizards/tournament.submit";
import { tournamentWizard } from "src/wizards/tournament.wizard";

/** The dedicated Tournament creation page. */
export const Route = createFileRoute("/_menu/tournaments/create")({
    validateSearch: wizardSearchSchema,
    loader: async () => {
        const [offered] = await Promise.all([
            Api.decks.formats(),
            i18n.loadNamespaces(["tournament", "deck", "wizard-tournament"]),
        ]);
        return { formats: tournamentFormats(offered.formats) };
    },
    component: RouteComponent,
});

/** The dedicated page for creating a Tournament, as a Wizard. */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { formats } = Route.useLoaderData();
    const { step } = Route.useSearch();
    const navigate = Route.useNavigate();
    const leave = useNavigate();
    const [store] = useState(createTournamentWizardStore);
    const created = useRef<string | null>(null);

    return (
        <RequireAccount>
            <TournamentFormatsContext value={formats}>
                <Suspense fallback={<Skeleton variant={"card"} />}>
                    <Wizard
                        definition={tournamentWizard}
                        heading={t("heading.create-tournament")}
                        description={t("description.create-tournament")}
                        step={step}
                        onStepChange={(next, { replace }) => void navigate({ search: { step: next }, replace })}
                        onSubmit={(values) =>
                            createTournament(values, (tournament) => {
                                created.current = tournament.uuid;
                            })
                        }
                        onDone={() => {
                            if (created.current === null) return void leave({ to: "/tournaments" });
                            notify.success(t("toast.tournament-created"));
                            void leave({
                                to: "/tournaments/$tournamentUuid",
                                params: { tournamentUuid: created.current },
                            });
                        }}
                        store={store}
                        unsavedChangesGuard={(dirty) => (
                            <BlockUnsavedChanges condition={dirty} ignoreSearchChanges={true} />
                        )}
                    />
                </Suspense>
            </TournamentFormatsContext>
        </RequireAccount>
    );
}
