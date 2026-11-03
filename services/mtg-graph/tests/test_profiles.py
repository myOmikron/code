"""Card profiles: what one card adds to a deck's shape. No database."""

from __future__ import annotations

from deck_lab import graph
from deck_lab.cuts import CutCandidate
from deck_lab.profiles import attach_profiles, card_profiles
from deck_lab.suggestions import Suggestion


def _stub(monkeypatch, roles, fits):
    calls = []

    def role_weights(ids):
        calls.append(("roles", list(ids)))
        return {oid: roles[oid] for oid in ids if oid in roles}

    def theme_fits(ids):
        calls.append(("fits", list(ids)))
        return {oid: fits[oid] for oid in ids if oid in fits}

    monkeypatch.setattr(graph, "cards_role_weights", role_weights)
    monkeypatch.setattr(graph, "cards_theme_fits", theme_fits)
    return calls


def test_a_card_counts_its_strongest_role_once_per_bucket(monkeypatch):
    _stub(monkeypatch, {"signet": {"mana_rock": 1.0, "ramp_other": 0.7, "not_a_role": 1.0}}, {})

    profile = card_profiles(["signet"])["signet"]

    assert profile.buckets["ramp"] == 1.0
    assert "not_a_role" not in profile.buckets


def test_themes_below_the_fit_threshold_are_not_played(monkeypatch):
    _stub(monkeypatch, {}, {"clamp": {"tokens": 0.6, "aristocrats": 0.3, "landfall": 0.05}})

    assert card_profiles(["clamp"])["clamp"].themes == ["aristocrats", "tokens"]


def test_every_card_is_profiled_in_one_query_each(monkeypatch):
    calls = _stub(monkeypatch, {}, {})
    add = Suggestion(
        oracle_id="a", name="A", cmc=1, type_line="", price_usd=None, score=1, provenance=[]
    )
    cut = CutCandidate(oracle_id="c", name="C")

    attach_profiles([add, add], [cut])

    assert calls == [("roles", ["a", "c"]), ("fits", ["a", "c"])]
    assert add.profile is not None and cut.profile is not None


def test_no_cards_ask_nothing(monkeypatch):
    calls = _stub(monkeypatch, {}, {})

    assert card_profiles([]) == {}
    assert calls == []
