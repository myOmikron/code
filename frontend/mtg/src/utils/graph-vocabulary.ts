/**
 * Naming the graph's own vocabulary for a reader.
 *
 * Resource slugs (`ritual_mana`, `plus_one_counter`) are the graph's internal
 * words and stay untranslated, like card names — German players say "Treasure"
 * too. Only the spelling is dressed up, and only here, so every surface that
 * shows a resource spells it the same way.
 */

/**
 * Slugs whose spelling is not simply their words title-cased.
 *
 * `plus_one_counter` is printed `+1/+1 counter` on every card that makes one,
 * and "Plus One Counter" is the kind of phrase only a database says. The rest
 * of the vocabulary needs no exception — `ritual_mana` really is read as
 * "Ritual Mana".
 */
const SPELLED: Record<string, string> = {
    plus_one_counter: "+1/+1 counter",
    minus_one_counter: "-1/-1 counter",
};

/**
 * Spells one resource slug the way a card would.
 *
 * @param resource the graph's own vocabulary, e.g. `ritual_mana`
 *
 * @returns the slug as words, e.g. `Ritual Mana`
 */
export function resourceLabel(resource: string): string {
    return (
        SPELLED[resource] ??
        resource
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
    );
}
