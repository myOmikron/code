# mtg-graph — deck advisor backend

Python 3.14 · FastAPI · Neo4j (Docker) · managed with [uv](https://docs.astral.sh/uv/).

Graph-backed Commander deck advisor: ingestion, diagnostics, suggestions,
graph search. Imported from the `scry-before-you-buy` repo; the design, build
history and evaluation live in [`docs/`](docs/), with
[`docs/PLAN.md`](docs/PLAN.md) as the authority. The Python package keeps its
original `deck_lab` name.

Not a crate: this directory is excluded from the cargo workspace glob in the
root `Cargo.toml`.

## Setup

The service runs as the `graph` container of the mtg stacks (dev and deploy),
next to a `neo4j` container. Traefik serves it on `/api/graph`, stripping the
prefix; uvicorn runs with a matching `--root-path`.

```bash
just dev mtg up -d --build    # graph API on http://localhost/api/graph/health
just graph ingest             # Scryfall bulk -> Card nodes (the graph starts empty!)
just graph ingest-tags        # Scryfall Tagger ontology
just graph build-semantics    # PRODUCES / CARES_ABOUT / FILLS_ROLE / themes
just graph ingest-combos      # Commander Spellbook corpus
```

For host-side work — tests, lint, one-off CLI runs against the dev stack's
Neo4j on `localhost:7687`:

```bash
cp .env.example .env   # optional — the defaults match the dev stack
uv sync --all-extras
just graph-ci          # ruff + pytest, same as CI
```

## Commands

```bash
uv run deck-lab ping      # check Neo4j connectivity
uv run deck-lab schema    # apply constraints + indexes
uv run deck-lab ingest    # download Scryfall bulk -> Card nodes
uv run deck-lab stats     # node counts
uv run deck-lab ingest-tags       # Scryfall Tagger ontology
uv run deck-lab build-semantics   # PRODUCES / CARES_ABOUT / FILLS_ROLE
uv run deck-lab bridge death_trigger      # 2-hop synergy check
uv run deck-lab diagnose deck.txt --speed 0.5
uv run deck-lab edhrec "Atraxa, Praetors' Voice"   # synergy scores -> RECOMMENDS
uv run deck-lab warm-edhrec --top 1000             # pre-warm the popular commanders
uv run deck-lab ingest-combos                      # Spellbook corpus -> Combo nodes
uv run deck-lab combos deck.txt                    # complete + one-card-short
uv run deck-lab audit                              # extraction-layer health
uv run deck-lab search --produces treasure         # what Scryfall cannot ask
uv run deck-lab typal Crab                         # type payoffs and bodies

uv run uvicorn deck_lab.api:app --port 8000   # HTTP surface for the frontend
uv run deck-lab wipe      # drop all Card nodes (schema stays)

uv run pytest
uv run ruff check . && uv run ruff format --check .
```

A full ingest takes about 8 seconds and yields ~31.6k commander-legal cards.
The bulk archive is cached in `data/scryfall/` and only re-downloaded when
Scryfall reports a newer `updated_at`.

## Serving

The dev stack runs uvicorn with `--reload`; the release image
(`services/mtg-graph/Dockerfile`) runs a single worker. If you ever pass
`--workers` to uvicorn, know what it multiplies:

Every cache and pool the API holds is **per worker**, so workers multiply
them: each worker misses the response cache once for the same deck, pays the
startup corpus scans itself, gets its own `FILL_MAX_CONCURRENT` solver slots
(so total in-flight solves are `FILL_MAX_CONCURRENT x WORKERS`, each holding
`SOLVER_NUM_WORKERS` threads), and rate-limits each client separately rather
than globally. That is the accepted price of needing no shared store; see
`.env.example` for the knobs.

The built-in rate limiter is best-effort for exactly that reason. It stops one
client from monopolising a worker; a fronting proxy or CDN is what actually
shields the service, and belongs in front of this.

Startup warms the three IDF caches and the facet list (`WARMUP_ON_START`,
default on). Each step is fail-soft: an unreachable graph at boot costs a slow
first request, not a dead worker.

## Things that will bite you

**Scryfall bulk data is gzipped JSONL, not a JSON array.** The entry key is
`jsonl_download_uri` (with `compressed_size`), not the `download_uri`/`size`
the older docs describe. `iter_cards` sniffs gzip by magic bytes and handles
both JSONL and the legacy array, so a stale cache cannot silently become a
zero-card ingest.

**Scryfall 400s default HTTP-library User-Agents** (`generic_user_agent`). Put
real contact details in `SCRYFALL_USER_AGENT` before running at volume.

**Neo4j must stay local.** AuraDB Free caps around 200k nodes / 400k
relationships; the Phase 3 semantic layer will exceed that.

**A container killed mid-write can come back unstartable.** If the Docker
daemon dies under it, `docker compose up -d` afterwards *restarts* the same
container object rather than building a new one, and it can exit(1) in under a
second with no log output at all — the JVM never starts, so nothing reaches
`docker logs`, and the last lines in `/logs/neo4j.log` are whatever was
in-flight, null-padded. It reads like a config or store problem and is
neither: the same image, settings and volumes start fine in a fresh
container. The fix is `docker compose up -d --force-recreate`, which rebuilds
the container and leaves the named volumes — and so the corpus — untouched.

**Python 3.14 is a hard floor.** Ruff's pyupgrade rules emit PEP 758 syntax
(`except TypeError, ValueError:` without parentheses), which will not parse on
3.13 or earlier.

**`pyedhrec` is at 0.0.2 on PyPI.** It is the library the plan names, but Phase 4
should be ready to vendor the handful of `json.edhrec.com` calls it wraps.

## Layout

```
src/deck_lab/
  config.py     settings (env / .env)
  models.py     Card model + Scryfall -> Card mapping
  scryfall.py   bulk download, caching, streaming
  graph.py      Neo4j schema, batched upserts, stats
  ingest.py     corpus filtering + the ingest pipeline
  cli.py        `deck-lab` entry points
```

## External data: caching policy

Both external sources are **persisted to disk before parsing** and served from
cache thereafter. `data/` (in the containers: the `/data` volume, via
`DATA_DIR`) is gitignored and fully re-fetchable.

| Source | Cache | TTL | Notes |
|---|---|---|---|
| Scryfall bulk | `data/scryfall/*.jsonl.gz` | by `updated_at` | 24MB, refreshed only when Scryfall says so |
| EDHREC | `data/edhrec/<slug>.json` | 7 days | raw response, lazy per commander, never bulk-crawled |
| Commander Spellbook | `data/spellbook/<deck-hash>.json` | 24 hours | keyed on the sorted card set |

EDHREC is unofficial and undocumented — all access is quarantined in
`edhrec.py`, and raw payloads are stored verbatim so schema drift is diagnosable
without spending another request.

## Power level

Two signals, deliberately separate (`power.py`):

- **playability** — from `edhrec_rank`, log-scaled to [0,1]. Among the 179 cards
  that produce Treasure the rank spans 63 (Smothering Tithe) to 27,670, median
  5,194, so this is what stops the bridge treating a common that makes one
  Treasure as equal to Smothering Tithe. It measures *popularity*, not power:
  Command Tower is rank 1 and is ubiquitous rather than strong.
- **game_changer** — Scryfall mirrors the official Commander Brackets list. 53
  cards, binary, authoritative. This is the one that speaks to power level, and
  it is not a scale.

What is still unmeasured is *magnitude* — Smothering Tithe makes a Treasure per
opponent per draw; a common makes one, once. That is the `amount` / `conditional`
qualifier `docs/composition.md` specifies and which has never been extracted.
Playability is a proxy standing in for it.

## Status

See the build-order table in [`docs/PLAN.md`](docs/PLAN.md) for what is done
and what is outstanding, and [`docs/evaluation.md`](docs/evaluation.md) for
the measured (and honestly negative) retrieval evaluation.
