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


def test_combos_honours_the_ignore_list_and_reports_lookup_failure(monkeypatch):
    """The ignore list applies to one_short; a dead Spellbook is a note, not a 500."""
    from types import SimpleNamespace

    from deck_lab import api as api_module

    combo = SimpleNamespace(
        id="c1",
        uses=("oracle-have", "oracle-missing"),
        card_names=("Have", "Missing"),
        produces=("Infinite mana",),
        bracket="",
        popularity=5,
        missing=("Missing",),
    )
    monkeypatch.setattr(
        api_module, "run_combos", lambda *a, **k: {"included": [], "almost_included": [combo]}
    )
    body = {"cards": [{"oracle_id": "oracle-have"}]}
    assert client.post("/combos", json=body).json()["one_short"][0]["missing"] == ["Missing"]
    ignored = client.post("/combos", json={**body, "excluded": ["oracle-missing"]}).json()
    assert ignored["one_short"] == []

    def boom(*a, **k):
        raise RuntimeError("spellbook down")

    monkeypatch.setattr(api_module, "run_combos", boom)
    answer = client.post("/combos", json=body)
    assert answer.status_code == 200
    assert "spellbook down" in answer.json()["notes"][0]


# --- Rule 0 identity override -----------------------------------------------
# `identity` is the deck's claimed colours. `None` derives from the
# commander, `[]` deliberately means colourless — the cache key must keep the
# three shapes distinct, and the list is capped like /search's.


def test_advisor_identity_longer_than_five_is_rejected():
    six = ["W", "U", "B", "R", "G", "C"]
    assert _post("/suggestions", {"cards": _deck(1), "identity": six}) == 422
    assert _post("/swaps", {"cards": _deck(1), "identity": six}) == 422
    assert _post("/replace", {"cards": _deck(1), "target_oracle_id": "t", "identity": six}) == 422
    assert _post("/fill", {"cards": _deck(1), "identity": six}) == 422


def test_identity_reaches_the_suggestions_cache_key():
    from deck_lab.api import SuggestionsRequest, _suggestions_key

    derived = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")])
    colourless = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], identity=[])
    white = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], identity=["W"])

    keys = {_suggestions_key(derived), _suggestions_key(colourless), _suggestions_key(white)}
    assert len(keys) == 3


# --- Rule 0 command zone -----------------------------------------------------
# `commander_oracle_ids` is every card the deck fields as a commander. The
# extras are deliberately unvalidated — the cap is the guard — and the list
# must reach both cache keys, or a partner deck shares its entry with the
# anchor-only request.


def test_more_than_eight_commanders_is_rejected():
    nine = {"commander_oracle_ids": [f"cmd-{i}" for i in range(9)]}
    assert _post("/diagnostics", {"cards": _deck(1), **nine}) == 422
    assert _post("/suggestions", {"cards": _deck(1), **nine}) == 422
    assert _post("/replace", {"cards": _deck(1), "target_oracle_id": "t", **nine}) == 422
    assert _post("/fill", {"cards": _deck(1), **nine}) == 422


def test_commander_list_reaches_both_cache_keys():
    from deck_lab.api import SuggestionsRequest, _diagnostics_key, _suggestions_key

    plain = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")])
    partnered = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], commander_oracle_ids=["b"])
    assert _suggestions_key(plain) != _suggestions_key(partnered)

    bare = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    anchored = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")], commander_oracle_ids=["b"])
    assert _diagnostics_key(bare) != _diagnostics_key(anchored)


# --- warm scheduling (Task 12) ---------------------------------------------
# The first /suggestions for a cold commander must not pay the inline EDHREC
# fetch (up to 30s) inside the request — it schedules a background warm
# instead and computes with `allow_network=False`.


def test_post_suggestions_schedules_a_warm_for_a_cold_commander(monkeypatch):
    from deck_lab import api as api_module
    from deck_lab import graph
    from deck_lab.suggestions import SuggestionReport

    warmed: list[str] = []
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(
        api_module, "_schedule_warm", lambda oid: warmed.append(oid) or "warming"
    )

    seen: dict = {}

    def fake_suggest(*args, **kwargs):
        seen["allow_network"] = kwargs.get("allow_network")
        return SuggestionReport(
            commander="Test Commander",
            commander_inferred=False,
            identity=[],
            considered=0,
            suggestions=[],
        )

    monkeypatch.setattr(api_module, "suggest", fake_suggest)

    body = {"cards": [{"oracle_id": "cold-cmdr-oid"}], "commander_oracle_id": "cold-cmdr-oid"}
    response = client.post("/suggestions", json=body)

    assert response.status_code == 200
    assert warmed == ["cold-cmdr-oid"]
    assert seen["allow_network"] is False
