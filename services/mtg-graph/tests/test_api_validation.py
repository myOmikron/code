"""Request payload caps. No graph, no network.

Validation runs before any handler, so a 422 never reaches Neo4j. `TestClient`
is used **without** its context manager on purpose: entering it would run the
app's lifespan, which warms the caches against a database these tests do not
have. Only `test_api_lifespan.py` may use `with TestClient(...)`.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from deck_lab.api import (
    MAX_CARDS,
    DiagnosticsRequest,
    FillRequest,
    SearchRequest,
    app,
)
from deck_lab.diagnostics import DeckEntry

client = TestClient(app)


def _deck(n: int) -> list[dict]:
    return [{"oracle_id": f"id-{i}"} for i in range(n)]


def _post(path: str, body: dict) -> int:
    return client.post(path, json=body).status_code


# --- deck payloads --------------------------------------------------------


def test_too_many_cards_is_rejected():
    assert _post("/diagnostics", {"cards": _deck(MAX_CARDS + 1)}) == 422


def test_empty_deck_is_rejected():
    assert _post("/diagnostics", {"cards": []}) == 422


def test_quantity_bounds():
    assert _post("/diagnostics", {"cards": [{"oracle_id": "a", "qty": 0}]}) == 422
    assert _post("/diagnostics", {"cards": [{"oracle_id": "a", "qty": 100}]}) == 422


def test_oversized_oracle_id_is_rejected():
    assert _post("/diagnostics", {"cards": [{"oracle_id": "x" * 65}]}) == 422


def test_too_many_overrides_is_rejected():
    overrides = [{"bucket": "ramp", "low": 1.0}] * 17
    assert _post("/diagnostics", {"cards": _deck(1), "overrides": overrides}) == 422


def test_oversized_commander_id_is_rejected():
    assert _post("/diagnostics", {"cards": _deck(1), "commander_oracle_id": "x" * 65}) == 422


# --- suggestions ----------------------------------------------------------


def test_too_many_card_names_is_rejected():
    body = {"cards": _deck(1), "card_names": ["Sol Ring"] * (MAX_CARDS + 1)}
    assert _post("/suggestions", body) == 422


def test_oversized_card_name_is_rejected():
    assert _post("/suggestions", {"cards": _deck(1), "card_names": ["x" * 257]}) == 422


def test_oversized_focus_is_rejected():
    assert _post("/suggestions", {"cards": _deck(1), "focus": "x" * 257}) == 422


# --- search ---------------------------------------------------------------


def test_oversized_search_text_is_rejected():
    assert _post("/search", {"text": "x" * 201}) == 422


def test_too_many_filter_values_is_rejected():
    assert _post("/search", {"produces": ["treasure"] * 33}) == 422


def test_identity_longer_than_five_is_rejected():
    assert _post("/search", {"identity": ["W", "U", "B", "R", "G", "C"]}) == 422


def test_too_many_exclusions_is_rejected():
    assert _post("/search", {"exclude": ["id"] * (MAX_CARDS + 1)}) == 422


# --- replace, fill, warm --------------------------------------------------


def test_oversized_replace_target_is_rejected():
    body = {"cards": _deck(1), "target_oracle_id": "x" * 65}
    assert _post("/replace", body) == 422


def test_too_many_rejected_cards_is_rejected():
    body = {"cards": _deck(1), "rejected": ["id"] * (MAX_CARDS + 1)}
    assert _post("/fill", body) == 422


def test_oversized_warm_commander_is_rejected():
    assert _post("/warm", {"commander_oracle_id": "x" * 65}) == 422


# --- the boundaries themselves are accepted -------------------------------
# Constructed directly rather than over HTTP: these are the largest payloads a
# real client sends, and they must not 422. Building the model is the whole
# assertion — no handler runs, so no graph is touched.


def test_largest_honest_payloads_validate():
    entries = [DeckEntry(oracle_id=f"id-{i}", qty=99) for i in range(MAX_CARDS)]
    assert len(DiagnosticsRequest(cards=entries).cards) == MAX_CARDS

    search = SearchRequest(
        produces=["treasure"] * 32,
        identity=["W", "U", "B", "R", "G"],
        text="x" * 200,
        exclude=["id"] * MAX_CARDS,
    )
    assert len(search.exclude) == MAX_CARDS

    fill = FillRequest(cards=entries[:1], rejected=["id"] * MAX_CARDS)
    assert len(fill.rejected) == MAX_CARDS


# --- the ignore list -------------------------------------------------------
# `excluded` is the builder's ignore list. It must be bounded like every other
# card list, and it must be part of the suggestions cache key — two requests
# differing only in their ignore lists must not share an entry.


def test_excluded_is_bounded():
    assert _post("/suggestions", {"cards": _deck(1), "excluded": ["id"] * (MAX_CARDS + 1)}) == 422
    assert _post("/swaps", {"cards": _deck(1), "excluded": ["id"] * (MAX_CARDS + 1)}) == 422


def test_excluded_reaches_the_suggestions_cache_key():
    from deck_lab.api import SuggestionsRequest, _suggestions_key

    plain = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")])
    ignoring = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], excluded=["b"])
    assert _suggestions_key(plain) != _suggestions_key(ignoring)
    # Order and duplicates must not fragment the cache.
    one = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], excluded=["b", "c"])
    other = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], excluded=["c", "b", "c"])
    assert _suggestions_key(one) == _suggestions_key(other)


def test_combos_payload_is_bounded():
    assert _post("/combos", {"cards": _deck(MAX_CARDS + 1)}) == 422
    assert _post("/combos", {"cards": []}) == 422
    assert _post("/combos", {"cards": _deck(1), "limit": 0}) == 422
