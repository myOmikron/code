// Mounts the real tournament dialog, open on a fresh tournament, over a stubbed
// format catalog, so the two-step format picker and the derived pod size can be
// screenshotted and driven without logging into the app. Driven by a CDP script
// that clicks the Limited radio, picks a constructed format and scrolls the panel.
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import { Api } from "src/api/api";
import type { FormatRulesResponse } from "src/api/generated";
import { TournamentDialog } from "src/components/tournament-dialog";

/** One catalog row, the shape the dialog never reads left out */
function rules(slug: string, commander: boolean): FormatRulesResponse {
    return {
        slug,
        deck_size: { kind: commander ? "exactly" : "at_least", cards: commander ? 100 : 60 },
        max_copies: commander ? 1 : 4,
        commander: commander ? { kind: "required", min: 1, max: 2 } : { kind: "none" },
        sideboard: commander ? 0 : 15,
        color_identity_locked: commander,
        has_brackets: slug === "commander",
        role_bans: { commander: [], companion: [] },
    } as unknown as FormatRulesResponse;
}

const FORMATS: Array<FormatRulesResponse> = [
    rules("commander", true),
    rules("duel", true),
    rules("oathbreaker", true),
    rules("brawl", true),
    rules("standard", false),
    rules("pioneer", false),
    rules("modern", false),
    rules("legacy", false),
    rules("vintage", false),
    rules("pauper", false),
];

// The dialog fetches the account-only catalog on open; the probe has no account.
Api.decks.formats = async () => ({ formats: FORMATS });

// Same for the venue book behind the "Gespeicherte Orte" picker: two entries, so the picker
// renders at all — it hides itself when the book is empty.
Api.tournaments.venues.list = async () => ({
    venues: [
        { uuid: "d1", name: "Spielekiste Nord", address: "Hauptstr. 5, 12345 Berlin", instructions: null },
        { uuid: "d2", name: "Alte Brauerei", address: null, instructions: "Hinterhof, bitte klingeln" },
    ],
});

/** The dialog exactly as the tournaments list opens it for a new event */
function Probe() {
    return <TournamentDialog open={true} tournament={null} onClose={() => undefined} onSaved={() => undefined} />;
}

createRoot(document.getElementById("root")!).render(
    <Suspense>
        <Probe />
    </Suspense>,
);
