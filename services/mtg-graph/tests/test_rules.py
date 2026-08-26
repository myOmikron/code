"""Structural validity of the deterministic rule layer.

These do not test what the rules *match* — that needs the corpus, and is
measured in `docs/extraction.md`. They catch the failure mode a rule engine
actually suffers from: a rule that is silently malformed and matches nothing.
"""

from __future__ import annotations

import re

import pytest

from deck_lab.rules import RULES
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
