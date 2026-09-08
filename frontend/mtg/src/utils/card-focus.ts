/**
 * The filter one remark puts on the deck view.
 *
 * Its own file because three places construct it and two consume it: the
 * legality band's format remarks, the bracket menu's rules, and the house
 * rules all send one, and the deck view and its chip read it. Left on the
 * header bar it made the bracket menu import from its own importer.
 */

/**
 * The cards one remark is about.
 *
 * Either handle works and a remark sends whichever it holds — the slot map is
 * keyed by uuid, the bracket rules and house rules carry names — with the
 * other left empty. Both required rather than optional: every construction
 * site sets exactly one, and a consumer should match against two lists, not
 * four presence combinations.
 */
export type CardFocus = {
    /** What the reader clicked, said back to them on the filter chip */
    label: string;
    /** The cards, by name */
    names: Array<string>;
    /** The slots, by uuid */
    uuids: Array<string>;
};
