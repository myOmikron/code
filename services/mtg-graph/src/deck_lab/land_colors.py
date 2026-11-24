"""Which of a deck's colours a land can make, read off its text.

Scryfall's `produced_mana` is not on the graph, and it is empty for a fetch,
which makes no mana itself but is a source of every colour it can find.
"""

from __future__ import annotations

import re

BASIC_TYPES = {"W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"}

_ADD = re.compile(r"Add ([^.]*)")
_SYMBOL = re.compile(r"\{([WUBRG])(?:/[WUBRGP])?\}")


def land_colors(oracle_text: str, type_line: str, identity: list[str]) -> set[str]:
    """The identity's colours this land produces or fetches."""
    wanted = set(identity)
    text = oracle_text or ""
    if "any color" in text or "any one color" in text or "basic land card" in text:
        return wanted
    colors: set[str] = set()
    for clause in _ADD.findall(text):
        colors |= set(_SYMBOL.findall(clause))
    subtypes = (type_line or "").partition("—")[2]
    searched = text.partition("Search your library")[2]
    for color, basic in BASIC_TYPES.items():
        if basic in subtypes or basic in searched:
            colors.add(color)
    return colors & wanted
