"""cEDH profile derivation. Pure — EDHREC and graph access are monkeypatched,
the same discipline `test_archetype_profiles.py` (the module this mirrors)
uses."""

from __future__ import annotations

import json

import pytest

import deck_lab.cedh_profiles as cedh_profiles
from deck_lab.cedh_profiles import SyntheticDeckValidation, cedh_corpus, measure_cedh
from deck_lab.edhrec import TypeCounts
from deck_lab.type_targets import CEDH_MIN_DECKS, ArchetypeProfile
from deck_lab.vocabulary import Bucket

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

# The eight-row shape every `TypeCounts.counts` / `ArchetypeProfile.counts`
# carries, zeroed out so a test only has to state the rows it cares about.
_ZERO_COUNTS = {
    "Creature": 0.0,
    "Instant": 0.0,
    "Sorcery": 0.0,
    "Artifact": 0.0,
    "Enchantment": 0.0,
    "Planeswalker": 0.0,
    "Battle": 0.0,
    "Land": 0.0,
}


def _write_commander_page(data_dir, slug, bracket_counts):
    """A minimal flat commander page `_parsed_page` can read: only the
    `bracket_counts` panel `cedh_corpus` ranks on."""
    edhrec_dir = data_dir / "edhrec"
    edhrec_dir.mkdir(parents=True, exist_ok=True)
    payload = {"bracket_counts": {str(k): v for k, v in bracket_counts.items()}}
    (edhrec_dir / f"{slug}.json").write_text(json.dumps(payload))


def _cardview(name, num_decks, potential_decks):
    return {"id": name, "name": name, "num_decks": num_decks, "potential_decks": potential_decks}


def _cedh_payload(*, basic=0, cardviews=(), curve=None, **type_counts):
    """A minimal `/cedh` subpage payload: the flat type-count fields
    `parse_type_counts` reads, the `basic` count, an optional
    `panels.mana_curve`, and one non-skip cardlist carrying `cardviews`."""
    payload = dict.fromkeys(_TYPE_FIELDS, 0)
    payload.update(type_counts)
    payload["basic"] = basic
    payload["container"] = {
        "json_dict": {
            "cardlists": [{"tag": "creatures", "header": "Creatures", "cardviews": list(cardviews)}]
        }
    }
    payload["panels"] = {"mana_curve": curve} if curve is not None else {}
    return payload


# --- cedh_corpus: reads only what's already on disk, ranked by bracket 5 ---


def test_cedh_corpus_drops_commanders_below_the_bracket_five_floor(tmp_path, monkeypatch):
    monkeypatch.setattr(cedh_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "thin-commander", {5: CEDH_MIN_DECKS - 1})
    _write_commander_page(tmp_path, "thick-commander", {5: CEDH_MIN_DECKS})

    assert cedh_corpus() == [("thick-commander", CEDH_MIN_DECKS)]


def test_cedh_corpus_ranks_by_bracket_five_count_largest_first(tmp_path, monkeypatch):
    monkeypatch.setattr(cedh_profiles.settings, "data_dir", tmp_path)
    for i in range(5):
        _write_commander_page(tmp_path, f"commander-{i}", {5: CEDH_MIN_DECKS + i})

    ranked = cedh_corpus(top_k=2)

    assert ranked == [
        ("commander-4", CEDH_MIN_DECKS + 4),
        ("commander-3", CEDH_MIN_DECKS + 3),
    ]


def test_cedh_corpus_ignores_a_commander_with_no_bracket_five_sample(tmp_path, monkeypatch):
    monkeypatch.setattr(cedh_profiles.settings, "data_dir", tmp_path)
    _write_commander_page(tmp_path, "no-cedh-presence", {4: 5000, 3: 1200})

    assert cedh_corpus() == []


# --- _synthetic_average_deck: the inference at the module's core -----------


def test_synthetic_average_deck_ranks_by_inclusion_rate_highest_first(monkeypatch):
    monkeypatch.setattr(cedh_profiles, "DECK_SIZE", 3)
    payload = _cedh_payload(
        basic=1,
        cardviews=[
            _cardview("Low", 1, 100),
            _cardview("High", 90, 100),
            _cardview("Mid", 50, 100),
        ],
    )

    picks = cedh_profiles._synthetic_average_deck(payload)

    assert picks == [("High", 1), ("Mid", 1), ("Plains", 1)]


def test_synthetic_average_deck_skips_newcards(monkeypatch):
    payload = {
        "basic": 0,
        "container": {
            "json_dict": {
                "cardlists": [
                    {
                        "tag": "newcards",
                        "header": "New",
                        "cardviews": [_cardview("Brand New", 99, 100)],
                    },
                    {
                        "tag": "creatures",
                        "header": "Creatures",
                        "cardviews": [_cardview("Old Reliable", 50, 100)],
                    },
                ]
            }
        },
    }

    picks = cedh_profiles._synthetic_average_deck(payload)

    assert picks == [("Old Reliable", 1)]


def test_synthetic_average_deck_omits_the_basic_line_when_basic_is_zero():
    payload = _cedh_payload(basic=0, cardviews=[_cardview("Only", 10, 10)])

    assert cedh_profiles._synthetic_average_deck(payload) == [("Only", 1)]


def test_synthetic_average_deck_none_on_missing_basic():
    payload = _cedh_payload(cardviews=[_cardview("Only", 10, 10)])
    del payload["basic"]

    assert cedh_profiles._synthetic_average_deck(payload) is None


def test_synthetic_average_deck_none_on_out_of_range_basic():
    payload = _cedh_payload(basic=200, cardviews=[_cardview("Only", 10, 10)])

    assert cedh_profiles._synthetic_average_deck(payload) is None


def test_synthetic_average_deck_none_on_no_cardviews():
    payload = _cedh_payload(basic=5, cardviews=[])

    assert cedh_profiles._synthetic_average_deck(payload) is None


# --- _resolve_deck: names -> oracle_ids, one bad name does not end it ------


def test_resolve_deck_sums_quantities_by_id_and_drops_unresolved(monkeypatch):
    monkeypatch.setattr(
        "deck_lab.graph.resolve_names",
        lambda names: {"Sol Ring": "id-solring", "Plains": "id-plains"},
    )
    picks = [("Sol Ring", 1), ("Unresolvable Card", 1), ("Plains", 40)]

    deck, resolved = cedh_profiles._resolve_deck(picks)

    assert deck == {"id-solring": 1, "id-plains": 40}
    assert resolved == 41  # the unresolvable card's copy is not counted


# --- _measure_commander: the synthetic deck -> bucket coverage + receipt ---


def _stub_graph(monkeypatch, *, roles_by_id, type_lines_by_id, resolvable):
    """Route `_resolve_deck`'s and `_measure_commander`'s graph reads at
    fakes keyed by oracle_id, so the bucket-coverage/validation arithmetic
    can be tested without Neo4j."""
    monkeypatch.setattr("deck_lab.graph.resolve_names", lambda names: dict(resolvable))
    monkeypatch.setattr(
        "deck_lab.graph.fetch_deck",
        lambda deck: [
            {
                "oracle_id": oid,
                "name": oid,
                "type_line": type_lines_by_id[oid],
                "layout": None,
                "qty": qty,
            }
            for oid, qty in deck.items()
        ],
    )
    monkeypatch.setattr(
        "deck_lab.graph.deck_card_roles",
        lambda deck: [
            {"oracle_id": oid, "qty": qty, "roles": roles_by_id.get(oid, {})}
            for oid, qty in deck.items()
        ],
    )


def test_measure_commander_pools_bucket_coverage_and_validates_the_synthetic_shape(monkeypatch):
    monkeypatch.setattr(
        cedh_profiles, "_synthetic_average_deck", lambda payload: [("Sol Ring", 1), ("Plains", 98)]
    )
    _stub_graph(
        monkeypatch,
        resolvable={"Sol Ring": "id-solring", "Plains": "id-plains"},
        type_lines_by_id={"id-solring": "Artifact", "id-plains": "Basic Land — Plains"},
        roles_by_id={
            "id-solring": {"mana_rock": 1.0, "ramp_other": 0.7},
            "id-plains": {"land": 1.0},
        },
    )
    stated = TypeCounts(counts={**_ZERO_COUNTS, "Artifact": 1.0, "Land": 98.0}, total=99)

    bucket_coverage, validation = cedh_profiles._measure_commander("test-slug", {}, 500, stated)

    # 99 resolved of 99 requested -> scale is 1.0, no rescaling surprises.
    assert validation == SyntheticDeckValidation(
        slug="test-slug",
        decks=500,
        requested=99,
        resolved=99,
        deltas={**_ZERO_COUNTS, "Artifact": 0.0, "Land": 0.0},
    )
    # MANA_SOURCES = {land, mana_rock, mana_dork}: Sol Ring's mana_rock (1.0)
    # + 98 Plains' land (1.0 each) = 99. RAMP = {mana_rock, mana_dork,
    # land_ramp, ramp_other}: Sol Ring contributes its *strongest* role only
    # (mana_rock 1.0, not 1.0 + 0.7) — `bucket_coverage_from_cards`'s whole
    # point.
    assert bucket_coverage[Bucket.MANA_SOURCES] == pytest.approx(99.0)
    assert bucket_coverage[Bucket.RAMP] == pytest.approx(1.0)
    assert bucket_coverage[Bucket.CARD_DRAW] == pytest.approx(0.0)


def test_measure_commander_rescales_to_deck_size_when_names_are_missing(monkeypatch):
    # Half the synthetic deck resolves; the other half is dropped as
    # unrecognised names. The bucket number must speak for a full 99, not 49.
    monkeypatch.setattr(
        cedh_profiles,
        "_synthetic_average_deck",
        lambda payload: (
            [("Sol Ring", 1), ("Missing Card", 1)] + [(f"Filler {i}", 1) for i in range(96)]
        ),
    )
    _stub_graph(
        monkeypatch,
        resolvable={"Sol Ring": "id-solring"},
        type_lines_by_id={"id-solring": "Artifact"},
        roles_by_id={"id-solring": {"mana_rock": 1.0}},
    )
    stated = TypeCounts(counts={**_ZERO_COUNTS, "Artifact": 1.0}, total=99)

    bucket_coverage, validation = cedh_profiles._measure_commander("thin-slug", {}, 100, stated)

    assert validation.resolved == 1
    assert validation.requested == 98
    # Below MIN_RESOLVED_FRACTION (0.5 * 99 ~= 49.5) -> bucket coverage
    # withheld even though a synthetic shape was computable.
    assert bucket_coverage is None
    assert validation.deltas["Artifact"] == pytest.approx(98.0)  # 1 card * (99/1) - 1.0 stated


def test_measure_commander_none_none_when_the_page_has_no_synthetic_deck(monkeypatch):
    monkeypatch.setattr(cedh_profiles, "_synthetic_average_deck", lambda payload: None)
    stated = TypeCounts(counts=_ZERO_COUNTS, total=99)

    assert cedh_profiles._measure_commander("empty-slug", {}, 100, stated) == (None, None)


def test_measure_commander_zero_resolved_still_returns_a_validation_row(monkeypatch):
    monkeypatch.setattr(cedh_profiles, "_synthetic_average_deck", lambda payload: [("Nobody", 1)])
    monkeypatch.setattr("deck_lab.graph.resolve_names", lambda names: {})

    bucket_coverage, validation = cedh_profiles._measure_commander(
        "unresolvable-slug", {}, 100, TypeCounts(counts=_ZERO_COUNTS, total=99)
    )

    assert bucket_coverage is None
    assert validation == SyntheticDeckValidation(
        slug="unresolvable-slug", decks=100, requested=1, resolved=0, deltas={}
    )


# --- measure_cedh: the pooling loop, against fakes --------------------------


@pytest.fixture
def measured(monkeypatch):
    """Drive `measure_cedh` against a fixed corpus ranking, scripted
    subpage payloads, and a stubbed `_measure_commander` — mirrors
    `test_archetype_profiles.py`'s `measured` fixture for `measure_tag`,
    the walk this one copies its discipline from."""
    state = {"sleeps": [], "payloads": {}, "commander_results": {}}

    monkeypatch.setattr(cedh_profiles, "_subpage_is_cached", lambda slug: False)
    monkeypatch.setattr(cedh_profiles.time, "sleep", lambda s: state["sleeps"].append(s))

    def fake_fetch(slug, tag_slug, *, force=False):
        return state["payloads"].get(slug)

    def fake_measure_commander(slug, payload, deck_count, stated):
        return state["commander_results"].get(slug, (None, None))

    def run(ranked, **kwargs):
        monkeypatch.setattr(cedh_profiles, "cedh_corpus", lambda top_k: ranked)
        monkeypatch.setattr("deck_lab.edhrec.fetch_commander_theme", fake_fetch)
        monkeypatch.setattr(cedh_profiles, "_measure_commander", fake_measure_commander)
        return measure_cedh(**kwargs)

    state["run"] = run
    return state


def test_measure_cedh_pools_type_counts_deck_count_weighted(measured):
    measured["payloads"] = {
        "big-commander": _cedh_payload(creature=30, land=39, instant=15, sorcery=15),
        "small-commander": _cedh_payload(creature=10, land=35, instant=30, sorcery=24),
    }
    ranked = [("big-commander", 8000), ("small-commander", 2000)]

    result = measured["run"](ranked, min_commanders=2, min_decks=1000)

    assert result.type_profile is not None
    assert result.type_profile.commanders == 2
    assert result.type_profile.decks == 10000
    assert result.type_profile.tag == "cedh"
    assert result.type_profile.counts["Creature"] == pytest.approx(26.0)
    assert result.type_profile.counts["Land"] == pytest.approx(38.2)
    assert sum(result.type_profile.counts.values()) == pytest.approx(99.0)
    assert measured["sleeps"] == [1.0, 1.0]  # one politeness delay per network fetch


def test_measure_cedh_curve_is_deck_count_weighted_and_normalised_to_shares(measured):
    measured["payloads"] = {
        "big-commander": _cedh_payload(creature=30, land=39, curve={"0": 8, "1": 40, "2": 12}),
        "small-commander": _cedh_payload(creature=30, land=39, curve={"0": 0, "1": 0, "2": 20}),
    }
    ranked = [("big-commander", 3000), ("small-commander", 1000)]

    result = measured["run"](ranked, min_commanders=2, min_decks=1000)

    assert result.curve is not None
    assert sum(result.curve.values()) == pytest.approx(1.0)
    # weighted raw means: mv0 = (8*3000+0*1000)/4000 = 6, mv1 = 30, mv2 = 14
    # -> shares out of 50
    assert result.curve[0] == pytest.approx(6 / 50)
    assert result.curve[1] == pytest.approx(30 / 50)
    assert result.curve[2] == pytest.approx(14 / 50)


def test_measure_cedh_pools_bucket_coverage_and_collects_validations(measured):
    measured["payloads"] = {
        "answers": _cedh_payload(creature=30, land=39),
        "thin": _cedh_payload(creature=20, land=39),
    }
    measured["commander_results"] = {
        "answers": (
            {b: 10.0 for b in Bucket},
            SyntheticDeckValidation(
                slug="answers", decks=5000, requested=98, resolved=95, deltas={}
            ),
        ),
        "thin": (
            None,
            SyntheticDeckValidation(slug="thin", decks=2000, requested=98, resolved=10, deltas={}),
        ),
    }
    ranked = [("answers", 5000), ("thin", 2000)]

    result = measured["run"](ranked, min_commanders=2, min_decks=1000)

    # Only "answers" cleared the resolution floor, so it is the only
    # contributor to bucket_coverage — but both show up in validations.
    assert result.bucket_coverage[Bucket.MANA_SOURCES] == pytest.approx(10.0)
    assert {v.slug for v in result.validations} == {"answers", "thin"}


def test_a_thin_corpus_emits_nothing(measured):
    measured["payloads"] = {"only-commander": _cedh_payload(creature=30, land=39)}
    ranked = [("only-commander", 5000)]

    result = measured["run"](ranked, min_commanders=3, min_decks=1000)

    assert result.type_profile is None
    assert result.curve is None
    assert result.bucket_coverage == {}


def test_a_thin_pooled_deck_count_emits_nothing(measured):
    measured["payloads"] = {f"commander-{i}": _cedh_payload(creature=30, land=39) for i in range(3)}
    ranked = [(f"commander-{i}", 100) for i in range(3)]  # 300 decks total

    result = measured["run"](ranked, min_commanders=3, min_decks=1000)

    assert result.type_profile is None


def test_an_unreachable_subpage_is_skipped_not_fatal(measured):
    measured["payloads"] = {"answers": _cedh_payload(creature=30, land=39)}
    ranked = [("answers", 5000), ("missing", 5000)]  # "missing" has no payload

    result = measured["run"](ranked, min_commanders=1, min_decks=1000)

    assert result.type_profile is not None
    assert result.type_profile.commanders == 1
    assert result.type_profile.decks == 5000


# --- render_constants: prints only -------------------------------------


def test_render_constants_reports_below_floor():
    measurement = cedh_profiles.CedhMeasurement(
        type_profile=None,
        type_sd={},
        curve=None,
        bucket_coverage={},
        bucket_sd={},
        commanders=1,
        decks=500,
        validations=[],
    )

    output = cedh_profiles.render_constants(measurement)

    assert "below floor" in output
    assert "commanders=1" in output
    assert "decks=500" in output


def test_render_constants_prints_a_paste_ready_profile_and_validation_table():
    profile = ArchetypeProfile(
        counts={
            "Creature": 20.0,
            "Instant": 20.0,
            "Sorcery": 8.0,
            "Artifact": 15.0,
            "Enchantment": 5.0,
            "Planeswalker": 1.0,
            "Battle": 0.0,
            "Land": 30.0,
        },
        tag="cedh",
        commanders=5,
        decks=5000,
        measured="2026-09-01",
    )
    measurement = cedh_profiles.CedhMeasurement(
        type_profile=profile,
        type_sd=dict.fromkeys(profile.counts, 1.0),
        curve={0: 0.1, 1: 0.3, 2: 0.2, 3: 0.2, 4: 0.1, 5: 0.05, 6: 0.05},
        bucket_coverage={
            Bucket.MANA_SOURCES: 40.0,
            Bucket.RAMP: 18.0,
            Bucket.CARD_DRAW: 12.0,
            Bucket.INTERACTION: 20.0,
            Bucket.SYNERGY_WINCON: 22.0,
        },
        bucket_sd=dict.fromkeys(Bucket, 2.0),
        commanders=5,
        decks=5000,
        validations=[
            SyntheticDeckValidation(
                slug="najeela-the-blade-blossom",
                decks=1258,
                requested=98,
                resolved=95,
                deltas={**_ZERO_COUNTS, "Creature": 0.5, "Instant": -0.3},
            )
        ],
    )

    output = cedh_profiles.render_constants(measurement)

    assert "CEDH_TYPE_COUNTS: ArchetypeProfile | None = ArchetypeProfile(" in output
    assert '"Land": 30.0' in output
    assert "mana_sources" in output
    assert "najeela-the-blade-blossom" in output
