"""The `Card` shape written to Neo4j.

Deliberately narrow: only fields the retrieval, diagnostics and extraction
layers actually consume. Scryfall's card objects carry ~80 fields; storing all
of them would make the node properties unreadable and the graph larger for no
benefit — the bulk file stays on disk if something else is ever needed.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .power import playability


class Card(BaseModel):
    oracle_id: str
    scryfall_id: str
    name: str
    mana_cost: str = ""
    cmc: float = 0.0
    type_line: str = ""
    oracle_text: str = ""
    colors: list[str] = Field(default_factory=list)
    color_identity: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    layout: str = ""
    set_code: str = ""
    rarity: str = ""
    edhrec_rank: int | None = None
    # Scryfall mirrors the official Commander Brackets list: 53 cards whose
    # presence moves a deck's bracket. Binary and authoritative — never a scale.
    game_changer: bool = False
    playability: float = 0.0
    price_usd: float | None = None
    # Cardmarket's price via Scryfall — what the EUR-centric builder budgets
    # in. Budget filters prefer it and fall back to USD where it is missing.
    price_eur: float | None = None
    is_legendary: bool = False
    is_creature: bool = False
    is_land: bool = False
    # A commander must be a legendary creature (or say it can be one).
    can_be_commander: bool = False
    scryfall_uri: str = ""
    released_at: str = ""
    # Spoiled but not yet released: legal on release, absent from EDHREC data.
    unreleased: bool = False
    # Creature stats. Float rather than int because `*` and `1+*` exist; those
    # parse to None rather than raising, since a card whose power is defined by
    # the board has no fixed size to measure.
    power: float | None = None
    toughness: float | None = None
    # Formats where this card is banned or restricted, excluding commander
    # (a commander-banned card is not in the corpus at all). Measured over the
    # corpus: cards banned somewhere have a median edhrec_rank of 2,775 against
    # 15,883 for the rest. High precision, and almost no recall — only 281 cards
    # (0.9%) qualify, so it is a top-end marker like `game_changer`, not a scale.
    banned_in: list[str] = Field(default_factory=list)
    # Stored to keep a *negative* finding checkable, not because it is useful:
    # the reserved list tracks collectability, not power. Its 544 cards have a
    # median edhrec_rank of 25,187 — worse than the corpus median. See
    # `docs/power.md`.
    reserved: bool = False


def _face_join(card: dict, key: str, sep: str) -> str:
    """Read `key` from the top level, falling back to joining both card faces.

    Split, transforming, modal-DFC and adventure cards keep oracle text and mana
    cost on `card_faces` rather than the top level. Reading only the top level
    silently yields an empty string for ~4% of the corpus — and those are
    exactly the mechanically interesting cards.
    """
    if value := card.get(key):
        return value

    faces = card.get("card_faces") or []
    parts = [face.get(key, "") for face in faces]
    return sep.join(part for part in parts if part)


def _price_usd(card: dict) -> float | None:
    prices = card.get("prices") or {}
    raw = prices.get("usd") or prices.get("usd_foil")
    if raw is None:
        return None
    try:
        return float(raw)
    except TypeError, ValueError:
        return None


def _price_eur(card: dict) -> float | None:
    prices = card.get("prices") or {}
    raw = prices.get("eur") or prices.get("eur_foil")
    if raw is None:
        return None
    try:
        return float(raw)
    except TypeError, ValueError:
        return None


# Commander is excluded deliberately: `is_ingestable` already drops
# commander-banned cards, so including it here would always be zero and imply a
# signal that cannot exist. `restricted` counts — Vintage restricts rather than
# bans, and a restricted card is a strong card, not a permitted one.
_BANNABLE_FORMATS = (
    "standard",
    "pioneer",
    "modern",
    "legacy",
    "vintage",
    "pauper",
    "brawl",
    "historic",
)


def _banned_in(raw: dict) -> list[str]:
    legalities = raw.get("legalities") or {}
    return [f for f in _BANNABLE_FORMATS if legalities.get(f) in ("banned", "restricted")]


def _stat(raw: dict, key: str) -> float | None:
    """Parse power/toughness, tolerating the ones that are not numbers.

    `*`, `1+*`, `?` and `∞` all appear. A card whose size is defined by the board
    has no fixed value to measure, so it reads as None rather than as zero —
    zero would drag every average that touches it.
    """
    value = raw.get(key)
    if value is None and (faces := raw.get("card_faces")):
        value = faces[0].get(key)
    try:
        return float(value)
    except TypeError, ValueError:
        return None


# Rule 903.3a is no longer "legendary creature". A legendary Vehicle, Spacecraft
# or Background can be a commander too, because each can become a creature.
# Encoding that as a *rule* rather than a fetched list of names matters for the
# same reason the mechanical layer exists at all: a rule covers a card spoiled
# this morning, and a list does not.
#
# Scored against Scryfall's own `is:commander` over the corpus: precision 0.9997,
# recall 0.9997, with exactly two disagreements — see `_can_be_commander`.
_COMMANDER_TYPES = ("Creature", "Vehicle", "Spacecraft", "Background")


def _front_type_line(raw: dict) -> str:
    """The front face's type line, which is the one that governs eligibility.

    `Invasion of Kaladesh // Aetherwing, Golden-Scale Flagship` is a Battle that
    transforms into a Vehicle, and `Balamb Garden` is a Land that becomes one.
    Neither is a legal commander, and both look like one if you read the joined
    type line of both faces.
    """
    if faces := raw.get("card_faces"):
        return faces[0].get("type_line", "") or ""
    return raw.get("type_line", "") or ""


def _can_be_commander(raw: dict) -> bool:
    """Whether this card may be a commander, from the card alone.

    Two known misses against Scryfall, both left to the curated override in
    `ingest` rather than special-cased here:

    - **The Eternity Elevator** is a legendary Spacecraft whose Station grants a
      mana ability and never says "It's an artifact creature at N+", so it never
      becomes a creature and cannot be a commander. Hearthhull's Station does.
    - **Grist, the Hunger Tide** is a planeswalker that "is a 1/1 Insect creature"
      while not on the battlefield, so it is a creature card where it counts.

    Both are one card each, and encoding either as a text pattern would be a
    rule fitted to a sample of one.
    """
    type_line = _front_type_line(raw)
    if "Legendary" in type_line and any(k in type_line for k in _COMMANDER_TYPES):
        return True

    return "can be your commander" in _face_join(raw, "oracle_text", "\n").lower()


def card_from_scryfall(raw: dict) -> Card:
    type_line = _face_join(raw, "type_line", " // ")
    oracle_text = _face_join(raw, "oracle_text", "\n//\n")

    is_legendary = "Legendary" in type_line
    is_creature = "Creature" in type_line

    return Card(
        oracle_id=raw["oracle_id"],
        scryfall_id=raw["id"],
        name=raw["name"],
        mana_cost=_face_join(raw, "mana_cost", " // "),
        cmc=float(raw.get("cmc") or 0.0),
        type_line=type_line,
        oracle_text=oracle_text,
        colors=raw.get("colors") or [],
        color_identity=raw.get("color_identity") or [],
        keywords=raw.get("keywords") or [],
        layout=raw.get("layout", ""),
        set_code=raw.get("set", ""),
        rarity=raw.get("rarity", ""),
        edhrec_rank=raw.get("edhrec_rank"),
        game_changer=bool(raw.get("game_changer")),
        playability=round(playability(raw.get("edhrec_rank")), 4),
        price_usd=_price_usd(raw),
        price_eur=_price_eur(raw),
        is_legendary=is_legendary,
        is_creature=is_creature,
        is_land="Land" in type_line,
        can_be_commander=_can_be_commander(raw),
        scryfall_uri=raw.get("scryfall_uri", ""),
        released_at=raw.get("released_at", ""),
        unreleased=(raw.get("legalities") or {}).get("commander") != "legal",
        power=_stat(raw, "power"),
        toughness=_stat(raw, "toughness"),
        banned_in=_banned_in(raw),
        reserved=bool(raw.get("reserved")),
    )
