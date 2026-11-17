"""Time the advisor endpoints against a live Neo4j, query by query.

    PYTHONHASHSEED=0 uv run python scripts/bench_endpoints.py run --out before.json
    PYTHONHASHSEED=0 uv run python scripts/bench_endpoints.py run --out after.json
    uv run python scripts/bench_endpoints.py compare before.json after.json

`run` drives the app in-process with the response cache off and records every
Neo4j span. `compare` puts two runs side by side and says whether each case
still answers the same. The hash seed pins the set orders some answers show.

The deck is built from the graph: the commander's EDHREC page plus basics, so
a commander without a page (`--commander`) cannot be benched.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from collections import defaultdict
from typing import Any

os.environ.setdefault("RESPONSE_CACHE_TTL_SECONDS", "0")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

# Response fields that are timings, not answers.
TIMINGS = {"solve_ms"}

BASICS = {"W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"}


def _deck(commander: str | None) -> tuple[str, list[dict], list[str]]:
    """`(commander id, cards, names)`: the 62 most played cards of the page, and 28 basics."""
    from deck_lab import graph
    from deck_lab.config import settings

    with graph.driver() as driver, driver.session(database=settings.neo4j_database) as session:
        if commander is None:
            commander = session.run(
                "MATCH (c:Card)-[r:RECOMMENDS]->() RETURN c.oracle_id AS id, count(r) AS n "
                "ORDER BY n DESC, id LIMIT 1"
            ).single()["id"]
        page = [
            dict(row)
            for row in session.run(
                "MATCH (:Card {oracle_id: $commander})-[r:RECOMMENDS]->(c:Card) "
                "WHERE NOT c.type_line CONTAINS 'Basic' "
                "RETURN c.oracle_id AS oracle_id, c.name AS name "
                "ORDER BY r.inclusion_rate DESC, c.name LIMIT 62",
                commander=commander,
            )
        ]
        identity = session.run(
            "MATCH (c:Card {oracle_id: $commander}) RETURN c.color_identity AS identity",
            commander=commander,
        ).single()["identity"]
        basic = session.run(
            "MATCH (c:Card {name: $name}) RETURN c.oracle_id AS oracle_id, c.name AS name",
            name=BASICS.get(next(iter(identity), "G"), "Forest"),
        ).single()
    if not page:
        raise SystemExit(f"{commander} has no EDHREC page in this graph")
    cards = [{"oracle_id": row["oracle_id"], "qty": 1} for row in page]
    cards.append({"oracle_id": basic["oracle_id"], "qty": 28})
    return commander, cards, [*(row["name"] for row in page), basic["name"]]


def _cases(commander: str, cards: list[dict], names: list[str]) -> list[tuple[str, str, dict]]:
    base = {"cards": cards, "commander_oracle_id": commander}
    full = {**base, "card_names": names}
    return [
        ("diagnostics", "/diagnostics", base),
        ("suggestions", "/suggestions", full),
        ("swaps", "/swaps", full),
        ("diagnostics bracket 5", "/diagnostics", {**base, "speed": 1.0}),
        ("swaps bracket 5", "/swaps", {**full, "speed": 1.0}),
        ("swaps 40 cards", "/swaps", {**full, "speed": 0.8, "cards": cards[:40]}),
        ("swaps five colours", "/swaps", {**full, "identity": list("WUBRG")}),
        (
            "suggestions theme targets",
            "/suggestions",
            {**full, "theme_targets": {"landfall": 0.3, "tokens": 0.0}},
        ),
        ("suggestions focus", "/suggestions", {**full, "focus": "theme:counters"}),
        ("replace", "/replace", {**full, "target_oracle_id": cards[0]["oracle_id"]}),
        ("fill", "/fill", {**full, "cards": cards[:50]}),
    ]


def run(out: str, runs: int, commander: str | None) -> None:
    from fastapi.testclient import TestClient
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    from deck_lab.api import app

    results = []
    with TestClient(app) as client:
        for name, path, body in _cases(*_deck(commander)):
            client.post(path, json=body).raise_for_status()  # warm
            walls, counts = [], []
            queries: dict[str, list[float]] = defaultdict(list)
            for _ in range(runs):
                exporter.clear()
                start = time.perf_counter()
                response = client.post(path, json=body)
                walls.append((time.perf_counter() - start) * 1000)
                response.raise_for_status()
                spans = [s for s in exporter.get_finished_spans() if s.name == "neo4j"]
                counts.append(len(spans))
                for span in spans:
                    text = " ".join(span.attributes["db.query.text"].split())
                    queries[text].append((span.end_time - span.start_time) / 1e6)
            results.append(
                {
                    "case": name,
                    "wall_ms": round(statistics.median(walls), 1),
                    "queries": round(statistics.median(counts)),
                    "per_query": sorted(
                        (
                            {"query": text, "n": len(ms) / runs, "ms": round(sum(ms) / runs, 1)}
                            for text, ms in queries.items()
                        ),
                        key=lambda row: -row["ms"],
                    ),
                    "response": response.json(),
                }
            )
            print(f"{name:<28} {results[-1]['wall_ms']:>7} ms {results[-1]['queries']:>4} queries")
    with open(out, "w") as handle:
        json.dump(results, handle, indent=1, sort_keys=True)


def _first_difference(before: Any, after: Any, path: str = "") -> str | None:
    if type(before) is not type(after):
        return path or "/"
    if isinstance(before, dict):
        for key in sorted((set(before) | set(after)) - TIMINGS):
            if key not in before or key not in after:
                return f"{path}/{key}"
            if found := _first_difference(before[key], after[key], f"{path}/{key}"):
                return found
    elif isinstance(before, list):
        if len(before) != len(after):
            return f"{path} (length {len(before)} → {len(after)})"
        for index, (one, other) in enumerate(zip(before, after, strict=True)):
            if found := _first_difference(one, other, f"{path}[{index}]"):
                return found
    elif before != after:
        return path
    return None


def compare(before_file: str, after_file: str) -> None:
    with open(before_file) as one, open(after_file) as other:
        before, after = json.load(one), json.load(other)
    print(f"{'case':<28} {'wall ms':>17} {'queries':>11}  answer")
    for old, new in zip(before, after, strict=True):
        difference = _first_difference(old["response"], new["response"])
        print(
            f"{old['case']:<28} {old['wall_ms']:>7} → {new['wall_ms']:<7}"
            f" {old['queries']:>4} → {new['queries']:<4}"
            f"  {'same' if difference is None else 'differs at ' + difference}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("--out", required=True)
    run_parser.add_argument("--runs", type=int, default=9)
    run_parser.add_argument("--commander", help="oracle id; default: the largest EDHREC page")
    compare_parser = commands.add_parser("compare")
    compare_parser.add_argument("before")
    compare_parser.add_argument("after")
    args = parser.parse_args()
    if args.command == "run":
        run(args.out, args.runs, args.commander)
    else:
        compare(args.before, args.after)


if __name__ == "__main__":
    main()
