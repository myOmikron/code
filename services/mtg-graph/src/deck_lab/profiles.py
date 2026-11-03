"""What one card adds to a deck's shape, for the advisor's impact badges.

The frontend shows an exchange as "↑ Ramp ↓ Interaction ↑ Tokens". It knows
each card's type line and mana value already; the buckets and themes a card
counts toward live only here, so they ride along on every suggestion and cut.
"""

from collections.abc import Iterable

from pydantic import BaseModel, Field

from .composition import bucket_coverage_from_cards
from .vocabulary import Role


class CardProfile(BaseModel):
    """The buckets a card counts toward, and the themes it plays.

    `buckets` maps a bucket to the card's coverage, counted the way diagnostics
    counts the deck: its strongest role within each bucket.
    """

    buckets: dict[str, float] = Field(default_factory=dict)
    themes: list[str] = Field(default_factory=list)


def _typed(role_weights: dict[str, float]) -> dict[Role, float]:
    typed: dict[Role, float] = {}
    for name, weight in role_weights.items():
        try:
            typed[Role(name)] = weight
        except ValueError:
            continue
    return typed


def card_profiles(oracle_ids: Iterable[str]) -> dict[str, CardProfile]:
    """Profiles for any cards, in two batched queries."""
    from .graph import cards_role_weights, cards_theme_fits
    from .themes import FIT_THRESHOLD

    ids = list(dict.fromkeys(oracle_ids))
    if not ids:
        return {}
    roles = cards_role_weights(ids)
    fits = cards_theme_fits(ids)

    profiles: dict[str, CardProfile] = {}
    for oracle_id in ids:
        coverage = bucket_coverage_from_cards([(_typed(roles.get(oracle_id, {})), 1)])
        profiles[oracle_id] = CardProfile(
            buckets={str(b): round(w, 2) for b, w in coverage.items() if w > 0},
            themes=sorted(t for t, fit in fits.get(oracle_id, {}).items() if fit >= FIT_THRESHOLD),
        )
    return profiles


def attach_profiles(adds: Iterable, cuts: Iterable) -> None:
    """Sets `profile` on every suggestion and cut candidate given."""
    adds, cuts = list(adds), list(cuts)
    profiles = card_profiles([card.oracle_id for card in [*adds, *cuts]])
    for card in [*adds, *cuts]:
        card.profile = profiles.get(card.oracle_id)
