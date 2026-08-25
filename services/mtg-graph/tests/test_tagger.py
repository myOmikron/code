"""Tagger ontology parsing and taxonomy closure."""

from __future__ import annotations

import gzip
import json

from deck_lab.tagger import Tag, build_closure, parse_tags


def _tag(tag_id, slug, *, children=(), oracle_ids=()):
    return {
        "object": "tag",
        "type": "oracle",
        "id": tag_id,
        "slug": slug,
        "description": "",
        "parent_ids": [],
        "child_ids": list(children),
        "taggings": [{"oracle_id": oid, "weight": "median"} for oid in oracle_ids],
    }


def _write(tmp_path, entries):
    path = tmp_path / "oracle-tags.jsonl.gz"
    payload = "\n".join(json.dumps(e) for e in entries).encode()
    path.write_bytes(gzip.compress(payload))
    return path


def test_parses_tags_and_taggings(tmp_path):
    path = _write(tmp_path, [_tag("a", "sacrifice-outlet", children=["b"], oracle_ids=["x"])])
    tags = list(parse_tags(path))

    assert len(tags) == 1
    assert tags[0].slug == "sacrifice-outlet"
    assert tags[0].child_ids == ["b"]
    assert tags[0].oracle_ids == ["x"]


def test_skips_art_tags(tmp_path):
    """The bulk file mixes tag types; only oracle tags are functional."""
    art = _tag("a", "depicts-dog") | {"type": "illustration"}
    path = _write(tmp_path, [art, _tag("b", "ramp", oracle_ids=["x"])])

    assert [t.slug for t in parse_tags(path)] == ["ramp"]


def test_closure_pulls_ids_up_from_children():
    """The whole reason the taxonomy is stored: parents hold no taggings."""
    tags = {
        "parent": Tag(id="parent", slug="sacrifice-outlet", child_ids=["kid1", "kid2"]),
        "kid1": Tag(id="kid1", slug="sacrifice-outlet-land", oracle_ids=["a", "b"]),
        "kid2": Tag(id="kid2", slug="sacrifice-outlet-permanent", oracle_ids=["b", "c"]),
    }
    closure = build_closure(tags)

    assert closure["parent"] == {"a", "b", "c"}
    assert closure["kid1"] == {"a", "b"}


def test_closure_is_transitive_through_grandchildren():
    tags = {
        "g": Tag(id="g", slug="top", child_ids=["p"]),
        "p": Tag(id="p", slug="mid", child_ids=["c"]),
        "c": Tag(id="c", slug="leaf", oracle_ids=["x"]),
    }
    assert build_closure(tags)["g"] == {"x"}


def test_closure_survives_cycles():
    """The real taxonomy contains cycles; recursion must not blow the stack."""
    tags = {
        "a": Tag(id="a", slug="a", child_ids=["b"], oracle_ids=["1"]),
        "b": Tag(id="b", slug="b", child_ids=["a"], oracle_ids=["2"]),
    }
    closure = build_closure(tags)

    assert closure["a"] == {"1", "2"}


def test_closure_ignores_dangling_child_ids():
    tags = {"a": Tag(id="a", slug="a", child_ids=["missing"], oracle_ids=["1"])}
    assert build_closure(tags)["a"] == {"1"}
