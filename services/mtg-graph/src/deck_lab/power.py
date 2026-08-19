"""How much a card weighs.

The question this answers: a common that makes one Treasure and Smothering
Tithe both `PRODUCES treasure`, and the bridge treats them identically. It
should not.

Two signals, deliberately kept apart because they measure different things and
conflating them is how a "power level" number becomes meaningless.

**Playability** — derived from Scryfall's `edhrec_rank`, which is how many real
Commander decks run the card. Among the 179 cards that produce Treasure, that
rank spans 63 (Smothering Tithe) to 27,670, with a median of 5,194. A 400-fold
spread on the exact axis the bridge was flattening.

It is *popularity*, not power, and the difference matters: Command Tower is rank
1 and is not a strong card, it is a ubiquitous one. As a weight for "of the
cards that do this thing, which one should I be shown", popularity is the right
proxy — a card nobody plays is usually a card that is not worth playing. As a
measure of how strong a deck is, it is not.

**Game changer** — Scryfall's `game_changer` flag, which mirrors the official
Commander Brackets list. 53 cards, authoritative, binary. This is the one that
actually speaks to power level: including one moves a deck's bracket. It is not
a scale and should never be averaged into one.

What we still cannot measure is *magnitude*: Smothering Tithe makes a Treasure
per opponent per draw, and a common makes one, once. That is the `amount` /
`conditional` qualifier `docs/composition.md` specifies for `PRODUCES` edges and
which has never been extracted. Playability is a proxy standing in for it, and
it is worth remembering that is what it is.
"""

from __future__ import annotations

import math

# Ranks run to roughly 30k. The exact ceiling only sets the curve's tail, and a
# fixed value keeps the score stable as the corpus grows.
RANK_CEILING = 30_000


def playability(edhrec_rank: int | None) -> float:
    """Map an EDHREC rank to [0, 1]. Unranked cards score 0.

    Logarithmic because the interesting distinctions are at the top: the gap
    between rank 63 and rank 600 matters far more than the gap between 20,000
    and 20,500, and a linear scale would flatten exactly the cards worth
    telling apart.
    """
    if not edhrec_rank or edhrec_rank <= 0:
        return 0.0

    rank = min(edhrec_rank, RANK_CEILING)
    return max(0.0, 1.0 - math.log(rank) / math.log(RANK_CEILING))


def weight_within_group(
    edhrec_rank: int | None, *, floor: float = 0.15, rarity: str | None = None
) -> float:
    """Playability as a multiplier, with a floor.

    Used to scale a card's contribution to a resource it produces. The floor
    stops an unranked or obscure card scoring zero and vanishing entirely — it
    still produces the resource, it is just weaker evidence, and a brand-new
    spoiler has no rank at all by construction.

    **Rarity only moves the floor, never the ranked score.** Rarity and
    playability correlate at +0.396 over the corpus, so multiplying both into
    every card would count the same evidence twice — and where a rank exists it
    is the better signal, because it measures play directly rather than
    predicting it.

    Where a rank does *not* exist, rarity is all we have, and a flat floor says
    a newly spoiled mythic and a newly spoiled common are equally good bets.
    They are not: median `edhrec_rank` runs 21,253 for commons to 6,692 for
    mythics. 152 cards are unranked, 84 of them unreleased spoilers — small, and
    exactly the cold-start case the mechanical layer exists to serve.

    Deliberately conservative: the spread is `floor * rarity_weight`, roughly
    0.13–0.18, not the 3.2x the median ranks would justify. This cannot be
    measured by the current eval — held-out cards are EDHREC cards and so always
    have a rank — and an unmeasurable change should be timid.
    """
    if not edhrec_rank or edhrec_rank <= 0:
        return floor * rarity_weight(rarity)

    return floor + (1.0 - floor) * playability(edhrec_rank)


# Rarity is Wizards' own power budget: designers deliberately spend more power
# on rares than commons. Measured against 2.43M real games across five Limited
# sets, it is the strongest single power signal available to us — Spearman
# +0.319 against GIH WR and +0.371 against IWD at n=1,255 (noise band 0.055),
# and stable across all five sets independently (+0.209 to +0.372), so it is not
# one set's artifact. See `docs/power.md`.
#
# Centred on 1.0 like the bridge's relative IDF, and for the same reason: a
# multiplier that changes a channel's *volume* makes the eval unable to
# attribute a recall change to the ranking. The spread is deliberately narrow —
# rarity is evidence, not a verdict, and a common staple must stay reachable.
_RARITY_WEIGHT = {
    "common": 0.85,
    "uncommon": 0.95,
    "rare": 1.10,
    "mythic": 1.20,
    # `special` and `bonus` are printing categories, not power tiers.
    "special": 1.0,
    "bonus": 1.0,
}


def rarity_weight(rarity: str | None) -> float:
    """Rarity as a ranking multiplier centred on 1.0. Unknown rarity is neutral.

    **Not a power level.** Counterspell is a common and Sol Ring is uncommon;
    plenty of commons are Commander staples. This says only "of two cards that
    do the same thing, the rarer one is somewhat more likely to do it better",
    which is what the measurement supports and nothing more.
    """
    return _RARITY_WEIGHT.get((rarity or "").lower(), 1.0)


def banned_elsewhere(banned_in: list[str] | None) -> bool:
    """Whether this card is banned or restricted in any non-Commander format.

    Treated like `game_changer` — binary, never averaged into a scale. Over the
    corpus, cards banned somewhere have a median edhrec_rank of 2,775 against
    15,883 for the rest, and at four or more formats 40-50% are game changers.

    Deliberately *not* validated on Limited win rates: it measures +0.042 there,
    inside the noise band, because cards banned in Constructed barely appear in
    a Limited set. The Commander evidence is the evidence for this one.
    """
    return bool(banned_in)


def describe(edhrec_rank: int | None, game_changer: bool) -> str:
    """A short human phrase for provenance lines."""
    if game_changer:
        return "game changer"
    if not edhrec_rank:
        return "unranked"
    if edhrec_rank <= 500:
        return f"staple (#{edhrec_rank})"
    if edhrec_rank <= 3000:
        return f"widely played (#{edhrec_rank})"
    if edhrec_rank <= 10000:
        return f"niche (#{edhrec_rank})"
    return f"rarely played (#{edhrec_rank})"
