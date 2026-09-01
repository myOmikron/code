"""Pool query parsing and compilation. Pure — no database."""

from __future__ import annotations

import pytest

from deck_lab.poolquery import (
    MAX_QUERY_LENGTH,
    MAX_TERMS,
    PoolFilter,
    PoolQueryError,
    parse_pool_query,
)


def test_empty_and_whitespace_mean_no_restriction():
    """An empty input box is the resting state, not a mistake."""
    for text in ("", "   ", "\n\t"):
        result = parse_pool_query(text)
        assert result.predicate == ""
        assert result.params == {}
        assert result.query is None


def test_max_price_rides_along_without_a_query():
    assert parse_pool_query("", max_price=5.0) == PoolFilter(max_price=5.0)


def test_price_comparison_compiles_to_the_priced_property():
    result = parse_pool_query("eur<5")
    assert result.predicate == "c.price_eur < $pq_0"
    assert result.params == {"pq_0": 5.0}


def test_colon_means_equals_on_numeric_fields():
    result = parse_pool_query("mv:3")
    assert result.predicate == "c.cmc = $pq_0"
    assert result.params == {"pq_0": 3.0}


def test_text_fields_match_case_insensitively_as_substrings():
    result = parse_pool_query("t:creature")
    assert result.predicate == "toLower(c.type_line) CONTAINS toLower($pq_0)"
    assert result.params == {"pq_0": "creature"}


def test_bare_words_and_quoted_strings_search_the_name():
    result = parse_pool_query('"sol ring"')
    assert result.predicate == "toLower(c.name) CONTAINS toLower($pq_0)"
    assert result.params == {"pq_0": "sol ring"}


def test_quoted_value_after_the_operator():
    result = parse_pool_query('o:"draw a card"')
    assert result.params == {"pq_0": "draw a card"}
    assert "oracle_text" in result.predicate


def test_juxtaposition_is_and():
    result = parse_pool_query("t:creature eur<5")
    assert result.predicate == (
        "(toLower(c.type_line) CONTAINS toLower($pq_0) AND c.price_eur < $pq_1)"
    )


def test_a_literal_and_is_accepted_and_skipped():
    """Someone typing "and" means the juxtaposition they already have."""
    with_word = parse_pool_query("t:creature and eur<5")
    without = parse_pool_query("t:creature eur<5")
    assert with_word.predicate == without.predicate


def test_or_and_parentheses_group():
    result = parse_pool_query("(t:creature or t:artifact) eur<5")
    assert result.predicate == (
        "((toLower(c.type_line) CONTAINS toLower($pq_0)"
        " OR toLower(c.type_line) CONTAINS toLower($pq_1))"
        " AND c.price_eur < $pq_2)"
    )


def test_minus_negates():
    result = parse_pool_query("-t:land")
    assert result.predicate == "NOT (toLower(c.type_line) CONTAINS toLower($pq_0))"


def test_year_compares_the_dates_first_four_characters():
    result = parse_pool_query("year>=2020")
    assert result.predicate == "substring(c.released_at, 0, 4) >= $pq_0"
    assert result.params == {"pq_0": "2020"}


def test_year_requires_four_digits():
    with pytest.raises(PoolQueryError, match="four-digit year"):
        parse_pool_query("year>=20")


def test_set_codes_are_lowercased_and_exact():
    result = parse_pool_query("set:ONE")
    assert result.predicate == "c.set_code = $pq_0"
    assert result.params == {"pq_0": "one"}


def test_rarity_values_are_validated():
    assert parse_pool_query("r:mythic").params == {"pq_0": "mythic"}
    with pytest.raises(PoolQueryError, match="unknown r value"):
        parse_pool_query("r:legendary")


def test_is_flags_come_from_a_fixed_map():
    result = parse_pool_query("is:commander")
    assert result.predicate == "coalesce(c.can_be_commander, false)"
    assert result.params == {}
    with pytest.raises(PoolQueryError, match="unknown is: value"):
        parse_pool_query("is:banana")


def test_banned_formats_are_validated():
    assert parse_pool_query("banned:modern").predicate == "$pq_0 IN c.banned_in"
    with pytest.raises(PoolQueryError, match="unknown banned value"):
        parse_pool_query("banned:commander")


def test_keywords_match_a_list_element_exactly():
    result = parse_pool_query("kw:flying")
    assert result.predicate == "any(k IN c.keywords WHERE toLower(k) = toLower($pq_0))"


def test_comparison_operators_are_refused_where_they_mean_nothing():
    with pytest.raises(PoolQueryError, match="does not support"):
        parse_pool_query("t>creature")


def test_unknown_fields_are_dropped_not_a_name_search():
    """A query pasted from Scryfall (`order:edhrec`, `legal:commander`) must
    keep working with the terms the graph can answer — and silently searching
    names for "order:edhrec" would be worse than either."""
    result = parse_pool_query("order:edhrec eur<5")
    assert result.predicate == "c.price_eur < $pq_0"
    assert result.params == {"pq_0": 5.0}


def test_a_query_of_only_unknown_fields_is_no_restriction():
    result = parse_pool_query("order:edhrec legal:commander")
    assert result.predicate == ""
    assert result.params == {}


def test_dropped_terms_vanish_from_negation_and_or():
    """`NOT (dropped)` would exclude everything and `x OR dropped` would match
    everything — the branch disappears instead."""
    negated = parse_pool_query("-order:edhrec t:creature")
    assert negated.predicate == "toLower(c.type_line) CONTAINS toLower($pq_0)"

    either = parse_pool_query("t:creature or order:edhrec")
    assert either.predicate == "toLower(c.type_line) CONTAINS toLower($pq_0)"

    grouped = parse_pool_query("(order:edhrec) eur<5")
    assert grouped.predicate == "c.price_eur < $pq_0"


def test_errors_carry_the_position_of_the_fault():
    with pytest.raises(PoolQueryError) as excinfo:
        parse_pool_query("eur<5 year>=20")
    assert excinfo.value.position == 6


def test_unclosed_quote_and_paren_are_reported():
    with pytest.raises(PoolQueryError, match="unclosed quote"):
        parse_pool_query('o:"draw a card')
    with pytest.raises(PoolQueryError, match="unclosed '\\('"):
        parse_pool_query("(t:creature")
    with pytest.raises(PoolQueryError, match="unmatched '\\)'"):
        parse_pool_query("t:creature)")


def test_missing_values_are_an_error():
    with pytest.raises(PoolQueryError, match="missing its value"):
        parse_pool_query("t:")
    with pytest.raises(PoolQueryError, match="not a number"):
        parse_pool_query("eur<cheap")


def test_the_query_length_and_term_count_are_bounded():
    with pytest.raises(PoolQueryError, match="longer than"):
        parse_pool_query("x" * (MAX_QUERY_LENGTH + 1))
    with pytest.raises(PoolQueryError, match="terms"):
        parse_pool_query(" ".join(["t:a"] * (MAX_TERMS + 1)))


def test_no_user_value_is_interpolated_into_the_predicate():
    """Everything the caller supplies must arrive as a parameter — the same
    contract search.py holds. A value that names a real field is still a
    value: it was typed where a value goes."""
    hostile = "x) OR 1=1 //"
    result = parse_pool_query(f'o:"{hostile}"')
    assert hostile not in result.predicate
    assert result.params == {"pq_0": hostile}


def test_hyphens_inside_words_are_not_negation():
    result = parse_pool_query("lim-dul")
    assert result.predicate == "toLower(c.name) CONTAINS toLower($pq_0)"
    assert result.params == {"pq_0": "lim-dul"}


def test_negative_numbers_survive_the_word_tokenizer():
    result = parse_pool_query("pow>=-1")
    assert result.params == {"pq_0": -1.0}


def test_param_names_never_collide_with_the_hard_filters():
    """`_filter_params` merges these into a dict that already holds `deck`,
    `identity` and `max_price` — the pq_ prefix is the collision guard."""
    result = parse_pool_query("t:a o:b c d")
    assert all(name.startswith("pq_") for name in result.params)
    assert len(result.params) == 4
