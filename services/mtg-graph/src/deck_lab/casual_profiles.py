"""Casual bucket corridor derivation — `cedh_profiles.py`'s discipline,
pointed at the format `CASUAL_CORRIDORS` (`composition.py`) actually grades.

`BATTLECRUISER` and `TUNED` (brackets 1-4) never had their ramp/card_draw/
interaction/synergy_wincon corridors measured — `composition.py`'s own
comment said so, next to `CEDH`'s corridor, which was. Observed live: an
average EDHREC-based casual list reads about half of the authored
synergy_wincon target, and 394 of 415 cached casual commander pages fall
under the speed-0.5 corridor entirely. This
module is that measurement, run the same way `cedh_profiles.measure_cedh`
runs its own — a commander's page inclusion rates stand in for a decklist
nobody publishes directly — pooled over the *casual* corpus instead of the
`/cedh` one.

Unlike `cedh_profiles`/`archetype_profiles`, which each restate their
floors and corpus-walk code rather than import across a module boundary
(their own docstrings: different corpora, not the same number reused),
this module imports `cedh_profiles._measure_commander` and `_weighted_sd`
directly rather than copying them. There is nothing corpus-specific to
restate: `_measure_commander` takes a commander's *own page payload* and a
`TypeCounts`, and does not care — and cannot tell — whether that payload
came from a `/cedh` subpage or a flat commander page. It is the same
function applied to the same shape of input; only the corpus this module
walks to produce that input differs, which is exactly the boundary that
justifies `casual_corpus` existing here as its own function rather than a
copy of `cedh_corpus`, and `_load_page` as its own function rather than a
copy of `fetch_commander_theme` (there is nothing to fetch: no network call
happens anywhere in this module).

Read-only over pages `warm-edhrec` already cached (`data_dir/edhrec/*.json`)
— not a fourth sanctioned bulk walk beside `warm_top_commanders`,
`archetype_profiles.measure_tag` and `cedh_profiles.measure_cedh` (the
`edhrec.py` doctrine header's three), because none of those exist to gate: a
walk that never touches the network needs no throttle. The bucket-coverage
inference still needs the graph, exactly as `cedh_profiles._measure_commander`
does: `_resolve_deck` (via `graph.resolve_names`) turns a synthetic
decklist's card names into oracle ids, and `fetch_deck`/`deck_card_roles`
read back their types and role weights, so a run of this module still needs
Neo4j populated even though it never calls out to EDHREC.

Three things live here:

- `casual_corpus` ranks every cached flat commander page by its *total*
  deck count (all five brackets summed) rather than `cedh_corpus`'s
  bracket-5-only ranking — casual reads the whole format, not one bracket
  of it, so there is no single bracket to floor or rank on the way
  `CEDH_MIN_DECKS` does for `/cedh`.
- `measure_casual` pools four things, all weighted by each commander's own
  total deck count: the synthetic-average-deck bucket coverage
  (`cedh_profiles._measure_commander`, corrected for the land-overcount
  bias `_land_correction_factor` documents), the pooled mana curve
  (reporting only — the authored lerp is unchanged), a bracket-lean split
  check (does a commander's own bracket mix predict its bucket coverage,
  or is one pooled corridor enough for brackets 1-4), and the per-bracket
  1-4 breakdown that split reads.
- `render_constants` prints a paste-ready `CASUAL_CORRIDORS` block plus
  every diagnostic behind it. Prints only — `composition.py` receives the
  corridor as a reviewed diff, `cedh_profiles.render_constants`'s
  discipline applied to this module's own measurement.

Operator-run (`deck-lab measure-casual`), never called from a request path.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

import structlog

from .cedh_profiles import (
    DECK_SIZE,
    MIN_COMMANDERS,
    MIN_DECKS,
    SyntheticDeckValidation,
    _measure_commander,
    _weighted_sd,
)
from .composition import BATTLECRUISER, TUNED, Bucket
from .config import settings
from .type_targets import PRIMARY_TYPES

log = structlog.get_logger(__name__)

# The four buckets `CASUAL_CORRIDORS` (`composition.py`) covers, in the
# order `composition.py`'s table reports them — `Bucket.MANA_SOURCES`
# is deliberately absent: it counts lands directly, so the nonland
# land-overcount correction below does not apply to it, and
# `type_targets.derive_mana_sources` already builds its corridor from the
# empirical Land row rather than from anything pooled here.
NONLAND_BUCKETS: tuple[Bucket, ...] = (
    Bucket.RAMP,
    Bucket.CARD_DRAW,
    Bucket.INTERACTION,
    Bucket.SYNERGY_WINCON,
)

# The corpus floor: a commander's flat page must carry at least this many
# total decks (summed across all five brackets) before its synthetic
# average deck is trusted enough to pool. Analogous to `type_targets.
# CEDH_MIN_DECKS` (150) but answering a different question — that floor
# gates a *live* single-commander `/cedh` read at request time, spending
# one user's patience on one page; this one gates a *pooled*
# cross-commander measurement, where a thin page's noise gets averaged
# into 414 others rather than shown to anyone. Kept in the same order of
# magnitude as `CEDH_MIN_DECKS` for the same reason that floor gives,
# rather than measured separately: below it, EDHREC's own aggregate is not
# stable enough to read an inclusion-rate ranking off.
MIN_DECKS_PER_COMMANDER = 200

# How large the bracket-lean split's gap (in pooled-sd units) must be before
# the corridor should branch by bracket lean rather than stay one — the
# same "half-width is one measured sd" rule `composition.CEDH`'s comment
# states, restated as a threshold on the *gap between two pools' means*
# instead of a threshold on one pool's own dispersion: a gap under one
# measured standard deviation is noise the single corridor already
# absorbs, not a real bracket effect asking for a second anchor. A
# judgment call, not a measurement — exposed as `measure-casual --sd-gap`
# so a reviewer can widen or narrow it without editing this file. The
# measured gaps sit at 0.18-0.28 (see `render_constants`), well under it
# either way.
SD_GAP_THRESHOLD = 1.0


def casual_corpus(min_decks_per_commander: int = MIN_DECKS_PER_COMMANDER) -> list[tuple[str, int]]:
    """The format's commanders with a usable cached page, ranked by total
    deck count (all five brackets), largest first.

    `cedh_profiles.cedh_corpus`'s twin, ranked and floored differently on
    purpose: that corpus exists to find the best-sampled *bracket-5*
    commanders for a live `/cedh` subpage fetch, so it floors and ranks on
    `bracket_counts[5]` alone — a commander with a huge casual following
    and no cEDH presence at all is exactly what it should drop. This corpus
    reads every bracket as casual's format (bracket 1 and bracket 4 both
    count), so it floors and ranks on the page's *total* instead — a
    commander with no bracket-5 presence at all still belongs here, and
    would be silently dropped by `cedh_corpus`'s own ranking.

    Uses `edhrec._parsed_page`'s memoised parse (bracket counts only) the
    same way `cedh_corpus` does — the full payload, cardlists included, is
    read again per commander in `measure_casual`, once a page has actually
    cleared this floor.
    """
    from .edhrec import _parsed_page

    ranked: list[tuple[str, int]] = []
    for path in (settings.data_dir / "edhrec").glob("*.json"):
        _, _, brackets = _parsed_page(path)
        total = sum(brackets.values())
        if total >= min_decks_per_commander:
            ranked.append((path.stem, total))

    ranked.sort(key=lambda pair: -pair[1])
    return ranked


def _load_page(slug: str) -> dict | None:
    """One commander's full flat-page payload, read fresh from disk.

    `casual_corpus` ranks off `edhrec._parsed_page`'s memo, which keeps
    only `TypeCounts`/taglinks/bracket counts and throws the cardlists
    away — exactly what `cedh_profiles._synthetic_average_deck` needs. So
    every commander that clears the corpus floor is read a second time
    here, plainly, the way `cedh_profiles.measure_cedh` reads its `/cedh`
    subpages fresh off a fetch rather than off that same memo.
    """
    path = settings.data_dir / "edhrec" / f"{slug}.json"
    try:
        return json.loads(path.read_text())
    # PEP 758 (3.14): unparenthesized multi-except, tuple semantics — see
    # `edhrec.parse_curve`'s identical comment.
    except OSError, json.JSONDecodeError:
        log.warning("casual.unreadable_page", slug=slug)
        return None


def _land_correction_factor(stated_land: float, synthetic_land: float) -> float:
    """The `_synthetic_average_deck` land-overcount correction.

    `_synthetic_average_deck` fills a decklist with the page's highest-
    inclusion-rate cards, and on almost every commander page a handful of
    lands (Command Tower, the basics) sit above even a build-around's own
    payoff by inclusion rate. That crowds the synthetic deck's land count
    above the page's own *stated* Land mean
    (`SyntheticDeckValidation.deltas["Land"]`), displacing spells the real
    average deck would run — the same inflation `composition.CEDH`'s
    comment corrects for on the `/cedh` corpus (+3.3 there), measured here
    at +5.29 pooled over 415 casual pages (`render_constants`'s land delta).

    Every displaced card was a nonland card, so the fix scales every
    nonland bucket by the same ratio a shrink from `synthetic_land` back to
    `stated_land` implies: `(DECK_SIZE - stated) / (DECK_SIZE - synthetic)`
    is real nonland slots over synthetic nonland slots. `synthetic_land >=
    DECK_SIZE` — a page with essentially no nonland recommendations at all,
    never observed in this corpus — would divide by zero or flip the
    ratio's sign, so it is guarded to the identity (no correction) rather
    than trusted.
    """
    denominator = DECK_SIZE - synthetic_land
    if denominator <= 0:
        return 1.0
    return (DECK_SIZE - stated_land) / denominator


def _corrected_coverage(
    raw: Mapping[Bucket, float], stated_land: float, synthetic_land: float
) -> dict[Bucket, float]:
    """`raw`'s four nonland buckets scaled by `_land_correction_factor`;
    `Bucket.MANA_SOURCES` passes through unchanged.

    MANA_SOURCES counts lands directly (`vocabulary.BUCKET_ROLES`), so the
    nonland-displacement story this correction tells does not apply to it —
    and it is never pooled into a corridor here regardless (see
    `NONLAND_BUCKETS`'s comment).
    """
    factor = _land_correction_factor(stated_land, synthetic_land)
    corrected = dict(raw)
    for bucket in NONLAND_BUCKETS:
        corrected[bucket] = raw.get(bucket, 0.0) * factor
    return corrected


@dataclass(frozen=True, slots=True)
class CommanderSample:
    """One commander's flat page, read down to what the pool needs.

    `raw` is `_measure_commander`'s bucket coverage exactly as it came off
    the synthetic deck; `corrected` applies `_corrected_coverage`'s land
    fix to the four nonland buckets, leaving `Bucket.MANA_SOURCES` equal to
    `raw`'s own value in both. `bracket_counts` is kept whole (not folded
    into `decks`) because the bracket-lean split needs each bracket's own
    weight on this one commander, not just the commander's total.
    """

    slug: str
    decks: int
    bracket_counts: dict[int, int]
    stated_land: float
    synthetic_land: float
    raw: dict[Bucket, float]
    corrected: dict[Bucket, float]
    curve: dict[int, float] | None
    validation: SyntheticDeckValidation


@dataclass(frozen=True, slots=True)
class PoolStats:
    """One bucket's deck-count-weighted mean and standard deviation over
    some pool of `CommanderSample`s, plus how many commanders and decks fed
    it — `commanders`/`decks` differ between the full pool and the bracket-
    lean split's low/high halves, so they travel with the numbers they
    describe rather than being read off the measurement as a whole."""

    mean: float
    sd: float
    commanders: int
    decks: int


def _pool_buckets(
    samples: Sequence[CommanderSample], *, corrected: bool
) -> dict[Bucket, PoolStats]:
    """Deck-count-weighted mean/sd per nonland bucket, over `samples`.

    `corrected=True` pools `CommanderSample.corrected` (what `CASUAL_
    CORRIDORS` is built from); `corrected=False` pools `.raw` (the "raw"
    column `render_constants` prints beside it, so a reader can see how
    much the land correction actually moved each bucket). The one pooling
    routine both the full-corpus table and the bracket-lean split's
    low/high halves call, so the two never drift onto different formulas
    for what looks like the same "mean over a pool of commanders" number.
    """
    weighted_sum: dict[str, float] = {}
    weighted_sq: dict[str, float] = {}
    weight_total = 0.0
    commanders = 0

    for sample in samples:
        source = sample.corrected if corrected else sample.raw
        weight = sample.decks
        weight_total += weight
        commanders += 1
        for bucket in NONLAND_BUCKETS:
            value = source.get(bucket, 0.0)
            key = bucket.value
            weighted_sum[key] = weighted_sum.get(key, 0.0) + value * weight
            weighted_sq[key] = weighted_sq.get(key, 0.0) + value * value * weight

    sd = _weighted_sd(weighted_sum, weighted_sq, weight_total)
    return {
        bucket: PoolStats(
            mean=(weighted_sum.get(bucket.value, 0.0) / weight_total) if weight_total > 0 else 0.0,
            sd=sd.get(bucket.value, 0.0),
            commanders=commanders,
            decks=int(weight_total),
        )
        for bucket in NONLAND_BUCKETS
    }


def _mean_bracket(bracket_counts: Mapping[int, int]) -> float:
    """One commander's deck-count-weighted mean power bracket (1-5).

    The bracket-lean split's per-commander axis: a commander whose decks
    lean bracket 4 sits near 4.0, one split evenly across brackets 1-3 sits
    near 2.0. Zero for a commander with no bracket data at all — cannot
    happen for anything `casual_corpus` returned (it floors on this exact
    sum), guarded anyway so a hand-built sample cannot divide by zero.
    """
    total = sum(bracket_counts.values())
    if total <= 0:
        return 0.0
    return sum(bracket * count for bracket, count in bracket_counts.items()) / total


def _deck_weighted_median(samples: Sequence[CommanderSample]) -> float:
    """The mean-bracket value at which half the pool's *decks* — not half
    its commanders — sit at or below it.

    A plain median over 415 mean-bracket values would give a 200-deck
    outlier and an 800,000-deck workhorse the same one vote; the split this
    feeds asks "does the typical *deck*'s bracket lean predict its bucket
    coverage", so the threshold has to be weighted the same way the pools
    it produces are (measured: median 2.89, splitting 415 commanders into a
    260-commander/433k-deck low pool and a 155/430k high pool — almost even
    by deck count despite the lopsided commander split).
    """
    ordered = sorted(samples, key=lambda sample: _mean_bracket(sample.bracket_counts))
    total = sum(sample.decks for sample in ordered)
    if total <= 0:
        return 0.0

    half = total / 2
    cumulative = 0
    for sample in ordered:
        cumulative += sample.decks
        if cumulative >= half:
            return _mean_bracket(sample.bracket_counts)
    return _mean_bracket(ordered[-1].bracket_counts)  # pragma: no cover - unreachable


def _per_bracket_means(samples: Sequence[CommanderSample]) -> dict[int, dict[Bucket, float]]:
    """Each nonland bucket's mean, pooled per bracket 1-4 — weight is that
    *bracket's own* deck count on each commander's page, not the
    commander's total.

    Answers a different question than the low/high split: "does a page's
    own bracket-4 slice of decks read differently from its bracket-1
    slice", pooled across every commander at once rather than sorting
    commanders into two groups by overall lean. Bracket 5 is excluded — a
    casual page's bracket-5 slice is the same population `cedh_profiles.py`
    measures directly from the `/cedh` subpage, not this module's concern.
    """
    out: dict[int, dict[Bucket, float]] = {}
    for bracket in (1, 2, 3, 4):
        row: dict[Bucket, float] = {}
        for bucket in NONLAND_BUCKETS:
            weighted_sum = 0.0
            weight_total = 0.0
            for sample in samples:
                weight = sample.bracket_counts.get(bracket, 0)
                if weight <= 0:
                    continue
                weighted_sum += sample.corrected.get(bucket, 0.0) * weight
                weight_total += weight
            row[bucket] = weighted_sum / weight_total if weight_total > 0 else 0.0
        out[bracket] = row
    return out


def _land_delta(samples: Sequence[CommanderSample]) -> float:
    """Deck-count-weighted mean of `synthetic_land - stated_land` — the
    single number `_land_correction_factor` exists to cancel out, reported
    on its own because it is the headline finding behind the correction,
    not just an input to it."""
    weighted_sum = 0.0
    weight_total = 0.0
    for sample in samples:
        weighted_sum += (sample.synthetic_land - sample.stated_land) * sample.decks
        weight_total += sample.decks
    return weighted_sum / weight_total if weight_total > 0 else 0.0


def _pool_curve(samples: Sequence[CommanderSample]) -> dict[int, float] | None:
    """`cedh_profiles.measure_cedh`'s curve pooling, restated: deck-count-
    weighted mean per mana-value bucket, renormalised to shares once at the
    end rather than per commander (a page with a handful of decks behind it
    would otherwise carry as much *shape* weight as a format staple's).
    Reporting only — `template_for`'s authored lerp curve is unchanged; see
    the module docstring."""
    curve_sum: dict[int, float] = {}
    weight_total = 0.0
    for sample in samples:
        if not sample.curve:
            continue
        weight = sample.decks
        weight_total += weight
        for mv, share in sample.curve.items():
            curve_sum[mv] = curve_sum.get(mv, 0.0) + share * weight

    if weight_total <= 0:
        return None
    total = sum(curve_sum.values())
    return {mv: value / total for mv, value in curve_sum.items()} if total > 0 else None


@dataclass(frozen=True, slots=True)
class CasualMeasurement:
    """One `measure_casual` run.

    `pooled` is `{}` and `curve`/`median_bracket` are `None` whenever the
    run does not clear `min_commanders`/`min_decks` — one floor gates
    everything drawn from the corpus, `cedh_profiles.CedhMeasurement`'s
    contract. `samples` and `validations` are populated regardless, so a
    thin run still shows its working. `low`/`high`/`gap_sd`/`verdict` are
    the bracket-lean split check; `per_bracket` is the finer-grained
    bracket 1-4 breakdown that split reads alongside.
    """

    samples: list[CommanderSample]
    pooled: dict[Bucket, PoolStats]
    raw_mean: dict[Bucket, float]
    curve: dict[int, float] | None
    land_delta: float
    median_bracket: float | None
    low: dict[Bucket, PoolStats]
    high: dict[Bucket, PoolStats]
    gap_sd: dict[Bucket, float]
    verdict: str
    per_bracket: dict[int, dict[Bucket, float]]
    commanders: int
    decks: int
    validations: list[SyntheticDeckValidation]


def measure_casual(
    *,
    min_decks_per_commander: int = MIN_DECKS_PER_COMMANDER,
    min_commanders: int = MIN_COMMANDERS,
    min_decks: int = MIN_DECKS,
    sd_gap: float = SD_GAP_THRESHOLD,
) -> CasualMeasurement:
    """Read every cached casual commander page and pool the nonland bucket
    corridors.

    Every commander in `casual_corpus(min_decks_per_commander)` is read
    once (`_load_page`), fed through `cedh_profiles._measure_commander`
    exactly as `measure_cedh` feeds its own `/cedh` payloads, then
    corrected for the land-overcount bias and folded into the running
    pools. `min_commanders`/`min_decks` gate the whole run at once, same as
    `measure_cedh` — these four numbers come off the same fetch loop over
    the same commanders, not four independent samples.
    """
    from .edhrec import parse_bracket_counts, parse_curve, parse_type_counts

    ranked = casual_corpus(min_decks_per_commander)

    samples: list[CommanderSample] = []
    validations: list[SyntheticDeckValidation] = []

    for slug, total_decks in ranked:
        payload = _load_page(slug)
        if payload is None:
            continue
        stated = parse_type_counts(payload)
        if stated is None:
            continue

        bracket_counts = parse_bracket_counts(payload)
        bucket_per_deck, validation = _measure_commander(slug, payload, total_decks, stated)
        if validation is not None:
            validations.append(validation)
        if bucket_per_deck is None:
            continue

        stated_land = stated.counts.get("Land", 0.0)
        synthetic_land = stated_land + validation.deltas.get("Land", 0.0)
        corrected = _corrected_coverage(bucket_per_deck, stated_land, synthetic_land)

        samples.append(
            CommanderSample(
                slug=slug,
                decks=total_decks,
                bracket_counts=bracket_counts,
                stated_land=stated_land,
                synthetic_land=synthetic_land,
                raw=bucket_per_deck,
                corrected=corrected,
                curve=parse_curve(payload),
                validation=validation,
            )
        )

    commanders = len(samples)
    decks = sum(sample.decks for sample in samples)

    if commanders < min_commanders or decks < min_decks:
        log.info(
            "casual.below_floor",
            commanders=commanders,
            decks=decks,
            min_commanders=min_commanders,
            min_decks=min_decks,
        )
        return CasualMeasurement(
            samples=samples,
            pooled={},
            raw_mean={},
            curve=None,
            land_delta=0.0,
            median_bracket=None,
            low={},
            high={},
            gap_sd={},
            verdict="below floor",
            per_bracket={},
            commanders=commanders,
            decks=decks,
            validations=validations,
        )

    pooled = _pool_buckets(samples, corrected=True)
    raw_pooled = _pool_buckets(samples, corrected=False)
    raw_mean = {bucket: raw_pooled[bucket].mean for bucket in NONLAND_BUCKETS}

    median_bracket = _deck_weighted_median(samples)
    low_samples = [s for s in samples if _mean_bracket(s.bracket_counts) <= median_bracket]
    high_samples = [s for s in samples if _mean_bracket(s.bracket_counts) > median_bracket]
    low = _pool_buckets(low_samples, corrected=True)
    high = _pool_buckets(high_samples, corrected=True)
    gap_sd = {
        bucket: (
            abs(high[bucket].mean - low[bucket].mean) / pooled[bucket].sd
            if pooled[bucket].sd > 0
            else 0.0
        )
        for bucket in NONLAND_BUCKETS
    }
    split = any(gap > sd_gap for gap in gap_sd.values())
    verdict = (
        "split — corridors should branch on bracket lean"
        if split
        else "one corridor for speed < 0.8; weights keep lerping"
    )

    return CasualMeasurement(
        samples=samples,
        pooled=pooled,
        raw_mean=raw_mean,
        curve=_pool_curve(samples),
        land_delta=_land_delta(samples),
        median_bracket=median_bracket,
        low=low,
        high=high,
        gap_sd=gap_sd,
        verdict=verdict,
        per_bracket=_per_bracket_means(samples),
        commanders=commanders,
        decks=decks,
        validations=validations,
    )


def render_constants(m: CasualMeasurement) -> str:
    """A paste-ready `CASUAL_CORRIDORS` block plus every diagnostic behind
    it — `cedh_profiles.render_constants`'s discipline, applied to this
    module's own measurement. Prints only; `composition.py` receives the
    corridor as a reviewed diff like every other measured constant here.
    """
    lines: list[str] = []

    if not m.pooled:
        lines.append(
            f"# below floor — no CASUAL_CORRIDORS emitted "
            f"(commanders={m.commanders}, decks={m.decks:,})"
        )
        return "\n".join(lines)

    lines.append("CASUAL_CORRIDORS: dict[Bucket, tuple[float, float]] = {")
    for bucket in NONLAND_BUCKETS:
        stats = m.pooled[bucket]
        lines.append(
            f"    Bucket.{bucket.name}: ({stats.mean - stats.sd:.1f}, {stats.mean + stats.sd:.1f}),"
        )
    lines.append("}")
    lines.append("")

    lines.append(
        f"# measured {date.today().isoformat()} (`deck-lab measure-casual`), "
        f"N={m.commanders} commanders, {m.decks:,} decks, deck-count weighted"
    )
    lines.append(
        f"# land delta (synthetic minus stated; every nonland bucket above is "
        f"corrected for it): {m.land_delta:+.2f}"
    )
    lines.append("# bucket           raw    mean    sd    corridor         authored BC / TUNED")
    for bucket in NONLAND_BUCKETS:
        stats = m.pooled[bucket]
        raw = m.raw_mean[bucket]
        low, high = stats.mean - stats.sd, stats.mean + stats.sd
        bc = BATTLECRUISER.buckets[bucket]
        tuned = TUNED.buckets[bucket]
        lines.append(
            f"#   {bucket.value:<14} {raw:>5.1f}  {stats.mean:>5.1f}  {stats.sd:>4.1f}  "
            f"{low:>5.1f}-{high:<5.1f}   "
            f"{bc.low:.0f}-{bc.high:.0f} / {tuned.low:.0f}-{tuned.high:.0f}"
        )
    lines.append("")

    low_zero, high_zero = m.low[NONLAND_BUCKETS[0]], m.high[NONLAND_BUCKETS[0]]
    lines.append(
        f"# bracket-lean split: deck-weighted median bracket={m.median_bracket:.2f} "
        f"(low n={low_zero.commanders}/{low_zero.decks:,} decks, "
        f"high n={high_zero.commanders}/{high_zero.decks:,} decks); gap in pooled-sd units:"
    )
    for bucket in NONLAND_BUCKETS:
        lines.append(
            f"#   {bucket.value:<14} low={m.low[bucket].mean:>5.1f}  "
            f"high={m.high[bucket].mean:>5.1f}  gap={m.gap_sd[bucket]:.2f}"
        )
    lines.append(f"# verdict: {m.verdict}")
    lines.append("")

    split = "split" in m.verdict
    if split:
        for label, group in (("LOW", m.low), ("HIGH", m.high)):
            lines.append(f"# {label}_CASUAL_CORRIDORS (bracket-lean split — verdict says branch):")
            for bucket in NONLAND_BUCKETS:
                stats = group[bucket]
                lines.append(
                    f"#   Bucket.{bucket.name}: "
                    f"({stats.mean - stats.sd:.1f}, {stats.mean + stats.sd:.1f}),"
                )
            lines.append("")

    lines.append("# per-bracket pooled means (weight = that bracket's decks per commander):")
    for bucket in NONLAND_BUCKETS:
        row = " ".join(f"b{b}={m.per_bracket[b][bucket]:.1f}" for b in (1, 2, 3, 4))
        lines.append(f"#   {bucket.value:<14} {row}")
    lines.append("")

    if m.curve is not None:
        curve = ", ".join(f"{mv}: {share:.3f}" for mv, share in sorted(m.curve.items()))
        lines.append(f"# curve (reporting only, no change to the authored lerp): {{{curve}}}")
    else:
        lines.append("# curve: not enough commanders answered to pool one")
    lines.append("")

    lines.append(
        "# synthetic-deck validation (synthetic per-99 minus the page's own stated per-99):"
    )
    if not m.validations:
        lines.append("#   no commander produced a synthetic deck to validate")
    else:
        total_decks = sum(v.decks for v in m.validations) or 1
        aggregate = {
            name: sum(v.deltas.get(name, 0.0) * v.decks for v in m.validations) / total_decks
            for name in PRIMARY_TYPES
        }
        agg_row = " ".join(f"{name[:4]}={aggregate[name]:+.1f}" for name in PRIMARY_TYPES)
        lines.append(f"#   deck-count-weighted mean delta: {agg_row}")
        for v in sorted(m.validations, key=lambda row: -row.decks):
            row = " ".join(f"{name[:4]}={v.deltas.get(name, 0.0):+.1f}" for name in PRIMARY_TYPES)
            lines.append(
                f"#   {v.slug:<32} N={v.decks:>6,} resolved={v.resolved:>3}/{v.requested:<3} {row}"
            )

    return "\n".join(lines)
