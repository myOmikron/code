"""Cut scoring and swap pairing. Pure functions — no database."""

from __future__ import annotations

import pytest

from deck_lab.composition import template_for
from deck_lab.cuts import (
    CUT_EXCLUDED_THEME,
    CUT_PINNED_THEME,
    DOWNGRADE_MARGIN,
    CutCandidate,
    CutCode,
    cut_phrase,
    pair_swaps,
    score_cuts,
    shape_delta,
    upgrade_candidates,
)


def _card(oid, name, cmc=2.0, land=False, play=0.5):
    return {
        "oracle_id": oid,
        "name": name,
        "cmc": cmc,
        "type_line": "Land" if land else "Creature",
        "is_land": land,
        "price_usd": None,
        "playability": play,
        "qty": 1,
    }


def _roles(oid, roles, qty=1):
    return {"oracle_id": oid, "roles": roles, "qty": qty}


TEMPLATE = template_for(0.5)


def test_the_commander_is_never_a_cut():
    cards = [_card("cmd", "Atraxa"), _card("x", "Filler")]
    roles = [_roles("cmd", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]

    cuts = score_cuts(cards, roles, {}, {}, TEMPLATE, protected={"cmd"})

    assert "cmd" not in {c.oracle_id for c in cuts}


def test_every_named_commander_is_defended_even_with_empty_keep(monkeypatch):
    """Only the scalar `commander_oracle_id` used to be defended in
    `suggest_swaps` — a second commander (partners, backgrounds) was protected
    only because *our* frontend smuggled it through `keep`. Any other client
    sending an empty `keep` got "cut your commander" for the second partner."""
    from deck_lab import diagnostics, graph, suggestions
    from deck_lab.cuts import suggest_swaps

    cards = [_card("cmd-a", "Partner A"), _card("cmd-b", "Partner B"), _card("x", "Filler")]
    roles = [
        _roles("cmd-a", {"payoff": 1.0}),
        _roles("cmd-b", {"payoff": 1.0}),
        _roles("x", {"payoff": 1.0}),
    ]

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "deck_card_resources", lambda deck: {})
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})
    monkeypatch.setattr(graph, "deck_tutor_count", lambda deck: 0)

    class _Report:
        balance: list = []
        types: list = []
        buckets: list = []
        cedh_class: str | None = None

    monkeypatch.setattr(diagnostics, "diagnose", lambda *a, **kw: _Report())

    class _Adds:
        suggestions: list = []

    monkeypatch.setattr(suggestions, "suggest", lambda *a, **kw: _Adds())

    result = suggest_swaps(
        ["cmd-a", "cmd-b", "x"],
        ["Partner A", "Partner B", "Filler"],
        commander_oracle_id="cmd-a",
        commander_oracle_ids=["cmd-a", "cmd-b"],
        protected=[],
    )

    cut_ids = {c.oracle_id for c in result["cuts"]}
    assert "cmd-a" not in cut_ids
    assert "cmd-b" not in cut_ids


def test_a_co_commander_is_refused_as_a_replace_target():
    """The refuse-the-anchor guard covers the whole command zone: a
    co-commander is no more replaceable than the commander itself. The guard
    fires before any graph work, so no stubbing is needed."""
    from deck_lab.cuts import find_replacements

    result = find_replacements(
        ["cmd-a", "cmd-b", "x"],
        ["Partner A", "Partner B", "Filler"],
        "cmd-b",
        commander_oracle_id="cmd-a",
        commander_oracle_ids=["cmd-a", "cmd-b"],
    )

    assert result["target"] is None
    assert result["replacements"] == []
    assert result["notes"] == ["The commander cannot be replaced."]


def test_replace_never_returns_the_target(monkeypatch):
    """`remaining` drops the target from the deck precisely so `_HARD_FILTER`
    stops vetoing it, which makes the target reachable as a candidate again —
    the explicit drop below the `suggest()` call is what keeps a card from
    being offered as its own replacement."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements
    from deck_lab.suggestions import Suggestion

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(
        graph, "cards_role_weights", lambda ids: {oid: {"payoff": 1.0} for oid in ids}
    )
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {})

    def _suggestion(oid, name):
        return Suggestion(
            oracle_id=oid,
            name=name,
            cmc=2.0,
            type_line="Creature",
            price_usd=None,
            score=1.0,
            provenance=[],
        )

    class _Report:
        suggestions = [_suggestion("t", "Target"), _suggestion("y", "Better Target")]

    monkeypatch.setattr(suggestions, "suggest", lambda *a, **kw: _Report())

    result = find_replacements(["t", "x"], ["Target", "Filler"], "t")

    assert [r.oracle_id for r in result["replacements"]] == ["y"]


def test_replace_threads_theme_prefs_into_its_suggest_call(monkeypatch):
    """Task 3: `find_replacements` gained `pinned_themes`/`excluded_themes`
    and threads both straight into its internal `suggest()` call, the same
    way it already threads `excluded`/`identity`. `suggest()`'s own
    exclusion pass (`_apply_theme_exclusions`, Task 1) already has a full
    suite proving the demotion arithmetic — this stub reuses its all-or-
    nothing shape (a themed alternative that has nothing else going for it
    zeroes out once its theme is excluded) only to prove the new params
    actually reach `suggest()` from this caller, which is the whole of what
    Task 3 changes."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements
    from deck_lab.suggestions import Suggestion

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(
        graph, "cards_role_weights", lambda ids: {oid: {"payoff": 1.0} for oid in ids}
    )
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {})

    def _suggestion(oid, name, score):
        return Suggestion(
            oracle_id=oid,
            name=name,
            cmc=2.0,
            type_line="Creature",
            price_usd=None,
            score=score,
            provenance=[],
        )

    def _fake_suggest(*args, excluded_themes=None, **kwargs):
        themed_score = 0.0 if excluded_themes and "artifacts" in excluded_themes else 4.0
        return type(
            "_Report",
            (),
            {
                "suggestions": [
                    _suggestion("t", "Target", 1.0),
                    _suggestion("themed", "Foundry Inspector", themed_score),
                ]
            },
        )()

    monkeypatch.setattr(suggestions, "suggest", _fake_suggest)

    without = find_replacements(["t", "x"], ["Target", "Filler"], "t")
    excluded = find_replacements(
        ["t", "x"], ["Target", "Filler"], "t", excluded_themes=["artifacts"]
    )

    def _score(result, oracle_id):
        return next(r.score for r in result["replacements"] if r.oracle_id == oracle_id)

    assert _score(without, "themed") == 4.0
    assert _score(excluded, "themed") == 0.0


def test_replace_ranks_by_job_match_not_shape_noise(monkeypatch):
    """The regression the old `(penalty_after, -score)` sort failed: two
    candidates share the target's role, but only one also shares its theme.
    Measured live on Windfall's alternatives, the theme-sharing candidate
    (Wheel of Fortune) held the highest score in the list and still lost,
    because the sort's primary key was shape and shape is a continuous float
    two candidates essentially never tie on — sub-1% shape noise decided the
    whole order. `z` is built to leave the deck in objectively *worse* shape
    than `y` (a higher `penalty_after`) so this proves job match, not shape,
    decides the order now."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements
    from deck_lab.suggestions import Suggestion

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(
        graph, "cards_role_weights", lambda ids: {"y": {"payoff": 1.0}, "z": {"payoff": 1.0}}
    )

    def _theme_fits(ids):
        fits = {"t": {"wheels": 0.77}, "z": {"wheels": 1.0}}
        return {oid: fits[oid] for oid in ids if oid in fits}

    monkeypatch.setattr(graph, "cards_theme_fits", _theme_fits)

    def _suggestion(oid, name, cmc):
        return Suggestion(
            oracle_id=oid,
            name=name,
            cmc=cmc,
            type_line="Creature",
            price_usd=None,
            score=1.0,
            provenance=[],
        )

    class _Report:
        # `y` at cmc 5 lands in an otherwise-empty curve bucket; `z` at cmc 2
        # piles onto the bucket "Filler" already occupies, the worse spot —
        # role-and-theme match is the only thing that can make `z` win.
        suggestions = [_suggestion("y", "Role Only", 5.0), _suggestion("z", "Role and Theme", 2.0)]

    monkeypatch.setattr(suggestions, "suggest", lambda *a, **kw: _Report())

    result = find_replacements(["t", "x"], ["Target", "Filler"], "t")

    by_id = {r.oracle_id: r for r in result["replacements"]}
    assert by_id["z"].delta.penalty_after > by_id["y"].delta.penalty_after
    assert [r.oracle_id for r in result["replacements"]] == ["z", "y"]


def test_replace_pins_the_targets_strongest_themes(monkeypatch):
    """`REPLACE_THEME_FLOOR` is `2 * FIT_THRESHOLD` (0.24) and
    `REPLACE_THEME_LIMIT` is 2: `reanimator` (0.2) falls to the floor,
    `spellslinger` (0.3) clears the floor but falls to the cap, and the
    derived pins are exactly the top two that clear both — `wheels` and
    `tutors`. All four are real ids in `themes.THEMES`, so this stays honest
    if it is ever pointed at the unstubbed resolver."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})

    fits = {"wheels": 0.8, "tutors": 0.5, "spellslinger": 0.3, "reanimator": 0.2}
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {"t": fits} if "t" in ids else {})

    captured: dict = {}

    def _fake_suggest(*args, **kwargs):
        captured["pinned_themes"] = kwargs.get("pinned_themes")
        return type("_Report", (), {"suggestions": []})()

    monkeypatch.setattr(suggestions, "suggest", _fake_suggest)

    find_replacements(["t", "x"], ["Target", "Filler"], "t")

    assert captured["pinned_themes"] == ["wheels", "tutors"]


def test_replace_does_not_pin_a_theme_the_user_excluded(monkeypatch):
    """A derived pin never overrides a stated exclusion — the exclusion is
    the user's, the pin is only the advisor's guess about one slot. The
    target's top theme (`wheels`) is excluded, so the derived pins fall
    through to the next two that clear the floor."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})

    fits = {"wheels": 0.8, "tutors": 0.5, "spellslinger": 0.3, "reanimator": 0.2}
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {"t": fits} if "t" in ids else {})

    captured: dict = {}

    def _fake_suggest(*args, **kwargs):
        captured["pinned_themes"] = kwargs.get("pinned_themes")
        return type("_Report", (), {"suggestions": []})()

    monkeypatch.setattr(suggestions, "suggest", _fake_suggest)

    find_replacements(["t", "x"], ["Target", "Filler"], "t", excluded_themes=["wheels"])

    assert captured["pinned_themes"] == ["tutors", "spellslinger"]
    assert "wheels" not in captured["pinned_themes"]


def test_replace_keeps_the_callers_own_pins(monkeypatch):
    """A caller pin and a derived pin both reach `suggest`, deduped via
    `dict.fromkeys` — the caller's own pin (`tutors`) keeps its position at
    the front, and the derived pin that duplicates it (also `tutors`, the
    target's second-strongest theme) is dropped rather than repeated."""
    from deck_lab import graph, suggestions
    from deck_lab.cuts import find_replacements

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})

    fits = {"wheels": 0.8, "tutors": 0.5}
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {"t": fits} if "t" in ids else {})

    captured: dict = {}

    def _fake_suggest(*args, **kwargs):
        captured["pinned_themes"] = kwargs.get("pinned_themes")
        return type("_Report", (), {"suggestions": []})()

    monkeypatch.setattr(suggestions, "suggest", _fake_suggest)

    find_replacements(["t", "x"], ["Target", "Filler"], "t", pinned_themes=["tutors"])

    assert captured["pinned_themes"] == ["tutors", "wheels"]


def test_replace_never_reads_a_cedh_class_it_never_computed(monkeypatch):
    """cEDH Pro round Task E follow-up: `/replace` never diagnoses the deck
    (no theme/typal profile — see the comment above its `conditioned_template`
    call), so it has nothing to classify with. Even at bracket 5 it must keep
    scoring against the pooled `CEDH` template rather than guess a
    sub-archetype it was never told."""
    from deck_lab import graph, suggestions
    from deck_lab import type_targets as tt
    from deck_lab.composition import CEDH
    from deck_lab.cuts import find_replacements

    cards = [_card("t", "Target"), _card("x", "Filler")]
    roles = [_roles("t", {"payoff": 1.0}), _roles("x", {"payoff": 1.0})]
    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})
    monkeypatch.setattr(graph, "cards_theme_fits", lambda ids: {})

    def _fake_suggest(*args, **kwargs):
        return type("_Report", (), {"suggestions": []})()

    monkeypatch.setattr(suggestions, "suggest", _fake_suggest)

    real_conditioned_template = tt.conditioned_template
    captured: dict = {}

    def spy(*args, **kwargs):
        template = real_conditioned_template(*args, **kwargs)
        captured["template"] = template
        return template

    monkeypatch.setattr(tt, "conditioned_template", spy)

    find_replacements(["t", "x"], ["Target", "Filler"], "t", speed=1.0)

    assert captured["template"].name == CEDH.name == "cedh"


def _overfull_deck(**overrides):
    """A deck genuinely over its interaction quota.

    Cuts only surface where removing something *helps*, so a two-card fixture
    scores nothing — every bucket is far under target and every removal makes
    it worse.
    """
    cards, roles = [], []
    for i in range(24):
        oid = f"r{i}"
        cards.append(_card(oid, f"Removal {i}", play=overrides.get(oid, 0.5)))
        roles.append(_roles(oid, {"spot_removal": 1.0}))
    for i in range(36):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    return cards, roles


def test_a_less_played_card_outranks_a_staple_with_the_same_delta():
    """Every card in an over-full bucket has the same marginal delta. Without a
    tiebreak they tie and the ordering reads as arbitrary."""
    cards, roles = _overfull_deck(r0=0.05, r1=0.95)
    cards[0]["name"], cards[1]["name"] = "Obscure", "Staple"

    order = [c.name for c in score_cuts(cards, roles, {}, {}, TEMPLATE)]

    assert order.index("Obscure") < order.index("Staple")


def test_a_staple_is_labelled_as_one():
    cards, roles = _overfull_deck(r0=0.95)
    cards[0]["name"] = "Staple"

    cuts = {c.name: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}

    assert any("staple" in r.text for r in cuts["Staple"].reasons)
    assert any(r.code == "staple" for r in cuts["Staple"].reasons)


def _shape_neutral_payoffs(n=30):
    """A deck whose synergy bucket sits *inside* its corridor.

    The cards ride the land flag to stay out of the curve and the mana
    bucket, so cutting any one of them moves no axis — the exact spot where
    the old, purely shape-driven scoring could never surface a cut at all.
    """
    cards, roles = [], []
    for i in range(n):
        oid = f"p{i}"
        cards.append(_card(oid, f"Payoff {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"payoff": 1.0}))
    return cards, roles


def test_a_rarely_played_card_scores_the_cut_rather_than_just_saying_it():
    """The Anhelo case: playability 0.09, payoff role, bucket inside its
    corridor — invisible to shape-only scoring, where "rarely played" was
    prose with no score behind it. Two identical nonland payoffs, one weak:
    the weak one must surface carrying a real margin over its peer, not the
    old redundancy-multiplier sliver. (Lands sit the rare term out — see
    the basics test — so the probes here are spells.)"""
    cards, roles = _shape_neutral_payoffs()
    cards[0] = _card("p0", "Weak Painter", cmc=0.0, play=0.05)
    cards[1] = _card("p1", "Fine Payoff", cmc=0.0, play=0.5)

    cuts = {c.name: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}

    assert "Weak Painter" in cuts
    assert any(r.code == "rarely-played" for r in cuts["Weak Painter"].reasons)
    peer = cuts["Fine Payoff"].score if "Fine Payoff" in cuts else 0.0
    assert cuts["Weak Painter"].score >= peer + 0.3


def test_a_payoff_with_no_fuel_is_prosecuted_as_stranded():
    cards, roles = _shape_neutral_payoffs()
    cards[0].update(name="Fuelless")
    resources = {"p0": {"cares_about": {"creature_token"}, "produces": set()}}

    cuts = {
        c.name: c for c in score_cuts(cards, roles, resources, {}, TEMPLATE, produced_counts={})
    }

    assert "Fuelless" in cuts
    stranded = next(r for r in cuts["Fuelless"].reasons if r.code == "stranded")
    assert "creature_token" in stranded.text
    # One supported want and the card is merely narrow, not stranded.
    fed = {
        c.name: c
        for c in score_cuts(
            cards, roles, resources, {}, TEMPLATE, produced_counts={"creature_token": 4}
        )
    }
    assert "Fuelless" not in fed


def test_a_self_triggering_card_is_never_stranded():
    """Cecily, Haunted Mage cares about `attack_trigger` in the vocabulary's
    payoff sense — but she makes her own trigger by attacking, so "wants
    attack_trigger, which nothing in the deck makes" was a misread of the
    card (reported live). Trigger-event resources sit the stranded test
    out; a material want alongside one is still judged."""
    cards, roles = _shape_neutral_payoffs()
    cards[0].update(name="Cecily")
    resources = {"p0": {"cares_about": {"attack_trigger"}, "produces": set()}}

    cuts = {
        c.name: c for c in score_cuts(cards, roles, resources, {}, TEMPLATE, produced_counts={})
    }
    assert "Cecily" not in cuts or not any(r.code == "stranded" for r in cuts["Cecily"].reasons)

    resources = {"p0": {"cares_about": {"attack_trigger", "creature_token"}, "produces": set()}}
    cuts = {
        c.name: c for c in score_cuts(cards, roles, resources, {}, TEMPLATE, produced_counts={})
    }
    stranded = next(r for r in cuts["Cecily"].reasons if r.code == "stranded")
    assert "creature_token" in stranded.text
    assert "attack_trigger" not in stranded.text


def test_a_lieutenant_card_is_never_stranded_its_fuel_is_the_command_zone():
    """Tyrant's Familiar cares about `commander_matters` — and its fuel is the
    commander in the command zone, which every Commander deck fields by
    construction and the produced counts (built from the 99) can never
    contain. "Wants commander_matters, which nothing in the deck makes" was
    a misread of the deck (reported live, on a three-commander Rule 0 zone).
    Same shape as the Cecily fix: a material want alongside it is still
    judged."""
    cards, roles = _shape_neutral_payoffs()
    cards[0].update(name="Tyrant")
    resources = {"p0": {"cares_about": {"commander_matters"}, "produces": set()}}

    cuts = {
        c.name: c for c in score_cuts(cards, roles, resources, {}, TEMPLATE, produced_counts={})
    }
    assert "Tyrant" not in cuts or not any(r.code == "stranded" for r in cuts["Tyrant"].reasons)

    resources = {"p0": {"cares_about": {"commander_matters", "creature_token"}, "produces": set()}}
    cuts = {
        c.name: c for c in score_cuts(cards, roles, resources, {}, TEMPLATE, produced_counts={})
    }
    stranded = next(r for r in cuts["Tyrant"].reasons if r.code == "stranded")
    assert "creature_token" in stranded.text
    assert "commander_matters" not in stranded.text


def _overfull_synergy_deck():
    cards, roles = _shape_neutral_payoffs(36)
    return cards, roles


def test_the_tutor_floor_defends_a_tutor_from_the_cut_list():
    """The Demonic Tutor case: suggested at rank 3 by the add side, offered
    as a cut by the cut side in the same session. At or below the bracket's
    tutor target, cutting a tutor reopens the gap the advisor itself argues
    about — defended outright."""
    cards, roles = _overfull_synergy_deck()
    cards[0].update(name="Demonic Tutor", playability=0.6)
    roles[0] = _roles("p0", {"tutor": 1.0})

    offered = {c.name for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    defended = {c.name for c in score_cuts(cards, roles, {}, {}, TEMPLATE, tutor_floor_ids={"p0"})}

    assert "Demonic Tutor" in offered
    assert "Demonic Tutor" not in defended


def test_a_complete_combo_piece_is_defended():
    cards, roles = _overfull_synergy_deck()
    cards[0].update(name="Underworld Breach")

    offered = {c.name for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    defended = {
        c.name
        for c in score_cuts(
            cards,
            roles,
            {},
            {},
            TEMPLATE,
            combo_partners={"p0": ["Frantic Search", "Lion's Eye Diamond"]},
        )
    }

    assert "Underworld Breach" in offered
    assert "Underworld Breach" not in defended


def test_the_marginal_basic_leads_a_land_cut():
    """Playability measures ubiquity, not marginal value: an Island's
    enormous playrate read the fifth basic of a three-colour deck as a
    staple to defend, so an off-colour fetch and an obscure utility land
    were offered first — the observed failure. The marginal basic is
    fungible by definition and must lead any land cut, at any playrate,
    without a staple defence."""
    cards, roles = _overfull_deck()
    # The base fixture's 36 lands sit inside the speed-0.5 corridor — push
    # the deck genuinely over its mana quota so a land cut helps at all.
    for i in range(36, 42):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    lands = [card for card in cards if card["is_land"]]
    lands[0].update(name="Fifth Island", type_line="Basic Land — Island", playability=0.98)
    lands[1].update(name="Off-Colour Fetch", playability=0.75)
    lands[2].update(name="Obscure Utility", playability=0.05)

    cuts = {c.name: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    order = [c.name for c in score_cuts(cards, roles, {}, {}, TEMPLATE)]

    assert order.index("Fifth Island") < order.index("Obscure Utility")
    assert order.index("Obscure Utility") < order.index("Off-Colour Fetch")
    assert not any(r.code == "staple" for r in cuts["Fifth Island"].reasons)


def _overfull_mana_and_interaction_deck():
    """Forty filler lands (over `mana_sources`, high 37.0) plus fifteen
    removal spells (over `interaction`, high 13.5) — the shape the Plaza of
    Heroes report needs: a deck crowded on both axes at once, so cutting a
    card that touches both looks (wrongly, pre-fix) like it relieves twice
    as much as cutting a plain land."""
    cards, roles = [], []
    for i in range(40):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    for i in range(15):
        oid = f"r{i}"
        cards.append(_card(oid, f"Removal {i}", play=0.5))
        roles.append(_roles(oid, {"spot_removal": 1.0}))
    return cards, roles


def test_a_lands_rider_role_never_argues_for_cutting_it():
    """The Plaza of Heroes case: a deck over on both `mana_sources` and
    `interaction`. A nonbasic land filling `land` + `protection` must not
    outscore a basic filling `land` alone — cutting it used to relieve two
    crowded buckets while the basic relieved only one, backwards from what
    should happen since the protection rides along on a land slot the deck
    was spending anyway. The reason must agree with the score: `interaction`
    must not be named."""
    cards, roles = _overfull_mana_and_interaction_deck()
    cards.append(_card("plaza", "Plaza of Heroes", cmc=0.0, land=True, play=0.5))
    roles.append(_roles("plaza", {"land": 1.0, "protection": 1.0}))
    cards.append(_card("mtn", "Mountain", cmc=0.0, land=True, play=0.98))
    cards[-1]["type_line"] = "Basic Land — Mountain"
    roles.append(_roles("mtn", {"land": 1.0}))

    cuts = {c.oracle_id: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    order = [c.oracle_id for c in score_cuts(cards, roles, {}, {}, TEMPLATE)]

    assert order.index("mtn") < order.index("plaza")
    assert cuts["mtn"].score > cuts["plaza"].score
    assert not any("interaction" in r.text for r in cuts["plaza"].reasons)
    assert not any(
        "interaction" in r.params.get("bucket_slugs", "").split(",") for r in cuts["plaza"].reasons
    )


def test_a_lands_rider_role_can_still_defend_it():
    """The `min` asymmetry: the rider can only ever lower the case for
    cutting the land, never raise it. Same shapes as above but `interaction`
    is short (one removal spell, low 10.0) rather than crowded, so losing
    Plaza's protection is a real cost. Both cards are given identical
    redundancy (playability 0.0, so the nonbasic's `1.0 - play` multiplier
    matches the basic's) so the only thing that can separate their scores is
    that cost — proving it survives the `min` rather than being flattened
    away by always crediting the land with the rider still attached."""
    cards, roles = [], []
    for i in range(40):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    for i in range(5):
        oid = f"r{i}"
        cards.append(_card(oid, f"Removal {i}", play=0.5))
        roles.append(_roles(oid, {"spot_removal": 1.0}))
    cards.append(_card("plaza", "Plaza of Heroes", cmc=0.0, land=True, play=0.0))
    roles.append(_roles("plaza", {"land": 1.0, "protection": 0.3}))
    cards.append(_card("mtn", "Mountain", cmc=0.0, land=True, play=0.0))
    cards[-1]["type_line"] = "Basic Land — Mountain"
    roles.append(_roles("mtn", {"land": 1.0}))

    cuts = {c.oracle_id: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}

    assert cuts["plaza"].score < cuts["mtn"].score


def test_basics_lead_a_tied_land_cut():
    """`redundancy` already puts a basic ahead of any nonbasic with a
    playrate, but a nonbasic at playability 0.0 ties exactly — same delta,
    same `1.0 - play == 1.0` multiplier, same reasons. Task 4's tiebreak
    (`not type_line.startswith("Basic")`) is what puts the basic first
    rather than leaving the order to depend on list position."""
    cards, roles = [], []
    for i in range(40):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    cards.append(_card("utility", "Obscure Utility Land", cmc=0.0, land=True, play=0.0))
    roles.append(_roles("utility", {"land": 1.0}))
    cards.append(_card("mtn", "Mountain", cmc=0.0, land=True, play=0.0))
    cards[-1]["type_line"] = "Basic Land — Mountain"
    roles.append(_roles("mtn", {"land": 1.0}))

    cuts = {c.oracle_id: c for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    order = [c.oracle_id for c in score_cuts(cards, roles, {}, {}, TEMPLATE)]

    assert cuts["utility"].score == cuts["mtn"].score
    assert order.index("mtn") < order.index("utility")


def test_cut_reason_codes_never_carry_the_kind_prefix():
    """`advisor-phrase.ts` prepends `cut-` itself when wording a reason (its
    `kind` is "cut") — a code that already carries the prefix doubles up into
    a lookup neither locale bundle holds, so the reader always sees the
    English fallback. Every code `score_cuts` can emit must be bare."""
    codes: set[str] = set()

    crowded_cards, crowded_roles = _overfull_deck(r0=0.05, r1=0.95)
    crowded_cards[0]["name"], crowded_cards[1]["name"] = "Obscure", "Staple"
    for cut in score_cuts(crowded_cards, crowded_roles, {}, {}, TEMPLATE):
        codes.update(r.code for r in cut.reasons)

    scarce_cards, scarce_roles = _overfull_deck()
    resources = {"r0": {"produces": {"etb_trigger"}, "cares_about": set()}}
    for cut in score_cuts(scarce_cards, scarce_roles, resources, {"etb_trigger": 4}, TEMPLATE):
        codes.update(r.code for r in cut.reasons)

    # A curve-only overrun: roleless cards bunched at one mana value, so no
    # bucket is "crowded" but trimming one still helps the shape.
    curve_cards = [_card(f"c{i}", f"Big {i}", cmc=6.0, play=0.4) for i in range(20)]
    curve_roles = [_roles(f"c{i}", {}) for i in range(20)]
    land_cards = [_card(f"l{i}", f"Land {i}", cmc=0.0, land=True) for i in range(16)]
    land_roles = [_roles(f"l{i}", {"land": 1.0}) for i in range(16)]
    for cut in score_cuts(curve_cards + land_cards, curve_roles + land_roles, {}, {}, TEMPLATE):
        codes.update(r.code for r in cut.reasons)

    # The theme-preference term (Task 7): only `excluded` earns its own
    # reason code — a pinned defence gets none (see the dedicated test below).
    excluded_cards, excluded_roles = _overfull_deck()
    for cut in score_cuts(
        excluded_cards, excluded_roles, {}, {}, TEMPLATE, excluded_share={"r0": (1.0, "Vehicles")}
    ):
        codes.update(r.code for r in cut.reasons)

    # The stranded prosecution (the Anhelo round).
    stranded_cards, stranded_roles = _shape_neutral_payoffs()
    stranded_resources = {"p0": {"cares_about": {"creature_token"}, "produces": set()}}
    for cut in score_cuts(
        stranded_cards, stranded_roles, stranded_resources, {}, TEMPLATE, produced_counts={}
    ):
        codes.update(r.code for r in cut.reasons)

    # The two defences (`combo-piece`, `tutor-floor`) are absent by design:
    # a defence strong enough to fire removes the card from the list
    # entirely, so its reason almost never renders — their wiring is proven
    # by the dedicated defence tests above. The bare-prefix contract is what
    # this test owns, and it holds over the whole enum.
    assert codes == {c.value for c in CutCode} - {"combo-piece", "tutor-floor"}
    assert not any(c.value.startswith("cut-") for c in CutCode)


def test_a_card_supplying_something_scarce_is_defended():
    """A card that is the deck's source of something it wants is a bad cut
    however redundant its role looks."""
    cards = [_card("a", "Only Source", play=0.1), _card("b", "Redundant", play=0.1)]
    roles = [_roles("a", {"spot_removal": 1.0}), _roles("b", {"spot_removal": 1.0})]
    resources = {"a": {"produces": {"etb_trigger"}, "cares_about": set()}}

    cuts = score_cuts(cards, roles, resources, {"etb_trigger": 4}, TEMPLATE)
    scores = {c.name: c.score for c in cuts}

    assert scores.get("Only Source", -99) < scores.get("Redundant", 0)


def test_scarcity_shows_in_the_reasons():
    cards = [_card("a", "Only Source", play=0.1)]
    resources = {"a": {"produces": {"etb_trigger"}, "cares_about": set()}}

    cuts = score_cuts(
        cards, [_roles("a", {"payoff": 1.0})], resources, {"etb_trigger": 4}, TEMPLATE
    )

    assert not cuts or any("which the deck wants" in r.text for c in cuts for r in c.reasons)


def test_cuts_are_ranked_best_first():
    cards, roles = _overfull_deck()
    cuts = score_cuts(cards, roles, {}, {}, TEMPLATE)

    assert [c.score for c in cuts] == sorted((c.score for c in cuts), reverse=True)


# --- theme preferences (Task 7) --------------------------------------------


def test_empty_theme_shares_leave_cut_scores_byte_identical_to_today():
    """Regression guard, TRAP 6: `pinned_share`/`excluded_share` are new
    optional params — a caller passing nothing, or explicitly empty maps,
    must see exactly today's scores."""
    cards, roles = _overfull_deck()

    before = [c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)]
    after = [
        c.score
        for c in score_cuts(cards, roles, {}, {}, TEMPLATE, pinned_share={}, excluded_share={})
    ]

    assert after == before


def test_an_excluded_theme_card_outranks_an_otherwise_identical_neutral_card():
    """The cut-scoring mirror of Task 1's exclusion pass, run the other way:
    a card that reads as an excluded theme is a *better* cut, proportional to
    its own share of that theme — not a flat bonus, so a fully-in-theme card
    outranks a half-in-theme card, which outranks an untouched neutral one.
    Both shares clear `FIT_THRESHOLD` and neither card has a pinned share, so
    the dominance gate is a no-op here."""
    cards, roles = _overfull_deck()

    plain = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    themed = {
        c.oracle_id: c
        for c in score_cuts(
            cards,
            roles,
            {},
            {},
            TEMPLATE,
            excluded_share={"r0": (1.0, "Vehicles"), "r1": (0.5, "Vehicles")},
        )
    }

    assert themed["r0"].score == pytest.approx(plain["r0"] + CUT_EXCLUDED_THEME * 1.0)
    assert themed["r1"].score == pytest.approx(plain["r1"] + CUT_EXCLUDED_THEME * 0.5)
    assert themed["r0"].score > themed["r1"].score > plain["r2"]
    assert any(r.code == CutCode.EXCLUDED_THEME for r in themed["r0"].reasons)


def test_a_pinned_theme_card_ranks_below_an_otherwise_identical_neutral_card():
    """The other direction: proportional defence, not a hard protection, and
    it earns no reason of its own — a defence that fired and the card still
    made the cut list is not a reason to cut it (only `EXCLUDED_THEME` gets a
    reason; see the test above)."""
    cards, roles = _overfull_deck()

    plain = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    themed = {
        c.oracle_id: c
        for c in score_cuts(
            cards,
            roles,
            {},
            {},
            TEMPLATE,
            pinned_share={"r0": (1.0, "Reanimator"), "r1": (0.5, "Reanimator")},
        )
    }

    assert themed["r0"].score == pytest.approx(plain["r0"] - CUT_PINNED_THEME * 1.0)
    assert themed["r1"].score == pytest.approx(plain["r1"] - CUT_PINNED_THEME * 0.5)
    assert themed["r0"].score < themed["r1"].score < plain["r2"]
    assert not any(r.code == CutCode.EXCLUDED_THEME for r in themed["r0"].reasons)


def test_a_below_floor_excluded_share_fires_no_reason_and_no_term():
    """`FIT_THRESHOLD` gate: a share below it reads as vocabulary noise, not
    membership, and contributes neither a reason nor a score term — the
    counters/big_spells false positives measured live on Defy Death (both
    0.111, below the 0.12 floor)."""
    cards, roles = _overfull_deck()

    plain = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    themed = {
        c.oracle_id: c
        for c in score_cuts(
            cards, roles, {}, {}, TEMPLATE, excluded_share={"r0": (0.11, "Counters")}
        )
    }

    assert themed["r0"].score == pytest.approx(plain["r0"])
    assert not any(r.code == CutCode.EXCLUDED_THEME for r in themed["r0"].reasons)


def test_an_excluded_share_dominated_by_pinned_fires_no_reason_and_no_term():
    """Defy Death's own measured numbers: 0.333 tribal (excluded) against
    0.444 reanimator (pinned). The arithmetic already knows the card is more
    favored than excluded — the score already nets negative here — and the
    reason must agree: no chip, and the excluded term drops out entirely
    (the pinned defence still applies at its own full share)."""
    cards, roles = _overfull_deck()

    plain = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    themed = {
        c.oracle_id: c
        for c in score_cuts(
            cards,
            roles,
            {},
            {},
            TEMPLATE,
            excluded_share={"r0": (0.333, "Typal")},
            pinned_share={"r0": (0.444, "Reanimator")},
        )
    }

    assert not any(r.code == CutCode.EXCLUDED_THEME for r in themed["r0"].reasons)
    # `score_cuts` rounds to 3 decimals; round the expectation the same way
    # rather than tightening `approx` past what the code itself promises.
    assert themed["r0"].score == pytest.approx(round(plain["r0"] - CUT_PINNED_THEME * 0.444, 3))


def test_an_undominated_excluded_share_names_the_theme_in_the_reason():
    """Above the floor and not dominated by any pinned share: the reason
    fires, names the theme via `params["theme"]`, and the score bumps by
    exactly `CUT_EXCLUDED_THEME * share` — the user's reported case, fixed
    (Defy Death's 0.333 tribal share against zero pinned share)."""
    cards, roles = _overfull_deck()

    plain = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, TEMPLATE)}
    themed = {
        c.oracle_id: c
        for c in score_cuts(cards, roles, {}, {}, TEMPLATE, excluded_share={"r0": (0.333, "Typal")})
    }

    reason = next(r for r in themed["r0"].reasons if r.code == CutCode.EXCLUDED_THEME)
    assert reason.params["theme"] == "Typal"
    # `score_cuts` rounds to 3 decimals; round the expectation the same way
    # rather than tightening `approx` past what the code itself promises.
    assert themed["r0"].score == pytest.approx(round(plain["r0"] + CUT_EXCLUDED_THEME * 0.333, 3))


def test_theme_shares_returns_the_label_of_the_argmax_theme(monkeypatch):
    """`_theme_shares` merges by `max` across excluded (or pinned) themes so a
    card is not double-counted — the label has to travel with the max, not
    just the number, or `score_cuts`' chip cannot say *which* theme a card
    read as once more than one is excluded."""
    from deck_lab import graph
    from deck_lab.cuts import _theme_shares

    calls: list[list[str]] = []

    def _theme_share_among(oracle_ids, resources, sides, gate):
        calls.append(gate)
        share = 0.2 if len(calls) == 1 else 0.5
        return [{"oracle_id": "x", "share": share}]

    monkeypatch.setattr(graph, "theme_share_among", _theme_share_among)

    shares = _theme_shares(["vehicles", "tribal"], ["x"])

    assert len(calls) == 2
    assert shares["x"] == (0.5, "Typal")


def test_suggest_swaps_threads_excluded_themes_into_cut_scoring(monkeypatch):
    """The caller side of the wire, not just the isolated scorer above:
    `suggest_swaps` resolves `excluded_themes` to a per-card share via
    `theme_share_among` (Task 1's query, gate-side semantics, now with the
    membership `gate`) over the deck's own oracle ids, and threads the
    result into `score_cuts` as `excluded_share`. `pinned_themes` is left at
    its default here, so only one `theme_share_among` call is expected — an
    empty list short-circuits before ever reaching the graph."""
    from deck_lab import diagnostics, graph, suggestions
    from deck_lab.cuts import suggest_swaps

    cards = [_card("cmd", "Commander"), _card("x", "Filler", play=0.5)]
    roles = [_roles("cmd", {"payoff": 1.0}), _roles("x", {"spot_removal": 1.0})]

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "deck_card_resources", lambda deck: {})
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})
    monkeypatch.setattr(graph, "deck_tutor_count", lambda deck: 0)

    calls: list[tuple[list[str], list[str], list[str]]] = []

    def _theme_share_among(oracle_ids, resources, sides, gate):
        calls.append((sorted(oracle_ids), sides, gate))
        return [{"oracle_id": "x", "share": 0.8}]

    monkeypatch.setattr(graph, "theme_share_among", _theme_share_among)

    class _Report:
        balance: list = []
        types: list = []
        buckets: list = []
        cedh_class: str | None = None

    monkeypatch.setattr(diagnostics, "diagnose", lambda *a, **kw: _Report())

    class _Adds:
        suggestions: list = []

    monkeypatch.setattr(suggestions, "suggest", lambda *a, **kw: _Adds())

    result = suggest_swaps(
        ["cmd", "x"],
        ["Commander", "Filler"],
        commander_oracle_id="cmd",
        excluded_themes=["artifacts"],
    )

    # `artifacts` is cares-gated (Task 1) — the query reads only that side —
    # and its `requires_any` gate is `artifact_matters`/`artifact_token`/
    # `treasure`.
    assert calls == [
        (["cmd", "x"], ["CARES_ABOUT"], ["artifact_matters", "artifact_token", "treasure"])
    ]
    cut = next(c for c in result["cuts"] if c.oracle_id == "x")
    assert any(r.code == CutCode.EXCLUDED_THEME for r in cut.reasons)
    reason = next(r for r in cut.reasons if r.code == CutCode.EXCLUDED_THEME)
    assert reason.params["theme"] == "Artifacts"


def test_suggest_swaps_conditions_cut_scoring_on_the_reports_cedh_class(monkeypatch):
    """cEDH Pro round Task E follow-up — the consistency property the whole
    task exists for: cut scoring must read `report.cedh_class` off the
    diagnose it already ran, not default to the pooled `CEDH` template, so a
    turbo-classified deck's cuts are scored against the SAME measured RAMP
    corridor (16.0-26.1) the report showed rather than the pooled one
    (13.3-25.3)."""
    from deck_lab import diagnostics, graph, suggestions
    from deck_lab import type_targets as tt
    from deck_lab.composition import CEDH, CEDH_TURBO
    from deck_lab.cuts import suggest_swaps
    from deck_lab.vocabulary import Bucket

    cards = [_card("cmd", "Commander"), _card("x", "Filler", play=0.5)]
    roles = [_roles("cmd", {"payoff": 1.0}), _roles("x", {"spot_removal": 1.0})]

    monkeypatch.setattr(graph, "fetch_deck", lambda deck: cards)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: roles)
    monkeypatch.setattr(graph, "deck_card_resources", lambda deck: {})
    monkeypatch.setattr(graph, "cards_role_weights", lambda ids: {})
    monkeypatch.setattr(graph, "deck_tutor_count", lambda deck: 0)

    class _Report:
        balance: list = []
        types: list = []
        buckets: list = []
        cedh_class = "turbo"

    monkeypatch.setattr(diagnostics, "diagnose", lambda *a, **kw: _Report())

    class _Adds:
        suggestions: list = []

    monkeypatch.setattr(suggestions, "suggest", lambda *a, **kw: _Adds())

    # A spy, not a stub: delegating to the real `conditioned_template` is the
    # only way to prove the *actual* turbo corridor comes out the other end,
    # rather than merely that `cedh_class` was passed as a keyword somewhere.
    real_conditioned_template = tt.conditioned_template
    captured: dict = {}

    def spy(*args, **kwargs):
        template = real_conditioned_template(*args, **kwargs)
        captured["template"] = template
        return template

    monkeypatch.setattr(tt, "conditioned_template", spy)

    suggest_swaps(["cmd", "x"], ["Commander", "Filler"], commander_oracle_id="cmd", speed=1.0)

    assert captured["template"].buckets[Bucket.RAMP] == CEDH_TURBO.buckets[Bucket.RAMP]
    assert captured["template"].buckets[Bucket.RAMP] != CEDH.buckets[Bucket.RAMP]


# --- swap pairing ---------------------------------------------------------


def _cut(oid, name) -> CutCandidate:
    return CutCandidate(
        oracle_id=oid, name=name, score=1.0, reasons=[cut_phrase(CutCode.IMPROVES_SHAPE, "x")]
    )


def test_swaps_pair_only_on_a_shared_role():
    """'To add this ramp piece, cut one of these ramp pieces' — pairing across
    roles fixes one quota by breaking another."""
    adds = [{"oracle_id": "add", "name": "Signet"}]
    cuts = [_cut("ramp", "Old Rock"), _cut("removal", "A Wrath")]
    add_roles = {"add": {"mana_rock": 1.0}}
    cut_roles = {"ramp": {"mana_rock": 1.0}, "removal": {"board_wipe": 1.0}}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles)

    assert [s.cut.name for s in swaps] == ["Old Rock"]
    assert swaps[0].shared_roles == ["mana_rock"]


def test_pairing_is_capped_per_add():
    adds = [{"oracle_id": "add", "name": "Signet"}]
    cuts = [_cut(str(i), f"c{i}") for i in range(6)]
    add_roles = {"add": {"mana_rock": 1.0}}
    cut_roles = {str(i): {"mana_rock": 1.0} for i in range(6)}

    assert len(pair_swaps(adds, cuts, add_roles, cut_roles, per_add=2)) == 2


def test_an_add_with_no_partner_yields_no_swap():
    adds = [{"oracle_id": "add", "name": "Odd One"}]
    swaps = pair_swaps(adds, [_cut("c", "Cut")], {"add": {"stax": 1.0}}, {"c": {"land": 1.0}})

    assert swaps == []


def test_a_card_cannot_swap_for_itself():
    """The basics channel bypasses the already-in-deck filter, so a Mountain
    already in the deck can appear in `adds` while `score_cuts` independently
    offers that same Mountain as a cut — sharing the `land` role would
    otherwise qualify "Mountain in, Mountain out" as a swap."""
    adds = [{"oracle_id": "mountain", "name": "Mountain"}]
    cuts = [_cut("mountain", "Mountain")]
    roles = {"land": 1.0}

    swaps = pair_swaps(adds, cuts, {"mountain": roles}, {"mountain": roles})

    assert swaps == []


# --- downgrades -----------------------------------------------------------
#
# The real case: every pairing on the advisor's first screen swapped a staple
# for a weaker card of the same kind, because cuts arrive ranked by shape and
# a well-played card in a full bucket ranks high there.


def _rock(oid, name, play) -> CutCandidate:
    return CutCandidate(
        oracle_id=oid,
        name=name,
        score=1.0,
        playability=play,
        reasons=[cut_phrase(CutCode.IMPROVES_SHAPE, "x")],
    )


def test_a_much_weaker_add_is_not_offered_against_a_staple():
    """The One Ring (0.56) for Smuggler's Copter (0.27), both card advantage."""
    adds = [{"oracle_id": "add", "name": "Smuggler's Copter", "playability": 0.27}]
    cuts = [_rock("ring", "The One Ring", 0.56), _rock("spare", "Divination", 0.20)]
    roles = {"card_advantage": 1.0}

    swaps = pair_swaps(adds, cuts, {"add": roles}, {"ring": roles, "spare": roles})

    # Not suppressed — paired against the card it actually improves on.
    assert [s.cut.name for s in swaps] == ["Divination"]


def test_a_sidegrade_still_pairs():
    """Inside the margin the shape argument decides, which is the point."""
    adds = [{"oracle_id": "add", "name": "Thopter Spy Network", "playability": 0.337}]
    cuts = [_rock("sai", "Sai, Master Thopterist", 0.35)]
    roles = {"card_advantage": 1.0}

    swaps = pair_swaps(adds, cuts, {"add": roles}, {"sai": roles})

    assert [s.cut.name for s in swaps] == ["Sai, Master Thopterist"]


def test_a_game_changer_is_never_read_as_a_downgrade():
    """Powerful on an authoritative list rather than a popular one."""
    adds = [
        {"oracle_id": "add", "name": "Opposition Agent", "playability": 0.2, "game_changer": True}
    ]
    cuts = [_rock("staple", "A Staple", 0.9)]
    roles = {"tutor": 1.0}

    assert len(pair_swaps(adds, cuts, {"add": roles}, {"staple": roles})) == 1


def test_an_add_with_no_playability_is_judged_on_what_is_known():
    """An unranked card scores 0, so it pairs only with equally obscure cuts."""
    adds = [{"oracle_id": "add", "name": "New Spoiler"}]
    cuts = [_rock("staple", "A Staple", 0.5), _rock("obscure", "A Nobody", 0.05)]
    roles = {"ramp_other": 1.0}

    swaps = pair_swaps(adds, cuts, {"add": roles}, {"staple": roles, "obscure": roles})

    assert [s.cut.name for s in swaps] == ["A Nobody"]


# --- shape delta ----------------------------------------------------------


def test_delta_reports_before_and_after_per_bucket():
    cards, roles = _overfull_deck()
    delta = shape_delta(cards, roles, TEMPLATE, remove="r0")

    removal = next(b for b in delta.buckets if b.bucket == "interaction")
    assert removal.before == 24.0
    assert removal.after == 23.0


def test_removing_from_an_overfull_bucket_improves_the_shape():
    cards, roles = _overfull_deck()
    assert shape_delta(cards, roles, TEMPLATE, remove="r0").improves


def test_adding_to_an_overfull_bucket_makes_it_worse():
    cards, roles = _overfull_deck()
    delta = shape_delta(cards, roles, TEMPLATE, add_roles={"spot_removal": 1.0}, add_cmc=2)

    assert not delta.improves


def test_a_swap_moves_both_buckets():
    """The number that makes a suggestion checkable: not 'this card is good'
    but 'this takes ramp from X to Y and leaves everything else alone'."""
    cards, roles = _overfull_deck()
    delta = shape_delta(
        cards, roles, TEMPLATE, remove="r0", add_roles={"mana_rock": 1.0}, add_cmc=2
    )

    moved = {b.bucket for b in delta.buckets if b.moved}
    assert "interaction" in moved
    assert "ramp" in moved


def test_quantities_are_respected():
    """Nine Forests are nine mana sources, not one. Collapsing them inflated
    every shortfall the bridge reported."""
    cards = [_card("f", "Forest", cmc=0.0, land=True)]
    cards[0]["qty"] = 9
    roles = [_roles("f", {"land": 1.0}, qty=9)]

    delta = shape_delta(cards, roles, TEMPLATE)
    mana = next(b for b in delta.buckets if b.bucket == "mana_sources")

    assert mana.before == 9.0


def test_delta_carries_the_price_change():
    cards, roles = _overfull_deck()
    delta = shape_delta(cards, roles, TEMPLATE, remove="r0", price_change=-4.5)

    assert delta.price_change == -4.5


# --- the type axis --------------------------------------------------------


def _typed_template(**targets):
    from deck_lab.composition import BucketTarget, apply_type_targets

    return apply_type_targets(
        TEMPLATE, {name: BucketTarget(*spec) for name, spec in targets.items()}
    )


def _saturated_deck():
    """40 creatures against a target of 23-35, plus one artifact with the
    same role, cost, and playability — the only difference is the type."""
    cards, roles = [], []
    for i in range(40):
        oid = f"c{i}"
        cards.append(_card(oid, f"Creature {i}"))
        roles.append(_roles(oid, {"payoff": 1.0}))
    art = _card("a0", "Artifact 0")
    art["type_line"] = "Artifact"
    cards.append(art)
    roles.append(_roles("a0", {"payoff": 1.0}))
    for i in range(36):
        oid = f"l{i}"
        cards.append(_card(oid, f"Land {i}", cmc=0.0, land=True))
        roles.append(_roles(oid, {"land": 1.0}))
    return cards, roles


def test_cutting_an_overrepresented_type_outscores_its_equal():
    """The other half of the 40-creature fix: with everything else identical,
    the cut list should reach for a creature before the artifact."""
    cards, roles = _saturated_deck()
    template = _typed_template(Creature=(23, 35, 0.35))

    cuts = {c.oracle_id: c.score for c in score_cuts(cards, roles, {}, {}, template)}

    assert cuts["c0"] > cuts.get("a0", 0.0)


def test_a_deck_inside_its_type_ranges_pays_no_new_penalty():
    """Regression guard: conditioning the template must change nothing for a
    deck whose types are already in shape."""
    cards, roles = _overfull_deck()  # 24 creatures — inside [23, 35]
    plain = shape_delta(cards, roles, TEMPLATE, remove="r0")
    typed = shape_delta(cards, roles, _typed_template(Creature=(23, 35, 0.35)), remove="r0")

    assert typed.penalty_before == plain.penalty_before
    assert typed.penalty_after == plain.penalty_after


def test_delta_reports_the_type_rows():
    cards, roles = _saturated_deck()
    template = _typed_template(Creature=(23, 35, 0.35))

    delta = shape_delta(cards, roles, template, remove="c0")
    creature = next(b for b in delta.buckets if b.bucket == "type:Creature")

    assert creature.before == 40.0
    assert creature.after == 39.0
    assert (creature.low, creature.high) == (23.0, 35.0)


def test_the_add_half_of_the_type_ledger_keys_off_the_type_line():
    cards, roles = _saturated_deck()
    template = _typed_template(Creature=(23, 35, 0.35))

    delta = shape_delta(
        cards,
        roles,
        template,
        add_roles={"payoff": 1.0},
        add_cmc=2,
        add_type_line="Creature — Bear",
    )
    creature = next(b for b in delta.buckets if b.bucket == "type:Creature")

    assert creature.after == 41.0
    assert not delta.improves


# --- pairing against the deck's shape --------------------------------------
#
# The contradiction this fixes was visible on screen: a cut reading "the deck
# is over on synergy wincon, and this card is in it", offered six more synergy
# wincon cards for the slot.


class _Bucket:
    """The two fields of a diagnostics bucket row the pairing reads."""

    def __init__(self, bucket, status):
        self.bucket = bucket
        self.status = status


SHAPE = [_Bucket("synergy_wincon", "high"), _Bucket("ramp", "low")]


def test_a_cut_from_a_full_bucket_prefers_an_add_to_an_empty_one():
    """Answers the reason printed beside it instead of restating it."""
    adds = [
        {"oracle_id": "lateral", "name": "Another Payoff", "playability": 0.5},
        {"oracle_id": "fixes", "name": "A Rock", "playability": 0.5},
    ]
    cuts = [_rock("payoff", "Ancient Gold Dragon", 0.5)]
    add_roles = {"lateral": {"payoff": 1.0}, "fixes": {"mana_rock": 1.0}}
    cut_roles = {"payoff": {"payoff": 1.0}}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles, buckets=SHAPE)
    by_add = {s.add_name: s for s in swaps}

    # Both are offered; only one claims to fix anything.
    assert by_add["A Rock"].fills == ["ramp"]
    assert by_add["A Rock"].frees == ["synergy_wincon"]
    assert by_add["Another Payoff"].frees == []


def test_a_cross_bucket_exchange_needs_no_shared_role():
    """Requiring one is what made the contradiction unavoidable."""
    adds = [{"oracle_id": "rock", "name": "A Rock", "playability": 0.5}]
    cuts = [_rock("payoff", "A Payoff", 0.5)]

    swaps = pair_swaps(
        adds, cuts, {"rock": {"mana_rock": 1.0}}, {"payoff": {"payoff": 1.0}}, buckets=SHAPE
    )

    assert len(swaps) == 1
    assert swaps[0].shared_roles == []


def test_an_unrelated_pair_is_still_refused():
    """Only the over-to-short gradient licenses crossing roles — otherwise a
    pairing fixes one quota by breaking another."""
    adds = [{"oracle_id": "draw", "name": "A Cantrip", "playability": 0.5}]
    cuts = [_rock("removal", "A Wrath", 0.5)]

    swaps = pair_swaps(
        adds,
        cuts,
        {"draw": {"card_advantage": 1.0}},
        {"removal": {"board_wipe": 1.0}},
        buckets=SHAPE,
    )

    assert swaps == []


def test_without_bucket_rows_it_is_the_old_shared_role_pairing():
    """Callers that cannot diagnose the deck keep the previous contract."""
    adds = [{"oracle_id": "rock", "name": "A Rock", "playability": 0.5}]
    cuts = [_rock("payoff", "A Payoff", 0.5), _rock("old_rock", "Old Rock", 0.5)]
    add_roles = {"rock": {"mana_rock": 1.0}}
    cut_roles = {"payoff": {"payoff": 1.0}, "old_rock": {"mana_rock": 1.0}}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles)

    assert [s.cut.name for s in swaps] == ["Old Rock"]


def test_the_shape_fixing_partner_outranks_a_better_scoring_cut():
    """Cut rank is the tiebreak, not the sort — the whole point is that the
    top-scoring cut is not always the one worth pairing."""
    adds = [{"oracle_id": "rock", "name": "A Rock", "playability": 0.5}]
    # First in the list, so it wins on rank if gain does not separate them.
    cuts = [_rock("other_rock", "Old Rock", 0.5), _rock("payoff", "A Payoff", 0.5)]
    add_roles = {"rock": {"mana_rock": 1.0}}
    cut_roles = {"other_rock": {"mana_rock": 1.0}, "payoff": {"payoff": 1.0}}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles, per_add=1, buckets=SHAPE)

    assert [s.cut.name for s in swaps] == ["A Payoff"]


def test_every_displayed_cut_gets_a_partner_that_answers_its_reason():
    """`per_add` bounds how many cuts one add is offered against. It was never
    meant to decide what a given cut gets shown — and when the shape-fixing add
    spent its slots higher up the list, the third cut was left reading "over on
    synergy wincon" above three more synergy wincon cards."""
    adds = [
        {"oracle_id": "rock", "name": "A Rock", "playability": 0.5},
        {"oracle_id": "payoff", "name": "Another Payoff", "playability": 0.5},
    ]
    # Three cuts, all in the over-full bucket; the rock can only take two.
    cuts = [_rock(f"p{i}", f"Payoff {i}", 0.5) for i in range(3)]
    add_roles = {"rock": {"mana_rock": 1.0}, "payoff": {"payoff": 1.0}}
    cut_roles = {f"p{i}": {"payoff": 1.0} for i in range(3)}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles, per_add=2, buckets=SHAPE)

    shown = {s.cut.name for s in swaps}
    answered = {s.cut.name for s in swaps if s.fills}
    assert shown == answered, f"{shown - answered} offered no exchange for its own reason"


def test_the_second_pass_does_not_invent_a_cut_nobody_paired_with():
    """It fills gaps in what is already on display, never extends the list."""
    adds = [{"oracle_id": "rock", "name": "A Rock", "playability": 0.5}]
    cuts = [_rock("p0", "Payoff 0", 0.5), _rock("lonely", "Untouched", 0.5)]
    add_roles = {"rock": {"mana_rock": 1.0}}
    # The second cut is in no bucket at all, so nothing ever pairs with it.
    cut_roles = {"p0": {"payoff": 1.0}, "lonely": {}}

    swaps = pair_swaps(adds, cuts, add_roles, cut_roles, per_add=1, buckets=SHAPE)

    assert {s.cut.name for s in swaps} == {"Payoff 0"}


# --- upgrade swaps: same bucket, weak card out, strong card in -------------
#
# The Anhelo case: playability 0.09, `payoff` role, sitting in a
# `synergy_wincon` bucket the deck reads genuinely short on. `score_cuts`
# alone can never surface him — the sparable gate is doing exactly its job,
# refusing to dig a hole in a short bucket — so `upgrade_candidates` and the
# third pairing pass in `pair_swaps` are the only path to "cut the weak
# payoff for the strong one" this tool has.


def test_upgrade_candidates_eligibility():
    """A 0.05-play payoff qualifies; a 0.5-play payoff does not; a 0.05-play
    land does not (mana-base upgrades are the fixing channel's job); and the
    same two defences a bare cut gets — tutor floor, combo partner — apply
    here identically."""
    cards = [
        _card("weak", "Weak Payoff", play=0.05),
        _card("fine", "Fine Payoff", play=0.5),
        _card("weak_land", "Weak Land", play=0.05, land=True),
        _card("floor", "Floor Tutor", play=0.05),
        _card("combo", "Combo Piece", play=0.05),
    ]
    roles = [
        _roles("weak", {"payoff": 1.0}),
        _roles("fine", {"payoff": 1.0}),
        _roles("weak_land", {"payoff": 1.0}),
        _roles("floor", {"payoff": 1.0}),
        _roles("combo", {"payoff": 1.0}),
    ]

    candidates = {
        c.oracle_id: c
        for c in upgrade_candidates(
            cards,
            roles,
            TEMPLATE,
            tutor_floor_ids={"floor"},
            combo_partners={"combo": ["Other Piece"]},
        )
    }

    assert "weak" in candidates
    assert candidates["weak"].reasons
    assert candidates["weak"].reasons[0].code == CutCode.RARELY_PLAYED
    assert "fine" not in candidates
    assert "weak_land" not in candidates
    assert "floor" not in candidates
    assert "combo" not in candidates


def test_upgrade_candidates_ignore_protected_cards():
    cards = [_card("cmd", "Commander", play=0.05)]
    roles = [_roles("cmd", {"payoff": 1.0})]

    candidates = upgrade_candidates(cards, roles, TEMPLATE, protected={"cmd"})

    assert candidates == []


SHORT_SYNERGY = [_Bucket("synergy_wincon", "low")]


def test_an_upgrade_pairs_a_weak_payoff_against_a_strong_one_in_a_short_bucket():
    """`synergy_wincon` reads short, so a bare cut would dig a hole in it —
    but the strong add shares the weak card's bucket, so the swap leaves the
    bucket exactly as full as before while raising its quality."""
    adds = [{"oracle_id": "strong", "name": "Torment of Hailfire", "playability": 0.4}]
    weak = _rock("weak", "Anhelo, the Painter", 0.09)
    add_roles = {"strong": {"payoff": 1.0}}
    cut_roles = {"weak": {"payoff": 1.0}}

    swaps = pair_swaps(adds, [], add_roles, cut_roles, buckets=SHORT_SYNERGY, upgrades=[weak])

    assert len(swaps) == 1
    assert swaps[0].upgrade is True
    assert swaps[0].cut.name == "Anhelo, the Painter"
    assert swaps[0].add_name == "Torment of Hailfire"
    assert swaps[0].shared_roles == ["payoff"]


def test_an_upgrade_within_the_downgrade_margin_does_not_pair():
    """The strict direction: `DOWNGRADE_MARGIN` blocks a mere sidegrade here,
    unlike the lenient veto the ordinary pairing uses."""
    weak = _rock("weak", "Anhelo, the Painter", 0.09)
    close_play = weak.playability + DOWNGRADE_MARGIN - 0.01
    adds = [{"oracle_id": "close", "name": "Mild Payoff", "playability": close_play}]
    add_roles = {"close": {"payoff": 1.0}}
    cut_roles = {"weak": {"payoff": 1.0}}

    swaps = pair_swaps(adds, [], add_roles, cut_roles, buckets=SHORT_SYNERGY, upgrades=[weak])

    assert swaps == []


def test_the_reservation_keeps_an_upgrade_slot_open():
    """The burial found live: every synergy-bound add collected `per_add`
    ordinary pairs in the first pass, so the third pass never got a turn and
    zero upgrade swaps surfaced on the deck the feature was built for. With
    upgrades in play, an add whose roles land in a short bucket holds one
    slot back — and still ends up with a full complement: ordinary pairs
    plus the upgrade."""
    adds = [{"oracle_id": "strong", "name": "Torment of Hailfire", "playability": 0.4}]
    weak = _rock("weak", "Anhelo, the Painter", 0.09)
    # Two ordinary same-role cuts that would fill per_add=2 on their own.
    cuts = [_cut("c1", "Payoff One"), _cut("c2", "Payoff Two")]
    add_roles = {"strong": {"payoff": 1.0}}
    cut_roles = {
        "c1": {"payoff": 1.0},
        "c2": {"payoff": 1.0},
        "weak": {"payoff": 1.0},
    }

    swaps = pair_swaps(
        adds, cuts, add_roles, cut_roles, per_add=2, buckets=SHORT_SYNERGY, upgrades=[weak]
    )

    kinds = [(s.cut.name, s.upgrade) for s in swaps]
    assert ("Anhelo, the Painter", True) in kinds
    assert ("Payoff One", False) in kinds
    # The reservation displaced exactly one ordinary pair, not both.
    assert len([s for s in swaps if not s.upgrade]) == 1


def test_an_unused_reservation_is_backfilled():
    """A reservation that finds no qualifying upgrade must not cost the add
    its ordinary pair — the held-back pairing is restored exactly as the
    first pass would have taken it."""
    adds = [{"oracle_id": "strong", "name": "Torment of Hailfire", "playability": 0.4}]
    # The only candidate is a sidegrade — margin blocks it, nothing pairs.
    close = _rock("weak", "Near Payoff", 0.35)
    cuts = [_cut("c1", "Payoff One"), _cut("c2", "Payoff Two")]
    add_roles = {"strong": {"payoff": 1.0}}
    cut_roles = {
        "c1": {"payoff": 1.0},
        "c2": {"payoff": 1.0},
        "weak": {"payoff": 1.0},
    }

    swaps = pair_swaps(
        adds, cuts, add_roles, cut_roles, per_add=2, buckets=SHORT_SYNERGY, upgrades=[close]
    )

    assert [(s.cut.name, s.upgrade) for s in swaps] == [
        ("Payoff One", False),
        ("Payoff Two", False),
    ]


def test_a_card_already_on_the_cut_list_never_doubles_as_an_upgrade():
    """Cecily's case live: weak enough for the upgrade pool AND a genuine cut
    (her other bucket is over). The first two passes reach her on their own
    terms; pairing her again here would show the same exchange twice."""
    adds = [{"oracle_id": "strong", "name": "Torment of Hailfire", "playability": 0.4}]
    weak = _rock("weak", "Cecily, Haunted Mage", 0.09)
    cuts = [weak]
    add_roles = {"strong": {"payoff": 1.0}}
    cut_roles = {"weak": {"payoff": 1.0}}

    swaps = pair_swaps(
        adds, cuts, add_roles, cut_roles, per_add=2, buckets=SHORT_SYNERGY, upgrades=[weak]
    )

    assert len([s for s in swaps if s.cut.oracle_id == "weak" and s.upgrade]) == 0
    assert len([s for s in swaps if s.cut.oracle_id == "weak"]) == 1


def test_a_backfilled_reservation_never_doubles_a_pass_two_pairing():
    """The Professor Onyx duplicate, distilled: a reserved add holds back its
    fills-carrying pair; the second pass — hunting a shape-answer for a cut
    another add displayed without one — fishes that exact row out of
    `by_add`; the backfill then restored it a second time, and the refine
    view showed the identical add twice inside one cut's offers."""
    buckets = [
        _Bucket("synergy_wincon", "low"),
        _Bucket("interaction", "high"),
        _Bucket("ramp", "high"),
    ]
    adds = [
        {"oracle_id": "A", "name": "Professor Onyx", "playability": 0.5},
        {"oracle_id": "B", "name": "Plain Removal", "playability": 0.5},
    ]
    cuts = [
        _cut("c-big", "Doubly Over"),
        _cut("c-mid", "Interaction Piece"),
        _cut("c-low", "Payoff Piece"),
    ]
    add_roles = {"A": {"payoff": 1.0}, "B": {"spot_removal": 1.0}}
    cut_roles = {
        "c-big": {"board_wipe": 1.0, "mana_rock": 1.0},
        "c-mid": {"spot_removal": 1.0},
        "c-low": {"payoff": 1.0},
    }
    # A sidegrade only, so the reservation finds no upgrade and backfills.
    sidegrade = _rock("weak", "Near Payoff", 0.45)

    swaps = pair_swaps(
        adds, cuts, add_roles, cut_roles, per_add=2, buckets=buckets, upgrades=[sidegrade]
    )

    pairs = [(s.add_oracle_id, s.cut.oracle_id) for s in swaps]
    assert len(pairs) == len(set(pairs)), f"duplicate exchange offered: {pairs}"
    # The pairing itself survives — deduped, not dropped.
    assert ("A", "c-mid") in pairs


def test_upgrades_none_or_empty_leaves_pairing_byte_identical():
    """Regression guard: a caller that does not pass `upgrades` (or passes an
    empty list) gets exactly today's pairing behaviour — the third pass is
    additive only."""
    adds = [{"oracle_id": "add", "name": "Signet"}]
    cuts = [_cut("ramp", "Old Rock"), _cut("removal", "A Wrath")]
    add_roles = {"add": {"mana_rock": 1.0}}
    cut_roles = {"ramp": {"mana_rock": 1.0}, "removal": {"board_wipe": 1.0}}

    default = pair_swaps(adds, cuts, add_roles, cut_roles)
    explicit_none = pair_swaps(adds, cuts, add_roles, cut_roles, upgrades=None)
    explicit_empty = pair_swaps(adds, cuts, add_roles, cut_roles, upgrades=[])

    assert default == explicit_none == explicit_empty
