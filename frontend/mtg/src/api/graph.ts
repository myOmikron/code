import {
    CombosRequest,
    Configuration,
    DefaultApi,
    DiagnosticsRequest,
    FillRequest,
    PoolQueryRequest,
    ReplaceRequest,
    SearchRequest,
    SwapsRequest,
    WarmRequest,
} from "src/api/graph-generated";

/**
 * The graph advisor (services/mtg-graph) — a second backend beside the
 * webserver, regenerated with `just gen-graph-api`.
 *
 * Served under `/api/graph`, which the webserver proxies to the advisor
 * behind its auth layer — the advisor itself is not publicly routable.
 * Same-origin like `Api`, so the session cookie rides along.
 *
 * Nothing here goes through `handleError`: the advisor is an enhancement on
 * top of a deck, and an unreachable graph must read as "advisor unavailable"
 * where the panel would be — not replace the page with the error screen.
 * Callers render the failure themselves.
 */
const configuration = new Configuration({
    basePath: window.location.origin + "/api/graph",
});
const graphApi = new DefaultApi(configuration);

export const GraphApi = {
    // The analysis calls take a RequestInit so a debounced caller can hand in
    // an AbortSignal — a deck edited faster than the graph answers must cancel
    // the stale request instead of racing it.
    // Curve, role quotas, resource balance, themes — pure read of the deck.
    diagnostics: (req: DiagnosticsRequest, init?: RequestInit) =>
        graphApi.postDiagnostics({ DiagnosticsRequest: req }, init),
    // Adds, cuts and the pairings between them.
    swaps: (req: SwapsRequest, init?: RequestInit) => graphApi.postSwaps({ SwapsRequest: req }, init),
    // Alternatives to one named card, with shape deltas.
    replace: (req: ReplaceRequest, init?: RequestInit) => graphApi.postReplace({ ReplaceRequest: req }, init),
    // CP-SAT completion of a partial deck; answers 429 when saturated. Worth
    // aborting like the rest: a solve the caller walked away from still holds
    // one of the service's few solver slots until it finishes.
    fill: (req: FillRequest, init?: RequestInit) => graphApi.postFill({ FillRequest: req }, init),
    // Graph-backed card search — the filters Scryfall syntax cannot express.
    search: (req: SearchRequest, init?: RequestInit) => graphApi.postSearch({ SearchRequest: req }, init),
    // Combos the deck completes, and combos it is one card short of.
    combos: (req: CombosRequest, init?: RequestInit) => graphApi.postCombos({ CombosRequest: req }, init),
    // Every filter value that has cards behind it; cached server-side.
    facets: () => graphApi.getFacets(),
    // Whether a pool restriction compiles, and where it stops if it does not.
    // The service owns the grammar, so the answer to "is this a query yet" has
    // to come from it — checked while typing, without posting a deck.
    poolQuery: (req: PoolQueryRequest, init?: RequestInit) => graphApi.postPoolQuery({ PoolQueryRequest: req }, init),
    // Asks the server to prefetch a commander's EDHREC page, and reports
    // whether that has already happened. Fired and forgotten when the advisor
    // opens; polled for its `status` once an answer says a warm is still
    // running (see `useEdhrecWarm`), which is the cheap way to learn that the
    // expensive question is worth asking again.
    warm: (req: WarmRequest, init?: RequestInit) => graphApi.postWarm({ WarmRequest: req }, init),
};
