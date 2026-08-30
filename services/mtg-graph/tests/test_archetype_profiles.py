"""Archetype profile derivation. Pure — EDHREC access is monkeypatched."""

from __future__ import annotations

import json

import pytest

import deck_lab.archetype_profiles as archetype_profiles
from deck_lab.archetype_profiles import measure_tag, tag_corpus
from deck_lab.type_targets import TAG_MIN_DECKS

_TYPE_FIELDS = (
    "creature",
    "instant",
    "sorcery",
    "artifact",
    "enchantment",
    "planeswalker",
    "battle",
    "land",
)


def _page_payload(taglinks=(), **counts):
    """A minimal commander-page payload `_parsed_page` can read: the flat
    type-count fields plus a `panels.taglinks` list."""
    payload = dict.fromkeys(_TYPE_FIELDS, 0)
    payload.update(counts)
    payload["panels"] = {
        "taglinks": [{"slug": slug, "value": slug, "count": count} for slug, count in taglinks]
    }
    return payload


def _write_commander_page(data_dir, slug, taglinks=(), **counts):
    edhrec_dir = data_dir / "edhrec"
    edhrec_dir.mkdir(parents=True, exist_ok=True)
    (edhrec_dir / f"{slug}.json").write_text(json.dumps(_page_payload(taglinks, **counts)))


# --- tag_corpus: reads only what's already on disk -------------------------


def test_tag_corpus_drops_taglinks_below_the_sample_floor(tmp_path, monkeypatch):
    monkeypatch.setattr(archetype_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "thin-commander", [("spellslinger", TAG_MIN_DECKS - 1)])
    _write_commander_page(tmp_path, "thick-commander", [("spellslinger", TAG_MIN_DECKS)])

    ranked = tag_corpus("spellslinger")

    assert ranked == [("thick-commander", TAG_MIN_DECKS)]


def test_tag_corpus_honors_top_k(tmp_path, monkeypatch):
    monkeypatch.setattr(archetype_profiles.settings, "data_dir", tmp_path)
    for i in range(5):
        _write_commander_page(tmp_path, f"commander-{i}", [("spellslinger", 100 + i)])

    ranked = tag_corpus("spellslinger", top_k=2)

    assert ranked == [("commander-4", 104), ("commander-3", 103)]


def test_tag_corpus_ignores_a_commander_missing_the_tag(tmp_path, monkeypatch):
    monkeypatch.setattr(archetype_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "unrelated", [("aristocrats", 5000)])

    assert tag_corpus("spellslinger") == []


# --- measure_tag: the aggregation, against fakes ----------------------------


@pytest.fixture
def measured(monkeypatch):
    """Drive `measure_tag` against a fixed corpus ranking and scripted
    subpage payloads — mirrors `test_edhrec.py`'s `warm` fixture for
    `warm_top_commanders`, the walk this one copies its discipline from."""
    state = {"sleeps": [], "payloads": {}}

    monkeypatch.setattr(archetype_profiles, "_subpage_is_cached", lambda slug, tag: False)
    monkeypatch.setattr(archetype_profiles.time, "sleep", lambda s: state["sleeps"].append(s))

    def fake_fetch(slug, tag_slug, *, force=False):
        return state["payloads"].get(slug)

    def run(ranked, tag_slug="spellslinger", **kwargs):
        monkeypatch.setattr(archetype_profiles, "tag_corpus", lambda tag, top_k: ranked)
        monkeypatch.setattr("deck_lab.edhrec.fetch_commander_theme", fake_fetch)
        return measure_tag(tag_slug, **kwargs)

    state["run"] = run
    return state


def test_measure_tag_is_the_deck_count_weighted_mean(measured):
    """Algebraically the pooled per-deck mean: every source page already
    sums to 99, so the weighted combination does too — a 150-deck pairing
    does not get Ur-Dragon's tens-of-thousands weight, and it does not
    drown Ur-Dragon out either."""
    measured["payloads"] = {
        "big-commander": _page_payload(creature=30, land=39, instant=15, sorcery=15),
        "small-commander": _page_payload(creature=10, land=35, instant=30, sorcery=24),
    }
    ranked = [("big-commander", 8000), ("small-commander", 2000)]

    profile, sd = measured["run"](ranked, min_commanders=2, min_decks=1000)

    assert profile is not None
    assert profile.commanders == 2
    assert profile.decks == 10000
    assert profile.counts["Creature"] == pytest.approx(26.0)
    assert profile.counts["Land"] == pytest.approx(38.2)
    assert profile.counts["Sorcery"] == pytest.approx(16.8)
    assert sum(profile.counts.values()) == pytest.approx(99.0)
    assert measured["sleeps"] == [1.0, 1.0]  # one politeness delay per network fetch


def test_a_thin_corpus_emits_nothing(measured):
    """Fewer commanders answered than `min_commanders` — a profile built on
    one or two pages is a build's flavour, not an archetype's."""
    measured["payloads"] = {"only-commander": _page_payload(creature=30, land=39)}
    ranked = [("only-commander", 5000)]

    profile, _ = measured["run"](ranked, min_commanders=3, min_decks=1000)

    assert profile is None


def test_a_thin_pooled_deck_count_emits_nothing(measured):
    """Enough commanders, but too few decks behind them pooled — the other
    half of the floor."""
    measured["payloads"] = {f"commander-{i}": _page_payload(creature=30, land=39) for i in range(3)}
    ranked = [(f"commander-{i}", 100) for i in range(3)]  # 300 decks total

    profile, _ = measured["run"](ranked, min_commanders=3, min_decks=1000)

    assert profile is None


def test_an_unreachable_subpage_is_skipped_not_fatal(measured):
    """One bad commander must not end the run — `warm_top_commanders`'s own
    discipline, copied."""
    measured["payloads"] = {
        "answers": _page_payload(creature=30, land=39),
        # "missing" has no entry — `fetch_commander_theme` returns None.
    }
    ranked = [("answers", 5000), ("missing", 5000)]

    profile, _ = measured["run"](ranked, min_commanders=1, min_decks=1000)

    assert profile is not None
    assert profile.commanders == 1
    assert profile.decks == 5000
