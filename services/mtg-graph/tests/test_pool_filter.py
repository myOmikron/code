"""How a compiled pool restriction reaches the channel queries. Pure — no database."""

from __future__ import annotations

import inspect

import pytest

from deck_lab import graph
from deck_lab.graph import _filter_params, _with_pool
from deck_lab.poolquery import PoolFilter, parse_pool_query

# Every channel that applies the hard filter, and so must carry the sentinel.
FILTERED_CHANNELS = (
    "CHANNEL_EDHREC",
    "CHANNEL_BRIDGE",
    "CHANNEL_ROLES",
    "CHANNEL_THEMES",
    "CHANNEL_TYPAL",
    "CHANNEL_FIXING",
    "CARDS_BY_NAME",
)

# The channels that ask about the deck's own cards rather than retrieving new
# ones. A pool restriction there would be answering a different question:
# "which combos am I one short of" is about what the deck already holds.
UNFILTERED_QUERIES = ("DECK_COMBOS", "FITS_THEME_AMONG", "DECK_FIXING_COUNT")


@pytest.mark.parametrize("name", FILTERED_CHANNELS)
def test_every_filtered_channel_carries_the_sentinel(name):
    """Miss one and that channel silently ignores the restriction — the pool
    would be honoured for themes but not for fixing lands."""
    assert "/*pool*/" in getattr(graph, name)


@pytest.mark.parametrize("name", UNFILTERED_QUERIES)
def test_deck_membership_queries_stay_unrestricted(name):
    assert "/*pool*/" not in getattr(graph, name)


def test_the_sentinel_is_a_comment_when_no_pool_is_given():
    """An unrestricted run must send the constants unchanged."""
    assert _with_pool(graph.CHANNEL_EDHREC, None) == graph.CHANNEL_EDHREC
    assert _with_pool(graph.CHANNEL_EDHREC, PoolFilter()) == graph.CHANNEL_EDHREC
    assert _with_pool(graph.CHANNEL_EDHREC, PoolFilter(max_price=5.0)) == graph.CHANNEL_EDHREC


def test_a_predicate_is_spliced_in_as_a_conjunct():
    pool = parse_pool_query("eur<5")
    cypher = _with_pool(graph.CHANNEL_EDHREC, pool)

    assert "AND (c.price_eur < $pq_0)" in cypher
    assert "/*pool*/" not in cypher
    # Still one WHERE, still the same query — the clause joins the existing
    # hard filter rather than following the RETURN.
    assert cypher.count("WHERE") == graph.CHANNEL_EDHREC.count("WHERE")


def test_pool_params_merge_with_the_hard_filter_params():
    pool = parse_pool_query("t:creature eur<5", max_price=9.0)
    params = _filter_params(["deck-card"], ["G"], pool)

    assert params["deck"] == ["deck-card"]
    assert params["identity"] == ["G"]
    assert params["max_price"] == 9.0
    assert params["pq_0"] == "creature"
    assert params["pq_1"] == 5.0


def test_no_pool_still_supplies_every_hard_filter_param():
    """The constants reference all three unconditionally: a missing one is a
    Cypher ParameterMissing at run time, not a wider search."""
    assert _filter_params([], [], None) == {"deck": [], "identity": [], "max_price": None}


@pytest.mark.parametrize(
    "name",
    [
        "channel_edhrec",
        "channel_bridge",
        "channel_roles",
        "channel_fixing",
        "channel_theme",
        "channel_themes",
        "channel_typal",
        "cards_by_name",
    ],
)
def test_every_channel_wrapper_takes_the_pool(name):
    parameter = inspect.signature(getattr(graph, name)).parameters.get("pool_filter")
    assert parameter is not None, f"{name} cannot be restricted"
    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY


@pytest.mark.parametrize(
    ("module", "name"),
    [
        ("deck_lab.suggestions", "suggest"),
        ("deck_lab.cuts", "suggest_swaps"),
        ("deck_lab.cuts", "find_replacements"),
        ("deck_lab.solver", "fill_deck"),
    ],
)
def test_the_pool_threads_through_every_entry_point(module, name):
    """Including `fill_deck`, which used to drop the budget cap entirely: the
    solver constrained total spend while retrieval ignored the per-card cap."""
    import importlib

    signature = inspect.signature(getattr(importlib.import_module(module), name))
    assert "pool_filter" in signature.parameters
    assert "max_price" not in signature.parameters


def test_the_restriction_is_never_named_after_a_local_it_would_shadow():
    """`suggest()` binds `pool` to its candidate accumulator and `_fill_deck`
    to its chosen list. A restriction parameter called `pool` is shadowed by
    both, and every channel then receives a dict of candidates instead of the
    filter — a 500 from deep inside Cypher, and the reason the parameter is
    called `pool_filter`.

    Structural rather than behavioural: driving `suggest()` far enough to
    reach a channel needs the whole graph stubbed, and what actually broke was
    a name, which is what this reads."""
    import importlib

    for module, name in [
        ("deck_lab.suggestions", "suggest"),
        ("deck_lab.solver", "_fill_deck"),
        ("deck_lab.cuts", "suggest_swaps"),
    ]:
        source = inspect.getsource(getattr(importlib.import_module(module), name))
        assert "pool=pool" not in source, f"{name} hands a channel its own local"
        assert "pool_filter=pool_filter" in source, f"{name} does not forward the restriction"
