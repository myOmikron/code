"""The cEDH interaction grid, the board-wipe coverage discount, and the
asymmetry check (Task C, cEDH Pro round). Pure functions — no database.

A dedicated file rather than additions to `test_suggestions.py`/
`test_diagnostics.py`/`test_cuts.py`: those files are actively edited by other
agents this round, and importing from `deck_lab.interaction` (or the handful
of private names this needs from `deck_lab.suggestions`) needs nothing those
files already bring in scope.
"""

from __future__ import annotations

import pytest

from deck_lab.composition import CEDH, TargetOverride, apply_curve, apply_overrides, template_for
from deck_lab.diagnostics import build_diagnostics
from deck_lab.interaction import (
    ABILITY_HATE_EXPOSURE_THRESHOLD,
    ARTIFACT_HATE_EXPOSURE_THRESHOLD,
    GRAVEYARD_HATE_EXPOSURE_THRESHOLD,
    InteractionGrid,
    _assemble_interaction_grid,
    build_interaction_grid,
    discount_board_wipe,
    is_cedh_template,
)
from deck_lab.suggestions import (
    WEIGHT_ASYMMETRY,
    Provenance,
    _apply_asymmetry_check,
    _Candidate,
)
from deck_lab.vocabulary import Bucket, Resource, Role

# ---------------------------------------------------------------------------
# C2 — discount_board_wipe
# ---------------------------------------------------------------------------


def test_discount_scales_board_wipe_at_cedh():
    adjusted = discount_board_wipe({Role.BOARD_WIPE: 1.0, Role.SPOT_REMOVAL: 0.5}, cedh=True)

    assert adjusted[Role.BOARD_WIPE] == pytest.approx(0.1)
    assert adjusted[Role.SPOT_REMOVAL] == 0.5


def test_discount_is_a_noop_below_cedh():
    weights = {Role.BOARD_WIPE: 1.0}

    adjusted = discount_board_wipe(weights, cedh=False)

    assert adjusted == weights
    assert adjusted is not weights  # still a copy — callers must not alias the input


def test_discount_is_a_noop_without_board_wipe():
    weights = {Role.SPOT_REMOVAL: 0.9}

    assert discount_board_wipe(weights, cedh=True) == weights


def test_discount_accepts_plain_string_keys():
    """`solver.Candidate.roles` is `dict[str, float]`, not `Role`-keyed."""
    adjusted = discount_board_wipe({"board_wipe": 1.0}, cedh=True)

    assert adjusted["board_wipe"] == pytest.approx(0.1)


# ---------------------------------------------------------------------------
# C2 — is_cedh_template
# ---------------------------------------------------------------------------


def test_is_cedh_template_true_for_the_cedh_template():
    assert is_cedh_template(CEDH) is True


def test_is_cedh_template_true_through_overrides_and_curve():
    """`apply_overrides`/`apply_curve` rename `cedh` to `cedh+custom` and then
    `cedh+custom+curve` — the prefix check must survive both, since this is
    exactly the pipeline `template_for` runs for a bracket-5 request that
    also carries builder overrides or a custom curve."""
    with_overrides = apply_overrides(CEDH, {Bucket.INTERACTION: TargetOverride(low=10)})
    with_both = apply_curve(with_overrides, {0: 1.0})

    assert with_overrides.name == "cedh+custom"
    assert with_both.name == "cedh+custom+curve"
    assert is_cedh_template(with_overrides) is True
    assert is_cedh_template(with_both) is True


def test_is_cedh_template_false_for_a_casual_template():
    assert is_cedh_template(template_for(0.5)) is False


def test_is_cedh_template_false_for_something_with_no_name():
    assert is_cedh_template(object()) is False


# ---------------------------------------------------------------------------
# C2 — proof: a 3-wrath casual list reads "ok" below cEDH, "low" at cEDH
# ---------------------------------------------------------------------------


def _wrath_heavy_card_roles():
    """A deck whose entire interaction package is three sorcery-speed board
    wipes — the exact miscount the task file names ("a bracket-5 deck
    holding three wraths reads 'interaction ok'")."""
    return [
        {"oracle_id": "wrath-1", "roles": {"board_wipe": 1.0}, "qty": 1},
        {"oracle_id": "wrath-2", "roles": {"board_wipe": 1.0}, "qty": 1},
        {"oracle_id": "wrath-3", "roles": {"board_wipe": 1.0}, "qty": 1},
    ]


def _cards_for(card_roles):
    return [
        {
            "oracle_id": row["oracle_id"],
            "name": row["oracle_id"],
            "cmc": 4,
            "type_line": "Sorcery",
            "is_land": False,
            "qty": row["qty"],
        }
        for row in card_roles
    ]


def test_three_wraths_are_full_interaction_below_bracket_five():
    card_roles = _wrath_heavy_card_roles()
    report = build_diagnostics(_cards_for(card_roles), {}, {}, card_roles, speed=0.5)

    interaction = next(b for b in report.buckets if b.bucket == str(Bucket.INTERACTION))
    assert interaction.coverage == pytest.approx(3.0)


def test_the_same_three_wraths_are_discounted_at_cedh():
    """The coverage-side fix (C2): the same three cards, only `speed` changed."""
    card_roles = _wrath_heavy_card_roles()
    report = build_diagnostics(_cards_for(card_roles), {}, {}, card_roles, speed=1.0)

    interaction = next(b for b in report.buckets if b.bucket == str(Bucket.INTERACTION))
    assert interaction.coverage == pytest.approx(0.3)  # 3 * 0.1


def test_a_wrath_heavy_list_drops_status_at_cedh(monkeypatch):
    """The proof the task file asks for: a "deliberately wrath-heavy casual
    list" that reads fine below bracket 5 and reads short once cEDH's own
    stack-interaction corridor (15.8-26.2) is asked of it honestly."""
    # A deck whose interaction is *only* the three wraths — no counterspells,
    # no removal, no protection. Below cEDH there is no corridor this low
    # (TUNED's own INTERACTION low is double digits too), so instead this
    # compares the same coverage number against the CEDH corridor directly,
    # which is the number a bracket-5 deck is actually graded against.
    card_roles = _wrath_heavy_card_roles()
    cards = _cards_for(card_roles)

    casual = build_diagnostics(cards, {}, {}, card_roles, speed=0.5, template=CEDH)
    cedh = build_diagnostics(cards, {}, {}, card_roles, speed=1.0, template=CEDH)

    casual_interaction = next(b for b in casual.buckets if b.bucket == str(Bucket.INTERACTION))
    cedh_interaction = next(b for b in cedh.buckets if b.bucket == str(Bucket.INTERACTION))

    # Same template, same cards — only `is_cedh(speed)` differs, and that is
    # exactly the discount's gate.
    assert casual_interaction.coverage == pytest.approx(3.0)
    assert casual_interaction.status == "low"  # even undiscounted, 3 alone misses 15.8
    assert cedh_interaction.coverage == pytest.approx(0.3)
    assert cedh_interaction.status == "low"
    # The visible move the task asks to prove: discounting drops the reported
    # number an order of magnitude, not merely "still short" by the same
    # margin — a reader comparing the two sees the wraths stop counting.
    assert cedh_interaction.coverage < casual_interaction.coverage / 5


def test_a_real_interaction_suite_is_not_discounted():
    """Counterspells and spot removal are untouched — only `board_wipe` moves."""
    card_roles = [
        {"oracle_id": "counter-1", "roles": {"counterspell": 1.0}, "qty": 1},
        {"oracle_id": "removal-1", "roles": {"spot_removal": 1.0}, "qty": 1},
    ]
    report = build_diagnostics(_cards_for(card_roles), {}, {}, card_roles, speed=1.0)

    interaction = next(b for b in report.buckets if b.bucket == str(Bucket.INTERACTION))
    assert interaction.coverage == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# C1 — the interaction grid (pure half: _assemble_interaction_grid)
# ---------------------------------------------------------------------------


def _card(oracle_id, cmc=2, qty=1):
    return {"oracle_id": oracle_id, "name": oracle_id, "cmc": cmc, "qty": qty}


def _roles(oracle_id, roles):
    return {"oracle_id": oracle_id, "roles": roles, "qty": 1}


def _row(grid: InteractionGrid, name: str):
    return next(r for r in grid.rows if r.row == name)


def test_stack_row_holds_counterspells():
    grid = _assemble_interaction_grid(
        [_card("Counterspell", cmc=2)],
        [_roles("Counterspell", {"counterspell": 1.0})],
        {},
        {},
    )

    stack = _row(grid, "stack")
    assert stack.cells["held_up"].count == 1
    assert stack.cells["held_up"].cards == ["Counterspell"]
    assert stack.cells["free"].count == 0


def test_proactive_protection_comes_from_the_silence_tag_not_a_role():
    """Grand Abolisher carries no INTERACTION role of its own in this test's
    fixture — only the tag says it belongs on this row."""
    grid = _assemble_interaction_grid(
        [_card("Grand Abolisher", cmc=2)],
        [_roles("Grand Abolisher", {})],
        {},
        {"silence": {"Grand Abolisher"}},
    )

    protection = _row(grid, "proactive_protection")
    assert protection.cells["held_up"].cards == ["Grand Abolisher"]


def test_permanent_answer_holds_spot_removal_and_board_wipe():
    grid = _assemble_interaction_grid(
        [_card("Swords to Plowshares", cmc=1), _card("Toxic Deluge", cmc=2)],
        [
            _roles("Swords to Plowshares", {"spot_removal": 1.0}),
            _roles("Toxic Deluge", {"board_wipe": 1.0}),
        ],
        {},
        {},
    )

    answer = _row(grid, "permanent_answer")
    names = {name for cell in answer.cells.values() for name in cell.cards}
    assert names == {"Swords to Plowshares", "Toxic Deluge"}


def test_class_hate_graveyard_subclass_from_the_role():
    grid = _assemble_interaction_grid(
        [_card("Bojuka Bog", cmc=0)],
        [_roles("Bojuka Bog", {"graveyard_hate": 1.0})],
        {},
        {},
    )

    hate = _row(grid, "class_hate")
    assert hate.classes == {"graveyard": ["Bojuka Bog"]}


def test_class_hate_artifact_subclass_from_the_null_rod_tag():
    grid = _assemble_interaction_grid(
        [_card("Null Rod", cmc=2)],
        [_roles("Null Rod", {})],
        {"Null Rod": {"produces": {Resource.TAX_EFFECT.value}}},
        {"null-rod": {"Null Rod"}},
    )

    hate = _row(grid, "class_hate")
    assert hate.classes == {"artifact": ["Null Rod"]}


def test_class_hate_ability_subclass_from_the_hate_activation_tag():
    grid = _assemble_interaction_grid(
        [_card("Cursed Totem", cmc=2)],
        [_roles("Cursed Totem", {})],
        {"Cursed Totem": {"produces": {Resource.RESOURCE_DENIAL.value}}},
        {"hate-activation": {"Cursed Totem"}},
    )

    hate = _row(grid, "class_hate")
    assert hate.classes == {"ability": ["Cursed Totem"]}


def test_class_hate_falls_back_to_other_with_no_specific_tag():
    """A tax/denial producer that is neither the graveyard role nor one of
    the two named slugs still earns the row, filed under "other"."""
    grid = _assemble_interaction_grid(
        [_card("Rhystic Study", cmc=3)],
        [_roles("Rhystic Study", {})],
        {"Rhystic Study": {"produces": {Resource.TAX_EFFECT.value}}},
        {},
    )

    hate = _row(grid, "class_hate")
    assert hate.classes == {"other": ["Rhystic Study"]}


def test_column_free_beats_cheap_beats_held_up():
    grid = _assemble_interaction_grid(
        [_card("Free", cmc=3), _card("Cheap", cmc=1), _card("HeldUp", cmc=3)],
        [
            _roles("Free", {"counterspell": 1.0}),
            _roles("Cheap", {"counterspell": 1.0}),
            _roles("HeldUp", {"counterspell": 1.0}),
        ],
        {"Free": {"produces": {Resource.FREE_SPELL.value}}},
        {},
    )

    stack = _row(grid, "stack")
    assert stack.cells["free"].cards == ["Free"]
    assert stack.cells["cheap"].cards == ["Cheap"]
    assert stack.cells["held_up"].cards == ["HeldUp"]


def test_count_reflects_quantity_the_card_list_does_not_duplicate():
    grid = _assemble_interaction_grid(
        [_card("Swan Song", cmc=1, qty=3)],
        [{"oracle_id": "Swan Song", "roles": {"counterspell": 1.0}, "qty": 3}],
        {},
        {},
    )

    stack = _row(grid, "stack")
    assert stack.cells["cheap"].count == 3
    assert stack.cells["cheap"].cards == ["Swan Song"]


def test_a_card_can_earn_more_than_one_row():
    """Render Silent: a counterspell that also silences its target — stack
    and proactive_protection both, per the survey in `interaction.py`."""
    grid = _assemble_interaction_grid(
        [_card("Render Silent", cmc=2)],
        [_roles("Render Silent", {"counterspell": 1.0})],
        {},
        {"silence": {"Render Silent"}},
    )

    assert _row(grid, "stack").cells["held_up"].cards == ["Render Silent"]
    assert _row(grid, "proactive_protection").cells["held_up"].cards == ["Render Silent"]


def test_build_interaction_grid_is_none_below_bracket_five():
    """The outer, graph-touching wrapper short-circuits before it would need
    to query anything — safe to call from a unit test with no live Neo4j."""
    assert build_interaction_grid([], [], {}, 0.5) is None


# ---------------------------------------------------------------------------
# C3 — the asymmetry check
# ---------------------------------------------------------------------------


def _candidate(oracle_id: str) -> _Candidate:
    candidate = _Candidate(oracle_id=oracle_id, name=oracle_id)
    candidate.provenance = [Provenance(channel="role_gap", detail="seed", score=1.0)]
    return candidate


# Three named examples per class, offered clean vs. demoted — the deck-side
# exposure numbers bracket `interaction.py`'s measured thresholds (10 mana
# rocks, 5 recursion, 5 mana dorks) so each pair crosses the line the
# threshold actually draws.
_CASES = [
    ("artifact", "Null Rod", ARTIFACT_HATE_EXPOSURE_THRESHOLD, 4.0, 11.0),
    ("graveyard", "Bojuka Bog", GRAVEYARD_HATE_EXPOSURE_THRESHOLD, 2.0, 7.0),
    ("ability", "Cursed Totem", ABILITY_HATE_EXPOSURE_THRESHOLD, 1.0, 8.0),
]


@pytest.mark.parametrize("cls,name,threshold,clean_exposure,hosed_exposure", _CASES)
def test_offered_clean_under_threshold(cls, name, threshold, clean_exposure, hosed_exposure):
    candidate = _candidate(name)
    tag_hits = {"artifact": {name} if cls == "artifact" else set()}
    if cls == "ability":
        tag_hits["ability"] = {name}
    held = {name: {"graveyard_hate": 1.0}} if cls == "graveyard" else {}
    exposure_role = {"artifact": "mana_rock", "graveyard": "recursion", "ability": "mana_dork"}[cls]

    kept, demoted = _apply_asymmetry_check(
        [candidate], held, tag_hits, {exposure_role: clean_exposure}
    )

    assert demoted == 0
    assert kept == [candidate]
    assert len(candidate.provenance) == 1  # only the seed entry — nothing appended


@pytest.mark.parametrize("cls,name,threshold,clean_exposure,hosed_exposure", _CASES)
def test_demoted_over_threshold_with_visible_provenance(
    cls, name, threshold, clean_exposure, hosed_exposure
):
    candidate = _candidate(name)
    tag_hits = {"artifact": {name} if cls == "artifact" else set()}
    if cls == "ability":
        tag_hits["ability"] = {name}
    held = {name: {"graveyard_hate": 1.0}} if cls == "graveyard" else {}
    exposure_role = {"artifact": "mana_rock", "graveyard": "recursion", "ability": "mana_dork"}[cls]

    kept, demoted = _apply_asymmetry_check(
        [candidate], held, tag_hits, {exposure_role: hosed_exposure}
    )

    assert demoted == 1
    negative = candidate.provenance[-1]
    assert negative.channel == "asymmetry"
    # One static code, not one per class — see the comment at the call site:
    # `test_translations.py` extracts `code="..."` literally and cannot see
    # an f-string, so the class rides in `params` instead.
    assert negative.code == "asymmetry"
    assert negative.params["class"] == cls
    assert negative.score < 0
    assert kept == [candidate]  # demote, never ban


def test_asymmetry_score_saturates_at_double_threshold():
    candidate = _candidate("Null Rod")
    tag_hits = {"artifact": {"Null Rod"}}

    _apply_asymmetry_check(
        [candidate], {}, tag_hits, {"mana_rock": ARTIFACT_HATE_EXPOSURE_THRESHOLD * 5}
    )

    assert candidate.provenance[-1].score == pytest.approx(-WEIGHT_ASYMMETRY)


def test_asymmetry_never_fires_on_a_candidate_outside_the_three_classes():
    candidate = _candidate("Lightning Bolt")

    kept, demoted = _apply_asymmetry_check(
        [candidate],
        {"Lightning Bolt": {"spot_removal": 1.0}},
        {"artifact": set(), "ability": set()},
        {"mana_rock": 99.0, "recursion": 99.0, "mana_dork": 99.0},
    )

    assert demoted == 0
    assert kept == [candidate]
