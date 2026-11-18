"""Creature-type extraction. Pure functions — no database."""

from __future__ import annotations

from deck_lab.typal import TYPE_GROUPS, build_vocabulary, extract, own_types, plural_forms

LINES = [
    "Legendary Creature — Crab Druid",
    "Creature — Lobster",
    "Creature — Nautilus",
    "Creature — Starfish",
    "Creature — Trilobite",
    "Creature — Goblin",
    "Creature — Elf Druid",
    "Creature — Bear",
    # Non-creature subtypes that leak in via odd type lines.
    "Land Creature — Forest Dryad",
    "Land — Forest",
    "Land — Forest",
    "Artifact — Equipment",
    "Artifact — Equipment",
    "Artifact Creature — Equipment",
]
VOCAB = build_vocabulary(LINES)


def test_plurals_cover_the_irregulars():
    assert "Elves" in plural_forms("Elf")
    assert "Nautiluses" in plural_forms("Nautilus")
    assert "Wolves" in plural_forms("Wolf")


def test_vocabulary_excludes_land_and_artifact_subtypes():
    """Forest arrives via Dryad Arbor, Equipment via Equipment Creatures. Both
    drove false positives until the exclusion was derived from the counts."""
    assert "Crab" in VOCAB.types
    assert "Forest" not in VOCAB.types
    assert "Equipment" not in VOCAB.types


def test_extracts_a_lord():
    cares, _ = extract("Other Goblins you control get +1/+1.", "Goblin King", VOCAB)
    assert cares == {"Goblin"}


def test_walks_back_an_and_or_list():
    """Only the last item touches the context marker."""
    text = (
        "Whenever a land you control enters, any number of target players each mill X "
        "cards, where X is twice the number of Crabs, Lobsters, Nautiluses, Starfish, "
        "and/or Trilobites you control."
    )
    cares, _ = extract(text, "Homer, the Hermit", VOCAB)

    assert cares == {"Crab", "Lobster", "Nautilus", "Starfish", "Trilobite"}


def test_token_creation_is_production_not_care():
    """Creating a Goblin token is supplying one, not caring about them."""
    cares, makes = extract("Create two 1/1 red Goblin creature tokens.", "X", VOCAB)

    assert cares == set()
    assert makes == {"Goblin"}


def test_animation_text_is_not_a_payoff():
    cares, _ = extract("Enchanted land is a 6/4 green Elf creature.", "X", VOCAB)
    assert cares == set()


def test_negation_is_not_a_payoff():
    cares, _ = extract("Target non-Goblin creature gets -2/-0.", "X", VOCAB)
    assert cares == set()


def test_reminder_text_is_masked():
    cares, _ = extract("Changeling (This card is every Goblin type.)", "X", VOCAB)
    assert cares == set()


def test_a_cards_own_name_is_not_a_reference():
    """Oracle text refers to the card by name; that is not caring about a type."""
    cares, _ = extract("Goblin King gets +1/+1.", "Goblin King", VOCAB)
    assert cares == set()


def test_lowercase_word_is_not_a_type():
    """Case sensitivity on the type is what stops 'bear' matching in prose."""
    cares, _ = extract("Target creature you control gains a bear hug.", "X", VOCAB)
    assert cares == set()


def test_context_words_stay_case_insensitive():
    """Oracle text opens sentences with 'Other Goblins'; a wholly case-sensitive
    pattern loses every lord in the game."""
    assert extract("Other Goblins get +1/+1.", "X", VOCAB)[0] == {"Goblin"}
    assert extract("other Goblins get +1/+1.", "X", VOCAB)[0] == {"Goblin"}


def test_own_types_reads_the_type_line():
    # Druid is a creature type too — a card is every subtype on its line.
    assert own_types("Legendary Creature — Crab Druid", VOCAB) == {"Crab", "Druid"}
    assert own_types("Land — Forest", VOCAB) == set()


GROUP_VOCAB = build_vocabulary(
    [f"Creature — {t}" for members in TYPE_GROUPS.values() for t in members]
    + ["Creature — Merfolk"]
)


def test_every_group_word_reads_as_its_members():
    """A new TYPE_GROUPS entry is tested by being added."""
    for group, members in TYPE_GROUPS.items():
        plural = next(f for f in plural_forms(group) if f.endswith("s") and f != group)
        cares, _ = extract(f"Other {plural} you control get +1/+1.", "X", GROUP_VOCAB)
        assert cares == members, group
        assert group not in GROUP_VOCAB.types


def test_sea_monster_card_reads_past_its_reminder_text():
    text = (
        "All Sea Monsters you cast have emerge. The emerge cost is equal to the mana cost. "
        "(You may sacrifice a creature to reduce the emerge cost of spells that are Krakens, "
        "Leviathans, Octopuses, Serpents, or Whales by that creature's mana value.)"
    )
    cares, _ = extract(text, "X", GROUP_VOCAB)
    assert cares == TYPE_GROUPS["Sea Monster"]


def test_outlaw_is_lowercase_and_its_hate_is_not_a_payoff():
    """Outlaws are printed lowercase; "non-outlaw" is removal, not a payoff."""
    cares, _ = extract(
        "Whenever you cast an outlaw spell, copy that spell. "
        "(Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)",
        "Double Down",
        GROUP_VOCAB,
    )
    assert cares == TYPE_GROUPS["outlaw"]
    cares, _ = extract("Destroy target non-outlaw creature.", "Shoot the Sheriff", GROUP_VOCAB)
    assert cares == set()


def test_a_group_member_body_is_only_its_own_type():
    assert own_types("Creature — Whale", GROUP_VOCAB) == {"Whale"}
