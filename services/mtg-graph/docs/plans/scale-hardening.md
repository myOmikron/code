# Scale-hardening the Deck Lab backend

> Handoff plan, written to be executed by a smaller model. Every decision is
> pre-made; do not re-litigate bounds, defaults, or placement. When a spec
> conflicts with the code you find, the code wins for *line numbers* and this
> plan wins for *behavior*. Execute the tasks in the order given at the
> bottom, one conventional commit per task.

## Context

The app targets ~1k concurrent users. After the combo-corpus ingest, all
request-path traffic is fast (~250ms) and read-only except the lazy EDHREC
ingest — but the backend has no response caching, no payload caps, no rate
limiting, an uncapped 8-thread-per-request CP-SAT solver on `/fill`, and pays
three full-corpus scans inside the first request of every process. This plan
closes those gaps. It adds no new dependencies and no new infrastructure;
everything is in-process and per-worker, which is documented rather than
hidden.

Two decisions made by the project owner: the in-code rate limiter IS in scope
(infra like Cloudflare comes later and replaces nothing here), and a saturated
`/fill` returns **429 immediately** (no queueing wait).

## Repo orientation

- Backend: `backend/src/deck_lab/` — FastAPI (`api.py`), settings singleton
  (`config.py`, pydantic-settings, env vars are bare uppercased field names),
  Neo4j access (`graph.py`, module-level driver via `with driver() as ...`),
  CP-SAT solver (`solver.py`), EDHREC adapter (`edhrec.py`), CLI (`cli.py`,
  typer; commands call a `run`-style function returning a dict and echo
  `key: value`).
- Tests: `backend/tests/`, pure-function pytest, no conftest.py. Run with
  `cd backend && uv run pytest -q`. Lint: `uv run ruff check src tests`,
  format: `uv run ruff format src tests` (line length 100).
- House style: comments state constraints the code can't show; known gaps are
  recorded in comments/commit bodies, not papered over. Conventional commits
  (see `CLAUDE.md`): one commit per task below, e.g. `feat(api): ...`.
  Note: two pre-existing E501 lint errors in `graph.py` (long Cypher regexes)
  are NOT yours to fix; `ruff check` on untouched files may report them.

## Cross-task invariants (read before starting)

1. **TestClient rule:** only T5's lifespan tests may use
   `with TestClient(app):` (context manager). Everywhere else use a bare
   `TestClient(app)` — entering the context manager runs the lifespan, which
   would hit the graph from tests that must stay DB-free. State this rule in
   each new test file's docstring.
2. **Middleware ordering:** Starlette registers `@app.middleware` innermost-
   first — the LAST-registered middleware is OUTERMOST. The rate limiter (T6)
   must be defined ABOVE the existing `request_timing` middleware in
   `api.py`, so `request_timing` registers later, wraps it, and 429s still
   produce `http.request` log lines.
3. **Per-worker semantics:** response caches, IDF warmup, the fill semaphore,
   and rate-limit buckets are all per-process and multiply under
   `uvicorn --workers N`. This is accepted and documented (T5's README
   section), never "fixed" with shared state.
4. After each task: `cd backend && uv run pytest -q && uv run ruff check src tests`
   and `uv run ruff format src tests` before committing.

---

## T4 — Payload caps (do this FIRST: it establishes the API test pattern)

**Files:** `backend/src/deck_lab/api.py`, `backend/src/deck_lab/diagnostics.py`
(DeckEntry only); new `backend/tests/test_api_validation.py`.

`DeckEntry` (diagnostics.py, ~line 31):

```python
class DeckEntry(BaseModel):
    oracle_id: str = Field(max_length=64)  # oracle_ids are 36-char UUIDs
    qty: int = Field(1, ge=1, le=99)       # 99 = deck max; covers basics and Relentless Rats
```

Recorded gap, add as a comment near the CLI `diagnose` command in `cli.py`
(do not "fix" it): a decklist line like `100 Plains` now raises a pydantic
ValidationError in the CLI instead of being clamped — accepted and recorded.

In `api.py`, add two aliases after the imports:

```python
OracleId = Annotated[str, Field(max_length=64)]
Term = Annotated[str, Field(max_length=256)]  # longest real card names are ~141 chars
```

Apply (everything not listed keeps its current constraint):

| Model | Field | Constraint |
|---|---|---|
| all five deck models | `cards` | `max_length=512` |
| all that have them | `overrides` | `max_length=16` (5 buckets exist; headroom is deliberate) |
| all that have them | `commander_oracle_id` | `OracleId \| None` |
| Suggestions/Swaps/Replace/Fill | `card_names` | `list[Term]`, `max_length=512` |
| Suggestions/Swaps/Fill | `focus` | `Term \| None`; theme list items → `Term` (list caps of 64 already exist) |
| SearchRequest | `produces, cares_about, roles, creature_types, makes_types, cares_about_types, themes` | `list[Term]`, `max_length=32` each |
| SearchRequest | `identity` | `max_length=5`, items `Term` |
| SearchRequest | `text` | `max_length=200` |
| SearchRequest | `exclude` | `list[OracleId]`, `max_length=512` — the frontend sends the whole active board here (`Builder.js` → `useGraphSearch.js`), so 32 would break search |
| SearchRequest | `sort` | `max_length=32` |
| ReplaceRequest | `target_oracle_id` | `OracleId` |
| FillRequest | `rejected` | `list[OracleId]`, `max_length=512` |
| WarmRequest | `commander_oracle_id` | `OracleId` |

**Tests** (`test_api_validation.py`): module-level `client = TestClient(app)`
(bare — see invariant 1; 422s happen before any handler runs, so no graph).
One test per 422 case: 513 cards; qty 0; qty 100; 65-char oracle_id; 17
overrides; 513 card_names; 257-char card name; 201-char search text; 33-item
`produces`; 6-item identity; 513-item exclude; 65-char replace target; 513
rejected; 65-char warm id. Boundary-accept cases construct models directly
(no HTTP): exactly 512 cards, qty 99, 32-item search lists, 200-char text.

**Commit:** `feat(api): bound every request payload`

---

## T1 — Server-side response cache

**Files:** new `backend/src/deck_lab/cache.py`; edit `api.py`, `config.py`,
`backend/.env.example`; new `backend/tests/test_cache.py`.

`config.py` additions:

```python
response_cache_max_entries: int = 256      # per endpoint, per worker
response_cache_ttl_seconds: float = 300.0  # 0 disables; bounds post-EDHREC-warm staleness
facets_cache_ttl_seconds: float = 3600.0   # corpus-static; changes only on re-ingest
```

`cache.py` — one class, three module singletons:

```python
class LruTtlCache:
    def __init__(self, name, *, max_entries, ttl_seconds, clock=time.monotonic): ...
    def get(self, key):   # expired entry => delete + return None
    def put(self, key, value):  # evict LRU beyond max_entries
    def clear(self): ...
```

- Storage: `OrderedDict[key, (expires_at, value)]` + `threading.Lock` held for
  every operation (handlers run on a 40-thread pool). `move_to_end` on hit.
- `get` logs `cache.hit`/`cache.miss` via structlog with `cache=<name>`.
- Docstring must state: per-process, and cached values are frozen — handlers
  must never mutate a returned model.
- Singletons at module bottom: `diagnostics_cache`, `suggestions_cache` (both
  from the response_cache settings), `facets_cache` (max_entries=1, facets TTL).

`api.py` — key builders next to the request models:

```python
def _canonical_cards(cards): ...      # merge duplicate oracle_ids summing qty, sort by oracle_id, tuple of (id, qty)
def _canonical_overrides(overrides): ...  # through _as_overrides() so duplicate buckets last-win
                                          # exactly as handlers see them; tuple(sorted(...))
def _diagnostics_key(r):  # (_canonical_cards, r.speed, _canonical_overrides, r.commander_oracle_id)
def _suggestions_key(r):  # + tuple(sorted(set(r.card_names))), r.limit, r.max_price, r.focus,
                          #   tuple(r.pinned_themes), tuple(r.excluded_themes)  # pin order kept:
                          #   order may affect ranking; sorting it would be a correctness bet
```

Handler pattern — explicit, not a decorator:

```python
key = _suggestions_key(request)
if (cached := suggestions_cache.get(key)) is not None:
    return cached
report = suggest(...)              # unchanged
suggestions_cache.put(key, report) # put only on success — exceptions are never cached
return report
```

Same in `post_diagnostics`. `get_facets` delegates to a new `_facets_cached()`
helper (get → `run_facets()` → put → return) so T5's warmup can reuse it.

**Staleness fix (required):** in `post_warm`'s background `work()`, after
`ingest_commander(name)` succeeds with `fetched > 0`:
`diagnostics_cache.clear(); suggestions_cache.clear()` — comment: both caches
condition on EDHREC data (recommendations and type targets); per-commander
invalidation is not worth the key bookkeeping.

**Tests** (`test_cache.py`, pure, no graph): LruTtlCache with injected fake
clock — hit; miss after TTL; LRU eviction order; clear; put-overwrites.
Key builders — card order-insensitivity; duplicate oracle_id summing;
duplicate override bucket last-wins; `limit`/`focus` change the suggestions
key; commander None vs set differ.

**Commit:** `feat(api): cache diagnostics and suggestions responses`

---

## T3 — Bounded solver concurrency for /fill

**Files:** `solver.py`, `api.py`, `config.py`, `.env.example`; new
`backend/tests/test_fill_gate.py`.

`config.py`:

```python
solver_num_workers: int = 4              # was hardcoded 8 in solver.py
fill_max_concurrent: int = 3             # per process; 3×4 = 12 solver threads worst case
fill_acquire_timeout_seconds: float = 0.0  # 0 = fail fast with 429 (chosen); raise to queue briefly
```

`solver.py`:

- `class SolverBusy(RuntimeError):` — docstring: "Every fill slot is taken.
  The API maps this to 429."
- `_FILL_GATE = threading.BoundedSemaphore(settings.fill_max_concurrent)` at
  module level (precedent: `_SPELLBOOK_POOL` in suggestions.py).
- Replace the hardcoded `solver.parameters.num_workers = 8` (~line 214) with
  `settings.solver_num_workers`.
- Rename `fill_deck` → `_fill_deck_unguarded` (body and signature untouched).
  New public `fill_deck` with the identical signature and the original public
  docstring:

```python
def fill_deck(...) -> FillResult:
    # Gate acquired before any graph work: the pre-solve diagnose+suggest is
    # part of a fill's cost, and gating first lets the 429 path be tested
    # without a database.
    if not _FILL_GATE.acquire(timeout=settings.fill_acquire_timeout_seconds):
        raise SolverBusy(f"{settings.fill_max_concurrent} fills already running")
    try:
        return _fill_deck_unguarded(<forward every argument explicitly>)
    finally:
        _FILL_GATE.release()
```

`api.py` `post_fill`: wrap the `run_fill` call:

```python
except SolverBusy as exc:
    raise HTTPException(status_code=429, detail=str(exc),
                        headers={"Retry-After": str(int(DEFAULT_TIME_LIMIT))}) from exc
```

(`DEFAULT_TIME_LIMIT` imported from `.solver`; it is 10.0.)

**Tests** (`test_fill_gate.py`, no graph — the gate sits before the first
graph call): helper drains all permits with `timeout=0`, yields, releases in
`finally`. Cases: drained gate → `fill_deck` raises `SolverBusy`; drained
gate → bare `TestClient(app)` POST `/fill` returns 429 with
`retry-after == "10"`; after release, a fresh acquire succeeds. The gate size
is fixed at import — drain it in a loop; never resize it.

**Commit:** `feat(suggest): cap concurrent fill solves`
(scope `suggest` owns the solver; check `git log` if unsure.)

---

## T5 — Startup warmup + production runner

**Files:** `api.py`, `config.py`, `.env.example`, `backend/README.md`; new
`scripts/serve.sh`; new `backend/tests/test_api_lifespan.py`.
`scripts/dev.sh` stays untouched.

`config.py`: `warmup_on_start: bool = True` — comment: also runs on every
`--reload` restart in dev; set false in `.env` if that grates.

`api.py` (define ABOVE the `app = FastAPI(...)` line; add
`from contextlib import asynccontextmanager`):

```python
def _startup_warmup() -> None:
    """Pay the corpus scans at boot instead of inside the first request.

    Each step is independently fail-soft: a cold cache is a slow first
    request, not a dead server — dev.sh polls /health and must not hang
    because Neo4j was still replaying its store."""
    from .diagnostics import resource_idf, resource_relative_idf, typal_density
    # steps: [("resource_idf", resource_idf), ..., ("facets", _facets_cached)]
    # per step: time.perf_counter; try/except Exception ->
    #   log.warning("warmup.failed", step=..., error=...)
    # else log.info("warmup.step", step=..., duration_ms=...)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.warmup_on_start:
        _startup_warmup()   # sync on purpose: nothing serves until warmup completes
    yield
    from .graph import close_driver
    close_driver()          # the documented process-shutdown hook

app = FastAPI(title="Deck Lab", version="0.1.0", lifespan=lifespan)
```

Use `lifespan=`, NOT the deprecated `on_event`.

`scripts/serve.sh` (new, `chmod +x`):

```bash
#!/usr/bin/env bash
# Production runner — no --reload. Everything per-process multiplies by
# WORKERS: response caches, IDF warmup (each worker scans at boot), the
# /fill semaphore (total fills = fill_max_concurrent x WORKERS), and the
# rate limiter's buckets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
exec uv run uvicorn deck_lab.api:app \
  --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --workers "${WORKERS:-2}"
```

`backend/README.md`: add a short `## Serving` section — serve.sh usage,
`WORKERS`/`PORT`/`HOST`, the per-worker multiplication note, and that the
real rate-limit shield is a fronting proxy/CDN (out of scope here).

**Tests** (`test_api_lifespan.py`): the ONLY file allowed to use
`with TestClient(app):`. Cases: all warmup callables monkeypatched to raise →
boot still completes; `settings.warmup_on_start = False` (monkeypatch) → a
recording `resource_idf` is never called. (Shutdown's `close_driver()` is a
no-op when no driver was built.)

**Commit:** `feat(api): warm caches at startup, add production runner`

---

## T2 — EDHREC pre-warm CLI

**Files:** `graph.py`, `edhrec.py` (function + module-docstring amendment),
`cli.py`; extend `backend/tests/test_edhrec.py`.

`graph.py` — near `has_recommendations`, same `with driver()` shape as its
neighbors:

```python
def top_commanders(limit: int = 1000) -> list[dict]:
    """The most-played legal commanders, for the pre-warm CLI."""
    # MATCH (c:Card) WHERE c.can_be_commander AND c.edhrec_rank IS NOT NULL
    # RETURN c.oracle_id AS oracle_id, c.name AS name
    # ORDER BY c.edhrec_rank ASC LIMIT $limit
```

`edhrec.py` — new `warm_top_commanders(top: int = 1000, *, delay_seconds:
float = 1.0) -> dict[str, int]` after `ingest_commander`. Exact logic:

1. Function-level import of `has_recommendations, top_commanders` from
   `.graph` (module convention).
2. Per row: if `is_cached(row["name"]) and has_recommendations(row["oracle_id"])`
   → `skipped += 1`, continue. (`is_cached` alone is not enough: a warm disk
   file over a wiped graph must still re-upsert — `ingest_commander` re-parses
   from disk at zero network cost.)
3. `network = not is_cached(name)` BEFORE the call. Then
   `try: result = ingest_commander(name)` /
   `except Exception: failed += 1; log.warning("warm.failed", ...); result = None`.
4. Counters: `result["fetched"] == 0` → `no_page`; else `fetched` if
   `network` else `from_disk`.
5. `if network: time.sleep(delay_seconds)` — after every network *attempt*,
   success or failure (politeness applies to errors too); disk-served rows
   never sleep.
6. Return `{"considered", "fetched", "from_disk", "skipped", "no_page", "failed"}`.

**Required docstring amendment:** `edhrec.py`'s module docstring says "Lazy,
per commander. Never bulk-crawl." Amend it: the request path stays lazy;
`warm_top_commanders` is the single sanctioned, operator-run, throttled bulk
path.

`cli.py` — standard pattern:

```python
@app.command("warm-edhrec")
def warm_edhrec(
    top: int = typer.Option(1000, help="Commanders to warm, by EDHREC rank."),
    delay: float = typer.Option(1.0, help="Seconds between network fetches — json.edhrec.com is unofficial."),
) -> None:
```

No Settings additions — the delay is a CLI concern.

**Tests** (extend `test_edhrec.py`, monkeypatch style as in
`test_type_targets.py`): monkeypatch `top_commanders`, `is_cached`,
`ingest_commander`, `has_recommendations`, and `time.sleep` (recorded).
Cases: cached+in-graph rows skipped and never sleep; `fetched==0` → `no_page`;
a raising `ingest_commander` → `failed`, loop continues; sleep once per
network attempt only; disk-cached-but-not-in-graph row ingests without sleep.

**Commit:** `feat(pipeline): pre-warm edhrec for top commanders`

---

## T6 — Per-client rate limiter

**Files:** new `backend/src/deck_lab/ratelimit.py`; edit `api.py`,
`config.py`, `.env.example`; new `backend/tests/test_ratelimit.py`.

`config.py`:

```python
rate_limit_enabled: bool = True
rate_limit_rps: float = 2.0   # an edit fires diagnostics+suggestions together; 2/s sustains an active builder
rate_limit_burst: int = 10
```

`ratelimit.py` — module docstring states the contract: per-process token
buckets, best-effort only; the real shield is a fronting proxy/CDN; the
X-Forwarded-For key is only meaningful behind the Next.js proxy — exposed
directly, a client picks its own key.

```python
class RateLimiter:
    def __init__(self, rate, burst, *, max_clients=1024, clock=time.monotonic): ...
    def check(self, key: str) -> float:
        """0.0 = allowed (token consumed); else seconds until a token exists."""
```

State: `dict[str, (tokens, last_refill)]` + `threading.Lock`. Refill
`min(burst, tokens + (now-last)*rate)`; allow if `>= 1.0`; else return
`(1.0 - tokens) / rate`. Pruning after inserting a new key past
`max_clients`: drop entries idle > 60s; if still over, keep the
`max_clients` most recently refilled.

`api.py` — placed BETWEEN the `log = structlog.get_logger(...)` line and the
`request_timing` middleware, with a comment explaining invariant 2 (ordering):

```python
_RATE_LIMITED_PATHS = frozenset({"/suggestions", "/diagnostics", "/swaps", "/replace", "/fill", "/warm"})
_RATE_LIMITER = RateLimiter(settings.rate_limit_rps, settings.rate_limit_burst)

def _client_key(request):  # first X-Forwarded-For hop, else request.client.host, else "unknown"

@app.middleware("http")
async def rate_limit(request, call_next):
    if settings.rate_limit_enabled and request.method == "POST" \
            and request.url.path in _RATE_LIMITED_PATHS:
        wait = _RATE_LIMITER.check(_client_key(request))
        if wait > 0:
            return JSONResponse(status_code=429, content={"detail": "rate limited"},
                                headers={"Retry-After": str(math.ceil(wait))})
    return await call_next(request)
```

`/health`, `/facets`, `/search` are deliberately unlimited (cheap or cached).

**Tests** (`test_ratelimit.py`): RateLimiter unit with fake clock — burst
allows exactly `burst`; denial returns wait > 0; refill after advance;
per-key isolation; pruning bounds size. Middleware graph-free via the 422
trick (middleware runs before validation): monkeypatch `_RATE_LIMITER` to
`RateLimiter(1000.0, burst=2)`; POST invalid body to `/diagnostics` three
times → 422, 422, 429 with Retry-After. Distinct X-Forwarded-For values get
distinct buckets; `rate_limit_enabled=False` (monkeypatch) bypasses.

**Commit:** `feat(api): rate-limit expensive endpoints per client`

---

## Execution order and why

1. **T4** — establishes the TestClient pattern; touches only request models.
2. **T1** — cache module + handler edits (+ warm-completion clear).
3. **T3** — solver gate + `/fill` 429 mapping.
4. **T5** — lifespan needs T1's `_facets_cached`; README documents T1/T3
   per-worker semantics.
5. **T2** — independent of api.py; slotted here to keep api.py edits contiguous.
6. **T6** — last; self-contained.

## Verification (end-to-end, after all tasks)

1. `cd backend && uv run pytest -q && uv run ruff check src tests` — full suite green
   (expect ~330+ tests; the two pre-existing graph.py E501s are not yours).
2. Live smoke (Neo4j up via `backend/docker-compose.yml`):
   `bash scripts/serve.sh` with `WORKERS=2`, then:
   - startup logs show `warmup.step` lines per worker;
   - POST the same `/suggestions` body twice → second response logs `cache.hit`
     and returns visibly faster;
   - POST `/diagnostics` >10 times rapidly from one client → a 429 with
     `Retry-After` appears;
   - `uv run deck-lab warm-edhrec --top 3 --delay 0.5` prints a summary dict
     with plausible counts, and a repeat run reports them as `skipped`.
3. Frontend still works: `bun run lint && bun test` in `frontend/` (no frontend
   files change in this plan; this guards against accidental contract drift).
