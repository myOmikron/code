import { NoSymbolIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, EmptyState, Heading } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { JoinCard } from "src/components/join-card";
import i18n from "src/i18n";
import { isFormError } from "src/utils/error";

export const Route = createFileRoute("/_menu/join/$code")({
    loader: async ({ params }) => {
        await Promise.all([i18n.loadNamespaces("join"), i18n.loadNamespaces("tournament")]);
        // An unknown code is a typed refusal; anything thrown is unexpected and rethrown.
        const response = await Api.join.lookup(params.code);
        return { lookup: isFormError(response) ? null : response };
    },
    component: RouteComponent,
});

/**
 * The join deep link `/join/{code}`; reachable without a session
 *
 * @returns the page
 */
function RouteComponent() {
    const { code } = Route.useParams();
    const { lookup } = Route.useLoaderData();
    const [t] = useTranslation("join");
    const navigate = useNavigate();

    if (lookup === null) {
        return (
            <div className={"flex flex-col gap-6 p-4 sm:p-6"}>
                <EmptyState
                    icon={<NoSymbolIcon />}
                    title={t("error.unknown-code")}
                    action={<Button href={"/join"}>{t("button.back-to-join")}</Button>}
                />
            </div>
        );
    }

    return (
        <div className={"flex flex-col items-center gap-6 p-4 sm:p-6"}>
            <div className={"flex w-full max-w-md flex-col gap-4"}>
                <Heading>{t("heading.join")}</Heading>
                <JoinCard
                    code={code}
                    lookup={lookup}
                    onJoined={(tournamentUuid) =>
                        void navigate({ to: "/tournaments/$tournamentUuid", params: { tournamentUuid } })
                    }
                />
            </div>
        </div>
    );
}
