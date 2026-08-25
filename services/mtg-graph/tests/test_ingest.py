"""Corpus filtering — what gets into the graph at all."""

from __future__ import annotations

import json

from deck_lab.ingest import is_ingestable

LEGAL = {
    "oracle_id": "x",
    "layout": "normal",
    "legalities": {"commander": "legal"},
}


def test_commander_legal_card_is_ingested():
    assert is_ingestable(LEGAL)


def test_banned_card_is_excluded():
    assert not is_ingestable(LEGAL | {"legalities": {"commander": "banned"}})


def test_not_legal_card_is_excluded():
    assert not is_ingestable(LEGAL | {"legalities": {"commander": "not_legal"}})


def test_missing_legalities_is_excluded():
    assert not is_ingestable({"oracle_id": "x", "layout": "normal"})


def test_card_without_oracle_id_is_excluded():
    """oracle_id is the merge key — a card without one would corrupt upserts."""
    assert not is_ingestable(LEGAL | {"oracle_id": None})


def test_non_playable_layouts_are_excluded():
    """Art cards and tokens are commander-legal by omission, not by rule."""
    for layout in ("art_series", "token", "emblem", "double_faced_token", "vanguard"):
        assert not is_ingestable(LEGAL | {"layout": layout}), layout


def test_playable_multiface_layouts_are_kept():
    for layout in ("transform", "modal_dfc", "split", "adventure", "flip"):
        assert is_ingestable(LEGAL | {"layout": layout}), layout


def test_the_rule_alone_handles_a_spacecraft_commander(tmp_path):
    """The cold-start property: a card spoiled this morning must be nominable
    without any Scryfall round trip. A fetched list of names cannot do that."""
    from deck_lab.ingest import parse_bulk

    card = {
        "oracle_id": "hearthhull-id",
        "id": "x",
        "name": "Hearthhull, the Worldseed",
        "type_line": "Legendary Artifact — Spacecraft",
        "oracle_text": "Station (...It's an artifact creature at 8+.)",
        "cmc": 5.0,
        "legalities": {"commander": "legal"},
        "games": ["paper"],
    }
    path = tmp_path / "bulk.jsonl"
    path.write_text(json.dumps(card) + "\n")

    assert next(iter(parse_bulk(path, set()))).can_be_commander is True


def test_the_curated_list_can_remove_a_legendary_non_creature(tmp_path):
    """`The Eternity Elevator` is a legendary Spacecraft whose Station never
    makes it a creature, so it cannot be a commander though the rule says yes.
    For legendary non-creatures the curated list is complete, so it overrides in
    both directions."""
    from deck_lab.ingest import parse_bulk

    card = {
        "oracle_id": "elevator-id",
        "id": "z",
        "name": "The Eternity Elevator",
        "type_line": "Legendary Artifact — Spacecraft",
        "oracle_text": "{T}: Add {C}{C}{C}.",
        "cmc": 3.0,
        "legalities": {"commander": "legal"},
        "games": ["paper"],
    }
    path = tmp_path / "bulk.jsonl"
    path.write_text(json.dumps(card) + "\n")

    assert next(iter(parse_bulk(path, set()))).can_be_commander is True
    assert next(iter(parse_bulk(path, {"someone-else"}))).can_be_commander is False


def test_the_curated_list_is_never_consulted_for_legendary_creatures(tmp_path):
    """It contains only non-creature commanders, so consulting it for the 3,300
    legendary creatures would mark every one of them ineligible."""
    from deck_lab.ingest import parse_bulk

    card = {
        "oracle_id": "meren-id",
        "id": "y",
        "name": "Meren of Clan Nel Toth",
        "type_line": "Legendary Creature — Human Shaman",
        "oracle_text": "",
        "cmc": 4.0,
        "legalities": {"commander": "legal"},
        "games": ["paper"],
    }
    path = tmp_path / "bulk.jsonl"
    path.write_text(json.dumps(card) + "\n")

    assert next(iter(parse_bulk(path, {"unrelated-id"}))).can_be_commander is True


def test_an_empty_exception_set_degrades_to_the_heuristic(tmp_path):
    """Offline with no cache must mean "the old behaviour", never "no commanders"."""
    from deck_lab.ingest import parse_bulk

    card = {
        "oracle_id": "meren-id",
        "id": "y",
        "name": "Meren of Clan Nel Toth",
        "type_line": "Legendary Creature — Human Shaman",
        "oracle_text": "",
        "cmc": 4.0,
        "legalities": {"commander": "legal"},
        "games": ["paper"],
    }
    path = tmp_path / "bulk.jsonl"
    path.write_text(json.dumps(card) + "\n")

    assert next(iter(parse_bulk(path, set()))).can_be_commander is True
    assert next(iter(parse_bulk(path, None))).can_be_commander is True
