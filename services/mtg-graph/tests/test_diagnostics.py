"""Diagnostics assembly. Pure arithmetic — no database involved."""

from __future__ import annotations

import pytest

from deck_lab.composition import template_for
from deck_lab.diagnostics import build_diagnostics


def _card(name, cmc, *, land=False, qty=1):
    return {
        "oracle_id": name,
        "name": name,
        "cmc": cmc,
        "type_line": "Land" if land else "Creature",
        "is_land": land,
        "color_identity": [],
        "price_usd": None,
        "qty": qty,
    }


def _card_roles(*entries):
    """Build the per-card role rows `build_diagnostics` expects."""
    return [{"oracle_id": oid, "roles": roles, "qty": qty} for oid, roles, qty in entries]


def _report(cards, roles=None, balance=None, card_roles=None, **kwargs):
    default = [{"oracle_id": c["oracle_id"], "roles": {}, "qty": c["qty"]} for c in cards]
    return build_diagnostics(
        cards,
        roles or {},
        balance or {},
        card_roles if card_roles is not None else default,
        **kwargs,
    )


def test_counts_deck_size_and_lands_by_quantity():
    report = _report([_card("Forest", 0, land=True, qty=9), _card("Bear", 2)])

    assert report.deck_size == 10
    assert report.lands == 9


def test_average_mv_excludes_lands():
    """Lands would drag the average toward zero and misreport the curve."""
    report = _report([_card("Forest", 0, land=True, qty=10), _card("Bear", 4)])

    assert report.average_mv == 4.0


def test_average_mv_is_none_without_spells():
    assert _report([_card("Forest", 0, land=True, qty=5)]).average_mv is None


def test_curve_buckets_six_plus_together():
    cards = [_card("Big", 9), _card("Bigger", 12)]
    report = _report(cards)

    assert next(p for p in report.curve if p.mv == 6).count == 2


def test_curve_targets_scale_to_spell_count():
    cards = [_card(f"c{i}", 2) for i in range(20)]
    report = _report(cards)

    assert sum(p.target for p in report.curve) == pytest.approx(20, abs=0.1)


def test_bucket_status_flags_low_and_high():
    report = _report([_card("Forest", 0, land=True, qty=5)], speed=0.0)
    statuses = {b.bucket: b.status for b in report.buckets}

    assert statuses["mana_sources"] == "low"


def test_balance_sorts_biggest_gap_first():
    balance = {
        "artifact_matters": {"produced": 3, "wanted": 9},
        "lifegain": {"produced": 1, "wanted": 2},
        "treasure": {"produced": 5, "wanted": 0},
    }
    report = _report([_card("Bear", 2)], balance=balance)

    assert report.balance[0].resource == "artifact_matters"
    assert report.balance[0].gap == 6
    assert report.balance[-1].resource == "treasure"


def test_balance_drops_resources_with_no_signal():
    balance = {"noise": {"produced": 0, "wanted": 0}, "real": {"produced": 1, "wanted": 0}}
    report = _report([_card("Bear", 2)], balance=balance)

    assert [row.resource for row in report.balance] == ["real"]


def test_unknown_role_names_are_ignored():
    """A stale edge must not take diagnostics down."""
    report = _report([_card("Bear", 2)], card_roles=_card_roles(("Bear", {"not_a_role": 1.0}, 1)))

    assert all(b.coverage == 0.0 for b in report.buckets)


def test_speed_changes_the_verdict_not_the_deck():
    """Same list, different template — the shape penalty should move."""
    cards = [_card("Forest", 0, land=True, qty=36)] + [_card(f"s{i}", 2) for i in range(63)]
    card_roles = _card_roles(("Forest", {"land": 1.0}, 36)) + _card_roles(
        *((f"s{i}", {}, 1) for i in range(63))
    )

    slow = _report(cards, card_roles=card_roles, template=template_for(0.0))
    fast = _report(cards, card_roles=card_roles, template=template_for(1.0))

    assert slow.penalty != fast.penalty


# --- the type axis --------------------------------------------------------


def _typed_template(**targets):
    from deck_lab.composition import BucketTarget, apply_type_targets

    return apply_type_targets(
        template_for(0.5),
        {name: BucketTarget(*spec) for name, spec in targets.items()},
    )


def test_type_rows_flag_low_and_high():
    template = _typed_template(Creature=(23, 35, 0.35), Instant=(7, 11, 0.35))
    cards = [_card(f"c{i}", 2) for i in range(40)]  # _card's type_line is Creature

    report = _report(cards, template=template)
    rows = {row.type: row for row in report.types}

    assert rows["Creature"].status == "high"
    assert rows["Creature"].count == 40
    assert rows["Creature"].deviation == 5.0
    assert rows["Instant"].status == "low"


def test_type_penalty_joins_the_shape_penalty():
    bare = _report([_card(f"c{i}", 2) for i in range(40)])
    typed = _report(
        [_card(f"c{i}", 2) for i in range(40)],
        template=_typed_template(Creature=(23, 35, 0.5)),
    )

    assert typed.penalty == pytest.approx(bare.penalty + 0.5 * 5.0)
    assert bare.types == []


def test_type_source_is_stamped_on_the_report():
    report = _report([_card("Bear", 2)], type_source="edhrec:muldrotha-the-gravetide/spellslinger")

    assert report.type_source == "edhrec:muldrotha-the-gravetide/spellslinger"


def test_land_row_informs_without_fining():
    """Land's weight is zero by construction — the mana_sources bucket owns
    land count, and two penalties on one measure is one signal counted twice."""
    template = _typed_template(Land=(30, 38, 0.0))
    cards = [_card("Forest", 0, land=True, qty=45)]

    report = _report(cards, template=template)
    bare = _report(cards)

    [row] = report.types
    assert row.status == "high"
    assert report.penalty == bare.penalty


def test_commander_supply_counts_for_more_than_one_card():
    """A resource the commander makes is reachable, and the gap says so.

    The commander is in the command zone every game where a singleton in the
    99 is roughly an eleven-in-ninety-nine chance by turn five, so a deck whose
    commander mills is not as short of self-mill as counting cards suggests.
    The reported counts stay physical; only the gap carries the reliability.
    """
    from deck_lab.diagnostics import COMMANDER_SUPPLY
    from deck_lab.vocabulary import Resource

    cards = [_card("commander", 4), _card("other", 2)]
    balance = {"self_mill": {"produced": 1, "wanted": 6}}

    plain = _report(cards, balance=balance)
    assert plain.balance[0].gap == 5
    assert plain.balance[0].from_commander is False

    anchored = _report(
        cards,
        balance=balance,
        commander_resources=({Resource.SELF_MILL}, set()),
    )
    row = anchored.balance[0]
    # The counts are untouched — they say how many cards, and that is still one.
    assert (row.produced, row.wanted) == (1, 6)
    assert row.gap == 5 - (COMMANDER_SUPPLY - 1)
    assert row.from_commander is True


def test_a_resource_the_commander_does_not_make_is_unaffected():
    from deck_lab.vocabulary import Resource

    cards = [_card("commander", 4)]
    balance = {"card_draw": {"produced": 1, "wanted": 6}}

    row = _report(
        cards,
        balance=balance,
        commander_resources=({Resource.SELF_MILL}, set()),
    ).balance[0]

    assert row.gap == 5
    assert row.from_commander is False
