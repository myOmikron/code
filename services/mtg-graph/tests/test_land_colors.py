"""Which colours a land makes, from its text alone."""

from __future__ import annotations

import pytest

from deck_lab.land_colors import land_colors

UB = ["U", "B"]


@pytest.mark.parametrize(
    ("text", "type_line", "expected"),
    [
        ("({T}: Add {U}.)", "Basic Land — Island", {"U"}),
        ("({T}: Add {U} or {B}.)", "Land — Island Swamp", {"U", "B"}),
        (
            "Sacrifice this land: Search your library for an Island or Swamp card",
            "Land",
            {"U", "B"},
        ),
        (
            "Sacrifice this land: Search your library for a Swamp or Mountain card",
            "Land",
            {"B"},
        ),
        ("{T}: Add one mana of any color in your commander's color identity.", "Land", {"U", "B"}),
        (
            "Search your library for a basic land card, put it onto the battlefield tapped",
            "Land",
            {"U", "B"},
        ),
        ("{T}: Add {C}.\n{T}: Add {G} or {W}.", "Land", set()),
        ("You have no maximum hand size.", "Land", set()),
    ],
)
def test_land_colors(text, type_line, expected):
    assert land_colors(text, type_line, UB) == expected
