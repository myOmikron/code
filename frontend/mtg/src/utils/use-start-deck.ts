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
    /** Art crop url, for a Blind Date's reveal */
    art?: string | null;
    /** The second Commander of a pair */
    partner?: {
        /** Oracle id */
        commander: string;
        /** Card name */
        name: string;
        /** The printing to put in the command zone */
        printing?: string | null;
    } | null;
};

/** Plan the themes on a date, roll them on a Blind Date, or go straight to the cards */
export type StartMode = "date" | "blind" | "build";

/**
 * A deck's name for one Commander or a pair.
 *
 * @param name the Commander's name
 * @param partner the second Commander of a pair
 * @returns e.g. "Baeloth Barrityl, Entertainer & Raised by Giants"
 */
export function pairName(name: string, partner?: { name: string } | null): string {
    return partner ? `${name} & ${partner.name}` : name;
}

/**
 * Creates a Commander deck around a match, then opens a date or the deck.
 *
 * @returns the function that starts the deck
 */
export function useStartDeck(): (commander: DeckCommander, mode: StartMode) => Promise<void> {
    const navigate = useNavigate();
    return async (commander, mode) => {
        const created = await Api.decks.create({
            name: pairName(commander.name, commander.partner),
            format: "commander",
            visibility: Visibility.Public,
        });
        for (const printing of [commander.printing, commander.partner?.printing]) {
            if (!printing) continue;
            await Api.decks.cards.add(created.uuid, { printing, quantity: 1, zone: DeckZone.Commander });
        }
        if (mode === "date") {
            await Api.dating.date.start(commander.commander, created.uuid);
            await navigate({ to: "/dating/date/$deckUuid", params: { deckUuid: created.uuid } });
            return;
        }
        if (mode === "blind") {
            await navigate({
                to: "/dating/blind/$deckUuid",
                params: { deckUuid: created.uuid },
                search: {
                    commander: commander.commander,
                    partner: commander.partner?.commander,
                    name: pairName(commander.name, commander.partner),
                    art: commander.art ?? undefined,
                },
            });
            return;
        }
        await navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
    };
}
