"""EDHREC parsing. Pure functions — no network."""

from __future__ import annotations

import json
import os
import time
from types import SimpleNamespace

import pytest

from deck_lab.edhrec import (
    NEGATIVE_TTL_SECONDS,
    THEME_TAG_SLUGS,
    CommanderFacts,
    Recommendation,
    _cache_path,
    _theme_cache_path,
    is_tombstoned,
    load_bracket_counts,
    parse_bracket_counts,
    parse_commander_facts,
    parse_curve,
    parse_recommendations,
    parse_taglinks,
    parse_type_counts,
    slugify,
)
from deck_lab.themes import THEMES


def test_module_imports():
    """A dedicated import, not just the module-level `from ... import` above.

    That import already makes a broken module fail collection, but as a
    collection error rather than a named test failure — easy to miss in a
    long ruff+pytest run. This gives a syntax regression (e.g. a Python-2
    `except X, Y:` clause) a clear, obviously-relevant failure name.
    """
    import deck_lab.edhrec  # noqa: F401


def test_slugify_strips_punctuation():
    assert slugify("Atraxa, Praetors' Voice") == "atraxa-praetors-voice"


def test_slugify_handles_accents():
    assert slugify("Jötun Grunt") == "jotun-grunt"


def test_slugify_uses_front_face_only():
    """EDHREC pages are keyed on the front face of a double-faced commander."""
    assert slugify("Brisela, Voice of Nightmares // Something") == "brisela-voice-of-nightmares"


def test_slugify_collapses_repeated_separators():
    assert slugify("Rograkh, Son of Rohgahh") == "rograkh-son-of-rohgahh"


def test_every_mapped_theme_slug_names_a_real_theme():
    """A typo'd theme id here would raise deep inside `resolve_type_targets`,
    one commander page late — the same failure mode `test_agreement.py`
    guards against for `CHECK_SLUGS`."""
    assert set(THEME_TAG_SLUGS) <= set(THEMES)


def _payload(cardlists):
    return {"container": {"json_dict": {"cardlists": cardlists}}}


def test_parses_cardviews_with_synergy():
    payload = _payload(
        [
            {
                "tag": "highsynergycards",
                "cardviews": [
                    {
                        "id": "abc",
                        "name": "Evolution Sage",
                        "synergy": 0.24,
                        "num_decks": 100,
                        "potential_decks": 400,
                    }
                ],
            }
        ]
    )
    [rec] = parse_recommendations(payload)

    assert rec.name == "Evolution Sage"
    assert rec.scryfall_id == "abc"
    assert rec.synergy == 0.24
    assert rec.inclusion_rate == 0.25
    assert rec.tag == "highsynergycards"


def test_deduplicates_cards_across_lists():
    """A card appears in both `topcards` and its type list; it is one edge."""
    view = {"id": "a", "name": "Sol Ring", "synergy": 0.1, "num_decks": 1, "potential_decks": 2}
    payload = _payload(
        [
            {"tag": "topcards", "cardviews": [view]},
            {"tag": "manaartifacts", "cardviews": [view]},
        ]
    )

    assert len(parse_recommendations(payload)) == 1


def test_skips_new_cards_list():
    """`newcards` is a recency feed, not a recommendation."""
    payload = _payload(
        [{"tag": "newcards", "cardviews": [{"id": "a", "name": "X", "synergy": 0.5}]}]
    )
    assert parse_recommendations(payload) == []


def test_missing_keys_do_not_raise():
    """Schema drift should lose a list, never the commander."""
    assert parse_recommendations({}) == []
    assert parse_recommendations({"container": {}}) == []
    assert parse_recommendations(_payload([{"tag": "x"}])) == []


def test_inclusion_rate_is_zero_without_potential_decks():
    rec = Recommendation("X", "a", 0.1, num_decks=5, potential_decks=0, tag="t")
    assert rec.inclusion_rate == 0.0


# --- type distribution ----------------------------------------------------


def _type_payload(**overrides):
    fields = {
        "creature": 29,
        "instant": 9,
        "sorcery": 9,
        "artifact": 9,
        "enchantment": 6,
        "planeswalker": 1,
        "battle": 0,
        "land": 36,
    }
    fields.update(overrides)
    return fields


def test_type_counts_read_the_top_level_integers():
    counts = parse_type_counts(_type_payload())

    assert counts is not None
    assert counts.total == 99
    assert counts.counts["Creature"] == 29
    assert counts.counts["Land"] == 36


def test_type_counts_normalise_a_page_that_sums_to_100():
    """homer-the-hermit's page sums to 100; the counts rescale to 99."""
    counts = parse_type_counts(_type_payload(creature=30))

    assert counts.total == 100
    assert counts.counts["Creature"] == 30 * 99 / 100
    assert sum(counts.counts.values()) == 99


def test_type_counts_missing_field_reads_as_schema_moved():
    """All or nothing: a partial distribution would skew every target."""
    payload = _type_payload()
    del payload["battle"]

    assert parse_type_counts(payload) is None


def test_type_counts_all_zero_reads_as_schema_moved():
    assert parse_type_counts(_type_payload(**dict.fromkeys(_type_payload(), 0))) is None


def test_taglinks_carry_slug_label_and_count():
    payload = {
        "panels": {
            "taglinks": [
                {"slug": "aristocrats", "value": "Aristocrats", "count": 2615},
                {"slug": "no-count"},
                {"value": "no slug is skipped"},
            ]
        }
    }
    links = parse_taglinks(payload)

    assert [(t.slug, t.label, t.count) for t in links] == [
        ("aristocrats", "Aristocrats", 2615),
        ("no-count", "no-count", 0),
    ]


def test_taglinks_missing_panel_is_empty_not_an_error():
    assert parse_taglinks({}) == []


# --- bracket counts ---------------------------------------------------------
# `bracket_counts["5"]` is the sample size behind a commander's `/cedh`
# subpage (CEDH-PLAN.md's finding, verified on five real commanders) — the
# gate `resolve_type_targets`'s tier 0 uses to decide whether that subpage is
# trustworthy enough to condition on.


def test_bracket_counts_reads_the_top_level_panel():
    payload = {"bracket_counts": {"1": 12, "2": 340, "3": 1204, "4": 980, "5": 156}}

    assert parse_bracket_counts(payload) == {1: 12, 2: 340, 3: 1204, 4: 980, 5: 156}


def test_bracket_counts_missing_panel_is_empty_not_an_error():
    assert parse_bracket_counts({}) == {}


def test_bracket_counts_tolerates_junk_values():
    """A schema move loses this one signal, not the page — a non-numeric key
    or value is dropped rather than raising."""
    payload = {
        "bracket_counts": {
            "5": 156,
            "not-a-bracket": 40,
            "3": "not-a-count",
            "4": None,
        }
    }

    assert parse_bracket_counts(payload) == {5: 156}


def test_bracket_counts_non_dict_panel_is_empty():
    assert parse_bracket_counts({"bracket_counts": "not a dict"}) == {}


def test_curve_folds_the_tail_into_six_plus():
    """EDHREC keys run to '12'; our buckets treat 6 as '6 or more'."""
    curve = parse_curve({"panels": {"mana_curve": {"1": 4, "6": 6, "7": 5, "12": 1}}})

    assert curve[1] == 4
    assert curve[6] == 12
    assert set(curve) == set(range(7))


def test_curve_missing_panel_is_none():
    assert parse_curve({}) is None


def test_theme_subpage_cache_sits_beside_the_commander_page():
    """A subdirectory per commander — never a collision with `<slug>.json`."""
    flat = _cache_path("muldrotha-the-gravetide")
    themed = _theme_cache_path("muldrotha-the-gravetide", "spellslinger")

    assert themed.parent == flat.parent / "muldrotha-the-gravetide"
    assert themed.name == "spellslinger.json"


# --- negative caching ------------------------------------------------------
# `fetch_commander` writes a sidecar `.missing` tombstone on 403/404, so a
# dead or blocked commander does not re-fetch synchronously on every
# `/suggestions` call for it (Task 10).


class _FakeResponse:
    """Just enough of an httpx.Response for `fetch_commander` to consume."""

    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass  # every fake response here is either a 403/404 or a genuine 200


@pytest.fixture
def stubbed_edhrec(tmp_path, monkeypatch):
    """Point the disk cache at a temp dir and script `httpx.get`'s replies,
    in call order, recording how many actually happened."""
    from deck_lab import edhrec

    monkeypatch.setattr(edhrec.settings, "data_dir", tmp_path)

    responses: list[_FakeResponse] = []
    calls: list[str] = []

    def fake_get(url, **kwargs):
        calls.append(url)
        return responses.pop(0)

    monkeypatch.setattr(edhrec.httpx, "get", fake_get)

    return SimpleNamespace(edhrec=edhrec, responses=responses, calls=calls)


def test_a_403_writes_a_tombstone_and_the_next_call_skips_the_network(stubbed_edhrec):
    edhrec = stubbed_edhrec.edhrec
    stubbed_edhrec.responses.append(_FakeResponse(403))

    first = edhrec.fetch_commander("no-page")
    second = edhrec.fetch_commander("no-page")

    assert first is None
    assert second is None
    assert len(stubbed_edhrec.calls) == 1  # the second call never hit the network
    assert edhrec._cache_path("no-page").with_suffix(".missing").exists()


def test_a_stale_tombstone_is_deleted_and_the_fetch_retried(stubbed_edhrec):
    edhrec = stubbed_edhrec.edhrec
    stubbed_edhrec.responses.append(_FakeResponse(404))
    edhrec.fetch_commander("no-page")

    tombstone = edhrec._cache_path("no-page").with_suffix(".missing")
    stale = time.time() - edhrec.NEGATIVE_TTL_SECONDS - 1
    os.utime(tombstone, (stale, stale))

    stubbed_edhrec.responses.append(_FakeResponse(404))
    edhrec.fetch_commander("no-page")

    assert len(stubbed_edhrec.calls) == 2  # the stale tombstone did not block the retry


def test_a_later_200_removes_the_tombstone_and_caches_normally(stubbed_edhrec):
    edhrec = stubbed_edhrec.edhrec
    stubbed_edhrec.responses.append(_FakeResponse(403))
    edhrec.fetch_commander("comes-back")

    tombstone = edhrec._cache_path("comes-back").with_suffix(".missing")
    stale = time.time() - edhrec.NEGATIVE_TTL_SECONDS - 1
    os.utime(tombstone, (stale, stale))

    stubbed_edhrec.responses.append(_FakeResponse(200, payload={"ok": True}))
    result = edhrec.fetch_commander("comes-back")

    assert result == {"ok": True}
    assert not tombstone.exists()
    assert edhrec._cache_path("comes-back").exists()


# --- load_bracket_counts -----------------------------------------------------
# Disk-only, mirroring `load_type_counts`'s no-`theme_slug` branch: the bare
# diagnostics endpoint must stay off the network.


def test_load_bracket_counts_reads_the_cached_page(tmp_path, monkeypatch):
    monkeypatch.setattr("deck_lab.edhrec.settings.data_dir", tmp_path)
    path = _cache_path(slugify("Najeela, the Blade-Blossom"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"bracket_counts": {"5": 1258}}))

    assert load_bracket_counts("Najeela, the Blade-Blossom") == {5: 1258}


def test_load_bracket_counts_is_empty_for_an_uncached_commander(tmp_path, monkeypatch):
    monkeypatch.setattr("deck_lab.edhrec.settings.data_dir", tmp_path)

    assert load_bracket_counts("Never Fetched") == {}


# --- is_tombstoned ----------------------------------------------------------
# Distinct from "cold": a commander nobody has asked EDHREC about yet has no
# tombstone at all, and that difference is what lets `suggest()` (Task 12)
# say "on its way" instead of "missing" for one but not the other.


def test_is_tombstoned_is_false_when_nothing_was_ever_fetched(tmp_path, monkeypatch):
    monkeypatch.setattr("deck_lab.edhrec.settings.data_dir", tmp_path)
    assert is_tombstoned("Never Asked About") is False


def test_is_tombstoned_is_true_for_a_fresh_tombstone(tmp_path, monkeypatch):
    monkeypatch.setattr("deck_lab.edhrec.settings.data_dir", tmp_path)
    tombstone = _cache_path(slugify("Blocked Commander")).with_suffix(".missing")
    tombstone.parent.mkdir(parents=True, exist_ok=True)
    tombstone.write_text("404")

    assert is_tombstoned("Blocked Commander") is True


def test_is_tombstoned_is_false_once_the_tombstone_goes_stale(tmp_path, monkeypatch):
    monkeypatch.setattr("deck_lab.edhrec.settings.data_dir", tmp_path)
    tombstone = _cache_path(slugify("Blocked Commander")).with_suffix(".missing")
    tombstone.parent.mkdir(parents=True, exist_ok=True)
    tombstone.write_text("404")
    stale = time.time() - NEGATIVE_TTL_SECONDS - 1
    os.utime(tombstone, (stale, stale))

    assert is_tombstoned("Blocked Commander") is False


# --- the pre-warm walk ----------------------------------------------------
# The only bulk access to an unofficial API in the codebase, so its throttling
# and its refusal to die on one bad commander are both tested behaviour.


def test_parse_commander_facts_reads_salt_decks_and_budget():
    payload = {
        "budget_counts": {"budget": 341, "middle": 2737, "expensive": 341},
        "container": {"json_dict": {"card": {"salt": 0.75, "num_decks": 3419}}},
    }

    facts = parse_commander_facts(payload)

    assert facts == CommanderFacts(salt=0.75, decks=3419, budget=(341, 2737, 341))


def test_parse_commander_facts_tolerates_a_moved_schema():
    facts = parse_commander_facts({})

    assert facts == CommanderFacts(salt=None, decks=0, budget=(0, 0, 0))


@pytest.fixture
def warm(monkeypatch):
    """Drive `warm_top_commanders` against fakes, recording sleeps and fetches.

    Also wires the optional cEDH pass (`cedh=True`): `bracket5` controls what
    `load_bracket_counts` reports for a name (default 0, i.e. below the
    floor — a test that wants the pass to fire must opt a name in), and the
    `cedh_*` state mirrors the base pass's `cached`/`in_graph`/`raises` sets
    one-for-one so its tests read the same way.
    """
    from deck_lab import edhrec, graph
    from deck_lab.type_targets import CEDH_MIN_DECKS

    state = {
        "sleeps": [],
        "ingested": [],
        "cached": set(),
        "in_graph": set(),
        "raises": set(),
        "no_facts": set(),
        "bracket5": {},
        "cedh_ingested": [],
        "cedh_cached": set(),
        "cedh_in_graph": set(),
        "cedh_raises": set(),
        "min_decks": CEDH_MIN_DECKS,
    }

    def fake_ingest(name: str, *, force: bool = False) -> dict[str, int]:
        state["ingested"].append(name)
        if name in state["raises"]:
            raise RuntimeError("edhrec exploded")
        return {"fetched": 0 if name.startswith("no-page") else 200, "linked": 1}

    def fake_ingest_cedh(name: str, *, force: bool = False) -> dict[str, int]:
        state["cedh_ingested"].append(name)
        if name in state["cedh_raises"]:
            raise RuntimeError("edhrec cedh exploded")
        return {"fetched": 0 if name.startswith("no-cedh-page") else 150, "linked": 1}

    monkeypatch.setattr(edhrec, "ingest_commander", fake_ingest)
    monkeypatch.setattr(edhrec, "ingest_commander_cedh", fake_ingest_cedh)
    monkeypatch.setattr(edhrec, "is_cached", lambda name: name in state["cached"])
    monkeypatch.setattr(edhrec, "_theme_cached", lambda slug, tag: slug in state["cedh_cached"])
    monkeypatch.setattr(
        edhrec, "load_bracket_counts", lambda name: {5: state["bracket5"].get(name, 0)}
    )
    monkeypatch.setattr(edhrec.time, "sleep", lambda s: state["sleeps"].append(s))
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: oid in state["in_graph"])
    monkeypatch.setattr(
        graph,
        "has_commander_facts",
        lambda oid: oid in state["in_graph"] and oid not in state["no_facts"],
    )
    monkeypatch.setattr(
        graph, "has_recommendations_cedh", lambda oid: oid in state["cedh_in_graph"]
    )

    def run(names: list[str], **kwargs) -> dict[str, int]:
        rows = [{"oracle_id": f"oid-{n}", "name": n} for n in names]
        monkeypatch.setattr(graph, "top_commanders", lambda limit: rows[:limit])
        return edhrec.warm_top_commanders(len(names), **kwargs)

    state["run"] = run
    return state


def test_warm_fetches_cold_commanders_and_throttles(warm):
    counts = warm["run"](["Atraxa", "Krenko"], delay_seconds=0.5)

    assert counts["fetched"] == 2
    assert warm["sleeps"] == [0.5, 0.5]  # one pause per network fetch


def test_warm_skips_commanders_already_cached_and_linked(warm):
    warm["cached"].add("Atraxa")
    warm["in_graph"].add("oid-Atraxa")

    counts = warm["run"](["Atraxa"])

    assert counts == {
        "considered": 1,
        "fetched": 0,
        "from_disk": 0,
        "skipped": 1,
        "no_page": 0,
        "failed": 0,
    }
    assert warm["ingested"] == []
    assert warm["sleeps"] == []


def test_warm_reingests_a_commander_missing_its_dating_facts(warm):
    warm["cached"].add("Atraxa")
    warm["in_graph"].add("oid-Atraxa")
    warm["no_facts"].add("oid-Atraxa")

    counts = warm["run"](["Atraxa"])

    assert warm["ingested"] == ["Atraxa"]
    assert counts["from_disk"] == 1
    assert warm["sleeps"] == []


def test_warm_reingests_from_disk_without_sleeping(warm):
    """A warm cache over a re-ingested graph still needs its edges rewritten."""
    warm["cached"].add("Atraxa")  # on disk, but absent from the graph

    counts = warm["run"](["Atraxa"])

    assert counts["from_disk"] == 1
    assert counts["fetched"] == 0
    assert warm["ingested"] == ["Atraxa"]
    assert warm["sleeps"] == []  # no network, no politeness delay


def test_warm_counts_commanders_edhrec_does_not_know(warm):
    counts = warm["run"](["no-page-Bob"])

    assert counts["no_page"] == 1
    assert counts["fetched"] == 0


def test_warm_survives_a_failing_commander(warm):
    warm["raises"].add("Krenko")

    counts = warm["run"](["Krenko", "Atraxa"])

    assert counts["failed"] == 1
    assert counts["fetched"] == 1  # the walk continued
    assert warm["sleeps"] == [1.0, 1.0]  # and a failure is still throttled


# --- the optional cEDH pass -------------------------------------------------
# `cedh=True` adds `_warm_cedh_pass` after the base pass for each commander,
# gated on the same `bracket_counts["5"] >= CEDH_MIN_DECKS` floor `suggest()`
# and `resolve_type_targets` use — EDHREC serves a `/cedh` page for every
# commander, including ones with no real cEDH presence.


def test_warm_cedh_pass_is_off_by_default(warm):
    """`cedh=False` (the default) must read exactly as it did before the
    parameter existed — same six keys, no cEDH network activity at all."""
    warm["bracket5"]["Atraxa"] = 5_000  # would clear the floor if asked

    counts = warm["run"](["Atraxa"])

    assert counts == {
        "considered": 1,
        "fetched": 1,
        "from_disk": 0,
        "skipped": 0,
        "no_page": 0,
        "failed": 0,
    }
    assert warm["cedh_ingested"] == []


def test_warm_cedh_fetches_commanders_above_the_floor(warm):
    warm["bracket5"]["Atraxa"] = warm["min_decks"]  # exactly at the floor: clears it

    counts = warm["run"](["Atraxa"], cedh=True)

    assert counts["cedh_fetched"] == 1
    assert counts["cedh_below_floor"] == 0
    assert warm["cedh_ingested"] == ["Atraxa"]


def test_warm_cedh_skips_commanders_below_the_floor(warm):
    """EDHREC serves a `/cedh` page for every commander, including ones with
    no real cEDH presence — the floor exists so the walk does not spend its
    budget fetching noise for an obscure or joke commander."""
    warm["bracket5"]["Atraxa"] = warm["min_decks"] - 1

    counts = warm["run"](["Atraxa"], cedh=True)

    assert counts["cedh_below_floor"] == 1
    assert counts["cedh_fetched"] == 0
    assert warm["cedh_ingested"] == []


def test_warm_cedh_skips_commanders_already_cached_and_linked(warm):
    warm["bracket5"]["Atraxa"] = warm["min_decks"]
    warm["cedh_cached"].add("atraxa")  # _theme_cached is keyed on the slug
    warm["cedh_in_graph"].add("oid-Atraxa")

    counts = warm["run"](["Atraxa"], cedh=True)

    assert counts["cedh_skipped"] == 1
    assert counts["cedh_fetched"] == 0
    assert warm["cedh_ingested"] == []


def test_warm_cedh_counts_a_commander_with_no_cedh_page(warm):
    warm["bracket5"]["no-cedh-page-Bob"] = warm["min_decks"]

    counts = warm["run"](["no-cedh-page-Bob"], cedh=True)

    assert counts["cedh_no_page"] == 1
    assert counts["cedh_fetched"] == 0


def test_warm_cedh_survives_a_failing_commander(warm):
    warm["bracket5"]["Krenko"] = warm["min_decks"]
    warm["bracket5"]["Atraxa"] = warm["min_decks"]
    warm["cedh_raises"].add("Krenko")

    counts = warm["run"](["Krenko", "Atraxa"], cedh=True)

    assert counts["cedh_failed"] == 1
    assert counts["cedh_fetched"] == 1  # the walk continued


# --- the commander list -----------------------------------------------------
# Pages EDHREC's deck-sorted commander list down to a floor, so new commanders
# a low Scryfall rank buries still get warmed.


def _first_page(views: list[tuple[str, int]], more: str | None) -> dict:
    cardviews = [{"name": name, "num_decks": decks} for name, decks in views]
    return {"container": {"json_dict": {"cardlists": [{"cardviews": cardviews, "more": more}]}}}


def _later_page(views: list[tuple[str, int]], more: str | None) -> dict:
    return {"cardviews": [{"name": n, "num_decks": d} for n, d in views], "more": more}


def test_parse_commander_list_reads_the_nested_first_page():
    from deck_lab.edhrec import ListedCommander, parse_commander_list

    payload = _first_page([("Atraxa", 900)], "commanders/year-past2years-1.json")

    entries, more = parse_commander_list(payload)

    assert entries == [ListedCommander("Atraxa", 900)]
    assert more == "commanders/year-past2years-1.json"


def test_parse_commander_list_reads_a_later_page_and_its_end():
    from deck_lab.edhrec import ListedCommander, parse_commander_list

    entries, more = parse_commander_list(_later_page([("Krenko", 50)], None))

    assert entries == [ListedCommander("Krenko", 50)]
    assert more is None


def test_parse_commander_list_tolerates_a_moved_schema():
    from deck_lab.edhrec import parse_commander_list

    assert parse_commander_list({}) == ([], None)
    assert parse_commander_list({"container": {"json_dict": None}}) == ([], None)


@pytest.fixture
def list_pages(monkeypatch):
    """Serve fake list pages by path, recording fetches and sleeps."""
    from deck_lab import edhrec

    state = {"pages": {}, "fetched": [], "sleeps": [], "cached": set()}

    def fake_fetch(page: str) -> dict:
        state["fetched"].append(page)
        return state["pages"][page]

    monkeypatch.setattr(edhrec, "fetch_commander_list_page", fake_fetch)
    monkeypatch.setattr(edhrec, "_list_cached", lambda page: page in state["cached"])
    monkeypatch.setattr(edhrec.time, "sleep", lambda s: state["sleeps"].append(s))
    return state


def test_listed_commanders_stops_at_the_page_below_the_floor(list_pages):
    from deck_lab.edhrec import LIST_FIRST_PAGE, listed_commanders

    list_pages["pages"] = {
        LIST_FIRST_PAGE: _first_page([("A", 900), ("B", 60)], "commanders/p-1.json"),
        "commanders/p-1.json": _later_page([("C", 41), ("D", 39)], "commanders/p-2.json"),
        "commanders/p-2.json": _later_page([("E", 30)], None),
    }

    listed = listed_commanders(40, delay_seconds=0.5)

    assert [entry.name for entry in listed] == ["A", "B", "C"]
    assert list_pages["fetched"] == [LIST_FIRST_PAGE, "commanders/p-1.json"]
    assert list_pages["sleeps"] == [0.5, 0.5]


def test_listed_commanders_does_not_sleep_on_cached_pages(list_pages):
    from deck_lab.edhrec import LIST_FIRST_PAGE, listed_commanders

    list_pages["pages"] = {LIST_FIRST_PAGE: _first_page([("A", 900)], None)}
    list_pages["cached"].add(LIST_FIRST_PAGE)

    assert [entry.name for entry in listed_commanders(40)] == ["A"]
    assert list_pages["sleeps"] == []


def test_listed_commanders_refuses_an_unexpected_next_page(list_pages):
    from deck_lab.edhrec import LIST_FIRST_PAGE, listed_commanders

    list_pages["pages"] = {LIST_FIRST_PAGE: _first_page([("A", 900)], "../../elsewhere")}

    assert [entry.name for entry in listed_commanders(40)] == ["A"]
    assert list_pages["fetched"] == [LIST_FIRST_PAGE]


def test_match_listed_maps_names_faces_and_pairs():
    from deck_lab.edhrec import ListedCommander, match_listed

    commanders = [
        {"oracle_id": "oid-esika", "name": "Esika, God of the Tree // The Prismatic Bridge"},
        {"oracle_id": "oid-akroma", "name": "Akroma, Vision of Ixidor"},
        {"oracle_id": "oid-jeska", "name": "Jeska, Thrice Reborn"},
        {"oracle_id": "oid-atraxa", "name": "Atraxa, Praetors' Voice"},
    ]
    listed = [
        ListedCommander("Esika, God of the Tree // The Prismatic Bridge", 900),
        ListedCommander("atraxa, praetors' voice", 800),
        ListedCommander("Akroma, Vision of Ixidor // Jeska, Thrice Reborn", 50),
        ListedCommander("Esika, God of the Tree", 45),  # front face, already matched
        ListedCommander("Not In The Graph", 44),
    ]

    matched = match_listed(listed, commanders)

    assert [row["oracle_id"] for row in matched] == [
        "oid-esika",
        "oid-atraxa",
        "oid-akroma",
        "oid-jeska",
    ]


def test_warm_adds_listed_commanders_the_ranked_walk_misses(warm, monkeypatch):
    from deck_lab import edhrec, graph
    from deck_lab.edhrec import ListedCommander

    listed = [ListedCommander("Atraxa", 900), ListedCommander("Newcomer", 45)]
    monkeypatch.setattr(edhrec, "listed_commanders", lambda floor, delay_seconds: listed)
    monkeypatch.setattr(
        graph,
        "commander_names",
        lambda: [{"oracle_id": f"oid-{n}", "name": n} for n in ("Atraxa", "Newcomer")],
    )

    counts = warm["run"](["Atraxa"], min_decks=40)

    assert warm["ingested"] == ["Atraxa", "Newcomer"]
    assert counts["listed"] == 1
    assert counts["considered"] == 2


def test_warm_keeps_the_ranked_walk_when_the_list_fails(warm, monkeypatch):
    from deck_lab import edhrec

    def broken(floor, delay_seconds):
        raise RuntimeError("edhrec list exploded")

    monkeypatch.setattr(edhrec, "listed_commanders", broken)

    counts = warm["run"](["Atraxa"], min_decks=40)

    assert warm["ingested"] == ["Atraxa"]
    assert counts["listed"] == 0


def test_dating_pool_applies_the_deck_floor(monkeypatch):
    from contextlib import contextmanager

    from deck_lab import graph
    from deck_lab.dating import POOL_MIN_DECKS

    seen: dict = {}

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def run(self, query, **params):
            seen.update(params, query=query)
            return []

    @contextmanager
    def fake_driver():
        yield SimpleNamespace(session=lambda database: FakeSession())

    monkeypatch.setattr(graph, "driver", fake_driver)

    assert graph.dating_pool() == []
    assert seen["min_decks"] == POOL_MIN_DECKS
    assert "c.edhrec_decks >= $min_decks" in seen["query"]
