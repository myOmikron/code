import { TFunction } from "i18next";

/**
 * Naming the graph's own vocabulary for a reader.
 *
 * Resource slugs (`ritual_mana`, `plus_one_counter`) are the graph's internal
 * words and stay untranslated, like card names — German players say "Treasure"
 * too. Only the spelling is dressed up, and only here, so every surface that
 * shows a resource spells it the same way.
 *
 * Roles are the other half and behave differently: they are *jobs in a deck*,
 * a concept every player has words for in their own language, so they get
 * translations. They also need them most — `ramp_other` is a category marker,
 * not a name, and a badge reading "ramp other" was the vocabulary leaking.
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

/**
 * Names one role the way a deckbuilder would.
 *
 * @param t the advisor namespace's translator
 * @param role the graph's own vocabulary, e.g. `ramp_other`
 *
 * @returns the role's name, falling back to its slug as words for a role this
 *   app has no key for yet
 */
export function roleLabel(t: TFunction, role: string): string {
    const words = role.replace(/_/g, " ");
    return t(`label.role-${role.replace(/_/g, "-")}`, {
        defaultValue: words.charAt(0).toUpperCase() + words.slice(1),
    });
}
