"""Response caching. Pure — a fake clock, no graph, no network.

The key builders are imported from `deck_lab.api`, which constructs the app but
runs no lifespan; see `test_api_validation.py` for why that matters.
"""

from __future__ import annotations

from deck_lab.api import (
    BucketRange,
    DiagnosticsRequest,
    SuggestionsRequest,
    _canonical_cards,
    _diagnostics_key,
    _suggestions_key,
)
from deck_lab.cache import LruTtlCache
from deck_lab.diagnostics import DeckEntry


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _cache(*, max_entries: int = 4, ttl: float = 60.0) -> tuple[LruTtlCache, FakeClock]:
    clock = FakeClock()
    return LruTtlCache("test", max_entries=max_entries, ttl_seconds=ttl, clock=clock), clock


# --- LruTtlCache ----------------------------------------------------------


def test_put_then_get_returns_the_value():
    cache, _ = _cache()
    cache.put("k", "v")

    assert cache.get("k") == "v"


def test_missing_key_is_a_miss():
    cache, _ = _cache()

    assert cache.get("absent") is None


def test_entry_expires_after_its_ttl():
    cache, clock = _cache(ttl=60.0)
    cache.put("k", "v")

    clock.advance(59.0)
    assert cache.get("k") == "v"

    clock.advance(1.0)  # exactly at the deadline counts as expired
    assert cache.get("k") is None
    assert len(cache) == 0  # and the expired entry is dropped, not left behind


def test_eviction_is_least_recently_used():
    cache, _ = _cache(max_entries=2)
    cache.put("a", 1)
    cache.put("b", 2)

    cache.get("a")  # 'a' is now the most recently used, so 'b' should go
    cache.put("c", 3)

    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3


def test_put_overwrites_in_place():
    cache, _ = _cache()
    cache.put("k", "first")
    cache.put("k", "second")

    assert cache.get("k") == "second"
    assert len(cache) == 1


def test_clear_empties_the_cache():
    cache, _ = _cache()
    cache.put("k", "v")
    cache.clear()

    assert cache.get("k") is None


def test_zero_ttl_disables_storage():
    """0 is the documented off switch, not a zero-length cache."""
    cache, _ = _cache(ttl=0.0)
    cache.put("k", "v")

    assert cache.get("k") is None


# --- generation guard (Task 14: the /warm cache-clear race) ---------------


def test_clear_bumps_the_generation():
    cache, _ = _cache()
    before = cache.generation

    cache.clear()

    assert cache.generation == before + 1


def test_a_put_carrying_a_stale_generation_is_a_no_op():
    """The race this guards: a handler misses the cache, computes, and a
    /warm clear() lands before its put() — the put must not resurrect the
    pre-clear answer for a full TTL."""
    cache, _ = _cache()
    generation = cache.generation

    cache.clear()  # the flush that made `generation` stale
    cache.put("k", "v", generation=generation)

    assert cache.get("k") is None


def test_a_put_without_a_generation_behaves_as_today():
    cache, _ = _cache()
    cache.clear()

    cache.put("k", "v")

    assert cache.get("k") == "v"


# --- key derivation -------------------------------------------------------


def test_card_order_does_not_change_the_key():
    a = DiagnosticsRequest(cards=[DeckEntry(oracle_id="b"), DeckEntry(oracle_id="a")])
    b = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a"), DeckEntry(oracle_id="b")])

    assert _diagnostics_key(a) == _diagnostics_key(b)


def test_duplicate_cards_are_summed():
    """Two entries of one card must key the same as one entry of two."""
    split = [DeckEntry(oracle_id="a", qty=1), DeckEntry(oracle_id="a", qty=2)]
    merged = [DeckEntry(oracle_id="a", qty=3)]

    assert _canonical_cards(split) == _canonical_cards(merged) == (("a", 3),)


def test_quantity_changes_the_key():
    one = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a", qty=1)])
    two = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a", qty=2)])

    assert _diagnostics_key(one) != _diagnostics_key(two)


def test_duplicate_override_buckets_resolve_last_wins():
    """The handler sees a dict, so the key must collapse duplicates the same way."""
    doubled = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")],
        overrides=[
            BucketRange(bucket="ramp", low=1.0),
            BucketRange(bucket="ramp", low=9.0),
        ],
    )
    single = DiagnosticsRequest(
        cards=[DeckEntry(oracle_id="a")],
        overrides=[BucketRange(bucket="ramp", low=9.0)],
    )

    assert _diagnostics_key(doubled) == _diagnostics_key(single)


def test_speed_and_commander_change_the_key():
    base = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")])
    faster = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")], speed=0.9)
    anchored = DiagnosticsRequest(cards=[DeckEntry(oracle_id="a")], commander_oracle_id="cmd")

    assert _diagnostics_key(base) != _diagnostics_key(faster)
    assert _diagnostics_key(base) != _diagnostics_key(anchored)


def test_suggestions_key_covers_its_own_parameters():
    def request(**kwargs) -> SuggestionsRequest:
        return SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], **kwargs)

    base = _suggestions_key(request())

    assert _suggestions_key(request(limit=41)) != base
    assert _suggestions_key(request(focus="landfall")) != base
    assert _suggestions_key(request(max_price=5.0)) != base
    assert _suggestions_key(request(pinned_themes=["landfall"])) != base
    assert _suggestions_key(request(excluded_themes=["landfall"])) != base


def test_card_name_order_and_duplicates_do_not_change_the_key():
    def request(names: list[str]) -> SuggestionsRequest:
        return SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], card_names=names)

    assert _suggestions_key(request(["Sol Ring", "Wastes"])) == _suggestions_key(
        request(["Wastes", "Sol Ring", "Sol Ring"])
    )


def test_pin_order_is_significant():
    """Pins may steer ranking, so their order is part of the answer."""

    def request(pins: list[str]) -> SuggestionsRequest:
        return SuggestionsRequest(cards=[DeckEntry(oracle_id="a")], pinned_themes=pins)

    assert _suggestions_key(request(["a", "b"])) != _suggestions_key(request(["b", "a"]))
