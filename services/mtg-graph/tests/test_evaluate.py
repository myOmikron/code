"""The evaluation harness. Pure functions — no network, no database."""

from __future__ import annotations

from deck_lab.evaluate import ALL_CHANNELS, MECHANICAL_ONLY, _novelty


def test_the_mechanical_arm_excludes_the_empirical_channel():
    """The whole point of the measurement: with EDHREC switched on it reads the
    answer key, because the held-out cards are EDHREC high-synergy cards."""
    assert "edhrec_synergy" not in MECHANICAL_ONLY
    assert "edhrec_synergy" in ALL_CHANNELS


def test_the_mechanical_arm_covers_every_graph_channel():
    assert {"resource_bridge", "role_gap", "combo_completion"} <= MECHANICAL_ONLY


def test_novelty_rewards_the_less_played_card():
    """A system that only ever returns staples should score near zero however
    good its recall looks."""
    obscure = _novelty(["a"], {"a": 0.05})
    staple = _novelty(["b"], {"b": 0.95})

    assert obscure > staple
    assert obscure == 0.95


def test_novelty_of_nothing_is_zero():
    assert _novelty([], {"a": 0.5}) == 0.0


def test_novelty_treats_an_unknown_card_as_maximally_novel():
    """A card with no inclusion data is one nobody is recorded as playing."""
    assert _novelty(["unseen"], {}) == 1.0


def test_novelty_averages_over_the_hits():
    assert _novelty(["a", "b"], {"a": 0.0, "b": 1.0}) == 0.5


def test_saturated_hold_out_is_flagged():
    """`--seed` is inert when the hold-out consumes every distinctive card.

    EDHREC returns exactly 10 `highsynergycards` and `hold_out` defaults to 10,
    so this is the normal case. Repeated runs then agree because there is no
    variance to observe, which is indistinguishable from a stable result unless
    the report says so.
    """
    from deck_lab.evaluate import Case

    assert Case(commander="x", commander_oracle_id="1").saturated is False
    assert Case(commander="x", commander_oracle_id="1", saturated=True).saturated is True


def test_is_cached_is_false_for_an_unknown_commander():
    """The cold-cache guard. A run that fetches partway through writes
    RECOMMENDS edges mid-run, so arms before the fetch see a different graph
    from those after — which silently invalidates a before/after comparison."""
    from deck_lab.edhrec import is_cached

    assert is_cached("Definitely Not A Real Commander 12345") is False


def test_baseline_arm_scopes_channel_edhrec_to_the_commanders_identity(monkeypatch):
    """`channel_edhrec`'s hard filter requires every card colour to be IN the
    identity list, so an empty list (as opposed to "no filter") admits
    colourless cards only. The baseline arm used to pass `[]` unconditionally,
    crippling the number every other arm in `docs/evaluation.md` is compared
    against."""
    from deck_lab import evaluate, graph

    case = evaluate.Case(
        commander="Atraxa, Praetors' Voice",
        commander_oracle_id="atraxa-id",
        kept=["kept-a"],
        held_out={"held-b"},
    )

    calls: dict = {}

    def fake_fetch_deck(rows):
        assert rows == {"atraxa-id": 1}
        return [{"oracle_id": "atraxa-id", "color_identity": ["W", "U", "B", "G"]}]

    def fake_channel_edhrec(commander, deck, identity, *, limit=500, pool_filter=None):
        calls["identity"] = identity
        return [
            {
                "oracle_id": "held-b",
                "name": "Held B",
                "inclusion_rate": 0.5,
                "type_line": "Creature",
            }
        ]

    monkeypatch.setattr(graph, "fetch_deck", fake_fetch_deck)
    monkeypatch.setattr(graph, "channel_edhrec", fake_channel_edhrec)

    hits, names, channel_hits, share = evaluate.run_arm(
        case, "baseline_popularity", k=25, channels=None
    )

    assert calls["identity"] == ["W", "U", "B", "G"]
    assert hits == 1
    assert names == ["Held B"]
    assert channel_hits == {}


def test_baseline_arm_falls_back_to_an_empty_identity_when_the_commander_is_missing(
    monkeypatch,
):
    """A commander absent from the graph must not crash the harness — it just
    degrades to the old (colourless-only) behaviour."""
    from deck_lab import evaluate, graph

    case = evaluate.Case(commander="Ghost", commander_oracle_id="missing-id", held_out=set())

    calls: dict = {}

    def fake_channel_edhrec(commander, deck, identity, **kwargs):
        calls["identity"] = identity
        return []

    monkeypatch.setattr(graph, "fetch_deck", lambda rows: [])
    monkeypatch.setattr(graph, "channel_edhrec", fake_channel_edhrec)

    evaluate.run_arm(case, "baseline_popularity", k=25, channels=None)

    assert calls["identity"] == []
