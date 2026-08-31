"""Structural validity of the deterministic rule layer.

These do not test what the rules *match* — that needs the corpus, and is
measured in `docs/extraction.md`. They catch the failure mode a rule engine
actually suffers from: a rule that is silently malformed and matches nothing.
"""

from __future__ import annotations

import re

import pytest

from deck_lab.rules import RULES
from deck_lab.tag_mapping import MAPPINGS
from deck_lab.vocabulary import Resource, Role, is_bridge_resource


def test_rule_ids_are_unique():
    ids = [rule.id for rule in RULES]
    assert len(set(ids)) == len(ids)


def test_every_rule_emits_something():
    """A rule with no outputs runs queries and writes nothing."""
    for rule in RULES:
        assert rule.produces or rule.cares_about or rule.roles, rule.id


def test_every_rule_has_a_rationale():
    """`why` becomes the provenance string in a suggestion. Silence is a defect."""
    for rule in RULES:
        assert rule.why.strip(), rule.id


def test_declared_params_are_all_referenced():
    for rule in RULES:
        for name in rule.params:
            assert f"${name}" in rule.where, f"{rule.id} declares unused param {name}"


def test_referenced_params_are_all_declared():
    """A typo'd param name makes Cypher raise at runtime, not at import."""
    for rule in RULES:
        referenced = set(re.findall(r"\$(\w+)", rule.where))
        assert referenced <= set(rule.params), f"{rule.id} references undeclared {referenced}"


def test_regexes_compile():
    for rule in RULES:
        for name, pattern in rule.params.items():
            try:
                re.compile(pattern)
            except re.error as exc:
                pytest.fail(f"{rule.id}.{name}: {exc}")


def test_multiline_regexes_set_dotall_and_ignorecase():
    """Oracle text is multi-line, and Java regex defaults to case-sensitive."""
    for rule in RULES:
        for name, pattern in rule.params.items():
            if ".*" in pattern:
                assert pattern.startswith("(?si)"), f"{rule.id}.{name} missing (?si)"


def test_rule_outputs_are_vocabulary_members():
    for rule in RULES:
        for resource in (*rule.produces, *rule.cares_about):
            assert isinstance(resource, Resource), rule.id
        for role, weight in rule.roles:
            assert isinstance(role, Role), rule.id
            assert 0.0 < weight <= 1.0, rule.id


def test_etb_rule_covers_the_known_tagger_gap():
    """Tagger has no broad 'has an ETB trigger' tag; the rule layer supplies it."""
    producers = [r for r in RULES if Resource.ETB_TRIGGER in r.produces]
    consumers = [r for r in RULES if Resource.ETB_TRIGGER in r.cares_about]

    assert producers, "no rule produces etb_trigger"
    assert consumers, "no rule consumes etb_trigger"


def test_etb_trigger_is_a_two_sided_bridge():
    assert is_bridge_resource(Resource.ETB_TRIGGER)


def test_blink_is_supply_only():
    """Blink enables ETB re-use; nothing synergises with blink itself."""
    assert not is_bridge_resource(Resource.BLINK)


def test_discard_own_is_a_two_sided_bridge():
    """It was listed supply-only on the argument that nothing wants to discard.

    Madness, Hellbent and the "whenever you discard" payoffs want exactly
    that, and while the claim stood `deck-lab audit` could not report the
    gap — 1,242 producers, 0 consumers, vocabulary health 98%.
    """
    assert is_bridge_resource(Resource.DISCARD_OWN)


def test_minus_one_counter_is_a_two_sided_bridge():
    assert is_bridge_resource(Resource.MINUS_ONE_COUNTER)


def test_proliferate_is_polarity_blind():
    """Contagion Engine multiplies a -1/-1 counter as readily as a +1/+1 one.

    The one consumer the two kinds genuinely share, and the reason the three
    cards left in `counters` after the mm exclusion are all proliferate.
    """
    rule = next(r for r in RULES if r.id == "proliferate")
    assert Resource.MINUS_ONE_COUNTER in rule.cares_about
    assert Resource.PLUS_ONE_COUNTER in rule.cares_about


def test_storm_is_not_supplied_by_every_cheap_spell():
    """The four resources on that rule were byte-identical on the produces side.

    All 5,739 cards — 18% of the corpus — which put `storm_count`'s IDF at
    1.7 against proliferate's 5.5. Cast, magecraft and prowess belong there
    and have distinct consumer sets; storm does not, because a storm payoff
    wants "many spells this turn", not "a spell".
    """
    rule = next(r for r in RULES if r.id == "instants_and_sorceries_supply_casts")
    assert Resource.STORM_COUNT not in rule.produces
    assert Resource.CAST_TRIGGER in rule.produces
    assert Resource.MAGECRAFT_TRIGGER in rule.produces
    assert Resource.PROWESS_TRIGGER in rule.produces


def test_storm_carriers_are_read_off_the_keyword():
    """Tagger's slugs reach the grants and payoffs, not the 33 keyword cards."""
    rule = next(r for r in RULES if r.id == "storm_keyword")
    assert Resource.STORM_COUNT in rule.cares_about


def test_copy_spell_is_a_two_sided_bridge():
    """918 producers and no consumer, until `synergy-copy` was mapped.

    Storm-Kiln Artist, Archmage Emeritus, Veyran and Ral Storm Conduit are a
    payoff family with a tag of their own.
    """
    assert is_bridge_resource(Resource.COPY_SPELL)


# --- tapping your own creatures -------------------------------------------
#
# Polarity is the whole discriminator for this family, and it lives in the
# regexes rather than in a tag, so these do exercise the patterns. Neo4j's
# `=~` is a *full* match against the whole property, which is what
# `re.fullmatch` gives — the same reason every pattern is `.*`-wrapped.


def _pattern(rule_id: str, param: str) -> re.Pattern:
    rule = next(r for r in RULES if r.id == rule_id)
    return re.compile(rule.params[param])


def _payoff(param: str, text: str) -> bool:
    return _pattern("tap_own_creature_payoff", param).fullmatch(text) is not None


def test_tap_own_creature_is_a_two_sided_bridge():
    """Crew and convoke supply it; Survival and Far Traveler pay it off."""
    assert is_bridge_resource(Resource.TAP_OWN_CREATURE)
    assert any(Resource.TAP_OWN_CREATURE in r.produces for r in RULES)
    assert any(Resource.TAP_OWN_CREATURE in r.cares_about for r in RULES)


def test_tap_payoff_reads_a_creature_talking_about_itself():
    """Emmara, Fallowsage, Magda — the centre of the archetype, and the part
    Tagger files only under the polarity-blind `uninspired`."""
    emmara = "Whenever Emmara becomes tapped, create a 1/1 white Soldier token."

    assert _payoff("becomes_tapped", emmara)
    assert not _payoff("someone_elses", emmara)


def test_tap_payoff_refuses_someone_elses_tapped_permanent():
    """A deck of these wants a tapper, which is the opposite of a Vehicle.

    Half of `uninspired` is aimed at an opponent or at an enchanted land, and
    without the guard Psychic Venom would bridge to Springleaf Drum.
    """
    for text in (
        "Whenever a creature an opponent controls becomes tapped, "
        "put a +1/+1 counter on this creature.",
        "Enchant land\nWhenever enchanted land becomes tapped, "
        "this Aura deals 2 damage to that land's controller.",
        "Whenever equipped creature becomes tapped, it deals 1 damage to each opponent.",
        "Whenever a land with a mine counter on it becomes tapped, destroy it.",
    ):
        assert _payoff("someone_elses", text), text


def test_survival_is_read_as_a_tap_payoff():
    """The mechanic that prompted this whole family — a Duskmourn Survivor
    wants to end the turn tapped, which is what a Vehicle or a Drum is for."""
    survivor = (
        "Survival — At the beginning of your second main phase, "
        "if this creature is tapped, you gain 2 life."
    )
    assert _payoff("is_tapped", survivor)


def test_a_storage_land_is_not_a_tap_payoff():
    """`if this land is tapped` and `if a land is tapped for mana` read the
    same until the comma: the trailing `[,.]` is what keeps Bottomless Vault,
    Mana Vault and the Contamination family out of the archetype."""
    assert not _payoff("is_tapped", "If a land is tapped for two or more mana, it produces {C}.")


def test_far_traveler_counts_your_own_tapped_creatures():
    """The card the user asked for, and the third payoff template: no trigger
    and no state check, just a deck full of creatures that are already tapped."""
    far_traveler = (
        'Commander creatures you own have "At the beginning of your end step, '
        "exile up to one target tapped creature you control, then return it to "
        "the battlefield under its owner's control.\""
    )
    assert _payoff("tapped_yours", far_traveler)


def test_tap_supply_matches_the_drum_template():
    springleaf = "{T}, Tap an untapped creature you control: Add one mana of any color."
    pattern = _pattern("tap_own_creature_supply", "tap_cost")

    assert pattern.fullmatch(springleaf)


def test_keyword_soup_is_a_two_sided_bridge():
    """The keyword-counter granters and this rule both produce it; the
    keyword-soup payoffs (Odric, Kathril) care about it."""
    assert is_bridge_resource(Resource.KEYWORD_SOUP)


def test_keyword_rich_bodies_covers_all_twelve_keywords_at_the_measured_threshold():
    """The threshold is measured, not guessed: >=2 sits at 991 creatures, in
    `treasure`'s rarity class; >=1 is 6,343 and self-defeating."""
    where = next(r for r in RULES if r.id == "keyword_rich_bodies").where

    for keyword in (
        "Flying",
        "First strike",
        "Double strike",
        "Deathtouch",
        "Haste",
        "Hexproof",
        "Indestructible",
        "Lifelink",
        "Menace",
        "Reach",
        "Trample",
        "Vigilance",
    ):
        assert f"'{keyword}'" in where, keyword
    # Raised from >=2 after the first rebuild measured that population's
    # relative IDF at 0.859 — below the floor the boost machinery enforces.
    assert ">= 3" in where


def test_keyword_rich_bodies_is_gated_to_creatures():
    """An Equipment granting two keywords is a granter, not a body."""
    where = next(r for r in RULES if r.id == "keyword_rich_bodies").where
    assert "c.type_line CONTAINS 'Creature'" in where


def test_tap_supply_keywords_exclude_improvise_and_exert():
    """`Improvise` taps *artifacts* — a different deck. `Exert` taps by
    attacking, which every payoff here already sees for free, and counting it
    would call every aggro deck a tap deck."""
    where = next(r for r in RULES if r.id == "tap_own_creature_supply").where

    for keyword in ("Crew", "Convoke", "Saddle", "Station", "Enlist", "Teamwork", "Harmonize"):
        assert f"'{keyword}'" in where, keyword
    assert "Improvise" not in where
    assert "Exert" not in where


# --- mana-value bands -------------------------------------------------------
#
# Precision-guarded like `high_power_payoff`: "destroy/exile target ... with
# mana value N or greater" is the identical phrase as a removal template, and
# the guard word must precede the band rather than merely share a sentence
# with it.


def _high_mv(text: str) -> bool:
    return _pattern("high_mv_payoff", "high_mv_payoff").fullmatch(text) is not None


def test_high_mv_payoff_matches_the_anchor_commanders():
    """Y'shtola, Glarb, Bello and Imoti — the round's headline cases, all real
    oracle text."""
    yshtola = (
        "Vigilance\n"
        "At the beginning of each end step, if a player lost 4 or more life this turn, "
        "you draw a card.\n"
        "Whenever you cast a noncreature spell with mana value 3 or greater, Y'shtola "
        "deals 2 damage to each opponent and you gain 2 life."
    )
    glarb = (
        "Deathtouch\n"
        "You may look at the top card of your library any time.\n"
        "You may play lands and cast spells with mana value 4 or greater from the top "
        "of your library.\n"
        "{T}: Surveil 2."
    )
    bello = (
        "During your turn, each non-Equipment artifact and non-Aura enchantment you "
        "control with mana value 4 or greater is a 4/4 Elemental creature in addition "
        'to its other types and has indestructible, haste, and "Whenever this creature '
        'deals combat damage to a player, draw a card."'
    )
    imoti = (
        "Cascade (When you cast this spell, exile cards from the top of your library "
        "until you exile a nonland card that costs less. You may cast it without "
        "paying its mana cost. Put the exiled cards on the bottom in a random order.)\n"
        "Spells you cast with mana value 6 or greater have cascade."
    )

    for text in (yshtola, glarb, bello, imoti):
        assert _high_mv(text), text


def test_high_mv_payoff_refuses_removal_with_the_same_band():
    """Despark and Epic Downfall share the identical "mana value N or greater"
    phrase with `target` where a payoff has `you cast` or `you control`."""
    for text in (
        "Exile target permanent with mana value 4 or greater.",
        "Exile target creature with mana value 3 or greater.",
    ):
        assert not _high_mv(text), text


def test_high_mv_payoff_ignores_or_less_bands():
    """The "or less" band names the opposite archetype — a cheap-spells deck —
    not a mistagged big-spells one."""
    text = (
        "Whenever you cast a noncreature spell with mana value 3 or less, this "
        "creature deals 2 damage to each opponent and you gain 2 life."
    )
    assert not _high_mv(text)


def test_high_mv_spell_producer_is_nonland_noncreature_at_the_measured_threshold():
    """Threshold measured off the payoff population itself, not guessed at
    Y'shtola's own number: of the 62 `high_mv_payoff` matches, N=3 is rare (5,
    8%) and the mass sits at N=4 through N=7 (57, 92%)."""
    where = next(r for r in RULES if r.id == "high_mv_spell_producer").where
    assert "NOT c.is_land" in where
    assert "NOT c.type_line CONTAINS 'Creature'" in where
    assert "c.cmc >= 4" in where


# --- opponent draw -----------------------------------------------------
#
# Nekusar's own top EDHREC tag (`TOP50-COVERAGE.md` gap 1, `wheels`, 5.3k
# decks). Two rules: the punisher (cares) and the wheel/gift (produces).


def _opponent_draw_payoff(text: str) -> bool:
    return _pattern("opponent_draw_payoff", "opponent_draw_payoff").fullmatch(text) is not None


def _opponent_draw_produces(text: str) -> bool:
    rule = next(r for r in RULES if r.id == "opponent_draw_producer")
    return any(re.compile(pattern).fullmatch(text) for pattern in rule.params.values())


def test_opponent_draw_payoff_matches_nekusar_and_underworld_dreams():
    """Real oracle text — Nekusar, the Mindrazer's punisher half, and
    Underworld Dreams, the archetype's namesake enchantment."""
    nekusar = (
        "At the beginning of each player's draw step, that player draws an "
        "additional card.\n"
        "Whenever an opponent draws a card, Nekusar deals 1 damage to that player."
    )
    underworld_dreams = (
        "Whenever an opponent draws a card, this enchantment deals 1 damage to that player."
    )

    assert _opponent_draw_payoff(nekusar)
    assert _opponent_draw_payoff(underworld_dreams)


def test_opponent_draw_payoff_refuses_a_self_draw_payoff():
    """ "Whenever you draw a card" is a self-draw payoff, a different deck —
    Sheoldred's own other half, not this one."""
    assert not _opponent_draw_payoff("Whenever you draw a card, you gain 2 life.")


def test_opponent_draw_producer_matches_the_four_named_anchors():
    """Wheel of Fortune, Windfall, Howling Mine and Ms. Bumbleflower herself
    — the plan's four required anchors, all real oracle text."""
    wheel_of_fortune = "Each player discards their hand, then draws seven cards."
    windfall = (
        "Each player discards their hand, then draws cards equal to the "
        "greatest number of cards a player discarded this way."
    )
    howling_mine = (
        "At the beginning of each player's draw step, if this artifact is "
        "untapped, that player draws an additional card."
    )
    bumbleflower = (
        "Vigilance\n"
        "Whenever you cast a spell, target opponent draws a card. Put a "
        "+1/+1 counter on target creature. It gains flying until end of "
        "turn. If this is the second time this ability has resolved this "
        "turn, you draw two cards."
    )

    for text in (wheel_of_fortune, windfall, howling_mine, bumbleflower):
        assert _opponent_draw_produces(text), text


def test_opponent_draw_producer_refuses_discard_with_no_redraw():
    """Mindslicer and Sire of Insanity discard the table and never redraw —
    a discard effect, not an opponent-draw one. The "then draws" anchor on
    the wheel shape is what keeps them out."""
    mindslicer = "When this creature dies, each player discards their hand."
    sire_of_insanity = "At the beginning of each end step, each player discards their hand."

    assert not _opponent_draw_produces(mindslicer)
    assert not _opponent_draw_produces(sire_of_insanity)


def test_opponent_draw_producer_ignores_plain_card_draw():
    assert not _opponent_draw_produces("Draw two cards.")


def test_opponent_draw_payoff_and_producer_can_both_fire_on_distinct_clauses():
    """Nekusar produces the resource with his first ability and pays it off
    with his second — the "fine, it is genuinely both" case the classic trap
    warning allows for, not the trap itself (a punisher's own trigger phrase
    misread as a produces edge)."""
    nekusar = (
        "At the beginning of each player's draw step, that player draws an "
        "additional card.\n"
        "Whenever an opponent draws a card, Nekusar deals 1 damage to that player."
    )
    assert _opponent_draw_payoff(nekusar)
    assert _opponent_draw_produces(nekusar)


# --- defenders (high_toughness) ---------------------------------------------
#
# Arcades, the Strategist is the worst reader in the top 50 (14/61 themed,
# `TOP50-COVERAGE.md` gap 4). Four templates unioned in `high_toughness_payoff`,
# each with its own trap: a hate guard on "toughness greater than power" (the
# `high_power_hate` shape) and a subject guard on the attack-unlock template
# (most of that raw population is a self-only escape hatch unrelated to the
# archetype, not a payoff for it).


def _high_toughness_payoff(text: str) -> bool:
    rule = next(r for r in RULES if r.id == "high_toughness_payoff")
    defenders = re.compile(rule.params["ht_defenders"]).fullmatch(text) is not None
    damage = re.compile(rule.params["ht_toughness_damage"]).fullmatch(text) is not None
    gt_power = re.compile(rule.params["ht_toughness_gt_power"]).fullmatch(text) is not None
    gt_power_hate = (
        re.compile(rule.params["ht_toughness_gt_power_hate"]).fullmatch(text) is not None
    )
    unlock = re.compile(rule.params["ht_attack_unlock"]).fullmatch(text) is not None
    return defenders or damage or (gt_power and not gt_power_hate) or unlock


def test_high_toughness_payoff_matches_arcades_and_high_alert():
    """The plan's two mandatory anchors, real oracle text."""
    arcades = (
        "Flying, vigilance\n"
        "Whenever a creature you control with defender enters, draw a card.\n"
        "Each creature you control with defender assigns combat damage equal "
        "to its toughness rather than its power and can attack as though it "
        "didn't have defender."
    )
    high_alert = (
        "Each creature you control assigns combat damage equal to its "
        "toughness rather than its power.\n"
        "Creatures you control can attack as though they didn't have defender.\n"
        "{2}{W}{U}: Untap target creature."
    )
    assert _high_toughness_payoff(arcades)
    assert _high_toughness_payoff(high_alert)


def test_high_toughness_payoff_refuses_a_plain_pump_spell():
    """The plan's mandatory negative anchor — a combat trick, not a payoff."""
    assert not _high_toughness_payoff("Target creature gets +0/+3 until end of turn.")


def test_high_toughness_payoff_refuses_the_toughness_hoser():
    """Immobilizer Eldrazi uses the identical "toughness greater than power"
    band as a *hoser* — disabling blocking for toughness-heavy creatures — the
    `high_power_hate` shape read onto the other stat."""
    immobilizer_eldrazi = (
        "Devoid (This card has no color.)\n"
        "{2}{C}: Each creature with toughness greater than its power can't "
        "block this turn."
    )
    assert not _high_toughness_payoff(immobilizer_eldrazi)


def test_high_toughness_payoff_refuses_a_self_only_defender_unlock():
    """Most of the raw "can attack as though it didn't have defender"
    population is a printed Defender creature's own built-in escape hatch —
    an unrelated condition (here, a Gate) gating *itself*, not a payoff for
    the archetype. Bristlepack Sentry's real text, shape preserved."""
    bristlepack_sentry_shape = (
        "Defender\n"
        "As long as you control a creature with power 4 or greater, this "
        "creature can attack as though it didn't have defender."
    )
    assert not _high_toughness_payoff(bristlepack_sentry_shape)


def test_high_toughness_payoff_accepts_a_genuine_defender_unlock_grant():
    """Rolling Stones grants the unlock to *other* Wall creatures — the real
    archetype signal the guard above is built to keep."""
    rolling_stones = "Wall creatures can attack as though they didn't have defender."
    assert _high_toughness_payoff(rolling_stones)


def test_high_toughness_producer_is_defender_or_the_measured_toughness_gap():
    """Structural, the `high_power`/`legendary_matters` template applied to
    the other stat: Defender read off `keywords`, plus a body whose
    toughness clears its power by 3 or more — the threshold the plan
    specifies, confirmed reliably typed (98.3% of creatures carry both
    `power` and `toughness`)."""
    where = next(r for r in RULES if r.id == "high_toughness_producer").where
    assert "any(k IN c.keywords WHERE k = 'Defender')" in where
    assert "c.toughness - c.power >= 3" in where


# --- enchantress (enchantment_matters) --------------------------------------
#
# Enriches the 245 existing `enchantment_matters` cares cards and, critically,
# gives Bello, Bard of the Brambles his missing edge (`TOP50-COVERAGE.md`
# gap 5) — his own text carries no `enchantment_matters` edge at all without
# this rule.


def _enchantment_payoff(text: str) -> bool:
    rule = next(r for r in RULES if r.id == "enchantment_payoff")
    you_control = re.compile(rule.params["ench_you_control"]).fullmatch(text) is not None
    cast_spell = re.compile(rule.params["ench_cast_spell"]).fullmatch(text) is not None
    return you_control or cast_spell


def test_enchantment_payoff_matches_bello():
    """Bello's real oracle text — the round's headline case. Today he
    carries no `enchantment_matters` edge at all; this rule is the fix."""
    bello = (
        "During your turn, each non-Equipment artifact and non-Aura "
        "enchantment you control with mana value 4 or greater is a 4/4 "
        "Elemental creature in addition to its other types and has "
        'indestructible, haste, and "Whenever this creature deals combat '
        'damage to a player, draw a card."'
    )
    assert _enchantment_payoff(bello)


def test_enchantment_payoff_matches_the_constellation_shape():
    """Doomwake Giant, real oracle text — the Theros Constellation template."""
    doomwake_giant = (
        "Constellation — Whenever this creature or another enchantment you "
        "control enters, creatures your opponents control get -1/-1 until "
        "end of turn."
    )
    assert _enchantment_payoff(doomwake_giant)


def test_enchantment_payoff_matches_the_named_enchantress_shape():
    """Argothian Enchantress, real oracle text — the archetype's namesake
    cast-trigger template, distinct from the Constellation shape above."""
    argothian_enchantress = "Whenever you cast an enchantment spell, you may draw a card."
    assert _enchantment_payoff(argothian_enchantress)


def test_enchantment_payoff_refuses_a_vanilla_aura():
    """A plain Aura pump spell cares about nothing beyond its own target —
    not a payoff for the archetype."""
    vanilla_aura = "Enchant creature\nEnchanted creature gets +2/+2."
    assert not _enchantment_payoff(vanilla_aura)


# --- superfriends (planeswalker loyalty) ------------------------------------
#
# Gap 7 (`TOP50-COVERAGE.md`): a planeswalker *is* the loyalty its payoffs
# count, whether or not its own rules text spells out "loyalty counters" —
# most just print "+1:"/"-2:" ability costs against the loyalty number on the
# card frame. `loyalty_counters` above is the text-pattern half (61 explicit
# producers, untouched); this rule is the structural complement.


def test_planeswalker_producer_is_structural_on_the_type_line():
    """No regex — every card with 'Planeswalker' on its type line produces
    loyalty, full stop. Measured over the live corpus: 318 planeswalkers, 39
    of which already produce `loyalty_counter` via the text rule, so this
    rule adds 279 new producers for a union of 340."""
    where = next(r for r in RULES if r.id == "planeswalker_producer").where
    assert "c.type_line CONTAINS 'Planeswalker'" in where


def test_planeswalker_producer_declares_loyalty_counter():
    rule = next(r for r in RULES if r.id == "planeswalker_producer")
    assert rule.produces == (Resource.LOYALTY_COUNTER,)
    assert not rule.cares_about


# --- wincon evidence (alt_win, overrun_finisher, extra_turn) ---------------
#
# `Role.WINCON` used to have six grant sites, all weak proxies for *ways
# games end* and none for "this card wins the game" — the open calibration
# question `TUTORS-RESULTS.md` recorded and this round resolved. `alt_win`
# and `overrun_finisher` are the two new rules that read game-ending text
# directly; `extra_turn`'s weight rises to match.


def _alt_win_produces(text: str) -> bool:
    rule = next(r for r in RULES if r.id == "alt_win")
    return any(re.compile(pattern).fullmatch(text) for pattern in rule.params.values())


def test_alt_win_matches_the_anchor_cards():
    """Approach of the Second Sun, Thassa's Oracle, Felidar Sovereign, Door
    to Nothingness and Phage the Untouchable — real oracle text, one per
    arm (the first three for `you_win`, Door to Nothingness for
    `opp_loses`, Phage for `that_player_loses`)."""
    approach = (
        "If this spell was cast from your hand and you've cast another spell "
        "named Approach of the Second Sun this game, you win the game. "
        "Otherwise, put Approach of the Second Sun into its owner's library "
        "seventh from the top and you gain 7 life."
    )
    thassas_oracle = (
        "When this creature enters, look at the top X cards of your library, "
        "where X is your devotion to blue. Put up to one of them on top of "
        "your library and the rest on the bottom of your library in a random "
        "order. If X is greater than or equal to the number of cards in your "
        "library, you win the game. (Each {U} in the mana costs of permanents "
        "you control counts toward your devotion to blue.)"
    )
    felidar_sovereign = (
        "Vigilance (Attacking doesn't cause this creature to tap.)\n"
        "Lifelink (Damage dealt by this creature also causes you to gain "
        "that much life.)\n"
        "At the beginning of your upkeep, if you have 40 or more life, you "
        "win the game."
    )
    door_to_nothingness = (
        "This artifact enters tapped.\n"
        "{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, {T}, Sacrifice this artifact: "
        "Target player loses the game."
    )
    phage = (
        "When Phage enters, if you didn't cast it from your hand, you lose "
        "the game.\n"
        "Whenever Phage deals combat damage to a creature, destroy that "
        "creature. It can't be regenerated.\n"
        "Whenever Phage deals combat damage to a player, that player loses "
        "the game."
    )
    for text in (approach, thassas_oracle, felidar_sovereign, door_to_nothingness, phage):
        assert _alt_win_produces(text), text


def test_alt_win_refuses_cant_win_and_self_loss():
    """Platinum Angel and Abyssal Persecutor read like a near miss on "win"/
    "lose"; the Pacts' delayed self-loss is first person ("you lose the
    game"), never "that player"/"an opponent"/"each player". All real
    oracle text."""
    platinum_angel = "Flying\nYou can't lose the game and your opponents can't win the game."
    abyssal_persecutor = (
        "Flying, trample\nYou can't win the game and your opponents can't lose the game."
    )
    angels_grace = (
        "Split second (As long as this spell is on the stack, players can't "
        "cast spells or activate abilities that aren't mana abilities.)\n"
        "You can't lose the game this turn and your opponents can't win the "
        "game this turn. Until end of turn, damage that would reduce your "
        "life total to less than 1 reduces it to 1 instead."
    )
    demonic_pact = (
        "At the beginning of your upkeep, choose one that hasn't been "
        "chosen —\n"
        "• This enchantment deals 4 damage to any target and you gain "
        "4 life.\n"
        "• Target opponent discards two cards.\n"
        "• Draw two cards.\n"
        "• You lose the game."
    )
    pact_of_negation = (
        "Counter target spell.\n"
        "At the beginning of your next upkeep, pay {3}{U}{U}. If you don't, "
        "you lose the game."
    )
    for text in (
        platinum_angel,
        abyssal_persecutor,
        angels_grace,
        demonic_pact,
        pact_of_negation,
    ):
        assert not _alt_win_produces(text), text


def test_alt_win_refuses_the_poison_reminder_and_loss_triggers():
    """The poison reminder never puts "that player"/an opponent" directly
    before "loses the game" — the word there is "counters". Share the
    Spoils reads "an opponent loses the game", the tempting fourth arm
    whose entire corpus population is this one card — dropped rather than
    added for a population of one."""
    poison_reminder = "A player with ten or more poison counters loses the game."
    share_the_spoils = (
        "When this enchantment enters and whenever an opponent loses the "
        "game, exile the top card of each player's library.\n"
        "During each player's turn, that player may play a land or cast a "
        "spell from among cards exiled with this enchantment, and they may "
        "spend mana as though it were mana of any color to cast that spell. "
        "When they do, exile the top card of their library."
    )
    assert not _alt_win_produces(poison_reminder)
    assert not _alt_win_produces(share_the_spoils)


def test_alt_win_is_granted_at_full_weight():
    rule = next(r for r in RULES if r.id == "alt_win")
    assert rule.roles == ((Role.WINCON, 1.0),)


def _overrun_produces(text: str) -> bool:
    rule = next(r for r in RULES if r.id == "overrun_finisher")
    return any(re.compile(pattern).fullmatch(text) for pattern in rule.params.values())


def test_overrun_matches_craterhoof_and_the_infect_line():
    """Craterhoof Behemoth and Pathbreaker Ibex (`xpump`, the get/gain
    verb-split shape), Overrun (`overrun_grant`) and Triumph of the Hordes
    (`infect_pump`) — real oracle text, the plan's four required anchors."""
    craterhoof = (
        "Haste\n"
        "When this creature enters, creatures you control gain trample and "
        "get +X/+X until end of turn, where X is the number of creatures "
        "you control."
    )
    overrun = (
        "Creatures you control get +3/+3 and gain trample until end of "
        "turn. (Each of those creatures can deal excess combat damage to "
        "the player or planeswalker it's attacking.)"
    )
    triumph_of_the_hordes = (
        "Until end of turn, creatures you control get +1/+1 and gain "
        "trample and infect. (Creatures with infect deal damage to "
        "creatures in the form of -1/-1 counters and to players in the "
        "form of poison counters.)"
    )
    pathbreaker_ibex = (
        "Whenever this creature attacks, creatures you control gain "
        "trample and get +X/+X until end of turn, where X is the greatest "
        "power among creatures you control."
    )
    for text in (craterhoof, overrun, triumph_of_the_hordes, pathbreaker_ibex):
        assert _overrun_produces(text), text


def test_overrun_refuses_an_anthem():
    """Glorious Anthem and Bastion Protector grant a flat bonus with no
    scaling and no evasion; Elesh Norn, Grand Cenobite's own team pump is
    the same shape at a bigger number; Giant Growth is a single-target
    trick, not a team effect. All real oracle text — the anthem-polluted
    population `overrun_finisher` is built to stay out of."""
    glorious_anthem = "Creatures you control get +1/+1."
    bastion_protector = "Commander creatures you control get +2/+2 and have indestructible."
    elesh_norn_grand_cenobite = (
        "Vigilance\n"
        "Other creatures you control get +2/+2.\n"
        "Creatures your opponents control get -2/-2."
    )
    giant_growth = "Target creature gets +3/+3 until end of turn."
    for text in (glorious_anthem, bastion_protector, elesh_norn_grand_cenobite, giant_growth):
        assert not _overrun_produces(text), text


def test_extra_turn_rule_and_tag_agree_on_weight():
    """Max-merge hides drift between the rule and the tag's own weight —
    pinned equal so the wincon-evidence round's raise can't land in only
    one of the two writers."""
    rule = next(r for r in RULES if r.id == "extra_turn")
    rule_weight = dict(rule.roles)[Role.WINCON]
    tag_weight = dict(MAPPINGS["extra-turn"].roles)[Role.WINCON]
    assert rule_weight == tag_weight == 0.8
