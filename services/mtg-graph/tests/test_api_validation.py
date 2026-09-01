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
    MAX_QUERY_LENGTH,
    DiagnosticsRequest,
    FillRequest,
    ReplaceRequest,
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


def test_too_many_curve_points_is_rejected():
    curve = [{"mv": 1, "share": 0.1}] * 17
    assert _post("/diagnostics", {"cards": _deck(1), "curve": curve}) == 422


def test_curve_points_outside_the_buckets_are_rejected():
    assert _post("/diagnostics", {"cards": _deck(1), "curve": [{"mv": 7, "share": 0.1}]}) == 422
    assert _post("/diagnostics", {"cards": _deck(1), "curve": [{"mv": 1, "share": 1.5}]}) == 422


def test_curve_reaches_the_diagnostics_cache_key():
    from deck_lab.api import CurvePoint, DiagnosticsRequest, _diagnostics_key

    plain = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    shaped = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")], curve=[CurvePoint(mv=1, share=0.5)]
    )
    assert _diagnostics_key(plain) != _diagnostics_key(shaped)
    # A repeated mana value resolves last-wins, exactly as the handler sees it.
    one = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")],
        curve=[CurvePoint(mv=1, share=0.2), CurvePoint(mv=1, share=0.5)],
    )
    assert _diagnostics_key(one) == _diagnostics_key(shaped)


def test_too_many_type_overrides_is_rejected():
    overrides = [{"type": "Creature", "low": 1.0}] * 17
    assert _post("/diagnostics", {"cards": _deck(1), "type_overrides": overrides}) == 422


def test_an_unknown_primary_type_is_rejected():
    """Loud rather than quiet: the scorer drops a type it has no target for,
    so a misspelling would otherwise come back as the archetype's corridor
    with nothing to say it was ignored."""
    body = {"cards": _deck(1), "type_overrides": [{"type": "Creatures", "low": 30.0}]}
    assert _post("/diagnostics", body) == 422


def test_type_overrides_reach_the_diagnostics_cache_key():
    from deck_lab.api import DiagnosticsRequest, TypeRange, _diagnostics_key

    plain = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    moved = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")],
        type_overrides=[TypeRange(type="Land", low=32.0, high=34.0)],
    )
    assert _diagnostics_key(plain) != _diagnostics_key(moved)
    # A repeated type resolves last-wins, exactly as the handler sees it.
    one = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")],
        type_overrides=[
            TypeRange(type="Land", low=30.0, high=31.0),
            TypeRange(type="Land", low=32.0, high=34.0),
        ],
    )
    assert _diagnostics_key(one) == _diagnostics_key(moved)


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


def test_search_validates_its_pool_query_like_the_advisor():
    """Same contract as the advisor endpoints: a query that will not compile
    is a 422 naming the fault, never a silently unrestricted answer."""
    response = client.post("/search", json={"pool_query": "year>=nope"})
    assert response.status_code == 422
    assert "four-digit year" in response.json()["detail"]["message"]


def test_oversized_search_pool_query_is_rejected_before_the_parser():
    assert _post("/search", {"pool_query": "x" * (MAX_QUERY_LENGTH + 1)}) == 422


# --- replace, fill, warm --------------------------------------------------


def test_oversized_replace_target_is_rejected():
    body = {"cards": _deck(1), "target_oracle_id": "x" * 65}
    assert _post("/replace", body) == 422


def test_too_many_replace_pinned_themes_is_rejected():
    body = {"cards": _deck(1), "target_oracle_id": "id-0", "pinned_themes": ["landfall"] * 65}
    assert _post("/replace", body) == 422


def test_too_many_replace_excluded_themes_is_rejected():
    body = {"cards": _deck(1), "target_oracle_id": "id-0", "excluded_themes": ["artifacts"] * 65}
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

    # The theme prefs round-trip through the model exactly like `SwapsRequest`
    # and `SuggestionsRequest`'s fields of the same name — Task 3 copied their
    # field definitions onto `ReplaceRequest`, so the same 64-entry cap and
    # plain pass-through apply here too.
    replace = ReplaceRequest(
        cards=entries[:1],
        target_oracle_id="id-0",
        pinned_themes=["landfall"] * 64,
        excluded_themes=["artifacts"] * 64,
    )
    assert len(replace.pinned_themes) == 64
    assert len(replace.excluded_themes) == 64


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


def _combo(name: str, colors: tuple[str, ...], missing: bool = True):
    """A one-piece-short combo whose missing card is `name`, in `colors`."""
    from deck_lab.spellbook import Combo

    return Combo(
        id=f"c-{name}",
        uses=("oracle-have", f"oracle-{name}"),
        card_names=("Sol Ring", name),
        produces=("Infinite colorless mana",),
        popularity=5,
        missing=(name,) if missing else (),
        color_identities=((), colors),
    )


def test_combos_keeps_a_missing_piece_inside_the_decks_colours(monkeypatch):
    """A Naya deck must never be offered a blue combo piece.

    Silent, like the retrieval channels' hard filter — and `complete` is a
    statement of fact about the deck, so it is never filtered.
    """
    from deck_lab import api as api_module

    blue = _combo("Tidespout Tyrant", ("U",))
    red = _combo("Dockside Extortionist", ("R",))
    monkeypatch.setattr(
        api_module,
        "run_combos",
        lambda *a, **k: {
            "included": [_combo("Basalt Monolith", (), missing=False)],
            "almost_included": [blue, red],
        },
    )

    body = {"cards": [{"oracle_id": "oracle-have"}]}
    naya = client.post("/combos", json={**body, "identity": ["R", "G", "W"]}).json()
    assert [combo["missing"][0] for combo in naya["one_short"]] == ["Dockside Extortionist"]
    # The deck completes it — nothing about its colours is being recommended.
    assert len(naya["complete"]) == 1

    # No claim and no command zone: nothing is known, so nothing is filtered.
    unscoped = client.post("/combos", json=body).json()
    assert len(unscoped["one_short"]) == 2


def test_combos_derives_the_colours_from_the_command_zone(monkeypatch):
    """`identity` absent falls back to the union of the commanders' own colours.

    A command zone the graph cannot place filters nothing, rather than reading
    an empty union as "colourless".
    """
    from deck_lab import api as api_module
    from deck_lab import graph

    monkeypatch.setattr(
        api_module,
        "run_combos",
        lambda *a, **k: {"included": [], "almost_included": [_combo("Tidespout Tyrant", ("U",))]},
    )
    body = {"cards": [{"oracle_id": "oracle-have"}], "commander_oracle_ids": ["cmd"]}

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: [{"color_identity": ["R", "G", "W"]}])
    assert client.post("/combos", json=body).json()["one_short"] == []

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: [{"color_identity": ["U", "B"]}])
    assert len(client.post("/combos", json=body).json()["one_short"]) == 1

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: [])
    assert len(client.post("/combos", json=body).json()["one_short"]) == 1


def test_combos_resolves_fallback_identities_against_the_card_graph(monkeypatch):
    """The HTTP-fallback combos carry no identities, and used to pass free.

    Spellbook's card objects have no colour identity, so a pre-ingest combo
    row answered `identity_of -> None` and the filter waved the piece through
    — the one documented hole in the colour gate, and the shape of "we
    suggested a three-colour card for a two-colour commander". The cards
    themselves are almost always in the graph, so the unknowns are resolved
    there; only a name the graph does not hold either is still kept.
    """
    from deck_lab import api as api_module
    from deck_lab import graph
    from deck_lab.spellbook import Combo

    def fallback_combo(name: str) -> Combo:
        return Combo(
            id=f"c-{name}",
            uses=("oracle-have", f"oracle-{name}"),
            card_names=("Sol Ring", name),
            produces=("Infinite colorless mana",),
            popularity=5,
            missing=(name,),
            # The fallback's shape: no identities at all.
            color_identities=(),
        )

    monkeypatch.setattr(
        api_module,
        "run_combos",
        lambda *a, **k: {
            "included": [],
            "almost_included": [
                fallback_combo("Tidespout Tyrant"),
                fallback_combo("Dockside Extortionist"),
                fallback_combo("Not In The Graph Either"),
            ],
        },
    )
    monkeypatch.setattr(
        graph,
        "identities_by_name",
        lambda names: {"Tidespout Tyrant": ["U"], "Dockside Extortionist": ["R"]},
    )

    body = {"cards": [{"oracle_id": "oracle-have"}], "identity": ["R", "G", "W"]}
    kept = [c["missing"][0] for c in client.post("/combos", json=body).json()["one_short"]]
    assert "Tidespout Tyrant" not in kept
    assert "Dockside Extortionist" in kept
    # Unknown to combos *and* to the graph: reported beats dropped on a fact
    # nobody has.
    assert "Not In The Graph Either" in kept


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
    assert _post("/combos", {"cards": _deck(1), "identity": six}) == 422


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
    assert _post("/combos", {"cards": _deck(1), **nine}) == 422


def test_commander_list_reaches_both_cache_keys():
    from deck_lab.api import SuggestionsRequest, _diagnostics_key, _suggestions_key

    plain = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")])
    partnered = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], commander_oracle_ids=["b"])
    assert _suggestions_key(plain) != _suggestions_key(partnered)

    bare = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    anchored = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")], commander_oracle_ids=["b"])
    assert _diagnostics_key(bare) != _diagnostics_key(anchored)


# --- Rule 0 deck sizes -------------------------------------------------------
# `deck_size` scales every quota the advisor grades against, so it is bounded
# like every numeric knob and must reach both cache keys — a 60-card deck must
# not be served the 99-card deck's cached answer.


def test_deck_size_bounds():
    for body in ({"deck_size": 0}, {"deck_size": 251}):
        assert _post("/diagnostics", {"cards": _deck(1), **body}) == 422
        assert _post("/suggestions", {"cards": _deck(1), **body}) == 422
        assert _post("/swaps", {"cards": _deck(1), **body}) == 422
        assert _post("/replace", {"cards": _deck(1), "target_oracle_id": "t", **body}) == 422
        assert _post("/fill", {"cards": _deck(1), **body}) == 422


def test_deck_size_reaches_both_cache_keys():
    from deck_lab.api import SuggestionsRequest, _diagnostics_key, _suggestions_key

    plain = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")])
    sixty = SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], deck_size=60)
    assert _suggestions_key(plain) != _suggestions_key(sixty)

    bare = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    resized = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")], deck_size=60)
    assert _diagnostics_key(bare) != _diagnostics_key(resized)


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
    monkeypatch.setattr(api_module, "_schedule_warm", lambda oid: warmed.append(oid) or "warming")

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


def test_post_suggestions_schedules_a_warm_for_every_cold_commander(monkeypatch):
    """Every seat is probed individually — a cold primary AND a cold extra
    each get their own background warm, still fire-and-forget."""
    from deck_lab import api as api_module
    from deck_lab import graph
    from deck_lab.suggestions import SuggestionReport

    warmed: list[str] = []
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(api_module, "_schedule_warm", lambda oid: warmed.append(oid) or "warming")

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

    body = {
        "cards": [{"oracle_id": "cold-cmdr-oid"}],
        "commander_oracle_id": "cold-cmdr-oid",
        "commander_oracle_ids": ["cold-extra-oid"],
    }
    response = client.post("/suggestions", json=body)

    assert response.status_code == 200
    assert warmed == ["cold-cmdr-oid", "cold-extra-oid"]
    assert seen["allow_network"] is False


# --- pool restriction -----------------------------------------------------


def test_a_pool_query_that_will_not_compile_is_refused():
    """Refused, not dropped: answering a restricted question with the whole
    pool reads as a filter that silently does nothing."""
    body = {"cards": [{"oracle_id": "a"}], "pool_query": "year>=20"}
    response = client.post("/suggestions", json=body)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "four-digit year" in detail["message"]
    assert detail["position"] == 0


def test_every_advisor_endpoint_validates_its_pool_query():
    bodies = {
        "/suggestions": {"cards": [{"oracle_id": "a"}]},
        "/swaps": {"cards": [{"oracle_id": "a"}]},
        "/replace": {"cards": [{"oracle_id": "a"}], "target_oracle_id": "a"},
        "/fill": {"cards": [{"oracle_id": "a"}]},
    }
    for path, body in bodies.items():
        assert _post(path, {**body, "pool_query": "year>=nope"}) == 422, path


def test_an_oversized_pool_query_is_rejected_before_the_parser():
    body = {"cards": [{"oracle_id": "a"}], "pool_query": "x" * (MAX_QUERY_LENGTH + 1)}
    assert _post("/suggestions", body) == 422


def test_the_pool_query_endpoint_checks_without_touching_the_graph():
    ok = client.post("/pool-query", json={"query": "eur<5 -t:artifact"})
    assert ok.json() == {"ok": True, "error": None, "position": None}

    bad = client.post("/pool-query", json={"query": "eur<5 year>=20"})
    body = bad.json()
    assert bad.status_code == 200
    assert body["ok"] is False
    assert body["position"] == 6


def test_unknown_fields_pass_the_pool_query_check():
    """Pasted Scryfall queries carry fields the graph does not store — the
    parser drops them, so the live check must not flag them."""
    ok = client.post("/pool-query", json={"query": "order:edhrec eur<5"})
    assert ok.json() == {"ok": True, "error": None, "position": None}


def test_an_empty_pool_query_is_valid():
    """The resting state of the input box, not a mistake."""
    assert client.post("/pool-query", json={"query": ""}).json()["ok"] is True
