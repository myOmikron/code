import { useLoaderData } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Api } from "src/api/api";
import type {
    DeckDeviationResponse,
    DeckSourcingResponse,
    DeckValuesResponse,
    LineDeviationResponse,
} from "src/api/generated";
import { linesByEntry } from "src/utils/deck-deviation";
import type { DeckRights } from "src/utils/deck-rights";

/** What the card list knows about the deck's Physical deck, see {@link useDeckPhysical} */
export type DeckPhysical = {
    /** Whether the reader may see the Physical deck at all: owners and Editors */
    allowed: boolean;
    /** Whether the Physical switch is on, always `false` where it is not allowed */
    on: boolean;
    /** Turns the Physical switch on or off and remembers it, `undefined` where it is not allowed */
    setOn: ((on: boolean) => void) | undefined;
    /** Whether the deck has a Physical deck */
    exists: boolean;
    /** The Deviation as the deck loader read it, `null` where the reader may not see it */
    deviation: DeckDeviationResponse | null;
    /** The Deviation lines by Deck entry the cards are marked with, empty while the switch is off or there is no Physical deck */
    lines: Map<string, LineDeviationResponse>;
    /** List value, Physical value and Proxy replacement cost as the deck loader read them, `null` where not shown */
    values: DeckValuesResponse | null;
    /** Where the deck's cards lie and where the rest could come from, owner only, `null` until read */
    sourcing: DeckSourcingResponse | null;
    /** Reads the sourcing again and answers it, `null` for a reader who is not the owner */
    readSourcing: () => Promise<DeckSourcingResponse | null>;
};

/**
 * The Physical deck as the card list shows it: the switch, the marks and the sourcing.
 *
 * The sourcing is read for the owner whatever the switch says, because acting on
 * the Physical deck (the card menu, `X`) works with the switch off as well. It is
 * read again whenever the deck loader has run again, so after any write followed by
 * `router.invalidate()` it answers for the deck as it is now.
 *
 * @param deckUuid the deck
 * @param rights what the reader may do on the deck
 * @param on the remembered Physical switch
 * @param onChange remembers a new Physical switch
 *
 * @returns what the card list wires into its views, menu and dialog
 */
export function useDeckPhysical(
    deckUuid: string,
    rights: DeckRights,
    on: boolean,
    onChange: (on: boolean) => void,
): DeckPhysical {
    const { deviation, values } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [sourcing, setSourcing] = useState<DeckSourcingResponse | null>(null);
    const latest = useRef(0);
    const allowed = rights.edit;
    const shown = allowed && on;

    const readSourcing = useCallback(async () => {
        if (!rights.owner) return null;
        const ticket = ++latest.current;
        const read = await Api.decks.sourcing.read(deckUuid);
        if (ticket === latest.current) setSourcing(read);
        return read;
    }, [deckUuid, rights.owner]);

    useEffect(() => setSourcing(null), [deckUuid]);

    useEffect(() => {
        void readSourcing();
    }, [readSourcing, deviation]);

    const lines = useMemo(() => (shown ? linesByEntry(deviation) : new Map()), [shown, deviation]);

    return {
        allowed,
        on: shown,
        setOn: allowed ? onChange : undefined,
        exists: deviation?.has_physical_deck === true,
        deviation,
        values,
        lines,
        sourcing,
        readSourcing,
    };
}
