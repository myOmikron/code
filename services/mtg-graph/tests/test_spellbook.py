"""Commander Spellbook parsing. Pure functions — no network."""

from __future__ import annotations

import json

from deck_lab.spellbook import _combos_from_rows, _parse_combos, iter_variants, parse_variant


def _entry(names, produces=("Infinite mana",), popularity=10):
    return {
        "id": "1-2--3",
        "uses": [{"card": {"oracleId": f"oid-{n}", "name": n}} for n in names],
        "produces": [{"feature": {"name": p}} for p in produces],
        "bracketTag": "C",
        "popularity": popularity,
    }


def test_parses_pieces_and_results():
    [combo] = _parse_combos([_entry(["Sol Ring", "Hullbreaker Horror"])], deck=frozenset())

    assert combo.card_names == ("Sol Ring", "Hullbreaker Horror")
    assert combo.uses == ("oid-Sol Ring", "oid-Hullbreaker Horror")
    assert combo.produces == ("Infinite mana",)


def test_missing_is_computed_against_the_deck():
    """The API has no `missing` field — we diff it ourselves."""
    [combo] = _parse_combos(
        [_entry(["Sol Ring", "Hullbreaker Horror"])],
        deck=frozenset({"Sol Ring"}),
    )

    assert combo.missing == ("Hullbreaker Horror",)
    assert not combo.is_complete


def test_combo_fully_in_deck_is_complete():
    [combo] = _parse_combos(
        [_entry(["Sol Ring", "Hullbreaker Horror"])],
        deck=frozenset({"Sol Ring", "Hullbreaker Horror"}),
    )

    assert combo.missing == ()
    assert combo.is_complete


def test_cards_without_oracle_id_are_skipped():
    entry = {"id": "x", "uses": [{"card": {"name": "Nameless"}}], "produces": []}
    [combo] = _parse_combos([entry], deck=frozenset())

    assert combo.uses == ()
    assert combo.card_names == ()


def test_empty_and_malformed_entries_do_not_raise():
    assert _parse_combos([], deck=frozenset()) == []
    [combo] = _parse_combos([{"id": "x"}], deck=frozenset())
    assert combo.produces == ()


# --- bulk-export variants -------------------------------------------------


def _variant(**overrides):
    base = {
        "id": "1-2",
        "status": "OK",
        "legalities": {"commander": True},
        "requires": [],
        "uses": [
            {"card": {"oracleId": "oid-a", "name": "A"}, "quantity": 1},
            {"card": {"oracleId": "oid-b", "name": "B"}, "quantity": 2},
        ],
        "produces": [{"feature": {"name": "Infinite mana"}}],
        "bracketTag": "C",
        "popularity": 42,
    }
    return {**base, **overrides}


def test_parse_variant_extracts_the_ingest_row():
    row = parse_variant(_variant())

    assert row["id"] == "1-2"
    assert row["uses"] == ["oid-a", "oid-b"]
    assert row["names"] == ["A", "B"]
    assert row["produces"] == ["Infinite mana"]
    assert row["popularity"] == 42
    # Quantity 2 on one piece still counts one piece — deck identity is a set.
    assert row["pieces"] == 2


def test_parse_variant_scope():
    """Not approved, not commander-legal, template-needing, or unjoinable — all out."""
    assert parse_variant(_variant(status="D")) is None
    assert parse_variant(_variant(legalities={"commander": False})) is None
    assert parse_variant(_variant(requires=[{"template": "A creature"}])) is None
    assert parse_variant(_variant(uses=[{"card": {"name": "No oracle id"}}])) is None
    assert parse_variant(_variant(uses=[])) is None


def test_iter_variants_streams_across_chunk_boundaries(tmp_path):
    variants = [_variant(id=str(i)) for i in range(7)]
    path = tmp_path / "variants.json"
    path.write_text(json.dumps({"timestamp": "x", "version": "1", "variants": variants}))

    # A 7-byte window forces every object to straddle several reads.
    parsed = list(iter_variants(path, _chunk=7))

    assert [v["id"] for v in parsed] == [str(i) for i in range(7)]


def test_iter_variants_empty_array_and_missing_key(tmp_path):
    empty = tmp_path / "empty.json"
    empty.write_text('{"variants": []}')
    assert list(iter_variants(empty)) == []

    keyless = tmp_path / "keyless.json"
    keyless.write_text('{"other": 1}')
    assert list(iter_variants(keyless)) == []


def test_combos_from_rows_splits_on_missing():
    rows = [
        {
            "id": "done",
            "uses": ["oid-a", "oid-b"],
            "names": ["A", "B"],
            "produces": ["Infinite mana"],
            "bracket": "C",
            "popularity": 5,
        },
        {
            "id": "short",
            "uses": ["oid-a", "oid-c"],
            "names": ["A", "C"],
            "produces": [],
            "bracket": None,
            "popularity": None,
        },
    ]

    found = _combos_from_rows(rows, {"oid-a", "oid-b"})

    [done] = found["included"]
    assert done.is_complete
    [short] = found["almost_included"]
    assert short.missing == ("C",)
    assert short.bracket == ""
    assert short.popularity == 0
