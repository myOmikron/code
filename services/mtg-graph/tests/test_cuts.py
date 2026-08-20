"""Cut scoring and swap pairing. Pure functions — no database."""

from __future__ import annotations

from deck_lab.composition import template_for
from deck_lab.cuts import CutCandidate, pair_swaps, score_cuts, shape_delta


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

    assert any("staple" in r for r in cuts["Staple"].reasons)


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

    assert not cuts or any("which the deck wants" in r for c in cuts for r in c.reasons)


def test_cuts_are_ranked_best_first():
    cards, roles = _overfull_deck()
    cuts = score_cuts(cards, roles, {}, {}, TEMPLATE)

    assert [c.score for c in cuts] == sorted((c.score for c in cuts), reverse=True)


# --- swap pairing ---------------------------------------------------------


def _cut(oid, name) -> CutCandidate:
    return CutCandidate(oracle_id=oid, name=name, score=1.0, reasons=["x"])


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


# --- downgrades -----------------------------------------------------------
#
# The real case: every pairing on the advisor's first screen swapped a staple
# for a weaker card of the same kind, because cuts arrive ranked by shape and
# a well-played card in a full bucket ranks high there.


def _rock(oid, name, play) -> CutCandidate:
    return CutCandidate(oracle_id=oid, name=name, score=1.0, playability=play, reasons=["x"])


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
