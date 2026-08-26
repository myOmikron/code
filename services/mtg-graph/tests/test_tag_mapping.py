"""Validity of the Tagger → vocabulary mapping."""

from __future__ import annotations

import gzip
import json

import pytest

from deck_lab.config import settings
from deck_lab.tag_mapping import MAPPINGS, unmapped_resources, unmapped_roles
from deck_lab.vocabulary import Resource, Role

BULK = settings.bulk_dir / "oracle_tags.jsonl.gz"


def test_mapping_is_not_empty():
    assert len(MAPPINGS) > 50


def test_role_weights_are_normalised():
    for slug, mapping in MAPPINGS.items():
        for role, weight in mapping.roles:
            assert 0.0 < weight <= 1.0, f"{slug} -> {role} weight {weight}"


def test_no_mapping_repeats_a_resource():
    """A duplicate would write the same edge twice and read as stronger evidence."""
    for slug, mapping in MAPPINGS.items():
        assert len(set(mapping.produces)) == len(mapping.produces), slug
        assert len(set(mapping.cares_about)) == len(mapping.cares_about), slug


def test_no_mapping_both_produces_and_cares_for_same_resource():
    """Self-bridging: the card would pair with itself on that resource."""
    for slug, mapping in MAPPINGS.items():
        overlap = set(mapping.produces) & set(mapping.cares_about)
        assert not overlap, f"{slug} both produces and cares about {overlap}"


def test_no_mapping_repeats_a_role():
    for slug, mapping in MAPPINGS.items():
        roles = [role for role, _ in mapping.roles]
        assert len(set(roles)) == len(roles), slug


def test_every_mapping_uses_vocabulary_members():
    for slug, mapping in MAPPINGS.items():
        for resource in (*mapping.produces, *mapping.cares_about):
            assert isinstance(resource, Resource), slug
        for role, _ in mapping.roles:
            assert isinstance(role, Role), slug


@pytest.mark.skipif(not BULK.exists(), reason="oracle_tags bulk not downloaded")
def test_every_mapped_slug_exists_in_tagger():
    """A typo'd slug fails silently — it just matches nothing."""
    with gzip.open(BULK, "rt") as handle:
        entries = [json.loads(line) for line in handle if line.strip()]

    slugs = {e["slug"] for e in entries if e.get("type") == "oracle"}
    unknown = set(MAPPINGS) - slugs
    assert not unknown, f"slugs absent from Tagger: {sorted(unknown)}"


def test_gap_reporters_return_vocabulary_members():
    assert unmapped_resources() <= set(Resource)
    assert unmapped_roles() <= set(Role)


def test_known_gaps_are_acknowledged():
    """Pins the gaps documented in docs/extraction.md.

    `payoff` is derived in Cypher rather than tagged, and `graveyard_hate` comes
    from a rule. `stax` used to be here too until the `tax` tag was mapped —
    when this list shrinks, the docs should shrink with it.
    """
    assert {Role.PAYOFF, Role.GRAVEYARD_HATE} <= unmapped_roles()
    assert Role.STAX not in unmapped_roles()


# --- tokens: the payoff side of the bridge --------------------------------


def test_token_payoffs_are_mapped():
    """Nothing paid tokens off, and the theme gated on that.

    Every `cares_about(creature_token)` edge in the graph used to come from the
    four `sacrifice-outlet` mappings — 1,433 cards, all of them aristocrats
    fodder-eaters. Anointed Procession, Mondrak, Intangible Virtue and Baylen
    cared about nothing, and a 43-token-maker deck read as 6% tokens.
    """
    for slug in ("synergy-token", "token-increaser", "tap-fuel-token"):
        assert Resource.CREATURE_TOKEN in MAPPINGS[slug].cares_about, slug


def test_creature_tokens_are_not_claimed_by_the_whole_token_branch():
    """`repeatable-token-generator` is the parent of the *artifact* arm too.

    Mapping it to `creature_token` ran over the closure and told the graph that
    every Treasure, Clue, Food and Blood maker creates creature tokens: 377
    cards produced it with no creature-token tag on them. The creature arm is
    `repeatable-creature-tokens`, which is mapped instead.
    """
    assert "repeatable-token-generator" not in MAPPINGS
    assert Resource.CREATURE_TOKEN in MAPPINGS["repeatable-creature-tokens"].produces
    assert Resource.ARTIFACT_TOKEN in MAPPINGS["repeatable-artifact-tokens"].produces
    assert Resource.CREATURE_TOKEN not in MAPPINGS["repeatable-artifact-tokens"].produces


# --- ritual mana and counter types ----------------------------------------


def test_rituals_produce_ritual_mana_and_mana_rocks_do_not():
    """The resource used to mean the opposite of its name.

    `refund` is "immediately get mana or untapped lands back", and its largest
    arm is `mini-refund` — "no more than about one-third of the mana cost you
    paid". Mapping it to `ritual_mana` made Arcane Signet ({2}, taps for one) a
    ritual while Dark Ritual was not one: 671 mana rocks produced it and the
    59-card `ritual` tag was mapped to nothing.
    """
    assert Resource.RITUAL_MANA in MAPPINGS["ritual"].produces
    assert Resource.RITUAL_MANA not in MAPPINGS["refund"].produces
    assert Role.RAMP_OTHER in [role for role, _ in MAPPINGS["refund"].roles]


def test_only_bottomless_mana_sinks_want_rituals():
    """`mana-sink` is 1,016 cards — most utility lands and activated abilities.

    Rogue's Passage does not want a Dark Ritual, and pairing every sink with
    every rock made `ritual_mana` true of every Commander deck.
    """
    assert Resource.RITUAL_MANA not in MAPPINGS["mana-sink"].cares_about
    assert Resource.RITUAL_MANA in MAPPINGS["bottomless-mana-sink"].cares_about


def test_counter_types_are_not_asserted_over_the_whole_counters_branch():
    """All four counter types shared the identical 1,308 consumers.

    `experience_counter` exists on 16 cards; the graph said 1,308 wanted it.
    The broad claim belongs on `counter-fuel-any` — "use any type of counter
    as fuel" — which is 32 cards.
    """
    assert MAPPINGS["counters-matter"].cares_about == (Resource.PLUS_ONE_COUNTER,)
    assert Resource.EXPERIENCE_COUNTER in MAPPINGS["counter-fuel-any"].cares_about
    assert MAPPINGS["counter-fuel-charge"].cares_about == (Resource.CHARGE_COUNTER,)
    assert MAPPINGS["counter-fuel-loyalty"].cares_about == (Resource.LOYALTY_COUNTER,)


# --- self discard: the payoff side of a bridge that had none --------------


def test_self_discard_payoffs_are_mapped():
    """`discard_own` had 1,242 producers and zero consumers.

    Nothing paid discard off, so Anje Falkenrath read as reanimator and
    Archfiend of Ifnir and Hollow One fired no theme at all. The
    `self-discard-matters` closure carries all 61 madness cards with it.
    """
    assert Resource.DISCARD_OWN in MAPPINGS["self-discard-matters"].cares_about
    assert Resource.DISCARD_OWN in MAPPINGS["hellbent"].cares_about


def test_discard_payoffs_do_not_claim_the_opponent_facing_branch():
    """`discard-matters` is the parent of `opponent-discard-matters` too.

    Tergrid and Liliana's Caress want an opponent to pitch, not you, and the
    parent mapping would have paired a Faithless Looting with a Bloodchief
    Ascension — the `mana-sink` error in a new place.
    """
    assert "discard-matters" not in MAPPINGS
    assert "opponent-discard-matters" not in MAPPINGS


def test_threshold_is_not_a_discard_payoff():
    """Zero cards shared with `self-discard-matters`.

    Threshold counts the graveyard, not the discard; Cabal Ritual does not
    care how the cards got there. `graveyard_any` is where it would belong.
    """
    assert "threshold" not in MAPPINGS


# --- -1/-1 counters: a child that inverts its parent ----------------------


def test_minus_counters_are_excluded_from_the_plus_counter_closure():
    """`mm-counters-matter` is a *direct child* of `counters-matter`.

    So the closure recorded Hapatra, Necroskitter, Blowfly Infestation and
    The Scorpion God as wanting +1/+1 counters: 82 cards whose oracle text
    carries "-1/-1" and never "+1/+1" were members of the +1/+1 counters
    theme, and EDHREC's `minus-1-minus-1-counters` high-synergy list landed
    8/10 inside it. There is no narrower parent to pick — subtracting the
    subtree is the only statement of the exception that survives Tagger
    adding children to it. After the fix: 25 cards and 3/10, both dominated
    by proliferate, which wants either polarity.
    """
    assert "mm-counters-matter" in MAPPINGS["counters-matter"].excludes
    assert MAPPINGS["counters-matter"].cares_about == (Resource.PLUS_ONE_COUNTER,)


def test_minus_counters_have_both_sides():
    for slug in ("gives-mm-counters", "gains-mm-counters"):
        assert Resource.MINUS_ONE_COUNTER in MAPPINGS[slug].produces, slug
    for slug in ("mm-counters-matter", "counter-fuel-mm"):
        assert Resource.MINUS_ONE_COUNTER in MAPPINGS[slug].cares_about, slug


def test_excluded_slugs_are_real_tags_we_also_map():
    """A typo'd exclusion fails silently — it subtracts nothing."""
    for slug, mapping in MAPPINGS.items():
        for excluded in mapping.excludes:
            assert excluded in MAPPINGS, f"{slug} excludes unmapped {excluded}"


# --- storm: a resource that meant "a spell" and now means "many spells" ---


def test_storm_has_an_engine_and_a_payoff_side():
    for slug in ("ritual", "cost-reducer-instant", "cost-reducer-sorcery"):
        assert Resource.STORM_COUNT in MAPPINGS[slug].produces, slug
    for slug in ("storm-count-matters", "storm-like", "gives-storm"):
        assert Resource.STORM_COUNT in MAPPINGS[slug].cares_about, slug


def test_hideaway_is_not_a_storm_engine():
    """`free-cast-another` is Mosswort Bridge and Windbrisk Heights.

    371 cards that cast one free spell off exile, which does nothing for a
    spell count. The name invites the mapping; the population refuses it.
    """
    assert "free-cast-another" not in MAPPINGS


def test_spell_copy_payoffs_are_mapped():
    assert Resource.COPY_SPELL in MAPPINGS["synergy-copy"].cares_about
