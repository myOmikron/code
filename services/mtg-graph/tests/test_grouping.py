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


def test_theme_focus_matches_a_theme_hit():
    assert _matches_focus(
        _candidate(("theme_fit", "reads as Landfall", 1.0)), _parse_focus("landfall")
    )


def test_theme_focus_rejects_a_card_without_one():
    assert not _matches_focus(_candidate(("edhrec_synergy", "+0.4", 4.0)), _parse_focus("landfall"))


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
    assert any("rejected" in note for note in report.notes)
