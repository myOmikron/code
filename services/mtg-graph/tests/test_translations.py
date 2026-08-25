"""Every phrase code the service emits has a translation on the other side.

The advisor hands the frontend a `code` and an English `text`; the frontend
renders `t(f"{category}.{kind}-{code}", defaultValue=text)`. A code with no key
in the bundle therefore does not fail — it silently falls back to the English,
which is exactly how `cut-rarely-played` shipped untranslated, and how
`deck-size-scaled` and `identity-overridden` did after it.

`CutCode` (an enum baked into the OpenAPI schema) guards the cut family from
the frontend side, but only once someone regenerates the client: a new code
added today and regenerated next week is unguarded in between. This test reads
the codes straight out of the source instead, so the gap closes the moment the
code is written — and it covers the note and provenance families, which have no
enum at all.

Scanning source with a regex is the price of codes that are emitted inside
function bodies rather than declared. If a future refactor makes an extractor
below pick up something that is not a phrase code, narrow the extractor — do
not delete the assertion.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from deck_lab.cuts import CutCode

_REPO_ROOT = Path(__file__).resolve().parents[3]
_BUNDLES = _REPO_ROOT / "frontend" / "mtg" / "public" / "locales"
_SUGGESTIONS = Path(__file__).resolve().parents[1] / "src" / "deck_lab" / "suggestions.py"

# `\b` keeps this off `cut_phrase(` — the underscore is a word character, so
# the boundary only matches the bare helper, which is notes-only.
_NOTE_CODES = re.compile(r'\bphrase\(\s*\n?\s*"([a-z0-9-]+)"')
# Provenance entries are built with an explicit `code=` keyword.
_WHY_CODES = re.compile(r'\bcode\s*=\s*"([a-z0-9-]+)"')

pytestmark = pytest.mark.skipif(
    not _BUNDLES.is_dir(),
    reason=f"locale bundles not found at {_BUNDLES} — running outside the monorepo",
)


def _keys(language: str) -> set[str]:
    """Flatten one bundle to the two-level keys `say()` actually looks up."""
    bundle = json.loads((_BUNDLES / language / "advisor.json").read_text())
    return {
        f"{category}.{key}"
        for category, entries in bundle.items()
        if isinstance(entries, dict)
        for key in entries
    }


def _emitted(pattern: re.Pattern[str]) -> set[str]:
    return set(pattern.findall(_SUGGESTIONS.read_text()))


@pytest.mark.parametrize("language", ["de", "en"])
def test_every_note_code_has_a_translation(language: str) -> None:
    """`say(t, "note", …)` builds `description.note-<code>`."""
    keys = _keys(language)
    missing = sorted(
        code for code in _emitted(_NOTE_CODES) if f"description.note-{code}" not in keys
    )
    assert not missing, (
        f"{language}/advisor.json has no description.note-* entry for: {missing}. "
        "The note renders as raw English until it does."
    )


@pytest.mark.parametrize("language", ["de", "en"])
def test_every_provenance_code_has_a_translation(language: str) -> None:
    """`sayWhy` builds `label.why-<code>`."""
    keys = _keys(language)
    missing = sorted(code for code in _emitted(_WHY_CODES) if f"label.why-{code}" not in keys)
    assert not missing, (
        f"{language}/advisor.json has no label.why-* entry for: {missing}. "
        "The provenance line renders as raw English until it does."
    )


@pytest.mark.parametrize("language", ["de", "en"])
def test_every_cut_code_has_a_translation(language: str) -> None:
    """`say(t, "cut", …)` builds `label.cut-<code>`.

    The frontend asserts this too, against the generated enum. Here it is
    checked against the enum itself, so a new code is caught before the
    regeneration that would teach the frontend about it.
    """
    keys = _keys(language)
    missing = sorted(code for code in CutCode if f"label.cut-{code.value}" not in keys)
    assert not missing, (
        f"{language}/advisor.json has no label.cut-* entry for: {missing}. "
        "The cut reason renders as raw English until it does."
    )
