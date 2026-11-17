import { useNavigate } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { DeckZone, Visibility } from "src/api/generated";

/** The Commander a deck is started with */
export type DeckCommander = {
    /** Oracle id */
    commander: string;
    /** Card name, also the deck's name */
    name: string;
    /** The printing to put in the command zone */
    printing: string | null | undefined;
};

/** Plan the themes on a date first, or go straight to the cards */
export type StartMode = "date" | "build";

/**
 * Creates a Commander deck around a match, then opens a date or the deck.
 *
 * @returns the function that starts the deck
 */
export function useStartDeck(): (commander: DeckCommander, mode: StartMode) => Promise<void> {
    const navigate = useNavigate();
    return async (commander, mode) => {
        const created = await Api.decks.create({
            name: commander.name,
            format: "commander",
            visibility: Visibility.Public,
        });
        if (commander.printing) {
            await Api.decks.cards.add(created.uuid, {
                printing: commander.printing,
                quantity: 1,
                zone: DeckZone.Commander,
            });
        }
        if (mode === "date") {
            await Api.dating.date.start(commander.commander, created.uuid);
            await navigate({ to: "/dating/date/$deckUuid", params: { deckUuid: created.uuid } });
            return;
        }
        await navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
    };
}
