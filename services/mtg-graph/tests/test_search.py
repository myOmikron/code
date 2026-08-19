"""Search query construction. Pure — no database."""

from __future__ import annotations

from deck_lab.search import SORTS, SearchQuery, build_cypher, lucene_query


def test_empty_query_is_recognised():
    assert SearchQuery().is_empty()
    assert not SearchQuery(produces=["treasure"]).is_empty()


def test_resource_filter_traverses_the_hierarchy():
    """Asking for artifact_matters must find Treasure producers without naming
    Treasure — that is what BROADER is for."""
    cypher, params = build_cypher(SearchQuery(produces=["artifact_matters"]))

    assert "[:PRODUCES]->(:Resource)-[:BROADER*0..]->" in cypher
    assert params["produces_names"] == ["artifact_matters"]


def test_filters_combine_as_and():
    cypher, _ = build_cypher(SearchQuery(produces=["treasure"], roles=["ramp_other"]))

    assert cypher.count("MATCH (c)-") == 2
    assert " AND " in cypher


def test_values_within_a_filter_are_parameterised_as_a_list():
    _, params = build_cypher(SearchQuery(roles=["tutor", "recursion"]))
    assert params["role_names"] == ["tutor", "recursion"]


def test_identity_is_a_subset_not_an_exact_match():
    """The Commander rule: a mono-blue card is legal in a Simic deck."""
    cypher, _ = build_cypher(SearchQuery(identity=["G", "U"]))
    assert "all(sym IN c.color_identity WHERE sym IN $identity)" in cypher


def test_no_user_value_is_interpolated_into_the_query():
    """Everything the caller supplies must arrive as a parameter."""
    hostile = "x' OR 1=1 //"
    cypher, params = build_cypher(
        SearchQuery(text=hostile, themes=[hostile], creature_types=[hostile])
    )

    assert hostile not in cypher
    assert params["theme_ids"] == [hostile]
    # The text arrives as a Lucene query rather than verbatim, and `OR` has
    # been disarmed — as an operator it is a parse error, not an injection,
    # but the search still has to answer.
    assert params["text"] == "+x +or +1 +1*"


def test_unknown_sort_falls_back_to_the_default():
    cypher, _ = build_cypher(SearchQuery(sort="; DROP DATABASE"))
    assert SORTS["playability"] in cypher
    assert "DROP" not in cypher


def test_limit_is_clamped():
    _, params = build_cypher(SearchQuery(limit=100_000))
    assert params["limit"] == 200

    _, params = build_cypher(SearchQuery(limit=0))
    assert params["limit"] == 1


def test_the_three_type_axes_are_distinct():
    cypher, _ = build_cypher(
        SearchQuery(creature_types=["Crab"], makes_types=["Goblin"], cares_about_types=["Elf"])
    )

    assert "[:IS_TYPE]" in cypher
    assert "[:MAKES_TYPE]" in cypher
    assert "[:CARES_ABOUT_TYPE]" in cypher


def test_game_changer_filter_can_exclude_as_well_as_include():
    include, params_in = build_cypher(SearchQuery(game_changers=True))
    exclude, params_out = build_cypher(SearchQuery(game_changers=False))

    assert params_in["game_changers"] is True
    assert params_out["game_changers"] is False
    assert "c.game_changer" in include and "c.game_changer" in exclude


def test_no_filters_still_produces_valid_cypher():
    cypher, params = build_cypher(SearchQuery())

    assert cypher.startswith("MATCH (c:Card)")
    assert "RETURN" in cypher
    assert params["limit"] == 40


def test_text_seeds_the_query_from_the_index_rather_than_filtering_a_scan():
    """`toLower(c.name) CONTAINS` cannot use an index, so it scanned all 32k
    Card nodes on every keystroke. The full-text call has to come first — a
    procedure call cannot follow the MATCH clauses that depend on it."""
    cypher, params = build_cypher(SearchQuery(text="sol", produces=["treasure"]))

    assert cypher.startswith("CALL db.index.fulltext.queryNodes($index, $text)")
    assert "CONTAINS toLower" not in cypher
    assert params["index"] == "card_text"


def test_the_last_word_is_a_prefix_because_the_box_is_a_type_ahead():
    assert lucene_query("sol ri") == "+sol +ri*"
    assert lucene_query("sol") == "+sol*"


def test_a_lone_single_character_is_not_wildcarded():
    """`s*` matches most of the corpus. With words in front to anchor it the
    wildcard is cheap, and "Order of S" is someone mid-word."""
    assert lucene_query("s") == "+s"
    assert lucene_query("order of s") == "+order +of +s*"


def test_punctuation_is_dropped_rather_than_escaped():
    """Escaping made these queries legal and unanswerable: the index was
    written through an analyser that dropped the punctuation, so an escaped
    `Ratonhnhaké\\:ton` is a literal nothing in the index can match."""
    assert lucene_query("El-Hajjâj") == "+El +Hajjâj*"
    assert lucene_query('Kongming, "Sleeping Dragon"') == "+Kongming +Sleeping +Dragon*"
    # Someone typing a card name means the hyphen literally, not as NOT.
    assert lucene_query("sol -ring") == "+sol +ring*"


def test_joiners_the_analyser_keeps_inside_a_token_survive():
    """All four of the original round-trip failures were this."""
    assert lucene_query("M.O.D.O.K., Evil Intellect") == "+M.O.D.O.K +Evil +Intellect*"
    assert lucene_query("Borrowing 100,000 Arrows") == "+Borrowing +100,000 +Arrows*"
    assert lucene_query("Urza's Saga") == "+Urza's +Saga*"


def test_lucene_keywords_are_disarmed_by_case():
    """A backslash does not disarm them; `+OR +x` is a parse error."""
    assert lucene_query("a OR b") == "+a +or +b*"
    assert lucene_query("NOT") == "+not*"


def test_text_that_has_no_terms_matches_nothing_rather_than_everything():
    """Dropping the filter would answer a search for "~~~" with the top 40
    cards in the game."""
    assert lucene_query("~~~") is None

    cypher, params = build_cypher(SearchQuery(text="~~~"))
    assert "false" in cypher
    assert "text" not in params


def test_name_hits_rank_above_rules_text_hits():
    """Ordering by the index's relevance score would be conventional, but score
    is continuous — it would leave `sort=price` with nothing left to order."""
    cypher, params = build_cypher(SearchQuery(text="sol", sort="price"))

    assert "name_match DESC" in cypher
    assert cypher.index("name_match DESC") < cypher.index(SORTS["price"])
    assert params["text_words"] == ["sol"]


def test_the_name_match_words_are_tokenised_like_the_index():
    """Otherwise the ranking asks whether "hans," appears in a name the
    analyser stored as "hans"."""
    _, params = build_cypher(SearchQuery(text="Ach! Hans, Run!"))
    assert params["text_words"] == ["ach", "hans", "run"]


def test_the_limit_applies_before_the_projection():
    cypher, _ = build_cypher(SearchQuery(text="sol"))
    assert cypher.index("LIMIT $limit") < cypher.index("RETURN c.oracle_id")
