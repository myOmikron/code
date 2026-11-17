"""Command Zone Dating: interests, profiles, verdicts, the stack and its endpoints."""

from __future__ import annotations

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
