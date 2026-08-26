"""Diagnostics assembly. Pure arithmetic — no database involved."""

from __future__ import annotations

import pytest

from deck_lab.composition import OVER_TARGET_COST, TargetOverride, template_for
from deck_lab.diagnostics import build_diagnostics
from deck_lab.themes import ThemeEvidence
from deck_lab.vocabulary import Bucket


def _card(name, cmc, *, land=False, qty=1):
    return {
        "oracle_id": name,
        "name": name,
        "cmc": cmc,
        "type_line": "Land" if land else "Creature",
        "is_land": land,
        "color_identity": [],
        "price_usd": None,
        "qty": qty,
    }


def _card_roles(*entries):
    """Build the per-card role rows `build_diagnostics` expects."""
    return [{"oracle_id": oid, "roles": roles, "qty": qty} for oid, roles, qty in entries]


def _report(cards, roles=None, balance=None, card_roles=None, **kwargs):
    default = [{"oracle_id": c["oracle_id"], "roles": {}, "qty": c["qty"]} for c in cards]
    return build_diagnostics(
        cards,
        roles or {},
        balance or {},
        card_roles if card_roles is not None else default,
        **kwargs,
    )


def test_counts_deck_size_and_lands_by_quantity():
    report = _report([_card("Forest", 0, land=True, qty=9), _card("Bear", 2)])

    assert report.deck_size == 10
    assert report.lands == 9


def test_average_mv_excludes_lands():
    """Lands would drag the average toward zero and misreport the curve."""
    report = _report([_card("Forest", 0, land=True, qty=10), _card("Bear", 4)])

    assert report.average_mv == 4.0


def test_average_mv_is_none_without_spells():
    assert _report([_card("Forest", 0, land=True, qty=5)]).average_mv is None


def test_curve_buckets_six_plus_together():
    cards = [_card("Big", 9), _card("Bigger", 12)]
    report = _report(cards)

    assert next(p for p in report.curve if p.mv == 6).count == 2


def test_curve_targets_scale_to_spell_count():
    cards = [_card(f"c{i}", 2) for i in range(20)]
    report = _report(cards)

    assert sum(p.target for p in report.curve) == pytest.approx(20, abs=0.1)


def test_a_curve_override_moves_the_reported_targets():
    cards = [_card(f"c{i}", 1) for i in range(10)]
    shaped = _report(cards, template=template_for(0.5, None, {1: 1.0}))

    assert next(p for p in shaped.curve if p.mv == 1).target == pytest.approx(10)
    assert next(p for p in shaped.curve if p.mv == 3).target == 0.0


def test_the_report_carries_the_preset_beside_the_edited_target():
    cards = [_card(f"c{i}", 2) for i in range(10)]
    edited = template_for(0.5, {Bucket.RAMP: TargetOverride(low=20, high=24)}, {2: 1.0})
    report = _report(cards, template=edited, defaults=template_for(0.5))

    ramp = next(b for b in report.buckets if b.bucket == "ramp")
    assert (ramp.low, ramp.high) == (20, 24)
    assert (ramp.default_low, ramp.default_high) == (
        pytest.approx(template_for(0.5).buckets[Bucket.RAMP].low, abs=0.1),
        pytest.approx(template_for(0.5).buckets[Bucket.RAMP].high, abs=0.1),
    )
    two = next(p for p in report.curve if p.mv == 2)
    assert two.target == pytest.approx(10)
    assert two.default_target < two.target


def test_without_a_preset_the_template_is_its_own_default():
    report = _report([_card("c", 2)])
    ramp = next(b for b in report.buckets if b.bucket == "ramp")

    assert (ramp.default_low, ramp.default_high) == (ramp.low, ramp.high)


def test_theme_shares_carry_the_cards_behind_them():
    evidence = ThemeEvidence(cards={"landfall": 12}, themed=14, total=99)
    report = _report(
        [_card("c", 1)],
        theme_profile={"landfall": 0.6, "tokens": 0.4},
        theme_evidence=evidence,
    )

    assert {t.theme: t.cards for t in report.themes} == {"landfall": 12, "tokens": 0}
    assert report.themed_cards == 14


def test_a_report_without_evidence_claims_no_cards():
    # The default for every caller that does not measure it — build_diagnostics
    # is reachable from the CLI and from tests — and it must read as "unknown",
    # never as "a hundred cards agree".
    report = _report([_card("c", 1)], theme_profile={"landfall": 1.0})

    assert report.themed_cards == 0
    assert report.themes[0].cards == 0


def test_bucket_status_flags_low_and_high():
    report = _report([_card("Forest", 0, land=True, qty=5)], speed=0.0)
    statuses = {b.bucket: b.status for b in report.buckets}

    assert statuses["mana_sources"] == "low"


def test_balance_sorts_biggest_gap_first():
    balance = {
        "artifact_matters": {"produced": 3, "wanted": 9},
        "lifegain": {"produced": 1, "wanted": 2},
        "treasure": {"produced": 5, "wanted": 0},
    }
    report = _report([_card("Bear", 2)], balance=balance)

    assert report.balance[0].resource == "artifact_matters"
    assert report.balance[0].gap == 6
    assert report.balance[-1].resource == "treasure"


def test_balance_drops_resources_with_no_signal():
    balance = {"noise": {"produced": 0, "wanted": 0}, "real": {"produced": 1, "wanted": 0}}
    report = _report([_card("Bear", 2)], balance=balance)

    assert [row.resource for row in report.balance] == ["real"]


def test_balance_rows_carry_the_cards_behind_the_counts():
    balance = {
        "treasure": {
            "produced": 2,
            "wanted": 1,
            "produced_cards": ["Dockside Extortionist", "Smothering Tithe"],
            "wanted_cards": ["Goblin Engineer"],
        },
    }
    row = _report([_card("Bear", 2)], balance=balance).balance[0]

    assert row.produced_cards == ["Dockside Extortionist", "Smothering Tithe"]
    assert row.wanted_cards == ["Goblin Engineer"]


def test_balance_rows_default_to_no_cards_when_the_caller_omits_them():
    """Every other test in this file builds `balance` by hand without the new
    keys — a stale caller must still get empty lists, not a KeyError."""
    balance = {"treasure": {"produced": 1, "wanted": 0}}
    row = _report([_card("Bear", 2)], balance=balance).balance[0]

    assert row.produced_cards == []
    assert row.wanted_cards == []


def test_unknown_role_names_are_ignored():
    """A stale edge must not take diagnostics down."""
    report = _report([_card("Bear", 2)], card_roles=_card_roles(("Bear", {"not_a_role": 1.0}, 1)))

    assert all(b.coverage == 0.0 for b in report.buckets)


def test_speed_changes_the_verdict_not_the_deck():
    """Same list, different template — the shape penalty should move."""
    cards = [_card("Forest", 0, land=True, qty=36)] + [_card(f"s{i}", 2) for i in range(63)]
    card_roles = _card_roles(("Forest", {"land": 1.0}, 36)) + _card_roles(
        *((f"s{i}", {}, 1) for i in range(63))
    )

    slow = _report(cards, card_roles=card_roles, template=template_for(0.0))
    fast = _report(cards, card_roles=card_roles, template=template_for(1.0))

    assert slow.penalty != fast.penalty


# --- the type axis --------------------------------------------------------


def _typed_template(**targets):
    from deck_lab.composition import BucketTarget, apply_type_targets

    return apply_type_targets(
        template_for(0.5),
        {name: BucketTarget(*spec) for name, spec in targets.items()},
    )


def test_type_rows_flag_low_and_high():
    template = _typed_template(Creature=(23, 35, 0.35), Instant=(7, 11, 0.35))
    cards = [_card(f"c{i}", 2) for i in range(40)]  # _card's type_line is Creature

    report = _report(cards, template=template)
    rows = {row.type: row for row in report.types}

    assert rows["Creature"].status == "high"
    assert rows["Creature"].count == 40
    assert rows["Creature"].deviation == 5.0
    assert rows["Instant"].status == "low"


def test_type_penalty_joins_the_shape_penalty():
    bare = _report([_card(f"c{i}", 2) for i in range(40)])
    typed = _report(
        [_card(f"c{i}", 2) for i in range(40)],
        template=_typed_template(Creature=(23, 35, 0.5)),
    )

    # abs, because the report rounds each penalty it stores and the two
    # roundings need not agree in the last place.
    assert typed.penalty == pytest.approx(bare.penalty + 0.5 * OVER_TARGET_COST * 5.0, abs=0.01)
    assert bare.types == []


def test_type_source_is_stamped_on_the_report():
    report = _report([_card("Bear", 2)], type_source="edhrec:muldrotha-the-gravetide/spellslinger")

    assert report.type_source == "edhrec:muldrotha-the-gravetide/spellslinger"


def test_land_row_informs_without_fining():
    """Land's weight is zero by construction — the mana_sources bucket owns
    land count, and two penalties on one measure is one signal counted twice."""
    template = _typed_template(Land=(30, 38, 0.0))
    cards = [_card("Forest", 0, land=True, qty=45)]

    report = _report(cards, template=template)
    bare = _report(cards)

    [row] = report.types
    assert row.status == "high"
    assert report.penalty == bare.penalty


def test_commander_supply_counts_for_more_than_one_card():
    """A resource the commander makes is reachable, and the gap says so.

    The commander is in the command zone every game where a singleton in the
    99 is roughly an eleven-in-ninety-nine chance by turn five, so a deck whose
    commander mills is not as short of self-mill as counting cards suggests.
    The reported counts stay physical; only the gap carries the reliability.
    """
    from deck_lab.diagnostics import COMMANDER_SUPPLY
    from deck_lab.vocabulary import Resource

    cards = [_card("commander", 4), _card("other", 2)]
    balance = {"self_mill": {"produced": 1, "wanted": 6}}

    plain = _report(cards, balance=balance)
    assert plain.balance[0].gap == 5
    assert plain.balance[0].from_commander is False

    anchored = _report(
        cards,
        balance=balance,
        commander_resources=({Resource.SELF_MILL}, set()),
    )
    row = anchored.balance[0]
    # The counts are untouched — they say how many cards, and that is still one.
    assert (row.produced, row.wanted) == (1, 6)
    assert row.gap == 5 - (COMMANDER_SUPPLY - 1)
    assert row.from_commander is True


def test_a_resource_the_commander_does_not_make_is_unaffected():
    from deck_lab.vocabulary import Resource

    cards = [_card("commander", 4)]
    balance = {"card_draw": {"produced": 1, "wanted": 6}}

    row = _report(
        cards,
        balance=balance,
        commander_resources=({Resource.SELF_MILL}, set()),
    ).balance[0]

    assert row.gap == 5
    assert row.from_commander is False


# --- multi-commander anchoring ---------------------------------------------
# `diagnose()` anchors both profiles on the *union* across every effective
# commander — a WU+RG partner pair anchors both halves of its strategy — while
# type targets stay keyed on the primary alone (each target set is one page's
# empirical distribution; a union of distributions would be invented data).
# These tests stub the graph reads `diagnose()` makes.


def _stub_diagnose_graph(monkeypatch, *, resources, names=None):
    from deck_lab import diagnostics as diag
    from deck_lab import graph, type_targets

    names = names or {}

    def fetch_deck(counts):
        return [
            {**_card(names.get(oid, oid), 2, qty=qty), "oracle_id": oid}
            for oid, qty in counts.items()
        ]

    monkeypatch.setattr(graph, "fetch_deck", fetch_deck)
    monkeypatch.setattr(graph, "deck_card_resources", lambda deck: resources)
    monkeypatch.setattr(graph, "deck_card_roles", lambda deck: [])
    monkeypatch.setattr(graph, "deck_card_types", lambda deck: [])
    monkeypatch.setattr(graph, "deck_resource_balance", lambda deck: {})
    monkeypatch.setattr(graph, "deck_role_weights", lambda deck: {})
    monkeypatch.setattr(diag, "resource_idf", lambda: {})
    monkeypatch.setattr(diag, "typal_density", lambda: {})

    resolved: dict = {}

    def resolve(commander_name, profile, *, speed, allow_fetch=False, scale=1.0):
        resolved["commander_name"] = commander_name
        return {}, f"commander:{commander_name}" if commander_name else "default"

    monkeypatch.setattr(type_targets, "resolve_type_targets", resolve)
    return resolved


def test_a_theme_only_the_second_commander_fits_gets_the_anchor(monkeypatch):
    """Union anchoring: the landfall payoff the primary cannot claim is the
    partner's whole strategy, and the deck's landfall share must rise for it.
    The zero-floor survives — the anchor only scales themes with deck cards."""
    from deck_lab.diagnostics import DeckEntry, diagnose

    resources = {
        "payoff": {"produces": set(), "cares_about": {"landfall_trigger"}},
        "sac": {"produces": set(), "cares_about": {"death_trigger"}},
        "cmdr": {"produces": set(), "cares_about": set()},
        "partner": {"produces": set(), "cares_about": {"landfall_trigger"}},
    }
    _stub_diagnose_graph(monkeypatch, resources=resources)
    entries = [DeckEntry(oracle_id="payoff", qty=1), DeckEntry(oracle_id="sac", qty=1)]

    def landfall_share(report):
        return next((t.share for t in report.themes if t.theme == "landfall"), 0.0)

    alone = diagnose(entries, commander_oracle_id="cmdr")
    unioned = diagnose(entries, commander_oracle_id="cmdr", commander_oracle_ids=["partner"])

    assert landfall_share(alone) > 0.0
    assert landfall_share(unioned) > landfall_share(alone)


def test_commander_anchored_when_only_the_extra_resolves(monkeypatch):
    """A primary the graph cannot anchor must not un-anchor the report when a
    co-commander resolves — any seat's anchor counts."""
    from deck_lab.diagnostics import DeckEntry, diagnose

    resources = {
        "card": {"produces": set(), "cares_about": {"death_trigger"}},
        "partner": {"produces": {"treasure"}, "cares_about": set()},
    }
    _stub_diagnose_graph(monkeypatch, resources=resources)
    entries = [DeckEntry(oracle_id="card", qty=1)]

    bare = diagnose(entries, commander_oracle_id="cmdr")
    anchored = diagnose(entries, commander_oracle_id="cmdr", commander_oracle_ids=["partner"])

    assert bare.commander_anchored is False
    assert anchored.commander_anchored is True


def test_type_targets_stay_keyed_on_the_primary_commander(monkeypatch):
    """Deliberate: `resolve_type_targets` sees the primary's name only, and
    `type_source` keeps naming that page even with a second commander."""
    from deck_lab.diagnostics import DeckEntry, diagnose

    resources = {
        "cmdr": {"produces": set(), "cares_about": set()},
        "partner": {"produces": set(), "cares_about": set()},
    }
    resolved = _stub_diagnose_graph(
        monkeypatch,
        resources=resources,
        names={"cmdr": "Primary Name", "partner": "Partner Name"},
    )
    entries = [DeckEntry(oracle_id="card", qty=1)]

    report = diagnose(entries, commander_oracle_id="cmdr", commander_oracle_ids=["partner"])

    assert resolved["commander_name"] == "Primary Name"
    assert report.type_source == "commander:Primary Name"


# --- Rule 0 deck sizes ------------------------------------------------------
# The request's target size scales every quota by deck_size/99; the response's
# own `deck_size` keeps meaning the observed count.


def _stub_default_targets(monkeypatch, resources):
    """The diagnose stubs, but with the *real* default-tier type targets, so
    the scale threads through `targets_from_counts` end to end."""
    from deck_lab import type_targets

    _stub_diagnose_graph(monkeypatch, resources=resources)

    def resolve(commander_name, profile, *, speed, allow_fetch=False, scale=1.0):
        from deck_lab.type_targets import DEFAULT_TYPE_COUNTS, targets_from_counts

        return targets_from_counts(DEFAULT_TYPE_COUNTS, speed=speed, scale=scale), "default"

    monkeypatch.setattr(type_targets, "resolve_type_targets", resolve)


def test_deck_size_99_and_omitted_are_identical(monkeypatch):
    """The golden path: at 99 — stated or defaulted — no target anywhere
    moves, and the whole report serialises identically."""
    from deck_lab.diagnostics import DeckEntry, diagnose

    resources = {"card": {"produces": set(), "cares_about": {"death_trigger"}}}
    _stub_default_targets(monkeypatch, resources)
    entries = [DeckEntry(oracle_id="card", qty=1)]

    baseline = diagnose(entries, commander_oracle_id="cmdr")
    explicit = diagnose(entries, commander_oracle_id="cmdr", deck_size=99)
    scaled = diagnose(entries, commander_oracle_id="cmdr", deck_size=60)

    assert explicit.model_dump_json() == baseline.model_dump_json()
    assert scaled.model_dump_json() != baseline.model_dump_json()


def test_deck_size_scales_the_reported_targets(monkeypatch):
    """Bucket bounds and type-target means resize by 60/99 — and the observed
    `deck_size` the report states is untouched by the request's target."""
    from deck_lab.diagnostics import DeckEntry, diagnose

    resources = {"card": {"produces": set(), "cares_about": set()}}
    _stub_default_targets(monkeypatch, resources)
    entries = [DeckEntry(oracle_id="card", qty=1)]

    full = diagnose(entries, commander_oracle_id="cmdr")
    scaled = diagnose(entries, commander_oracle_id="cmdr", deck_size=60)

    def sources(report):
        return next(b for b in report.buckets if b.bucket == "mana_sources")

    # abs covers the one-decimal rounding the report applies to each bound.
    assert sources(scaled).low == pytest.approx(sources(full).low * 60 / 99, abs=0.06)
    assert sources(scaled).high == pytest.approx(sources(full).high * 60 / 99, abs=0.06)

    def creature_mean(report):
        row = next(t for t in report.types if t.type == "Creature")
        return (row.low + row.high) / 2

    assert creature_mean(scaled) == pytest.approx(creature_mean(full) * 60 / 99, abs=0.11)

    assert scaled.deck_size == full.deck_size == 1
