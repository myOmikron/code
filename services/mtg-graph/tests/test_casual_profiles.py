"""Casual profile derivation. Pure — EDHREC and graph access are
monkeypatched, `test_cedh_profiles.py`'s discipline (the module this
mirrors)."""

from __future__ import annotations

import json

import pytest

import deck_lab.casual_profiles as casual_profiles
from deck_lab.casual_profiles import (
    MIN_DECKS_PER_COMMANDER,
    NONLAND_BUCKETS,
    casual_corpus,
    measure_casual,
)
from deck_lab.cedh_profiles import SyntheticDeckValidation
from deck_lab.type_targets import PRIMARY_TYPES
from deck_lab.vocabulary import Bucket

# The eight-row shape every `TypeCounts.counts` carries, zeroed so a test
# only has to state the rows it cares about — `test_cedh_profiles.py`'s
# `_ZERO_COUNTS`, restated here rather than imported (a test-only fixture,
# not shared production code).
_ZERO_DELTAS = dict.fromkeys(PRIMARY_TYPES, 0.0)

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

# Sums to 99, so `edhrec.parse_type_counts`'s per-99 rescale is the
# identity and `land=35` in an override reads back as `stated.counts["Land"]
# == 35` exactly — the same shape `type_targets.DEFAULT_TYPE_COUNTS` uses.
_BASE_TYPE_COUNTS = {
    "creature": 29,
    "instant": 9,
    "sorcery": 9,
    "artifact": 9,
    "enchantment": 7,
    "planeswalker": 1,
    "battle": 0,
    "land": 35,
}


def _write_commander_page(data_dir, slug, bracket_counts):
    """A minimal flat commander page `_parsed_page` can read: only the
    `bracket_counts` panel `casual_corpus` ranks and floors on."""
    edhrec_dir = data_dir / "edhrec"
    edhrec_dir.mkdir(parents=True, exist_ok=True)
    payload = {"bracket_counts": {str(k): v for k, v in bracket_counts.items()}}
    (edhrec_dir / f"{slug}.json").write_text(json.dumps(payload))


def _casual_payload(*, bracket_counts, curve=None, **type_overrides):
    """A minimal flat commander page payload: the type-count fields
    `parse_type_counts` reads (defaulting to `_BASE_TYPE_COUNTS`), the
    `bracket_counts` panel, and an optional `panels.mana_curve`."""
    payload = dict(_BASE_TYPE_COUNTS)
    payload.update(type_overrides)
    payload["bracket_counts"] = {str(k): v for k, v in bracket_counts.items()}
    payload["panels"] = {"mana_curve": curve} if curve is not None else {}
    return payload


# --- casual_corpus: reads only what's already on disk, ranked by total ----


def test_casual_corpus_drops_commanders_below_the_total_floor(tmp_path, monkeypatch):
    monkeypatch.setattr(casual_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "thin-commander", {2: MIN_DECKS_PER_COMMANDER - 1})
    _write_commander_page(tmp_path, "thick-commander", {2: MIN_DECKS_PER_COMMANDER})

    assert casual_corpus() == [("thick-commander", MIN_DECKS_PER_COMMANDER)]


def test_casual_corpus_ranks_by_total_deck_count_largest_first(tmp_path, monkeypatch):
    monkeypatch.setattr(casual_profiles.settings, "data_dir", tmp_path)
    for i in range(5):
        _write_commander_page(tmp_path, f"commander-{i}", {2: MIN_DECKS_PER_COMMANDER + i})

    ranked = casual_corpus()

    assert ranked == [
        ("commander-4", MIN_DECKS_PER_COMMANDER + 4),
        ("commander-3", MIN_DECKS_PER_COMMANDER + 3),
        ("commander-2", MIN_DECKS_PER_COMMANDER + 2),
        ("commander-1", MIN_DECKS_PER_COMMANDER + 1),
        ("commander-0", MIN_DECKS_PER_COMMANDER),
    ]


def test_casual_corpus_ranks_by_total_not_bracket_five(tmp_path, monkeypatch):
    """`cedh_corpus` would drop or bury a commander with no bracket-5
    presence at all; this corpus reads every bracket as casual's format, so
    the biggest *total* wins regardless of which bracket it comes from."""
    monkeypatch.setattr(casual_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "big-spread", {1: 100, 2: 300, 3: 300})  # 700, no bracket 5
    _write_commander_page(tmp_path, "cedh-heavy", {5: 600})  # 600, all bracket 5

    assert casual_corpus() == [("big-spread", 700), ("cedh-heavy", 600)]


# --- _land_correction_factor: the synthetic-deck land-overcount fix -------


def test_land_correction_factor_scales_by_the_real_over_synthetic_nonland_ratio():
    # stated=35, synthetic=38 (delta +3): (99-35)/(99-38) = 64/61.
    factor = casual_profiles._land_correction_factor(stated_land=35, synthetic_land=38)
    assert factor == pytest.approx(64 / 61)


def test_land_correction_factor_is_the_identity_when_synthetic_matches_stated():
    assert casual_profiles._land_correction_factor(
        stated_land=35, synthetic_land=35
    ) == pytest.approx(1.0)


def test_land_correction_factor_guards_a_synthetic_deck_with_no_nonland_cards():
    """`synthetic_land >= DECK_SIZE` would divide by zero or a negative
    number — never observed in this corpus, guarded to the identity."""
    assert casual_profiles._land_correction_factor(
        stated_land=35, synthetic_land=99
    ) == pytest.approx(1.0)
    assert casual_profiles._land_correction_factor(
        stated_land=35, synthetic_land=105
    ) == pytest.approx(1.0)


def test_corrected_coverage_leaves_mana_sources_untouched(monkeypatch):
    raw = {
        Bucket.MANA_SOURCES: 40.0,
        Bucket.RAMP: 10.0,
        Bucket.CARD_DRAW: 5.0,
        Bucket.INTERACTION: 8.0,
        Bucket.SYNERGY_WINCON: 12.0,
    }

    corrected = casual_profiles._corrected_coverage(raw, stated_land=35, synthetic_land=38)

    factor = 64 / 61
    assert corrected[Bucket.MANA_SOURCES] == pytest.approx(40.0)
    assert corrected[Bucket.RAMP] == pytest.approx(10.0 * factor)
    assert corrected[Bucket.CARD_DRAW] == pytest.approx(5.0 * factor)
    assert corrected[Bucket.INTERACTION] == pytest.approx(8.0 * factor)
    assert corrected[Bucket.SYNERGY_WINCON] == pytest.approx(12.0 * factor)


# --- measure_casual: the pooling loop, against fakes -----------------------


@pytest.fixture
def measured(monkeypatch):
    """Drive `measure_casual` against a fixed corpus ranking, scripted
    page payloads, and a stubbed `_measure_commander` — `test_cedh_
    profiles.py`'s `measured` fixture, pointed at this module's own
    `casual_corpus`/`_load_page` seams instead of `cedh_corpus`/`fetch_
    commander_theme`."""
    state = {"payloads": {}, "commander_results": {}}

    def fake_load_page(slug):
        return state["payloads"].get(slug)

    def fake_measure_commander(slug, payload, deck_count, stated):
        return state["commander_results"].get(slug, (None, None))

    def run(ranked, **kwargs):
        monkeypatch.setattr(
            casual_profiles, "casual_corpus", lambda min_decks_per_commander: ranked
        )
        monkeypatch.setattr(casual_profiles, "_load_page", fake_load_page)
        monkeypatch.setattr(casual_profiles, "_measure_commander", fake_measure_commander)
        return measure_casual(**kwargs)

    state["run"] = run
    return state


def _validation(slug, decks, land_delta=0.0):
    return SyntheticDeckValidation(
        slug=slug,
        decks=decks,
        requested=98,
        resolved=95,
        deltas={**_ZERO_DELTAS, "Land": land_delta},
    )


def test_measure_casual_pools_bucket_coverage_deck_count_weighted(measured):
    measured["payloads"] = {
        "big": _casual_payload(bracket_counts={2: 8000}),
        "small": _casual_payload(bracket_counts={3: 2000}),
    }
    measured["commander_results"] = {
        "big": ({b: 20.0 for b in Bucket}, _validation("big", 8000)),
        "small": ({b: 10.0 for b in Bucket}, _validation("small", 2000)),
    }
    ranked = [("big", 8000), ("small", 2000)]

    result = measured["run"](ranked, min_commanders=2, min_decks=1000)

    # No land delta (identity correction) — deck-weighted mean of 20 (w=8000)
    # and 10 (w=2000) is 18.
    assert result.pooled[Bucket.RAMP].mean == pytest.approx(18.0)
    assert result.pooled[Bucket.SYNERGY_WINCON].mean == pytest.approx(18.0)
    assert result.commanders == 2
    assert result.decks == 10000


def test_measure_casual_applies_the_land_correction_before_pooling(measured):
    """Δ=+3 at a 35-stated land count corrects by ×64/61 — the same case
    `test_land_correction_factor_scales_by_the_real_over_synthetic_nonland_ratio`
    checks in isolation, now proven wired into the pooling loop."""
    measured["payloads"] = {"cmdr": _casual_payload(bracket_counts={2: 5000})}
    measured["commander_results"] = {
        "cmdr": ({b: 10.0 for b in Bucket}, _validation("cmdr", 5000, land_delta=3.0)),
    }
    ranked = [("cmdr", 5000)]

    result = measured["run"](ranked, min_commanders=1, min_decks=1000)

    assert result.pooled[Bucket.RAMP].mean == pytest.approx(10.0 * 64 / 61)
    # MANA_SOURCES is not pooled into a corridor at all.
    assert Bucket.MANA_SOURCES not in result.pooled


def test_measure_casual_collects_validations_even_when_below_the_resolution_floor(measured):
    measured["payloads"] = {
        "answers": _casual_payload(bracket_counts={2: 5000}),
        "thin": _casual_payload(bracket_counts={3: 2000}),
    }
    measured["commander_results"] = {
        "answers": ({b: 10.0 for b in Bucket}, _validation("answers", 5000)),
        "thin": (
            None,
            SyntheticDeckValidation(slug="thin", decks=2000, requested=98, resolved=10, deltas={}),
        ),
    }
    ranked = [("answers", 5000), ("thin", 2000)]

    result = measured["run"](ranked, min_commanders=1, min_decks=1000)

    assert result.commanders == 1  # only "answers" produced a poolable sample
    assert {v.slug for v in result.validations} == {"answers", "thin"}


def test_a_thin_corpus_emits_nothing(measured):
    measured["payloads"] = {"only": _casual_payload(bracket_counts={2: 5000})}
    measured["commander_results"] = {"only": ({b: 10.0 for b in Bucket}, _validation("only", 5000))}
    ranked = [("only", 5000)]

    result = measured["run"](ranked, min_commanders=3, min_decks=1000)

    assert result.pooled == {}
    assert result.curve is None
    assert result.median_bracket is None
    assert "below floor" in result.verdict


def test_an_unreadable_page_is_skipped_not_fatal(measured):
    measured["payloads"] = {"answers": _casual_payload(bracket_counts={2: 5000})}
    measured["commander_results"] = {
        "answers": ({b: 10.0 for b in Bucket}, _validation("answers", 5000))
    }
    ranked = [("answers", 5000), ("missing", 5000)]  # "missing" has no payload

    result = measured["run"](ranked, min_commanders=1, min_decks=1000)

    assert result.commanders == 1
    assert result.decks == 5000


# --- the bracket-lean split -------------------------------------------------


def _split_fixture(measured, *, value_low=10.0, value_high=20.0):
    measured["payloads"] = {
        "low-a": _casual_payload(bracket_counts={1: 3000}),
        "low-b": _casual_payload(bracket_counts={1: 3000}),
        "high-a": _casual_payload(bracket_counts={4: 3000}),
        "high-b": _casual_payload(bracket_counts={4: 3000}),
    }
    measured["commander_results"] = {
        "low-a": ({b: value_low for b in Bucket}, _validation("low-a", 3000)),
        "low-b": ({b: value_low for b in Bucket}, _validation("low-b", 3000)),
        "high-a": ({b: value_high for b in Bucket}, _validation("high-a", 3000)),
        "high-b": ({b: value_high for b in Bucket}, _validation("high-b", 3000)),
    }
    return [("low-a", 3000), ("low-b", 3000), ("high-a", 3000), ("high-b", 3000)]


def test_split_verdict_flips_across_sd_gap(measured):
    ranked = _split_fixture(measured)

    tight = measured["run"](ranked, min_commanders=3, min_decks=1000, sd_gap=1.0)
    loose = measured["run"](ranked, min_commanders=3, min_decks=1000, sd_gap=3.0)

    # mean=15, sd=5 (values 10,10,20,20 equally weighted); gap = |20-10|/5 = 2.0.
    assert tight.gap_sd[Bucket.RAMP] == pytest.approx(2.0)
    assert loose.gap_sd[Bucket.RAMP] == pytest.approx(2.0)
    assert "split" in tight.verdict
    assert "split" not in loose.verdict


def test_split_pools_by_deck_weighted_median_bracket(measured):
    ranked = _split_fixture(measured)

    result = measured["run"](ranked, min_commanders=3, min_decks=1000, sd_gap=1.0)

    assert result.median_bracket == pytest.approx(1.0)
    assert result.low[Bucket.RAMP].commanders == 2
    assert result.low[Bucket.RAMP].decks == 6000
    assert result.high[Bucket.RAMP].commanders == 2
    assert result.high[Bucket.RAMP].decks == 6000


# --- render_constants: prints only ------------------------------------------


def test_render_constants_reports_below_floor():
    measurement = casual_profiles.CasualMeasurement(
        samples=[],
        pooled={},
        raw_mean={},
        curve=None,
        land_delta=0.0,
        median_bracket=None,
        low={},
        high={},
        gap_sd={},
        verdict="below floor",
        per_bracket={},
        commanders=1,
        decks=500,
        validations=[],
    )

    output = casual_profiles.render_constants(measurement)

    assert "below floor" in output
    assert "commanders=1" in output
    assert "decks=500" in output


def test_render_constants_prints_the_paste_ready_block_and_diagnostics(measured):
    ranked = _split_fixture(measured, value_low=15.0, value_high=15.0)

    result = measured["run"](ranked, min_commanders=3, min_decks=1000, sd_gap=1.0)
    output = casual_profiles.render_constants(result)

    assert "CASUAL_CORRIDORS: dict[Bucket, tuple[float, float]] = {" in output
    for bucket in NONLAND_BUCKETS:
        assert bucket.value in output
    assert "mana_sources" not in output
    assert "verdict" in output
    assert "land delta" in output


def test_render_constants_split_verdict_prints_low_and_high_blocks(measured):
    ranked = _split_fixture(measured)

    result = measured["run"](ranked, min_commanders=3, min_decks=1000, sd_gap=0.1)
    output = casual_profiles.render_constants(result)

    assert "split" in result.verdict
    assert "LOW_CASUAL_CORRIDORS" in output
    assert "HIGH_CASUAL_CORRIDORS" in output
