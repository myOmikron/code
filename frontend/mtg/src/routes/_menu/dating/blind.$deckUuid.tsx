import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Api } from "src/api/api";
import { DatingBlindView } from "src/components/dating-blind-view";
import type { BlindState } from "src/components/dating-blind-view";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { applyBlindDate, rollBlindDate } from "src/utils/blind-date";

/** What the Blind Date page is opened with */
type BlindSearch = {
    /** The Commander's oracle id */
    commander: string;
    /** Its name, for the reveal */
    name: string;
    /** Its art crop, for the reveal */
    art?: string;
};

export const Route = createFileRoute("/_menu/dating/blind/$deckUuid")({
    validateSearch: (search: Record<string, unknown>): BlindSearch => ({
        commander: typeof search.commander === "string" ? search.commander : "",
        name: typeof search.name === "string" ? search.name : "",
        art: typeof search.art === "string" ? search.art : undefined,
    }),
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
        return Api.dating.profile();
    },
    component: RouteComponent,
});

/**
 * A Blind Date: rolled themes, a filled deck, and the reveal before swiping the rest.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { commander, name, art } = Route.useSearch();
    const profile = Route.useLoaderData();
    const navigate = useNavigate();
    const [state, setState] = useState<BlindState>({ kind: "waiting" });
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const bracket = profile.bracket ?? null;
        rollBlindDate(commander, bracket)
            .then(async (date) => {
                const added = await applyBlindDate(deckUuid, date, bracket);
                setState({ kind: "revealed", themes: date.themes, added });
            })
            .catch(() => setState({ kind: "failed" }));
    }, [commander, deckUuid, profile.bracket]);

    return (
        <RequireAccount>
            <DatingBlindView
                name={name}
                art={art ?? null}
                state={state}
                onSwipe={() =>
                    navigate({ to: "/decks/$deckUuid/advisor", params: { deckUuid }, search: { swipe: true } })
                }
                onBuild={() => navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid } })}
            />
        </RequireAccount>
    );
}
