"""The eminence discount. Pure arithmetic — the fetch fallback is stubbed."""

from __future__ import annotations

from deck_lab.diagnostics import build_diagnostics
from deck_lab.eminence import (
    apply_discount,
    discount_for,
    discounted_cmc,
    eminence_discount,
)


def _card(name, cmc, *, oracle_id=None, type_line="Creature", land=False, qty=1):
    return {
        "oracle_id": oracle_id or name,
        "name": name,
        "cmc": cmc,
        "type_line": "Land" if land else type_line,
        "is_land": land,
        "color_identity": [],
        "price_usd": None,
        "qty": qty,
    }


def test_the_ur_dragon_grants_the_discount():
    assert eminence_discount(["The Ur-Dragon"]) == ("Dragon", 1)
    assert eminence_discount(["Krenko, Mob Boss"]) is None
    assert eminence_discount([None, "The Ur-Dragon"]) == ("Dragon", 1)


def test_only_the_named_type_is_discounted():
    discount = ("Dragon", 1)

    assert discounted_cmc(5.0, "Creature — Dragon", discount) == 4.0
    assert discounted_cmc(3.0, "Sorcery", discount) == 3.0
    assert discounted_cmc(5.0, "Creature — Dragon", None) == 5.0


def test_the_discount_never_goes_below_zero():
    assert discounted_cmc(0.0, "Creature — Dragon", ("Dragon", 1)) == 0.0


def test_apply_discount_rewrites_rows_in_place():
    rows = [
        _card("Terror of the Peaks", 5.0, type_line="Creature — Dragon"),
        _card("Cultivate", 3.0, type_line="Sorcery"),
    ]

    apply_discount(rows, ("Dragon", 1))

    assert rows[0]["cmc"] == 4.0
    assert rows[1]["cmc"] == 3.0


def test_apply_discount_without_one_is_a_no_op():
    rows = [_card("Terror of the Peaks", 5.0, type_line="Creature — Dragon")]

    apply_discount(rows, None)

    assert rows[0]["cmc"] == 5.0


def test_discount_resolves_from_rows_in_hand():
    """The command zone rides inside the entries, so no fetch happens."""
    cards = [
        _card("The Ur-Dragon", 9.0, type_line="Legendary Creature — Dragon Avatar"),
        _card("Cultivate", 3.0, type_line="Sorcery"),
    ]

    assert discount_for(cards, ["The Ur-Dragon"]) == ("Dragon", 1)
    assert discount_for(cards, ["Cultivate"]) is None


def test_a_commander_outside_the_rows_falls_back_to_one_fetch(monkeypatch):
    from deck_lab import graph

    fetched: list[dict] = []

    def fake_fetch(deck):
        fetched.append(deck)
        return [_card("The Ur-Dragon", 9.0, oracle_id="urd")]

    monkeypatch.setattr(graph, "fetch_deck", fake_fetch)

    assert discount_for([_card("Cultivate", 3.0)], ["urd"]) == ("Dragon", 1)
    assert fetched == [{"urd": 1}]


def test_diagnostics_over_discounted_rows_bucket_as_cast():
    """The composition the advisor sees: a 5-drop Dragon graded as a 4-drop."""
    cards = [
        _card("The Ur-Dragon", 9.0, type_line="Legendary Creature — Dragon Avatar"),
        _card("Terror of the Peaks", 5.0, type_line="Creature — Dragon"),
        _card("Cultivate", 3.0, type_line="Sorcery"),
    ]
    apply_discount(cards, discount_for(cards, ["The Ur-Dragon"]))

    report = build_diagnostics(
        cards,
        {},
        {},
        [{"oracle_id": card["oracle_id"], "roles": {}, "qty": card["qty"]} for card in cards],
    )

    counts = {bucket.mv: bucket.count for bucket in report.curve}
    assert counts[4] == 1
    assert counts[5] == 0
    assert counts[3] == 1
    assert counts[6] == 1
    assert report.average_mv == round((8 + 4 + 3) / 3, 2)
