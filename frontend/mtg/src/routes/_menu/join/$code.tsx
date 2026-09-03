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
        // The card brings its own `tournament` namespace strings with it; this page's own copy
        // (the heading, the unknown-code empty state) lives in `join` instead.
        await Promise.all([i18n.loadNamespaces("join"), i18n.loadNamespaces("tournament")]);
        // `Api.join.lookup` bypasses `handleError` (see its comment in `api.tsx`) — an unknown or
        // expired code answers as a form error, not a thrown one, and is the ordinary way this
        // page fails to resolve, not something the router's error screen should own. A thrown
        // failure here (network, 5xx) is the genuinely unexpected case and is left to rethrow.
        const response = await Api.join.lookup(params.code);
        return { lookup: isFormError(response) ? null : response };
    },
    component: RouteComponent,
});

/**
 * The deep-link door into a tournament: `{origin}/join/{code}`, opened from a QR code, a pasted
 * link, or the `/join` page's own scanner and typed field.
 *
 * A code that resolves renders the same {@link JoinCard} every other door into a tournament ends
 * up at — guest vs. account, already-joined, decklist policy and all. A code that does not is not
 * the app's error screen's business; it reads as a dead link, same shape as
 * `tournaments/$tournamentUuid/_tournament.tsx`'s own dead-link state.
 *
 * Reachable with no session at all, same as `/join` itself — no `<RequireAccount>`.
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
                        void navigate({ to: "/tournaments/$tournamentUuid/overview", params: { tournamentUuid } })
                    }
                />
            </div>
        </div>
    );
}
