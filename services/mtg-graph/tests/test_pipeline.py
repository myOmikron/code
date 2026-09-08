"""Pipeline ordering.

The order of the semantic build is load-bearing and silently wrong when
permuted — reordering `structural` before `rules` reintroduces
fetchlands-as-ramp, and nothing else asserts against it. These tests are the
only thing standing between a plausible-looking reorder and a wrong graph.
"""

from __future__ import annotations

import re

from deck_lab.graph import STRUCTURAL_CORRECTIONS, TYPAL_BRIDGE_CORRECTIONS
from deck_lab.pipeline import Step, build_steps, run_build

EXPECTED_ORDER = [
    "clear",
    "tagger",
    "rules",
    "hierarchy",
    "structural",
    "typal",
    "typal_bridge",
    "themes",
    "payoff",
]


def _names() -> list[str]:
    return [step.name for step in build_steps()]


def test_pipeline_order_is_exact():
    assert _names() == EXPECTED_ORDER


def test_clear_runs_first():
    """MERGE is additive; anything before the clear would be wiped."""
    assert _names()[0] == "clear"


def test_payoff_runs_last():
    """Payoff only fires on cards with no other role, so any later step
    that adds a role would change its input after the fact."""
    assert _names()[-1] == "payoff"


def test_structural_runs_after_rules():
    """Structural corrections delete ramp roles that inference put on lands.
    Running them first means a rule re-adds the role afterwards."""
    names = _names()
    assert names.index("structural") > names.index("rules")


def test_rules_run_after_tagger():
    """FILLS_ROLE takes the max, so a rule can raise a weight Tagger set lower
    — but only if it runs second."""
    names = _names()
    assert names.index("rules") > names.index("tagger")


def test_hierarchy_precedes_anything_that_traverses_it():
    names = _names()
    assert names.index("hierarchy") < names.index("payoff")


def test_themes_run_after_everything_that_feeds_them():
    """Theme fit is scored over the finished resource layer, typal included."""
    names = _names()
    assert names.index("themes") > names.index("typal")
    assert names.index("themes") > names.index("rules")


def test_typal_bridge_sits_between_typal_and_themes():
    """It reads the IS_TYPE edges typal just wrote, and themes scores over the
    resource layer it produces — running it anywhere else reintroduces the
    first-build-vs-rebuild divergence this step exists to close."""
    names = _names()
    assert names.index("typal") < names.index("typal_bridge") < names.index("themes")


def test_every_step_documents_why_it_sits_where_it_does():
    for step in build_steps():
        assert step.why.strip(), step.name


def test_step_names_are_unique():
    names = _names()
    assert len(set(names)) == len(names)


def test_run_build_executes_in_order():
    calls: list[str] = []
    steps = [
        Step("first", lambda: calls.append("first"), "why"),
        Step("second", lambda: calls.append("second"), "why"),
    ]

    run_build(steps)

    assert calls == ["first", "second"]


def test_run_build_returns_each_step_result():
    steps = [Step("a", lambda: 1, "why"), Step("b", lambda: 2, "why")]
    assert run_build(steps) == {"a": 1, "b": 2}


# --- static guard: structural steps may not read later steps' edges -------
#
# The bug class this guards against: `creatures_supply_typal` used to live in
# STRUCTURAL_CORRECTIONS, matching `(c)-[:IS_TYPE]->(:CreatureType)` — an edge
# the `typal` step (which runs *after* `structural`) had not written yet on a
# fresh ingest. The first build after `clear` therefore produced zero
# `tribal_payoff` producers; only a second build (typal edges now present)
# looked correct, and every test passed because none exercised a first build.
# Moving the rule into TYPAL_BRIDGE_CORRECTIONS (after `typal`, before
# `themes`) fixed it, but nothing stopped a *future* structural entry from
# reintroducing the same class of bug — that is what these tests are for.

# Relations/labels written by steps that run after `structural`:
# IS_TYPE/CARES_ABOUT_TYPE/MAKES_TYPE/:CreatureType by `typal`, FITS_THEME/
# :Theme by `themes`. FILLS_ROLE is legitimately written *and* read within
# structural corrections (`lands_are_not_ramp` reads it) and must stay allowed.
FORBIDDEN_IN_STRUCTURAL = [
    re.compile(r"\bIS_TYPE\b"),
    re.compile(r"\bCARES_ABOUT_TYPE\b"),
    re.compile(r"\bMAKES_TYPE\b"),
    re.compile(r"\bFITS_THEME\b"),
    re.compile(r":CreatureType\b"),
    re.compile(r":Theme\b"),
]

# typal_bridge runs after `typal` (so IS_TYPE/CreatureType are fair game — the
# one entry here reads exactly those) but before `themes`.
FORBIDDEN_IN_TYPAL_BRIDGE = [
    re.compile(r"\bFITS_THEME\b"),
    re.compile(r":Theme\b"),
]


def test_structural_corrections_do_not_read_typal_or_theme_edges():
    """Guards the `creatures_supply_typal` first-build divergence (see the
    module comment above): a structural correction may not match a relation
    or label that only `typal` or `themes` — both later steps — ever write."""
    for name, query in STRUCTURAL_CORRECTIONS:
        for pattern in FORBIDDEN_IN_STRUCTURAL:
            assert not pattern.search(query), f"{name} references {pattern.pattern}"


def test_typal_bridge_corrections_do_not_read_theme_edges():
    """typal_bridge sits before `themes`, so it may not read FITS_THEME/:Theme
    — the same bug class one step later in the pipeline."""
    for name, query in TYPAL_BRIDGE_CORRECTIONS:
        for pattern in FORBIDDEN_IN_TYPAL_BRIDGE:
            assert not pattern.search(query), f"{name} references {pattern.pattern}"


def test_gated_grants_lose_their_evasion_supply():
    """Barbarian Class's menace is dice-gated, Way of the Thief's
    unblockability needs a Gate — composition conditions the offering deck
    cannot assume. The regexes must catch exactly those shapes and leave
    play-pattern conditions (a leveled anthem, an attacks-alone rider)
    alone, so they are exercised here against the real oracle texts."""
    import re

    name, query = next(
        (n, q) for n, q in STRUCTURAL_CORRECTIONS if n == "gated_grants_are_not_evasion_supply"
    )
    for resource in ("evasion", "combat_damage_trigger"):
        assert resource in query, f"{name} no longer strips {resource}"

    dice = re.compile(
        r"(?si).*whenever you roll [^.]{0,80}?"
        r"(menace|flying|shadow|fear|intimidate|can.t be blocked).*"
    )
    gate = re.compile(r"(?si).*can.t be blocked as long as you control.*")
    assert dice.match(
        "{1}{R}: Level 2\n"
        "Whenever you roll one or more dice, target creature you control "
        "gets +2/+0 and gains menace until end of turn."
    )
    assert gate.match(
        "Enchant creature\nEnchanted creature gets +2/+2.\n"
        "Enchanted creature can't be blocked as long as you control a Gate."
    )
    # A level cost is an equip cost: the grant itself is unconditional.
    assert not dice.match("{1}{U}{B}: Level 2\nCreatures you control have menace.")
    # Attacks-alone is a play-pattern choice, not deck composition.
    assert not dice.match(
        "Whenever a creature you control attacks alone, "
        "it gains first strike and menace until end of turn."
    )
    assert not gate.match("During your turn, equipped creature has hexproof and can't be blocked.")


def test_symmetric_permanent_dumps_lose_their_ramp_edges():
    """Braids, Conjurer Adept read `landfall 0.84` and `stompy 0.57`.

    Tagger tags her `land-ramp` and `sneak-creature` because her ability does
    put lands and creatures onto the battlefield — for *each player*. Ramp
    everyone gets is not your ramp, the mirror of `self_facing_tax_is_not_a_tax`.
    Scoped to `show-and-tell` (8 cards), never `symmetrical` (832, mostly
    wraths and wheels) or `group-hug` (401, whose closure holds removal).
    """
    name, query = next(
        (n, q) for n, q in STRUCTURAL_CORRECTIONS if n == "symmetric_permanent_dumps_are_not_ramp"
    )
    assert "show-and-tell" in query
    assert "symmetrical" not in query and "group-hug" not in query
    for resource in ("land_ramp", "extra_land_drop", "landfall_trigger", "high_power"):
        assert resource in query, f"{name} no longer strips {resource}"


# --- cycling is replacement, not advantage -------------------------------

# The Cypher's two tests, mirrored so the classification is exercised against
# real oracle texts rather than only asserted to be present in the query.
_CYCLING_LINE = re.compile(r"(?is)^[a-z ]{0,24}cycling ?[{—-]")
_DRAWS_ON_CYCLE = re.compile(r"(?is)^cycling ?[{—-]")


def _cycling_only_draw(oracle_text: str) -> bool:
    """True when the card draws on cycling and nowhere else — the demotion set."""
    lines = oracle_text.split("\n")
    if not any(_DRAWS_ON_CYCLE.match(line) for line in lines):
        return False
    stripped = oracle_text.replace("(Do this before you draw.)", "").split("\n")
    return not any("draw" in line.lower() and not _CYCLING_LINE.match(line) for line in stripped)


def test_cycling_only_draw_is_demoted_but_not_deleted():
    """Barren Moor read `card_advantage 0.9` — Divination's weight — because
    Tagger tags every cycler `pure-draw`. Cycling costs the card it draws, so
    it fills a fraction of a draw slot, not a whole one; the rule lowers the
    weight and leaves `PRODUCES card_draw` alone, because a cycled card really
    is drawn.
    """
    name, query = next(
        (n, q) for n, q in STRUCTURAL_CORRECTIONS if n == "cycling_is_not_card_advantage"
    )
    assert "card_advantage" in query
    assert "SET f.weight = 0.2" in query, f"{name} no longer demotes to the residual"
    # The produces side is factually right and must survive.
    assert "PRODUCES" not in query and "DELETE" not in query

    # Cycling lands and cycling spells: the whole draw claim is the cycling.
    assert _cycling_only_draw(
        "This land enters tapped.\n{T}: Add {B}.\n"
        "Cycling {B} ({B}, Discard this card: Draw a card.)"
    )
    assert _cycling_only_draw(
        "Flash\nWhen this enchantment enters, exile target nonland permanent an "
        "opponent controls until this enchantment leaves the battlefield.\n"
        "Cycling {W} ({W}, Discard this card: Draw a card.)"
    )
    # Cost variants are still cycling — an em dash instead of a mana cost.
    assert _cycling_only_draw(
        "Swampwalk (This creature can't be blocked as long as defending player "
        "controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this "
        "card: Draw a card.)"
    )
    # "(Do this before you draw.)" is a reminder on the *trigger* line; without
    # stripping it, Krosan Tusker and Shefet Monitor read as real draw spells.
    assert _cycling_only_draw(
        "Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\n"
        "When you cycle this card, you may search your library for a basic land "
        "card, reveal that card, put it into your hand, then shuffle. "
        "(Do this before you draw.)"
    )

    # A card that draws on its own keeps its weight.
    assert not _cycling_only_draw(
        "Draw three cards.\nIslandcycling {1}{U} ({1}{U}, Discard this card: "
        "Search your library for an Island card, reveal it, put it into your "
        "hand, then shuffle.)"
    )
    assert not _cycling_only_draw(
        "Whenever a creature you control deals combat damage to a player, you "
        "may draw a card.\nCycling {2} ({2}, Discard this card: Draw a card.)"
    )
    # Landcycling and typecycling never draw at all: Tagger files them under
    # `tutor`, and the rule leaves them to it.
    assert not _cycling_only_draw(
        "{B}: Regenerate this creature.\nSwampcycling {2} ({2}, Discard this "
        "card: Search your library for a Swamp card, reveal it, put it into "
        "your hand, then shuffle.)"
    )


# --- narrow removal is not full spot removal ------------------------------


def _narrow_removal_correction() -> str:
    return next(
        q for n, q in STRUCTURAL_CORRECTIONS if n == "narrow_removal_is_not_full_spot_removal"
    )


def test_narrow_removal_correction_is_registered():
    names = [name for name, _ in STRUCTURAL_CORRECTIONS]
    assert "narrow_removal_is_not_full_spot_removal" in names


def test_narrow_removal_correction_lowers_only():
    """Cankerbloom and Untimely Malfunction read `spot_removal` 1.0 — the same
    weight as a card that can answer anything on the board — because Tagger
    tags artifact/enchantment-only removal `spot-removal` directly, a sibling
    of `removal-artifact` rather than its parent, and `_LINK_ROLE` keeps the
    stronger of the two. `tag_mapping.py`'s own value for `removal-artifact`
    is 0.7, so that is the floor this correction lowers to — never lower,
    and never higher than a card already sat at."""
    query = _narrow_removal_correction()

    assert "SET f.weight = 0.7" in query
    assert "f.weight > 0.7" in query, "must only touch cards above the floor it sets"
    assert "DELETE" not in query
    assert "PRODUCES" not in query


def test_narrow_removal_correction_reads_only_the_role_and_tag_layer():
    """A card that also bounces or fights a creature is not narrow removal —
    this correction reads the tag closure, not the resource layer, to decide
    that."""
    query = _narrow_removal_correction()

    for relation in ("TAGGED", "PARENT_OF", "FILLS_ROLE"):
        assert relation in query
    for relation in ("PRODUCES", "CARES_ABOUT", "IS_TYPE"):
        assert relation not in query


def _bracket_lists(query: str) -> list[list[str]]:
    """Every `IN [...]` slug list in the query, in source order."""
    return [re.findall(r"'([^']+)'", block) for block in re.findall(r"IN \[([^\]]*)\]", query)]


def test_narrow_and_broad_slug_lists_are_disjoint_and_nonempty():
    """The two lists are read straight from the tag graph's own children of
    `removal`/`spot-removal` (see the correction's comment) — this guards
    against a slug drifting into both, which would make the guard vacuous
    for any card carrying it."""
    query = _narrow_removal_correction()
    lists = _bracket_lists(query)

    assert len(lists) == 2, "expected exactly one narrow list and one broad list"
    narrow, broad = (set(entries) for entries in lists)

    assert narrow, "narrow slug list must not be empty"
    assert broad, "broad slug list must not be empty"
    assert narrow.isdisjoint(broad), narrow & broad


def test_narrow_removal_slugs_stay_within_the_artifact_enchantment_subtree():
    """Regression guard for the actual defect: `removal-artifact` and
    `removal-enchantment` — the two tags `tag_mapping.py` means this weight
    for — must be in the narrow list, and the target-type-specific broad
    tags named in the correction's comment (creature, planeswalker, land,
    permanent, bounce) must not be."""
    query = _narrow_removal_correction()
    narrow, broad = (set(entries) for entries in _bracket_lists(query))

    assert {"removal-artifact", "removal-enchantment"} <= narrow
    assert {
        "removal-creature",
        "removal-planeswalker",
        "removal-land",
        "removal-permanent",
        "removal-bounce",
    } <= broad
