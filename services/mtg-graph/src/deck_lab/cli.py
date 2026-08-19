"""Command line entry points: `uv run deck-lab <command>`."""

from __future__ import annotations

import logging

import structlog
import typer

app = typer.Typer(help="Deck Lab — graph-backed Commander deck advisor.", no_args_is_help=True)


def _configure_logging(verbose: bool) -> None:
    structlog.configure(
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if verbose else logging.INFO
        ),
        processors=[
            structlog.processors.add_log_level,
            structlog.dev.ConsoleRenderer(),
        ],
    )


@app.callback()
def main(verbose: bool = typer.Option(False, "--verbose", "-v", help="Per-batch logging.")) -> None:
    _configure_logging(verbose)


@app.command()
def ingest(
    force_download: bool = typer.Option(
        False, "--force-download", help="Re-download the bulk file even if the cache is current."
    ),
    batch_size: int = typer.Option(1_000, help="Cards per write transaction."),
) -> None:
    """Download the Scryfall oracle_cards bulk and load it into Neo4j."""
    from .ingest import ingest as run_ingest

    summary = run_ingest(force_download=force_download, batch_size=batch_size)
    for key, value in summary.items():
        typer.echo(f"{key:>12}: {value:,}")


@app.command("ingest-tags")
def ingest_tags(
    force_download: bool = typer.Option(False, "--force-download", help="Ignore the cache."),
) -> None:
    """Ingest the Scryfall Tagger ontology as Tag nodes and edges."""
    from .tagger import ingest_tags as run

    for key, value in run(force_download=force_download).items():
        typer.echo(f"{key:>16}: {value:,}")


@app.command("tag")
def tag(
    slug: str = typer.Argument(..., help="Tag slug, e.g. sacrifice-outlet"),
    limit: int = typer.Option(15, help="Example cards to show."),
) -> None:
    """Count and sample the cards under a tag, following the taxonomy."""
    from .graph import cards_for_tag, count_for_tag

    typer.echo(f"{slug}: {count_for_tag(slug):,} cards (including descendants)")
    for name in cards_for_tag(slug, limit=limit):
        typer.echo(f"  {name}")


@app.command("warm-edhrec")
def warm_edhrec(
    top: int = typer.Option(1000, help="Commanders to warm, by EDHREC rank."),
    delay: float = typer.Option(
        1.0, help="Seconds between network fetches — json.edhrec.com is unofficial."
    ),
) -> None:
    """Pre-fetch EDHREC for the most-played commanders."""
    from .edhrec import warm_top_commanders

    for key, value in warm_top_commanders(top, delay_seconds=delay).items():
        typer.echo(f"{key:>12}: {value:,}")


@app.command("ingest-combos")
def ingest_combos(
    force_download: bool = typer.Option(
        False, "--force-download", help="Re-download the bulk export even if the ETag matches."
    ),
) -> None:
    """Ingest Commander Spellbook combos as Combo nodes and USES edges."""
    from .spellbook import ingest_combos as run

    for key, value in run(force_download=force_download).items():
        typer.echo(f"{key:>16}: {value:,}")


@app.command("build-semantics")
def build_semantics() -> None:
    """Derive PRODUCES / CARES_ABOUT / FILLS_ROLE edges from the tag mapping."""
    from .graph import semantic_stats
    from .pipeline import run_build

    run_build()
    for key, value in semantic_stats().items():
        typer.echo(f"{key:>20}: {value:,}")


@app.command()
def bridge(
    resource: str = typer.Argument(..., help="Resource name, e.g. death_trigger"),
    limit: int = typer.Option(8, help="Pairs to show."),
) -> None:
    """Show the 2-hop bridge: cards that produce a resource, and cards that want it."""
    from .graph import bridge_sample
    from .vocabulary import Resource, is_bridge_resource

    pairs = bridge_sample(resource, limit=limit)
    if not pairs:
        try:
            supply_only = not is_bridge_resource(Resource(resource))
        except ValueError:
            supply_only = False

        if supply_only:
            typer.echo(
                f"{resource} is supply-only — cards provide it to the deck, nothing "
                "synergises with it. No bridge expected."
            )
            return

        typer.echo(f"No bridge pairs for {resource!r}. Two-sided resource with one side missing.")
        raise typer.Exit(1)

    for pair in pairs:
        typer.echo(f"  {pair['produces']}  ->  {pair['cares_about']}")


@app.command()
def diagnose(
    path: str = typer.Argument(..., help="Decklist file, one '<qty> <name>' per line."),
    speed: float = typer.Option(0.5, min=0.0, max=1.0, help="0 = battlecruiser, 1 = tuned."),
    balance_rows: int = typer.Option(12, help="Resource-balance rows to show."),
) -> None:
    """Run diagnostics on a decklist file, resolving names against the graph."""
    import re
    from pathlib import Path

    from .diagnostics import DeckEntry
    from .diagnostics import diagnose as run
    from .graph import resolve_names

    parsed: dict[str, int] = {}
    for line in Path(path).read_text().splitlines():
        if match := re.match(r"^\s*(\d+)x?\s+(.+?)\s*(?:\(|//|$)", line):
            parsed[match.group(2).strip()] = parsed.get(match.group(2).strip(), 0) + int(
                match.group(1)
            )

    if not parsed:
        typer.echo("No cards parsed.")
        raise typer.Exit(1)

    ids = resolve_names(list(parsed))
    missing = [name for name in parsed if name not in ids]
    # Recorded, not papered over: `DeckEntry.qty` is capped at 99 for the HTTP
    # surface, so a decklist line like `100 Plains` raises a ValidationError
    # traceback here rather than being clamped. Silently clamping a number the
    # user typed would be worse; a nicer message is the fix if it ever bites.
    entries = [DeckEntry(oracle_id=ids[name], qty=parsed[name]) for name in parsed if name in ids]

    report = run(entries, speed=speed)

    typer.echo(f"\n{report.deck_size} cards · {report.lands} lands · avg MV {report.average_mv}")
    typer.echo(f"template {report.template} · shape penalty {report.penalty}")
    if missing:
        typer.echo(f"unresolved: {', '.join(missing[:8])}")

    typer.echo("\nCOMPOSITION")
    for bucket in report.buckets:
        flag = {"ok": " ", "low": "-", "high": "+"}[bucket.status]
        typer.echo(
            f" {flag} {bucket.bucket:<16}{bucket.coverage:>6}   target {bucket.low}-{bucket.high}"
        )

    typer.echo("\nCURVE")
    for point in report.curve:
        label = f"{point.mv}+" if point.mv == 6 else str(point.mv)
        bar = "#" * int(point.count)
        typer.echo(f"  {label:>2} {point.count:>4.0f} (target {point.target:>4.1f})  {bar}")

    if report.themes:
        typer.echo(f"\nTHEMES  (consistency {report.consistency:.2f})")
        for share in report.themes[:6]:
            bar = "#" * int(share.share * 40)
            typer.echo(f"  {share.label:<22}{share.share * 100:>5.1f}%  {bar}")

    typer.echo("\nRESOURCE BALANCE  (wants vs makes)")
    for row in report.balance[:balance_rows]:
        marker = "<<" if row.gap > 0 else "  "
        typer.echo(f"  {marker} {row.resource:<28} wants {row.wanted:>3}   makes {row.produced:>3}")


@app.command("edhrec")
def edhrec(
    commander: str = typer.Argument(..., help="Commander name."),
    force: bool = typer.Option(False, "--force", help="Ignore the disk cache."),
    limit: int = typer.Option(12, help="Recommendations to show."),
) -> None:
    """Fetch a commander from EDHREC, persist RECOMMENDS edges, show top synergy."""
    from .edhrec import ingest_commander
    from .graph import recommendations_for

    summary = ingest_commander(commander, force=force)
    if not summary["fetched"]:
        typer.echo(f"EDHREC has no page for {commander!r}.")
        raise typer.Exit(1)

    typer.echo(f"fetched {summary['fetched']} cards, linked {summary['linked']} into the graph\n")
    for row in recommendations_for(commander, limit=limit):
        typer.echo(
            f"  {row['synergy']:+.3f}  {row['inclusion_rate'] * 100:5.1f}%  "
            f"{row['name']:<34} [{row['tag']}]"
        )


@app.command()
def combos(
    path: str = typer.Argument(..., help="Decklist file."),
    limit: int = typer.Option(10, help="Rows to show."),
) -> None:
    """Combos in a decklist, and combos one card short."""
    import re
    from pathlib import Path

    from .graph import oracle_ids_for_names
    from .spellbook import deck_combos

    names = [
        m.group(1).strip()
        for m in (
            re.match(r"^\s*\d+x?\s+(.+?)\s*$", line) for line in Path(path).read_text().splitlines()
        )
        if m
    ]
    if not names:
        typer.echo("No cards parsed.")
        raise typer.Exit(1)

    # The local path joins on oracle_id; names the graph cannot resolve would
    # vanish silently, so they are said out loud instead.
    resolved = oracle_ids_for_names(names)
    unresolved = [n for n in names if n not in resolved]
    if unresolved:
        typer.echo(f"unresolved: {', '.join(unresolved[:8])}\n")

    found = deck_combos(list(resolved.values()), names)
    complete = found["included"]
    one_short = sorted(
        (c for c in found["almost_included"] if len(c.missing) == 1),
        key=lambda c: -c.popularity,
    )

    typer.echo(f"{len(complete)} complete · {len(one_short)} one card short\n")

    for combo in complete[:limit]:
        typer.echo(f"  HAVE  {' + '.join(combo.card_names)}")
        typer.echo(f"        -> {', '.join(combo.produces[:2])}")

    for combo in one_short[:limit]:
        have = " + ".join(n for n in combo.card_names if n not in combo.missing)
        typer.echo(f"  ADD   {combo.missing[0]}")
        typer.echo(f"        completes {have} -> {combo.produces[0] if combo.produces else '?'}")


@app.command()
def suggest(
    path: str = typer.Argument(..., help="Decklist file."),
    limit: int = typer.Option(20, help="Suggestions to show."),
    max_price: float = typer.Option(None, help="Budget cap per card, USD."),
    speed: float = typer.Option(0.5, min=0.0, max=1.0, help="0 = battlecruiser, 1 = tuned."),
    focus: str = typer.Option(
        None, help='More of one thing: "landfall", "bucket:ramp", "resource:etb_trigger".'
    ),
    grouped: bool = typer.Option(True, help="Group by the gap each card closes."),
) -> None:
    """Ranked adds for a decklist, with provenance."""
    import re
    from pathlib import Path

    from .graph import resolve_names
    from .suggestions import suggest as run

    # Read the `Commander` header the way the frontend parser does, so the CLI
    # and the web path agree on which card is the commander rather than the CLI
    # falling back to inference on a list that says so explicitly.
    names: list[str] = []
    counts: dict[str, int] = {}
    commander_name: str | None = None
    section: str | None = None

    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if re.fullmatch(r"(sideboard|commander|companion|maybeboard|deck)", stripped, re.I):
            section = stripped.lower()
            continue
        if match := re.match(r"^\s*\d+x?\s+(.+?)\s*$", line):
            name = match.group(1).strip()
            names.append(name)
            if section == "commander" and commander_name is None:
                commander_name = name

    ids = resolve_names(names)
    quantities = {oid: counts.get(name, 1) for name, oid in ids.items()}
    report = run(
        list(ids.values()),
        names,
        quantities=quantities,
        commander_oracle_id=ids.get(commander_name) if commander_name else None,
        limit=limit,
        max_price=max_price,
        speed=speed,
        focus=focus,
    )

    if report.commander:
        tag = " (inferred)" if report.commander_inferred else ""
        typer.echo(f"commander: {report.commander}{tag} · identity {''.join(report.identity)}")
    scope = f" · focused on {report.focus.label}" if report.focus else ""
    typer.echo(f"{report.considered} candidates considered{scope}\n")

    for note in report.notes:
        typer.echo(f"  ! {note}")
    if report.notes:
        typer.echo("")

    def show(suggestion) -> None:
        channels = "+".join(sorted({p.channel.split("_")[0] for p in suggestion.provenance}))
        flag = " GC" if suggestion.game_changer else ""
        typer.echo(f"  {suggestion.score:>5.1f}  {suggestion.name:<32} [{channels}]{flag}")
        for prov in suggestion.provenance:
            typer.echo(f"          {prov.detail}")

    if grouped and report.groups:
        for group in report.groups:
            reason = f"  ({group.reason})" if group.reason else ""
            typer.echo(f"{group.label.upper()}{reason}")
            for suggestion in group.suggestions:
                show(suggestion)
            typer.echo("")
    else:
        for suggestion in report.suggestions:
            show(suggestion)


@app.command()
def typal(
    creature_type: str = typer.Argument(..., help="Creature type, e.g. Crab"),
    limit: int = typer.Option(8, help="Pairs to show."),
) -> None:
    """Payoffs for a creature type, and the bodies that satisfy them."""
    from .graph import typal_bridge

    pairs = typal_bridge(creature_type, limit=limit)
    if not pairs:
        typer.echo(f"No typal bridge for {creature_type!r}.")
        raise typer.Exit(1)

    for pair in pairs:
        typer.echo(f"  {pair['payoff']}  ->  {pair['body']}")


@app.command()
def search(
    produces: str = typer.Option(None, help="Comma-separated resources the card supplies."),
    cares: str = typer.Option(None, help="Comma-separated resources the card wants."),
    role: str = typer.Option(None, help="Comma-separated roles."),
    theme: str = typer.Option(None, help="Comma-separated theme ids."),
    is_type: str = typer.Option(None, "--type", help="Comma-separated creature types."),
    identity: str = typer.Option(None, help="Colour identity to fit inside, e.g. WUB."),
    max_price: float = typer.Option(None, help="Budget cap, USD."),
    game_changers: bool = typer.Option(None, help="Only, or exclude, Game Changers."),
    sort: str = typer.Option("playability", help="playability|price|cmc|name|rank"),
    limit: int = typer.Option(15),
) -> None:
    """Search the graph for what Scryfall cannot express."""
    from .search import SearchQuery
    from .search import search as run

    def split(value):
        return [x.strip() for x in value.split(",") if x.strip()] if value else []

    query = SearchQuery(
        produces=split(produces),
        cares_about=split(cares),
        roles=split(role),
        themes=split(theme),
        creature_types=split(is_type),
        identity=list(identity.upper()) if identity else None,
        max_price=max_price,
        game_changers=game_changers,
        sort=sort,
        limit=limit,
    )

    rows = run(query)
    if not rows:
        typer.echo("No cards matched.")
        raise typer.Exit(1)

    for row in rows:
        flag = "GC" if row["game_changer"] else "  "
        price = f"${row['price_usd']:.2f}" if row["price_usd"] else "     —"
        typer.echo(
            f"  {row['playability']:.2f} {flag} {price:>8}  {row['name'][:38]:<40}"
            f"{row['mana_cost']}"
        )


@app.command()
def swaps(
    path: str = typer.Argument(..., help="Decklist file."),
    focus: str = typer.Option(None, help='e.g. "landfall" or "bucket:ramp".'),
    speed: float = typer.Option(0.5, min=0.0, max=1.0),
    limit: int = typer.Option(8, help="Adds to pair."),
    per_add: int = typer.Option(2, help="Cut partners per add."),
) -> None:
    """Adds paired with the cuts that make room for them."""
    import re
    from pathlib import Path

    from .cuts import suggest_swaps
    from .graph import resolve_names

    names: list[str] = []
    counts: dict[str, int] = {}
    commander_name: str | None = None
    section: str | None = None

    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if re.fullmatch(r"(sideboard|commander|companion|maybeboard|deck)", stripped, re.I):
            section = stripped.lower()
            continue
        if match := re.match(r"^\s*(\d+)x?\s+(.+?)\s*$", line):
            name = match.group(2).strip()
            names.append(name)
            counts[name] = counts.get(name, 0) + int(match.group(1))
            if section == "commander" and commander_name is None:
                commander_name = name

    ids = resolve_names(names)
    result = suggest_swaps(
        list(ids.values()),
        names,
        quantities={oid: counts.get(name, 1) for name, oid in ids.items()},
        commander_oracle_id=ids.get(commander_name) if commander_name else None,
        speed=speed,
        focus=focus,
        limit=limit,
        per_add=per_add,
    )

    if not result["swaps"]:
        typer.echo("No swap pairs — nothing shares a role with a viable cut.")
        raise typer.Exit(1)

    current = None
    for swap in result["swaps"]:
        if swap.add_name != current:
            current = swap.add_name
            typer.echo(f"\nADD  {swap.add_name}")
        typer.echo(f"  cut  {swap.cut.name:<28} [{', '.join(swap.shared_roles)}]")
        for reason in swap.cut.reasons[:2]:
            typer.echo(f"       {reason}")


@app.command()
def replace(
    path: str = typer.Argument(..., help="Decklist file."),
    card: str = typer.Argument(..., help="Card to replace, by name."),
    speed: float = typer.Option(0.5, min=0.0, max=1.0),
    limit: int = typer.Option(6),
) -> None:
    """Shape-preserving alternatives to one card."""
    import re
    from pathlib import Path

    from .cuts import find_replacements
    from .graph import resolve_names

    names: list[str] = []
    counts: dict[str, int] = {}
    commander_name: str | None = None
    section: str | None = None

    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if re.fullmatch(r"(sideboard|commander|companion|maybeboard|deck)", stripped, re.I):
            section = stripped.lower()
            continue
        if match := re.match(r"^\s*(\d+)x?\s+(.+?)\s*$", line):
            name = match.group(2).strip()
            names.append(name)
            counts[name] = counts.get(name, 0) + int(match.group(1))
            if section == "commander" and commander_name is None:
                commander_name = name

    ids = resolve_names(names)
    target = ids.get(card) or next((v for k, v in ids.items() if k.lower() == card.lower()), None)
    if target is None:
        typer.echo(f"{card!r} is not in this decklist.")
        raise typer.Exit(1)

    result = find_replacements(
        list(ids.values()),
        names,
        target,
        quantities={oid: counts.get(name, 1) for name, oid in ids.items()},
        commander_oracle_id=ids.get(commander_name) if commander_name else None,
        speed=speed,
        limit=limit,
    )

    for note in result["notes"]:
        typer.echo(f"  ! {note}")

    if not result["replacements"]:
        raise typer.Exit(1)

    typer.echo(f"\nreplacing {result['target']['name']}\n")
    for option in result["replacements"]:
        arrow = "improves" if option.delta and option.delta.improves else "holds"
        price = f"  {option.delta.price_change:+.2f} USD" if option.delta.price_change else ""
        typer.echo(f"  {option.name:<30} [{', '.join(option.shared_roles)}] {arrow}{price}")
        for bucket in option.delta.buckets if option.delta else []:
            if bucket.moved:
                typer.echo(
                    f"       {bucket.bucket}: {bucket.before} -> {bucket.after}"
                    f"  (target {bucket.low}-{bucket.high})"
                )
        for reason in option.reasons[:1]:
            typer.echo(f"       {reason}")


@app.command()
def fill(
    path: str = typer.Argument(..., help="Incomplete decklist file."),
    speed: float = typer.Option(0.5, min=0.0, max=1.0),
    focus: str = typer.Option(None, help='e.g. "landfall".'),
    budget: float = typer.Option(None, help="Total budget for the added cards, USD."),
    deck_size: int = typer.Option(99, help="Target size, excluding the commander."),
) -> None:
    """Fill an incomplete deck to a full 99, respecting the chosen ratios."""
    import re
    from pathlib import Path

    from .graph import resolve_names
    from .solver import fill_deck

    names: list[str] = []
    counts: dict[str, int] = {}
    commander_name: str | None = None
    section: str | None = None

    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if re.fullmatch(r"(sideboard|commander|companion|maybeboard|deck)", stripped, re.I):
            section = stripped.lower()
            continue
        if match := re.match(r"^\s*(\d+)x?\s+(.+?)\s*$", line):
            name = match.group(2).strip()
            names.append(name)
            counts[name] = counts.get(name, 0) + int(match.group(1))
            if section == "commander" and commander_name is None:
                commander_name = name

    ids = resolve_names(names)
    result = fill_deck(
        list(ids.values()),
        names,
        quantities={oid: counts.get(name, 1) for name, oid in ids.items()},
        commander_oracle_id=ids.get(commander_name) if commander_name else None,
        speed=speed,
        focus=focus,
        budget=budget,
        deck_size=deck_size,
    )

    for note in result.notes:
        typer.echo(f"  ! {note}")

    typer.echo(f"\n{result.status} · {result.slots} slots · {result.solve_ms:.0f}ms")
    if not result.solved:
        raise typer.Exit(1)

    typer.echo(f"total added price ${result.total_price:.2f}\n")
    typer.echo("RESULTING COMPOSITION  (before -> after)")
    for bucket, value in sorted(result.coverage.items()):
        low, high = result.targets[bucket]
        before = result.base_coverage.get(bucket, 0.0)
        flag = " " if low - 0.01 <= value <= high + 0.01 else "!"
        typer.echo(f" {flag} {bucket:<16}{before:>6} -> {value:<6}  target {low}-{high}")

    typer.echo(f"\nADDING {len(result.chosen)}")
    for card in result.chosen:
        price = f"${card.price_usd:.2f}" if card.price_usd else "    —"
        typer.echo(f"  {card.score:>5.1f}  {price:>8}  {card.name}")


@app.command("eval")
def evaluate_cmd(
    commanders: str = typer.Argument(
        ...,
        help="Semicolon-separated commander names — they contain commas, "
        'e.g. "Atraxa, Praetors\' Voice; Tatyova, Benthic Druid".',
    ),
    k: int = typer.Option(25, help="Suggestions per case."),
    hold_out: int = typer.Option(10, help="Distinctive cards masked per commander."),
    seed: int = typer.Option(7, help="Sampling seed, so a run is reproducible."),
) -> None:
    """Measure whether the mechanical layer beats generic popularity."""
    from .evaluate import evaluate

    names = [c.strip() for c in commanders.split(";") if c.strip()]
    report = evaluate(names, k=k, hold_out=hold_out, seed=seed)

    for note in report.notes:
        typer.echo(f"  ! {note}")

    if not report.commanders:
        typer.echo("No usable cases.")
        raise typer.Exit(1)

    typer.echo(
        f"\n{len(report.commanders)} commanders · k={report.k} · "
        f"{report.arms[0].held_out} held-out cards\n"
    )
    typer.echo(f"{'arm':<22}{'recall@k':>10}{'novelty@k':>11}{'creature@k':>12}{'hits':>7}")
    typer.echo("-" * 62)
    for arm in report.arms:
        typer.echo(
            f"{arm.arm:<22}{arm.recall_at_k:>10.3f}{arm.novelty_at_k:>11.3f}"
            f"{arm.creature_share_at_k:>12.3f}{arm.hits:>7}"
        )

    if report.per_channel_hits:
        typer.echo("\nhits by channel (mechanical arm — which layer actually found them)")
        for channel, count in sorted(report.per_channel_hits.items(), key=lambda kv: -kv[1]):
            typer.echo(f"  {channel:<22}{count:>5}")


@app.command()
def audit() -> None:
    """Health of the extraction layer: half-wired and dead resources."""
    from .audit import audit as run

    report = run()

    typer.echo(f"vocabulary health {report.score() * 100:.0f}%  ({len(report.healthy)} wired)\n")

    if report.orphaned_consumers:
        typer.echo(
            f"CONSUMERS WITH NO PRODUCER  ({len(report.orphaned_consumers)}) — bridges to nothing"
        )
        for row in report.orphaned_consumers:
            typer.echo(f"  {row.resource:<30} wanted by {row.wanted_by:>5}, produced by none")

    if report.orphaned_producers:
        typer.echo(
            f"\nPRODUCERS WITH NO CONSUMER  ({len(report.orphaned_producers)})"
            " — not marked supply-only"
        )
        for row in report.orphaned_producers:
            typer.echo(f"  {row.resource:<30} produced by {row.produced_by:>5}, wanted by none")

    if report.dead:
        typer.echo(f"\nNO EDGES AT ALL  ({len(report.dead)})")
        typer.echo("  " + ", ".join(r.resource for r in report.dead))

    if report.unmapped_roles:
        typer.echo(f"\nROLES NO CARD FILLS  ({len(report.unmapped_roles)})")
        typer.echo("  " + ", ".join(report.unmapped_roles))

    if report.unreachable_roles:
        typer.echo(f"\nROLES IN NO BUCKET  ({len(report.unreachable_roles)})")
        typer.echo("  " + ", ".join(report.unreachable_roles))


@app.command()
def schema() -> None:
    """Apply constraints and indexes without ingesting."""
    from .graph import apply_schema

    apply_schema()
    typer.echo("Schema applied.")


@app.command()
def stats() -> None:
    """Print node counts from the graph."""
    from .graph import stats as run_stats

    for key, value in run_stats().items():
        typer.echo(f"{key:>12}: {value:,}")


@app.command()
def wipe(
    yes: bool = typer.Option(False, "--yes", help="Skip the confirmation prompt."),
) -> None:
    """Delete all Card nodes."""
    from .graph import wipe as run_wipe

    if not yes:
        typer.confirm("Delete every Card node?", abort=True)

    run_wipe()
    typer.echo("Cards deleted.")


@app.command()
def ping() -> None:
    """Check that Neo4j is reachable."""
    from .config import settings
    from .graph import verify_connectivity

    verify_connectivity()
    typer.echo(f"Connected to {settings.neo4j_uri}")


if __name__ == "__main__":
    app()
