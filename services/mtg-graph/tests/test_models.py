"""Card mapping — the layer where Scryfall's shape becomes ours."""

from __future__ import annotations

from deck_lab.models import card_from_scryfall

SOL_RING = {
    "oracle_id": "e94ca5a2-6d97-4b9b-8b53-c4b1b8dbb1c9",
    "id": "abc",
    "name": "Sol Ring",
    "mana_cost": "{1}",
    "cmc": 1.0,
    "type_line": "Artifact",
    "oracle_text": "{T}: Add {C}{C}.",
    "colors": [],
    "color_identity": [],
    "prices": {"usd": "1.43"},
    "layout": "normal",
}

DELVER = {
    "oracle_id": "d1b7f1e0-0000-0000-0000-000000000000",
    "id": "def",
    "name": "Delver of Secrets // Insectile Aberration",
    "cmc": 1.0,
    "layout": "transform",
    "colors": ["U"],
    "color_identity": ["U"],
    "prices": {"usd": None, "usd_foil": "0.37"},
    "card_faces": [
        {
            "type_line": "Creature — Human Wizard",
            "oracle_text": "At the beginning of your upkeep, look at the top card.",
            "mana_cost": "{U}",
        },
        {
            "type_line": "Creature — Human Insect",
            "oracle_text": "Flying",
            "mana_cost": "",
        },
    ],
}


def test_simple_card_maps_straight_through():
    card = card_from_scryfall(SOL_RING)

    assert card.name == "Sol Ring"
    assert card.mana_cost == "{1}"
    assert card.price_usd == 1.43
    assert not card.is_creature
    assert not card.can_be_commander


def test_double_faced_card_keeps_both_faces():
    """The whole point: reading only the top level loses the back face."""
    card = card_from_scryfall(DELVER)

    assert "Flying" in card.oracle_text
    assert "look at the top card" in card.oracle_text
    assert card.type_line == "Creature — Human Wizard // Creature — Human Insect"
    assert card.is_creature


def test_price_falls_back_to_foil_when_nonfoil_missing():
    assert card_from_scryfall(DELVER).price_usd == 0.37


def test_price_is_none_when_unpriced():
    raw = SOL_RING | {"prices": {"usd": None, "usd_foil": None}}
    assert card_from_scryfall(raw).price_usd is None


def test_legendary_creature_can_be_commander():
    raw = SOL_RING | {"type_line": "Legendary Creature — Phyrexian Angel Horror"}
    assert card_from_scryfall(raw).can_be_commander


def test_planeswalker_with_explicit_grant_can_be_commander():
    """Commander-precon planeswalkers are not creatures but are still legal."""
    raw = SOL_RING | {
        "type_line": "Legendary Planeswalker — Teferi",
        "oracle_text": "Teferi, Temporal Archmage can be your commander.",
    }
    card = card_from_scryfall(raw)

    assert card.can_be_commander
    assert not card.is_creature


def test_legendary_noncreature_without_grant_cannot_be_commander():
    raw = SOL_RING | {"type_line": "Legendary Artifact"}
    assert not card_from_scryfall(raw).can_be_commander


def test_banned_in_excludes_commander():
    """A commander-banned card is filtered at ingest, so including commander
    here would always be empty and imply a signal that cannot exist."""
    from deck_lab.models import _banned_in

    raw = {"legalities": {"commander": "banned", "modern": "banned", "legacy": "legal"}}
    assert _banned_in(raw) == ["modern"]


def test_banned_in_counts_restricted():
    """Vintage restricts rather than bans, and a restricted card is a strong
    card, not a permitted one."""
    from deck_lab.models import _banned_in

    assert _banned_in({"legalities": {"vintage": "restricted"}}) == ["vintage"]


def test_star_power_reads_as_none_not_zero():
    """`*`, `1+*` and `?` exist. Zero would drag every average that touches them."""
    from deck_lab.models import _stat

    assert _stat({"power": "3"}, "power") == 3.0
    assert _stat({"power": "*"}, "power") is None
    assert _stat({"power": "1+*"}, "power") is None
    assert _stat({}, "power") is None


def test_stat_falls_back_to_the_front_face():
    from deck_lab.models import _stat

    assert _stat({"card_faces": [{"power": "2"}, {"power": "5"}]}, "power") == 2.0


def test_a_legendary_spacecraft_can_be_a_commander():
    """Rule 903.3a is no longer "legendary creature". Hearthhull is a Legendary
    Artifact — Spacecraft with no "can be your commander" grant, and is the face
    commander of its own precon."""
    from deck_lab.models import _can_be_commander

    assert _can_be_commander(
        {"type_line": "Legendary Artifact — Spacecraft", "oracle_text": "Station (...)"}
    )


def test_legendary_vehicles_and_backgrounds_too():
    from deck_lab.models import _can_be_commander

    assert _can_be_commander({"type_line": "Legendary Artifact — Vehicle"})
    assert _can_be_commander({"type_line": "Legendary Enchantment — Background"})


def test_the_front_face_governs_commander_eligibility():
    """`Westvale Abbey // Ormendahl, Profane Prince` is a Land that transforms
    into a legendary creature and is NOT a legal commander. Reading the joined
    type line of both faces marked 29 such cards eligible."""
    from deck_lab.models import _can_be_commander

    westvale = {
        "card_faces": [
            {"type_line": "Land", "oracle_text": "{T}: Add {C}."},
            {"type_line": "Legendary Creature — Demon", "oracle_text": "Flying"},
        ]
    }
    assert _can_be_commander(westvale) is False


def test_a_non_legendary_creature_is_not_a_commander():
    from deck_lab.models import _can_be_commander

    assert _can_be_commander({"type_line": "Creature — Human Soldier"}) is False


def test_an_explicit_grant_still_wins():
    """Backgrounds aside, a handful of planeswalkers say so outright."""
    from deck_lab.models import _can_be_commander

    assert _can_be_commander(
        {
            "type_line": "Legendary Planeswalker — Daretti",
            "oracle_text": "Daretti, Scrap Savant can be your commander.",
        }
    )


def test_price_eur_maps_and_falls_back_to_foil():
    priced = card_from_scryfall({**SOL_RING, "prices": {"usd": "1.43", "eur": "1.10"}})
    assert priced.price_eur == 1.10
    foil_only = card_from_scryfall({**SOL_RING, "prices": {"eur": None, "eur_foil": "0.55"}})
    assert foil_only.price_eur == 0.55
    assert card_from_scryfall({**SOL_RING, "prices": {}}).price_eur is None
