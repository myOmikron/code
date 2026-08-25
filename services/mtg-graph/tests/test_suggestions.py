"""Power-appropriate scoring. Pure functions — no database.

The bracket system's rules, not taste: brackets 1-2 play without intentional
two-card infinite combos and without game changers, so combo value ramps with
the power level and game changers are withheld below bracket 3. The bands are
fifths of [0, 1], mirrored by the frontend's `bracketSpeed`.
The Phase 8 eval cannot arbitrate this — its target is popularity and combo
pieces are popular — which is exactly why these are tested as rules.
"""

from __future__ import annotations

import pytest

from deck_lab.suggestions import (
    BASIC_FLOOR_BRACKET_FIVE,
    BASIC_LAND_CAP,
    BASIC_LAND_RAMP,
    COMBO_CEILING_BRACKET_FIVE,
    COMBO_FLOOR_BRACKET_THREE,
    FIXING_CAP,
    MULTI_CHANNEL_BONUS,
    OFF_THEME_SHARE,
    SPEED_BRACKET_FIVE,
    SPEED_BRACKET_FOUR,
    SPEED_BRACKET_THREE,
    TYPE_SATURATION_RAMP,
    WEIGHT_BASIC_LAND,
    WEIGHT_COMBO,
    WEIGHT_FIXING_LAND,
    WEIGHT_TYPE_SATURATION,
    Provenance,
    Suggestion,
    _apply_theme_exclusions,
    _apply_type_saturation,
    _basic_land_provenance,
    _basic_names,
    _basic_scale,
    _Candidate,
    _combo_provenance,
    _detected_theme_provenance,
    _detected_theme_targets,
    _fixing_provenance,
    _off_theme_lean,
    _power_scale,
    _primary_group,
    _resolve_theme_prefs,
    _suggested_land_names,
    _theme_provenance,
    _typal_provenance,
    _withhold_game_changers,
)


class _Combo:
    """The two fields of a spellbook record the provenance builder reads."""

    def __init__(self, produces=None, card_names=()):
        self.produces = produces if produces is not None else ["infinite mana"]
        self.card_names = list(card_names)


def _candidate(name: str, *, game_changer: bool = False) -> _Candidate:
    return _Candidate(oracle_id=name, name=name, game_changer=game_changer)


# --- the ramp -------------------------------------------------------------


def test_power_scale_is_silent_through_brackets_one_and_two():
    assert _power_scale(0.0) == 0.0
    assert _power_scale(0.2) == 0.0
    assert _power_scale(SPEED_BRACKET_THREE - 0.01) == 0.0


def test_power_scale_reaches_full_value_at_bracket_four():
    """Everything is allowed from bracket 4 — full value starts there, not
    at the top of the meter."""
    assert _power_scale(SPEED_BRACKET_FOUR) == 1.0


def test_power_scale_climbs_across_bracket_four_to_a_cedh_ceiling():
    """At bracket 4-5 combos go from "legal" to "the point": a bare
    completion at flat value ranked a cEDH deck's win condition like a mid
    staple. Flat across 5 rather than climbing on — cEDH is a format, not a
    louder bracket 4."""
    midpoint = (SPEED_BRACKET_FOUR + SPEED_BRACKET_FIVE) / 2

    assert _power_scale(midpoint) == pytest.approx((1.0 + COMBO_CEILING_BRACKET_FIVE) / 2)
    assert _power_scale(SPEED_BRACKET_FIVE) == COMBO_CEILING_BRACKET_FIVE
    assert _power_scale(1.0) == COMBO_CEILING_BRACKET_FIVE


def test_bracket_three_has_a_floor_not_a_zero_edge():
    """The meter says "Low 3" at the band's first value; a zero combo score
    there would contradict it. Late-game tolerance is worth the floor from
    the moment a deck is bracket 3 at all."""
    assert _power_scale(SPEED_BRACKET_THREE) == COMBO_FLOOR_BRACKET_THREE


def test_power_scale_is_monotonic_across_the_meter():
    steps = [_power_scale(s / 100) for s in range(101)]
    assert steps == sorted(steps)


# --- combo provenance -----------------------------------------------------


def test_combo_score_is_full_at_high_power():
    prov = _combo_provenance(_Combo(card_names=["A", "B"]), ["A", "B"], scale=1.0)

    assert prov.score == WEIGHT_COMBO * 2.0
    assert "damped" not in prov.detail


def test_combo_score_scales_and_says_so():
    """The damping is provenance, not a silent reweight — the detail string
    is what the row and the score radar print."""
    prov = _combo_provenance(_Combo(card_names=["A", "B"]), ["A", "B"], scale=0.5)

    assert prov.score == WEIGHT_COMBO * 2.0 * 0.5
    assert prov.detail.endswith("damped at this speed")


def test_a_boosted_combo_says_so_too():
    """Same contract in the other direction — a bracket 4-5 boost is printed,
    never a silent reweight."""
    prov = _combo_provenance(_Combo(card_names=["A", "B"]), ["A", "B"], scale=2.0)

    assert prov.score == WEIGHT_COMBO * 2.0 * 2.0
    assert prov.detail.endswith("boosted at this speed")


# --- game changers --------------------------------------------------------


def test_game_changers_withheld_below_bracket_three():
    pool = [_candidate("Sol Ring"), _candidate("Rhystic Study", game_changer=True)]

    kept, note = _withhold_game_changers(pool, speed=0.3)

    assert [c.name for c in kept] == ["Sol Ring"]
    assert "1 game changer withheld" in note.text
    assert note.code == "game-changers-withheld"


def test_game_changers_kept_from_bracket_three_up():
    """Bracket 3 allows up to three game changers, so a "Low 3" deck — the
    band's first value — must not have them withheld."""
    pool = [_candidate("Rhystic Study", game_changer=True)]

    for speed in (SPEED_BRACKET_THREE, 0.7):
        kept, note = _withhold_game_changers(pool, speed=speed)
        assert kept == pool
        assert note is None


def test_no_note_when_nothing_was_withheld():
    """A note about withholding zero cards would be noise wearing honesty."""
    pool = [_candidate("Sol Ring")]

    kept, note = _withhold_game_changers(pool, speed=0.3)

    assert kept == pool
    assert note is None


def test_withheld_note_counts_and_pluralises():
    pool = [
        _candidate("Rhystic Study", game_changer=True),
        _candidate("Smothering Tithe", game_changer=True),
    ]

    kept, note = _withhold_game_changers(pool, speed=0.0)

    assert kept == []
    assert "2 game changers withheld" in note.text
    assert note.params["amount"] == "2"


# --- theme preferences ----------------------------------------------------


def _prov(channel: str, score: float, key=None) -> Provenance:
    return Provenance(channel=channel, detail=channel, score=score, key=key)


def test_unknown_theme_ids_are_noted_and_dropped():
    """Preferences outlive releases; a dead id is expected, never a 422."""
    notes: list[str] = []

    pins, outs = _resolve_theme_prefs(["landfall", "gone"], ["also_gone"], None, notes)

    assert [t.id for t in pins] == ["landfall"]
    assert outs == []
    assert [n.text for n in notes] == ["Ignoring unknown themes: also_gone, gone."]
    assert [n.code for n in notes] == ["themes-unknown"]


def test_pin_beats_exclude_on_overlap():
    notes: list[str] = []

    pins, outs = _resolve_theme_prefs(["landfall"], ["landfall", "mill"], None, notes)

    assert [t.id for t in pins] == ["landfall"]
    assert [t.id for t in outs] == ["mill"]
    assert "the pin wins" in notes[0].text


def test_focus_beats_exclude_for_one_request():
    """The focus is the explicit per-request ask; the exclusion is standing
    state. The focus wins here, and only here."""
    notes: list[str] = []

    _, outs = _resolve_theme_prefs([], ["landfall"], "landfall", notes)

    assert outs == []
    assert "the focus wins" in notes[0].text


def test_focus_deduplicates_a_matching_pin():
    """The focus block already ran the channel; running it again for the pin
    would double every landfall card's theme provenance."""
    notes: list[str] = []

    pins, _ = _resolve_theme_prefs(["landfall", "tokens"], [], "landfall", notes)

    assert [t.id for t in pins] == ["tokens"]
    assert notes == []


def test_exclusion_cancels_a_card_that_wholly_is_the_theme():
    """Fit 1.0 — every real Vehicle — loses its whole argument, however it got
    there. The old formula subtracted what a *pin* would have granted, which
    barely dented a card the empirical channel had put at 7."""
    candidate = _candidate("Smuggler's Copter")
    candidate.playability = 0.27
    candidate.provenance = [_prov("edhrec_synergy", 7.0)]

    kept, demoted = _apply_theme_exclusions(
        [candidate],
        [{"oracle_id": "Smuggler's Copter", "theme_id": "vehicles", "fit": 1.0}],
        {"vehicles": "Vehicles"},
    )

    assert demoted == 1
    assert kept[0].score() == pytest.approx(0.0)
    negative = kept[0].provenance[-1]
    assert negative.channel == "theme_excluded"
    assert "you excluded" in negative.detail


def test_a_partial_fit_keeps_the_rest_of_its_case():
    """Proportional, so a card that half-reads as the theme keeps half."""
    candidate = _candidate("Altar of the Brood")
    candidate.provenance = [_prov("edhrec_synergy", 2.0)]
    before = candidate.score()

    kept, _ = _apply_theme_exclusions(
        [candidate],
        [{"oracle_id": "Altar of the Brood", "theme_id": "mill", "fit": 0.6}],
        {"mill": "Mill"},
    )

    assert kept[0].score() == pytest.approx(before * 0.4)


def test_an_already_demoted_card_is_not_promoted_by_the_double_negative():
    """Clamped at zero: -fit * (a negative score) would be a *positive* entry."""
    candidate = _candidate("Something Bad")
    candidate.provenance = [_prov("edhrec_synergy", 1.0), _prov("type_saturation", -3.0)]

    kept, _ = _apply_theme_exclusions(
        [candidate],
        [{"oracle_id": "Something Bad", "theme_id": "mill", "fit": 1.0}],
        {"mill": "Mill"},
    )

    assert kept[0].provenance[-1].score == 0.0
    assert kept[0].score() < 0


def test_multi_channel_card_sinks_but_survives():
    candidate = _candidate("Altar of the Brood")
    candidate.provenance = [_prov("edhrec_synergy", 2.0), _prov("resource_bridge", 0.5)]
    before = candidate.score()

    kept, _ = _apply_theme_exclusions(
        [candidate],
        [{"oracle_id": "Altar of the Brood", "theme_id": "mill", "fit": 0.5}],
        {"mill": "Mill"},
    )

    assert kept == [candidate]
    assert candidate.score() < before


def test_max_fit_theme_only_one_negative_entry():
    """Max-not-sum, the bridge's rule: two excluded themes do not stack."""
    candidate = _candidate("Ashiok")
    candidate.provenance = [_prov("edhrec_synergy", 2.0)]

    kept, demoted = _apply_theme_exclusions(
        [candidate],
        [
            {"oracle_id": "Ashiok", "theme_id": "mill", "fit": 0.4},
            {"oracle_id": "Ashiok", "theme_id": "reanimator", "fit": 0.7},
        ],
        {"mill": "Mill", "reanimator": "Graveyard"},
    )

    assert demoted == 1
    negatives = [p for p in kept[0].provenance if p.channel == "theme_excluded"]
    assert len(negatives) == 1
    assert negatives[0].key == "reanimator"


def test_negative_entry_earns_no_multi_channel_bonus():
    """Two positive channels plus a demotion is still two channels agreeing;
    counting the demotion would refund half the bonus."""
    candidate = _candidate("Altar of the Brood")
    candidate.provenance = [
        _prov("edhrec_synergy", 2.0),
        _prov("resource_bridge", 0.5),
        _prov("theme_excluded", -0.9),
    ]

    assert candidate.score() == 2.0 + 0.5 - 0.9 + MULTI_CHANNEL_BONUS


def test_stripped_theme_only_candidate_is_dropped():
    """The defensive path: a theme_fit entry for an excluded theme is stripped,
    and a candidate with nothing left is not a suggestion."""
    candidate = _candidate("Sphinx's Tutelage")
    candidate.provenance = [_prov("theme_fit", 1.0, key="mill")]

    kept, demoted = _apply_theme_exclusions([candidate], [], {"mill": "Mill"})

    assert kept == []
    assert demoted == 0


def test_empty_exclusions_change_nothing():
    candidate = _candidate("Sol Ring")
    candidate.provenance = [_prov("edhrec_synergy", 2.0)]

    kept, demoted = _apply_theme_exclusions([candidate], [], {})

    assert kept == [candidate]
    assert demoted == 0
    assert candidate.provenance == [_prov("edhrec_synergy", 2.0)]


# --- grouping under theme preferences -------------------------------------


def _suggestion(provenance: list[Provenance]) -> Suggestion:
    return Suggestion(
        oracle_id="x",
        name="X",
        cmc=1.0,
        type_line="Artifact",
        price_usd=None,
        score=1.0,
        provenance=provenance,
    )


def test_theme_hits_group_under_their_own_theme():
    row = {
        "oracle_id": "c",
        "fit": 0.5,
        "theme_id": "landfall",
        "theme_label": "Landfall",
        "playability": 0.5,
    }

    key, label = _primary_group(_suggestion([_theme_provenance(row)]))

    assert key == "theme:landfall"
    assert label == "Landfall"


def test_keyless_theme_provenance_keeps_the_generic_group():
    """Reports serialized before `key` existed still group, just anonymously."""
    keyless = Provenance(channel="theme_fit", detail="reads as Landfall", score=1.0)

    key, label = _primary_group(_suggestion([keyless]))

    assert key == "theme:focus"
    assert label == "Theme"


def test_theme_excluded_never_heads_a_group():
    """The demotion is visible on the card but can never be the argument the
    heading makes for it."""
    suggestion = _suggestion(
        [
            _prov("edhrec_synergy", 2.0),
            _prov("theme_excluded", -0.5, key="mill"),
        ]
    )

    key, _ = _primary_group(suggestion)

    assert key == "staples"


# --- detected themes -------------------------------------------------------


class _Share:
    """A `ThemeShare` stand-in — the three fields the selector reads."""

    def __init__(self, theme, share):
        self.theme = theme
        self.label = theme.capitalize()
        self.share = share


def test_detected_targets_floor_cap_and_declared_skip():
    """Sorted-descending input: the floor breaks, the cap stops at two, and a
    declared theme (focused, pinned, or excluded) never fires twice."""
    shares = [
        _Share("counters", 0.34),
        _Share("tokens", 0.18),
        _Share("lifegain", 0.16),
        _Share("blink", 0.07),
    ]

    picked = _detected_theme_targets(shares, declared={"counters"})

    assert [s.theme for s in picked] == ["tokens", "lifegain"]


def test_detected_targets_respect_the_floor():
    shares = [_Share("counters", 0.34), _Share("mill", 0.02)]

    assert [s.theme for s in _detected_theme_targets(shares, declared=set())] == ["counters"]


def test_detected_theme_is_priced_below_a_pin():
    """Same card, same fit: the deck asking is weaker evidence than the user
    asking, even at a dominant share."""
    row = {"fit": 0.8, "theme_label": "Counters", "theme_id": "counters", "playability": 0.5}

    pinned = _theme_provenance(row)
    detected = _detected_theme_provenance(row, share=0.9)

    assert detected.score < pinned.score
    assert detected.channel == "theme_fit"
    assert detected.key == "counters"
    assert "of the deck" in detected.detail


def test_detected_theme_scales_with_share():
    row = {"fit": 0.8, "theme_label": "Counters", "theme_id": "counters", "playability": 0.5}

    loud = _detected_theme_provenance(row, share=0.5)
    quiet = _detected_theme_provenance(row, share=0.2)

    assert loud.score > quiet.score


def test_typal_provenance_carries_its_creature_type_as_key():
    prov = _typal_provenance(
        {"creature_type": "Angel", "share": 0.24, "relations": ["CARES_ABOUT_TYPE"]}
    )

    assert prov.key == "Angel"


# --- type saturation --------------------------------------------------------


def _type_row(type_, count, low, high):
    from deck_lab.diagnostics import TypeReport

    status = "high" if count > high else ("low" if count < low else "ok")
    return TypeReport(
        type=type_,
        count=count,
        low=low,
        high=high,
        deviation=max(count - high, low - count, 0.0),
        status=status,
    )


def _typed_candidate(name, type_line, *scores):
    candidate = _candidate(name)
    candidate.type_line = type_line
    candidate.provenance = [_prov(f"ch{i}", s) for i, s in enumerate(scores)]
    return candidate


def test_saturation_demotes_scaled_by_overage():
    """40 creature cards against a high of 34.8: overage 5.2 → −1.3."""
    candidate = _typed_candidate("Bear", "Creature — Bear", 2.0)

    _, demoted = _apply_type_saturation([candidate], [_type_row("Creature", 40, 23.2, 34.8)])

    assert demoted == 1
    negative = candidate.provenance[-1]
    assert negative.channel == "type_saturation"
    assert negative.key == "Creature"
    assert negative.score == pytest.approx(
        -WEIGHT_TYPE_SATURATION * (40 - 34.8) / TYPE_SATURATION_RAMP
    )
    assert "40 creature cards" in negative.detail


def test_saturation_caps_at_the_ramp():
    """Past the ramp the demotion saturates — never louder than −1.5."""
    candidate = _typed_candidate("Bear", "Creature — Bear", 2.0)

    _apply_type_saturation([candidate], [_type_row("Creature", 50, 23.2, 34.8)])

    assert candidate.provenance[-1].score == -WEIGHT_TYPE_SATURATION


def test_saturation_is_silent_inside_the_range():
    candidate = _typed_candidate("Bear", "Creature — Bear", 2.0)

    kept, demoted = _apply_type_saturation([candidate], [_type_row("Creature", 30, 23.2, 34.8)])

    assert kept == [candidate]
    assert demoted == 0
    assert len(candidate.provenance) == 1


def test_saturation_leaves_other_types_alone():
    instant = _typed_candidate("Bolt", "Instant", 2.0)
    creature = _typed_candidate("Bear", "Artifact Creature — Golem", 2.0)

    _, demoted = _apply_type_saturation(
        [instant, creature], [_type_row("Creature", 40, 23.2, 34.8)]
    )

    assert demoted == 1
    assert len(instant.provenance) == 1
    assert creature.provenance[-1].channel == "type_saturation"


def test_saturation_never_demotes_lands():
    """Land's target weight is zero and 'too many lands' is a cut question."""
    land = _typed_candidate("Wastes", "Basic Land", 2.0)

    _, demoted = _apply_type_saturation([land], [_type_row("Land", 45, 30, 38)])

    assert demoted == 0
    assert len(land.provenance) == 1


def test_saturated_creature_sinks_but_survives():
    """A multi-channel standout outlives the demotion; a single-channel mid
    creature drops below a comparable noncreature — the intended reorder."""
    standout = _typed_candidate("Craterhoof", "Creature — Beast", 2.5, 0.9, 0.8)
    mid = _typed_candidate("Bear", "Creature — Bear", 1.5)
    noncreature = _typed_candidate("Sign in Blood", "Sorcery", 1.2)

    _apply_type_saturation([standout, mid, noncreature], [_type_row("Creature", 41, 23.2, 34.8)])

    assert standout.score() > noncreature.score() > mid.score()


def test_saturation_earns_no_multi_channel_bonus():
    candidate = _typed_candidate("Bear", "Creature — Bear", 2.0, 0.5)
    before_channels = len({p.channel for p in candidate.provenance if p.score > 0})

    _apply_type_saturation([candidate], [_type_row("Creature", 45, 23.2, 34.8)])
    after_channels = len({p.channel for p in candidate.provenance if p.score > 0})

    assert after_channels == before_channels
    assert candidate.score() == pytest.approx(
        2.0 + 0.5 - WEIGHT_TYPE_SATURATION + MULTI_CHANNEL_BONUS
    )


def test_type_saturation_never_heads_a_group():
    suggestion = _suggestion(
        [
            _prov("edhrec_synergy", 2.0),
            _prov("type_saturation", -1.3, key="Creature"),
        ]
    )

    key, _ = _primary_group(suggestion)

    assert key == "staples"


def test_type_saturation_channel_is_known_to_the_frontend():
    """Same contract as the positive channels: an unknown channel renders no
    badge, and a demotion the user cannot see is a silent reweight."""
    from pathlib import Path

    component = (
        Path(__file__).resolve().parents[2] / "frontend/src/components/ui/Provenance/Provenance.js"
    )
    if not component.exists():
        return

    assert "type_saturation:" in component.read_text()


# --- basic lands ------------------------------------------------------------


def test_basics_match_the_deck_identity():
    assert _basic_names(["R"]) == ["Mountain"]
    assert _basic_names(["W", "U", "B", "R", "G"]) == [
        "Plains",
        "Island",
        "Swamp",
        "Mountain",
        "Forest",
    ]


def test_a_colourless_deck_gets_wastes():
    assert _basic_names([]) == ["Wastes"]


def test_land_famine_towers_over_every_spell_score():
    """The observed failure: an 88-card mono-red deck on 9 lands. Mountain
    must outrank a strong multi-channel spell (~4.5 fused), not merely
    appear — the deck's problem is not solvable by better spells."""
    prov = _basic_land_provenance(9, 32, 39)

    assert prov.channel == "basic_lands"
    assert prov.score == WEIGHT_BASIC_LAND * BASIC_LAND_CAP
    assert prov.score > 4.5
    assert "9 lands against a target of ~36 (32–39)" in prov.detail


def test_a_mild_land_shortfall_speaks_like_a_staple():
    """Three lands short is advice, not an alarm — comparable to a pinned
    theme hit, well under a combo completion."""
    assert _basic_land_provenance(33, 34, 38).score == pytest.approx(1.0)


def test_the_shortfall_prices_to_the_target_not_the_low_edge():
    """The second observed failure: a Necrobloom deck at 25 lands against a
    39 mean scored as 6 short because the band's low edge sat at 31 — and
    heard less about lands with every one it added. The range is a tolerance
    band for the report; the argument is to the mean."""
    prov = _basic_land_provenance(25, 35.5, 42.5)

    assert prov.score == pytest.approx((39 - 25) / BASIC_LAND_RAMP)
    assert "25 lands against a target of ~39 (36–42)" in prov.detail


def test_the_famine_score_is_capped_against_absurd_input():
    assert _basic_land_provenance(0, 40, 44).score == WEIGHT_BASIC_LAND * BASIC_LAND_CAP


def test_basics_speak_at_full_voice_through_bracket_three():
    for speed in (0.0, SPEED_BRACKET_THREE, SPEED_BRACKET_FOUR - 0.01):
        assert _basic_scale(speed) == 1.0


def test_basics_are_devalued_across_bracket_four_and_floored_at_cedh():
    """An optimized mana base answers a shortfall with fetches and duals, so
    the basic's voice ramps down across bracket 4 — but only to half: a cEDH
    deck nine lands short still needs land drops before better spells."""
    midpoint = (SPEED_BRACKET_FOUR + SPEED_BRACKET_FIVE) / 2

    assert _basic_scale(midpoint) == pytest.approx((1.0 + BASIC_FLOOR_BRACKET_FIVE) / 2)
    assert _basic_scale(SPEED_BRACKET_FIVE) == BASIC_FLOOR_BRACKET_FIVE
    assert _basic_scale(1.0) == BASIC_FLOOR_BRACKET_FIVE


def test_a_damped_basic_says_so_in_its_provenance():
    """Same contract as combo damping: the reweight is printed, not silent."""
    prov = _basic_land_provenance(31, 34, 40, scale=BASIC_FLOOR_BRACKET_FIVE)

    assert prov.score == pytest.approx((37 - 31) / BASIC_LAND_RAMP * BASIC_FLOOR_BRACKET_FIVE)
    assert prov.detail.endswith("damped at this speed")
    assert "31 lands against a target of ~37 (34–40)" in prov.detail


def test_a_lands_theme_keeps_basics_at_full_voice_at_any_speed():
    """The fetches-and-duals rationale inverts when lands are the payoff: a
    bracket-4 Necrobloom wants its basics undamped."""
    for speed in (SPEED_BRACKET_FOUR, SPEED_BRACKET_FIVE, 1.0):
        assert _basic_scale(speed, lands_theme=True) == 1.0


def test_fixing_shortfall_prices_a_staple_over_a_gate():
    """The score carries `weight_within_group`, so the channel's voice follows
    the candidate: Command Tower's rank speaks, an obscure gate whispers."""
    staple = {"edhrec_rank": 2, "rarity": "common"}
    obscure = {"edhrec_rank": 25000, "rarity": "common"}

    loud = _fixing_provenance(staple, 4, 18, 3)
    quiet = _fixing_provenance(obscure, 4, 18, 3)

    assert loud.channel == "fixing_lands"
    assert loud.key == "Land"
    assert loud.score > quiet.score > 0
    assert "4 fixing lands against ~18" in loud.detail


def test_fixing_score_is_capped_and_sits_under_the_basics_famine():
    """A colour-starved mana base is advice; a land-starved one is an alarm.
    Even at the cap and a perfect rank, fixing must not outshout basics."""
    prov = _fixing_provenance({"edhrec_rank": 1, "rarity": "common"}, 0, 30, 5)

    assert prov.score <= WEIGHT_FIXING_LAND * FIXING_CAP
    assert prov.score < _basic_land_provenance(9, 28.4, 42.6).score


def test_fixing_lands_seat_in_the_mana_sources_group():
    suggestion = _suggestion([_prov("fixing_lands", 0.8, key="Land")])

    key, label = _primary_group(suggestion)

    assert key == "bucket:mana sources"
    assert label == "Mana Sources"


def test_fixing_lands_channel_is_known_to_the_frontend():
    from pathlib import Path

    component = (
        Path(__file__).resolve().parents[2] / "frontend/src/components/ui/Provenance/Provenance.js"
    )
    if not component.exists():
        return

    assert "fixing_lands:" in component.read_text()


def test_land_name_decks_get_snow_covered_twins():
    """The Necrobloom and Field of the Dead count lands with different names,
    and a snow basic is the extra name a mana base gets for free."""
    assert _suggested_land_names(["B", "G"], True) == [
        "Swamp",
        "Forest",
        "Snow-Covered Swamp",
        "Snow-Covered Forest",
    ]
    assert _suggested_land_names(["B", "G"], False) == ["Swamp", "Forest"]
    assert "Snow-Covered Wastes" in _suggested_land_names([], True)


def test_basics_head_the_mana_sources_group():
    """Their detail is a shortfall sentence, not "fills X" — the seat must
    come from the channel, never from parsing prose."""
    suggestion = _suggestion([_prov("basic_lands", 6.4, key="Land")])

    key, label = _primary_group(suggestion)

    assert key == "bucket:mana sources"
    assert label == "Mana Sources"


def test_basic_lands_channel_is_known_to_the_frontend():
    from pathlib import Path

    component = (
        Path(__file__).resolve().parents[2] / "frontend/src/components/ui/Provenance/Provenance.js"
    )
    if not component.exists():
        return

    assert "basic_lands:" in component.read_text()


# --- off-theme lean -------------------------------------------------------


class _Share:
    """The two fields of a diagnostics theme row this reads."""

    def __init__(self, theme, share):
        self.theme = theme
        self.share = share


def _page(n: int) -> list:
    return [
        Suggestion(
            oracle_id=f"c{i}",
            name=f"Card {i}",
            cmc=2.0,
            type_line="Artifact",
            price_usd=None,
            score=1.0,
            provenance=[],
        )
        for i in range(n)
    ]


def _fits(ids, theme_id, fit=1.0):
    return [{"oracle_id": i, "theme_id": theme_id, "fit": fit} for i in ids]


def test_a_theme_the_page_is_about_and_the_deck_is_not_is_reported(monkeypatch):
    """The real case: a Shorikai reanimator deck shown 13 vehicles in 25."""
    top = _page(20)
    monkeypatch.setattr(
        "deck_lab.graph.fits_theme_among",
        lambda ids, themes: _fits([s.oracle_id for s in top[:11]], "vehicles"),
    )

    leans = _off_theme_lean(top, [_Share("reanimator", 0.71)], already=[])

    assert [(t.theme, t.share) for t in leans] == [("vehicles", 0.55)]
    assert leans[0].deck_share == 0.0


def test_a_theme_the_deck_actually_plays_is_not_reported(monkeypatch):
    """Suggestions matching the deck are the tool working, not a warning."""
    top = _page(20)
    monkeypatch.setattr(
        "deck_lab.graph.fits_theme_among",
        lambda ids, themes: _fits([s.oracle_id for s in top], "reanimator"),
    )

    assert _off_theme_lean(top, [_Share("reanimator", 0.71)], already=[]) == []


def test_an_incidental_theme_stays_quiet(monkeypatch):
    """Below a fifth of the page a theme is passing through, not steering."""
    top = _page(20)
    few = [s.oracle_id for s in top[: int(OFF_THEME_SHARE * 20) - 1]]
    monkeypatch.setattr(
        "deck_lab.graph.fits_theme_among", lambda ids, themes: _fits(few, "vehicles")
    )

    assert _off_theme_lean(top, [], already=[]) == []


def test_an_already_excluded_theme_is_not_offered_again(monkeypatch):
    """Its cards are demoted but still present; offering to exclude what is
    excluded reads as the setting having failed.

    Asserted on the query rather than the result: the theme is dropped before
    anything is asked, so a fake that answered for it anyway would be testing
    a filter that does not exist."""
    top = _page(20)
    asked: list[list[str]] = []

    def _record(ids, themes):
        asked.append(themes)
        return _fits([s.oracle_id for s in top], "reanimator")

    monkeypatch.setattr("deck_lab.graph.fits_theme_among", _record)

    _off_theme_lean(top, [], already=["vehicles"])

    assert "vehicles" not in asked[0]
    assert "reanimator" in asked[0]


def test_a_weak_fit_does_not_count_toward_the_share(monkeypatch):
    """Counting every brush with a theme would make every page look like
    everything."""
    top = _page(20)
    monkeypatch.setattr(
        "deck_lab.graph.fits_theme_among",
        lambda ids, themes: _fits([s.oracle_id for s in top], "vehicles", fit=0.2),
    )

    assert _off_theme_lean(top, [], already=[]) == []


def test_an_empty_page_asks_nothing(monkeypatch):
    def _boom(ids, themes):
        raise AssertionError("queried on an empty page")

    monkeypatch.setattr("deck_lab.graph.fits_theme_among", _boom)


# --- combo channel gating ---------------------------------------------------


class _EmptyDiagnostics:
    """Just enough of `Diagnostics`' shape for `suggest()` to read from —
    every list it touches, empty, so every channel that gates on one stays
    quiet and the run reaches the end with nothing in the pool."""

    balance: list = []
    buckets: list = []
    types: list = []
    typal: list = []
    themes: list = []


def test_the_combo_channel_runs_with_no_deck_card_names(monkeypatch):
    """The channel used to gate on a non-empty `deck_card_names`, but
    `deck_combos` only needs names for its HTTP fallback — the graph path
    works from oracle ids alone. An empty `deck_card_names` (the frontend no
    longer widens `/swaps` and friends to carry ~100 names) must not silently
    turn combo completion off."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)
    monkeypatch.setattr(
        graph,
        "fetch_deck",
        lambda counts: [{"oracle_id": "cmdr", "name": "Test Commander", "color_identity": ["G"]}],
    )

    calls: list[tuple] = []

    def _deck_combos(deck_oracle_ids, card_names):
        calls.append((deck_oracle_ids, card_names))
        return {"included": [], "almost_included": []}

    monkeypatch.setattr("deck_lab.spellbook.deck_combos", _deck_combos)

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"combo_completion"},
        include_combos=True,
    )

    assert calls, "deck_combos was never called — the combo channel stayed gated"
    assert calls[0] == (["cmdr"], None)
    assert report.suggestions == []

    assert _off_theme_lean([], [_Share("reanimator", 0.71)], already=[]) == []


# --- Rule 0 identity override ------------------------------------------------
# The deck may claim colours other than its commander's — a house rule. The
# override replaces the derived identity at one choke point, so every channel,
# the basics, and the report's echo follow it; `None` derives as before and
# `[]` deliberately means colourless.


def _stub_commander(monkeypatch, colors=("G",)):
    """The minimal graph for a `suggest()` run: one legal commander of `colors`.

    `fits_theme_among` belongs to that minimum: every run that returns a
    suggestion ends in the off-theme lean, which queries it for the whole
    page. Leave it out and the test quietly falls through to a real Neo4j.
    """
    from deck_lab import graph

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)
    monkeypatch.setattr(
        graph,
        "fetch_deck",
        lambda counts: [
            {"oracle_id": "cmdr", "name": "Test Commander", "color_identity": list(colors)}
        ],
    )
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])


def test_an_explicit_identity_reaches_the_channel_queries(monkeypatch):
    """The claimed colours scope retrieval, not the commander's own."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch, colors=("G",))
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: True)

    seen: list[list[str]] = []

    def _channel_edhrec(commander_oracle_id, deck_oracle_ids, identity, pool_filter=None):
        seen.append(identity)
        return []

    monkeypatch.setattr(graph, "channel_edhrec", _channel_edhrec)

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        identity=["W", "U"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert seen == [["W", "U"]]
    assert report.identity == ["W", "U"]


def test_a_colourless_override_suggests_wastes(monkeypatch):
    """`[]` is a deliberate "colourless only": a land shortfall is answered
    with Wastes, never with the commander's own basics."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)

    def _fetch_deck(counts):
        if "cmdr" in counts:
            return [{"oracle_id": "cmdr", "name": "Test Commander", "color_identity": ["G"]}]
        return [{"oracle_id": oid, "name": oid.removeprefix("oid-")} for oid in counts]

    monkeypatch.setattr(graph, "fetch_deck", _fetch_deck)
    monkeypatch.setattr(graph, "land_name_payoffs", lambda oracle_ids: [])
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])

    asked: list[list[str]] = []

    def _resolve_names(names):
        asked.append(names)
        return {name: f"oid-{name}" for name in names}

    monkeypatch.setattr(graph, "resolve_names", _resolve_names)

    class _LandShort(_EmptyDiagnostics):
        types = [_type_row("Land", 9, 32, 39)]

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        identity=[],
        diagnostics=_LandShort(),
        channels={"basic_lands"},
        include_combos=False,
    )

    assert asked == [["Wastes"]]
    assert [s.name for s in report.suggestions] == ["Wastes"]
    assert report.identity == []
    note = next(n for n in report.notes if n.code == "identity-overridden")
    assert note.params["colors"] == "colourless"


def test_the_override_note_says_the_claimed_colours(monkeypatch):
    """Said, not silent — a run scoped to colours the commander does not have
    must say so, in the claimed colours' own letters."""
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch, colors=("G",))

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        identity=["W", "U"],
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    note = next(n for n in report.notes if n.code == "identity-overridden")
    assert note.params["colors"] == "WU"
    assert "WU" in note.text


def test_no_note_when_the_override_matches_the_derived_identity(monkeypatch):
    """The same set of colours in any order is not an override worth
    announcing — the note would be noise wearing honesty."""
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch, colors=("W", "U"))

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        identity=["U", "W"],
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    assert not any(n.code == "identity-overridden" for n in report.notes)
    assert report.identity == ["U", "W"]


def test_no_override_derives_from_the_commander(monkeypatch):
    """`None` is today's behaviour: the commander's identity, no note."""
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch, colors=("G",))

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    assert report.identity == ["G"]
    assert not any(n.code == "identity-overridden" for n in report.notes)


# --- Rule 0 deck sizes -------------------------------------------------------
# The deck may target another size than 99. Every quota scales by deck_size/99
# and the answer must say so — a rescaling is guidance, not measured data.


def test_a_non_default_deck_size_says_the_targets_are_scaled(monkeypatch):
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch)

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        deck_size=60,
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    note = next(n for n in report.notes if n.code == "deck-size-scaled")
    assert note.params["size"] == "60"
    assert "60-card" in note.text


def test_the_default_deck_size_stays_silent(monkeypatch):
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch)

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    assert not any(n.code == "deck-size-scaled" for n in report.notes)


def test_the_fixing_target_scales_with_deck_size(monkeypatch):
    """Six per colour is per-99 tuning: a 60-card two-colour deck is asked
    for ~7 fixing lands, not 12."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch, colors=("B", "G"))
    monkeypatch.setattr(graph, "deck_fixing_count", lambda deck, fetch_types: 0)
    monkeypatch.setattr(
        graph,
        "channel_fixing",
        lambda deck, identity, fetch_types, limit=20, pool_filter=None: [
            {"oracle_id": "tower", "name": "Command Tower", "edhrec_rank": 1, "rarity": "common"}
        ],
    )

    def target(deck_size=None):
        report = suggest(
            ["cmdr"],
            [],
            commander_oracle_id="cmdr",
            diagnostics=_EmptyDiagnostics(),
            channels={"fixing_lands"},
            include_combos=False,
            **({"deck_size": deck_size} if deck_size else {}),
        )
        [suggestion] = report.suggestions
        [provenance] = suggestion.provenance
        return provenance.params["target"]

    assert target(60) == "7"  # round(6 * 2 * 60/99)
    assert target() == "12"


# --- Rule 0 command zone -----------------------------------------------------
# The deck may field more commanders than the anchor — partners, backgrounds,
# Rule 0 extras. The extras are deliberately unvalidated (the request cap is
# the guard), widen the derived identity to the union of all commanders'
# colours, and join the channels' exclusion list.


def test_effective_commanders_orders_and_dedups():
    from deck_lab.suggestions import effective_commanders

    assert effective_commanders("a", ["b", "a", "c", "b"]) == ["a", "b", "c"]
    assert effective_commanders("a", None) == ["a"]
    assert effective_commanders(None, ["b", "b"]) == ["b"]
    assert effective_commanders(None, None) == []


def _stub_partners(monkeypatch):
    """Two known commanders; anything else the graph does not know."""
    from deck_lab import graph

    rows = {
        "cmdr": {"oracle_id": "cmdr", "name": "Partner A", "color_identity": ["W", "U"]},
        "partner": {"oracle_id": "partner", "name": "Partner B", "color_identity": ["R", "G"]},
    }
    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)
    monkeypatch.setattr(
        graph, "fetch_deck", lambda counts: [rows[oid] for oid in counts if oid in rows]
    )


def _record_edhrec(monkeypatch):
    """Enable the EDHREC channel and record what it is asked with."""
    from deck_lab import graph

    calls: list[tuple] = []

    def _channel_edhrec(commander_oracle_id, deck_oracle_ids, identity, pool_filter=None):
        calls.append((deck_oracle_ids, identity))
        return []

    monkeypatch.setattr(graph, "has_recommendations", lambda oid: True)
    monkeypatch.setattr(graph, "channel_edhrec", _channel_edhrec)
    return calls


def test_partner_identities_union_in_wubrg_order(monkeypatch):
    """The latent partner bug: a WU+RG deck was scoped to the anchor's WU."""
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    calls = _record_edhrec(monkeypatch)

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert calls[0][1] == ["W", "U", "R", "G"]
    assert report.identity == ["W", "U", "R", "G"]


def test_an_explicit_override_still_beats_the_union(monkeypatch):
    """Rule 0 colours outrank the command zone's own, exactly as they outrank
    a single commander's."""
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    calls = _record_edhrec(monkeypatch)

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        identity=["B"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert calls[0][1] == ["B"]
    assert report.identity == ["B"]


def test_every_commander_joins_the_channel_exclusion_list(monkeypatch):
    """No channel may ever offer a commander as an add — even for a caller
    whose card list does not include the command zone."""
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    calls = _record_edhrec(monkeypatch)

    suggest(
        ["x1"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert set(calls[0][0]) >= {"x1", "cmdr", "partner"}


def test_the_report_names_every_commander(monkeypatch):
    """Resolved names, anchor first; an extra the graph does not know is
    simply absent rather than an error — Rule 0 permits odd commanders."""
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner", "ghost"],
        diagnostics=_EmptyDiagnostics(),
        channels={"basic_lands"},
        include_combos=False,
    )

    assert report.commander == "Partner A"
    assert report.commanders == ["Partner A", "Partner B"]


# --- multi-commander EDHREC --------------------------------------------------
# Each seat in the command zone has its own EDHREC page: the channel runs once
# per effective commander, `_merge` unions the pools, and the cold/tombstoned
# three-way is judged seat by seat — every cold seat gets its own note.


def test_channel_edhrec_runs_once_per_effective_commander(monkeypatch):
    """One query per seat, anchor first; an extra the graph does not know is
    skipped rather than queried — it has no page to ask for."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: True)

    asked: list[str] = []

    def _channel_edhrec(commander_oracle_id, deck_oracle_ids, identity, pool_filter=None):
        asked.append(commander_oracle_id)
        return []

    monkeypatch.setattr(graph, "channel_edhrec", _channel_edhrec)

    suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner", "ghost"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert asked == ["cmdr", "partner"]


def _edhrec_row(oracle_id, name):
    return {"oracle_id": oracle_id, "name": name, "synergy": 0.2, "inclusion_rate": 0.5}


def test_merged_edhrec_pools_dedup_and_name_their_recommender(monkeypatch):
    """A card both pages recommend keeps one row and gains provenance; each
    entry names the seat whose page argued for it, so a three-commander UI
    can say who recommended a card."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: True)
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])

    rows = {
        "cmdr": [_edhrec_row("shared", "Shared Hit"), _edhrec_row("a-only", "A Only")],
        "partner": [_edhrec_row("shared", "Shared Hit")],
    }
    monkeypatch.setattr(
        graph, "channel_edhrec", lambda cid, deck, identity, pool_filter=None: rows[cid]
    )

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert sorted(s.oracle_id for s in report.suggestions) == ["a-only", "shared"]
    shared = next(s for s in report.suggestions if s.oracle_id == "shared")
    assert [p.params["commander"] for p in shared.provenance] == ["Partner A", "Partner B"]


def test_a_single_commander_keeps_the_historical_provenance_shape(monkeypatch):
    """N=1 is byte-identical to before the loop: no commander param, and the
    detail still reads "% of decks" rather than naming the only seat."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: True)
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])
    monkeypatch.setattr(
        graph,
        "channel_edhrec",
        lambda cid, deck, identity, pool_filter=None: [_edhrec_row("hit", "The Hit")],
    )

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    [provenance] = report.suggestions[0].provenance
    assert "commander" not in provenance.params
    assert provenance.detail.endswith("% of decks")


def test_each_cold_commander_gets_its_own_pending_note(monkeypatch):
    """Two cold seats, two notes, each naming its commander — and with
    `allow_network=False` no HTTP ever, exactly as for a single seat."""
    from deck_lab import edhrec, graph
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(graph, "channel_edhrec", lambda *a, **kw: [])
    monkeypatch.setattr(edhrec, "is_tombstoned", lambda name: False)

    def fail_if_called(name, *, force=False):
        raise AssertionError("ingest_commander must not be called when allow_network=False")

    monkeypatch.setattr(edhrec, "ingest_commander", fail_if_called)

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
        allow_network=False,
    )

    pending = [n for n in report.notes if n.code == "edhrec-pending"]
    assert [n.params["commander"] for n in pending] == ["Partner A", "Partner B"]
    assert not any(n.code == "edhrec-missing" for n in report.notes)


def test_a_tombstoned_seat_reads_missing_while_the_other_stays_pending(monkeypatch):
    """The three-way is judged per seat: EDHREC already said no to one page,
    and that answer must not colour the seat whose warm is still on its way."""
    from deck_lab import edhrec, graph
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(graph, "channel_edhrec", lambda *a, **kw: [])
    monkeypatch.setattr(edhrec, "is_tombstoned", lambda name: name == "Partner B")

    report = suggest(
        ["cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
        allow_network=False,
    )

    pending = [n.params["commander"] for n in report.notes if n.code == "edhrec-pending"]
    missing = [n.params["commander"] for n in report.notes if n.code == "edhrec-missing"]
    assert pending == ["Partner A"]
    assert missing == ["Partner B"]


def test_a_single_cold_commander_still_emits_exactly_one_note(monkeypatch):
    """N=1 keeps today's single-note behaviour — the loop must not double it."""
    from deck_lab import edhrec, graph
    from deck_lab.suggestions import suggest

    _stub_commander(monkeypatch)
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: False)
    monkeypatch.setattr(graph, "channel_edhrec", lambda *a, **kw: [])
    monkeypatch.setattr(edhrec, "is_tombstoned", lambda name: False)

    report = suggest(
        ["cmdr"],
        [],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
        allow_network=False,
    )

    pending = [n for n in report.notes if n.code == "edhrec-pending"]
    assert len(pending) == 1
    assert pending[0].params["commander"] == "Test Commander"
    assert not any(n.code == "edhrec-missing" for n in report.notes)


def test_the_deck_vetoes_its_own_cards(monkeypatch):
    """The whole deck rides the exclusion binding the channels receive, so no
    channel ever offers a card the deck already has."""
    from deck_lab.suggestions import suggest

    _stub_partners(monkeypatch)
    calls = _record_edhrec(monkeypatch)

    suggest(
        ["x1", "cmdr", "partner"],
        [],
        commander_oracle_id="cmdr",
        commander_oracle_ids=["partner"],
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
    )

    assert set(calls[0][0]) >= {"x1", "cmdr", "partner"}
