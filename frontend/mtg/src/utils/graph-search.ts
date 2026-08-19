import { GraphApi } from "src/api/graph";
import { resolveLookups } from "src/utils/printing-catalog";
import { Printing, resolvePrintings } from "src/utils/scryfall";

/**
 * The graph's own search filters — the questions Scryfall syntax cannot ask.
 *
 * Values come from the graph's closed vocabulary via {@link graphFacets}, so
 * no filter can be picked that has no cards behind it.
 */
export type GraphFilters = {
    /** Resources a hit must produce */
    produces: Array<string>;
    /** Resources a hit must want to consume */
    caresAbout: Array<string>;
    /** Roles a hit must fill */
    roles: Array<string>;
    /** Creature types a hit must have */
    creatureTypes: Array<string>;
    /** Themes a hit must fit */
    themes: Array<string>;
};

/** No filters at all — the state in which Scryfall does the searching */
export const EMPTY_GRAPH_FILTERS: GraphFilters = {
    produces: [],
    caresAbout: [],
    roles: [],
    creatureTypes: [],
    themes: [],
};

/**
 * Whether any graph filter is set, which is what flips the search engine
 *
 * @param filters the filters as held by the panel
 *
 * @returns true when the graph should answer instead of Scryfall
 */
export function hasGraphFilters(filters: GraphFilters): boolean {
    return (
        filters.produces.length > 0 ||
        filters.caresAbout.length > 0 ||
        filters.roles.length > 0 ||
        filters.creatureTypes.length > 0 ||
        filters.themes.length > 0
    );
}

/** How many hits the graph is asked for — no pagination, the ranking is the cut */
const LIMIT = 60;

/**
 * Asks the graph and answers with the same `Printing` objects a Scryfall
 * search yields, so the result grid, drag payloads and counters need no
 * second code path.
 *
 * The graph knows cards by oracle identity and usually carries a Scryfall
 * printing id; hits without one are placed by name through the service's own
 * catalog. A hit neither can place is dropped — it could not be filed anyway.
 *
 * @param filters the graph filters, at least one set
 * @param text free text held against name and rules text, empty for none
 * @param identity colour identity the hits must fit inside, absent for any
 * @param signal aborts the graph request
 *
 * @returns the hits as printings, in the graph's ranking
 */
export async function searchGraphPrintings(
    filters: GraphFilters,
    text: string,
    identity: Array<string> | undefined,
    signal: AbortSignal,
): Promise<Array<Printing>> {
    const { results } = await GraphApi.search(
        {
            produces: filters.produces,
            cares_about: filters.caresAbout,
            roles: filters.roles,
            creature_types: filters.creatureTypes,
            themes: filters.themes,
            text: text.trim() === "" ? undefined : text.trim(),
            identity,
            limit: LIMIT,
        },
        { signal },
    );

    // Most hits carry their Scryfall id; the stragglers are placed by name.
    const unplaced = results.filter((result) => result.scryfall_id == null);
    const placed = new Map<string, string>();
    if (unplaced.length > 0) {
        const lookups = await resolveLookups(unplaced.map((result) => ({ name: result.name })));
        unplaced.forEach((result, index) => {
            const found = lookups[index];
            if (found !== null) placed.set(result.oracle_id, found.id);
        });
    }

    const ids = results
        .map((result) => result.scryfall_id ?? placed.get(result.oracle_id))
        .filter((id): id is string => id !== undefined);
    const printings = await resolvePrintings(ids);
    return ids.map((id) => printings.get(id)).filter((printing): printing is Printing => printing !== undefined);
}

/** One pickable facet value, with how many cards stand behind it */
export type GraphFacet = {
    /** The value as the graph spells it */
    value: string;
    /** What the option says */
    label: string;
    /** How many cards match it */
    count: number;
};

/** Every filter category's pickable values */
export type GraphFacets = {
    /** The resource vocabulary, for produces and cares-about alike */
    resources: Array<GraphFacet>;
    /** The functional roles */
    roles: Array<GraphFacet>;
    /** The creature types the typal layer knows */
    creatureTypes: Array<GraphFacet>;
    /** The themes, already labelled by the server */
    themes: Array<GraphFacet>;
};

/** The facets once fetched — they only change on re-ingest */
let FACETS: GraphFacets | null = null;

/**
 * Turns a vocabulary slug into something readable
 *
 * @param value the slug, e.g. `plus_one_counter`
 *
 * @returns the slug with its underscores spaced
 */
function readable(value: string): string {
    return value.replace(/_/g, " ");
}

/**
 * Fetches the filter vocabulary, once per session.
 *
 * @returns every category's values, labelled and counted
 */
export async function graphFacets(): Promise<GraphFacets> {
    if (FACETS !== null) return FACETS;
    const raw = await GraphApi.facets();
    const category = (key: string): Array<GraphFacet> =>
        (raw[key] ?? []).flatMap((entry) => {
            const value = entry.value;
            if (typeof value !== "string") return [];
            const label = typeof entry.label === "string" ? entry.label : readable(value);
            const count = typeof entry.count === "number" ? entry.count : 0;
            return [{ value, label, count }];
        });
    FACETS = {
        resources: category("resources"),
        roles: category("roles"),
        creatureTypes: category("creature_types"),
        themes: category("themes"),
    };
    return FACETS;
}
