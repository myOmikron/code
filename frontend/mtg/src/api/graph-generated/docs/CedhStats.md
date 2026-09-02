
# CedhStats

The consistency-math counts a competitive player already works out by hand (Task D, cEDH Pro round) — `None` on `Diagnostics.cedh_stats` below bracket 5, additive, every other field on `Diagnostics` unaffected.  `fast_mana_count` is the union of `Resource.FAST_MANA` and `Resource.RITUAL_MANA` producers — what a cEDH player means by \"fast mana\" includes Dark Ritual (see the comment at the computation); `free_spell_count` is `Resource.FREE_SPELL`\'s own producer count — the same headcount `ResourceBalance.produced` already reports for every resource, read here off the same `balance` data rather than recomputed. `tutor_count` is `Role.TUTOR`\'s fractional weight (`tutor-to`, the reach-but-don\'t-quite tag, scores 0.8 — see `tag_mapping.py`), the same number `Diagnostics.roles[\"tutor\"]` already carries. `mean_mana_value` repeats `Diagnostics.average_mv` — same computation, same value — so a cEDH consumer reads every consistency number off this one block instead of reaching back into the shape report for one of them.  `land_count`/`tapped_land_count`/`untapped_land_count` are exact, quantity-weighted card counts (see `tapped_land_counts` for the D3 extraction); only `tutor_count` genuinely carries a fraction.

## Properties

Name | Type
------------ | -------------
`fast_mana_count` | number
`tutor_count` | number
`free_spell_count` | number
`mean_mana_value` | number
`land_count` | number
`untapped_land_count` | number
`tapped_land_count` | number


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


