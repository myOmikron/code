import { Api } from "src/api/api";
import type { BlindCard, BlindDate } from "src/api/graph-generated";
import { GraphApi } from "src/api/graph";
import { DeckZone } from "src/api/generated";
import { fromResponse, toRequest } from "src/utils/advisor-settings";
import { defaultFoil } from "src/utils/default-finish";
import { resolveCardNames } from "src/utils/use-suggestion-cards";

/** How long to wait before asking again while every solver slot is taken, in ms */
const BUSY_WAIT = 4000;

/** How often to ask before giving up on a busy solver */
const BUSY_TRIES = 8;

/**
 * Whether a graph call was refused because every solver slot is taken.
 *
 * @param error what the call threw
 * @returns `true` for a 429
 */
function busy(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response: Response }).response.status === 429
    );
}

/**
 * Rolls a Blind Date, asking again quietly while the solver is busy.
 *
 * @param commander the Commander's oracle id
 * @param bracket the player's bracket, if known
 * @param wait how to wait between tries
 * @returns the rolled themes and the cards to add now
 */
export async function rollBlindDate(
    commander: string,
    bracket: number | null,
    wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<BlindDate> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await GraphApi.blindDate({ commander, bracket });
        } catch (error) {
            if (!busy(error) || attempt >= BUSY_TRIES) throw error;
            await wait(BUSY_WAIT);
        }
    }
}

/**
 * Files cards of a Blind Date's fill into the deck, one copy each.
 *
 * @param deck the deck
 * @param fill the cards
 * @returns how many cards went in
 */
async function addFill(deck: string, fill: BlindCard[]): Promise<number> {
    const printings = await resolveCardNames(fill.map((card) => card.name));
    const cards = fill.flatMap((card) => {
        const printing = printings.get(card.name);
        if (printing === undefined) return [];
        return [
            {
                printing: printing.id,
                quantity: card.quantity ?? 1,
                zone: DeckZone.Main,
                foil: defaultFoil(printing.finishes),
            },
        ];
    });
    if (cards.length > 0) await Api.decks.cards.import(deck, { cards, mode: "Fill" });
    return cards.reduce((sum, card) => sum + card.quantity, 0);
}

/**
 * Fills the slots a Blind Date left open for swiping with the rest of its fill.
 *
 * @param deck the deck
 * @param date the rolled date
 * @returns how many cards went in
 */
export function surpriseMe(deck: string, date: BlindDate): Promise<number> {
    return addFill(deck, date.add_later ?? []);
}

/**
 * Puts a Blind Date into the deck: its sure cards, its theme levels and the bracket.
 *
 * @param deck the deck
 * @param date the rolled date
 * @param bracket the player's bracket, if known
 * @returns how many cards went in
 */
export async function applyBlindDate(deck: string, date: BlindDate, bracket: number | null): Promise<number> {
    const added = await addFill(deck, date.add_now);

    const settings = fromResponse(await Api.decks.advisorSettings.get(deck));
    const levels = { ...settings.themes.levels };
    for (const theme of date.themes) levels[theme.theme] = theme.level;
    await Api.decks.advisorSettings.save(deck, toRequest({ ...settings, themes: { levels }, setup_done: true }));
    if (bracket !== null) await Api.decks.setBracket(deck, Math.min(5, Math.max(1, Math.round(bracket))));
    return added;
}
