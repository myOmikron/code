"""The resource hierarchy — specificity without fragmenting the join."""

from __future__ import annotations

from deck_lab.vocabulary import (
    RESOURCE_PARENTS,
    Resource,
    resource_ancestors,
    resource_hierarchy_cycles,
)


def test_hierarchy_is_acyclic():
    """A cycle would make BROADER*0.. traversals nonsensical."""
    assert resource_hierarchy_cycles() == []


def test_every_edge_uses_vocabulary_members():
    for child, parents in RESOURCE_PARENTS.items():
        assert isinstance(child, Resource)
        for parent in parents:
            assert isinstance(parent, Resource)


def test_no_resource_is_its_own_parent():
    for child, parents in RESOURCE_PARENTS.items():
        assert child not in parents


def test_free_outlet_satisfies_generic_outlet():
    """The combo case: a free outlet is still an outlet."""
    assert Resource.SACRIFICE_OUTLET in resource_ancestors(Resource.FREE_SACRIFICE_OUTLET)


def test_generic_outlet_does_not_satisfy_free_outlet():
    """The precision case: not every outlet is free, so combos must not match."""
    assert Resource.FREE_SACRIFICE_OUTLET not in resource_ancestors(Resource.SACRIFICE_OUTLET)


def test_treasure_has_two_parents():
    """A Treasure is an artifact token *and* a mana source. Hence a DAG."""
    ancestors = resource_ancestors(Resource.TREASURE)

    assert Resource.ARTIFACT_TOKEN in ancestors
    assert Resource.RITUAL_MANA in ancestors


def test_ancestry_is_transitive():
    """treasure -> artifact_token -> artifact_matters."""
    assert Resource.ARTIFACT_MATTERS in resource_ancestors(Resource.TREASURE)


def test_commander_recursion_is_a_battlefield_return():
    """The command-tax rule needs 'to battlefield'; a Regrowth does not dodge tax."""
    ancestors = resource_ancestors(Resource.COMMANDER_RECURSION)

    assert Resource.RECURSION_TO_BATTLEFIELD in ancestors
    assert Resource.RECURSION_ANY in ancestors
    assert Resource.RECURSION_TO_HAND not in ancestors


def test_untap_variants_stay_separable():
    """Kiki lines, High Tide lines and Paradox Engine lines are different combos."""
    for narrow in (Resource.UNTAP_LAND, Resource.UNTAP_CREATURE, Resource.UNTAP_ARTIFACT):
        assert Resource.UNTAP_PERMANENT in resource_ancestors(narrow)

    assert Resource.UNTAP_LAND not in resource_ancestors(Resource.UNTAP_CREATURE)


def test_roots_have_no_ancestors():
    assert resource_ancestors(Resource.SACRIFICE_OUTLET) == set()
    assert resource_ancestors(Resource.DEATH_TRIGGER) == set()
