"""Suggestion grouping and focus. Pure functions — no database."""

from __future__ import annotations

from deck_lab.suggestions import (
    Provenance,
    Suggestion,
    _build_groups,
    _Candidate,
    _matches_focus,
    _parse_focus,
    _primary_group,
)


def _suggestion(name: str, *provenance: tuple[str, str, float]) -> Suggestion:
    return Suggestion(
        oracle_id=name,
        name=name,
        cmc=2.0,
        type_line="Creature",
        price_usd=None,
        score=sum(p[2] for p in provenance),
        provenance=[Provenance(channel=c, detail=d, score=s) for c, d, s in provenance],
    )


# --- focus parsing --------------------------------------------------------


def test_focus_accepts_a_bare_theme_name():
    """A user picking from a list of themes sends the id, not a prefix."""
    focus = _parse_focus("landfall")
    assert (focus.kind, focus.value) == ("theme", "landfall")


def test_focus_accepts_explicit_kinds():
    assert _parse_focus("bucket:ramp").kind == "bucket"
    assert _parse_focus("resource:etb_trigger").value == "etb_trigger"


def test_unknown_kind_is_treated_as_a_theme():
    assert _parse_focus("wibble:landfall").kind == "theme"


def test_blank_focus_is_none():
    assert _parse_focus(None) is None
    assert _parse_focus("   ") is None


# --- group assignment -----------------------------------------------------


def test_a_gap_closer_beats_a_staple_even_when_scored_lower():
    """The bug this pins: EDHREC synergy scores an order of magnitude above a
    bucket shortfall, so picking the highest-scoring provenance filed every
    card under 'staples' and the grouping said nothing."""
    card = _suggestion(
        "Evolving Wilds",
        ("edhrec_synergy", "+0.40 synergy", 4.0),
        ("role_gap", "fills mana sources — deck is 3 short", 0.6),
    )
    key, _ = _primary_group(card)

    assert key == "bucket:mana sources"


def test_theme_outranks_every_other_channel():
    card = _suggestion(
        "Lotus Cobra",
        ("edhrec_synergy", "+0.43 synergy", 4.3),
        ("role_gap", "fills ramp — deck is 1 short", 0.5),
        ("theme_fit", "reads as Landfall (28% fit)", 1.0),
    )
    assert _primary_group(card)[0] == "theme:focus"


def test_a_pure_staple_lands_in_staples():
    card = _suggestion("Sol Ring", ("edhrec_synergy", "+0.10 synergy", 1.0))
    assert _primary_group(card)[0] == "staples"


# --- group ordering -------------------------------------------------------


def test_gap_groups_lead_and_staples_come_last():
    """The verification criterion: groups lead with the worst shortfall."""
    cards = [
        _suggestion("Staple", ("edhrec_synergy", "+0.5", 5.0)),
        _suggestion("Filler", ("role_gap", "fills ramp — deck is 3 short", 0.6)),
        _suggestion("Bridge", ("resource_bridge", "supplies treasure — deck wants 2", 0.5)),
    ]
    groups = _build_groups(cards, {"bucket:ramp": "9 against 12-16 — 3 short"})
    keys = [g.key for g in groups]

    assert keys[0].startswith("bucket:")
    assert keys[-1] == "staples"


def test_group_carries_the_shortfall_as_its_reason():
    cards = [_suggestion("Filler", ("role_gap", "fills ramp — deck is 3 short", 0.6))]
    [group] = _build_groups(cards, {"bucket:ramp": "9 against 12-16 — 3 short"})

    assert group.reason == "9 against 12-16 — 3 short"


def test_every_card_lands_in_exactly_one_group():
    cards = [
        _suggestion("A", ("edhrec_synergy", "x", 5.0), ("role_gap", "fills ramp — 3 short", 0.6)),
        _suggestion("B", ("combo_completion", "completes X", 1.8)),
    ]
    groups = _build_groups(cards, {})

    assert sum(len(g.suggestions) for g in groups) == len(cards)


# --- focus matching -------------------------------------------------------


def _candidate(*provenance: tuple[str, str, float]) -> _Candidate:
    return _Candidate(
        oracle_id="x",
        name="x",
        provenance=[Provenance(channel=c, detail=d, score=s) for c, d, s in provenance],
    )


def _themed_candidate(theme_id: str) -> _Candidate:
    return _Candidate(
        oracle_id="x",
        name="x",
        provenance=[
            Provenance(channel="theme_fit", detail="reads as a theme", score=1.0, key=theme_id)
        ],
    )


def test_theme_focus_matches_a_theme_hit():
    assert _matches_focus(_themed_candidate("landfall"), _parse_focus("landfall"))


def test_theme_focus_rejects_a_card_without_one():
    assert not _matches_focus(_candidate(("edhrec_synergy", "+0.4", 4.0)), _parse_focus("landfall"))


def test_theme_focus_rejects_a_hit_on_a_different_theme():
    """The bug this pins: any `theme_fit` provenance satisfied any focus, so
    an aristocrats hit counted toward a landfall focus and the focus never
    actually narrowed anything."""
    assert not _matches_focus(_themed_candidate("aristocrats"), _parse_focus("landfall"))


def test_bucket_focus_matches_on_the_named_bucket_only():
    ramp = _candidate(("role_gap", "fills ramp — deck is 3 short", 0.6))

    assert _matches_focus(ramp, _parse_focus("bucket:ramp"))
    assert not _matches_focus(ramp, _parse_focus("bucket:card_draw"))


def test_resource_focus_reads_the_underscored_name():
    card = _candidate(("resource_bridge", "supplies etb trigger — deck wants 3", 0.5))
    assert _matches_focus(card, _parse_focus("resource:etb_trigger"))


def test_a_rejected_commander_nomination_is_said_not_silent(monkeypatch):
    """Silently swapping the user's stated commander for a guess is the exact
    failure "provenance or silence" exists to prevent. "(inferred)" alone
    cannot distinguish "you sent nothing" from "you sent something and it was
    rejected" — this note is the difference, and it must survive the early
    returns, which build fresh notes lists."""
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: False)
    monkeypatch.setattr(graph, "find_commander", lambda ids: None)

    report = suggest(["some-oracle-id"], ["Some Card"], commander_oracle_id="rejected-id")

    assert report.commander_inferred is False
    assert any("rejected" in note.text for note in report.notes)


class _EmptyDiagnostics:
    """Just enough of `Diagnostics`' shape for `suggest()` to read from —
    every list it touches, empty, so every channel that gates on one stays
    quiet and the run reaches focus narrowing with nothing in the pool."""

    balance: list = []
    buckets: list = []
    types: list = []
    typal: list = []
    themes: list = []


def test_focus_no_matches_note_fires_when_nothing_matches(monkeypatch):
    """Before the key check, `_matches_focus` accepted any `theme_fit` hit
    regardless of which theme it was for — so a pinned Aristocrats card kept
    satisfying a Landfall focus, and this note (the one thing telling the
    user their focus found nothing) effectively never fired."""
    monkeypatch.setattr("deck_lab.graph.bracket_breakers", lambda ids: {})
    from deck_lab import graph
    from deck_lab.suggestions import suggest

    off_theme_row = {
        "oracle_id": "card1",
        "name": "Card One",
        "theme_id": "aristocrats",
        "theme_label": "Aristocrats",
        "fit": 1.0,
        "playability": 0.5,
    }

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)
    monkeypatch.setattr(
        graph,
        "fetch_deck",
        lambda counts: [{"oracle_id": "cmdr", "name": "Test Commander", "color_identity": ["G"]}],
    )
    monkeypatch.setattr(graph, "channel_theme", lambda *a, **kw: [])
    monkeypatch.setattr(graph, "channel_themes", lambda *a, **kw: [off_theme_row])
    # A focus match failure falls back to showing everything unfiltered
    # (see the "showing everything instead" note text) rather than an empty
    # page, so `top` reaches `_off_theme_lean` non-empty and this needs
    # stubbing too — it is orthogonal to what this test is pinning.
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])

    report = suggest(
        ["cmdr"],
        ["Test Commander"],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"none"},
        include_combos=False,
        focus="landfall",
        pinned_themes=["aristocrats"],
    )

    # Nothing satisfied the focus, so the fallback shows the pinned
    # aristocrats card anyway — but the note must still say the focus itself
    # found nothing.
    assert [s.oracle_id for s in report.suggestions] == ["card1"]
    assert any(note.code == "focus-no-matches" for note in report.notes)


# --- EDHREC leaves the request path (Task 12) ------------------------------
# `allow_network=False` is what `/suggestions` et al. pass once they have
# scheduled a background warm for a cold commander instead of paying the
# inline fetch (up to 30s) themselves — see `api.py::_cold_commander_allow_network`.


def _edhrec_suggest(monkeypatch, *, has_recommendations: bool, tombstoned: bool, **kwargs):
    from deck_lab import edhrec, graph
    from deck_lab.suggestions import suggest

    monkeypatch.setattr(graph, "is_legal_commander", lambda oid: True)
    monkeypatch.setattr(
        graph,
        "fetch_deck",
        lambda counts: [{"oracle_id": "cmdr", "name": "Test Commander", "color_identity": ["G"]}],
    )
    monkeypatch.setattr(graph, "has_recommendations", lambda oid: has_recommendations)
    monkeypatch.setattr(graph, "channel_edhrec", lambda *a, **kw: [])
    monkeypatch.setattr(edhrec, "is_tombstoned", lambda name: tombstoned)

    def fail_if_called(name, *, force=False):
        raise AssertionError("ingest_commander must not be called when allow_network=False")

    monkeypatch.setattr(edhrec, "ingest_commander", fail_if_called)

    return suggest(
        ["cmdr"],
        ["Test Commander"],
        commander_oracle_id="cmdr",
        diagnostics=_EmptyDiagnostics(),
        channels={"edhrec_synergy"},
        include_combos=False,
        allow_network=False,
        **kwargs,
    )


def test_a_cold_not_yet_tombstoned_commander_reads_as_pending_with_network_off(monkeypatch):
    """The whole point of Task 12: a cold commander must not block the request
    on EDHREC. Not tombstoned means nobody has asked EDHREC yet (or the warm
    just has not landed), so the honest note is "on its way", not "missing"."""
    report = _edhrec_suggest(monkeypatch, has_recommendations=False, tombstoned=False)

    assert any(note.code == "edhrec-pending" for note in report.notes)
    assert not any(note.code == "edhrec-missing" for note in report.notes)


def test_a_tombstoned_commander_still_reads_as_missing_with_network_off(monkeypatch):
    """EDHREC already said no recently — asking again would not change the
    answer, so this stays the older, flatter "missing" note."""
    report = _edhrec_suggest(monkeypatch, has_recommendations=False, tombstoned=True)

    assert any(note.code == "edhrec-missing" for note in report.notes)
    assert not any(note.code == "edhrec-pending" for note in report.notes)
