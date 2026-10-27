"""Per-theme targets: "how much of this theme", resolved against the deck.

Pure functions plus request validation — no graph, no network.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from deck_lab import cuts
from deck_lab.api import SuggestionsRequest, _suggestions_key, app
from deck_lab.diagnostics import DeckEntry, ThemeShare
from deck_lab.suggestions import (
    PINNED_THEME_SHARE,
    Provenance,
    _Candidate,
    _reserve_pinned_slots,
    merge_theme_targets,
    resolve_theme_targets,
)
from deck_lab.themes import THEMES

client = TestClient(app)


def _share(theme: str, cards: int) -> ThemeShare:
    return ThemeShare(theme=theme, label=theme.title(), share=0.0, cards=cards)


# --- resolution -------------------------------------------------------------


def test_a_target_above_the_deck_is_a_gap_and_a_pin():
    read = resolve_theme_targets({"landfall": 0.40}, [_share("landfall", 22)], spells=61)

    # round(0.40 * 61) = 24 wanted, 22 held.
    assert read.gaps == {"landfall": 2}
    assert read.pinned == ["landfall"]
    assert read.trims == {} and read.excluded == []


def test_a_half_card_rounds_up_like_the_frontend():
    # 0.25 * 58 = 14.5: Python's `round` would say 14, `Math.round` says 15.
    read = resolve_theme_targets({"tokens": 0.25}, [_share("tokens", 14)], spells=58)

    assert read.gaps == {"tokens": 1}


def test_a_target_below_the_deck_is_a_trim_by_the_surplus_fraction():
    read = resolve_theme_targets({"tokens": 0.10}, [_share("tokens", 12)], spells=60)

    # 6 wanted of 12 held: half the theme's cards are surplus.
    assert read.trims == {"tokens": 0.5}
    assert read.pinned == [] and read.excluded == []


def test_a_target_of_zero_is_an_exclusion_whatever_the_deck_holds():
    read = resolve_theme_targets({"tokens": 0.0, "mill": 0.0}, [_share("tokens", 12)], spells=60)

    assert read.excluded == ["tokens", "mill"]
    assert read.trims == {} and read.gaps == {}


def test_a_target_the_deck_already_meets_is_held_but_still_spoken_for():
    read = resolve_theme_targets({"tokens": 0.25}, [_share("tokens", 15)], spells=60)

    assert read.gaps == {} and read.trims == {} and read.excluded == []
    # Spoken for: a legacy pin or exclusion for the theme must not survive.
    assert "tokens" in read.targeted


def test_a_theme_the_deck_does_not_hold_is_short_by_its_whole_target():
    read = resolve_theme_targets({"tutors": 0.10}, [], spells=61)

    assert read.gaps == {"tutors": 6}


def test_no_targets_resolve_to_nothing():
    read = resolve_theme_targets(None, [_share("tokens", 12)], spells=60)

    assert read.gaps == {} and read.trims == {} and read.excluded == []
    assert read.targeted == set()


def test_a_target_replaces_the_legacy_lists_for_its_theme():
    """A client that still sends pins beside targets cannot pin a theme its
    own target says to trim."""
    read = resolve_theme_targets(
        {"tokens": 0.10, "landfall": 0.40, "mill": 0.0},
        [_share("tokens", 12), _share("landfall", 10)],
        spells=60,
    )

    pins, outs = merge_theme_targets(["tokens", "blink"], ["landfall", "counters"], read)

    assert pins == ["blink", "landfall"]
    assert outs == ["counters", "mill"]


# --- the pin floor scales with the gap ---------------------------------------


class _Pin:
    def __init__(self, theme_id: str):
        self.id = theme_id
        self.label = theme_id


def _candidate(name: str, score: float, theme: str | None) -> _Candidate:
    candidate = _Candidate(oracle_id=name, name=name)
    candidate.provenance.append(Provenance(channel="edhrec_synergy", detail="", score=score))
    if theme is not None:
        candidate.provenance.append(
            Provenance(channel="theme_fit", detail="", score=0.0, key=theme)
        )
    return candidate


def _ranked() -> list[_Candidate]:
    ranked = [_candidate(f"generic{i}", 100 - i, None) for i in range(10)]
    ranked += [_candidate(f"themed{i}", 1 - i * 0.01, "treasure") for i in range(5)]
    return ranked


def test_a_small_gap_reserves_only_the_cards_asked_for():
    out, promoted = _reserve_pinned_slots(_ranked(), [_Pin("treasure")], 10, gaps={"treasure": 1})

    assert promoted == 1
    assert [c.name for c in out[:10] if c.name.startswith("themed")] == ["themed0"]


def test_a_large_gap_is_capped_at_the_share():
    out, promoted = _reserve_pinned_slots(_ranked(), [_Pin("treasure")], 10, gaps={"treasure": 40})

    assert promoted == int(10 * PINNED_THEME_SHARE)


def test_a_pin_without_a_target_keeps_the_full_share():
    """Two pins, one targeted: the untargeted one is the older, louder ask."""
    out, promoted = _reserve_pinned_slots(
        _ranked(), [_Pin("treasure"), _Pin("blink")], 10, gaps={"treasure": 1}
    )

    assert promoted == int(10 * PINNED_THEME_SHARE)


# --- the cut side's surplus term ----------------------------------------------


def test_trims_scale_a_cards_theme_share_by_the_surplus_fraction():
    label = THEMES["tokens"].label
    rows = {"tokens": {"a": 0.8, "b": 0.2}}

    merged = cuts._trim_shares({"a": (0.3, "Mill")}, {"tokens": 0.5}, rows)

    # `a`: max(0.3 from the exclusion, 0.8 * 0.5 from the trim) — the trim wins
    # and brings its own label. `b`: only the trim speaks.
    assert merged == {"a": (0.4, label), "b": (0.1, label)}


def test_no_trims_leave_the_exclusion_term_untouched():
    excluded = {"a": (0.3, "Mill")}

    assert cuts._trim_shares(excluded, {}, {}) == excluded


def test_every_cut_side_theme_is_read_in_one_query(monkeypatch):
    from deck_lab import graph

    calls: list[list[str]] = []

    def share_among(ids, themes):
        calls.append([theme["id"] for theme in themes])
        return [{"theme_id": theme["id"], "oracle_id": "a", "share": 0.5} for theme in themes]

    monkeypatch.setattr(graph, "theme_share_among", share_among)

    rows = cuts._theme_share_rows(["tokens", "landfall", "tokens", "not-a-theme"], ["a"])

    assert calls == [["tokens", "landfall"]]
    assert rows == {"tokens": {"a": 0.5}, "landfall": {"a": 0.5}}


# --- the boundary -------------------------------------------------------------


def test_theme_targets_are_bounded_at_the_request():
    body = {"cards": [{"oracle_id": "a"}], "theme_targets": {"landfall": 1.4}}
    assert client.post("/suggestions", json=body).status_code == 422

    body = {"cards": [{"oracle_id": "a"}], "theme_targets": {f"t{i}": 0.1 for i in range(65)}}
    assert client.post("/swaps", json=body).status_code == 422


def test_theme_targets_are_part_of_the_cache_key():
    def request(**overrides) -> SuggestionsRequest:
        return SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], **overrides)

    base = _suggestions_key(request())
    assert _suggestions_key(request(theme_targets={"landfall": 0.4})) != base
    assert _suggestions_key(request(theme_targets={"landfall": 0.4})) != _suggestions_key(
        request(theme_targets={"landfall": 0.25})
    )
    # A mapping has no order: the same targets spelled in another order share the entry.
    assert _suggestions_key(request(theme_targets={"a": 0.1, "b": 0.2})) == _suggestions_key(
        request(theme_targets={"b": 0.2, "a": 0.1})
    )
