import {
    Configuration,
    DefaultApi,
    DiagnosticsRequest,
    FillRequest,
    ReplaceRequest,
    SearchRequest,
    SuggestionsRequest,
    SwapsRequest,
    WarmRequest,
} from "src/api/graph-generated";

/**
 * The graph advisor (services/mtg-graph) — a second backend beside the
 * webserver, regenerated with `just gen-graph-api`.
 *
 * Served under `/api/graph`: traefik in the stacks, vite's own proxy when
 * bypassing it, both stripping the prefix. Same-origin either way, like `Api`.
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
    // Answers 200 only when the service can reach its Neo4j.
    health: () => graphApi.health(),
    // The analysis calls take a RequestInit so a debounced caller can hand in
    // an AbortSignal — a deck edited faster than the graph answers must cancel
    // the stale request instead of racing it.
    // Curve, role quotas, resource balance, themes — pure read of the deck.
    diagnostics: (req: DiagnosticsRequest, init?: RequestInit) =>
        graphApi.postDiagnostics({ DiagnosticsRequest: req }, init),
    // Ranked adds with provenance, grouped into rails.
    suggestions: (req: SuggestionsRequest, init?: RequestInit) =>
        graphApi.postSuggestions({ SuggestionsRequest: req }, init),
    // Adds, cuts and the pairings between them.
    swaps: (req: SwapsRequest, init?: RequestInit) => graphApi.postSwaps({ SwapsRequest: req }, init),
    // Alternatives to one named card, with shape deltas.
    replace: (req: ReplaceRequest) => graphApi.postReplace({ ReplaceRequest: req }),
    // CP-SAT completion of a partial deck; answers 429 when saturated.
    fill: (req: FillRequest) => graphApi.postFill({ FillRequest: req }),
    // Graph-backed card search — the filters Scryfall syntax cannot express.
    search: (req: SearchRequest, init?: RequestInit) => graphApi.postSearch({ SearchRequest: req }, init),
    // Every filter value that has cards behind it; cached server-side.
    facets: () => graphApi.getFacets(),
    // Fire-and-forget EDHREC prefetch for a commander. Never awaited into UI
    // state — the server answers "skipped" rather than erroring on purpose.
    warm: (req: WarmRequest) => graphApi.postWarm({ WarmRequest: req }),
};
