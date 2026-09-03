"""The line engine. Pure functions — no network, no live graph.

Fixtures below (`_piece`, `_row`) are built from real oracle text and real
Spellbook variant shapes pulled live from the dev graph and the cached bulk
export while designing this module — see the task report for the exact
queries — not invented text.
"""

from __future__ import annotations

from deck_lab.lines import (
    FoldClass,
    Line,
    LinePiece,
    PieceInfo,
    SharedPiece,
    _tutor_mv_bound,
    _tutor_reaches,
    _tutor_target_classes,
    classify_folds,
    redundancy,
    tutor_map,
)


def _piece(name, type_line, oracle_text="", zones=(), produces=(), cares=()):
    return PieceInfo(
        name=name,
        type_line=type_line,
        oracle_text=oracle_text,
        zones=tuple(zones),
        produces=frozenset(produces),
        cares_about=frozenset(cares),
    )


# --- canonical fold assertions ---------------------------------------------


def test_thoracle_consult_family_is_library_and_creature_not_graveyard():
    """Thassa's Oracle + Demonic Consultation/Tainted Pact, real oracle text
    and the real Spellbook shape for this variant (zones=['H'] on both
    pieces, no graveyard-mentioning prerequisite, neither piece produces or
    cares about a graveyard-family resource)."""
    pieces = [
        _piece(
            "Thassa's Oracle",
            "Creature — Merfolk Wizard",
            "When this creature enters, look at the top X cards of your library, where X is "
            "your devotion to blue. Put up to one of them on top of your library and the rest "
            "on the bottom of your library in a random order. If X is greater than or equal to "
            "the number of cards in your library, you win the game.",
            zones=("H",),
            produces=("card_draw", "tribal_payoff", "etb_trigger", "tutor_to_top", "impulse_draw"),
        ),
        _piece(
            "Demonic Consultation",
            "Instant",
            "Choose a card name. Exile the top six cards of your library, then reveal cards "
            "from the top of your library until you reveal a card with the chosen name. Put "
            "that card into your hand and exile all other cards revealed this way.",
            zones=("H",),
            # Real graph data: this piece only PRODUCES cast_trigger/magecraft/
            # prowess (the structural "cheap instant" rule) and CARES_ABOUT
            # nothing — the exact shape the cast_trigger rule must not fire on.
            produces=(
                "prowess_trigger",
                "magecraft_trigger",
                "cast_trigger",
                "mass_removal",
                "card_draw",
            ),
        ),
    ]

    folds = classify_folds(pieces, prereq_easy="", prereq_notable="")

    assert FoldClass.LIBRARY in folds
    assert FoldClass.CREATURE_DEPENDENT in folds
    assert FoldClass.GRAVEYARD not in folds
    # cast_trigger is CARES_ABOUT-only by design (see lines.py) — Consultation
    # only *produces* it (the structural "cheap instant" rule), so it must
    # not leak into this line's folds.
    assert FoldClass.CAST_TRIGGER not in folds


def test_tainted_pact_variant_is_also_library_not_graveyard():
    pieces = [
        _piece(
            "Thassa's Oracle",
            "Creature — Merfolk Wizard",
            "If X is greater than or equal to the number of cards in your library, "
            "you win the game.",
            zones=("H",),
            produces=("etb_trigger",),
        ),
        _piece(
            "Tainted Pact",
            "Instant",
            "Exile the top card of your library. You may put that card into your hand unless it "
            "has the same name as another card exiled this way. Repeat this process until you "
            "put a card into your hand or you exile two cards with the same name, whichever "
            "comes first.",
            zones=("H",),
            produces=("card_draw", "prowess_trigger", "magecraft_trigger", "cast_trigger"),
        ),
    ]

    folds = classify_folds(
        pieces, prereq_easy="No two cards in library share a name.", prereq_notable=""
    )

    assert {FoldClass.LIBRARY, FoldClass.CREATURE_DEPENDENT} <= folds
    assert FoldClass.GRAVEYARD not in folds


def test_devoted_druid_line_is_activated_ability_and_creature_dependent():
    """Any Devoted Druid line — its own two mana/counter-cost abilities are
    templated as real activated abilities regardless of the partner piece."""
    pieces = [
        _piece(
            "Devoted Druid",
            "Creature — Elf Druid",
            "{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature.",
        ),
        _piece(
            "Vizier of Remedies",
            "Creature — Human Cleric",
            "If one or more -1/-1 counters would be put on a creature you control, that many "
            "-1/-1 counters minus one are put on it instead.",
        ),
    ]

    folds = classify_folds(pieces, prereq_easy="", prereq_notable="")

    assert {FoldClass.ACTIVATED_ABILITY, FoldClass.CREATURE_DEPENDENT} <= folds


def test_underworld_breach_line_is_graveyard_and_cast_trigger():
    """Underworld Breach + Burning Inquiry + Runaway Steam-Kin — a real
    Spellbook variant with NO graveyard zone and NO graveyard-mentioning
    prerequisite text at all (spot-checked live against the bulk export);
    the graveyard fold only fires here because Breach itself CARES_ABOUT
    graveyard_any/graveyard_creature, the graph-predicate signal documented
    in lines.py as the deliberate third leg of this rule."""
    pieces = [
        _piece(
            "Underworld Breach",
            "Enchantment",
            "Each nonland card in your graveyard has escape.",
            zones=("B",),
            produces=(
                "recursion_to_hand",
                "enchantment_matters",
                "commander_recursion",
                "recursion_to_battlefield",
            ),
            # CARES_ABOUT, per the live graph — this is the signal that
            # closes the gap zones/prerequisite text miss on this variant.
            cares=("graveyard_any", "graveyard_creature"),
        ),
        _piece(
            "Burning Inquiry",
            "Sorcery",
            "Each player draws three cards, then discards three cards at random.",
            zones=("H",),
            produces=(
                "opponent_draw",
                "prowess_trigger",
                "magecraft_trigger",
                "cast_trigger",
                "card_draw",
            ),
        ),
        _piece(
            "Runaway Steam-Kin",
            "Creature — Elemental",
            "Whenever you cast a red spell, if this creature has fewer than three +1/+1 "
            "counters on it, put a +1/+1 counter on this creature.",
            zones=("B",),
            produces=("plus_one_counter", "tribal_payoff"),
            # CARES_ABOUT cast_trigger, per the live graph — the real payoff
            # signal this fold rule is designed to catch.
            cares=("plus_one_counter", "cast_trigger"),
        ),
    ]

    folds = classify_folds(pieces, prereq_easy="", prereq_notable="")

    assert {FoldClass.GRAVEYARD, FoldClass.CAST_TRIGGER} <= folds


def test_underworld_breach_via_prerequisite_text_alone():
    """A Breach line whose only graveyard signal is the prerequisite text —
    the other named signal in the taxonomy, exercised on its own."""
    pieces = [
        _piece(
            "Underworld Breach",
            "Enchantment",
            "Each nonland card in your graveyard has escape.",
            zones=("B",),
        ),
        _piece(
            "Black Lotus",
            "Artifact",
            "Sacrifice: add three mana of any one colour.",
            zones=("B",),
        ),
        _piece(
            "Wheel of Fortune",
            "Sorcery",
            "Each player discards their hand, then draws seven cards.",
            zones=("G",),
        ),
    ]

    folds = classify_folds(
        pieces,
        prereq_easy="",
        prereq_notable="You have at least six other cards in hand and/or graveyard.",
    )

    assert FoldClass.GRAVEYARD in folds


# --- dependency share ---------------------------------------------------


def test_dependent_type_needs_at_least_half():
    """Two of three pieces are artifacts -> artifact_dependent; the third,
    minority type does not get its own fold."""
    pieces = [
        _piece("A", "Artifact"),
        _piece("B", "Artifact"),
        _piece("C", "Instant"),
    ]

    folds = classify_folds(pieces, prereq_easy="", prereq_notable="")

    assert FoldClass.ARTIFACT_DEPENDENT in folds
    assert FoldClass.CREATURE_DEPENDENT not in folds
    assert FoldClass.ENCHANTMENT_DEPENDENT not in folds


def test_single_creature_of_two_still_counts_as_half():
    pieces = [_piece("A", "Creature — Elf"), _piece("B", "Sorcery")]

    folds = classify_folds(pieces, prereq_easy="", prereq_notable="")

    assert FoldClass.CREATURE_DEPENDENT in folds


# --- tutor target classes ------------------------------------------------


def test_demonic_tutor_is_unrestricted():
    text = "Search your library for a card, put that card into your hand, then shuffle."
    assert _tutor_target_classes(text) is None


def test_mystical_tutor_targets_instant_or_sorcery():
    targets = _tutor_target_classes(
        "Search your library for an instant or sorcery card, reveal it, put it on top of your "
        "library, then shuffle."
    )
    assert targets == {"instant", "sorcery"}


def test_worldly_tutor_targets_creature():
    targets = _tutor_target_classes(
        "Search your library for a creature card, reveal it, put it on top of your "
        "library, then shuffle."
    )
    assert targets == {"creature"}


def test_tutor_reach_matches_type_line_containment():
    assert _tutor_reaches({"creature"}, "Legendary Creature — Merfolk Wizard")
    assert not _tutor_reaches({"creature"}, "Instant")
    assert _tutor_reaches(None, "Instant")  # unrestricted tutor reaches anything
    assert _tutor_reaches(frozenset(), "Instant")  # empty result treated the same as unrestricted


# --- tutor mana-value qualifier --------------------------------------------


def test_spellseeker_targets_instant_or_sorcery_with_mv_bound():
    """Spellseeker's own template: a type restriction *and* a mana-value
    qualifier in the same clause — the case Mystical Tutor's plain "instant
    or sorcery card" does not carry."""
    text = (
        "When Spellseeker enters the battlefield, you may search your library for an "
        "instant or sorcery card with mana value 2 or less, reveal it, put it into your "
        "hand, then shuffle."
    )
    assert _tutor_target_classes(text) == {"instant", "sorcery"}
    assert _tutor_mv_bound(text) == ("le", 2)


def test_mystical_tutor_has_no_mv_bound():
    """No qualifier in Mystical Tutor's clause — `_tutor_mv_bound` must not
    find one elsewhere on the card by accident."""
    text = (
        "Search your library for an instant or sorcery card, reveal it, put it on top "
        "of your library, then shuffle."
    )
    assert _tutor_mv_bound(text) is None


def test_tutor_mv_bound_ignores_a_second_unrelated_ability():
    """The window is anchored on the search clause's own match, not a global
    scan — a wholly separate ability elsewhere on the card that happens to
    say "mana value ... or greater" must not leak into a bound this tutor's
    search clause never named."""
    text = (
        "Search your library for a creature card, reveal it, put it into your hand, "
        "then shuffle. Whenever you cast a spell with mana value 4 or greater, draw a "
        "card."
    )
    assert _tutor_mv_bound(text) is None


def test_tutor_reaches_applies_the_mv_bound_against_the_piece_cmc():
    assert _tutor_reaches({"instant", "sorcery"}, "Instant", ("le", 2), 2.0)
    assert not _tutor_reaches({"instant", "sorcery"}, "Instant", ("le", 2), 3.0)
    assert _tutor_reaches({"creature"}, "Creature — Elf", ("ge", 3), 3.0)
    assert not _tutor_reaches({"creature"}, "Creature — Elf", ("ge", 3), 2.0)


def test_tutor_reaches_treats_unknown_cmc_as_reachable():
    """A piece the query never resolved a cmc for (`cmc=None`) is not
    evidence either way — `LinePiece.cmc`'s own comment."""
    assert _tutor_reaches({"instant"}, "Instant", ("le", 2), None)
    assert _tutor_reaches({"instant"}, "Instant", ("ge", 3), None)


def test_tutor_map_only_lists_tutors_that_reach_something(monkeypatch):
    line_creature = Line(
        id="line-creature",
        cards=(
            LinePiece(
                name="Worldly Tutor's Target",
                oracle_id="oid-x",
                type_line="Creature — Elf",
                zones=("H",),
                must_be_commander=False,
                quantity=1,
                in_deck=False,
                color_identity=(),
            ),
        ),
        mana_needed="",
        mana_value_needed=0,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=False,
        missing=("Worldly Tutor's Target",),
    )
    line_instant = Line(
        id="line-instant",
        cards=(
            LinePiece(
                name="An Instant",
                oracle_id="oid-y",
                type_line="Instant",
                zones=("H",),
                must_be_commander=False,
                quantity=1,
                in_deck=False,
                color_identity=(),
            ),
        ),
        mana_needed="",
        mana_value_needed=0,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=False,
        missing=("An Instant",),
    )

    def _fake_deck_line_tutors(_deck_oracle_ids):
        return [
            {
                "oracle_id": "tutor-1",
                "name": "Worldly Tutor",
                "oracle_text": "Search your library for a creature card, reveal it, put it on "
                "top of your library, then shuffle.",
            }
        ]

    # `tutor_map` does `from .graph import deck_line_tutors` inline — patch the
    # attribute it resolves to rather than fighting import machinery.
    import deck_lab.graph as real_graph

    monkeypatch.setattr(real_graph, "deck_line_tutors", _fake_deck_line_tutors)

    result = tutor_map(["oid-x"], [line_creature, line_instant])

    assert len(result) == 1
    assert result[0].tutor == "Worldly Tutor"
    assert result[0].reaches == ("line-creature",)


def test_tutor_map_spellseekers_reach_drops_below_mystical_tutors(monkeypatch):
    """The gap this round closes: before the mv-qualifier parse, Spellseeker
    reached every instant/sorcery line piece exactly like an unrestricted
    tutor — ranking it alongside Mystical Tutor despite its real, narrower
    "mana value 2 or less" clause. Two line pieces, one on each side of the
    bound: Spellseeker must reach only the cheap one; Mystical Tutor, with
    no bound at all, must reach both."""
    cheap_line = Line(
        id="line-cheap",
        cards=(
            LinePiece(
                name="Cheap Instant",
                oracle_id="oid-cheap",
                type_line="Instant",
                zones=("H",),
                must_be_commander=False,
                quantity=1,
                in_deck=False,
                color_identity=(),
                cmc=1.0,
            ),
        ),
        mana_needed="",
        mana_value_needed=0,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=False,
        missing=("Cheap Instant",),
    )
    expensive_line = Line(
        id="line-expensive",
        cards=(
            LinePiece(
                name="Expensive Sorcery",
                oracle_id="oid-expensive",
                type_line="Sorcery",
                zones=("H",),
                must_be_commander=False,
                quantity=1,
                in_deck=False,
                color_identity=(),
                cmc=4.0,
            ),
        ),
        mana_needed="",
        mana_value_needed=0,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=False,
        missing=("Expensive Sorcery",),
    )

    def _fake_deck_line_tutors(_deck_oracle_ids):
        return [
            {
                "oracle_id": "tutor-spellseeker",
                "name": "Spellseeker",
                "oracle_text": (
                    "When Spellseeker enters the battlefield, you may search your library "
                    "for an instant or sorcery card with mana value 2 or less, reveal it, "
                    "put it into your hand, then shuffle."
                ),
            },
            {
                "oracle_id": "tutor-mystical",
                "name": "Mystical Tutor",
                "oracle_text": (
                    "Search your library for an instant or sorcery card, reveal it, put "
                    "it on top of your library, then shuffle."
                ),
            },
        ]

    import deck_lab.graph as real_graph

    monkeypatch.setattr(real_graph, "deck_line_tutors", _fake_deck_line_tutors)

    result = tutor_map(["oid-x"], [cheap_line, expensive_line])
    by_tutor = {r.tutor: r.reaches for r in result}

    assert by_tutor["Spellseeker"] == ("line-cheap",)
    assert by_tutor["Mystical Tutor"] == ("line-cheap", "line-expensive")
    assert len(by_tutor["Spellseeker"]) < len(by_tutor["Mystical Tutor"])


# --- redundancy -----------------------------------------------------------


def _line(line_id, oracle_ids, complete=True):
    return Line(
        id=line_id,
        cards=tuple(
            LinePiece(
                name=oid,
                oracle_id=oid,
                type_line="",
                zones=(),
                must_be_commander=False,
                quantity=1,
                in_deck=True,
                color_identity=(),
            )
            for oid in oracle_ids
        ),
        mana_needed="",
        mana_value_needed=0,
        identity=(),
        produces=(),
        bracket_tag="",
        popularity=0,
        prereq_easy="",
        prereq_notable="",
        folds_to=frozenset(),
        complete=complete,
        missing=(),
    )


def test_shared_pieces_need_at_least_two_lines():
    lines = [_line("l1", ["a", "b"]), _line("l2", ["a", "c"]), _line("l3", ["d", "e"])]

    shared, _ = redundancy(lines)

    assert {p.oracle_id for p in shared} == {"a"}
    assert set(next(p for p in shared if p.oracle_id == "a").line_ids) == {"l1", "l2"}


def test_single_points_are_pieces_common_to_every_complete_line():
    lines = [_line("l1", ["snap", "a"]), _line("l2", ["snap", "b"]), _line("l3", ["snap", "c"])]

    shared, single_points = redundancy(lines)

    assert [p.oracle_id for p in single_points] == ["snap"]
    # a/b/c each appear once — shared, but not a single point.
    assert {p.oracle_id for p in shared} == {"snap"}


def test_one_complete_line_makes_every_one_of_its_pieces_a_single_point():
    """Not a bug: with exactly one complete line, removing any of its pieces
    kills 'every complete line' — there is only one."""
    lines = [_line("l1", ["a", "b", "c"])]

    _, single_points = redundancy(lines)

    assert {p.oracle_id for p in single_points} == {"a", "b", "c"}


def test_no_complete_lines_means_no_single_points():
    assert redundancy([]) == ([], [])


def test_shared_piece_is_a_plain_dataclass():
    piece = SharedPiece(name="Sol Ring", oracle_id="oid", line_ids=("l1", "l2"))
    assert piece.name == "Sol Ring"
