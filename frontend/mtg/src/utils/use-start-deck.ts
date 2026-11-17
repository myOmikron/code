import { useNavigate } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { DeckZone, Visibility } from "src/api/generated";

/** The Commander a deck is started with */
export type DeckCommander = {
    /** Card name, also the deck's name */
    name: string;
    /** The printing to put in the command zone */
    printing: string | null | undefined;
};

/**
 * Creates a Commander deck around a match and opens it.
 *
 * @returns the function that starts the deck
 */
export function useStartDeck(): (commander: DeckCommander) => Promise<void> {
    const navigate = useNavigate();
    return async (commander) => {
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
        await navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
    };
}
