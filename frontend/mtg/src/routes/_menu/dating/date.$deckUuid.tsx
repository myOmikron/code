import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Api } from "src/api/api";
import type { DateSessionResponse } from "src/api/generated";
import { DatingDateView } from "src/components/dating-date-view";
import { RequireAccount } from "src/components/require-account";
import { pickLine, useDatingLines } from "src/utils/dating-lines";
import i18n from "src/i18n";

export const Route = createFileRoute("/_menu/dating/date/$deckUuid")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces(["dating"]);
        const session = await Api.dating.date.get(params.deckUuid);
        if (session === null) throw redirect({ to: "/decks/$deckUuid/cards", params });
        return session;
    },
    component: RouteComponent,
});

/**
 * Plan a date: the Commander proposes its interests, the player answers and brings
 * themes of their own, and the chemistry decides how it ends.
 *
 * @returns the page
 */
function RouteComponent() {
    const navigate = useNavigate();
    const loaded = Route.useLoaderData();
    const [session, setSession] = useState<DateSessionResponse>(loaded);
    const [busy, setBusy] = useState(false);
    const lines = useDatingLines();
    const deck = session.deck;

    const act = async (move: () => Promise<DateSessionResponse>) => {
        setBusy(true);
        try {
            setSession(await move());
        } finally {
            setBusy(false);
        }
    };

    return (
        <RequireAccount>
            <DatingDateView
                session={session}
                busy={busy}
                onAnswer={(level) => act(() => Api.dating.date.answer(deck, level))}
                onBring={(theme, level) => act(() => Api.dating.date.bring(deck, theme, level))}
                onDateNight={() => act(() => Api.dating.date.dateNight(deck))}
                onComeBack={() => act(() => Api.dating.date.comeBack(deck))}
                onMeetCards={() =>
                    navigate({ to: "/decks/$deckUuid/advisor", params: { deckUuid: deck }, search: { swipe: true } })
                }
                onBuildAnyway={() => navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: deck } })}
                onBack={() => navigate({ to: "/dating/matches" })}
                leftLine={pickLine(lines?.[session.name]?.reject, session.commander)}
            />
        </RequireAccount>
    );
}
