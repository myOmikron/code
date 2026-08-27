"""The bracket-flag patterns stay in lockstep with the Rust catalog sync.

`graph.bracket_breakers` answers with the same regexes
`services/mtg/src/utils/bracket_flags.rs` stamps onto the catalog the
legality band counts — ported across two dialects: Rust `regex` partial-match
into the Java full-match Neo4j's `=~` executes. The port's comment says "if
one side changes, change the other"; this file is what enforces it. The
expected Java form is *built from the Rust source at test time*, so an edit
to either side alone fails here instead of surfacing as the advisor and the
legality band disagreeing about a card.
"""

from __future__ import annotations

import re
from pathlib import Path

from deck_lab.graph import (
    _EXTRA_TURN_HATE_PATTERN,
    _EXTRA_TURN_PATTERN,
    _MASS_LAND_DENIAL_PATTERN,
)

_RUST = Path(__file__).resolve().parents[2] / "mtg" / "src" / "utils" / "bracket_flags.rs"


def _rust_patterns() -> list[str]:
    """Every `Regex::new(r"...")` literal in the Rust module, in file order:
    extra turns, extra-turn hate, then the six mass-land-denial patterns."""
    return re.findall(r'Regex::new\(r"([^"]+)"\)', _RUST.read_text())


def test_the_python_patterns_are_the_rust_patterns_in_java_full_match_form():
    extra, hate, *mass_land_denial = _rust_patterns()

    def java(core: str) -> str:
        # Rust runs partial-match under (?i); Neo4j's `=~` is Java
        # full-match, so the port wraps the same core in `(?is).*(...).*` —
        # `(?s)` because a multi-face oracle text holds newlines a bare `.`
        # would refuse to cross.
        return "(?is).*" + core.removeprefix("(?i)") + ".*"

    assert java(extra) == _EXTRA_TURN_PATTERN
    assert java(hate) == _EXTRA_TURN_HATE_PATTERN
    cores = "|".join(p.removeprefix("(?i)") for p in mass_land_denial)
    assert f"(?is).*({cores}).*" == _MASS_LAND_DENIAL_PATTERN


def _breaks(pattern: str, text: str) -> bool:
    # Java's `matches()` is Python's `fullmatch` over this syntax subset —
    # the inline flags, \b, \w, [^.] and alternation behave identically.
    return re.fullmatch(pattern, text) is not None


def test_the_java_form_still_catches_the_named_offenders():
    """The Rust module's own canonical cards, through the ported form.

    Pattern equality above cannot see a broken *translation* — the `.*`
    wrapping and the `(?s)` flag are the Python side's own work, so the
    named offenders are run through it the way the Rust tests run them
    through theirs.
    """
    for text in [
        "Destroy all lands.",  # Armageddon
        "Destroy all nonbasic lands.",  # Ruination
        "Exile all artifacts, creatures, and lands.",  # Decree of Annihilation
        "Each player sacrifices four lands.",  # Wildfire
        "Lands don't untap during their controllers' untap steps.",  # Rising Waters
        "As long as this artifact is untapped, players can't untap more than "
        "one land during their untap steps.",  # Winter Orb
        "Nonbasic lands are Mountains.",  # Blood Moon
    ]:
        assert _breaks(_MASS_LAND_DENIAL_PATTERN, text), f"missed: {text}"

    assert _breaks(_EXTRA_TURN_PATTERN, "Take an extra turn after this one.")
    # Both faces joined — `(?s)` is what lets the wrap cross the newline.
    assert _breaks(_EXTRA_TURN_PATTERN, "Front face.\nTake an extra turn after this one.")
    assert _breaks(_EXTRA_TURN_HATE_PATTERN, "Your opponents can't take extra turns.")


def test_the_java_form_leaves_the_named_innocents_alone():
    for text in [
        "Destroy target land.",
        "Each player sacrifices a land.",  # one land is a rattlesnake, not a wipe
        "Search your library for a basic land card.",
        "As long as this artifact is untapped, players can't untap more than "
        "two permanents during their untap steps.",  # Static Orb holds permanents
    ]:
        assert not _breaks(_MASS_LAND_DENIAL_PATTERN, text), f"false positive: {text}"

    assert not _breaks(_EXTRA_TURN_PATTERN, "Draw a card at the beginning of your next turn.")
