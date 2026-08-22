"""Playability and the game-changer flag."""

from __future__ import annotations

import pytest

from deck_lab.power import RANK_CEILING, describe, playability, weight_within_group


def test_a_staple_outscores_an_obscure_card():
    """The question this exists to answer: Smothering Tithe (rank 63) and a
    common that makes one Treasure both PRODUCES treasure, and the bridge
    treated them identically."""
    assert playability(63) > playability(5194) > playability(27670)


def test_unranked_scores_zero():
    assert playability(None) == 0.0
    assert playability(0) == 0.0


def test_score_is_bounded():
    for rank in (1, 63, 5000, RANK_CEILING, RANK_CEILING * 10):
        assert 0.0 <= playability(rank) <= 1.0


def test_curve_is_logarithmic_not_linear():
    """The interesting distinctions are at the top; a linear scale flattens
    exactly the cards worth telling apart."""
    top = playability(63) - playability(600)
    tail = playability(20000) - playability(20500)

    assert top > tail * 10


def test_weight_has_a_floor():
    """A brand-new spoiler has no rank by construction. It still produces the
    resource — it is just weaker evidence, not absent."""
    assert weight_within_group(None) == pytest.approx(0.15)
    assert weight_within_group(63) > weight_within_group(20000) > 0.15


def test_game_changer_wins_the_description():
    assert describe(9999, True) == "game changer"
    assert describe(63, False).startswith("staple")
    assert describe(None, False) == "unranked"


def test_rarity_weight_is_ordinal():
    """Rarity is Wizards' power budget: +0.319 vs GIH WR over 2.43M games."""
    from deck_lab.power import rarity_weight

    assert (
        rarity_weight("common")
        < rarity_weight("uncommon")
        < rarity_weight("rare")
        < rarity_weight("mythic")
    )


def test_rarity_weight_is_centred_on_one():
    """Centred like the bridge's relative IDF: a multiplier that changes a
    channel's volume makes an eval change unattributable."""
    from deck_lab.power import rarity_weight

    weights = [rarity_weight(r) for r in ("common", "uncommon", "rare", "mythic")]
    assert min(weights) < 1.0 < max(weights)


def test_unknown_rarity_is_neutral():
    from deck_lab.power import rarity_weight

    assert rarity_weight(None) == 1.0
    assert rarity_weight("") == 1.0
    assert rarity_weight("timeshifted") == 1.0


def test_rarity_spread_keeps_a_common_reachable():
    """A common staple must not be buried. Counterspell is a common."""
    from deck_lab.power import rarity_weight

    assert rarity_weight("mythic") / rarity_weight("common") < 1.5


def test_banned_elsewhere_is_binary():
    from deck_lab.power import banned_elsewhere

    assert banned_elsewhere(["modern", "legacy"]) is True
    assert banned_elsewhere([]) is False
    assert banned_elsewhere(None) is False


def test_the_reserved_list_is_not_a_power_signal():
    """Regression guard on a measured *negative*: the reserved list's 544 cards
    have a median edhrec_rank of 25,187, worse than the corpus median. It tracks
    collectability, not power, and must never become a ranking term."""
    import inspect

    from deck_lab import power

    source = inspect.getsource(power)
    scoring = [
        line
        for line in source.splitlines()
        if "reserved" in line and not line.strip().startswith("#")
    ]
    assert scoring == [], f"reserved must not be scored: {scoring}"


def test_rarity_only_moves_the_unranked_floor():
    """Rarity and playability correlate at +0.396, so applying both to a ranked
    card counts the same evidence twice. Where a rank exists it wins outright."""
    from deck_lab.power import weight_within_group

    ranked_common = weight_within_group(500, rarity="common")
    ranked_mythic = weight_within_group(500, rarity="mythic")
    assert ranked_common == ranked_mythic


def test_rarity_separates_unranked_cards():
    """A newly spoiled mythic and a newly spoiled common are not equally good
    bets: median edhrec_rank is 21,253 for commons and 6,692 for mythics."""
    from deck_lab.power import weight_within_group

    assert weight_within_group(None, rarity="mythic") > weight_within_group(None, rarity="common")


def test_an_unranked_card_never_scores_zero():
    """It still produces the resource; it is just weaker evidence."""
    from deck_lab.power import weight_within_group

    for rarity in (None, "common", "uncommon", "rare", "mythic"):
        assert weight_within_group(None, rarity=rarity) > 0.0


def test_a_ranked_card_still_outranks_any_unranked_one():
    """The floor must stay a floor — an unranked mythic must not leapfrog a
    genuinely played card."""
    from deck_lab.power import weight_within_group

    assert weight_within_group(None, rarity="mythic") < weight_within_group(20000)
