"""edhtop16 parsing and join logic. Pure functions — no network, no Neo4j.

`_ingest_tournament` is the one exception: it touches `graph.resolve_names`
and `graph.upsert_tournament_decks`, both stubbed here the way
`test_cedh_profiles.py` stubs `deck_lab.graph.resolve_names` for
`cedh_profiles._resolve_deck` — `conftest.py`'s `no_live_graph` fixture fails
any test that instead falls through to a real driver.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from deck_lab.edhtop16 import (
    MIN_REQUEST_INTERVAL_SECONDS,
    DecklistCard,
    TournamentEntry,
    TournamentRef,
    _ingest_tournament,
    _months_ago,
    _names_to_resolve,
    _resolve_card,
    _resolve_commander_ids,
    _throttle,
    build_deck_row,
    parse_tournament_entries,
    split_commander_name,
)


def test_module_imports():
    """See `test_edhrec.py`'s twin: a bare import failure (e.g. a stray
    Python-2 `except A, B:`) should fail as an obviously-relevant test name,
    not a collection error buried in a long run."""
    import deck_lab.edhtop16  # noqa: F401


# --- split_commander_name ---------------------------------------------------


def test_split_commander_name_splits_a_partner_pair():
    assert split_commander_name("Thrasios, Triton Hero / Tymna the Weaver") == [
        "Thrasios, Triton Hero",
        "Tymna the Weaver",
    ]


def test_split_commander_name_leaves_a_solo_commander_alone():
    assert split_commander_name("Kinnan, Bonder Prodigy") == ["Kinnan, Bonder Prodigy"]


def test_split_commander_name_does_not_mis_split_a_double_faced_name():
    """edhtop16's partner separator is the *spaced* " / "; an unspaced "//"
    double-faced card name must survive untouched."""
    assert split_commander_name("Front Face // Back Face") == ["Front Face // Back Face"]


# --- _months_ago -------------------------------------------------------------


def test_months_ago_stays_within_the_year():
    assert _months_ago(3, today=datetime(2026, 9, 1, tzinfo=UTC)) == "2026-06-01"


def test_months_ago_wraps_into_the_prior_year():
    assert _months_ago(12, today=datetime(2026, 9, 1, tzinfo=UTC)) == "2025-09-01"


def test_months_ago_clamps_the_day_of_month():
    assert _months_ago(1, today=datetime(2026, 3, 31, tzinfo=UTC)) == "2026-02-28"


# --- parse_tournament_entries ------------------------------------------------


def _entries_payload(entries):
    return {
        "data": {
            "tournament": {
                "TID": "test-tournament",
                "name": "Test Tournament",
                "size": 40,
                "tournamentDate": "2026-08-30T17:00:00.000Z",
                "entries": entries,
            }
        }
    }


def _api_entry(entry_id, *, standing, commander_name, maindeck_names, wins=3, losses=1, draws=0):
    return {
        "id": entry_id,
        "standing": standing,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "commander": {"name": commander_name},
        "maindeck": [{"name": n, "oracleId": f"oid-{n}"} for n in maindeck_names],
    }


def test_parse_tournament_entries_reads_the_real_shape():
    payload = _entries_payload(
        [
            _api_entry(
                "Entry:1",
                standing=1,
                commander_name="Shorikai, Genesis Engine",
                maindeck_names=["Sol Ring", "Arcane Signet"],
            )
        ]
    )

    ref, entries = parse_tournament_entries(payload)

    assert ref == TournamentRef(
        tid="test-tournament", name="Test Tournament", date="2026-08-30T17:00:00.000Z", size=40
    )
    assert len(entries) == 1
    entry = entries[0]
    assert entry.entry_id == "Entry:1"
    assert entry.standing == 1
    assert entry.commander_name == "Shorikai, Genesis Engine"
    assert entry.maindeck == (
        DecklistCard(name="Sol Ring", oracle_id="oid-Sol Ring"),
        DecklistCard(name="Arcane Signet", oracle_id="oid-Arcane Signet"),
    )


def test_parse_tournament_entries_treats_empty_commander_name_as_none():
    """Observed live: one real entry carried `commander: {name: ""}`."""
    payload = _entries_payload(
        [_api_entry("Entry:2", standing=3, commander_name="", maindeck_names=["Swamp"])]
    )

    _, entries = parse_tournament_entries(payload)

    assert entries[0].commander_name is None


def test_parse_tournament_entries_missing_tournament_returns_empty():
    ref, entries = parse_tournament_entries({"data": {"tournament": None}, "errors": [{}]})

    assert ref is None
    assert entries == []


def test_parse_tournament_entries_skips_entries_without_an_id():
    payload = _entries_payload(
        [
            {
                "id": None,
                "standing": 5,
                "wins": 0,
                "losses": 0,
                "draws": 0,
                "commander": {"name": "X"},
                "maindeck": [],
            }
        ]
    )

    _, entries = parse_tournament_entries(payload)

    assert entries == []


# --- throttle ----------------------------------------------------------------


def test_throttle_sleeps_the_remaining_interval(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("deck_lab.edhtop16.time.monotonic", lambda: clock[0])
    monkeypatch.setattr("deck_lab.edhtop16._last_request_at", 99.7)

    slept = []
    monkeypatch.setattr("deck_lab.edhtop16.time.sleep", slept.append)

    _throttle()

    assert slept == [pytest.approx(MIN_REQUEST_INTERVAL_SECONDS - 0.3)]


def test_throttle_does_not_sleep_once_the_interval_has_passed(monkeypatch):
    clock = [200.0]
    monkeypatch.setattr("deck_lab.edhtop16.time.monotonic", lambda: clock[0])
    monkeypatch.setattr("deck_lab.edhtop16._last_request_at", 100.0)

    slept = []
    monkeypatch.setattr("deck_lab.edhtop16.time.sleep", slept.append)

    _throttle()

    assert slept == []


# --- card / commander resolution --------------------------------------------


def test_resolve_card_prefers_oracle_id_membership():
    card = DecklistCard(name="Sol Ring", oracle_id="real-oracle-id")
    assert _resolve_card(card, {"real-oracle-id"}, {}) == "real-oracle-id"


def test_resolve_card_falls_back_to_name_lookup():
    card = DecklistCard(name="Sol Ring", oracle_id="unknown-to-us")
    assert _resolve_card(card, set(), {"Sol Ring": "resolved-by-name"}) == "resolved-by-name"


def test_resolve_card_fails_both_ways():
    card = DecklistCard(name="Not A Real Card", oracle_id="")
    assert _resolve_card(card, set(), {}) is None


def test_resolve_commander_ids_resolves_both_halves_of_a_partner_pair():
    """The bug this replaced: keeping only the first resolvable half merged
    every "Rograkh / X" pairing onto plain Rograkh regardless of X. Both
    halves must resolve, in edhtop16's own order, so `commander_name`
    (the exact pairing) stays the only thing anyone groups meta-share on,
    while `RECOMMENDS_META` can still credit both cards."""
    name_lookup = {"Thrasios, Triton Hero": "id-thrasios", "Tymna the Weaver": "id-tymna"}
    resolved = _resolve_commander_ids("Thrasios, Triton Hero / Tymna the Weaver", name_lookup)
    assert resolved == ["id-thrasios", "id-tymna"]


def test_resolve_commander_ids_keeps_only_the_half_that_resolves():
    name_lookup = {"Tymna the Weaver": "id-tymna"}
    resolved = _resolve_commander_ids("Thrasios, Triton Hero / Tymna the Weaver", name_lookup)
    assert resolved == ["id-tymna"]


def test_resolve_commander_ids_empty_when_name_is_none():
    assert _resolve_commander_ids(None, {"whatever": "id"}) == []


def test_resolve_commander_ids_empty_when_neither_half_resolves():
    assert _resolve_commander_ids("A / B", {}) == []


def test_resolve_commander_ids_deduplicates_a_repeated_half():
    """Defensive: a malformed " / "-joined string repeating a name should
    not produce the same oracle_id twice in the list."""
    name_lookup = {"Kinnan, Bonder Prodigy": "id-kinnan"}
    resolved = _resolve_commander_ids(
        "Kinnan, Bonder Prodigy / Kinnan, Bonder Prodigy", name_lookup
    )
    assert resolved == ["id-kinnan"]


# --- build_deck_row -----------------------------------------------------------


def _entry(commander_name="Kinnan, Bonder Prodigy", maindeck_names=("Sol Ring", "Mystic Remora")):
    return TournamentEntry(
        entry_id="Entry:42",
        standing=2,
        wins=3,
        losses=1,
        draws=0,
        commander_name=commander_name,
        maindeck=tuple(DecklistCard(name=n, oracle_id=f"oid-{n}") for n in maindeck_names),
    )


def _ref():
    return TournamentRef(tid="test-tid", name="Test", date="2026-08-30T17:00:00.000Z", size=48)


def test_build_deck_row_shape_matches_the_format_agnostic_schema():
    known = {"oid-Sol Ring", "oid-Mystic Remora"}
    name_lookup = {"Kinnan, Bonder Prodigy": "id-kinnan"}

    row, stats = build_deck_row(_ref(), _entry(), known_oracle_ids=known, name_lookup=name_lookup)

    assert row == {
        "id": "Entry:42",
        "scene": "cedh",
        "format": "commander",
        "standing": 2,
        "tournament": "test-tid",
        "date": "2026-08-30T17:00:00.000Z",
        "players": 48,
        "commander_oracle_id": "id-kinnan",
        "commander_oracle_ids": ["id-kinnan"],
        "commander_name": "Kinnan, Bonder Prodigy",
        "archetype": None,
        "wins": 3,
        "losses": 1,
        "draws": 0,
        "cards": [
            {"oracle_id": "oid-Sol Ring", "qty": 1, "board": "main"},
            {"oracle_id": "oid-Mystic Remora", "qty": 1, "board": "main"},
        ],
    }
    assert stats.cards_total == 2
    assert stats.cards_joined == 2
    assert stats.commander_present is True
    assert stats.commander_resolved is True


def test_build_deck_row_keeps_both_halves_of_a_partner_pair_distinct():
    """The regression this whole round is about: a Kraum/Tymna deck must not
    collapse onto "Kraum" alone — `commander_oracle_ids` carries both, and
    `commander_name` keeps the exact pairing string a meta-share table
    should group on."""
    entry = _entry(commander_name="Kraum, Ludevic's Opus / Tymna the Weaver", maindeck_names=())
    name_lookup = {"Kraum, Ludevic's Opus": "id-kraum", "Tymna the Weaver": "id-tymna"}

    row, stats = build_deck_row(_ref(), entry, known_oracle_ids=set(), name_lookup=name_lookup)

    assert row["commander_oracle_id"] == "id-kraum"  # first half — the brief's singular field
    assert row["commander_oracle_ids"] == ["id-kraum", "id-tymna"]  # both — for RECOMMENDS_META
    assert row["commander_name"] == "Kraum, Ludevic's Opus / Tymna the Weaver"
    assert stats.commander_resolved is True


def test_build_deck_row_drops_unjoinable_cards_and_counts_the_failure():
    known: set[str] = set()
    name_lookup = {"Kinnan, Bonder Prodigy": "id-kinnan", "Sol Ring": "id-solring"}
    # "Mystic Remora" resolves by neither oracle_id nor name.

    row, stats = build_deck_row(_ref(), _entry(), known_oracle_ids=known, name_lookup=name_lookup)

    assert row["cards"] == [{"oracle_id": "id-solring", "qty": 1, "board": "main"}]
    assert stats.cards_total == 2
    assert stats.cards_joined == 1


def test_build_deck_row_commander_absent_is_not_an_unresolved_commander():
    """A blank `commander.name` (observed live) is data absence, distinct
    from a name edhtop16 gave us that failed to resolve."""
    row, stats = build_deck_row(
        _ref(), _entry(commander_name=None), known_oracle_ids=set(), name_lookup={}
    )

    assert row["commander_oracle_id"] is None
    assert row["commander_oracle_ids"] == []
    assert row["commander_name"] is None
    assert stats.commander_present is False
    assert stats.commander_resolved is False


def test_build_deck_row_is_deterministic_across_repeated_parses():
    """Stands in for a live MERGE-idempotency check (`conftest.py` refuses a
    real Neo4j connection here): if the same raw payload always parses and
    resolves to the same `id` and the same property dict, `MERGE (d:
    TournamentDeck {id: deck.id})` in `graph.upsert_tournament_decks` cannot
    produce a duplicate node on re-ingest."""
    known = {"oid-Sol Ring", "oid-Mystic Remora"}
    name_lookup = {"Kinnan, Bonder Prodigy": "id-kinnan"}

    row_a, _ = build_deck_row(_ref(), _entry(), known_oracle_ids=known, name_lookup=name_lookup)
    row_b, _ = build_deck_row(_ref(), _entry(), known_oracle_ids=known, name_lookup=name_lookup)

    assert row_a == row_b
    assert row_a["id"] == "Entry:42"


# --- _names_to_resolve --------------------------------------------------------


def test_names_to_resolve_skips_cards_already_known_by_oracle_id():
    entries = [_entry(commander_name=None, maindeck_names=("Sol Ring",))]
    wanted = _names_to_resolve(entries, known_oracle_ids={"oid-Sol Ring"})
    assert wanted == set()


def test_names_to_resolve_collects_unknown_cards_and_commander_halves():
    entries = [
        TournamentEntry(
            entry_id="Entry:1",
            standing=1,
            wins=1,
            losses=0,
            draws=0,
            commander_name="Thrasios, Triton Hero / Tymna the Weaver",
            maindeck=(DecklistCard(name="Sol Ring", oracle_id="unknown-oid"),),
        )
    ]
    wanted = _names_to_resolve(entries, known_oracle_ids=set())
    assert wanted == {"Sol Ring", "Thrasios, Triton Hero", "Tymna the Weaver"}


# --- _ingest_tournament: join-failure counting, stubbed graph ---------------


def test_ingest_tournament_counts_joins_and_writes_rows(monkeypatch):
    payload = _entries_payload(
        [
            _api_entry(
                "Entry:1",
                standing=1,
                commander_name="Kinnan, Bonder Prodigy",
                maindeck_names=["Sol Ring", "Unjoinable Card"],
            ),
            _api_entry(
                "Entry:2",
                standing=2,
                commander_name="",
                maindeck_names=["Sol Ring"],
            ),
        ]
    )
    monkeypatch.setattr("deck_lab.edhtop16.fetch_tournament", lambda tid, **kw: payload)
    monkeypatch.setattr(
        "deck_lab.graph.resolve_names",
        lambda names: {n: f"id-{n}" for n in names if n != "Unjoinable Card"},
    )
    written = []
    monkeypatch.setattr(
        "deck_lab.graph.upsert_tournament_decks", lambda rows: written.append(rows) or len(rows)
    )

    counts = _ingest_tournament(
        TournamentRef(tid="test-tid", name="Test", date="2026-08-30T00:00:00.000Z", size=40),
        top=16,
        known_oracle_ids=set(),
        force=False,
    )

    assert counts["decks"] == 2
    assert counts["cards_total"] == 3  # 2 + 1
    assert counts["cards_joined"] == 2  # "Unjoinable Card" dropped
    assert counts["commanders_resolved"] == 1
    assert counts["commanders_missing"] == 1
    assert counts["commanders_unresolved"] == 0
    assert len(written[0]) == 2


def test_ingest_tournament_writes_both_commander_oracle_ids_for_a_partner_pair(monkeypatch):
    payload = _entries_payload(
        [
            _api_entry(
                "Entry:1",
                standing=1,
                commander_name="Kraum, Ludevic's Opus / Tymna the Weaver",
                maindeck_names=["Sol Ring"],
            )
        ]
    )
    monkeypatch.setattr("deck_lab.edhtop16.fetch_tournament", lambda tid, **kw: payload)
    monkeypatch.setattr(
        "deck_lab.graph.resolve_names",
        lambda names: {
            "Sol Ring": "id-solring",
            "Kraum, Ludevic's Opus": "id-kraum",
            "Tymna the Weaver": "id-tymna",
        },
    )
    written = []
    monkeypatch.setattr(
        "deck_lab.graph.upsert_tournament_decks", lambda rows: written.append(rows) or len(rows)
    )

    _ingest_tournament(
        TournamentRef(tid="test-tid", name="Test", date="2026-08-30T00:00:00.000Z", size=40),
        top=16,
        known_oracle_ids=set(),
        force=False,
    )

    [deck] = written[0]
    assert deck["commander_oracle_ids"] == ["id-kraum", "id-tymna"]
    assert deck["commander_oracle_id"] == "id-kraum"


def test_ingest_tournament_returns_empty_counts_when_not_found(monkeypatch):
    monkeypatch.setattr("deck_lab.edhtop16.fetch_tournament", lambda tid, **kw: None)

    counts = _ingest_tournament(
        TournamentRef(tid="missing", name="", date="", size=0),
        top=16,
        known_oracle_ids=set(),
        force=False,
    )

    assert counts == {
        "decks": 0,
        "cards_total": 0,
        "cards_joined": 0,
        "commanders_resolved": 0,
        "commanders_missing": 0,
        "commanders_unresolved": 0,
    }
