"""Runtime configuration, read from the environment (or a local .env)."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/src/deck_lab/config.py -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "deck-lab-dev"
    neo4j_database: str = "neo4j"

    # Scryfall rejects requests whose User-Agent is a default HTTP-library
    # string with 400 `generic_user_agent`. This is not optional.
    scryfall_user_agent: str = "ScryDeckLab/0.1 (+https://github.com/local/scry-before-you-buy)"

    # Bulk dumps and the EDHREC cache live here; gitignored, re-fetchable.
    data_dir: Path = BACKEND_ROOT / "data"

    # --- serving ----------------------------------------------------------
    # Every cache and pool below is per *process*, so each uvicorn worker
    # holds its own. That is the accepted trade for needing no shared store;
    # `scripts/serve.sh` documents the multiplication.

    # Response caches. Diagnostics and suggestions are pure functions of the
    # deck and its settings over a corpus that only changes on re-ingest, so
    # the TTL exists to bound one thing: a report computed before an EDHREC
    # warm-up landed. `/warm` also clears them when a fetch succeeds.
    response_cache_max_entries: int = 256
    response_cache_ttl_seconds: float = 300.0  # 0 disables the cache entirely
    facets_cache_ttl_seconds: float = 3600.0

    # CP-SAT is the only CPU-bound work the API does. Threads in flight are
    # `fill_max_concurrent * solver_num_workers`; a saturated gate 429s rather
    # than queueing, because a queued caller waits a full solve to be served.
    solver_num_workers: int = 4
    fill_max_concurrent: int = 3
    fill_acquire_timeout_seconds: float = 0.0

    # Corpus scans (IDF, typal density, facets) paid at boot instead of inside
    # the first request. Runs on every --reload restart in dev too.
    warmup_on_start: bool = True

    # Best-effort, per process. The real shield is a fronting proxy or CDN;
    # this only keeps one client from trivially monopolising a worker.
    rate_limit_enabled: bool = True
    rate_limit_rps: float = 2.0
    rate_limit_burst: int = 10

    @property
    def bulk_dir(self) -> Path:
        return self.data_dir / "scryfall"


settings = Settings()
