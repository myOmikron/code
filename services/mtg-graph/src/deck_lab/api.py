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
from pydantic import AfterValidator, BaseModel, Field

from .cache import diagnostics_cache, facets_cache, suggestions_cache
from .composition import TargetOverride
from .config import settings
from .cuts import CutCandidate, Replacement, Swap
from .cuts import find_replacements as run_replacements
from .cuts import suggest_swaps as run_swaps
from .diagnostics import DeckEntry, Diagnostics, diagnose
from .interaction import build_interaction_grid
from .lines import LINE_NEAR_MISS_LIMIT, Line
from .lines import deck_lines as run_lines
from .lines import redundancy as run_redundancy
from .lines import tutor_map as run_tutor_map
from .meta import (
    MEASURED_INTERACTION_PROFILES,
    LineWinThroughGrade,
    ProtectionWay,
    grade_deck,
    grade_line_win_through,
)
from .meta import resolve_expected_meta as run_resolve_expected_meta
from .poolquery import MAX_QUERY_LENGTH, PoolFilter, PoolQueryError, parse_pool_query
from .ratelimit import RateLimiter
from .search import DEFAULT_SORT, SORTS, SearchQuery
from .search import facets as run_facets
from .search import search as run_search
from .solver import DEFAULT_TIME_LIMIT, FillResult, SolverBusy
from .solver import fill_deck as run_fill
from .spellbook import deck_combos as run_combos
from .suggestions import SuggestionReport, suggest
from .type_targets import PRIMARY_TYPES
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
# A Scryfall-style pool restriction — see `poolquery`. Bounded there too; the
# Field cap turns an oversized payload into a 422 before the parser runs.
PoolQuery = Annotated[str, Field(max_length=MAX_QUERY_LENGTH)]
# Five buckets exist. The cap is headroom, not a mirror of today's count — a
# cap that encodes the current size 422s the release that adds a bucket.
MAX_OVERRIDES = 16
# Seven curve buckets exist (0..6+), and the same headroom argument applies.
MAX_CURVE_POINTS = 16
# Eight primary types exist. Headroom for the same reason as the two above.
MAX_TYPE_OVERRIDES = 16


def _known_type(name: str) -> str:
    """Refuse a type the report never showed, rather than dropping it quietly.

    `composition.apply_type_overrides` ignores an unknown key, which is the
    right behaviour deep in the scorer and the wrong answer at the boundary:
    a client that misspells a type would silently get the archetype's
    corridor back and no way to tell.
    """
    if name not in PRIMARY_TYPES:
        raise ValueError(f"unknown primary type: {name}")
    return name


# One of the eight names the type axis reports, and nothing else.
PrimaryTypeName = Annotated[str, Field(max_length=32), AfterValidator(_known_type)]


class BucketRange(BaseModel):
    """A user's edit to one bucket's target range. Either bound may be omitted."""

    bucket: Bucket
    low: float | None = Field(None, ge=0, le=99)
    high: float | None = Field(None, ge=0, le=99)


class TypeRange(BaseModel):
    """A user's edit to one primary type's target range.

    The type axis is empirical — each corridor is one commander page's
    measured distribution — but a measurement is still an offer: a deck that
    runs thirty-four lands on purpose says so here, and every quota, cut and
    fill is then graded against that number instead. Either bound may be
    omitted, exactly as for a bucket.
    """

    type: PrimaryTypeName
    low: float | None = Field(None, ge=0, le=99)
    high: float | None = Field(None, ge=0, le=99)


class CurvePoint(BaseModel):
    """One mana value's share of the deck's target curve.

    A *share*, not a count, because a target is `share x spell count` and the
    two sides of that product belong to different people: the builder owns the
    shape, the deck owns how many spells there are. Shares that do not sum to
    1 are renormalised rather than refused — a shape is a shape whatever
    arithmetic the client did — see `composition.apply_curve`.
    """

    mv: int = Field(ge=0, le=6)
    share: float = Field(ge=0, le=1)


def _as_overrides(ranges: list[BucketRange]) -> dict[Bucket, TargetOverride]:
    return {r.bucket: TargetOverride(low=r.low, high=r.high) for r in ranges}


def _as_type_overrides(ranges: list[TypeRange]) -> dict[str, TargetOverride]:
    return {r.type: TargetOverride(low=r.low, high=r.high) for r in ranges}


def _as_curve(points: list[CurvePoint]) -> dict[int, float] | None:
    """The curve shape a request asked for, or None to keep the archetype's."""
    return {point.mv: point.share for point in points} if points else None


def _pool(max_price: float | None, pool_query: str | None) -> PoolFilter:
    """The pool restriction for a request, or a 422 naming the fault.

    A query that will not compile is refused rather than dropped: silently
    ignoring it would answer a restricted question with the unrestricted
    pool, which reads as a filter that does nothing.
    """
    try:
        return parse_pool_query(pool_query or "", max_price=max_price)
    except PoolQueryError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "position": exc.position},
        ) from exc


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


def _canonical_curve(points: list[CurvePoint]) -> tuple:
    # Through `_as_curve` so a repeated mana value resolves last-wins exactly
    # as the handler will see it — otherwise two keys map to one answer.
    return tuple(sorted((_as_curve(points) or {}).items()))


def _canonical_type_overrides(overrides: list[TypeRange]) -> tuple:
    # Through `_as_type_overrides` for the same last-wins reason as the
    # bucket overrides below.
    resolved = _as_type_overrides(overrides)
    return tuple(sorted((name, o.low, o.high) for name, o in resolved.items()))


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
        _canonical_curve(request.curve),
        _canonical_type_overrides(request.type_overrides),
        request.commander_oracle_id,
        # Sorted — every consumer is order-independent; the anchor rides the
        # singular entry above.
        tuple(sorted(set(request.commander_oracle_ids))),
        # Scales every quota, so a 60-card deck must not share the 99's entry.
        request.deck_size,
        # I3's local-meta override — pooling is order-independent (a set of
        # decks to match against), so sorted-and-deduped is the right key,
        # same reasoning as `commander_oracle_ids` right above it.
        tuple(sorted(set(request.expected_meta))),
    )


def _suggestions_key(request: SuggestionsRequest) -> tuple:
    return (
        _canonical_cards(request.cards),
        # Names feed the combo channel, which treats the deck as a set.
        tuple(sorted(set(request.card_names))),
        request.commander_oracle_id,
        # Sorted — every consumer is order-independent; the anchor rides the
        # singular entry above.
        tuple(sorted(set(request.commander_oracle_ids))),
        request.limit,
        request.max_price,
        # Raw text rather than the compiled predicate: parsing is
        # deterministic, and two spellings of one restriction are two
        # requests as far as the reader who typed them is concerned.
        request.pool_query,
        request.speed,
        _canonical_overrides(request.overrides),
        _canonical_curve(request.curve),
        _canonical_type_overrides(request.type_overrides),
        request.focus,
        # Pin order is preserved rather than sorted: it may affect ranking,
        # and sorting a key for an ordering the scorer might honour would be
        # a bet on behaviour rather than a statement about it.
        tuple(request.pinned_themes),
        tuple(request.excluded_themes),
        tuple(sorted(set(request.excluded))),
        # `None` (derive from the commander) and `()` (deliberate colourless)
        # are different requests and must not share a cache entry.
        None if request.identity is None else tuple(request.identity),
        # Scales every quota, so a 60-card deck must not share the 99's entry.
        request.deck_size,
    )


log = structlog.get_logger(__name__)


def _startup_warmup() -> None:
    """Pay the corpus scans at boot rather than inside the first request.

    The four corpus caches and the facet list are each a full-graph scan, and
    whoever arrived first used to pay for all of them.

    Every step is independently fail-soft. A cold cache is a slow first
    request; a raise here would be a dead worker — and `dev.sh` waits on
    /health, so a boot that blocks because Neo4j is still replaying its store
    would hang the whole dev stack.
    """
    from .diagnostics import (
        resource_idf,
        resource_relative_idf,
        role_weight_ceiling,
        typal_density,
    )

    steps = (
        ("resource_idf", resource_idf),
        ("resource_relative_idf", resource_relative_idf),
        ("typal_density", typal_density),
        ("role_weight_ceiling", role_weight_ceiling),
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
    {"/suggestions", "/diagnostics", "/swaps", "/replace", "/fill", "/warm", "/combos", "/lines"}
)
_RATE_LIMITER = RateLimiter(settings.rate_limit_rps, settings.rate_limit_burst)


def _route_path(request: Request) -> str:
    """The route's own path, with the deployment's root_path taken off.

    uvicorn serves this app with `--root-path /api/graph`, and Starlette
    reports that prefix as part of `request.url.path`. Matching the raw path
    against the bare paths above therefore never matched anywhere the app is
    actually deployed — only under a bare `TestClient`, which is why the
    tests did not notice.
    """
    root = request.scope.get("root_path", "")
    path = request.url.path
    if root and path.startswith(root):
        return path[len(root) :] or "/"
    return path


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
        and _route_path(request) in _RATE_LIMITED_PATHS
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
    # The builder's own target curve, replacing the archetype's interpolated
    # shape. Empty keeps it.
    curve: list[CurvePoint] = Field(default_factory=list, max_length=MAX_CURVE_POINTS)
    # The builder's own type corridors, replacing the archetype's measured
    # ones. Empty keeps them.
    type_overrides: list[TypeRange] = Field(default_factory=list, max_length=MAX_TYPE_OVERRIDES)
    # Optional: the endpoint is also called on partial lists that have no
    # commander yet. Supplying one anchors the theme and typal profiles on it,
    # and the response says which it did via `commander_anchored`.
    commander_oracle_id: OracleId | None = None
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor. Accepted and part of
    # the cache key now; `diagnose()` itself anchors on the list in a later
    # change.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    # The deck's target card count outside the command zone — Rule 0 decks
    # may aim at 60 or 150. Every quota is tuned for 99 and scaled by
    # deck_size/99; the response's `deck_size` stays the observed count.
    deck_size: int = Field(99, ge=1, le=250)
    # Task I3 (cEDH Pro round): the local-meta override. Commander names —
    # `TournamentDeck.commander_name`'s raw pairing strings ("Kraum,
    # Ludevic's Opus / Tymna the Weaver"), never an oracle id (partner pairs
    # collapse under the singular id, see `meta.py`'s module docstring) —
    # the caller expects to face. When present, `meta_grade` and
    # `interaction_profile` are computed against just those commanders'
    # tournament decks instead of the whole scene, with an honest floor
    # (`meta.LOCAL_META_MIN_DECKS`) that falls back to the scene-pooled
    # numbers for a pool too thin to trust — `meta_profile_source` says
    # which happened. Request-scoped only; nothing here is persisted.
    expected_meta: list[Term] = Field(default_factory=list, max_length=16)


@app.get("/health")
def health() -> dict[str, str]:
    from .graph import bootstrap_state

    try:
        state = bootstrap_state()
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 503
        raise HTTPException(status_code=503, detail=f"neo4j unreachable: {exc}") from exc

    missing = [layer for layer, count in state.items() if count <= 0]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"graph corpus incomplete: {', '.join(missing)}",
        )

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


def _apply_expected_meta(diag: Diagnostics, expected_meta: list[str]) -> Diagnostics:
    """I3's local-meta override, layered onto an already-built `Diagnostics`.

    Keeps `diagnose()`/`diagnostics.py` untouched beyond their two additive
    fields (this task's ownership note): reuses the `interaction_grid` the
    response already carries rather than fetching a second one, and only
    ever replaces `meta_grade`/`interaction_profile`/`meta_profile_source` —
    every other field is exactly what `diagnose()` computed.
    """
    if expected_meta:
        context = run_resolve_expected_meta("cedh", expected_meta)
        meta_grade = (
            grade_deck("cedh", diag.interaction_grid, table=context.threats)
            if diag.interaction_grid is not None
            else None
        )
        return diag.model_copy(
            update={
                "meta_grade": meta_grade,
                "interaction_profile": context.profile,
                "meta_profile_source": context.source,
            }
        )
    # No override requested: `meta_grade` is already the scene-pooled grade
    # `diagnose()` computed; only the profile (Task I1, absent from that
    # function on purpose) needs adding.
    return diag.model_copy(
        update={
            "interaction_profile": MEASURED_INTERACTION_PROFILES.get("cedh"),
            "meta_profile_source": "scene",
        }
    )


@app.post("/diagnostics", response_model=Diagnostics)
def post_diagnostics(request: DiagnosticsRequest) -> Diagnostics:
    key = _diagnostics_key(request)

    def compute() -> Diagnostics:
        diag = diagnose(
            request.cards,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            curve=_as_curve(request.curve),
            type_overrides=_as_type_overrides(request.type_overrides),
            commander_oracle_id=request.commander_oracle_id,
            commander_oracle_ids=request.commander_oracle_ids,
            deck_size=request.deck_size,
        )
        return _apply_expected_meta(diag, request.expected_meta)

    # get_or_compute stores only on success — an exception propagates instead
    # of becoming the answer for the next five minutes — and folds in the
    # /warm generation guard (see its doc comment).
    return diagnostics_cache.get_or_compute(key, compute)


class SuggestionsRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    # Card names are needed only for the combo channel, which matches by name.
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_id: OracleId | None = None
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor; the extras widen the
    # identity union and the exclusion lists, never the anchor.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    limit: int = Field(40, ge=1, le=120)
    max_price: float | None = Field(None, gt=0)
    # Restricts the pool retrieval draws from: a Scryfall-style query such as
    # `eur<5 -t:artifact`, compiled to a Cypher predicate (see `poolquery`).
    # One that will not compile is a 422, never a silently unrestricted answer.
    pool_query: PoolQuery | None = None
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # The builder's own target curve, replacing the archetype's interpolated
    # shape. Empty keeps it.
    curve: list[CurvePoint] = Field(default_factory=list, max_length=MAX_CURVE_POINTS)
    # The builder's own type corridors, replacing the archetype's measured
    # ones. Empty keeps them.
    type_overrides: list[TypeRange] = Field(default_factory=list, max_length=MAX_TYPE_OVERRIDES)
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
    # The deck's allowed colours as WUBRG letters — Rule 0 house rules. `None`
    # derives from the commander(s); `[]` is a deliberate "colourless only"
    # (the retrieval filter's subset semantics make the empty list mean exactly
    # that). Permissive like `SearchRequest.identity`: junk letters can only
    # narrow, never widen.
    identity: list[Term] | None = Field(None, max_length=5)
    # The deck's target card count outside the command zone — Rule 0 decks
    # may aim at 60 or 150. Every quota is tuned for 99 and scaled by
    # deck_size/99.
    deck_size: int = Field(99, ge=1, le=250)


def _cold_commander_allow_network(oracle_id: str | None, extras: list[str] | None = None) -> bool:
    """False (and warms scheduled) when any effective commander is EDHREC-cold.

    Shared by every handler that can hit a cold commander mid-request:
    scheduling the warm here means the inline EDHREC fetch (up to 30s) never
    happens inside a request again — `/warm` still exists for the frontend to
    call ahead of time, this is the self-healing fallback for whichever
    handler gets there first.

    Every seat is checked individually — a cold extra schedules its own warm,
    and one cold seat is enough to turn the inline fetch off for the whole
    request (a Rule 0 deck may field up to eight, and N×30s inline is exactly
    what this probe exists to prevent).
    """
    from .graph import has_recommendations
    from .suggestions import effective_commanders

    allow = True
    for commander in effective_commanders(oracle_id, extras):
        if has_recommendations(commander):
            continue
        _schedule_warm(commander)
        allow = False
    return allow


@app.post("/suggestions", response_model=SuggestionReport)
def post_suggestions(request: SuggestionsRequest) -> SuggestionReport:
    # Parsed before the cache lookup, so an invalid query is a 422 whether or
    # not some earlier request happens to have warmed this key.
    pool_filter = _pool(request.max_price, request.pool_query)
    key = _suggestions_key(request)

    def compute() -> SuggestionReport:
        return suggest(
            [entry.oracle_id for entry in request.cards],
            request.card_names,
            quantities={entry.oracle_id: entry.qty for entry in request.cards},
            commander_oracle_id=request.commander_oracle_id,
            commander_oracle_ids=request.commander_oracle_ids,
            limit=request.limit,
            pool_filter=pool_filter,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            curve=_as_curve(request.curve),
            type_overrides=_as_type_overrides(request.type_overrides),
            focus=request.focus,
            pinned_themes=request.pinned_themes,
            excluded_themes=request.excluded_themes,
            excluded=request.excluded,
            identity=request.identity,
            deck_size=request.deck_size,
            allow_network=_cold_commander_allow_network(
                request.commander_oracle_id, request.commander_oracle_ids
            ),
        )

    # See the doc comment on get_or_compute: it folds in the /warm generation
    # guard that used to be hand-rolled here.
    return suggestions_cache.get_or_compute(key, compute)


class PoolQueryRequest(BaseModel):
    query: PoolQuery = ""


class PoolQueryResponse(BaseModel):
    """Whether a pool query compiles, and where it stops if it does not.

    Required rather than defaulted: the handler always fills all three, and a
    default would publish them as optional to the generated client.
    """

    ok: bool
    error: str | None
    position: int | None


@app.post("/pool-query", response_model=PoolQueryResponse)
def post_pool_query(request: PoolQueryRequest) -> PoolQueryResponse:
    """Check a pool restriction without running one.

    Its own endpoint so the builder can tell someone mid-sentence that
    `year>=202` is not a year yet, without posting a deck or spending a
    suggestion. Parse-only — it never touches the graph.
    """
    try:
        parse_pool_query(request.query)
    except PoolQueryError as exc:
        return PoolQueryResponse(ok=False, error=str(exc), position=exc.position)
    return PoolQueryResponse(ok=True, error=None, position=None)


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
    # The Scryfall-shaped half of a combined question — `eur<5 -t:artifact`
    # ANDed with the graph filters, same grammar and same 422 contract as the
    # advisor's pool restriction (see `poolquery`).
    pool_query: PoolQuery | None = None
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

    # Compiled here rather than in `SearchQuery`: the 422 pointing at the
    # offending spot belongs to the HTTP layer. Search applies its own
    # `max_price` leniently (unpriced cards pass), so the pool carries none.
    query = SearchQuery(
        **request.model_dump(exclude={"pool_query"}),
        pool=_pool(None, request.pool_query),
    )
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
    # The command zone, so the colours a suggested piece must keep inside can
    # be derived when the deck claims none of its own — the same contract as
    # `SuggestionsRequest`, minus its analysis anchor: only the union matters
    # here. `commander_oracle_id` has no meaning for a combo lookup.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    # The deck's allowed colours as WUBRG letters — Rule 0 house rules. `None`
    # derives from the commanders above; `[]` is a deliberate "colourless
    # only". Taken verbatim, exactly as the retrieval channels' hard filter
    # takes `SuggestionsRequest.identity`, so the two endpoints agree on what
    # a letter means: junk can only narrow, never widen.
    identity: list[Term] | None = Field(None, max_length=5)


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


def _combo_identity(request: CombosRequest) -> list[str] | None:
    """The colours a suggested combo piece has to keep inside, or None.

    An explicit `identity` is the deck's Rule 0 claim and wins outright, the
    empty list included — that is a deck playing colourless only. Otherwise
    the union of the command zone's own identities, in WUBRG order, exactly
    as `suggest()` derives it.

    `None` means "nothing is known about this deck's colours, so filter
    nothing" — the answer this endpoint gave before it could filter at all.
    A command zone the graph cannot place lands there too: an empty union
    read as a real answer would hide every coloured combo behind a lookup
    failure.
    """
    if request.identity is not None:
        return list(request.identity)
    if not request.commander_oracle_ids:
        return None

    from .graph import fetch_deck

    # Extras the graph does not know are simply absent, as in `suggest()`.
    rows = fetch_deck(dict.fromkeys(request.commander_oracle_ids, 1))
    if not rows:
        return None
    union = {color for row in rows for color in row["color_identity"]}
    return [color for color in "WUBRG" if color in union]


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

    identity = _combo_identity(request)

    # The HTTP-fallback combos carry no identities (Spellbook's card objects
    # have none), and waving those pieces through was this filter's one
    # documented hole. The cards themselves are usually in the graph even
    # before `ingest-combos` has run, so the unknowns are resolved against it
    # in one indexed lookup — only a name the graph does not hold either
    # stays unknown, and only that is still kept.
    resolved_identities: dict[str, list[str]] = {}
    if identity is not None:
        from .graph import identities_by_name

        unknown = {
            combo.missing[0]
            for combo in found["almost_included"]
            if len(combo.missing) == 1 and combo.identity_of(combo.missing[0]) is None
        }
        resolved_identities = identities_by_name(unknown)

    def within_identity(combo) -> bool:
        """Whether the missing piece is a card this deck may actually play.

        Silent, like the retrieval channels' hard filter: colour identity is
        not a preference the user might want to see argued against, and a
        combo the deck cannot legally assemble is not a recommendation.
        """
        if identity is None:
            return True
        name = combo.missing[0]
        colors = combo.identity_of(name)
        if colors is None:
            colors = resolved_identities.get(name)
        return colors is None or all(color in identity for color in colors)

    excluded = set(request.excluded)
    one_short = sorted(
        (
            combo
            for combo in found["almost_included"]
            if len(combo.missing) == 1
            and missing_oracle_id(combo) not in excluded
            and within_identity(combo)
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


class LinesRequest(BaseModel):
    """Mirrors `CombosRequest` field for field — the line engine reads the
    same deck-identity shape /combos does, just answers with more of it."""

    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    limit: int = Field(20, ge=1, le=60)
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    identity: list[Term] | None = Field(None, max_length=5)
    # Task I2 (cEDH Pro round): gates the per-line win-through grade the same
    # way every other endpoint gates its cEDH-only extras — `build_interaction_grid`
    # returns `None` below bracket 5, so a casual-speed request simply gets no
    # `win_through` on any line, at the cost of one extra (cheap) card-role/
    # resource fetch this endpoint did not previously pay.
    speed: float = Field(0.5, ge=0.0, le=1.0)
    # Task I3: the local-meta override — see `DiagnosticsRequest.expected_meta`
    # for the full contract (commander_name pairing strings, request-scoped,
    # floored fallback). Shifts `win_through`'s expected-interaction number.
    expected_meta: list[Term] = Field(default_factory=list, max_length=16)


class LinePieceEntry(BaseModel):
    name: str
    oracle_id: str
    # A list, not the draft contract's single `zone`: a real Spellbook piece
    # can name more than one acceptable starting zone (a card the sequence
    # is happy to find in hand *or* graveyard), and collapsing that to one
    # value would just be a lossy pick among several correct answers.
    zones: list[str]
    must_be_commander: bool
    in_deck: bool


class LinePrerequisites(BaseModel):
    easy: str
    notable: str


class ProtectionWayEntry(BaseModel):
    kind: str  # "stack" | "proactive_protection"
    column: str  # "free" | "cheap" | "held_up"
    count: int
    cards: list[str]


class LineWinThroughEntry(BaseModel):
    """Task I2's per-line win-through grade — `protected (N ways) vs an
    expected M pieces of stack interaction at the table`, both numbers kept
    apart on the wire exactly as `meta.LineWinThroughGrade` keeps them apart
    in Python (never collapsed into one score)."""

    line_turn: int
    mana_left_after_line: float
    ways: list[ProtectionWayEntry]
    # Real protection the deck holds that v1's coarse timing rule excludes
    # from `protected_count` — visible, not silently dropped.
    excluded: list[ProtectionWayEntry]
    protected_count: int
    expected_stack: float
    profile_source: str


class LineEntry(BaseModel):
    # Every field required, not defaulted — same reasoning as `ComboEntry`:
    # `_line_entry` always fills every one of them, and a default here would
    # publish the field as optional in the schema the generated client trusts.
    id: str
    cards: list[LinePieceEntry]
    mana_needed: str
    mana_value_needed: int
    identity: list[str]
    produces: list[str]
    bracket_tag: str
    popularity: int
    prerequisites: LinePrerequisites
    folds_to: list[str]
    complete: bool
    missing: list[str]
    # Task I2 (cEDH Pro round) — additive, `None` below bracket 5, for a
    # near-miss line (nothing to protect yet), or while the scene's profile
    # is unmeasured. Same contract as `Diagnostics.meta_grade`.
    win_through: LineWinThroughEntry | None = None


class TutorMapEntry(BaseModel):
    tutor: str
    reaches: list[str]


class SharedPieceEntry(BaseModel):
    name: str
    oracle_id: str


class SharedPieceWithLines(BaseModel):
    name: str
    oracle_id: str
    line_ids: list[str]


class RedundancyBlock(BaseModel):
    shared_pieces: list[SharedPieceWithLines]
    single_points: list[SharedPieceEntry]


class LineReportResponse(BaseModel):
    lines: list[LineEntry]
    tutor_map: list[TutorMapEntry]
    redundancy: RedundancyBlock
    # Said, not silent — same contract as `CombosResponse.notes`.
    notes: list[str]


def _empty_line_report(note: str) -> LineReportResponse:
    return LineReportResponse(
        lines=[],
        tutor_map=[],
        redundancy=RedundancyBlock(shared_pieces=[], single_points=[]),
        notes=[note],
    )


def _line_identity(request: LinesRequest) -> list[str] | None:
    """`_combo_identity`'s twin for `LinesRequest` — duplicated rather than
    shared so the two endpoints' request models can diverge later without
    one editing the other's helper."""
    if request.identity is not None:
        return list(request.identity)
    if not request.commander_oracle_ids:
        return None

    from .graph import fetch_deck

    rows = fetch_deck(dict.fromkeys(request.commander_oracle_ids, 1))
    if not rows:
        return None
    union = {color for row in rows for color in row["color_identity"]}
    return [color for color in "WUBRG" if color in union]


def _protection_way_entry(way: ProtectionWay) -> ProtectionWayEntry:
    return ProtectionWayEntry(
        kind=way.kind, column=way.column, count=way.count, cards=list(way.cards)
    )


def _win_through_entry(grade: LineWinThroughGrade | None) -> LineWinThroughEntry | None:
    if grade is None:
        return None
    return LineWinThroughEntry(
        line_turn=grade.line_turn,
        mana_left_after_line=grade.mana_left_after_line,
        ways=[_protection_way_entry(w) for w in grade.ways],
        excluded=[_protection_way_entry(w) for w in grade.excluded],
        protected_count=grade.protected_count,
        expected_stack=grade.expected_stack,
        profile_source=grade.profile_source,
    )


def _line_entry(line: Line, *, win_through: LineWinThroughGrade | None = None) -> LineEntry:
    return LineEntry(
        id=line.id,
        cards=[
            LinePieceEntry(
                name=card.name,
                oracle_id=card.oracle_id,
                zones=list(card.zones),
                must_be_commander=card.must_be_commander,
                in_deck=card.in_deck,
            )
            for card in line.cards
        ],
        mana_needed=line.mana_needed,
        mana_value_needed=line.mana_value_needed,
        identity=list(line.identity),
        produces=list(line.produces),
        bracket_tag=line.bracket_tag,
        popularity=line.popularity,
        prerequisites=LinePrerequisites(easy=line.prereq_easy, notable=line.prereq_notable),
        folds_to=sorted(line.folds_to),
        complete=line.complete,
        missing=list(line.missing),
        win_through=_win_through_entry(win_through),
    )


@app.post("/lines", response_model=LineReportResponse)
def post_lines(request: LinesRequest) -> LineReportResponse:
    """Complete combo lines and near-misses: cost, colours, zones,
    prerequisites, fold classes, tutor reach, and redundancy.

    No HTTP fallback: unlike `/combos`, the cost/zone/prerequisite data this
    endpoint exists for only lives on the ingested graph, so a combo layer
    that has never been ingested is reported as a note, not silently
    answered from a shape that cannot carry the fields at all.
    """
    from .graph import combo_count

    if combo_count() == 0:
        return _empty_line_report(
            "Line data requires the Spellbook graph ingest "
            "(`deck-lab ingest-combos`) — no fallback carries cost/zone data."
        )

    try:
        all_lines = run_lines([entry.oracle_id for entry in request.cards])
    except Exception as exc:  # noqa: BLE001 — unofficial data path, must not 500
        log.warning("lines.unavailable", error=str(exc))
        return _empty_line_report(f"Line lookup unavailable: {exc}")

    identity = _line_identity(request)
    excluded = set(request.excluded)

    def within_identity(line: Line) -> bool:
        """Same rule `/combos` applies to its `one_short` list: a complete
        line is a statement of fact about the deck and is never filtered; a
        near-miss whose one missing piece falls outside the deck's colours
        is not a recommendation this deck can legally play."""
        if identity is None or line.complete:
            return True
        piece = next((card for card in line.cards if not card.in_deck), None)
        if piece is None or not piece.color_identity:
            return True
        return all(color in identity for color in piece.color_identity)

    complete_all = sorted(
        (line for line in all_lines if line.complete),
        key=lambda line: (len(line.missing), line.mana_value_needed, -line.popularity),
    )
    near_miss = sorted(
        (
            line
            for line in all_lines
            if not line.complete
            and line.missing_oracle_id not in excluded
            and within_identity(line)
        ),
        key=lambda line: -line.popularity,
    )

    shown = [
        *complete_all[: request.limit],
        *near_miss[: min(request.limit, LINE_NEAR_MISS_LIMIT)],
    ]
    tutors = run_tutor_map([entry.oracle_id for entry in request.cards], shown)
    shared, single_points = run_redundancy(complete_all)

    # Task I2: what protects each complete line's own resolution, against
    # Task I1's expected table-wide stack interaction. `build_interaction_grid`
    # already gates on `is_cedh(request.speed)` (returns `None` below bracket
    # 5), so this fetch is the only new cost a casual-speed request pays —
    # the same trio `diagnose()` fetches for the same reason, not previously
    # needed here since /combos-shaped endpoints never built a grid before.
    from .graph import deck_card_resources, deck_card_roles, fetch_deck

    quantities = {entry.oracle_id: entry.qty for entry in request.cards}
    grid = build_interaction_grid(
        fetch_deck(quantities),
        deck_card_roles(quantities),
        deck_card_resources(quantities),
        request.speed,
    )

    win_through_by_line: dict[str, LineWinThroughGrade] = {}
    if grid is not None:
        context = (
            run_resolve_expected_meta("cedh", request.expected_meta)
            if request.expected_meta
            else None
        )
        profile = (
            context.profile if context is not None else MEASURED_INTERACTION_PROFILES.get("cedh")
        )
        source = context.source if context is not None else "scene"
        for line in shown:
            grade = grade_line_win_through(
                line, grid, "cedh", profile=profile, profile_source=source
            )
            if grade is not None:
                win_through_by_line[line.id] = grade

    return LineReportResponse(
        lines=[_line_entry(line, win_through=win_through_by_line.get(line.id)) for line in shown],
        tutor_map=[TutorMapEntry(tutor=t.tutor, reaches=list(t.reaches)) for t in tutors],
        redundancy=RedundancyBlock(
            shared_pieces=[
                SharedPieceWithLines(name=p.name, oracle_id=p.oracle_id, line_ids=list(p.line_ids))
                for p in shared
            ],
            single_points=[
                SharedPieceEntry(name=p.name, oracle_id=p.oracle_id) for p in single_points
            ],
        ),
        notes=[],
    )


class SwapsRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    commander_oracle_id: OracleId | None = None
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor; the extras widen the
    # identity union and the exclusion lists, never the anchor.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # The builder's own target curve, replacing the archetype's interpolated
    # shape. Empty keeps it.
    curve: list[CurvePoint] = Field(default_factory=list, max_length=MAX_CURVE_POINTS)
    # The builder's own type corridors, replacing the archetype's measured
    # ones. Empty keeps them.
    type_overrides: list[TypeRange] = Field(default_factory=list, max_length=MAX_TYPE_OVERRIDES)
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
    # A Scryfall-style pool restriction — see `SuggestionsRequest.pool_query`.
    pool_query: PoolQuery | None = None
    # Cards the user never wants suggested — the builder's ignore list.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    # The deck's allowed colours as WUBRG letters — Rule 0 house rules. `None`
    # derives from the commander(s); `[]` is a deliberate "colourless only".
    identity: list[Term] | None = Field(None, max_length=5)
    # The deck's target card count outside the command zone — Rule 0 decks
    # may aim at 60 or 150. Every quota is tuned for 99 and scaled by
    # deck_size/99.
    deck_size: int = Field(99, ge=1, le=250)
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
    pool_filter = _pool(request.max_price, request.pool_query)
    result = run_swaps(
        [entry.oracle_id for entry in request.cards],
        request.card_names,
        quantities={entry.oracle_id: entry.qty for entry in request.cards},
        commander_oracle_id=request.commander_oracle_id,
        commander_oracle_ids=request.commander_oracle_ids,
        speed=request.speed,
        overrides=_as_overrides(request.overrides),
        curve=_as_curve(request.curve),
        type_overrides=_as_type_overrides(request.type_overrides),
        focus=request.focus,
        pinned_themes=request.pinned_themes,
        excluded_themes=request.excluded_themes,
        excluded=request.excluded,
        identity=request.identity,
        deck_size=request.deck_size,
        protected=request.keep,
        limit=request.limit,
        per_add=request.per_add,
        pool_filter=pool_filter,
        allow_network=_cold_commander_allow_network(
            request.commander_oracle_id, request.commander_oracle_ids
        ),
    )
    return SwapsResponse(suggestions=result["adds"], cuts=result["cuts"], swaps=result["swaps"])


class ReplaceRequest(BaseModel):
    cards: list[DeckEntry] = Field(min_length=1, max_length=MAX_CARDS)
    card_names: list[Term] = Field(default_factory=list, max_length=MAX_CARDS)
    target_oracle_id: OracleId
    commander_oracle_id: OracleId | None = None
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor; the extras widen the
    # identity union and the exclusion lists, never the anchor.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # The builder's own target curve, replacing the archetype's interpolated
    # shape. Empty keeps it.
    curve: list[CurvePoint] = Field(default_factory=list, max_length=MAX_CURVE_POINTS)
    # The builder's own type corridors, replacing the archetype's measured
    # ones. Empty keeps them.
    type_overrides: list[TypeRange] = Field(default_factory=list, max_length=MAX_TYPE_OVERRIDES)
    # Bounded to keep a hostile payload from smuggling a list of thousands,
    # not to mirror the theme count — the layer grows, and a cap that encodes
    # today's size 422s the release that adds a theme.
    pinned_themes: list[Term] = Field(default_factory=list, max_length=64)
    excluded_themes: list[Term] = Field(default_factory=list, max_length=64)
    limit: int = Field(10, ge=1, le=40)
    max_price: float | None = Field(None, gt=0)
    # A Scryfall-style pool restriction — see `SuggestionsRequest.pool_query`.
    pool_query: PoolQuery | None = None
    # Cards the user never wants suggested — the builder's ignore list.
    excluded: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    # The deck's allowed colours as WUBRG letters — Rule 0 house rules. `None`
    # derives from the commander(s); `[]` is a deliberate "colourless only".
    identity: list[Term] | None = Field(None, max_length=5)
    # The deck's target card count outside the command zone — Rule 0 decks
    # may aim at 60 or 150. Every quota is tuned for 99 and scaled by
    # deck_size/99.
    deck_size: int = Field(99, ge=1, le=250)


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
    pool_filter = _pool(request.max_price, request.pool_query)
    result = run_replacements(
        [entry.oracle_id for entry in request.cards],
        request.card_names,
        request.target_oracle_id,
        quantities={entry.oracle_id: entry.qty for entry in request.cards},
        commander_oracle_id=request.commander_oracle_id,
        commander_oracle_ids=request.commander_oracle_ids,
        speed=request.speed,
        overrides=_as_overrides(request.overrides),
        curve=_as_curve(request.curve),
        type_overrides=_as_type_overrides(request.type_overrides),
        limit=request.limit,
        pool_filter=pool_filter,
        pinned_themes=request.pinned_themes,
        excluded_themes=request.excluded_themes,
        excluded=request.excluded,
        identity=request.identity,
        deck_size=request.deck_size,
        allow_network=_cold_commander_allow_network(
            request.commander_oracle_id, request.commander_oracle_ids
        ),
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
    # Every card the deck fields as a commander — partners, backgrounds — so a
    # second commander is defended even when the caller is not our frontend.
    # `commander_oracle_id` stays the analysis anchor; the extras widen the
    # identity union and the exclusion lists, never the anchor.
    commander_oracle_ids: list[OracleId] = Field(default_factory=list, max_length=8)
    speed: float = Field(0.5, ge=0.0, le=1.0)
    overrides: list[BucketRange] = Field(default_factory=list, max_length=MAX_OVERRIDES)
    # The builder's own target curve, replacing the archetype's interpolated
    # shape. Empty keeps it.
    curve: list[CurvePoint] = Field(default_factory=list, max_length=MAX_CURVE_POINTS)
    # The builder's own type corridors, replacing the archetype's measured
    # ones. Empty keeps them.
    type_overrides: list[TypeRange] = Field(default_factory=list, max_length=MAX_TYPE_OVERRIDES)
    focus: Term | None = None
    # Bounded to keep a hostile payload from smuggling a list of thousands,
    # not to mirror the theme count — the layer grows, and a cap that encodes
    # today's size 422s the release that adds a theme.
    pinned_themes: list[Term] = Field(default_factory=list, max_length=64)
    excluded_themes: list[Term] = Field(default_factory=list, max_length=64)
    # The deck's target card count outside the command zone — both the size
    # /fill fills to and, like every advisor endpoint, the size the grading
    # quotas are scaled to (tuned for 99, scaled by deck_size/99).
    deck_size: int = Field(99, ge=1, le=250)
    budget: float | None = Field(None, gt=0)
    # Restricts the pool the fill draws from, unlike `budget` above, which
    # constrains the total spend over whatever pool was retrieved.
    pool_query: PoolQuery | None = None
    # Cards the user has already turned down. Re-solving with these excluded is
    # how "not that one" works without discarding the rest of the fill.
    rejected: list[OracleId] = Field(default_factory=list, max_length=MAX_CARDS)
    # The deck's allowed colours as WUBRG letters — Rule 0 house rules. `None`
    # derives from the commander(s); `[]` is a deliberate "colourless only".
    identity: list[Term] | None = Field(None, max_length=5)


@app.post("/fill", response_model=FillResult)
def post_fill(request: FillRequest) -> FillResult:
    """Fill an incomplete deck to `deck_size`, respecting the chosen ratios."""
    pool_filter = _pool(None, request.pool_query)
    try:
        return run_fill(
            [entry.oracle_id for entry in request.cards],
            request.card_names,
            quantities={entry.oracle_id: entry.qty for entry in request.cards},
            commander_oracle_id=request.commander_oracle_id,
            commander_oracle_ids=request.commander_oracle_ids,
            speed=request.speed,
            overrides=_as_overrides(request.overrides),
            curve=_as_curve(request.curve),
            type_overrides=_as_type_overrides(request.type_overrides),
            focus=request.focus,
            pinned_themes=request.pinned_themes,
            excluded_themes=request.excluded_themes,
            deck_size=request.deck_size,
            budget=request.budget,
            pool_filter=pool_filter,
            rejected=request.rejected,
            identity=request.identity,
            # Deferred: resolved inside run_fill only once the concurrency
            # gate is held, so the 429 rejection path stays free of graph work.
            allow_network=lambda: _cold_commander_allow_network(
                request.commander_oracle_id, request.commander_oracle_ids
            ),
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
