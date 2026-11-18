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
    chosen = [("land", "Mountain"), ("a", "A"), ("b", "B"), ("c", "C"), ("d", "D")]

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
