"""Live Neo4j round-trip: the pipeline executed against a real database.

Every other test in this suite is pure — no Cypher ever actually runs. That
left the pipeline-order fix (guarded structurally by `test_pipeline.py`) and
the channel queries "review-verified" only: nobody had run a single query
since the `creatures_supply_typal` first-build bug was found by inspection,
not by a failing test.

These tests close that gap against a real, disposable Neo4j. `NEO4J_TEST_URI`
is both the switch and the destination: setup here is destructive (it wipes
every `Card` node), so it runs only when that variable is explicitly set —
the env var itself is the opt-in, never a hard-coded default this module
supplies on its own. Point it at the dev stack
(`docker compose -f dev/mtg.yml up -d neo4j`, then
`NEO4J_TEST_URI=bolt://localhost:7687`) to run locally; CI points it at a
service container instead. Either way the target is wiped and reloaded with a
small hand-built corpus — safe for the dev stack too, which starts empty in
this environment and re-ingests from Scryfall in seconds if you want the real
corpus back.
"""

from __future__ import annotations

import json
import os
import time

import pytest

from deck_lab.config import settings
from deck_lab.graph import (
    apply_schema,
    close_driver,
    driver,
    upsert_cards,
    verify_connectivity,
    wipe,
)
from deck_lab.ingest import parse_bulk
from deck_lab.pipeline import run_build

pytestmark = pytest.mark.neo4j

_NEO4J_TEST_URI = os.environ.get("NEO4J_TEST_URI")

skip_without_live_neo4j = pytest.mark.skipif(
    not _NEO4J_TEST_URI,
    reason="NEO4J_TEST_URI not set — opt in to run the live Neo4j round trip",
)

# A dozen hand-built cards, enough to exercise every layer the
# `creatures_supply_typal` bug touched (typal extraction, the typal_bridge
# resource) without downloading the real ~30k-card corpus: a legendary
# commander, several typed creatures, one typal payoff, two basics, one ramp
# artifact, plus a couple more to round out the structural-correction paths
# (a high-power creature, an off-tribe creature).
_FIXTURE_CARDS = [
    {
        "oracle_id": "live-cmd-1",
        "id": "s-live-cmd-1",
        "name": "Sylvan Warleader",
        "type_line": "Legendary Creature — Elf Warrior",
        "oracle_text": "",
        "cmc": 3.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-elf-1",
        "id": "s-live-elf-1",
        "name": "Elvish Scout",
        "type_line": "Creature — Elf",
        "oracle_text": "",
        "cmc": 1.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-elf-2",
        "id": "s-live-elf-2",
        "name": "Elvish Ranger",
        "type_line": "Creature — Elf",
        "oracle_text": "",
        "cmc": 2.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-elf-3",
        "id": "s-live-elf-3",
        "name": "Elvish Druid",
        "type_line": "Creature — Elf",
        "oracle_text": "{T}: Add {G}.",
        "cmc": 1.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-elf-4",
        "id": "s-live-elf-4",
        "name": "Elvish Sentinel",
        "type_line": "Creature — Elf",
        "oracle_text": "",
        "cmc": 2.0,
        "legalities": {"commander": "legal"},
    },
    {
        # The typal payoff: cares about Elves without being one itself.
        "oracle_id": "live-payoff-1",
        "id": "s-live-payoff-1",
        "name": "Tribal War Chief",
        "type_line": "Creature — Human Soldier",
        "oracle_text": "This creature gets +1/+0 for each Elf you control.",
        "cmc": 3.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-land-1",
        "id": "s-live-land-1",
        "name": "Forest",
        "type_line": "Basic Land — Forest",
        "oracle_text": "({T}: Add {G}.)",
        "cmc": 0.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-land-2",
        "id": "s-live-land-2",
        "name": "Island",
        "type_line": "Basic Land — Island",
        "oracle_text": "({T}: Add {U}.)",
        "cmc": 0.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-ramp-1",
        "id": "s-live-ramp-1",
        "name": "Prism Signet",
        "type_line": "Artifact",
        "oracle_text": "{T}: Add one mana of any color.",
        "cmc": 2.0,
        "legalities": {"commander": "legal"},
    },
    {
        # Exercises `big_creatures_supply_high_power`.
        "oracle_id": "live-big-1",
        "id": "s-live-big-1",
        "name": "Craghorn Behemoth",
        "type_line": "Creature — Giant",
        "oracle_text": "",
        "cmc": 6.0,
        "power": "6",
        "toughness": "5",
        "legalities": {"commander": "legal"},
    },
    {
        # A second, off-tribe creature type, so typal extraction is not just
        # exercising a vocabulary of one.
        "oracle_id": "live-goblin-1",
        "id": "s-live-goblin-1",
        "name": "Goblin Raider",
        "type_line": "Creature — Goblin",
        "oracle_text": "",
        "cmc": 1.0,
        "legalities": {"commander": "legal"},
    },
    {
        "oracle_id": "live-ench-1",
        "id": "s-live-ench-1",
        "name": "Verdant Blessing",
        "type_line": "Enchantment",
        "oracle_text": "Creatures you control get +0/+1.",
        "cmc": 2.0,
        "legalities": {"commander": "legal"},
    },
]


def _wait_for_neo4j(timeout: float = 60.0) -> None:
    """Retry `verify_connectivity()` instead of asking CI for a wait step —
    the service container can take ~30s to start accepting bolt connections."""
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            verify_connectivity()
            return
        except Exception as exc:  # noqa: BLE001 — retried; only the last failure matters
            last_error = exc
            time.sleep(1.0)
    raise TimeoutError(
        f"neo4j at {settings.neo4j_uri} did not accept a connection within {timeout}s"
    ) from last_error


def _relationship_counts_by_type() -> dict[str, int]:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        rows = session.run("MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS n")
        return {row["t"]: row["n"] for row in rows}


def _tribal_payoff_producer_count() -> int:
    query = """
    MATCH (c:Card)-[:PRODUCES]->(:Resource {name: 'tribal_payoff'})
    RETURN count(c) AS n
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return session.run(query).single()["n"]


@pytest.fixture(scope="module")
def live_graph(tmp_path_factory: pytest.TempPathFactory):
    """Repoint the shared driver at `NEO4J_TEST_URI`, wipe it, and load the
    fixture corpus above. Restores the original settings on teardown.

    Repoint-then-`close_driver()` is the pattern `graph.driver()`'s own
    docstring documents for tests that need a different target than the
    process default; doing it again on the way out returns later tests (and a
    dev-stack `deck-lab` CLI invocation in the same shell) to the real config.
    """
    uri = os.environ.get("NEO4J_TEST_URI")
    if not uri:
        # Belt and suspenders alongside `skip_without_live_neo4j` above: this
        # fixture must never run its destructive setup without the explicit
        # opt-in, even if a test somehow requests it without the marker.
        pytest.skip("NEO4J_TEST_URI not set — refusing to run live Neo4j setup")

    password = os.environ.get("NEO4J_TEST_PASSWORD", "deck-lab-dev")

    patch = pytest.MonkeyPatch()
    patch.setattr(settings, "neo4j_uri", uri)
    patch.setattr(settings, "neo4j_password", password)
    close_driver()

    _wait_for_neo4j()

    wipe()
    apply_schema()

    bulk_path = tmp_path_factory.mktemp("live-graph") / "bulk.jsonl"
    bulk_path.write_text("\n".join(json.dumps(card) for card in _FIXTURE_CARDS) + "\n")
    written = upsert_cards(parse_bulk(bulk_path, None))
    assert written == len(_FIXTURE_CARDS)

    yield

    patch.undo()
    close_driver()


@skip_without_live_neo4j
def test_first_build_seeds_tribal_payoff_and_a_rebuild_is_idempotent(live_graph):
    """The exact regression `creatures_supply_typal` used to cause: living in
    `STRUCTURAL_CORRECTIONS` (which runs before `typal`), it read `IS_TYPE`
    edges that did not exist yet on a fresh ingest, so the first build's
    `tribal_payoff` producer count was 0 and only a *second* build — which saw
    the previous run's `IS_TYPE` edges — looked correct. Moving it into
    `TYPAL_BRIDGE_CORRECTIONS` (after `typal`) fixed it; this asserts both
    halves of that fix against a real database instead of by inspection."""
    run_build()

    first_counts = _relationship_counts_by_type()
    producers = _tribal_payoff_producer_count()

    assert producers > 0, "the first build must already see tribal_payoff producers"

    run_build()
    second_counts = _relationship_counts_by_type()

    assert second_counts == first_counts, "a rebuild over the same corpus must be idempotent"
