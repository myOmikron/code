"""Command Zone Dating: the commander pool, player profiles and verdicts.

A commander "swipes back" on a player's profile. Every rejection names the
dimension that scored worst, so the joke stays honest advice.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections.abc import Callable, Iterable
from functools import cache
from statistics import fmean, median
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .edhrec import THEME_TAG_SLUGS
from .themes import THEMES

OracleId = Annotated[str, Field(max_length=64)]
Color = Literal["W", "U", "B", "R", "G"]
Dimension = Literal["themes", "colors", "bracket", "budget", "salt"]

MAX_DECKS = 40
MAX_EXCLUDED = 20_000
MAX_STACK = 30

WEIGHTS: dict[str, float] = {
    "themes": 0.35,
    "colors": 0.2,
    "bracket": 0.2,
    "budget": 0.1,
    "salt": 0.15,
}
# Starting point only: tune it against the scores stored with each swipe
# until about 30% of likes are rejected.
MATCH_THRESHOLD = 0.6
# A deck's theme share at which the player counts as fully playing it.
THEME_PLAYED = 0.15
# Deck price (EUR) that reads as a "middle" budget, and the factor to either tier.
BUDGET_MIDDLE_EUR = 300.0
BUDGET_TIER_FACTOR = 4.0
INTERESTS_SHOWN = 3
# Keeps a zero dimension from zeroing the whole geometric mean.
SCORE_FLOOR = 0.05
# A theme counts as supported when this share of the commander's recommended
# cards fits it; measured top themes sit at 0.15 to 0.35, the median at 0.04.
SUPPORT_HIGH = 0.12
SUPPORT_MID = 0.06
SUPPORT_SAMPLE = 200
PROPOSALS = 3
# A Blind Date leaves this many slots open for card swiping.
BLIND_OPEN_SLOTS = 35
# The frontend's `THEME_LEVEL_SHARE`, for the rolled levels.
LEVEL_SHARE = {"light": 0.1, "core": 0.25, "allin": 0.4}
# One card in this many is picked for compatibility instead of popularity.
YOUR_TYPE_EVERY = 5
YOUR_TYPE_SAMPLE = 40

TAG_THEMES: dict[str, str] = {slug: theme for theme, slug in THEME_TAG_SLUGS.items()}


class Interest(BaseModel):
    """One EDHREC tag of a commander, mapped onto our themes where possible."""

    label: str
    theme: str | None
    share: float


class DateTheme(BaseModel):
    """A theme on a date, and how much the commander supports it."""

    theme: str
    label: str
    support: float
    tier: Literal["high", "mid", "low"]


class DatePlan(BaseModel):
    """What a commander brings to a date: its proposals and its view of every theme."""

    proposals: list[DateTheme]
    themes: list[DateTheme]


class RolledTheme(BaseModel):
    """A theme a Blind Date rolled, and its level."""

    theme: str
    label: str
    level: Literal["light", "core", "allin"]


class BlindCard(BaseModel):
    """A card of a Blind Date's fill."""

    oracle_id: str
    name: str


class BlindDate(BaseModel):
    """A rolled, filled deck: what goes in now and how much is left to swipe."""

    themes: list[RolledTheme]
    add_now: list[BlindCard]
    add_later: list[BlindCard] = Field(default_factory=list)
    open_slots: int
    solved: bool


class DatingCommander(BaseModel):
    """A commander as the swipe stack shows it."""

    oracle_id: str
    name: str
    color_identity: list[str]
    edhrec_rank: int | None
    price_eur: float | None
    oracle_text: str
    type_line: str
    salt: float | None
    decks: int
    bracket: float | None
    budget_lean: float | None
    interests: list[Interest]
    your_type: bool


class DatingDeck(BaseModel):
    """One of the player's decks, as the profile reads it."""

    commanders: list[OracleId] = Field(max_length=8)
    cards: dict[OracleId, int] = Field(max_length=2048)
    bracket: int | None = Field(None, ge=1, le=5)
    price_eur: float | None = Field(None, ge=0)
    colors: list[Color] = Field(max_length=5)


class ProfileAnswers(BaseModel):
    """The dating-profile questions, for players without decks."""

    colors: list[Color] = Field(default_factory=list, max_length=5)
    bracket: int | None = Field(None, ge=1, le=5)
    budget_eur: float | None = Field(None, ge=0)


class DatingProfile(BaseModel):
    """What commanders see of a player. Deck signals win over answers."""

    decks: int
    themes: dict[str, float]
    labels: dict[str, str] = Field(default_factory=dict)
    colors: dict[str, float]
    bracket: float | None
    budget_eur: float | None
    salt: float | None


class DatingVerdict(BaseModel):
    """A commander's answer to a like."""

    match: bool
    score: float
    dimension: Dimension | None
    direction: Literal["more", "less"] | None
    detail: str | None
    shared: str | None


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


@cache
def _creature_types() -> frozenset[str]:
    from .graph import typal_corpus_counts

    bodies, _ = typal_corpus_counts()
    return frozenset(name.lower() for name in bodies)


def _singular(slug: str) -> str:
    if slug.endswith("ves"):
        return slug[:-3] + "f"
    if slug.endswith("es") and slug[:-2] in _creature_types():
        return slug[:-2]
    if slug.endswith("s"):
        return slug[:-1]
    return slug


def tag_theme(slug: str) -> str | None:
    """Our theme id for an EDHREC tag, `tribal` for a creature type, else None."""
    if slug in TAG_THEMES:
        return TAG_THEMES[slug]
    if _singular(slug) in _creature_types():
        return "tribal"
    return None


def interests(row: dict) -> list[Interest]:
    """The commander's top tags; ones that map onto a theme come first."""
    decks = max(int(row.get("decks") or 0), 1)
    tags = zip(
        row.get("tags") or [],
        row.get("tag_labels") or [],
        row.get("tag_counts") or [],
        strict=False,
    )
    ranked = sorted(tags, key=lambda tag: -tag[2])
    found = [
        Interest(label=label, theme=tag_theme(slug), share=round(count / decks, 3))
        for slug, label, count in ranked
    ]
    mapped = [interest for interest in found if interest.theme is not None]
    rest = [interest for interest in found if interest.theme is None]
    return (mapped + rest)[:INTERESTS_SHOWN]


def bracket_mean(brackets: list[int] | None) -> float | None:
    """Average bracket over the commander's decks."""
    counts = brackets or []
    total = sum(counts)
    if not total:
        return None
    return sum((index + 1) * count for index, count in enumerate(counts)) / total


def budget_lean(budget: list[int] | None) -> float | None:
    """-1 for all budget decks, +1 for all expensive ones."""
    cheap, middle, expensive = (list(budget or []) + [0, 0, 0])[:3]
    total = cheap + middle + expensive
    if not total:
        return None
    return (expensive - cheap) / total


def player_budget_lean(budget_eur: float | None) -> float | None:
    """The player's deck price on the same -1..1 scale as `budget_lean`."""
    if budget_eur is None:
        return None
    price = max(budget_eur, 1.0)
    return max(-1.0, min(1.0, math.log(price / BUDGET_MIDDLE_EUR) / math.log(BUDGET_TIER_FACTOR)))


def commander_card(row: dict, *, your_type: bool = False) -> DatingCommander:
    """A pool row as the stack shows it."""
    return DatingCommander(
        oracle_id=row["oracle_id"],
        name=row["name"],
        color_identity=list(row.get("color_identity") or []),
        edhrec_rank=row.get("edhrec_rank"),
        price_eur=row.get("price_eur"),
        oracle_text=row.get("oracle_text") or "",
        type_line=row.get("type_line") or "",
        salt=row.get("salt"),
        decks=int(row.get("decks") or 0),
        bracket=bracket_mean(row.get("brackets")),
        budget_lean=budget_lean(row.get("budget")),
        interests=interests(row),
        your_type=your_type,
    )


def _deck_themes(deck: DatingDeck) -> dict[str, float]:
    from .diagnostics import _as_resources, resource_idf
    from .graph import deck_card_resources
    from .themes import deck_theme_breakdown

    counts = dict(deck.cards)
    for commander in deck.commanders:
        counts.setdefault(commander, 1)
    resources = deck_card_resources(counts)
    empty = {"produces": set(), "cares_about": set()}
    card_resources = [
        (
            _as_resources(resources.get(oid, empty)["produces"]),
            _as_resources(resources.get(oid, empty)["cares_about"]),
        )
        for oid, qty in deck.cards.items()
        for _ in range(qty)
    ]
    commander = None
    for seat in deck.commanders:
        if seat in resources:
            commander = commander or (set(), set())
            commander[0].update(_as_resources(resources[seat]["produces"]))
            commander[1].update(_as_resources(resources[seat]["cares_about"]))
    shares, _ = deck_theme_breakdown(
        card_resources, resource_idf(), commander=commander, seats=max(len(deck.commanders), 1)
    )
    return shares


def build_profile(
    decks: list[DatingDeck],
    answers: ProfileAnswers | None,
    *,
    deck_themes: Callable[[DatingDeck], dict[str, float]] = _deck_themes,
    salts: Callable[[list[str]], dict[str, float]] | None = None,
) -> DatingProfile:
    """Aggregate the player's decks; answers fill what the decks cannot say."""
    if salts is None:
        from .graph import commander_salts as salts

    answers = answers or ProfileAnswers()
    decks = decks[:MAX_DECKS]

    themes: dict[str, float] = {}
    for deck in decks:
        if not deck.cards:
            continue
        for theme, share in deck_themes(deck).items():
            strength = _clamp(share / THEME_PLAYED)
            if strength > themes.get(theme, 0.0):
                themes[theme] = round(strength, 3)
    themes = {theme: strength for theme, strength in themes.items() if strength > 0}

    if decks:
        colors = {
            color: round(sum(color in deck.colors for deck in decks) / len(decks), 3)
            for color in "WUBRG"
        }
        colors = {color: share for color, share in colors.items() if share > 0}
    else:
        colors = {color: 1.0 for color in answers.colors}

    brackets = [deck.bracket for deck in decks if deck.bracket is not None]
    prices = [deck.price_eur for deck in decks if deck.price_eur]
    seats = sorted({seat for deck in decks for seat in deck.commanders})
    salt_values = list(salts(seats).values()) if seats else []

    return DatingProfile(
        decks=len(decks),
        themes=themes,
        labels={theme: THEMES[theme].label for theme in themes if theme in THEMES},
        colors=colors,
        bracket=round(fmean(brackets), 2) if brackets else answers.bracket,
        budget_eur=round(median(prices), 2) if prices else answers.budget_eur,
        salt=round(fmean(salt_values), 3) if salt_values else None,
    )


def _scores(
    profile: DatingProfile, commander: DatingCommander
) -> dict[str, tuple[float, str | None, str | None]]:
    """Per dimension: score in 0..1, direction and detail. Unknown ones are left out."""
    out: dict[str, tuple[float, str | None, str | None]] = {}

    mapped = [interest for interest in commander.interests if interest.theme]
    if profile.themes and mapped:
        total = sum(interest.share for interest in mapped) or 1.0
        score = sum(
            interest.share / total * profile.themes.get(interest.theme or "", 0.0)
            for interest in mapped
        )
        missing = min(mapped, key=lambda interest: profile.themes.get(interest.theme or "", 0.0))
        out["themes"] = (score, None, missing.label)

    identity = [color for color in commander.color_identity if color in "WUBRG"]
    if not identity:
        out["colors"] = (1.0, None, None)
    elif profile.colors:
        score = fmean(_clamp(profile.colors.get(color, 0.0) * 3) for color in identity)
        missing = "".join(color for color in identity if not profile.colors.get(color))
        out["colors"] = (score, None, missing or None)

    if commander.bracket is not None and profile.bracket is not None:
        gap = commander.bracket - profile.bracket
        score = _clamp(1 - max(0.0, abs(gap) - 0.5) / 1.5)
        out["bracket"] = (score, "more" if gap > 0 else "less", None)

    player_lean = player_budget_lean(profile.budget_eur)
    if commander.budget_lean is not None and player_lean is not None:
        gap = commander.budget_lean - player_lean
        score = _clamp(1 - max(0.0, abs(gap) - 0.25))
        out["budget"] = (score, "more" if gap > 0 else "less", None)

    if commander.salt is not None and profile.salt is not None:
        gap = commander.salt - profile.salt
        score = _clamp(1 - max(0.0, abs(gap) - 0.4) / 1.2)
        out["salt"] = (score, "more" if gap > 0 else "less", None)

    return out


def score(profile: DatingProfile, commander: DatingCommander) -> float:
    """Weighted geometric mean in 0..1, so one dealbreaker can sink a match.

    With nothing to compare, everyone matches.
    """
    scores = _scores(profile, commander)
    if not scores:
        return 1.0
    weight = sum(WEIGHTS[dimension] for dimension in scores)
    log_sum = sum(
        WEIGHTS[dimension] * math.log(max(value[0], SCORE_FLOOR))
        for dimension, value in scores.items()
    )
    return math.exp(log_sum / weight)


def verdict(profile: DatingProfile, commander: DatingCommander) -> DatingVerdict:
    """Match or rejection; a rejection names its worst dimension."""
    scores = _scores(profile, commander)
    total = score(profile, commander)
    shared = None
    mapped = [interest for interest in commander.interests if interest.theme]
    if profile.themes and mapped:
        best = max(mapped, key=lambda interest: profile.themes.get(interest.theme or "", 0.0))
        if profile.themes.get(best.theme or "", 0.0) > 0:
            shared = best.label

    if total >= MATCH_THRESHOLD:
        return DatingVerdict(
            match=True,
            score=round(total, 3),
            dimension=None,
            direction=None,
            detail=None,
            shared=shared,
        )

    worst = min(scores, key=lambda dimension: (scores[dimension][0], -WEIGHTS[dimension]))
    _, direction, detail = scores[worst]
    return DatingVerdict(
        match=False,
        score=round(total, 3),
        dimension=worst,  # type: ignore[arg-type]
        direction=direction,  # type: ignore[arg-type]
        detail=detail,
        shared=shared,
    )


def _popularity(row: dict) -> float:
    return 1 / math.sqrt((row.get("edhrec_rank") or 20_000) + 25)


def in_filter(
    row: dict, colors: set[str] | None, only: set[str] | None, required: set[str] | None = None
) -> bool:
    """Whether a pool row is within `colors`, has all `required` colors and is on `only`."""
    if only is not None and row["oracle_id"] not in only:
        return False
    identity = set(row.get("color_identity") or [])
    if required and not required <= identity:
        return False
    return colors is None or identity <= colors


def stack(
    pool: Iterable[dict],
    profile: DatingProfile,
    *,
    exclude: set[str],
    colors: set[str] | None,
    count: int,
    seed: int,
    only: set[str] | None = None,
    required: set[str] | None = None,
) -> list[DatingCommander]:
    """The pool in one fixed popularity-weighted order per seed, without the excluded cards.

    Every fifth place of the order holds the best fit among the next few, the "your type"
    card. Excluding cards only skips places, so a reload resumes where the player left off.
    """
    ordered = sorted(
        (row for row in pool if in_filter(row, colors, only, required)),
        key=lambda row: _order_key(row, seed),
        reverse=True,
    )
    fits: dict[str, float] = {}

    def fit(row: dict) -> float:
        if row["oracle_id"] not in fits:
            fits[row["oracle_id"]] = score(profile, commander_card(row))
        return fits[row["oracle_id"]]

    out: list[DatingCommander] = []
    place = 0
    while ordered and len(out) < count:
        your_type = place % YOUR_TYPE_EVERY == YOUR_TYPE_EVERY - 1
        pick = max(ordered[:YOUR_TYPE_SAMPLE], key=fit) if your_type else ordered[0]
        ordered.remove(pick)
        place += 1
        if pick["oracle_id"] not in exclude:
            out.append(commander_card(pick, your_type=your_type))
    return out


def _order_key(row: dict, seed: int) -> float:
    """A weighted shuffle key (Efraimidis-Spirakis) that depends only on the card and the seed."""
    digest = hashlib.blake2b(f"{seed}:{row['oracle_id']}".encode(), digest_size=8).digest()
    draw = (int.from_bytes(digest) + 1) / 2**64
    return math.log(draw) / _popularity(row)


def _tier(support: float) -> Literal["high", "mid", "low"]:
    if support >= SUPPORT_HIGH:
        return "high"
    if support >= SUPPORT_MID:
        return "mid"
    return "low"


def date_plan(
    row: dict,
    *,
    recommended: Callable[[str, int], list[str]] | None = None,
    fit_counts: Callable[[list[str], float], dict[str, int]] | None = None,
) -> DatePlan:
    """The commander's proposals (its mapped interests, topped up by support) and every theme."""
    from .themes import FIT_THRESHOLD

    if recommended is None:
        from .graph import recommended_ids as recommended
    if fit_counts is None:
        from .graph import theme_fit_counts as fit_counts

    ids = recommended(row["oracle_id"], SUPPORT_SAMPLE)
    counts = fit_counts(ids, FIT_THRESHOLD) if ids else {}
    total = max(len(ids), 1)
    themes = sorted(
        (
            DateTheme(
                theme=theme_id,
                label=theme.label,
                support=round(counts.get(theme_id, 0) / total, 3),
                tier=_tier(counts.get(theme_id, 0) / total),
            )
            for theme_id, theme in THEMES.items()
        ),
        key=lambda theme: -theme.support,
    )
    by_id = {theme.theme: theme for theme in themes}

    proposals: list[DateTheme] = []
    for interest in interests(row):
        if interest.theme in by_id and all(p.theme != interest.theme for p in proposals):
            proposals.append(by_id[interest.theme].model_copy(update={"label": interest.label}))
    for theme in themes:
        if len(proposals) >= PROPOSALS:
            break
        if all(p.theme != theme.theme for p in proposals):
            proposals.append(theme)
    return DatePlan(proposals=proposals[:PROPOSALS], themes=themes)


def roll_themes(plan: DatePlan, row: dict, rng: random.Random) -> list[RolledTheme]:
    """Two or three of the commander's supported themes, weighted by its decks and support."""
    shares = {interest.theme: interest.share for interest in interests(row) if interest.theme}
    pool = [theme for theme in plan.themes if theme.tier != "low"] or plan.themes[:3]
    labels = {proposal.theme: proposal.label for proposal in plan.proposals}
    count = min(len(pool), rng.choice((2, 3)))
    picked: list[DateTheme] = []
    while len(picked) < count:
        left = [theme for theme in pool if theme not in picked]
        weights = [theme.support + shares.get(theme.theme, 0.0) + 0.01 for theme in left]
        picked.append(rng.choices(left, weights=weights)[0])
    return [
        RolledTheme(
            theme=theme.theme,
            label=labels.get(theme.theme, theme.label),
            level=rng.choice(("allin", "core")) if index == 0 else rng.choice(("light", "core")),
        )
        for index, theme in enumerate(picked)
    ]


def split_fill(
    chosen: list[tuple[str, str]],
    lands: set[str],
    fitting: set[str],
    inclusion: dict[str, float],
    *,
    slots: int = 99,
    open_slots: int = BLIND_OPEN_SLOTS,
) -> tuple[list[BlindCard], list[BlindCard], int]:
    """Lands and the surest picks go in now, until `open_slots` are left for swiping.

    The rest of the fill comes back as well, for a player who skips the swiping.
    """
    keep = max(0, slots - open_slots)
    land_cards = [(oid, name) for oid, name in chosen if oid in lands]
    others = sorted(
        ((oid, name) for oid, name in chosen if oid not in lands),
        key=lambda card: (card[0] not in fitting, -inclusion.get(card[0], 0.0)),
    )
    ordered = [BlindCard(oracle_id=oid, name=name) for oid, name in land_cards + others]
    now = ordered[:keep]
    return now, ordered[keep:], slots - len(now)
