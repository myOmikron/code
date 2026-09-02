"""cEDH profile derivation — `archetype_profiles`'s discipline, applied to
tier 0's pool.

`CEDH_TYPE_COUNTS` (`type_targets.py`, tier 0's fallback) starts `None`: the
tier reads a commander's own `/cedh` subpage first, but falls all the way to
tier 1's theme/tribe ladder whenever that page is thin, absent, or
unreadable, with no pooled cross-commander number to catch a bracket-5 deck
in between. This module is that number's derivation, kept rather than
thrown away — the same answer `archetype_profiles.py` gave tier 2.5's
`ARCHETYPE_TYPE_COUNTS` after `DEFAULT_TYPE_COUNTS`'s own derivation script
was lost and nobody could re-run it.

The pipeline mirrors `archetype_profiles.py`'s three functions, but cannot
share its code, because the `/cedh` page cannot be found the way a theme
subpage is found:

- `cedh_corpus` ranks commanders by `bracket_counts["5"]`, the deck's own
  claim to bracket 5 — not by a taglink count, because `cedh` never appears
  in `panels.taglinks` (`edhrec.CEDH_TAG_SLUG`'s docstring: zero hits across
  all 670 cached pages). It reads only the flat commander pages
  `warm-edhrec` already cached, exactly as `tag_corpus` does, and drops
  anyone below `type_targets.CEDH_MIN_DECKS` (150) — the identical floor
  tier 0 gates the live subpage fetch on.
- `measure_cedh` fetches (cache-first) the top-K commanders' `/cedh`
  subpages and pools three things, all weighted by each commander's own
  bracket-5 deck count: the page's own stated type distribution (feeding
  `CEDH_TYPE_COUNTS`), its mana curve (feeding the `CEDH` `DeckTemplate`
  Task C still owes), and the bucket coverage of a *synthetic* average
  decklist built from the page's per-card inclusion rates — the one
  quantity EDHREC does not publish directly, and the reason this module is
  worth writing rather than a three-line copy of `measure_tag`. Every
  synthetic deck also produces a validation row: its own primary-type shape
  compared against the same page's stated type counts, so a bucket number
  built on an unfaithful inference says so instead of being trusted blind.
- `render_constants` prints a paste-ready `CEDH_TYPE_COUNTS` block plus the
  curve, the bucket corridors, their dispersions, and the validation table.
  It prints only — `type_targets.py` and `composition.py` receive these
  numbers as a reviewed diff from someone else's task (Task C wires the
  `CEDH` template; see CEDH-PLAN.md's addendum for the trap in
  `shift_mana_sources` that a naive read of the Land row walks into).

`measure_cedh` is a third sanctioned bulk walk of EDHREC's unofficial API,
beside `warm_top_commanders` and `archetype_profiles.measure_tag` — see the
doctrine header in `edhrec.py`. Operator-run (`measure-cedh`), never called
from a request path.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING

import structlog

from .composition import TUNED, Bucket, bucket_coverage_from_cards, type_counts_from_cards
from .config import settings
from .type_targets import CEDH_MIN_DECKS, DEFAULT_TYPE_COUNTS, PRIMARY_TYPES, ArchetypeProfile

if TYPE_CHECKING:
    from .edhrec import TypeCounts

log = structlog.get_logger(__name__)

# How many of the best-sampled (by bracket-5 deck count) commanders to fetch
# `/cedh` subpages for. Forty is not a round-number guess: it is exactly how
# many commanders in this dev corpus clear `CEDH_MIN_DECKS` (150), and the
# reviewer's own addendum measurement (CEDH-PLAN.md) pooled precisely that
# set — so the default reproduces their numbers with zero network calls
# against the warmed cache, and a future run against a bigger corpus grows
# past 40 automatically the next time this constant is raised.
MEASURE_TOP_K = 40

# Mirrors `archetype_profiles.MIN_COMMANDERS`/`MIN_DECKS` exactly, restated
# here rather than imported because the two floors are about different
# corpora (an archetype's commander pool against the format's), not the same
# number reused. The reasoning still transfers: a profile pooled from one or
# two commanders is one deck's flavour, not a format's, and 1,000 decks is
# small next to bracket 5's true population but past what a handful of thin
# pairings could produce by chance.
MIN_COMMANDERS = 3
MIN_DECKS = 1000

# Every pooled quantity here is expressed per this many cards — matching
# `ArchetypeProfile.counts`'s "per-99 means" contract and `DeckTemplate`'s
# "Target shape for a 99-card deck" (composition.py). The commander sits
# outside the count, exactly as everywhere else in this codebase.
DECK_SIZE = 99

# How much of a synthetic 99-card decklist must resolve against the graph
# before its bucket coverage is trusted enough to pool. A judgment call, not
# a measurement — nothing in this corpus has come close to tripping it (see
# the validation table `measure_cedh` returns), so 0.5 is a guard against a
# parse gone wrong or a stale cache, not a bound real data approaches. If it
# starts firing on a real run, the fix is finding out *why* names are not
# resolving — a naming drift between EDHREC and Scryfall, most likely — not
# raising the floor to make the symptom go away.
MIN_RESOLVED_FRACTION = 0.5

# The placeholder that fills a synthetic decklist's basic-land count
# (`payload["basic"]`). Any basic land carries `Role.LAND` at weight 1.0
# through the structural correction "every land is a mana source"
# (`graph.STRUCTURAL_CORRECTIONS`, `lands_fill_land_role`) and files as
# primary type Land regardless of colour (`composition.primary_type`), so
# Plains stands in for whichever basics a real deck would run — the `/cedh`
# page carries a basic *count*, not a colour breakdown, so there is nothing
# to pick a real one from.
_BASIC_LAND_NAME = "Plains"


@dataclass(frozen=True, slots=True)
class SyntheticDeckValidation:
    """One commander's synthetic-deck sanity check.

    The synthetic decklist `_synthetic_average_deck` builds is an inference,
    not a real average decklist EDHREC publishes — this is the receipt that
    the inference reproduces what the page *does* publish, before its bucket
    coverage is pooled into anything. `deltas` is synthetic-minus-stated,
    per `type_targets.PRIMARY_TYPES`, both sides already rescaled to
    per-`DECK_SIZE` — `composition.primary_type` files the synthetic side
    exactly the way the rest of the system counts a real decklist, so a
    delta here is the same kind of number `TypeReport.deviation` would show
    on one. Empty when resolution failed outright (`resolved == 0`): there
    is no synthetic shape to compare in that case.
    """

    slug: str
    decks: int  # this commander's bracket-5 count — its weight in every pool
    requested: int  # cards asked for: DECK_SIZE minus the page's own basic count
    resolved: int  # of those, how many the graph could match by name
    deltas: dict[str, float]


@dataclass(frozen=True, slots=True)
class CedhMeasurement:
    """One `measure_cedh` run: the three pooled quantities, their dispersion,
    and every commander's synthetic-deck validation row.

    `type_profile` is `None` and `bucket_coverage`/`curve` are empty/`None`
    together whenever the run does not clear `min_commanders`/`min_decks` —
    one floor gates all three, because they are drawn from the same fetch
    loop over the same commanders rather than three independent samples.
    `validations` is populated regardless of the floor, so a thin run still
    shows its working.
    """

    type_profile: ArchetypeProfile | None
    type_sd: dict[str, float]
    curve: dict[int, float] | None
    bucket_coverage: dict[Bucket, float]
    bucket_sd: dict[Bucket, float]
    commanders: int
    decks: int
    validations: list[SyntheticDeckValidation]


def cedh_corpus(top_k: int = MEASURE_TOP_K) -> list[tuple[str, int]]:
    """The format's commanders, ranked by bracket-5 deck count, largest first.

    `tag_corpus`'s twin, and it cannot reuse that function: `cedh` never
    appears in `panels.taglinks` (`edhrec.CEDH_TAG_SLUG`'s docstring — zero
    hits across all 670 cached pages), which is the whole reason tier 0
    (`type_targets.resolve_type_targets`) gates the live `/cedh` fetch on
    `bracket_counts["5"]` instead of a taglink count. This ranks the same
    way tier 0 gates: reads the flat commander pages `warm-edhrec` already
    cached (`data_dir/edhrec/*.json`) — a bare glob that does not recurse
    into the theme-subpage subdirectories beside them — and discovers
    nothing of its own. A commander whose `bracket_counts["5"]` sits below
    `type_targets.CEDH_MIN_DECKS` (150) is dropped before ranking, the same
    floor tier 0's live fetch trusts, so a profile is never built partly
    from a commander too thin to condition even one deck at request time.

    Returns `(commander_slug, bracket_5_deck_count)` pairs, capped at `top_k`.
    """
    from .edhrec import _parsed_page

    ranked: list[tuple[str, int]] = []
    for path in (settings.data_dir / "edhrec").glob("*.json"):
        _, _, brackets = _parsed_page(path)
        deck_count = brackets.get(5, 0)
        if deck_count >= CEDH_MIN_DECKS:
            ranked.append((path.stem, deck_count))

    ranked.sort(key=lambda pair: -pair[1])
    return ranked[:top_k]


def _subpage_is_cached(slug: str) -> bool:
    """Whether this commander's `/cedh` subpage would be served from disk.

    `archetype_profiles._subpage_is_cached`'s discipline, copied rather than
    imported — that module already chose to copy this check once, from
    `edhrec.is_cached`, rather than reach across a module boundary for a
    private helper keyed differently (a subpage lives one directory deeper
    than the flat per-commander cache, `_theme_cache_path`). Copying again
    here keeps that precedent rather than breaking it for the first time.
    """
    from .edhrec import CACHE_TTL_SECONDS, _theme_cache_path

    path = _theme_cache_path(slug, "cedh")
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS


def _synthetic_average_deck(payload: dict) -> list[tuple[str, int]] | None:
    """Build a synthetic `DECK_SIZE`-card decklist from one commander's own
    inclusion rates.

    EDHREC's `/cedh` subpage carries a real per-card inclusion rate
    (`num_decks / potential_decks`) for every card it recommends — the same
    denominator behind the page's own averaged type and curve fields. Taking
    the highest-inclusion-rate cards, in order, until the deck is full is
    the natural reading of "the average deck": a card 80% of sampled decks
    play contributes more to the average than one 5% of them splash.

    Basics are not picked by inclusion rate: the page's own `basic` field is
    the stated average basic-land count, and that many copies of a
    placeholder basic (`_BASIC_LAND_NAME`) fill the remainder instead — the
    page carries no per-basic-land identity to rank in the first place.

    Returns `None` when the page has no usable `basic` count or no
    cardviews to rank at all — an unreadable or malformed page, treated by
    the caller the same as a fetch failure.
    """
    from .edhrec import parse_recommendations

    basic = payload.get("basic")
    if not isinstance(basic, int | float) or not (0 <= basic <= DECK_SIZE):
        return None
    basic = int(basic)

    recommendations = parse_recommendations(payload)
    if not recommendations:
        return None

    # Deterministic tie-break: two cards at the same inclusion rate must not
    # make this function's output depend on dict/set ordering.
    ranked = sorted(recommendations, key=lambda r: (-r.inclusion_rate, r.name))
    picks = [(r.name, 1) for r in ranked[: DECK_SIZE - basic]]

    if basic > 0:
        picks.append((_BASIC_LAND_NAME, basic))

    return picks


def _resolve_deck(picks: list[tuple[str, int]]) -> tuple[dict[str, int], int]:
    """Names -> oracle_ids, quantities summed by id.

    Returns the deck dict plus how many of the *requested* copies actually
    resolved — `_measure_commander`'s denominator for how much of the
    `DECK_SIZE` it can speak for. A name the graph cannot match (a naming
    drift between EDHREC and Scryfall, or a card ingested after this cache
    was warmed) is dropped rather than guessed at — the same "one bad entry
    does not end the run" discipline as everywhere else in this pipeline,
    here at card grain instead of page grain.
    """
    from .graph import resolve_names

    resolved = resolve_names([name for name, _ in picks])

    deck: dict[str, int] = {}
    matched = 0
    for name, qty in picks:
        oracle_id = resolved.get(name)
        if oracle_id is None:
            continue
        deck[oracle_id] = deck.get(oracle_id, 0) + qty
        matched += qty

    return deck, matched


def _measure_commander(
    slug: str, payload: dict, deck_count: int, stated: TypeCounts
) -> tuple[dict[Bucket, float] | None, SyntheticDeckValidation | None]:
    """One commander's synthetic average deck -> its bucket coverage, plus
    the validation row that says whether that number can be trusted.

    `stated` is this same page's own `parse_type_counts` result, already in
    hand from the caller's type-count pooling loop rather than re-parsed
    here. Returns `(None, None)` only when the page carries no usable
    cardlists or `basic` count at all — `_synthetic_average_deck` said so.
    Once a synthetic deck exists, a validation row is always returned, even
    when resolution came in too thin to trust the bucket number that would
    have gone with it: a commander whose inference failed still has to show
    up in the table, or the table would only ever report success.
    """
    from .diagnostics import _typed_roles
    from .graph import deck_card_roles, fetch_deck

    picks = _synthetic_average_deck(payload)
    if picks is None:
        return None, None

    deck, resolved = _resolve_deck(picks)
    requested = sum(qty for _, qty in picks)
    if resolved == 0:
        return None, SyntheticDeckValidation(
            slug=slug, decks=deck_count, requested=requested, resolved=0, deltas={}
        )

    cards = fetch_deck(deck)
    card_roles = deck_card_roles(deck)

    scale = DECK_SIZE / resolved
    synthetic_counts = {name: v * scale for name, v in type_counts_from_cards(cards).items()}
    deltas = {t: synthetic_counts.get(t, 0.0) - stated.counts.get(t, 0.0) for t in PRIMARY_TYPES}
    validation = SyntheticDeckValidation(
        slug=slug, decks=deck_count, requested=requested, resolved=resolved, deltas=deltas
    )

    if resolved < MIN_RESOLVED_FRACTION * DECK_SIZE:
        log.info("cedh.synthetic_deck_too_thin", slug=slug, resolved=resolved, requested=requested)
        return None, validation

    bucket_totals = bucket_coverage_from_cards(
        [(_typed_roles(entry["roles"]), entry["qty"]) for entry in card_roles]
    )
    bucket_per_deck_size = {bucket: value * scale for bucket, value in bucket_totals.items()}
    return bucket_per_deck_size, validation


def _weighted_sd(
    weighted_sum: dict[str, float], weighted_sq: dict[str, float], total_weight: float
) -> dict[str, float]:
    """Weighted standard deviation per key — `measure_tag`'s diagnostic,
    factored out so the type pool and the bucket pool compute it identically."""
    if total_weight <= 0:
        return {}
    out: dict[str, float] = {}
    for key, total in weighted_sum.items():
        mean = total / total_weight
        variance = max(0.0, weighted_sq[key] / total_weight - mean * mean)
        out[key] = variance**0.5
    return out


def measure_cedh(
    *,
    top_k: int = MEASURE_TOP_K,
    delay_seconds: float = 1.0,
    min_commanders: int = MIN_COMMANDERS,
    min_decks: int = MIN_DECKS,
) -> CedhMeasurement:
    """Fetch and pool the top-K commanders' `/cedh` subpages.

    Pools three things, all weighted by each commander's own bracket-5 deck
    count — the same quantity `cedh_corpus` ranked on, and the direct
    analogue of `measure_tag`'s taglink-count weight, for the reason that
    docstring gives: a weighted mean of vectors that each already sum to 99
    is the pooled per-*deck* mean, not the pooled per-*commander* one, so a
    150-deck pairing does not get a famous commander's weight and does not
    drown a famous commander out either.

    - Type counts, straight off each page's own `parse_type_counts` — the
      empirical average EDHREC already computed. No synthetic deck involved.
    - The mana curve (`edhrec.parse_curve`), pooled the same weighted-mean
      way and renormalised to shares once at the end, rather than per
      commander — a page with a handful of decks behind it would otherwise
      carry as much *shape* weight as Najeela's despite carrying far less
      *deck-count* weight everywhere else in this function.
    - Bucket coverage of a synthetic average decklist
      (`_synthetic_average_deck`) built from that same page. EDHREC
      publishes no bucket coverage of its own, so this is the one pooled
      quantity here that is inferred rather than read — `_measure_commander`
      also returns that inference's own receipt (`SyntheticDeckValidation`)
      whether or not the bucket number cleared the resolution floor, so a
      commander whose inference failed still shows up in the table.

    Same cache-first, one-bad-page-does-not-end-the-run, sleep-only-after-a-
    real-fetch discipline as `measure_tag`. `min_commanders`/`min_decks`
    mirror `archetype_profiles.MIN_COMMANDERS`/`MIN_DECKS` — a thin pool
    emits nothing rather than a number nobody can trust — applied once to
    the whole run rather than per pooled quantity, since all three come out
    of the same fetch loop over the same commanders.
    """
    from .edhrec import fetch_commander_theme, parse_curve, parse_type_counts

    ranked = cedh_corpus(top_k)

    weighted_sum: dict[str, float] = {}
    weighted_sq: dict[str, float] = {}
    type_weight_total = 0.0

    curve_sum: dict[int, float] = {}
    curve_weight_total = 0.0

    bucket_sum: dict[str, float] = {}
    bucket_sq: dict[str, float] = {}
    bucket_weight_total = 0.0

    commanders = 0
    decks = 0
    validations: list[SyntheticDeckValidation] = []

    for slug, deck_count in ranked:
        network = not _subpage_is_cached(slug)
        try:
            payload = fetch_commander_theme(slug, "cedh")
        except Exception as exc:  # noqa: BLE001 — unofficial API, one bad page must not end the run
            log.warning("cedh.fetch_failed", slug=f"{slug}/cedh", error=str(exc))
            payload = None
        if network:
            time.sleep(delay_seconds)

        if payload is None:
            continue
        stated = parse_type_counts(payload)
        if stated is None:
            continue

        commanders += 1
        decks += deck_count
        type_weight_total += deck_count
        for type_name, mean in stated.counts.items():
            weighted_sum[type_name] = weighted_sum.get(type_name, 0.0) + mean * deck_count
            weighted_sq[type_name] = weighted_sq.get(type_name, 0.0) + mean * mean * deck_count

        curve = parse_curve(payload)
        if curve is not None:
            curve_weight_total += deck_count
            for mv, value in curve.items():
                curve_sum[mv] = curve_sum.get(mv, 0.0) + value * deck_count

        bucket_per_deck, validation = _measure_commander(slug, payload, deck_count, stated)
        if validation is not None:
            validations.append(validation)
        if bucket_per_deck is not None:
            bucket_weight_total += deck_count
            for bucket, value in bucket_per_deck.items():
                bucket_sum[bucket] = bucket_sum.get(bucket, 0.0) + value * deck_count
                bucket_sq[bucket] = bucket_sq.get(bucket, 0.0) + value * value * deck_count

    type_sd = _weighted_sd(weighted_sum, weighted_sq, type_weight_total)
    bucket_sd = {
        Bucket(k): v for k, v in _weighted_sd(bucket_sum, bucket_sq, bucket_weight_total).items()
    }

    if commanders < min_commanders or decks < min_decks:
        log.info(
            "cedh.below_floor",
            commanders=commanders,
            decks=decks,
            min_commanders=min_commanders,
            min_decks=min_decks,
        )
        return CedhMeasurement(
            type_profile=None,
            type_sd=type_sd,
            curve=None,
            bucket_coverage={},
            bucket_sd=bucket_sd,
            commanders=commanders,
            decks=decks,
            validations=validations,
        )

    raw_total = sum(weighted_sum.values())
    counts = {t: v * 99 / raw_total for t, v in weighted_sum.items()}
    type_profile = ArchetypeProfile(
        counts=counts,
        tag="cedh",
        commanders=commanders,
        decks=decks,
        measured=date.today().isoformat(),
    )

    curve_shares = None
    if curve_weight_total > 0:
        curve_total = sum(curve_sum.values())
        if curve_total > 0:
            curve_shares = {mv: v / curve_total for mv, v in curve_sum.items()}

    bucket_coverage = (
        {Bucket(k): v / bucket_weight_total for k, v in bucket_sum.items()}
        if bucket_weight_total > 0
        else {}
    )

    return CedhMeasurement(
        type_profile=type_profile,
        type_sd=type_sd,
        curve=curve_shares,
        bucket_coverage=bucket_coverage,
        bucket_sd=bucket_sd,
        commanders=commanders,
        decks=decks,
        validations=validations,
    )


def render_constants(measurement: CedhMeasurement) -> str:
    """A paste-ready `CEDH_TYPE_COUNTS` block plus the curve, the bucket
    corridors, their dispersions, and the synthetic-deck validation table.

    Prints only — `archetype_profiles.render_constants`'s discipline,
    copied. `CEDH_TYPE_COUNTS` lands in `type_targets.py` as a reviewed diff
    (this round's Task B); the curve and bucket numbers are raw material for
    Task C's `CEDH` `DeckTemplate`, including the trap CEDH-PLAN.md's
    addendum already measured and named: a bucket mean well above TUNED's
    mana-sources range sitting next to a Land type mean *below* today's
    default is not a contradiction to reconcile — it is cEDH running more
    fast mana on fewer lands — and Task C must suppress `shift_mana_sources`
    for the cEDH branch rather than let it fight that shape.

    Per-type diagnostics compare against `DEFAULT_TYPE_COUNTS` — the type
    axis's only other real number, since neither archetype template carries
    type targets of its own (`DeckTemplate.types` is empty until a request
    resolves them). Per-bucket diagnostics compare against `TUNED`'s
    corridor instead, because buckets are the one axis both a `DeckTemplate`
    and this measurement actually share.
    """
    lines: list[str] = []

    profile = measurement.type_profile
    if profile is None:
        lines.append(
            f"# below floor — no CEDH_TYPE_COUNTS emitted "
            f"(commanders={measurement.commanders}, decks={measurement.decks:,})"
        )
    else:
        counts = ", ".join(f'"{t}": {v:.1f}' for t, v in profile.counts.items())
        lines.append("CEDH_TYPE_COUNTS: ArchetypeProfile | None = ArchetypeProfile(")
        lines.append(f"    counts={{{counts}}},")
        lines.append(f'    tag="{profile.tag}",')
        lines.append(f"    commanders={profile.commanders},")
        lines.append(f"    decks={profile.decks},")
        lines.append(f'    measured="{profile.measured}",')
        lines.append(")")
    lines.append("")

    if measurement.curve is not None:
        curve = ", ".join(f"{mv}: {share:.3f}" for mv, share in sorted(measurement.curve.items()))
        lines.append(f"# CEDH template curve (Task C): {{{curve}}}")
    else:
        lines.append("# curve: not enough commanders answered to pool one")
    lines.append("")

    if profile is not None:
        lines.append(
            f"# CEDH_TYPE_COUNTS: M={profile.commanders} N={profile.decks:,} "
            f"measured={profile.measured}"
        )
        lines.append("# per-type mean / sd / DEFAULT_TYPE_COUNTS (today's fallback):")
        for name in PRIMARY_TYPES:
            mean = profile.counts.get(name, 0.0)
            sd = measurement.type_sd.get(name, 0.0)
            default = DEFAULT_TYPE_COUNTS.get(name, 0.0)
            lines.append(
                f"#   {name:<12} mean={mean:>5.1f}  sd={sd:>4.1f}  default={default:>5.1f}"
            )
        lines.append("")

    if measurement.bucket_coverage:
        lines.append("# per-bucket mean / sd / TUNED range (Task C's corridor input):")
        for bucket in Bucket:
            mean = measurement.bucket_coverage.get(bucket, 0.0)
            sd = measurement.bucket_sd.get(bucket, 0.0)
            tuned = TUNED.buckets[bucket]
            lines.append(
                f"#   {bucket.value:<16} mean={mean:>5.1f}  sd={sd:>4.1f}  "
                f"TUNED={tuned.low:.0f}-{tuned.high:.0f}"
            )
    else:
        lines.append(
            "# bucket coverage: no commander's synthetic deck cleared the resolution floor"
        )
    lines.append("")

    lines.append(
        "# synthetic-deck validation (synthetic per-99 minus the page's own stated per-99):"
    )
    if not measurement.validations:
        lines.append("#   no commander produced a synthetic deck to validate")
    else:
        total_decks = sum(v.decks for v in measurement.validations) or 1
        aggregate = {
            name: sum(v.deltas.get(name, 0.0) * v.decks for v in measurement.validations)
            / total_decks
            for name in PRIMARY_TYPES
        }
        agg_row = " ".join(f"{name[:4]}={aggregate[name]:+.1f}" for name in PRIMARY_TYPES)
        lines.append(f"#   deck-count-weighted mean delta: {agg_row}")
        for v in sorted(measurement.validations, key=lambda row: -row.decks):
            row = " ".join(f"{name[:4]}={v.deltas.get(name, 0.0):+.1f}" for name in PRIMARY_TYPES)
            lines.append(
                f"#   {v.slug:<32} N={v.decks:>6,} resolved={v.resolved:>3}/{v.requested:<3} {row}"
            )

    return "\n".join(lines)
