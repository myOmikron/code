"""Theme derivation. Pure functions — no database."""

from __future__ import annotations

import pytest

from deck_lab.themes import (
    FIT_THRESHOLD,
    THEMES,
    UNLOCK_WEIGHT,
    Theme,
    build_idf,
    consistency,
    deck_theme_breakdown,
    deck_theme_profile,
    deck_typal_profile,
    expand,
    theme_fit,
    typal_density,
    unsupported_weights,
)
from deck_lab.vocabulary import Resource as R

FLAT_IDF = dict.fromkeys(R, 1.0)


def _theme(**kwargs) -> Theme:
    base = {
        "id": "t",
        "label": "T",
        "requires_any": (R.LANDFALL_TRIGGER,),
        "weights": {R.LANDFALL_TRIGGER: 1.0},
        "why": "",
        "gate_on": "cares",
    }
    return Theme(**{**base, **kwargs})


# --- vocabulary integrity -------------------------------------------------


def test_every_theme_has_a_gate_and_weights():
    for theme in THEMES.values():
        assert theme.requires_any, theme.id
        assert theme.weights, theme.id
        assert theme.why.strip(), theme.id


def test_gate_resources_are_weighted():
    """A gate resource with no weight would admit cards it then scores at zero."""
    for theme in THEMES.values():
        assert set(theme.requires_any) & set(theme.weights), theme.id


def test_gate_on_is_a_known_side():
    for theme in THEMES.values():
        assert theme.gate_on in {"cares", "produces", "either"}, theme.id
        assert theme.retrieve_on in {None, "cares", "produces", "either"}, theme.id


def test_theme_ids_match_their_keys():
    for key, theme in THEMES.items():
        assert key == theme.id


# --- hierarchy expansion --------------------------------------------------


def test_expand_pulls_in_ancestors():
    """A Treasure producer must reach an artifacts theme."""
    expanded = expand({R.TREASURE})

    assert R.ARTIFACT_TOKEN in expanded
    assert R.ARTIFACT_MATTERS in expanded
    assert R.RITUAL_MANA in expanded


def test_expand_keeps_the_original():
    assert R.TREASURE in expand({R.TREASURE})


# --- the gate -------------------------------------------------------------


def test_gate_blocks_a_card_with_no_matching_resource():
    assert theme_fit(set(), {R.CARD_DRAW}, _theme(), FLAT_IDF) == 0.0


def test_payoff_gate_ignores_production():
    """The bug this exists to prevent: a deck of ramp spells is not a landfall
    deck. Ramp *produces* landfall triggers; it does not care about them."""
    ramp = theme_fit({R.LANDFALL_TRIGGER}, set(), _theme(gate_on="cares"), FLAT_IDF)
    payoff = theme_fit(set(), {R.LANDFALL_TRIGGER}, _theme(gate_on="cares"), FLAT_IDF)

    assert ramp == 0.0
    assert payoff > 0.0


def test_retrieval_gate_admits_the_fuel_detection_refuses():
    """Landfall's two questions get two answers: a fetchland — produces
    `landfall_trigger`, cares about nothing — must not make a deck read as
    landfall, and must still be retrievable *for* one. Before `retrieve_on`,
    the theme channel knew every payoff and none of the fuel."""
    landfall = THEMES["landfall"]
    fetch = ({R.LANDFALL_TRIGGER, R.LAND_RAMP}, set())

    assert theme_fit(*fetch, landfall, FLAT_IDF) == 0.0
    assert theme_fit(*fetch, landfall, FLAT_IDF, retrieval=True) > 0.0


def test_retrieval_gate_defaults_to_the_detection_gate():
    """A theme that declares no `retrieve_on` answers both questions the same
    way — stompy's incidental-fatties guard must hold for retrieval too until
    someone decides otherwise per theme."""
    stompy = THEMES["stompy"]

    assert theme_fit({R.HIGH_POWER}, set(), stompy, FLAT_IDF, retrieval=True) == 0.0


def test_stompy_gates_on_intent_not_bodies():
    """The incidental-fatties guard, pinned against the real definition: every
    creature printed at power 4+ produces `high_power` structurally, so a
    produces gate would fire on a third of all creature decks. Only the
    payoff side — Ferocious checks, Fling, cheat effects — opens the gate;
    once open, the bodies score through the weights."""
    stompy = THEMES["stompy"]

    body_only = theme_fit({R.HIGH_POWER}, set(), stompy, FLAT_IDF)
    payoff = theme_fit(set(), {R.HIGH_POWER}, stompy, FLAT_IDF)

    assert body_only == 0.0
    assert payoff > 0.0


def test_supply_gate_reads_the_other_side():
    """Nothing in Magic cares about a counterspell, so a payoff gate would
    never fire for a supply-defined theme."""
    supply = _theme(
        requires_any=(R.MILL_OPPONENT,), weights={R.MILL_OPPONENT: 1.0}, gate_on="produces"
    )

    assert theme_fit({R.MILL_OPPONENT}, set(), supply, FLAT_IDF) > 0.0
    assert theme_fit(set(), {R.MILL_OPPONENT}, supply, FLAT_IDF) == 0.0


def test_gate_passes_through_the_hierarchy():
    artifacts = _theme(requires_any=(R.ARTIFACT_MATTERS,), weights={R.ARTIFACT_MATTERS: 1.0})
    assert theme_fit(set(), {R.TREASURE}, artifacts, FLAT_IDF) > 0.0


def test_weights_read_both_sides_once_the_gate_is_open():
    """Supplying a resource and paying it off both count toward fit."""
    theme = _theme(weights={R.LANDFALL_TRIGGER: 1.0, R.LAND_RAMP: 1.0})

    both = theme_fit({R.LAND_RAMP}, {R.LANDFALL_TRIGGER}, theme, FLAT_IDF)
    payoff_only = theme_fit(set(), {R.LANDFALL_TRIGGER}, theme, FLAT_IDF)

    assert both > payoff_only


# --- IDF ------------------------------------------------------------------


def test_idf_ranks_a_rare_resource_above_a_common_one():
    idf = build_idf({str(R.EVASION): 5773, str(R.LANDFALL_TRIGGER): 646}, 31623)
    assert idf[R.LANDFALL_TRIGGER] > idf[R.EVASION]


def test_idf_discriminates_between_two_cards():
    """Without IDF, 'has evasion' is evidence as strong as 'triggers on landfall'."""
    idf = build_idf({str(R.EVASION): 20000, str(R.LANDFALL_TRIGGER): 100}, 31623)
    theme = _theme(weights={R.LANDFALL_TRIGGER: 1.0, R.EVASION: 1.0})

    rare = theme_fit(set(), {R.LANDFALL_TRIGGER}, theme, idf)
    common = theme_fit(set(), {R.LANDFALL_TRIGGER, R.EVASION}, theme, idf)

    assert common > rare  # both matched, so more is more
    assert rare / common > 0.7  # but the rare term carries most of the weight


def test_unseen_resource_scores_zero_not_maximum():
    """An unseen resource must not inflate a theme's ceiling.

    This asserted `> 0` and encoded the defect. No card can match a resource
    with no edges, so its IDF only ever reaches the ceiling — where the maximum
    value suppresses the theme entirely.
    """
    idf = build_idf({}, 31623)
    assert all(value == 0.0 for value in idf.values())


def test_a_dead_weight_does_not_suppress_its_theme():
    """The Typal regression, at the shape that caused it.

    `tribal_lord` had zero edges and weight 1.0 in the Typal theme. With
    `log(N/1)` it contributed 10.37 to a ceiling of 11.30, and a card matching
    the theme's real resource scored 0.043 against a 0.12 threshold — so Typal
    fired on 0 of 32,029 cards and read as taste rather than a bug.
    """
    counts = {str(R.TRIBAL_PAYOFF): 18623, str(R.CREATURE_TOKEN): 3643}  # no tribal_lord
    idf = build_idf(counts, 32029)
    theme = _theme(
        requires_any=(R.TRIBAL_PAYOFF,),
        weights={R.TRIBAL_LORD: 1.0, R.TRIBAL_PAYOFF: 0.9, R.CREATURE_TOKEN: 0.2},
    )

    fit = theme_fit(set(), {R.TRIBAL_PAYOFF}, theme, idf)
    assert fit >= FIT_THRESHOLD, "a live resource must still carry its theme"


def test_unsupported_weights_names_the_dead_resource():
    counts = {str(R.TRIBAL_PAYOFF): 18623}
    dead = unsupported_weights(counts)
    # Every real theme is reported against a corpus that only has one resource,
    # so the assertion is about the shape rather than a specific theme.
    assert dead, "a corpus missing almost every resource must be reported"
    assert all(isinstance(resources, list) for resources in dead.values())


# --- profile and consistency ----------------------------------------------


def test_profile_is_a_distribution():
    profile = deck_theme_profile(
        [(set(), {R.LANDFALL_TRIGGER}), (set(), {R.PLUS_ONE_COUNTER})], FLAT_IDF
    )
    assert sum(profile.values()) == pytest.approx(1.0)


def test_profile_is_empty_for_a_themeless_deck():
    assert deck_theme_profile([(set(), set())], FLAT_IDF) == {}


def test_breakdown_counts_the_cards_behind_each_share():
    deck = [(set(), {R.LANDFALL_TRIGGER})] * 3 + [(set(), {R.PLUS_ONE_COUNTER})]
    profile, evidence = deck_theme_breakdown(deck, FLAT_IDF)

    assert evidence.total == 4
    assert evidence.themed == 4
    assert evidence.cards["landfall"] == 3
    assert profile["landfall"] > profile["counters"]


def test_breakdown_says_how_little_deck_is_behind_a_confident_share():
    # Two themed cards in a hundred still make a distribution summing to one;
    # only the counts can say the deck is not actually about anything.
    deck = [(set(), {R.LANDFALL_TRIGGER})] * 2 + [(set(), set())] * 98
    profile, evidence = deck_theme_breakdown(deck, FLAT_IDF)

    assert profile["landfall"] == pytest.approx(1.0)
    assert evidence.themed == 2
    assert evidence.total == 100


def test_breakdown_ignores_a_card_that_only_brushes_a_theme(monkeypatch):
    # One gate resource out of a theme built on ten: the card is in the
    # profile, because it does score, and out of the count, because a card
    # that grazes a theme is not a card playing it.
    weights = {R.LANDFALL_TRIGGER: 1.0, R.EXTRA_LAND_DROP: 10.0}
    brushed = _theme(id="brushed", weights=weights)
    monkeypatch.setattr("deck_lab.themes.THEMES", {"brushed": brushed})

    profile, evidence = deck_theme_breakdown([(set(), {R.LANDFALL_TRIGGER})], FLAT_IDF)

    assert theme_fit(set(), {R.LANDFALL_TRIGGER}, brushed, FLAT_IDF) < FIT_THRESHOLD
    assert profile["brushed"] == pytest.approx(1.0)
    assert evidence.cards == {}
    assert evidence.themed == 0


def test_breakdown_and_profile_agree():
    deck = [(set(), {R.LANDFALL_TRIGGER}), (set(), {R.PLUS_ONE_COUNTER})]

    assert deck_theme_breakdown(deck, FLAT_IDF)[0] == deck_theme_profile(deck, FLAT_IDF)


def test_consistency_is_one_for_a_single_theme():
    assert consistency({"landfall": 1.0}) == 1.0


def test_consistency_falls_as_themes_spread():
    focused = consistency({"a": 0.8, "b": 0.1, "c": 0.1})
    scattered = consistency({"a": 0.34, "b": 0.33, "c": 0.33})

    assert focused > scattered
    # Near-uniform, so near zero — but not exactly, since 0.34/0.33/0.33 is not
    # a perfectly flat distribution.
    assert scattered == pytest.approx(0.0, abs=1e-3)


def test_consistency_of_nothing_is_zero():
    assert consistency({}) == 0.0


def test_relative_idf_centres_on_one():
    """Raw IDF would make the bridge several times louder relative to EDHREC, so
    a recall change would be a volume change rather than a ranking change.
    Centring on the mean keeps WEIGHT_BRIDGE meaningful."""
    from deck_lab.themes import build_relative_idf

    counts = {str(R.EVASION): 5773, str(R.LANDFALL_TRIGGER): 646}
    rel = build_relative_idf(counts, 31948)
    populated = [rel[r] for r in (R.EVASION, R.LANDFALL_TRIGGER)]
    assert abs(sum(populated) / len(populated) - 1.0) < 1e-9


def test_relative_idf_preserves_the_ordering_of_raw_idf():
    from deck_lab.themes import build_relative_idf

    counts = {str(R.EVASION): 5773, str(R.LANDFALL_TRIGGER): 646}
    rel = build_relative_idf(counts, 31948)
    assert rel[R.LANDFALL_TRIGGER] > rel[R.EVASION]


def test_relative_idf_excludes_unpopulated_resources_from_the_mean():
    """An unpopulated resource carries the maximum possible IDF and no real
    match can reach it, so averaging it in would drag every real weight down."""
    from deck_lab.themes import build_relative_idf

    counts = {str(R.EVASION): 5773, str(R.LANDFALL_TRIGGER): 646}
    rel = build_relative_idf(counts, 31948)
    # Every populated resource sits within a factor of ~4 of the mean; if the
    # 80-odd empty resources were counted, all real weights would fall far below 1.
    assert 0.1 < rel[R.EVASION] < 1.0
    assert 1.0 < rel[R.LANDFALL_TRIGGER] < 4.0


def test_no_theme_is_dominated_by_one_weight():
    """The general form of the Typal bug, as a standing guard.

    Fit is normalised by the sum of `weight * idf` across all of a theme's
    weights, so a rare resource with a high weight dominates that sum and drags
    every real match toward zero. `tribal_lord` at 92% of Typal's ceiling was
    the fatal case; `extra_combat` at 47% of aggro's is the survivable one.
    """
    from deck_lab.themes import CEILING_DOMINANCE, dominant_weights

    # Real corpus shape, not a flat IDF — the failure only appears when rare
    # resources actually carry a high IDF.
    counts = {
        str(R.EXTRA_COMBAT): 45,
        str(R.COMBAT_DAMAGE_TRIGGER): 1918,
        str(R.ATTACK_TRIGGER): 2964,
        str(R.HASTE_GRANT): 856,
        str(R.POWER_BOOST): 3436,
        str(R.EVASION): 5773,
    }
    idf = build_idf(counts, 32029)
    flagged = dominant_weights(idf)

    assert "aggro" in flagged, (
        "extra_combat sits on 45 cards at weight 1.0 and carries ~47% of aggro's "
        "ceiling — this guard exists to notice that shape"
    )
    assert flagged["aggro"][0][1] > CEILING_DOMINANCE


# --- commander anchoring ---------------------------------------------------


def test_commander_anchoring_lifts_the_theme_the_commander_is_about():
    """Someone building Krenko is building Goblins, not burn.

    The commander is one card in a hundred, so without an anchor a half-built
    list reads as whatever its 40 cards happen to be.
    """
    deck = [
        (set(), {R.LANDFALL_TRIGGER}),
        (set(), {R.PLUS_ONE_COUNTER}),
        (set(), {R.PLUS_ONE_COUNTER}),
        (set(), {R.PLUS_ONE_COUNTER}),
    ]
    plain = deck_theme_profile(deck, FLAT_IDF)
    anchored = deck_theme_profile(deck, FLAT_IDF, commander=(set(), {R.LANDFALL_TRIGGER}))

    assert anchored["landfall"] > plain["landfall"]
    assert sum(anchored.values()) == pytest.approx(1.0)


def test_commander_anchoring_does_not_invent_a_theme_from_nothing():
    """A Krenko list with no Goblins is a Goblin deck with a gap, not a Goblin
    deck. The anchor is multiplicative so it cannot conjure absent mass."""
    deck = [(set(), {R.PLUS_ONE_COUNTER})]
    anchored = deck_theme_profile(deck, FLAT_IDF, commander=(set(), {R.LANDFALL_TRIGGER}))
    assert "landfall" not in anchored


# --- commander-anchored supply gating (`SUPPLY-GATE-PLAN.md`) --------------
#
# Y'shtola, Vivi, Kaalia: decks that are all supply for a resource their own
# commander is the payoff for. Under the plain cares gate the only card in
# such a deck that ever opens the gate is the commander itself, so the deck
# reads at ~0.04 no matter how many of the actual cards are in the 99. These
# pin the fix at both layers: `theme_fit`'s flag in isolation, and the
# `deck_theme_breakdown` computation that decides which themes a commander
# unlocks and from which side of it.


def test_commander_backed_widens_a_cares_gated_theme():
    """Isolated at the fit level: a card that only supplies the resource
    scores zero on a cares-gated theme until `commander_backed` opens the
    other side of the gate — the existing `either` branch, scoped to one
    card's evaluation rather than the theme's definition."""
    theme = _theme()  # gate_on="cares", requires_any=(R.LANDFALL_TRIGGER,)

    supply_only = theme_fit({R.LANDFALL_TRIGGER}, set(), theme, FLAT_IDF)
    unlocked = theme_fit({R.LANDFALL_TRIGGER}, set(), theme, FLAT_IDF, commander_backed=True)

    assert supply_only == 0.0
    assert unlocked > 0.0


def test_commander_cares_unlocks_a_supply_only_card_for_detection(monkeypatch):
    """The full pipeline, Y'shtola's shape: a produces-only card is invisible
    to a cares-gated theme until its own commander cares about a resource the
    theme weighs — then the deck's supply of it becomes detection evidence."""
    theme = _theme(weights={R.LANDFALL_TRIGGER: 1.0, R.LAND_RAMP: 0.5})
    monkeypatch.setattr("deck_lab.themes.THEMES", {"t": theme})
    deck = [({R.LANDFALL_TRIGGER}, set())]  # produces only, cares about nothing

    plain, _ = deck_theme_breakdown(deck, FLAT_IDF)
    unlocked, _ = deck_theme_breakdown(deck, FLAT_IDF, commander=(set(), {R.LANDFALL_TRIGGER}))

    assert "t" not in plain
    assert unlocked.get("t", 0) > 0


def test_commander_producing_the_resource_does_not_unlock_it(monkeypatch):
    """Producing a resource is supply, not intent: only the commander's own
    `cares_about` (index 1) can unlock a theme for the deck, never what the
    commander merely makes — and with no commander at all, nothing unlocks."""
    theme = _theme(weights={R.LANDFALL_TRIGGER: 1.0, R.LAND_RAMP: 0.5})
    monkeypatch.setattr("deck_lab.themes.THEMES", {"t": theme})
    deck = [({R.LANDFALL_TRIGGER}, set())]

    produces_only, _ = deck_theme_breakdown(deck, FLAT_IDF, commander=({R.LANDFALL_TRIGGER}, set()))
    no_commander, _ = deck_theme_breakdown(deck, FLAT_IDF)

    assert "t" not in produces_only
    assert "t" not in no_commander


def test_unlock_requires_the_weight_to_clear_the_floor(monkeypatch):
    """Round 2 (`SUPPLY-GATE-RESULTS.md`): `creature_token` sits in `tribal`'s
    weights at 0.2 — ranking calibration, not coverage — and unlocking from
    it flipped Caesar and Breya, two token/artifact commanders with no typal
    identity, to a false `tribal` top theme. A commander caring about a
    resource weighted below `UNLOCK_WEIGHT` must not unlock the theme, even
    though the resource is a real member of its weights; a resource weighted
    exactly at the floor — `cast_trigger` in `spellslinger`'s real 0.4, the
    Vivi case the weights rule exists for — still must."""
    theme = _theme(
        weights={R.LANDFALL_TRIGGER: 1.0, R.LAND_RAMP: 0.2, R.EXTRA_LAND_DROP: UNLOCK_WEIGHT}
    )
    monkeypatch.setattr("deck_lab.themes.THEMES", {"t": theme})
    deck = [({R.LANDFALL_TRIGGER}, set())]  # produces only, cares about nothing

    below_floor = deck_theme_breakdown(deck, FLAT_IDF, commander=(set(), {R.LAND_RAMP}))[0]
    at_floor = deck_theme_breakdown(deck, FLAT_IDF, commander=(set(), {R.EXTRA_LAND_DROP}))[0]

    assert "t" not in below_floor
    assert at_floor.get("t", 0) > 0


def test_commander_backed_never_widens_a_produces_gated_theme():
    """The constraint holds even if a produces-gated theme were wrongly
    marked unlocked: `theme_fit`'s `gate_on == "produces"` branch is checked
    before `commander_backed` is ever read, so a supply-defined theme cannot
    be widened by it, commander regardless."""
    supply = _theme(
        requires_any=(R.MILL_OPPONENT,), weights={R.MILL_OPPONENT: 1.0}, gate_on="produces"
    )
    assert theme_fit(set(), {R.MILL_OPPONENT}, supply, FLAT_IDF, commander_backed=True) == 0.0


def test_commander_backed_does_not_reach_retrieval():
    """Detection's widening must not leak into the retrieval gate, which
    already has its own answer via `retrieve_on` — the two questions
    (`deck_theme_breakdown`'s docstring) must stay answerable independently."""
    theme = _theme()
    without = theme_fit({R.LANDFALL_TRIGGER}, set(), theme, FLAT_IDF, retrieval=True)
    with_flag = theme_fit(
        {R.LANDFALL_TRIGGER}, set(), theme, FLAT_IDF, retrieval=True, commander_backed=True
    )
    assert without == with_flag == 0.0


def test_commander_unlock_reads_weights_not_just_requires_any():
    """`cast_trigger` carries weight 0.4 in `spellslinger` without being one
    of its four gate resources (storm, copy, magecraft, prowess) — Vivi cares
    about casts, not any single one of those directly, and only the wider
    weights set (which `test_gate_resources_are_weighted` already guarantees
    is a superset of the gates) is what catches her."""
    spellslinger = THEMES["spellslinger"]
    assert R.CAST_TRIGGER not in spellslinger.requires_any
    assert R.CAST_TRIGGER in spellslinger.weights


# --- typal -----------------------------------------------------------------


def test_typal_density_ranks_archetypes_above_common_types():
    """The measurement that decided this metric: type-IDF ranks Shaman above
    Goblin, because rarity cannot tell an uncommon type from a real archetype.
    Payoff density can."""
    bodies = {"Human": 4485, "Goblin": 518, "Sliver": 115, "Shaman": 486}
    payoffs = {"Human": 81, "Goblin": 79, "Sliver": 109, "Shaman": 4}
    density = typal_density(bodies, payoffs)

    assert density["Sliver"] > density["Goblin"] > density["Human"]
    assert density["Goblin"] > density["Shaman"]


def test_typal_density_shrinks_small_samples_toward_the_mean():
    """Three bodies and two payoffs is a small sample, not a stronger archetype
    than Goblins.

    The corpus needs its real shape for this to mean anything: the prior pulls
    toward the *population* mean, so a two-type corpus where Goblin happens to
    sit below the mean proves nothing. Real corpus density is ~0.098.
    """
    bodies = {"Goblin": 518, "Nautilus": 3, **{f"Filler{i}": 500 for i in range(30)}}
    payoffs = {"Goblin": 79, "Nautilus": 2, **{f"Filler{i}": 45 for i in range(30)}}
    density = typal_density(bodies, payoffs)

    assert density["Goblin"] > density["Nautilus"]
    # Shrunk hard: raw Nautilus density is 0.667, five times Goblin's.
    assert density["Nautilus"] < 0.667 / 3


def test_typal_profile_is_not_dominated_by_incidental_types():
    """Forty Humans in a Goblin deck must not make it a Human deck."""
    density = typal_density({"Human": 4485, "Goblin": 518}, {"Human": 81, "Goblin": 79})
    cards = [({"Human"}, set(), set())] * 40 + [({"Goblin"}, set(), set())] * 20
    profile = deck_typal_profile(cards, density)
    assert profile.get("Goblin", 0) > profile.get("Human", 0)


def test_typal_profile_anchors_on_the_commander():
    density = typal_density({"Human": 4485, "Goblin": 518}, {"Human": 81, "Goblin": 79})
    cards = [({"Human"}, set(), set())] * 30 + [({"Goblin"}, set(), set())] * 10
    plain = deck_typal_profile(cards, density)
    anchored = deck_typal_profile(cards, density, commander_types=({"Goblin"}, {"Goblin"}))
    assert anchored["Goblin"] > plain.get("Goblin", 0)


def test_typal_profile_is_empty_for_a_deck_with_no_tribe():
    """A pile of one-of creatures has no typal identity, and the profile must
    say nothing rather than pick the most numerous type line."""
    density = typal_density({f"T{i}": 400 for i in range(20)}, {f"T{i}": 8 for i in range(20)})
    cards = [({f"T{i}"}, set(), set()) for i in range(20)]
    assert deck_typal_profile(cards, density) == {}


def test_typal_profile_gates_on_supply():
    """A Dragon lord and no Dragons is not a Dragon deck.

    Measured on a real Krenko list before the gate existed: two Dragon payoffs
    against zero Dragon bodies scored 42% and outranked 18 Goblins, because an
    ungated payoff weight beats eighteen bodies at density 0.15.
    """
    density = typal_density({"Goblin": 518, "Dragon": 421}, {"Goblin": 79, "Dragon": 94})
    cards = [({"Goblin"}, set(), set())] * 18 + [(set(), {"Dragon"}, set())] * 2
    profile = deck_typal_profile(cards, density)

    assert "Dragon" not in profile
    assert profile["Goblin"] == pytest.approx(1.0)


def test_token_makers_count_as_supply():
    """Chatterfang has no Squirrels in the list and is a Squirrel deck."""
    density = typal_density({"Squirrel": 60, "Human": 4485}, {"Squirrel": 20, "Human": 81})
    cards = [(set(), {"Squirrel"}, {"Squirrel"})] + [({"Human"}, set(), set())] * 8
    profile = deck_typal_profile(cards, density)
    assert profile.get("Squirrel", 0) > 0


def test_either_gate_reads_both_sides():
    """Some archetypes are the loop, not one end of it.

    3,114 cards produce `plus_one_counter` and 1,301 care about it, so a payoff
    gate cannot see a commander that only makes them. Flipping to `produces`
    is not the fix — it darkens the ones that only pay them off.
    """
    theme = _theme(
        requires_any=(R.PLUS_ONE_COUNTER,), weights={R.PLUS_ONE_COUNTER: 1.0}, gate_on="either"
    )

    assert theme_fit({R.PLUS_ONE_COUNTER}, set(), theme, FLAT_IDF) > 0.0  # maker
    assert theme_fit(set(), {R.PLUS_ONE_COUNTER}, theme, FLAT_IDF) > 0.0  # payoff
    assert theme_fit(set(), {R.CARD_DRAW}, theme, FLAT_IDF) == 0.0  # neither


def test_tokens_theme_reads_the_supply_side():
    """A deck full of token makers is a token deck.

    Under the default cares gate, the only thing in the corpus that cared
    about `creature_token` was a sacrifice outlet, so a go-wide list gated on
    its handful of sac outlets and nothing else. Measured on a 97-card Baylen
    list: 43 token makers, 6% tokens, behind tribal and counters.
    """
    tokens = THEMES["tokens"]
    maker = theme_fit({R.CREATURE_TOKEN}, set(), tokens, FLAT_IDF)

    assert tokens.gate_on == "either"
    assert maker >= FIT_THRESHOLD


def test_tokens_ceiling_is_mostly_the_resource_it_is_named_for():
    """`token_copy` (121 cards) and `populate` (26) had 75.7% of the ceiling.

    The `tribal_lord` failure in its survivable form: the theme still fired,
    but IDF on two near-empty resources left `creature_token` carrying 18.6%
    of its own theme, so a card that both made and paid off tokens could not
    score above 0.24.
    """
    idf = build_idf(
        {"creature_token": 2144, "token_copy": 121, "populate": 26, "power_boost": 2167},
        32041,
    )
    tokens = THEMES["tokens"]
    ceiling = sum(w * idf[r] for r, w in tokens.weights.items())
    shares = {r: w * idf[r] / ceiling for r, w in tokens.weights.items()}

    assert shares[R.CREATURE_TOKEN] == max(shares.values())
    assert max(shares.values()) < 0.40  # CEILING_DOMINANCE


def test_treasure_theme_reads_the_supply_side():
    """190 cards make Treasure, 49 care about it.

    Under the cares gate the theme was `synergy-treasure` and nothing else:
    Smothering Tithe and Old Gnawbone were not members, and neither was any
    ritual — in a theme named "Treasure & ritual mana". A wrong `mana-sink`
    mapping had been supplying the gate by accident.
    """
    treasure = THEMES["treasure"]

    assert treasure.gate_on == "either"
    assert theme_fit({R.TREASURE}, set(), treasure, FLAT_IDF) >= FIT_THRESHOLD
    assert theme_fit({R.RITUAL_MANA}, set(), treasure, FLAT_IDF) >= FIT_THRESHOLD


def test_spellslinger_retrieves_on_either_side():
    """Its own cheap spells care about nothing and were outside its channel.

    Opt, Brainstorm, Manamorphose and Goblin Electromancer produce cast,
    magecraft and prowess triggers and want nothing back, so a cares-only
    retrieval gate scored EDHREC's spellslinger list 2/10 and its storm list
    3/10. The landfall fix applies unchanged: detection asks whether the deck
    *is* the theme, retrieval asks what belongs in one that is.
    """
    assert THEMES["spellslinger"].gate_on == "cares"
    assert THEMES["spellslinger"].retrieve_on == "either"


def test_voltron_retrieves_on_either_side():
    """Its misses were the Equipment and Auras themselves, not payoffs.

    Swiftfoot Boots, Lightning Greaves, Rancor and Sword of the Animist sit on
    the produces side a cares-only gate never reads, so a voltron deck's
    channel could not reach the cards a voltron deck is made of. EDHREC:
    5/10 -> 7/10 voltron, 8/10 -> 9/10 equipment, 6/10 -> 7/10 auras.
    """
    assert THEMES["voltron"].gate_on == "cares"
    assert THEMES["voltron"].retrieve_on == "either"


def test_no_theme_rests_on_a_single_weight():
    """A one-resource map scores every member exactly 1.0 — a constant, not a score.

    `vehicles` did, and it made Sram read `vehicles 1.0` above `voltron 0.73`
    when he draws off all three. `legends` carries the same calibration for
    the same reason; this pins it for every theme so the next single-resource
    definition cannot land without it.
    """
    for theme in THEMES.values():
        assert len(theme.weights) > 1, theme.id


def test_vehicles_does_not_reach_for_artifacts():
    """The false positive the theme exists to let people turn off.

    `artifact_matters` measures the higher lift (4.92x against the combat
    resources' 2-3x) and stays out: a deck that plays artifacts must be able
    to say "not the vehicles" without saying "not the artifacts".
    """
    assert R.ARTIFACT_MATTERS not in THEMES["vehicles"].weights
    assert R.CREATURE_TOKEN not in THEMES["vehicles"].weights


def test_tap_matters_detects_on_payoffs_and_retrieves_the_fuel():
    """`landfall`'s split, for `landfall`'s reason.

    A Vehicle produces `tap_own_creature` (crewing taps your creatures) and
    cares about nothing here, so a deck of Vehicles is a Vehicles deck, not a
    tap-matters deck — the same statement as "eight ramp spells are not
    landfall". Retrieval has to read the other side, because the Vehicle *is*
    what such a deck is short of: answering "you like tapping creatures" with
    more payoffs would be answering the wrong question.
    """
    tap_matters = THEMES["tap_matters"]
    vehicle = ({R.TAP_OWN_CREATURE, R.VEHICLE_MATTERS}, set())
    payoff = (set(), {R.TAP_OWN_CREATURE})

    assert theme_fit(*vehicle, tap_matters, FLAT_IDF) == 0.0
    assert theme_fit(*vehicle, tap_matters, FLAT_IDF, retrieval=True) > 0.0
    assert theme_fit(*payoff, tap_matters, FLAT_IDF) > 0.0


def test_keywords_detects_on_payoffs_and_retrieves_the_bodies():
    """A deck merely full of keyword-rich creatures is not the archetype —
    the same `vehicles` false positive. Odric and Kathril are the payoffs
    that make it one; the bodies are what the retrieval channel must reach
    for once it has."""
    keywords = THEMES["keywords"]
    body = ({R.KEYWORD_SOUP}, set())
    payoff = (set(), {R.KEYWORD_SOUP})

    assert theme_fit(*body, keywords, FLAT_IDF) == 0.0
    assert theme_fit(*body, keywords, FLAT_IDF, retrieval=True) > 0.0
    assert theme_fit(*payoff, keywords, FLAT_IDF) > 0.0


def test_keywords_gate_and_retrieve_on():
    keywords = THEMES["keywords"]
    assert keywords.gate_on == "cares"
    assert keywords.retrieve_on == "either"
    assert R.KEYWORD_SOUP in keywords.requires_any
    assert R.KEYWORD_SOUP in keywords.weights


def test_tap_matters_does_not_reach_for_untap_or_artifacts():
    """The two highest-lift terms left out, both deliberately.

    `untap_permanent` measures 17.7x over the theme's population and is
    `untap_combo`'s own 1.0 weight — and near-tautological here, since
    `tap-fuel-creature` maps to both sides and 86% of the population carries
    it. `artifact_matters` (2.9x) stays out for the reason `vehicles` gives:
    a deck that plays artifacts must be able to say "not this".
    """
    weights = THEMES["tap_matters"].weights

    assert R.UNTAP_PERMANENT not in weights
    assert R.UNTAP_CREATURE not in weights
    assert R.ARTIFACT_MATTERS not in weights


# --- counter kinds (`TOP50-COVERAGE.md` gap 6) ------------------------------


def test_counters_gate_is_unchanged_by_the_breadth_widening():
    """`counters` gained `experience_counter` and `charge_counter` in its
    weights this round, so such cards can score once a deck has already
    gated in on `plus_one_counter`/`proliferate`. The gate itself
    (`requires_any`) — and therefore what a bare +1/+1 deck detects and
    retrieves as — must be provably untouched: pinned byte-identical here so
    the breadth change can never silently become a gate change."""
    assert THEMES["counters"].requires_any == (R.PLUS_ONE_COUNTER, R.PROLIFERATE)


def test_counters_breadth_does_not_reach_for_energy_or_loyalty():
    """`energy` and `loyalty_counter` each have their own theme now
    (below); double-homing either here would be the exact overlap failure
    `wheels`/`discard` and `enchantress`/`aura_matters` measured and
    refused. `minus_one_counter` stays out too, per its own comment in
    vocabulary.py documenting the −1/−1 mis-membership a shared gate would
    recreate. Both new weights sit at 0.1, well below `UNLOCK_WEIGHT` (0.4)
    — measured down from the plan's literal 0.5/0.4 after the ceiling shift
    broke the D3 stability quartet; see the theme's own comment."""
    weights = THEMES["counters"].weights

    assert R.ENERGY not in weights
    assert R.LOYALTY_COUNTER not in weights
    assert R.MINUS_ONE_COUNTER not in weights
    assert weights[R.EXPERIENCE_COUNTER] == 0.1
    assert weights[R.CHARGE_COUNTER] == 0.1


def test_superfriends_gate_and_retrieve_on():
    """`gate_on="produces"` — the `poison` precedent, not the plan's literal
    "cares gate" — measured necessary to keep proliferate-only decks
    (Atraxa's default build) from opening this theme via the blanket
    `proliferate` rule's `CARES_ABOUT loyalty_counter` edge; see the theme's
    own comment for the full measurement."""
    superfriends = THEMES["superfriends"]
    assert superfriends.gate_on == "produces"
    assert superfriends.retrieve_on == "either"
    assert R.LOYALTY_COUNTER in superfriends.requires_any
    assert R.LOYALTY_COUNTER in superfriends.weights


def test_energy_theme_was_not_shipped():
    """Built and measured (`themes.py`'s trailing comment) but dropped on
    its own overlap check against `counters` — 93.2% of its either-population
    also clears `counters`' `FITS_THEME`, the `discard`/`reanimator`
    precedent. No `energy` key should ever silently reappear without a fresh
    overlap measurement."""
    assert "energy" not in THEMES
