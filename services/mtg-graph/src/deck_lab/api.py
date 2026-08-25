"""HTTP surface. The Next.js API routes proxy to this.

Kept server-side because the Neo4j connection (and later the Anthropic key)
must never reach the browser.
"""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Annotated

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .cache import diagnostics_cache, facets_cache, suggestions_cache
from .composition import TargetOverride
from .config import settings
from .cuts import CutCandidate, Replacement, Swap
from .cuts import find_replacements as run_replacements
from .cuts import suggest_swaps as run_swaps
from .diagnostics import DeckEntry, Diagnostics, diagnose
from .ratelimit import RateLimiter
from .search import DEFAULT_SORT, SORTS, SearchQuery
from .search import facets as run_facets
from .search import search as run_search
from .solver import DEFAULT_TIME_LIMIT, FillResult, SolverBusy
from .solver import fill_deck as run_fill
from .spellbook import deck_combos as run_combos
from .suggestions import SuggestionReport, suggest
from .vocabulary import Bucket

# Every request field is bounded. Not because any of these limits is reached in
# normal use, but because an endpoint that will happily diagnose a million-card
# "deck" is open compute for anyone who asks. The caps are sized well above the
# largest honest payload — a deck plus its maybeboard — so no real client can
# feel them.
OracleId = Annotated[str, Field(max_length=64)]
# Card names reach ~141 characters in the un-sets; themes and resource names
# are short. 256 leaves room without inviting a payload.
Term = Annotated[str, Field(max_length=256)]

# A deck is 100 cards, but the builder posts pool and maybeboard payloads too.
MAX_CARDS = 512
# Five buckets exist. The cap is headroom, not a mirror of today's count — a
# cap that encodes the current size 422s the release that adds a bucket.
MAX_OVERRIDES = 16


class BucketRange(BaseModel):
    """A user's edit to one bucket's target range. Either bound may be omitted."""

    bucket: Bucket
    low: float | None = Field(None, ge=0, le=99)
    high: float | None = Field(None, ge=0, le=99)


def _as_overrides(ranges: list[BucketRange]) -> dict[Bucket, TargetOverride]:
    return {r.bucket: TargetOverride(low=r.low, high=r.high) for r in ranges}


# --- cache keys -----------------------------------------------------------
# The key is everything the answer depends on and nothing else. The frontend
# already canonicalises its own cache key, but the server cannot trust that:
# two clients may describe the same deck differently, and the point of the
# cache is that they share the entry.


def _canonical_cards(cards: list[DeckEntry]) -> tuple[tuple[str, int], ...]:
    """Merge duplicate oracle_ids and sort, so card order never splits a key."""
    merged: dict[str, int] = {}
    for entry in cards:
        merged[entry.oracle_id] = merged.get(entry.oracle_id, 0) + entry.qty
    return tuple(sorted(merged.items()))


def _canonical_overrides(overrides: list[BucketRange]) -> tuple:
    # Through `_as_overrides` so a repeated bucket resolves last-wins exactly
    # as the handler will see it — otherwise two keys map to one answer.
    resolved = _as_overrides(overrides)
    return tuple(sorted((str(bucket), o.low, o.high) for bucket, o in resolved.items()))


def _diagnostics_key(request: DiagnosticsRequest) -> tuple:
    return (
        _canonical_cards(request.cards),
        request.speed,
        _canonical_overrides(request.overrides),
        request.commander_oracle_id,
    )


def _suggestions_key(request: SuggestionsRequest) -> tuple:
    return (
        _canonical_cards(request.cards),
        # Names feed the combo channel, which treats the deck as a set.
        tuple(sorted(set(request.card_names))),
        request.commander_oracle_id,
        request.limit,
        request.max_price,
        request.speed,
        _canonical_overrides(request.overrides),
        request.focus,
        # Pin order is preserved rather than sorted: it may affect ranking,
        # and sorting a key for an ordering the scorer might honour would be
        # a bet on behaviour rather than a statement about it.
        tuple(request.pinned_themes),
        tuple(request.excluded_themes),
        tuple(sorted(set(request.excluded))),
    )


log = structlog.get_logger(__name__)


def _startup_warmup() -> None:
    """Pay the corpus scans at boot rather than inside the first request.

    The three IDF caches and the facet list are each a full-graph scan, and
    whoever arrived first used to pay for all of them.

    Every step is independently fail-soft. A cold cache is a slow first
    request; a raise here would be a dead worker — and `dev.sh` waits on
    /health, so a boot that blocks because Neo4j is still replaying its store
    would hang the whole dev stack.
    """
    from .diagnostics import resource_idf, resource_relative_idf, typal_density

    steps = (
        ("resource_idf", resource_idf),
        ("resource_relative_idf", resource_relative_idf),
        ("typal_density", typal_density),
        ("facets", _facets_cached),
    )

    for name, step in steps:
        start = time.perf_counter()
        try:
            step()
        except Exception as exc:  # noqa: BLE001 — a cold cache must not stop the boot
            log.warning("warmup.failed", step=name, error=str(exc))
        else:
            log.info(
                "warmup.step", step=name, duration_ms=round((time.perf_counter() - start) * 1000, 1)
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.warmup_on_start:
        # Synchronous on purpose: uvicorn serves nothing until startup
        # returns, which is what makes the first real request fast.
        _startup_warmup()

    yield

    from .graph import close_driver

    close_driver()


app = FastAPI(
    title="Deck Lab",
    version="0.1.0",
    lifespan=lifespan,
    # Route names become the OpenAPI operation ids — the same rule the Rust
    # services follow — so the generated TS client's methods read as written
    # (`postDiagnostics`, not `postDiagnosticsDiagnosticsPost`).
    generate_unique_id_function=lambda route: route.name,
)

# Every endpoint that can cost a graph traversal or an external fetch. GET
# /facets is cached, /search is a single ~20ms query, and /health must stay
# answerable for a load balancer — none of them are worth limiting.
_RATE_LIMITED_PATHS = frozenset(
    {"/suggestions", "/diagnostics", "/swaps", "/replace", "/fill", "/warm", "/combos"}
)
_RATE_LIMITER = RateLimiter(settings.rate_limit_rps, settings.rate_limit_burst)


def _client_key(request: Request) -> str:
    # First hop of X-Forwarded-For is the browser when this sits behind the
    # Next.js proxy; `ratelimit.py` documents why that is only as trustworthy
    # as the deployment.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Registered BEFORE `request_timing` on purpose. Starlette wraps handlers in
# reverse registration order, so the last-registered middleware is outermost —
# meaning `request_timing` still logs the requests this one rejects.
@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if (
        settings.rate_limit_enabled
        and request.method == "POST"
        and request.url.path in _RATE_LIMITED_PATHS
    ):
        wait = _RATE_LIMITER.check(_client_key(request))
        if wait > 0:
            return JSONResponse(
                status_code=429,
                content={"detail": "rate limited"},
                headers={"Retry-After": str(math.ceil(wait))},
            )

    return await call_next(request)


@app.middleware("http")
async def request_timing(request: Request, call_next):
    """Log every request's wall-clock.

    Until this existed, every latency figure in this repo was a hand-run
    measurement recorded in a commit body; performance questions should be
    answerable from logs instead.
    """
    start = time.perf_counter()
    response = await call_next(request)
    log.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round((time.perf_counter() - start) * 1000, 1),
    )
    return response


class DiagnosticsRequest(BaseModel):
    # The browser has already resolved names against Scryfall, so it sends
    # oracle_ids — no fuzzy name matching needed on this side.
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # Optional: the endpoint is also called on partial lists that have no
    # commander yet. Supplying one anchors the theme and typal profiles on it,
    # and the response says which it did via `commander_anchored`.
    commander_oracle_id: OracleId | None = None


@app.get("/health")
def health() -> dict[str, str]:
    from .graph import verify_connectivity

    try:
        verify_connectivity()
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 503
        raise HTTPException(status_code=503, detail=f"neo4j unreachable: {exc}") from exc

    return {"status": "ok"}


class WarmRequest(BaseModel):
    commander_oracle_id: OracleId


# EDHREC warm-ups run detached: the response must not wait on the fetch, and
# the in-flight set stops a click-happy user from queueing the same commander
# five times. A duplicate racing past the set is harmless — the ingest MERGEs.
_warm_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="warm")
_warming: set[str] = set()


def _schedule_warm(oracle_id: str) -> str:
    """Prefetch EDHREC for a commander, fire-and-forget. Returns a status string.

    Shared by `/warm` (called by the frontend the moment a commander is
    chosen) and every handler below that discovers mid-request that its
    commander is cold: rather than pay the EDHREC round trip inline, they call
    this once and compute with `allow_network=False`, so the pending answer
    heals itself once the warm lands (see the cache-clear comment inside
    `work`, below).
    """
    from .graph import fetch_deck, has_recommendations

    if has_recommendations(oracle_id):
        return "warm"

    rows = fetch_deck({oracle_id: 1})
    if not rows:
        return "unknown"
    name = rows[0]["name"]

    if oracle_id not in _warming:
        _warming.add(oracle_id)

        def work() -> None:
            try:
                from .edhrec import ingest_commander

                result = ingest_commander(name)
                if result.get("fetched"):
                    # Both caches condition on EDHREC — suggestions through the
                    # RECOMMENDS channel, diagnostics through its type targets
                    # — so reports computed a moment ago are now wrong. The
                    # frontend warms and then asks, which is exactly the race
                    # that would otherwise serve a stale answer for a full TTL.
                    # Cleared wholesale: keying entries by commander to evict
                    # selectively costs more bookkeeping than the recompute.
                    # This clear() also bumps each cache's generation, which is
                    # what actually closes the race: without it, a request that
                    # missed just before the clear could still finish its
                    # compute and `put()` a pre-ingest answer *after* the flush.
                    diagnostics_cache.clear()
                    suggestions_cache.clear()
            except Exception as exc:  # noqa: BLE001 — unofficial API, a warm-up must not raise
                log.warning("warm.edhrec_failed", commander=name, error=str(exc))
            finally:
                _warming.discard(oracle_id)

        _warm_pool.submit(work)

    return "warming"


@app.post("/warm")
def post_warm(request: WarmRequest) -> dict[str, str]:
    """Prefetch EDHREC for a commander, fire-and-forget.

    Called by the frontend the moment a commander is chosen, so the
    once-per-commander fetch happens while the deck is still being built
    instead of inside the first /suggestions request.
    """
    return {"status": _schedule_warm(request.commander_oracle_id)}


@app.post("/diagnostics", response_model=Diagnostics)
def post_diagnostics(request: DiagnosticsRequest) -> Diagnostics:
    key = _diagnostics_key(request)

    def compute() -> Diagnostics:
        return diagnose(
            request.cards,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            commander_oracle_id=request.commander_oracle_id,
        )

    # get_or_compute stores only on success — an exception propagates instead
    # of becoming the answer for the next five minutes — and folds in the
    # /warm generation guard (see its doc comment).
    return diagnostics_cache.get_or_compute(key, compute)


class SuggestionsRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    # Card names are needed only for the combo channel, which matches by name.
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_id: OracleId | None = None
    limit: int = Field(40, ge=1, le=120)
    max_price: float | None = Field(None, gt=0)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # "landfall" | "theme:landfall" | "bucket:ramp" | "resource:etb_trigger"
    focus: Term | None = None
    # Stored per-deck preferences, unlike `focus` which is a per-request ask.
    # Unknown ids are noted and ignored, never a 422 — themes can be renamed
    # between the release that stored a preference and the one serving it.
    # Bounded to keep a hostile payload from smuggling a list of thousands,
    # not to mirror the theme count — the layer grows, and a cap that encodes
    # today's size 422s the release that adds a theme.
    pinned_themes: list[Term] = Field(default_factory=list, max_length=64)
    excluded_themes: list[Term] = Field(default_factory=list, max_length=64)
    # Cards the user never wants suggested — the builder's ignore list.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)


def _cold_commander_allow_network(oracle_id: str | None) -> bool:
    """False (and a warm scheduled) when `oracle_id` is set and EDHREC-cold.

    Shared by every handler that can hit a cold commander mid-request:
    scheduling the warm here means the inline EDHREC fetch (up to 30s) never
    happens inside a request again — `/warm` still exists for the frontend to
    call ahead of time, this is the self-healing fallback for whichever
    handler gets there first.
    """
    if oracle_id is None:
        return True

    from .graph import has_recommendations

    if has_recommendations(oracle_id):
        return True

    _schedule_warm(oracle_id)
    return False


@app.post("/suggestions", response_model=SuggestionReport)
def post_suggestions(request: SuggestionsRequest) -> SuggestionReport:
    key = _suggestions_key(request)

    def compute() -> SuggestionReport:
        return suggest(
            [entry.oracle_id for entry in request.cards],
            request.card_names,
            quantities={entry.oracle_id: entry.qty for entry in request.cards},
            commander_oracle_id=request.commander_oracle_id,
            limit=request.limit,
            max_price=request.max_price,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            focus=request.focus,
            pinned_themes=request.pinned_themes,
            excluded_themes=request.excluded_themes,
            excluded=request.excluded,
            allow_network=_cold_commander_allow_network(request.commander_oracle_id),
        )

    # See the doc comment on get_or_compute: it folds in the /warm generation
    # guard that used to be hand-rolled here.
    return suggestions_cache.get_or_compute(key, compute)


class SearchRequest(BaseModel):
    """Graph-backed search. Every filter is an AND; values inside one are an OR."""

    produces: list[Term] = Field(default_factory=list, max_length=32)
    cares_about: list[Term] = Field(default_factory=list, max_length=32)
    roles: list[Term] = Field(default_factory=list, max_length=32)
    creature_types: list[Term] = Field(default_factory=list, max_length=32)
    makes_types: list[Term] = Field(default_factory=list, max_length=32)
    cares_about_types: list[Term] = Field(default_factory=list, max_length=32)
    themes: list[Term] = Field(default_factory=list, max_length=32)
    identity: list[Term] | None = Field(None, max_length=5)
    text: str | None = Field(None, max_length=200)
    max_price: float | None = Field(None, gt=0)
    min_playability: float = Field(0.0, ge=0.0, le=1.0)
    game_changers: bool | None = None
    # Not capped with the filter lists above: the builder excludes the whole
    # active board, so this list is deck-sized by design.
    exclude: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    sort: str = Field(DEFAULT_SORT, max_length=32)
    limit: int = Field(40, ge=1, le=200)


class SearchResult(BaseModel):
    oracle_id: str
    # The frontend caches resolved cards by Scryfall id. Returning it lets a
    # search hit that cache directly instead of asking Scryfall to resolve a
    # name it already holds — see `useGraphSearch.js`.
    scryfall_id: str | None = None
    name: str
    mana_cost: str = ""
    cmc: float = 0.0
    type_line: str = ""
    color_identity: list[str] = Field(default_factory=list)
    price_usd: float | None = None
    # Both currencies, because the budget filter and the price sorts read
    # EUR first: reporting only USD leaves a caller unable to see the number
    # their own `max_price` was measured against.
    price_eur: float | None = None
    edhrec_rank: int | None = None
    playability: float = 0.0
    game_changer: bool = False
    unreleased: bool = False


class SearchResponse(BaseModel):
    results: list[SearchResult]
    count: int


def _facets_cached() -> dict[str, list[dict]]:
    """Facets, computed once per TTL. Also the last step of startup warmup."""
    return facets_cache.get_or_compute("facets", run_facets)


@app.get("/facets")
def get_facets() -> dict[str, list[dict]]:
    """Filter values that actually have cards behind them."""
    return _facets_cached()


@app.post("/search", response_model=SearchResponse)
def post_search(request: SearchRequest) -> SearchResponse:
    if request.sort not in SORTS:
        raise HTTPException(
            status_code=422,
            detail=f"unknown sort {request.sort!r}; expected one of {sorted(SORTS)}",
        )

    query = SearchQuery(**request.model_dump())
    rows = run_search(query)
    return SearchResponse(results=[SearchResult(**row) for row in rows], count=len(rows))


class CombosRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    # Names cover the pre-ingest HTTP fallback, which matches by name.
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    limit: int = Field(20, ge=1, le=60)
    # Cards the user never wants suggested — the builder's ignore list. It
    # applies to `one_short` only: those are recommendations to add a card.
    # `complete` is a statement of fact about the deck and is never filtered.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)


class ComboEntry(BaseModel):
    # Every field is required, not defaulted: `post_combos` always fills all
    # of them, and a default here would publish them as optional in the
    # OpenAPI schema — which is what the generated client believes.
    id: str
    card_names: list[str]
    # Card names not in the deck — empty for a combo the deck completes.
    missing: list[str]
    # The oracle id behind `missing[0]`, so a client can file the card without
    # resolving the name again. Null when the deck completes the combo, or
    # when the piece has no id (the pre-ingest HTTP fallback).
    missing_oracle_id: str | None
    produces: list[str]
    popularity: int
    bracket: str


class CombosResponse(BaseModel):
    complete: list[ComboEntry]
    one_short: list[ComboEntry]
    # Said, not silent: an unreachable Spellbook is reported as a note rather
    # than as "this deck has no combos", which would be a lie.
    notes: list[str]


@app.post("/combos", response_model=CombosResponse)
def post_combos(request: CombosRequest) -> CombosResponse:
    """Combos the deck completes, and combos it is one card short of."""
    try:
        found = run_combos([entry.oracle_id for entry in request.cards], request.card_names)
    except Exception as exc:  # noqa: BLE001 — unofficial API, must not 500
        # Before `ingest-combos` has run, `deck_combos` falls back to an
        # outbound HTTP call. `suggest()` degrades with a note when that
        # fails; this endpoint has to do the same or the section reads as
        # "no combos" when the truth is "could not look them up".
        log.warning("combos.unavailable", error=str(exc))
        return CombosResponse(complete=[], one_short=[], notes=[f"Combo lookup unavailable: {exc}"])

    def missing_oracle_id(combo) -> str | None:
        """The oracle id of the one card the deck is short.

        `uses` and `card_names` are strictly parallel in both the graph and
        the HTTP fallback, which is what makes the lookup by name sound.
        """
        if len(combo.missing) != 1:
            return None
        for oracle_id, name in zip(combo.uses, combo.card_names, strict=False):
            if name == combo.missing[0]:
                return oracle_id
        return None

    def entry(combo) -> ComboEntry:
        return ComboEntry(
            id=combo.id,
            card_names=list(combo.card_names),
            missing=list(combo.missing),
            missing_oracle_id=missing_oracle_id(combo),
            produces=list(combo.produces),
            popularity=combo.popularity,
            bracket=combo.bracket,
        )

    excluded = set(request.excluded)
    one_short = sorted(
        (
            combo
            for combo in found["almost_included"]
            if len(combo.missing) == 1 and missing_oracle_id(combo) not in excluded
        ),
        key=lambda combo: -combo.popularity,
    )
    # Sorted, not raw row order: DECK_COMBOS has no ORDER BY, so slicing an
    # unsorted list to `limit` would show an arbitrary subset of the combos a
    # deck completes, and a different one per query plan.
    complete = sorted(found["included"], key=lambda combo: -combo.popularity)
    return CombosResponse(
        complete=[entry(combo) for combo in complete[: request.limit]],
        one_short=[entry(combo) for combo in one_short[: request.limit]],
        notes=[],
    )


class SwapsRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_id: OracleId | None = None
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor; this is purely defensive.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    focus: Term | None = None
    # Bounded to keep a hostile payload from smuggling a list of thousands,
    # not to mirror the theme count — the layer grows, and a cap that encodes
    # today's size 422s the release that adds a theme.
    pinned_themes: list[Term] = Field(default_factory=list, max_length=64)
    excluded_themes: list[Term] = Field(default_factory=list, max_length=64)
    # 24, not 12: the pairer can only offer swaps for adds inside this window,
    # and in an EDHREC-covered deck the first ~20 slots belong to synergy
    # hits — a window of 12 never reached the structural tier (fixing lands,
    # role gaps), so the cuts panel could not say "cut a Swamp for a fetch".
    limit: int = Field(24, ge=1, le=60)
    per_add: int = Field(3, ge=1, le=10)
    max_price: float | None = Field(None, gt=0)
    # Cards the user never wants suggested — the builder's ignore list.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    # Cards this tool just recommended, which it must not now recommend
    # removing. Adding a card changes the shape it is scored against, so a
    # card accepted into a bucket that was already full comes straight back as
    # a cut candidate — the advisor contradicting itself one click later.
    # Held by the caller because only the caller knows what it offered.
    #
    # Named `keep` rather than `protected`: the latter is a reserved word in
    # TypeScript, and the generated client escapes it to `_protected`, which
    # would put a leading underscore on a perfectly ordinary field at every
    # call site.
    keep: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)


class SwapsResponse(BaseModel):
    """Adds, cuts, and the pairings between them.

    Cuts are returned alongside the swaps rather than as the headline: the
    product commitment is "to add X, cut one of these", never a standalone
    ranking of someone's cards from worst to best.
    """

    suggestions: SuggestionReport
    cuts: list[CutCandidate]
    swaps: list[Swap]


@app.post("/swaps", response_model=SwapsResponse)
def post_swaps(request: SwapsRequest) -> SwapsResponse:
    result = run_swaps(
        [entry.oracle_id for entry in request.cards],
        request.card_names,
        quantities={entry.oracle_id: entry.qty for entry in request.cards},
        commander_oracle_id=request.commander_oracle_id,
        commander_oracle_ids=request.commander_oracle_ids,
        speed=request.speed,
        overrides=_as_overrides(request.overrides),
        focus=request.focus,
        pinned_themes=request.pinned_themes,
        excluded_themes=request.excluded_themes,
        excluded=request.excluded,
        protected=request.keep,
        limit=request.limit,
        per_add=request.per_add,
        max_price=request.max_price,
        allow_network=_cold_commander_allow_network(request.commander_oracle_id),
    )
    return SwapsResponse(suggestions=result["adds"], cuts=result["cuts"], swaps=result["swaps"])


class ReplaceRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    target_oracle_id: OracleId
    commander_oracle_id: OracleId | None = None
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    limit: int = Field(10, ge=1, le=40)
    max_price: float | None = Field(None, gt=0)
    # Cards the user never wants suggested — the builder's ignore list.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)


class ReplaceResponse(BaseModel):
    # Required, not defaulted: `post_replace` always fills all three, and a
    # default publishes them as optional to the generated client.
    # `target_name` stays nullable — a target the graph does not know has no
    # name — but is always present.
    target_name: str | None
    replacements: list[Replacement]
    notes: list[str]


@app.post("/replace", response_model=ReplaceResponse)
def post_replace(request: ReplaceRequest) -> ReplaceResponse:
    """Alternatives to one card the user has marked, each with its shape delta."""
    result = run_replacements(
        [entry.oracle_id for entry in request.cards],
        request.card_names,
        request.target_oracle_id,
        quantities={entry.oracle_id: entry.qty for entry in request.cards},
        commander_oracle_id=request.commander_oracle_id,
        speed=request.speed,
        overrides=_as_overrides(request.overrides),
        limit=request.limit,
        max_price=request.max_price,
        excluded=request.excluded,
        allow_network=_cold_commander_allow_network(request.commander_oracle_id),
    )
    target = result["target"]
    return ReplaceResponse(
        target_name=target["name"] if target else None,
        replacements=result["replacements"],
        notes=result["notes"],
    )


class FillRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_id: OracleId | None = None
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    focus: Term | None = None
    # Bounded to keep a hostile payload from smuggling a list of thousands,
    # not to mirror the theme count — the layer grows, and a cap that encodes
    # today's size 422s the release that adds a theme.
    pinned_themes: list[Term] = Field(default_factory=list, max_length=64)
    excluded_themes: list[Term] = Field(default_factory=list, max_length=64)
    deck_size: int = Field(99, ge=1, le=250)
    budget: float | None = Field(None, gt=0)
    # Cards the user has already turned down. Re-solving with these excluded is
    # how "not that one" works without discarding the rest of the fill.
    rejected: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)


@app.post("/fill", response_model=FillResult)
def post_fill(request: FillRequest) -> FillResult:
    """Fill an incomplete deck to `deck_size`, respecting the chosen ratios."""
    try:
        return run_fill(
            [entry.oracle_id for entry in request.cards],
            request.card_names,
            quantities={entry.oracle_id: entry.qty for entry in request.cards},
            commander_oracle_id=request.commander_oracle_id,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            focus=request.focus,
            pinned_themes=request.pinned_themes,
            excluded_themes=request.excluded_themes,
            deck_size=request.deck_size,
            budget=request.budget,
            rejected=request.rejected,
            # Deferred: resolved inside run_fill only once the concurrency
            # gate is held, so the 429 rejection path stays free of graph work.
            allow_network=lambda: _cold_commander_allow_network(request.commander_oracle_id),
        )
    except SolverBusy as exc:
        # Refused rather than queued: a solve runs to the time limit, so a
        # waiting caller pays a full one before their own starts. Retry-After
        # is that limit — the earliest a slot can plausibly free up.
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(int(DEFAULT_TIME_LIMIT))},
        ) from exc
