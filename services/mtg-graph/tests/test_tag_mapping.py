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
