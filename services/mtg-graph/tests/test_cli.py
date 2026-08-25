"""Decklist parsing shared by `suggest`/`swaps`/`replace`/`fill`. Pure — no graph.

`suggest` used to run its own copy of this loop with a regex that never
captured the leading quantity, so every card's count collapsed to 1 — 9 Forest
became one Forest. The other three commands already had the fix; this test
pins the shared helper so the bug cannot come back in just one call site.
"""

from __future__ import annotations

from deck_lab.cli import _parse_decklist


def _write(tmp_path, text):
    path = tmp_path / "deck.txt"
    path.write_text(text)
    return str(path)


def test_quantities_are_summed_per_name(tmp_path):
    path = _write(tmp_path, "9 Forest\n1 Sol Ring\n")

    names, counts, commander = _parse_decklist(path)

    assert names == ["Forest", "Sol Ring"]
    assert counts == {"Forest": 9, "Sol Ring": 1}
    assert commander is None


def test_x_suffix_is_accepted(tmp_path):
    path = _write(tmp_path, "9x Forest\n")

    _, counts, _ = _parse_decklist(path)

    assert counts == {"Forest": 9}


def test_repeated_lines_for_the_same_name_accumulate(tmp_path):
    """A card split across two lines (e.g. main + a later correction) sums,
    it does not overwrite — same contract as `counts.get(name, 0) + n`."""
    path = _write(tmp_path, "2 Forest\n3 Forest\n")

    _, counts, _ = _parse_decklist(path)

    assert counts == {"Forest": 5}


def test_commander_section_marks_the_first_card_after_it(tmp_path):
    path = _write(tmp_path, "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n")

    names, counts, commander = _parse_decklist(path)

    assert commander == "Atraxa, Praetors' Voice"
    assert names == ["Atraxa, Praetors' Voice", "Sol Ring"]
    assert counts["Atraxa, Praetors' Voice"] == 1


def test_only_the_first_commander_line_counts(tmp_path):
    """Partner commanders: the CLI, like the rest of the pipeline, nominates
    a single commander — the first one under the header."""
    path = _write(tmp_path, "Commander\n1 Tana, the Bloodsower\n1 Tymna the Weaver\n")

    _, _, commander = _parse_decklist(path)

    assert commander == "Tana, the Bloodsower"


def test_lines_without_a_leading_quantity_are_ignored(tmp_path):
    path = _write(tmp_path, "Sol Ring\n1 Arcane Signet\n")

    names, counts, _ = _parse_decklist(path)

    assert names == ["Arcane Signet"]
    assert counts == {"Arcane Signet": 1}
