"""Command Zone Dating: interests, profiles, verdicts, the stack and its endpoints."""

from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient

from deck_lab import api as api_module
from deck_lab import dating
from deck_lab.cache import dating_pool_cache
from deck_lab.dating import (
    DatingDeck,
    DatingProfile,
    ProfileAnswers,
    build_profile,
    commander_card,
    score,
    stack,
    verdict,
)

client = TestClient(api_module.app)


@pytest.fixture(autouse=True)
def creature_types(monkeypatch):
    monkeypatch.setattr(dating, "_creature_types", lambda: frozenset({"goblin", "elf", "vampire"}))


def row(oracle_id: str, **overrides) -> dict:
    base = {
        "oracle_id": oracle_id,
        "name": oracle_id.title(),
        "color_identity": ["B"],
        "edhrec_rank": 100,
        "price_eur": 2.5,
        "oracle_text": "",
        "type_line": "Legendary Creature",
        "salt": 1.0,
        "decks": 1000,
        "budget": [100, 800, 100],
        "brackets": [0, 200, 600, 200, 0],
        "tags": ["aristocrats", "tokens", "ramp"],
        "tag_labels": ["Aristocrats", "Tokens", "Ramp"],
        "tag_counts": [600, 300, 900],
    }
    return base | overrides


def profile(**overrides) -> DatingProfile:
    base = {
        "decks": 3,
        "themes": {"aristocrats": 1.0, "tokens": 0.5},
        "colors": {"B": 1.0},
        "bracket": 3.0,
        "budget_eur": 300.0,
        "salt": 1.0,
    }
    return DatingProfile(**(base | overrides))


def test_interests_put_mapped_tags_first_and_map_creature_types_to_tribal():
    card = commander_card(
        row(
            "krenko",
            tags=["ramp", "goblins", "tokens"],
            tag_labels=["Ramp", "Goblins", "Tokens"],
            tag_counts=[900, 800, 500],
        )
    )

    assert [(i.label, i.theme) for i in card.interests] == [
        ("Goblins", "tribal"),
        ("Tokens", "tokens"),
        ("Ramp", None),
    ]
    assert card.interests[0].share == 0.8


def test_elves_singularise_to_elf():
    assert dating.tag_theme("elves") == "tribal"
    assert dating.tag_theme("ramp") is None


def test_commander_card_reads_bracket_and_budget_lean():
    card = commander_card(row("x"))

    assert card.bracket == 3.0
    assert card.budget_lean == 0.0


def test_profile_takes_the_strongest_deck_per_theme_and_shares_colors():
    decks = [
        DatingDeck(commanders=["a"], cards={"c1": 1}, bracket=2, price_eur=100, colors=["B"]),
        DatingDeck(commanders=["b"], cards={"c2": 1}, bracket=4, price_eur=500, colors=["B", "G"]),
    ]
    themes = {"a": {"tokens": 0.3, "aristocrats": 0.03}, "b": {"tokens": 0.06}}

    result = build_profile(
        decks,
        None,
        deck_themes=lambda deck: themes[deck.commanders[0]],
        salts=lambda ids: {"a": 1.0, "b": 2.0},
    )

    assert result.themes == {"tokens": 1.0, "aristocrats": 0.2}
    assert result.labels["tokens"]
    assert result.colors == {"B": 1.0, "G": 0.5}
    assert result.bracket == 3.0
    assert result.budget_eur == 300.0
    assert result.salt == 1.5


def test_answers_fill_in_for_a_player_without_decks():
    answers = ProfileAnswers(colors=["U", "R"], bracket=2, budget_eur=50)

    result = build_profile([], answers, deck_themes=lambda deck: {}, salts=lambda ids: {})

    assert result.decks == 0
    assert result.themes == {}
    assert result.colors == {"U": 1.0, "R": 1.0}
    assert result.bracket == 2
    assert result.budget_eur == 50


def test_answers_win_over_the_decks():
    decks = [DatingDeck(commanders=["a"], cards={"c1": 1}, bracket=4, price_eur=900, colors=["B"])]
    answers = ProfileAnswers(colors=["G"], bracket=2, budget_eur=100, salt=0.4, avoided=["tokens"])

    result = build_profile(
        decks,
        answers,
        deck_themes=lambda deck: {"tokens": 0.3, "aristocrats": 0.3},
        salts=lambda ids: {"a": 3.0},
    )

    assert result.colors == {"G": 1.0}
    assert result.bracket == 2
    assert result.budget_eur == 100
    assert result.salt == 0.4
    assert result.themes == {"aristocrats": 1.0}
    assert result.avoided == ["tokens"]
    assert result.labels["tokens"]


def test_an_avoided_interest_sinks_the_match_and_is_named():
    teysa = commander_card(row("teysa"))

    answer = verdict(profile(avoided=["aristocrats"]), teysa)

    assert not answer.match
    assert answer.dimension == "avoided"
    assert answer.direction is None
    assert answer.detail == "Aristocrats"


def test_avoiding_counts_without_deck_themes():
    teysa = commander_card(row("teysa"))
    without = score(profile(themes={}), teysa)

    assert score(profile(themes={}, avoided=["aristocrats"]), teysa) < without


def test_a_close_fit_matches_and_names_the_shared_interest():
    answer = verdict(profile(), commander_card(row("teysa")))

    assert answer.match
    assert answer.shared == "Aristocrats"
    assert answer.dimension is None


def test_a_saltier_commander_rejects_with_the_salt_gap():
    answer = verdict(
        profile(salt=0.2, themes={"aristocrats": 0.6, "tokens": 0.6}),
        commander_card(row("toxrill", salt=3.2)),
    )

    assert not answer.match
    assert answer.dimension == "salt"
    assert answer.direction == "more"


def test_a_theme_mismatch_names_the_missing_interest():
    answer = verdict(
        profile(themes={"landfall": 1.0}),
        commander_card(row("meren")),
    )

    assert not answer.match
    assert answer.dimension == "themes"
    assert answer.detail in {"Aristocrats", "Tokens"}


def test_missing_colors_are_named():
    answer = verdict(
        profile(colors={"W": 1.0}, themes={}, bracket=None, budget_eur=None, salt=None),
        commander_card(row("edgar", color_identity=["R", "W", "B"])),
    )

    assert not answer.match
    assert answer.dimension == "colors"
    assert answer.detail == "RB"


def test_nothing_to_compare_means_a_match():
    empty = DatingProfile(decks=0, themes={}, colors={}, bracket=None, budget_eur=None, salt=None)

    assert verdict(empty, commander_card(row("x", color_identity=["G"]))).match


def test_stack_excludes_swiped_and_off_color_commanders():
    pool = [row("a"), row("b", color_identity=["U"]), row("c"), row("d")]

    result = stack(pool, profile(), exclude={"a"}, colors={"B"}, count=10, seed=1)

    assert sorted(card.oracle_id for card in result) == ["c", "d"]


def test_stack_keeps_only_commanders_with_every_required_color():
    pool = [
        row("a"),
        row("b", color_identity=["U"]),
        row("c", color_identity=["U", "B"]),
        row("d", color_identity=[]),
    ]

    result = stack(
        pool, profile(), exclude=set(), colors={"U", "B"}, count=10, seed=1, required={"U"}
    )

    assert sorted(card.oracle_id for card in result) == ["b", "c"]


def test_stack_keeps_only_the_listed_commanders():
    pool = [row("a"), row("b"), row("c")]

    result = stack(pool, profile(), exclude=set(), colors=None, count=10, seed=1, only={"a", "c"})

    assert sorted(card.oracle_id for card in result) == ["a", "c"]


def test_every_fifth_card_is_your_type():
    pool = [row(f"c{index}", edhrec_rank=index + 1) for index in range(20)]

    result = stack(pool, profile(), exclude=set(), colors=None, count=10, seed=7)

    assert [card.your_type for card in result] == [False, False, False, False, True] * 2


def test_the_same_seed_gives_the_same_stack():
    pool = [row(f"c{index}", edhrec_rank=index + 1) for index in range(30)]

    def ids(seed: int) -> list[str]:
        cards = stack(pool, profile(), exclude=set(), colors=None, count=8, seed=seed)
        return [card.oracle_id for card in cards]

    assert ids(3) == ids(3)


def test_excluding_cards_keeps_the_order_of_the_rest():
    pool = [row(f"c{index}", edhrec_rank=index + 1) for index in range(60)]

    def cards(exclude: set[str], count: int) -> list[tuple[str, bool]]:
        result = stack(pool, profile(), exclude=exclude, colors=None, count=count, seed=5)
        return [(card.oracle_id, card.your_type) for card in result]

    first = cards(set(), 10)

    assert cards({first[0][0], first[1][0], first[2][0]}, 7) == first[3:]
    assert cards({first[4][0]}, 9) == first[:4] + first[5:]


@pytest.fixture
def pool(monkeypatch):
    rows = [row("teysa"), row("toxrill", salt=3.2, color_identity=["U", "B"])]
    from deck_lab import graph

    monkeypatch.setattr(graph, "dating_pool", lambda: rows)
    dating_pool_cache.clear()
    yield rows
    dating_pool_cache.clear()


def test_stack_endpoint_returns_commanders_and_what_remains(pool):
    body = {"profile": profile().model_dump(), "exclude": ["teysa"], "count": 5}

    response = client.post("/dating/stack", json=body)

    assert response.status_code == 200
    data = response.json()
    assert [card["oracle_id"] for card in data["commanders"]] == ["toxrill"]
    assert data["remaining"] == 1


def test_stack_endpoint_counts_only_the_listed_commanders(pool):
    body = {"profile": profile().model_dump(), "only": ["toxrill"], "count": 5}

    data = client.post("/dating/stack", json=body).json()

    assert [card["oracle_id"] for card in data["commanders"]] == ["toxrill"]
    assert data["remaining"] == 1


def test_verdict_endpoint_answers_a_like(pool):
    body = {"profile": profile(salt=0.2).model_dump(), "commander": "toxrill"}

    response = client.post("/dating/verdict", json=body)

    assert response.status_code == 200
    assert response.json()["dimension"] == "salt"


def test_verdict_endpoint_refuses_a_commander_outside_the_pool(pool):
    body = {"profile": profile().model_dump(), "commander": "nobody"}

    assert client.post("/dating/verdict", json=body).status_code == 404


def test_profile_endpoint_builds_from_answers(monkeypatch):
    from deck_lab import graph

    monkeypatch.setattr(graph, "commander_salts", lambda ids: {})
    body = {"decks": [], "answers": {"colors": ["G"], "bracket": 3, "budget_eur": 200}}

    response = client.post("/dating/profile", json=body)

    assert response.status_code == 200
    assert response.json()["colors"] == {"G": 1.0}


def plan_for(row_overrides: dict, counts: dict[str, int], total: int = 100):
    return dating.date_plan(
        row("krenko", **row_overrides),
        recommended=lambda oid, limit: [f"c{index}" for index in range(total)],
        fit_counts=lambda ids, threshold: counts,
    )


def test_a_date_proposes_the_mapped_interests_first():
    plan = plan_for(
        {
            "tags": ["goblins", "tokens", "ramp"],
            "tag_labels": ["Goblins", "Tokens", "Ramp"],
            "tag_counts": [900, 800, 700],
        },
        {"tokens": 30, "aggro": 20, "tribal": 25},
    )

    assert [theme.theme for theme in plan.proposals] == ["tribal", "tokens", "aggro"]
    assert plan.proposals[0].label == "Goblins"


def test_support_is_the_share_of_recommended_cards_that_fit():
    plan = plan_for({}, {"tokens": 30, "mill": 7, "lifegain": 2})
    by_id = {theme.theme: theme for theme in plan.themes}

    assert by_id["tokens"].support == 0.3
    assert by_id["tokens"].tier == "high"
    assert by_id["mill"].tier == "mid"
    assert by_id["lifegain"].tier == "low"
    assert len(plan.themes) == len(dating.THEMES)


def test_date_endpoint_answers_for_a_pool_commander(pool, monkeypatch):
    from deck_lab import graph
    from deck_lab.cache import dating_date_cache

    dating_date_cache.clear()
    monkeypatch.setattr(graph, "recommended_ids", lambda oid, limit: ["a", "b"])
    monkeypatch.setattr(graph, "theme_fit_counts", lambda ids, threshold: {"aristocrats": 1})

    response = client.post("/dating/date", json={"commander": "teysa"})

    assert response.status_code == 200
    assert response.json()["proposals"][0]["theme"] == "aristocrats"
    assert client.post("/dating/date", json={"commander": "nobody"}).status_code == 404


def test_a_blind_date_rolls_two_or_three_supported_themes():
    plan = plan_for({}, {"tokens": 30, "aristocrats": 20, "treasure": 8, "mill": 1})
    for seed in range(20):
        rolled = dating.roll_themes(plan, row("krenko"), random.Random(seed))

        assert 2 <= len(rolled) <= 3
        assert {theme.theme for theme in rolled} <= {"tokens", "aristocrats", "treasure"}
        assert rolled[0].level in {"allin", "core"}
        assert all(theme.level in {"light", "core"} for theme in rolled[1:])


def test_lands_and_the_surest_picks_go_in_first():
    chosen = [("land", "Mountain", 1), ("a", "A", 1), ("b", "B", 1), ("c", "C", 1), ("d", "D", 1)]

    now, later, open_slots = dating.split_fill(
        chosen,
        lands={"land"},
        fitting={"c"},
        inclusion={"a": 0.9, "b": 0.2, "c": 0.1, "d": 0.5},
        slots=6,
        open_slots=3,
    )

    assert [card.oracle_id for card in now] == ["land", "c", "a"]
    assert [card.oracle_id for card in later] == ["d", "b"]
    assert open_slots == 3


def test_a_stack_of_basics_splits_between_now_and_later():
    chosen = [("island", "Island", 5), ("a", "A", 1)]

    now, later, open_slots = dating.split_fill(
        chosen, lands={"island"}, fitting=set(), inclusion={}, slots=6, open_slots=3
    )

    assert [(card.oracle_id, card.quantity) for card in now] == [("island", 3)]
    assert [(card.oracle_id, card.quantity) for card in later] == [("island", 2), ("a", 1)]
    assert open_slots == 3


def test_blind_endpoint_fills_and_splits(pool, monkeypatch):
    from deck_lab import graph
    from deck_lab.cache import dating_date_cache
    from deck_lab.solver import FilledCard, FillResult

    dating_date_cache.clear()
    monkeypatch.setattr(graph, "recommended_ids", lambda oid, limit: ["a", "b"])
    fits = {"aristocrats": 1, "tokens": 1}
    monkeypatch.setattr(graph, "theme_fit_counts", lambda ids, threshold: fits)
    monkeypatch.setattr(
        api_module,
        "run_fill",
        lambda *args, **kwargs: FillResult(
            status="optimal",
            solved=True,
            slots=99,
            chosen=[FilledCard(oracle_id=f"c{i}", name=f"C{i}", cmc=2, score=1) for i in range(70)],
        ),
    )
    land = [{"oracle_id": "c0", "type_line": "Basic Land"}]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: land)
    monkeypatch.setattr(graph, "fits_theme_among", lambda ids, themes: [])
    monkeypatch.setattr(graph, "inclusion_among", lambda commander, ids: {})

    response = client.post("/dating/blind", json={"commander": "teysa", "bracket": 3, "seed": 1})

    assert response.status_code == 200
    data = response.json()
    assert len(data["add_now"]) == 64
    assert data["add_now"][0]["oracle_id"] == "c0"
    assert len(data["add_later"]) == 6
    assert data["open_slots"] == 35


BAELOTH = {
    "oracle_text": "Creatures your opponents control are goaded.\nChoose a Background (reminder)",
    "color_identity": ["R"],
}
GIANTS = {
    "oracle_text": "Commander creatures you own have base power and toughness 10/10.",
    "type_line": "Legendary Enchantment — Background",
    "color_identity": ["G"],
    "tags": None,
    "tag_labels": None,
    "tag_counts": None,
    "decks": None,
    "salt": None,
    "budget": None,
    "brackets": None,
}
PARTNER = {"oracle_text": "Flying\nPartner (You can have two commanders if both have partner.)"}


def test_pairing_reads_every_kind():
    assert dating.pairing(row("b", **BAELOTH)).seeks == "background"
    assert dating.pairing(row("g", **GIANTS)).seeks is None
    assert dating.pairing(row("g", **GIANTS)).background
    assert dating.pairing(row("t", **PARTNER)).seeks == "partner"
    doctor = row("d", type_line="Legendary Creature — Time Lord Doctor")
    assert dating.pairing(doctor).seeks == "companion"
    assert dating.pairing(row("c", oracle_text="Doctor’s companion (reminder)")).seeks == "doctor"
    assert dating.pairing(row("s", oracle_text="Partner—Survivors (reminder)")).group == "Survivors"
    assert dating.pairing(row("x")).seeks is None


def test_only_legal_pairs_can_share_the_command_zone():
    baeloth, giants = row("baeloth", **BAELOTH), row("giants", **GIANTS)
    tymna, thrasios = row("tymna", **PARTNER), row("thrasios", **PARTNER)
    pir = row("pir", name="Pir", oracle_text="Partner with Toothy (reminder)")
    toothy = row("toothy", name="Toothy", oracle_text="Partner with Pir")
    survivor = row("ellie", oracle_text="Partner—Survivors")
    friend = row("sophina", oracle_text="Partner—Friends forever")

    assert dating.can_pair(baeloth, giants)
    assert dating.can_pair(giants, baeloth)
    assert dating.can_pair(tymna, thrasios)
    assert dating.can_pair(pir, toothy)
    assert not dating.can_pair(pir, tymna)
    assert not dating.can_pair(tymna, baeloth)
    assert not dating.can_pair(survivor, friend)
    assert not dating.can_pair(tymna, tymna)


def test_a_pair_shares_colors_and_averages_what_is_known():
    pair = dating.pair_card(row("baeloth", **BAELOTH, salt=2.0), row("giants", **GIANTS))

    assert pair.oracle_id == "giants"
    assert pair.color_identity == ["R", "G"]
    assert pair.salt == 2.0
    assert [interest.label for interest in pair.interests] == ["Aristocrats", "Tokens", "Ramp"]


def test_the_partner_stack_holds_only_legal_partners_within_the_colors():
    lead = row("baeloth", **BAELOTH)
    candidates = [
        row("giants", **GIANTS),
        row("blue", **(GIANTS | {"color_identity": ["U"]})),
        row("tymna", **PARTNER),
    ]

    cards, remaining = dating.partner_stack(
        lead,
        candidates,
        profile(),
        exclude=set(),
        colors={"R", "G"},
        required=None,
        count=5,
        seed=0,
    )

    assert [card.oracle_id for card in cards] == ["giants"]
    assert remaining == 1


@pytest.fixture
def poly_pool(monkeypatch):
    rows = [row("baeloth", **BAELOTH), row("teysa")]
    pairable = [row("baeloth", **BAELOTH), row("giants", **GIANTS)]
    from deck_lab import graph

    monkeypatch.setattr(graph, "dating_pool", lambda: rows)
    monkeypatch.setattr(graph, "dating_pairable", lambda: pairable)
    dating_pool_cache.clear()
    yield rows
    dating_pool_cache.clear()


def test_poly_stack_keeps_only_commanders_that_take_a_second(poly_pool):
    body = {"profile": profile().model_dump(), "poly": True, "count": 5}

    data = client.post("/dating/stack", json=body).json()

    assert [card["oracle_id"] for card in data["commanders"]] == ["baeloth"]
    assert data["commanders"][0]["seeks"] == "background"


def test_partners_endpoint_offers_backgrounds(poly_pool):
    body = {"profile": profile().model_dump(), "commander": "baeloth", "count": 5}

    data = client.post("/dating/partners", json=body).json()

    assert [card["oracle_id"] for card in data["commanders"]] == ["giants"]
    assert data["lead"]["oracle_id"] == "baeloth"


def test_verdict_endpoint_judges_the_pair(poly_pool):
    body = {"profile": profile().model_dump(), "commander": "baeloth", "partner": "giants"}

    response = client.post("/dating/verdict", json=body)

    assert response.status_code == 200
    assert response.json()["dimension"] == "colors"
    assert response.json()["detail"] == "RG"


def test_verdict_endpoint_refuses_an_illegal_pair(poly_pool):
    body = {"profile": profile().model_dump(), "commander": "teysa", "partner": "giants"}

    assert client.post("/dating/verdict", json=body).status_code == 404


def test_seeks_endpoint_names_what_each_lead_looks_for(poly_pool):
    data = client.post("/dating/seeks", json={"commanders": ["baeloth", "teysa"]}).json()

    assert data == {"baeloth": "background"}
