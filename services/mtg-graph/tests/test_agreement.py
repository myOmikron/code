"""The EDHREC agreement harness. Pure parts only — no network, no database."""

from __future__ import annotations

from deck_lab.agreement import CHECK_SLUGS, Agreement
from deck_lab.themes import THEMES


def test_every_check_names_a_real_theme():
    """A typo'd theme id would raise deep inside `score`, one tag page late."""
    assert set(CHECK_SLUGS) <= set(THEMES)


def test_every_theme_has_at_least_one_tag():
    for theme_id, slugs in CHECK_SLUGS.items():
        assert slugs, theme_id


def test_absent_cards_are_not_scored_as_misses():
    """An unreleased or uningested card is not evidence either way.

    Counting it as a miss quietly penalises a theme for an ingest gap —
    EDHREC's storm list carries Birgi, which the corpus does not hold, and
    the check reads 9/9 rather than 9/10 because of this.
    """
    result = Agreement(
        theme_id="voltron",
        tag_slug="equipment",
        retrieval=False,
        hits=("Sram, Senior Edificer",),
        misses=("Rancor",),
        absent=("Some Unreleased Card",),
    )
    assert result.scored == 2
    assert "1/2" in str(result)


def test_str_names_the_gate_it_scored():
    """Detection and retrieval answer different questions and the numbers
    differ by 5 points on spellslinger; a report that does not say which one
    it ran is not reproducible."""
    detection = Agreement("voltron", "auras", False, (), (), ())
    retrieval = Agreement("voltron", "auras", True, (), (), ())
    assert "detection" in str(detection)
    assert "retrieval" in str(retrieval)
