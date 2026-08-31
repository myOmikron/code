"""Neo4j access — schema management and batched writes."""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from threading import Lock
from typing import Any

import structlog
from neo4j import Driver, GraphDatabase

from .config import settings
from .models import Card
from .poolquery import PoolFilter

log = structlog.get_logger(__name__)

# Constraints double as indexes in Neo4j, so oracle_id needs no separate index.
SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT card_oracle_id IF NOT EXISTS FOR (c:Card) REQUIRE c.oracle_id IS UNIQUE",
    "CREATE INDEX card_name IF NOT EXISTS FOR (c:Card) ON (c.name)",
    # Every candidate query filters on colour identity and commander legality
    # before anything else, so these carry the hard-filter stage.
    "CREATE INDEX card_color_identity IF NOT EXISTS FOR (c:Card) ON (c.color_identity)",
    "CREATE INDEX card_can_be_commander IF NOT EXISTS FOR (c:Card) ON (c.can_be_commander)",
    "CREATE INDEX card_cmc IF NOT EXISTS FOR (c:Card) ON (c.cmc)",
    "CREATE INDEX card_edhrec_rank IF NOT EXISTS FOR (c:Card) ON (c.edhrec_rank)",
    "CREATE INDEX card_playability IF NOT EXISTS FOR (c:Card) ON (c.playability)",
    "CREATE INDEX card_game_changer IF NOT EXISTS FOR (c:Card) ON (c.game_changer)",
    # The search box types into 32k cards. `card_name` above is a RANGE index,
    # which a `CONTAINS` predicate cannot use, so name search was a full label
    # scan; this is what makes it a lookup. Both fields are indexed together so
    # one query can rank name hits above rules-text hits — see `search.py`.
    "CREATE FULLTEXT INDEX card_text IF NOT EXISTS FOR (c:Card) ON EACH [c.name, c.oracle_text]",
    "CREATE CONSTRAINT combo_id IF NOT EXISTS FOR (k:Combo) REQUIRE k.id IS UNIQUE",
]

UPSERT_CARDS = """
UNWIND $rows AS row
MERGE (c:Card {oracle_id: row.oracle_id})
SET c += row
"""


_driver: Driver | None = None
_driver_lock = Lock()


@contextmanager
def driver() -> Iterator[Driver]:
    """Yield the process-wide driver.

    One driver per process: a Driver owns a connection pool, and the previous
    build-and-close-per-call paid a TCP connect, Bolt handshake, and auth for
    every query — /suggestions makes ~16 of them. Still a context manager so
    the existing `with driver()` call sites keep their shape; the pool
    deliberately outlives the block.
    """
    global _driver
    if _driver is None:
        with _driver_lock:
            if _driver is None:
                _driver = GraphDatabase.driver(
                    settings.neo4j_uri,
                    auth=(settings.neo4j_user, settings.neo4j_password),
                )
    yield _driver


def close_driver() -> None:
    """Close and discard the shared driver — process shutdown, or tests that
    repoint `settings.neo4j_uri` after a driver was already built."""
    global _driver
    with _driver_lock:
        if _driver is not None:
            _driver.close()
            _driver = None


def verify_connectivity() -> None:
    with driver() as instance:
        instance.verify_connectivity()


def apply_schema() -> None:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for statement in SCHEMA_STATEMENTS:
            session.run(statement)
    log.info("schema.applied", statements=len(SCHEMA_STATEMENTS))


def _batched(items: Iterable[Card], size: int) -> Iterator[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    for item in items:
        batch.append(item.model_dump())
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def upsert_cards(cards: Iterable[Card], *, batch_size: int = 1_000) -> int:
    """Write cards, keyed on oracle_id. Returns the number written."""
    written = 0

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for batch in _batched(cards, batch_size):
            session.execute_write(lambda tx, rows=batch: tx.run(UPSERT_CARDS, rows=rows).consume())
            written += len(batch)
            log.debug("cards.batch", written=written)

    return written


def card_count() -> int:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return session.run("MATCH (c:Card) RETURN count(c) AS n").single()["n"]


def stats() -> dict[str, int]:
    """Cheap sanity counts, used by `deck-lab stats` and the ingestion summary."""
    query = """
    MATCH (c:Card)
    RETURN count(c) AS cards,
           count(CASE WHEN c.can_be_commander THEN 1 END) AS commanders,
           count(CASE WHEN c.is_land THEN 1 END) AS lands,
           count(CASE WHEN c.is_creature THEN 1 END) AS creatures,
           count(CASE WHEN c.oracle_text = '' THEN 1 END) AS vanilla
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def bootstrap_state() -> dict[str, int]:
    """What the graph already holds, one round trip, in constant time.

    Read by `bootstrap.py` on every container start to decide which loads are
    still missing, so it has to stay cheap enough to pay for nothing. Each
    count is a count-store lookup: the relationship patterns are deliberately
    unlabelled at both ends, because naming a node label there turns the
    lookup into a scan of every card.

    Counting the graph rather than a marker file is the point — a `down -v`
    empties the store, and a marker would still claim the corpus was loaded.
    """
    query = """
    CALL () { MATCH (c:Card) RETURN count(c) AS cards }
    CALL () { MATCH ()-[t:TAGGED]->() RETURN count(t) AS taggings }
    CALL () { MATCH ()-[f:FILLS_ROLE]->() RETURN count(f) AS role_edges }
    CALL () { MATCH (k:Combo) RETURN count(k) AS combos }
    RETURN cards, taggings, role_edges, combos
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def wipe() -> None:
    """Drop all Card nodes. Schema is left in place."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run("MATCH (c:Card) CALL (c) { DETACH DELETE c } IN TRANSACTIONS OF 10000 ROWS")
    log.info("graph.wiped")


# --------------------------------------------------------------------------
# Scryfall Tagger
# --------------------------------------------------------------------------

TAG_SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT tag_id IF NOT EXISTS FOR (t:Tag) REQUIRE t.id IS UNIQUE",
    "CREATE INDEX tag_slug IF NOT EXISTS FOR (t:Tag) ON (t.slug)",
]

UPSERT_TAGS = """
UNWIND $rows AS row
MERGE (t:Tag {id: row.id})
SET t.slug = row.slug, t.description = row.description
"""

# Direct taggings only. Closure is a traversal, not stored data — materialising
# it would turn ~200k edges into roughly a million for no query benefit.
UPSERT_TAGGINGS = """
UNWIND $rows AS row
MATCH (t:Tag {id: row.tag_id})
UNWIND row.oracle_ids AS oid
MATCH (c:Card {oracle_id: oid})
MERGE (c)-[:TAGGED]->(t)
"""

UPSERT_TAG_HIERARCHY = """
UNWIND $rows AS row
MATCH (parent:Tag {id: row.tag_id})
UNWIND row.child_ids AS cid
MATCH (child:Tag {id: cid})
MERGE (parent)-[:PARENT_OF]->(child)
"""


def apply_tag_schema() -> None:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for statement in TAG_SCHEMA_STATEMENTS:
            session.run(statement)
    log.info("tag_schema.applied", statements=len(TAG_SCHEMA_STATEMENTS))


def _chunks(items: list[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def upsert_tags(tags: Iterable[Any], *, batch_size: int = 5_000) -> int:
    rows = [{"id": t.id, "slug": t.slug, "description": t.description} for t in tags]

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for chunk in _chunks(rows, batch_size):
            session.execute_write(lambda tx, c=chunk: tx.run(UPSERT_TAGS, rows=c).consume())

    log.info("tags.written", count=len(rows))
    return len(rows)


def upsert_tag_edges(tags: Iterable[Any], *, batch_size: int = 5_000) -> tuple[int, int]:
    """Write TAGGED (card -> tag) and PARENT_OF (tag -> tag) edges."""
    tags = list(tags)
    taggings = [{"tag_id": t.id, "oracle_ids": t.oracle_ids} for t in tags if t.oracle_ids]
    hierarchy = [{"tag_id": t.id, "child_ids": t.child_ids} for t in tags if t.child_ids]

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for chunk in _chunks(taggings, batch_size):
            session.execute_write(lambda tx, c=chunk: tx.run(UPSERT_TAGGINGS, rows=c).consume())
        for chunk in _chunks(hierarchy, batch_size):
            session.execute_write(
                lambda tx, c=chunk: tx.run(UPSERT_TAG_HIERARCHY, rows=c).consume()
            )

    log.info("tag_edges.written", tagged_batches=len(taggings), hierarchy_batches=len(hierarchy))
    return len(taggings), len(hierarchy)


def tag_stats() -> dict[str, int]:
    query = """
    MATCH (t:Tag)
    WITH count(t) AS tags
    MATCH ()-[r:TAGGED]->()
    WITH tags, count(r) AS taggings
    MATCH ()-[p:PARENT_OF]->()
    WITH tags, taggings, count(p) AS hierarchy_edges
    MATCH (c:Card) WHERE (c)-[:TAGGED]->()
    RETURN tags, taggings, hierarchy_edges, count(c) AS tagged_cards
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def cards_for_tag(slug: str, *, limit: int = 25) -> list[str]:
    """Cards carrying `slug` or any descendant of it — the closure traversal.

    This is why the hierarchy is stored: `sacrifice-outlet` has no direct
    taggings, so a non-transitive query returns nothing.

    The traversal is unbounded rather than capped. The deepest chain in the
    live taxonomy is exactly 6 levels (`tutor`), so any fixed bound would sit
    on the boundary and silently truncate the day Tagger adds a level. The
    hierarchy is acyclic and small, so unbounded is cheap.
    """
    query = """
    MATCH (root:Tag {slug: $slug})-[:PARENT_OF*0..]->(t:Tag)<-[:TAGGED]-(c:Card)
    RETURN DISTINCT c.name AS name
    ORDER BY name
    LIMIT $limit
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [record["name"] for record in session.run(query, slug=slug, limit=limit)]


# --------------------------------------------------------------------------
# Semantic layer: Resource / Role edges derived from the tag mapping
# --------------------------------------------------------------------------

SEMANTIC_SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT resource_name IF NOT EXISTS FOR (r:Resource) REQUIRE r.name IS UNIQUE",
    "CREATE CONSTRAINT role_name IF NOT EXISTS FOR (r:Role) REQUIRE r.name IS UNIQUE",
]

# The resource node is merged once, before the traversal, so it is not
# re-merged per matched card.
# `$excludes` subtracts whole subtrees from the closure — see `TagMapping`.
# The exclusion is by *card*, not by tag: a card reachable through both the
# excluded subtree and some other branch of the same root is still excluded,
# which is the conservative reading and the one the polarity cases want.
_LINK_RESOURCE = """
MERGE (r:Resource {name: $name})
WITH r
MATCH (root:Tag {slug: $slug})-[:PARENT_OF*0..]->(:Tag)<-[:TAGGED]-(c:Card)
WHERE NOT EXISTS {
    MATCH (c)-[:TAGGED]->(:Tag)<-[:PARENT_OF*0..]-(x:Tag)
    WHERE x.slug IN $excludes
}
WITH DISTINCT r, c
MERGE (c)-[e:%s]->(r)
SET e.source = coalesce(e.source, 'tagger')
RETURN count(c) AS n
"""

# Several tags map to the same role at different strengths — `removal` (0.5)
# and `spot-removal` (1.0) both hit the same card. Take the strongest evidence
# rather than summing, which would inflate the quota coverage.
_LINK_ROLE = """
MERGE (rl:Role {name: $name})
WITH rl
MATCH (root:Tag {slug: $slug})-[:PARENT_OF*0..]->(:Tag)<-[:TAGGED]-(c:Card)
WHERE NOT ($lands_exempt AND coalesce(c.is_land, false))
WITH DISTINCT rl, c
MERGE (c)-[f:FILLS_ROLE]->(rl)
ON CREATE SET f.weight = $weight, f.source = 'tagger'
ON MATCH SET f.weight = CASE WHEN f.weight < $weight THEN $weight ELSE f.weight END
RETURN count(c) AS n
"""


def apply_semantic_schema() -> None:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for statement in SEMANTIC_SCHEMA_STATEMENTS:
            session.run(statement)
    log.info("semantic_schema.applied", statements=len(SEMANTIC_SCHEMA_STATEMENTS))


BUILD_HIERARCHY = """
UNWIND $rows AS row
MERGE (child:Resource {name: row.child})
MERGE (parent:Resource {name: row.parent})
MERGE (child)-[:BROADER]->(parent)
"""


def build_resource_hierarchy(parents: dict[Any, tuple[Any, ...]]) -> int:
    """Write BROADER edges so narrow resources satisfy broad queries."""
    rows = [
        {"child": str(child), "parent": str(parent)}
        for child, tuple_ in parents.items()
        for parent in tuple_
    ]
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run(BUILD_HIERARCHY, rows=rows)
    log.info("hierarchy.built", edges=len(rows))
    return len(rows)


def clear_semantics() -> None:
    """Drop derived edges so a rebuild reflects removed mappings.

    MERGE is additive: without this, retiring a mapping leaves its edges behind
    forever. The layer is cheap to rebuild (~5s), so always start clean.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run(
            "MATCH ()-[r:PRODUCES|CARES_ABOUT|FILLS_ROLE]->() "
            "CALL (r) { DELETE r } IN TRANSACTIONS OF 20000 ROWS"
        )
    log.info("semantics.cleared")


def build_semantics(mappings: dict[str, Any], *, clear: bool = True) -> dict[str, int]:
    """Materialise PRODUCES / CARES_ABOUT / FILLS_ROLE from the tag mapping.

    `clear` defaults to True for standalone use; the pipeline passes False
    because it owns the clear step and runs it first.
    """
    apply_semantic_schema()
    if clear:
        clear_semantics()
    counts = {"produces": 0, "cares_about": 0, "fills_role": 0, "slugs_matched": 0}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for slug, mapping in mappings.items():
            matched = 0

            excludes = list(mapping.excludes)

            for resource in mapping.produces:
                query = _LINK_RESOURCE % "PRODUCES"
                n = session.run(query, slug=slug, name=str(resource), excludes=excludes).single()[
                    "n"
                ]
                counts["produces"] += n
                matched = max(matched, n)

            for resource in mapping.cares_about:
                query = _LINK_RESOURCE % "CARES_ABOUT"
                n = session.run(query, slug=slug, name=str(resource), excludes=excludes).single()[
                    "n"
                ]
                counts["cares_about"] += n
                matched = max(matched, n)

            for role, weight in mapping.roles:
                n = session.run(
                    _LINK_ROLE,
                    slug=slug,
                    name=str(role),
                    weight=float(weight),
                    lands_exempt=mapping.lands_exempt,
                ).single()["n"]
                counts["fills_role"] += n
                matched = max(matched, n)

            if matched:
                counts["slugs_matched"] += 1
            else:
                log.warning("mapping.no_cards", slug=slug)

    log.info("semantics.built", **counts)
    return counts


DERIVE_PAYOFF = """
MERGE (rl:Role {name: 'payoff'})
WITH rl
MATCH (c:Card)-[:CARES_ABOUT]->(:Resource)
WHERE NOT (c)-[:FILLS_ROLE]->(:Role)
WITH DISTINCT rl, c
MERGE (c)-[f:FILLS_ROLE]->(rl)
ON CREATE SET f.weight = $weight
RETURN count(c) AS n
"""


def derive_payoff_role(weight: float) -> int:
    """A card that wants a resource but fills no other role is a synergy payoff.

    Tagger has no `payoff` tag — the concept is relational, not intrinsic. This
    derivation fills the largest composition bucket without inventing one.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        n = session.run(DERIVE_PAYOFF, weight=float(weight)).single()["n"]
    log.info("payoff.derived", cards=n)
    return n


# Layer A: exact structural facts correcting Layer B's tag inference.
STRUCTURAL_CORRECTIONS = [
    # Every land is a mana source. Tagger only tags *interesting* lands, so
    # basics would otherwise carry no role at all.
    #
    # At half weight when the land is a transform card's *back* face: Search
    # for Azcanta is an enchantment until it flips, and full weight counted
    # it as much a mana source as an Island — measured on a real deck, whose
    # mana-sources coverage read one high per copy. MDFCs keep full weight
    # (their land face is simply playable), and a transform card whose front
    # already is a land (Westvale Abbey) is untouched by the front-face
    # check. Mirrors `_BACK_FACE_SHARE` in composition.py — the same
    # judgment, made once per axis.
    (
        "lands_fill_land_role",
        """
        MERGE (rl:Role {name: 'land'})
        WITH rl
        MATCH (c:Card) WHERE c.is_land
        MERGE (c)-[f:FILLS_ROLE]->(rl)
        ON CREATE SET f.weight = CASE
            WHEN c.layout IN ['transform', 'flip']
                 AND NOT split(c.type_line, ' // ')[0] CONTAINS 'Land'
            THEN 0.5 ELSE 1.0 END
        RETURN count(c) AS n
        """,
    ),
    # An artifact *is* what "artifacts matter" counts, and an enchantment is
    # what an enchantress payoff counts. Tagger tags the payoffs but nothing
    # tags "this card is an artifact" — it is on the type line, exactly.
    (
        "permanents_supply_their_own_type",
        """
        MERGE (a:Resource {name: 'artifact_matters'})
        MERGE (e:Resource {name: 'enchantment_matters'})
        MERGE (au:Resource {name: 'aura_matters'})
        MERGE (eq:Resource {name: 'equipment_matters'})
        MERGE (v:Resource {name: 'vehicle_matters'})
        WITH a, e, au, eq, v
        MATCH (c:Card)
        WHERE c.type_line CONTAINS 'Artifact' OR c.type_line CONTAINS 'Enchantment'
        FOREACH (_ IN CASE WHEN c.type_line CONTAINS 'Artifact' THEN [1] ELSE [] END |
            MERGE (c)-[r1:PRODUCES]->(a) SET r1.source = 'structural')
        FOREACH (_ IN CASE WHEN c.type_line CONTAINS 'Enchantment' THEN [1] ELSE [] END |
            MERGE (c)-[r2:PRODUCES]->(e) SET r2.source = 'structural')
        FOREACH (_ IN CASE WHEN c.type_line CONTAINS 'Aura' THEN [1] ELSE [] END |
            MERGE (c)-[r3:PRODUCES]->(au) SET r3.source = 'structural')
        FOREACH (_ IN CASE WHEN c.type_line CONTAINS 'Equipment' THEN [1] ELSE [] END |
            MERGE (c)-[r4:PRODUCES]->(eq) SET r4.source = 'structural')
        FOREACH (_ IN CASE WHEN c.type_line CONTAINS 'Vehicle' THEN [1] ELSE [] END |
            MERGE (c)-[r5:PRODUCES]->(v) SET r5.source = 'structural')
        RETURN count(c) AS n
        """,
    ),
    # Every legendary permanent is what a legends payoff counts — same argument
    # as artifacts above, read off `is_legendary` rather than the type line.
    # NOT hung under `artifact_matters` in RESOURCE_PARENTS: that would gate
    # every legends payoff into the Artifacts theme.
    #
    # Known cost, measured before shipping: 4,134 producers mean a legends
    # deck's makes side dwarfs its wants side, so the resource bridge will
    # rarely fire on `legendary_matters` (gap = wants - makes). The theme axis
    # is unaffected — it gates on cares — and `artifact_matters` has the
    # identical 3,595/1,012 shape. If the eval regresses, this rule is the
    # first thing to pull; the theme scores identically without it.
    (
        "legendaries_supply_legendary_matters",
        """
        MERGE (r:Resource {name: 'legendary_matters'})
        WITH r
        MATCH (c:Card) WHERE c.is_legendary
        MERGE (c)-[e:PRODUCES]->(r)
        SET e.source = 'structural'
        RETURN count(c) AS n
        """,
    ),
    # Every creature printed at power 4 or greater supplies "a big creature" —
    # the Ferocious line, rules-anchored. Same known-cost shape as
    # `legendary_matters` above: thousands of producers mean the bridge rarely
    # fires on this resource (gap = wants - makes); the theme axis gates on
    # cares and is unaffected. Known gap, recorded: cards whose power is
    # defined by a characteristic (`Multani`, power "*") carry `power = null`
    # and are not producers, even when the board makes them enormous.
    (
        "big_creatures_supply_high_power",
        """
        MERGE (r:Resource {name: 'high_power'})
        WITH r
        MATCH (c:Card) WHERE c.is_creature AND c.power >= 4
        MERGE (c)-[e:PRODUCES]->(r)
        SET e.source = 'structural'
        RETURN count(c) AS n
        """,
    ),
    # A tax you pay yourself is not a tax on the table. `cost-increaser` and
    # `prevent-cast` both contain cards that raise the cost of *their own
    # controller's* spells — the Leech cycle, Derelor, Steel Golem, Grid Monitor
    # — and a stax profile built on them would recommend taxing yourself.
    #
    # The discriminator is deliberately conservative: a card is self-facing only
    # if it has a self-tax clause and **no opponent-facing clause at all**. A
    # looser test removes Grand Arbiter Augustin IV, whose text opens "White
    # spells you cast cost {1} less" before it taxes anyone, and Hinata and Ward
    # of Bones the same way. Removing the canonical taxer would be worse than
    # the bug this fixes.
    #
    # Measured pre-widening: 131 cards in the two closures, 10 removed. The
    # symbol group now matches one-or-more mana symbols (Jade Leech's "{G}{G}
    # more" needs it), so those counts are stale — re-measure on a populated
    # graph before citing them. Nullhide Ferox is a known miss — genuinely
    # self-facing and not caught — and is left recorded rather than chased
    # with a looser pattern.
    (
        "self_facing_tax_is_not_a_tax",
        """
        MATCH (c:Card)-[t:PRODUCES]->(:Resource {name: 'tax_effect'})
        WHERE c.oracle_text IS NOT NULL
          AND c.oracle_text =~ '(?si).*(spells you cast cost (?:\\\\{[^}]+\\\\})+ more'
              + '|you can.t cast).*'
          AND NOT c.oracle_text =~ '(?si).*(opponents? (who |that )?[^.]{0,40}'
              + '(cast|control|can.t)|each opponent).*'
        DELETE t
        RETURN count(*) AS n
        """,
    ),
    # A sacrificed land does not die. "Dies" means a *creature* going to the
    # graveyard from the battlefield, so Blood Artist and Zulaport Cutthroat do
    # not see a land sacrifice — but Tagger's `sacrifice-outlet` closure maps
    # every outlet to `death_trigger`, and Hearthhull, the Worldseed (which can
    # only sacrifice lands) came out reading as an aristocrats enabler.
    #
    # Only cards whose sacrifice is land-*only* lose the edge: an outlet that
    # eats creatures as well is a genuine death-trigger producer, and Tagger is
    # right about those. The discriminator is the absence of any creature or
    # generic permanent sacrifice text.
    #
    # `tag_mapping.py` already records the same class of defect for
    # `sacrifice-self`, which was producing Evolving Wilds -> Skullclamp. This
    # is that bug's other half, on the outlet tags rather than the self tag.
    (
        "land_only_sacrifice_is_not_death",
        """
        MATCH (c:Card)-[d:PRODUCES]->(:Resource {name: 'death_trigger'})
        WHERE (c)-[:PRODUCES]->(:Resource {name: 'sacrifice_land'})
          AND c.oracle_text IS NOT NULL
          AND NOT c.oracle_text =~ '(?si).*sacrifice [^.:]{0,30}(creature|permanent|artifact|token).*'
        DELETE d
        RETURN count(*) AS n
        """,
    ),
    # Ramp everyone gets is not your ramp — the mirror of the self-facing tax
    # above, and the same argument. Tagger tags Braids, Conjurer Adept
    # `land-ramp` and `sneak-creature` because her ability does put lands and
    # creatures onto the battlefield; it does it for **each player**, and a
    # symmetric Show and Tell is not a ramp spell any more than a Leech is a
    # stax piece. She read `landfall 0.84` and `stompy 0.57` — her two loudest
    # themes, both wrong, on a card whose actual axis (giving the table
    # things) the vocabulary does not model at all.
    #
    # Scoped to `show-and-tell`, which is exactly this family and exactly 8
    # cards: Braids, Show and Tell, Kynaios and Tiro, Wild Evocation, The
    # Great Aurora, Hypergenesis, Eureka, Worlds Within Worlds. Deliberately
    # not `symmetrical` (832 cards, most of them wraths and wheels that are
    # not making anyone's mana) and not `group-hug` (401, whose closure holds
    # Prismari Command and Into the Flood Maw — removal spells).
    (
        "symmetric_permanent_dumps_are_not_ramp",
        """
        MATCH (c:Card)-[:TAGGED]->(:Tag)<-[:PARENT_OF*0..]-(:Tag {slug: 'show-and-tell'})
        MATCH (c)-[e]->(r:Resource)
        WHERE type(e) IN ['PRODUCES', 'CARES_ABOUT']
          AND r.name IN ['land_ramp', 'extra_land_drop', 'landfall_trigger', 'high_power']
        DELETE e
        RETURN count(*) AS n
        """,
    ),
    # A land is not ramp. Fetchlands carry `tutor-land-to-battlefield`, which is
    # correct for Rampant Growth but wrong for Misty Rainforest — a fetch uses
    # your land drop rather than adding to it, so there is no net mana gain.
    (
        "lands_are_not_ramp",
        """
        MATCH (c:Card)-[f:FILLS_ROLE]->(r:Role)
        WHERE c.is_land AND r.name IN ['land_ramp', 'ramp_other', 'mana_rock', 'mana_dork']
        DELETE f
        RETURN count(*) AS n
        """,
    ),
    # And a land is not a tutor. Tagger's hierarchy hands `tutor` to every
    # fetch land, and `tutor` sits in the synergy_wincon bucket — so Arid
    # Mesa counted as a *full* Synergy & Wincon card while Vivi Ornitier, an
    # actual wincon, counted 0.4 (asked directly by a user, and the same
    # contamination three consumers had already patched around one at a
    # time: `_TUTOR_TO_NONLAND`, the cut side's tutor floor, and the role-gap
    # round's fetch-headed bucket, the last one left "deliberately unfixed"
    # pending exactly this ontology call). A fetch's mana-base identity is
    # untouched: `Role.LAND` and the `landfall_trigger`/`mana_fixing`
    # produces stay, and nonland tutors keep the role at full weight.
    (
        "lands_are_not_tutors",
        """
        MATCH (c:Card)-[f:FILLS_ROLE]->(r:Role {name: 'tutor'})
        WHERE c.is_land
        DELETE f
        RETURN count(*) AS n
        """,
    ),
    # A grant the deck may not be able to turn on is not evasion supply.
    # Tagger's `gives-evasion` closure is right that these cards *can* enable
    # a combat damage trigger, but two audited shapes gate the grant on deck
    # composition rather than on play: a dice trigger (Barbarian Class —
    # menace only "whenever you roll one or more dice", useless without a
    # dice package) and unblockability held up by controlling a named type
    # (Way of the Thief's Gate). Measured scope: exactly one card per
    # pattern in the current corpus; the regexes are kept that narrow on
    # purpose. Play-pattern conditions stay — a level cost is an equip cost
    # (Rogue Class keeps its edges), and "attacks alone" is a choice every
    # deck can make (Black Widow keeps hers). Tribe-gated granters also
    # stay: those are deck-relative, and the bridge's off-tribe filter
    # (`_drop_off_tribe_bridge_rows`) is the layer that owns deck-relative
    # judgments — a Sliver deck genuinely wants Two-Headed Sliver.
    (
        "gated_grants_are_not_evasion_supply",
        """
        MATCH (c:Card)-[e:PRODUCES]->(r:Resource)
        WHERE r.name IN ['evasion', 'combat_damage_trigger']
          AND (c.oracle_text =~
                 '(?si).*whenever you roll [^.]{0,80}?(menace|flying|shadow|fear|intimidate|can.t be blocked).*'
               OR c.oracle_text =~ '(?si).*can.t be blocked as long as you control.*')
        DELETE e
        RETURN count(*) AS n
        """,
    ),
    # A landfall payoff is not a blink payoff. Tagger's `thingfall` closure
    # contains `landfall` — a land entering is a thing entering — so every
    # landfall payoff also cared about `etb_trigger`, landfall commanders read
    # as Blink, and Blink's top-500 count was inflated. The guard keeps cards
    # whose text independently watches nonland things entering (an Omnath-
    # style hybrid keeps both edges); a card that only ever triggers on lands
    # loses the etb side.
    (
        "landfall_is_not_thingfall",
        """
        MATCH (c:Card)-[:CARES_ABOUT]->(:Resource {name: 'landfall_trigger'})
        MATCH (c)-[e:CARES_ABOUT]->(:Resource {name: 'etb_trigger'})
        WHERE c.oracle_text IS NOT NULL
          AND NOT c.oracle_text =~
              '(?si).*whenever (a|an|another|one or more) [^.]{0,40}?(creature|permanent|artifact|enchantment|token)s? [^.]{0,30}enters.*'
        DELETE e
        RETURN count(*) AS n
        """,
    ),
]


def apply_structural_corrections() -> dict[str, int]:
    """Override tag-derived roles with facts known exactly from the card itself."""
    results: dict[str, int] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for name, query in STRUCTURAL_CORRECTIONS:
            results[name] = session.run(query).single()["n"]

    log.info("structural.applied", **results)
    return results


# Layer A too, but split from `STRUCTURAL_CORRECTIONS`: this one reads
# `IS_TYPE`, which the `typal` pipeline step writes, so it has to run after
# `typal` rather than in `structural` (see `pipeline.py`'s `typal_bridge`
# step for why running it too early made the first build differ from later
# ones).
TYPAL_BRIDGE_CORRECTIONS = [
    # A creature of any type is what a typal payoff counts. The typal axis
    # already models *which* type; this closes the resource-level bridge, which
    # had 2,617 consumers and no producer and so returned nothing.
    (
        "creatures_supply_typal",
        """
        MERGE (r:Resource {name: 'tribal_payoff'})
        WITH r
        MATCH (c:Card)-[:IS_TYPE]->(:CreatureType)
        WITH DISTINCT r, c
        MERGE (c)-[e:PRODUCES]->(r)
        SET e.source = 'structural'
        RETURN count(c) AS n
        """,
    ),
]


def apply_typal_bridge() -> dict[str, int]:
    """Resource-level corrections that read the typal step's own output."""
    results: dict[str, int] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for name, query in TYPAL_BRIDGE_CORRECTIONS:
            results[name] = session.run(query).single()["n"]

    log.info("typal_bridge.applied", **results)
    return results


# Rule edges carry the same shape as tag edges but a different `source`, so
# provenance survives into the suggestion rationale — "found by rule X" is a
# thing the synthesis pass is allowed to say; "found somehow" is not.
_RULE_RESOURCE = """
MERGE (r:Resource {name: $__name})
WITH r
MATCH (c:Card) WHERE %s
MERGE (c)-[e:%s]->(r)
SET e.source = 'rule'
RETURN count(c) AS n
"""

_RULE_ROLE = """
MERGE (rl:Role {name: $__name})
WITH rl
MATCH (c:Card) WHERE %s
MERGE (c)-[f:FILLS_ROLE]->(rl)
ON CREATE SET f.weight = $__weight, f.source = 'rule'
ON MATCH SET f.weight = CASE WHEN f.weight < $__weight THEN $__weight ELSE f.weight END
RETURN count(c) AS n
"""


def apply_rules(rules) -> dict[str, int]:
    """Run the deterministic rule layer. Returns cards matched per rule."""
    matched: dict[str, int] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for rule in rules:
            count = 0

            for resource in rule.produces:
                query = _RULE_RESOURCE % (rule.where, "PRODUCES")
                params = {**rule.params, "__name": str(resource)}
                count = max(count, session.run(query, **params).single()["n"])

            for resource in rule.cares_about:
                query = _RULE_RESOURCE % (rule.where, "CARES_ABOUT")
                params = {**rule.params, "__name": str(resource)}
                count = max(count, session.run(query, **params).single()["n"])

            for role, weight in rule.roles:
                query = _RULE_ROLE % rule.where
                params = {**rule.params, "__name": str(role), "__weight": float(weight)}
                count = max(count, session.run(query, **params).single()["n"])

            matched[rule.id] = count
            if not count:
                log.warning("rule.no_matches", rule=rule.id)

    log.info("rules.applied", rules=len(matched), total=sum(matched.values()))
    return matched


def semantic_stats() -> dict[str, int]:
    query = """
    MATCH (c:Card)
    WITH count(c) AS cards
    OPTIONAL MATCH (c1:Card) WHERE (c1)-[:PRODUCES|CARES_ABOUT]->(:Resource)
    WITH cards, count(DISTINCT c1) AS cards_with_resource
    OPTIONAL MATCH (c2:Card) WHERE (c2)-[:FILLS_ROLE]->(:Role)
    WITH cards, cards_with_resource, count(DISTINCT c2) AS cards_with_role
    OPTIONAL MATCH (c3:Card)
      WHERE (c3)-[:PRODUCES|CARES_ABOUT]->(:Resource) OR (c3)-[:FILLS_ROLE]->(:Role)
    RETURN cards, cards_with_resource, cards_with_role, count(DISTINCT c3) AS cards_covered
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def bridge_sample(resource: str, *, limit: int = 5) -> list[dict[str, str]]:
    """Two-hop bridge: producers and carers meeting on one resource."""
    query = """
    MATCH (w:Card)-[:CARES_ABOUT]->(r:Resource {name: $resource})
    MATCH (p:Card)-[:PRODUCES]->(pr:Resource)-[:BROADER*0..]->(r)
    WHERE p <> w
    RETURN p.name AS produces, w.name AS cares_about
    ORDER BY coalesce(p.edhrec_rank, 999999) + coalesce(w.edhrec_rank, 999999)
    LIMIT $limit
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(record) for record in session.run(query, resource=resource, limit=limit)]


# --------------------------------------------------------------------------
# EDHREC recommendations
# --------------------------------------------------------------------------

# Directed commander -> card, exactly as PLAN.md requires. Materialising full
# pairwise co-occurrence would be quadratic — one commander's ~500-card pool is
# ~125k pairs on its own — so the edge is reified from the commander only, and
# populated lazily for commanders actually queried.
UPSERT_RECOMMENDATIONS = """
MATCH (cmd:Card {oracle_id: $commander_oracle_id})
UNWIND $rows AS row
MATCH (c:Card)
WHERE c.scryfall_id = row.scryfall_id OR c.name = row.name
WITH cmd, c, row
MERGE (cmd)-[r:RECOMMENDS]->(c)
SET r.synergy = row.synergy,
    r.inclusion_rate = row.inclusion_rate,
    r.deck_count = row.num_decks,
    r.tag = row.tag,
    r.source = 'edhrec'
RETURN count(DISTINCT c) AS n
"""


def upsert_recommendations(commander_name: str, recommendations: Iterable[Any]) -> int:
    """Write commander -> card RECOMMENDS edges. Returns cards linked."""
    rows = [
        {
            "name": rec.name,
            "scryfall_id": rec.scryfall_id,
            "synergy": rec.synergy,
            "inclusion_rate": rec.inclusion_rate,
            "num_decks": rec.num_decks,
            "tag": rec.tag,
        }
        for rec in recommendations
    ]

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        commander = session.run(
            "MATCH (c:Card) WHERE c.name = $name OR c.name STARTS WITH $prefix "
            "RETURN c.oracle_id AS oracle_id LIMIT 1",
            name=commander_name,
            prefix=commander_name + " //",
        ).single()

        if commander is None:
            log.warning("edhrec.commander_not_in_graph", commander=commander_name)
            return 0

        return session.run(
            UPSERT_RECOMMENDATIONS,
            commander_oracle_id=commander["oracle_id"],
            rows=rows,
        ).single()["n"]


def recommendations_for(commander_name: str, *, limit: int = 15, min_synergy: float = 0.0):
    """Top recommendations already persisted for a commander."""
    query = """
    MATCH (cmd:Card)-[r:RECOMMENDS]->(c:Card)
    WHERE (cmd.name = $name OR cmd.name STARTS WITH $prefix) AND r.synergy >= $min_synergy
    RETURN c.name AS name, r.synergy AS synergy, r.inclusion_rate AS inclusion_rate, r.tag AS tag
    ORDER BY r.synergy DESC
    LIMIT $limit
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(record)
            for record in session.run(
                query,
                name=commander_name,
                prefix=commander_name + " //",
                min_synergy=min_synergy,
                limit=limit,
            )
        ]


# --------------------------------------------------------------------------
# Candidate retrieval (Phase 6)
# --------------------------------------------------------------------------

# Hard filters are applied inside every channel rather than afterwards: colour
# identity and "already in the deck" are not preferences, and letting an illegal
# card into the pool only to drop it later wastes the ranking budget.
#
# Commander legality is deliberately absent — `ingest.is_ingestable` already
# filters the corpus to commander-legal cards, so every Card node qualifies.
# An earlier version tested `c.commander_legal`, a property that is never
# written; Cypher evaluated it to null and silently returned zero candidates.
# The `/*pool*/` sentinel is where a pool restriction (`poolquery.PoolFilter`)
# splices in at run time — the channel constants interpolate this fragment at
# import time, so the dynamic clause needs a marked spot rather than a format
# hole (`.format()` would trip over the Cypher map literals in the channels).
# Unused it is a Cypher comment, so the constants stay valid verbatim.
#
# Note the two price semantics side by side: `$max_price` waves unpriced cards
# through (a missing price must not hide a card from a soft budget), while a
# pool query's `eur<5` clause excludes them (a null comparison is null) — the
# pool is a stated restriction, and "price unknown" does not satisfy it.
_HARD_FILTER = """
      NOT c.oracle_id IN $deck
      AND all(sym IN c.color_identity WHERE sym IN $identity)
      AND ($max_price IS NULL
           OR coalesce(c.price_eur, c.price_usd) IS NULL
           OR coalesce(c.price_eur, c.price_usd) <= $max_price)
      /*pool*/
"""

CHANNEL_EDHREC = f"""
MATCH (cmd:Card {{oracle_id: $commander}})-[r:RECOMMENDS]->(c:Card)
WHERE {_HARD_FILTER}
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd,
       r.synergy AS synergy, r.inclusion_rate AS inclusion_rate, r.tag AS tag,
       c.playability AS playability, coalesce(c.game_changer, false) AS game_changer
ORDER BY r.synergy DESC
LIMIT $limit
"""

# The channel that justifies the graph: cards supplying a resource the deck
# wants more of than it makes. Producers match the wanted resource *or anything
# narrower*, which is what the BROADER hierarchy is for.
CHANNEL_BRIDGE = f"""
UNWIND $wanted AS want
MATCH (c:Card)-[:PRODUCES]->(:Resource)-[:BROADER*0..]->(r:Resource {{name: want.resource}})
WHERE {_HARD_FILTER}
WITH c, collect(DISTINCT want.resource)[0..3] AS resources, max(want.gap) AS gap
ORDER BY gap DESC, coalesce(c.edhrec_rank, 999999) ASC
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd,
       resources, gap,
       c.edhrec_rank AS edhrec_rank, c.rarity AS rarity, c.playability AS playability,
       coalesce(c.game_changer, false) AS game_changer
LIMIT $limit
"""

# Retrieval driven by a *bucket shortfall* rather than a resource gap.
#
# Resource gaps are a property of the deck's own cards and do not move with the
# speed slider. Bucket shortfalls do — a list can be fine on ramp as a
# battlecruiser and short as a tuned deck. Without this channel the slider
# changes the diagnosis and nothing else, and "the deck is short on ramp" has no
# corresponding suggestion.
#
# Each of the bucket's roles gets its own allowance and its weights are put on
# a common scale first. Both halves answer the same defect: `f.weight` is
# degree of membership in *that role* (see docs/composition.md), so its
# ceiling is a property of the role's evidence, not of the card — `tutor` is
# granted at 1.0, the derived `payoff` at a flat 0.6, `wincon` at 0.3-0.4. One
# `ORDER BY weight DESC ... LIMIT` across all six roles therefore ranked the
# *roles* against each other: on a mono-red deck 351 eligible cards tie at
# weight 1.0, so the 25 slots were spent on the most popular tutors and the
# synergy_wincon bucket could not return a single payoff or wincon — for any
# deck, in any identity. `$ceilings` divides each weight by the best its own
# role can score; the per-role slice is the collect-then-slice CHANNEL_THEMES
# already uses, for the same starvation reason.
#
# A card filling two of the bucket's roles is still returned exactly once, at
# its strongest normalised role: `_merge` appends provenance unconditionally,
# so a second row would count the same shortfall twice.
CHANNEL_ROLES = f"""
UNWIND $wanted AS want
MATCH (c:Card)-[f:FILLS_ROLE]->(r:Role)
WHERE r.name = want.role AND {_HARD_FILTER}
WITH want, c, max(f.weight) / coalesce($ceilings[want.role], 1.0) AS weight
ORDER BY weight DESC, coalesce(c.edhrec_rank, 999999) ASC
WITH want, collect({{
    oracle_id: c.oracle_id, name: c.name, cmc: c.cmc,
    type_line: c.type_line, price_usd: c.price_usd, weight: weight,
    edhrec_rank: c.edhrec_rank, rarity: c.rarity, playability: c.playability,
    game_changer: coalesce(c.game_changer, false)
}})[0..$limit] AS rows
UNWIND rows AS row
WITH row, want.bucket AS bucket, want.shortfall AS shortfall
ORDER BY row.weight DESC
WITH row.oracle_id AS oracle_id, bucket, shortfall, head(collect(row)) AS best
RETURN oracle_id, best.name AS name, best.cmc AS cmc,
       best.type_line AS type_line, best.price_usd AS price_usd,
       bucket, shortfall, best.weight AS weight,
       best.edhrec_rank AS edhrec_rank, best.rarity AS rarity,
       best.playability AS playability, best.game_changer AS game_changer
"""

# Retrieval by theme. Only possible because theme fit is precomputed as
# FITS_THEME edges — scoring 30k cards per request in Python would not be.
# Ranked by fit against playability: the strongest landfall card you would
# actually play, not the most landfall-ish card in the corpus.
#
# Batched over theme ids — pins and detected themes ask for several at once,
# and this was one round trip per theme. `$limit` caps each theme separately
# (collect-then-slice), because a global LIMIT would hand every slot to the
# strongest theme and starve the rest.
CHANNEL_THEMES = f"""
UNWIND $theme_ids AS tid
MATCH (c:Card)-[f:FITS_THEME]->(t:Theme {{id: tid}})
WHERE {_HARD_FILTER}
WITH t, c, f
ORDER BY f.fit * (0.25 + c.playability) DESC
WITH t, collect({{
    oracle_id: c.oracle_id, name: c.name, cmc: c.cmc,
    type_line: c.type_line, price_usd: c.price_usd,
    playability: c.playability, game_changer: coalesce(c.game_changer, false),
    fit: f.fit, theme_id: t.id, theme_label: t.label
}})[0..$limit] AS rows
UNWIND rows AS row
RETURN row.oracle_id AS oracle_id, row.name AS name, row.cmc AS cmc,
       row.type_line AS type_line, row.price_usd AS price_usd,
       row.playability AS playability, row.game_changer AS game_changer,
       row.fit AS fit, row.theme_id AS theme_id, row.theme_label AS theme_label
"""

# Which of a given set of cards fit any of the given themes, and how well.
# The exclusion pass asks this about the assembled pool: no hard filter, no
# ordering, no limit — membership is the question, the pool is already chosen.
FITS_THEME_AMONG = """
UNWIND $theme_ids AS tid
MATCH (c:Card)-[f:FITS_THEME]->(:Theme {id: tid})
WHERE c.oracle_id IN $oracle_ids
RETURN c.oracle_id AS oracle_id, tid AS theme_id, f.fit AS fit
"""

# The exclusion pass's other half. `FITS_THEME_AMONG.fit` is theme-normalised
# (matched weight over the theme's *whole* weighted vocabulary) — right for
# "does this deck read as the theme", wrong for "how much of this card is the
# theme". A card that touches one of a five-term theme and nothing else reads
# as a 20% fit no matter how completely that one term defines the card, and a
# card below `FIT_THRESHOLD` or failing the gate has no `FITS_THEME` edge at
# all — no row, invisible to exclusion.
#
# This asks the card's own question instead: of everything on its gate side
# (`$sides` — the same CARES_ABOUT/PRODUCES gate the FITS_THEME edge for this
# theme was written against, expanded through BROADER exactly like the edge
# was), what share falls inside the theme's own vocabulary (`$resources`)?
# `$resources` and `$sides` travel as sorted lists — the driver rejects
# Python sets. A card with nothing on the given sides has no identity to take
# a share of and is simply absent from the result, not a zero row.
THEME_SHARE_AMONG = """
UNWIND $oracle_ids AS oid
MATCH (c:Card {oracle_id: oid})
OPTIONAL MATCH (c)-[rel]->(:Resource)-[:BROADER*0..]->(r:Resource)
WHERE type(rel) IN $sides
WITH c, collect(DISTINCT r.name) AS identity
WHERE size(identity) > 0
RETURN c.oracle_id AS oracle_id,
       toFloat(size([x IN identity WHERE x IN $resources])) / size(identity) AS share
"""

# Retrieval on the typal axis. The join `payoff -CARES_ABOUT_TYPE-> t <-IS_TYPE- body`
# has existed since the typal extraction landed and `typal_bridge` demonstrated
# it, but nothing in the advisor consumed it — a Goblin deck got no Goblins.
#
# All three relations are matched in one pass and the kind is returned, because
# they are different strengths of evidence: a card that *cares about* Goblins is
# a payoff, one that *makes* them supplies the deck, and one that merely *is* a
# Goblin is a body. `suggestions.py` scores them apart.
CHANNEL_TYPAL = f"""
UNWIND $wanted AS want
MATCH (c:Card)-[rel:IS_TYPE|MAKES_TYPE|CARES_ABOUT_TYPE]->(t:CreatureType)
WHERE t.name = want.creature_type AND {_HARD_FILTER}
WITH c, want.creature_type AS creature_type, want.share AS share,
     collect(DISTINCT type(rel)) AS relations
ORDER BY share DESC, coalesce(c.edhrec_rank, 999999) ASC
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd,
       creature_type, share, relations,
       c.edhrec_rank AS edhrec_rank, c.rarity AS rarity, c.playability AS playability,
       coalesce(c.game_changer, false) AS game_changer
LIMIT $limit
"""

# What "fixing" means is structural, not a tag. The Tagger's `mana_fixing`
# misses the any-colour staples (Command Tower, City of Brass, Path of
# Ancestry carry no such tag) and tags mono-colour utility lands (Bojuka
# Bog) that fix nothing. A land fixes *this* deck when its text taps for any
# colour, when it produces two or more of the deck's colours (its colour
# identity — already scoped to the deck's by the hard filter), or when it
# fetches a basic type the identity can use. The last clause is the one that
# admits an off-pair fetch — Polluted Delta finds a Swamp for an Abzan deck —
# while excluding a dead one, which the colourless identity of every fetch
# would otherwise wave through (Scalding Tarn finds nothing there).
# `$fetch_types` is the identity's basic type names ("Plains", "Swamp", …).
_FIXING_LAND = """
      c.is_land
      AND (
        c.oracle_text CONTAINS 'any color'
        OR size(c.color_identity) >= 2
        OR (c.oracle_text CONTAINS 'Search your library'
            AND (c.oracle_text CONTAINS 'basic land card'
                 OR any(t IN $fetch_types WHERE c.oracle_text CONTAINS t)))
      )
"""

# Gates on the `tutor` ROLE, not the raw PRODUCES resources — found live
# against a real deck (TUTORS-RESULTS.md): `tutor_to_top` is shared with the
# broader `top-deck-manipulation`/`library-manipulation` tags, which also
# cover plain card-selection (Brainstorm, Consider, Sensei's Divining Top,
# Read the Bones — none of them a tutor). The curated `tutor`/`tutor-to-*`
# tag family (`tag_mapping.py`) grants the role only to genuine search
# effects, so `FILLS_ROLE {name:"tutor"}` is the precise gate; the resources
# stay useful elsewhere (resource_bridge, the `tutors` theme) where the
# broader population is tolerable. `NOT c.is_land` still holds — fetch lands
# inherit the role via Tagger's own hierarchy (`tutor-land-basic` etc.),
# confirmed live at 69 lands in Task 0. A nonland card that fetches a land
# (Solemn Simulacrum, Wayfarer's Bauble) still carries the role and still
# passes this filter — an accepted imprecision, not solved here (see the
# plan's Task 0).
_TUTOR_TO_NONLAND = """
      NOT c.is_land
      AND EXISTS {
        MATCH (c)-[:FILLS_ROLE]->(:Role {name: 'tutor'})
      }
"""

CHANNEL_FIXING = f"""
MATCH (c:Card)
WHERE {_FIXING_LAND} AND {_HARD_FILTER}
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd,
       c.edhrec_rank AS edhrec_rank, c.rarity AS rarity, c.playability AS playability,
       coalesce(c.game_changer, false) AS game_changer
ORDER BY coalesce(c.edhrec_rank, 999999) ASC
LIMIT $limit
"""

DECK_FIXING_COUNT = f"""
UNWIND $rows AS row
MATCH (c:Card {{oracle_id: row.oracle_id}})
WHERE {_FIXING_LAND}
RETURN coalesce(sum(row.qty), 0) AS fixing
"""

# `joker_destinations`: which of the piece-finding destinations the tutor
# serves. The combo-joker bump (suggestions.py) reads it — a tutor is only a
# joker for combo lines when it can put the missing piece in hand or on top,
# so the land-fetchers that share `Role.TUTOR` (Solemn Simulacrum, Wayfarer's
# Bauble — the accepted residual of the role gate) come back with an empty
# list and never collect combo-scale value they cannot deliver.
CHANNEL_TUTORS = f"""
MATCH (c:Card)
WHERE {_TUTOR_TO_NONLAND} AND {_HARD_FILTER}
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd,
       c.edhrec_rank AS edhrec_rank, c.rarity AS rarity, c.playability AS playability,
       coalesce(c.game_changer, false) AS game_changer,
       [ (c)-[:PRODUCES]->(r:Resource)
         WHERE r.name IN ['tutor_to_hand', 'tutor_to_top'] | r.name ] AS joker_destinations
ORDER BY coalesce(c.edhrec_rank, 999999) ASC
LIMIT $limit
"""

DECK_TUTOR_COUNT = f"""
UNWIND $rows AS row
MATCH (c:Card {{oracle_id: row.oracle_id}})
WHERE {_TUTOR_TO_NONLAND}
RETURN coalesce(sum(row.qty), 0) AS tutors
"""

CARDS_BY_NAME = f"""
UNWIND $names AS wanted
MATCH (c:Card)
WHERE (c.name = wanted OR c.name STARTS WITH wanted + ' //') AND {_HARD_FILTER}
RETURN DISTINCT c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.price_usd AS price_usd, wanted AS matched,
       c.playability AS playability, coalesce(c.game_changer, false) AS game_changer
"""

# The combo layer: Commander Spellbook variants as (:Combo)-[:USES]->(:Card),
# written by `deck-lab ingest-combos` so that "which combos am I one card short
# of" is a local query instead of a ~3 s POST on the /suggestions hot path.
UPSERT_COMBOS = """
UNWIND $rows AS row
MERGE (k:Combo {id: row.id})
SET k.produces = row.produces, k.bracket = row.bracket,
    k.popularity = row.popularity, k.pieces = row.pieces
WITH k, row
UNWIND row.uses AS oid
MATCH (c:Card {oracle_id: oid})
MERGE (k)-[:USES]->(c)
"""

# Anchored on the deck's cards, not a combo scan: `have` counts deck pieces per
# combo, and `k.pieces - 1` keeps complete combos and those exactly one short —
# the two lists the advisor consumes. `have` counts USES edges, so a combo
# written with a piece missing from the graph would read as closer to complete
# than it is; `replace_combos` documents that its caller must prevent that.
#
# The three collects aggregate over the same rows, so they stay index-parallel:
# `color_identities[i]` is the identity of the piece `names[i]` names. /combos
# reads them to keep a missing piece outside the deck's colours out of its
# suggestions, the way the retrieval channels' hard filter already does.
DECK_COMBOS = """
MATCH (piece:Card)<-[:USES]-(k:Combo)
WHERE piece.oracle_id IN $deck
WITH k, count(DISTINCT piece) AS have
WHERE have >= k.pieces - 1
MATCH (k)-[:USES]->(p:Card)
WITH k, have, collect(p.oracle_id) AS uses, collect(p.name) AS names,
     collect(p.color_identity) AS color_identities
RETURN k.id AS id, uses, names, color_identities, k.produces AS produces,
       k.bracket AS bracket, k.popularity AS popularity
"""


def _with_pool(cypher: str, pool_filter: PoolFilter | None) -> str:
    """Splice a pool restriction into a channel query at its sentinel."""
    if pool_filter is None or not pool_filter.predicate:
        return cypher
    return cypher.replace("/*pool*/", f"AND ({pool_filter.predicate})")


def _filter_params(deck: list[str], identity: list[str], pool_filter: PoolFilter | None) -> dict:
    return {
        "deck": deck,
        "identity": identity,
        "max_price": pool_filter.max_price if pool_filter else None,
        **(pool_filter.params if pool_filter else {}),
    }


def channel_edhrec(
    commander: str,
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 500,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """Every RECOMMENDS row for the commander, strongest synergy first.

    The default limit sits above any real page (largest observed: 292 rows)
    because the query orders by synergy and synergy measures *deviation from
    baseline* — a binding cut drops exactly the baseline staples. At 120,
    Command Tower (86% of Necrobloom decks, synergy −0.05, position 273 of
    292) never entered the pool, so when the fixing-lands channel surfaced
    it the card carried no inclusion evidence and displayed a 0% playrate.
    A negative-synergy row scores 0 in this channel and cannot rank on its
    own; fetching it exists to attach the empirical record, not to suggest.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_EDHREC, pool_filter),
                commander=commander,
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


# How much of the deck the commander's own page accounts for. `channel_edhrec`
# cannot answer this: its hard filter excludes cards already in the deck, which
# is exactly the set this asks about.
DECK_PAGE_OVERLAP = """
MATCH (c:Card)
WHERE c.oracle_id IN $deck AND NOT c.type_line CONTAINS 'Basic'
WITH collect(DISTINCT c.oracle_id) AS deck_ids
OPTIONAL MATCH (cmd:Card)-[:RECOMMENDS]->(d:Card)
WHERE cmd.oracle_id IN $commanders AND d.oracle_id IN deck_ids
RETURN size(deck_ids) AS deck_n, count(DISTINCT d.oracle_id) AS hits
"""


def deck_page_overlap(commanders: list[str], deck: list[str]) -> tuple[int, int]:
    """(nonbasic deck cards, how many of them any of the commanders' pages hold)."""
    if not commanders or not deck:
        return (0, 0)

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(DECK_PAGE_OVERLAP, commanders=commanders, deck=deck).single()
        return (int(record["deck_n"]), int(record["hits"])) if record else (0, 0)


def channel_bridge(
    wanted: list[dict],
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 120,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    if not wanted:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_BRIDGE, pool_filter),
                wanted=wanted,
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def channel_roles(
    wanted: list[dict],
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 120,
    pool_filter: PoolFilter | None = None,
    ceilings: dict[str, float] | None = None,
) -> list[dict]:
    """Cards filling a role in a bucket the deck is short on.

    `wanted` is `[{"role": ..., "bucket": ..., "shortfall": ...}]`.

    `limit` caps each role separately, not the union — like `channel_themes`
    and for the same reason. The union is larger than `limit`, so a caller
    ranking across buckets caps what it *keeps* rather than what it retrieves.

    `ceilings` maps a role to the highest weight it reaches in the corpus (see
    `role_weight_ceilings`). Omitting it leaves the weights unnormalised,
    which is only ever right for a single-role ask.
    """
    if not wanted:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_ROLES, pool_filter),
                wanted=wanted,
                limit=limit,
                ceilings=ceilings or {},
                **_filter_params(deck, identity, pool_filter),
            )
        ]


ROLE_WEIGHT_CEILINGS = """
MATCH (:Card)-[f:FILLS_ROLE]->(r:Role)
RETURN r.name AS role, max(f.weight) AS ceiling
"""


def role_weight_ceilings() -> dict[str, float]:
    """The highest weight each role reaches in this corpus.

    Read from the graph rather than summed from `tag_mapping` and `rules`,
    because a role's weight arrives from four places — those two, the derived
    payoff, and the structural corrections' Cypher literals — and a ceiling
    that missed one would silently rescale a whole role. See CHANNEL_ROLES for
    what it is for.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {r["role"]: float(r["ceiling"]) for r in session.run(ROLE_WEIGHT_CEILINGS)}


def channel_fixing(
    deck: list[str],
    identity: list[str],
    fetch_types: list[str],
    *,
    limit: int = 20,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """Lands that fix this identity's colours, best playrate first."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_FIXING, pool_filter),
                fetch_types=fetch_types,
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def deck_fixing_count(deck: dict[str, int], fetch_types: list[str]) -> int:
    """How many fixing lands the deck already runs, quantities included."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(
            DECK_FIXING_COUNT, rows=_deck_rows(deck), fetch_types=fetch_types
        ).single()
        return int(record["fixing"]) if record else 0


def channel_tutors(
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 20,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """Nonland tutors the deck is short on, best playrate first."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_TUTORS, pool_filter),
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def deck_tutor_count(deck: dict[str, int]) -> int:
    """How many nonland tutors the deck already runs, quantities included."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(DECK_TUTOR_COUNT, rows=_deck_rows(deck)).single()
        return int(record["tutors"]) if record else 0


def channel_theme(
    theme_id: str,
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 60,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """Cards that read as a given theme, strongest-and-most-played first."""
    return channel_themes([theme_id], deck, identity, limit=limit, pool_filter=pool_filter)


def channel_themes(
    theme_ids: list[str],
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 60,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """`channel_theme` over several themes in one round trip.

    `limit` caps each theme separately, not the union — see CHANNEL_THEMES.
    """
    if not theme_ids:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_THEMES, pool_filter),
                theme_ids=theme_ids,
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def tribe_references(oracle_ids: list[str]) -> list[dict]:
    """Which specific creature types each card is bound to, if any.

    The facts behind the off-tribe filter on the `tribal` theme channel (see
    `_drop_off_tribe_rows` in suggestions.py). Types come from all three typal
    relations *and* from names in the oracle text: what the card is covers the
    lords whose payoff text the extraction cannot parse (Goblin Sledder's
    "Sacrifice a Goblin:" carries no CARES_ABOUT_TYPE edge), cares/makes
    covers the non-creatures (Sliver Hive), and the text scan covers both
    directions of the remainder — it condemns Goblin Grenade, edge-less but
    plainly about Goblins, and rescues Dragonlord's Servant, a Goblin whose
    Dragon-ness exists only as the word in his text.

    The text scan matches the graph's own CreatureType vocabulary with plain
    CONTAINS. Type names are capitalised and oracle prose is not, so "Elf"
    does not match "itself"; plurals match as substrings for free.
    """
    if not oracle_ids:
        return []

    query = """
    MATCH (c:Card) WHERE c.oracle_id IN $oracle_ids
    OPTIONAL MATCH (c)-[:IS_TYPE|CARES_ABOUT_TYPE|MAKES_TYPE]->(t:CreatureType)
    WITH c, collect(DISTINCT t.name) AS edge_types
    OPTIONAL MATCH (n:CreatureType) WHERE c.oracle_text CONTAINS n.name
    WITH c, edge_types, collect(DISTINCT n.name) AS text_types
    RETURN c.oracle_id AS oracle_id,
           edge_types + text_types AS types,
           any(k IN coalesce(c.keywords, []) WHERE k = 'Changeling') AS changeling,
           c.oracle_text AS oracle_text
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(query, oracle_ids=oracle_ids)]


# `tribe_references` minus `IS_TYPE`. A card's type line is identity, not a
# claim its ability makes — Anger is an Incarnation with no tribal text, and
# what it *is* has no bearing on whether the bridge should condemn it as
# tribe-bound. Dropping the one relation is the entire difference.
ABILITY_TRIBE_REFERENCES = """
MATCH (c:Card) WHERE c.oracle_id IN $oracle_ids
OPTIONAL MATCH (c)-[:CARES_ABOUT_TYPE|MAKES_TYPE]->(t:CreatureType)
WITH c, collect(DISTINCT t.name) AS edge_types
OPTIONAL MATCH (n:CreatureType) WHERE c.oracle_text CONTAINS n.name
WITH c, edge_types, collect(DISTINCT n.name) AS text_types
RETURN c.oracle_id AS oracle_id,
       edge_types + text_types AS types,
       any(k IN coalesce(c.keywords, []) WHERE k = 'Changeling') AS changeling,
       c.oracle_text AS oracle_text
"""


def ability_tribe_references(oracle_ids: list[str]) -> list[dict]:
    """Which specific creature types each card's *ability* references, if any.

    The functional sibling of `tribe_references`, for the resource-bridge's
    off-tribe filter (see `_row_is_off_tribe` in suggestions.py, which this
    feeds a differently-sourced `ref` dict of the same shape). What a card
    *is* is identity; what its ability *references* is function, and those
    disagree exactly on the cards that matter: Anger, an Incarnation with no
    tribal text, is excellent in a Dragons deck and must not be condemned by
    a type line it does not read from — but Goblin King's granted ability
    ("Goblin creatures you control get +1/+1 and have menace") is tribal
    whatever its own creature type says. `tribe_references`'s `IS_TYPE` edge
    answers the identity question; this query never asks it.

    Same RETURN shape as `tribe_references` — `oracle_id`, `types`,
    `changeling`, `oracle_text` — so both feed `_row_is_off_tribe`
    interchangeably. The changeling flag survives the trim: a changeling
    supplier of the deck's tribe (Metallic Mimic naming it) must still be
    rescued here exactly as it is on the type-blind theme channel.
    """
    if not oracle_ids:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(ABILITY_TRIBE_REFERENCES, oracle_ids=oracle_ids)]


def fits_theme_among(oracle_ids: list[str], theme_ids: list[str]) -> list[dict]:
    """FITS_THEME membership of the given cards in the given themes.

    One round trip: at most 19 UNWIND rows against an indexed id lookup,
    trivial next to the channel queries. Empty input asks nothing.
    """
    if not oracle_ids or not theme_ids:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(FITS_THEME_AMONG, oracle_ids=oracle_ids, theme_ids=theme_ids)
        ]


def theme_share_among(oracle_ids: list[str], resources: list[str], sides: list[str]) -> list[dict]:
    """For each card, the fraction of its own gate-side resource identity
    that falls inside `resources` — the card-normalised counterpart to
    `fits_theme_among`'s theme-normalised `fit`. See `THEME_SHARE_AMONG`.

    `resources` and `sides` are sorted before the query runs, in addition to
    whatever the caller already sorted them to — the neo4j driver rejects
    Python sets outright, so this stays correct even if a caller hands one
    over. Empty input asks nothing.
    """
    if not oracle_ids or not resources or not sides:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                THEME_SHARE_AMONG,
                oracle_ids=oracle_ids,
                resources=sorted(set(resources)),
                sides=sorted(set(sides)),
            )
        ]


# Payoffs for what the deck already makes: which of the given cards care
# about one of the given resources or anything broader — the deck's
# specific production satisfies a card consuming the wider category, the
# same BROADER walk the bridge does in the other direction (a producer
# matches the want or anything narrower; a consumer matches the supply or
# anything broader).
#
# The walk may only *match* on resources in `$allowed`. Without that filter a
# vague ancestor launders a rejected surplus back in: `artifact_matters` (IDF
# 0.49) is never a surplus itself, but every artifact payoff still matched it
# through `mana_rock`'s one BROADER hop. Filtering where the match lands, not
# just what counts as surplus, closes that.
CARES_ABOUT_SUPPLY = """
UNWIND $made AS m
MATCH (:Resource {name: m})-[:BROADER*0..]->(cr:Resource)<-[:CARES_ABOUT]-(c:Card)
WHERE c.oracle_id IN $oracle_ids AND cr.name IN $allowed
RETURN DISTINCT c.oracle_id AS oracle_id
"""


def cares_about_supply(oracle_ids: list[str], made: list[str], allowed: set[str]) -> set[str]:
    """Which of the given cards consume one of the given resources (or broader).

    Membership over an id list, like `fits_theme_among` — no filter, no
    ordering, no limit; the pool is already chosen. Empty input asks nothing.

    `allowed` is the set of resources a match may land on — specificity (the
    IDF floor) and policy (theme exclusions) are both the caller's job, so
    this stays mechanism: it only enforces whatever set it is given.
    """
    if not oracle_ids or not made or not allowed:
        return set()

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            r["oracle_id"]
            for r in session.run(
                CARES_ABOUT_SUPPLY, oracle_ids=oracle_ids, made=made, allowed=sorted(allowed)
            )
        }


def replace_combos(rows: list[dict], *, batch_size: int = 1_000) -> int:
    """Replace the combo layer wholesale. Returns the number written.

    Clear-before-merge, for the same reason as `clear_semantics`: MERGE is
    additive, and a combo retired upstream would otherwise keep its node and
    edges forever.

    The caller must filter rows to pieces that exist in the graph. UPSERT's
    MATCH silently drops an unresolvable piece, leaving a combo with fewer
    USES edges than `pieces` — which DECK_COMBOS then reports as closer to
    completion than it is. Wrong quietly, hence recorded here.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run("MATCH (k:Combo) DETACH DELETE k")
        written = 0
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            session.run(UPSERT_COMBOS, rows=batch)
            written += len(batch)

    log.info("combos.replaced", combos=written)
    return written


def combo_count() -> int:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return session.run("MATCH (k:Combo) RETURN count(k) AS n").single()["n"]


def deck_combo_rows(deck_oracle_ids: list[str]) -> list[dict]:
    """Combos the deck completes or is one card short of."""
    if not deck_oracle_ids:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(DECK_COMBOS, deck=deck_oracle_ids)]


def known_oracle_ids() -> set[str]:
    """Every oracle_id in the graph — the ingest-side existence filter."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            r["oracle_id"] for r in session.run("MATCH (c:Card) RETURN c.oracle_id AS oracle_id")
        }


def oracle_ids_for_names(names: list[str]) -> dict[str, str]:
    """Resolve card names to oracle_ids, split cards by their front face."""
    if not names:
        return {}

    query = """
    UNWIND $names AS wanted
    MATCH (c:Card)
    WHERE c.name = wanted OR c.name STARTS WITH wanted + ' //'
    RETURN wanted, c.oracle_id AS oracle_id
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {r["wanted"]: r["oracle_id"] for r in session.run(query, names=names)}


def channel_typal(
    wanted: list[dict],
    deck: list[str],
    identity: list[str],
    *,
    limit: int = 60,
    pool_filter: PoolFilter | None = None,
) -> list[dict]:
    """Bodies, token makers and payoffs for the creature types the deck is built on.

    `wanted` is `[{"creature_type": "Goblin", "share": 0.62}, ...]` — the output
    of `deck_typal_profile`.
    """
    if not wanted:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CHANNEL_TYPAL, pool_filter),
                wanted=wanted,
                limit=limit,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def cards_by_name(
    names: list[str], deck: list[str], identity: list[str], *, pool_filter: PoolFilter | None = None
) -> list[dict]:
    if not names:
        return []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [
            dict(r)
            for r in session.run(
                _with_pool(CARDS_BY_NAME, pool_filter),
                names=names,
                **_filter_params(deck, identity, pool_filter),
            )
        ]


def is_legal_commander(oracle_id: str) -> bool:
    """Whether a card the caller nominated can actually be a commander."""
    query = "MATCH (c:Card {oracle_id: $oid}) RETURN coalesce(c.can_be_commander, false) AS ok"
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(query, oid=oracle_id).single()
        return bool(record and record["ok"])


def has_recommendations(oracle_id: str) -> bool:
    query = "MATCH (c:Card {oracle_id: $oid})-[:RECOMMENDS]->() RETURN count(*) > 0 AS present"
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(query, oid=oracle_id).single()
        return bool(record and record["present"])


def top_commanders(limit: int = 1000) -> list[dict]:
    """The most-played legal commanders, most popular first.

    Both properties are indexed, so this is the pre-warm CLI's cheap way to ask
    "which commanders will people actually build" without a corpus scan.
    """
    query = """
    MATCH (c:Card)
    WHERE c.can_be_commander AND c.edhrec_rank IS NOT NULL
    RETURN c.oracle_id AS oracle_id, c.name AS name
    ORDER BY c.edhrec_rank ASC
    LIMIT $limit
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(query, limit=limit)]


def find_commander(deck: list[str]) -> dict | None:
    """Pick the commander from a decklist.

    Moxfield exports mark it with a section header that `parseDeck` discards, so
    it is inferred: the legal commander with the widest colour identity, which
    beats "first legal creature" on partner and background lists.
    """
    query = """
    MATCH (c:Card) WHERE c.oracle_id IN $deck AND c.can_be_commander
    RETURN c.oracle_id AS oracle_id, c.name AS name, c.color_identity AS color_identity
    ORDER BY size(c.color_identity) DESC, coalesce(c.edhrec_rank, 999999) ASC
    LIMIT 1
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        record = session.run(query, deck=deck).single()
        return dict(record) if record else None


# --------------------------------------------------------------------------
# Deck lookups (diagnostics)
# --------------------------------------------------------------------------

DECK_CARDS = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
RETURN c.oracle_id AS oracle_id, c.name AS name, c.cmc AS cmc,
       c.type_line AS type_line, c.is_land AS is_land, c.layout AS layout,
       c.color_identity AS color_identity, c.price_usd AS price_usd,
       c.playability AS playability, coalesce(c.game_changer, false) AS game_changer,
       row.qty AS qty
"""

DECK_ROLE_WEIGHTS = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})-[f:FILLS_ROLE]->(role:Role)
RETURN role.name AS role, sum(f.weight * row.qty) AS weight
"""

# Per card, so bucket coverage can cap a card's contribution to one bucket at
# its strongest role. Summing deck-level role totals double-counts any card
# holding two roles in the same bucket.
DECK_CARD_ROLES = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
OPTIONAL MATCH (c)-[f:FILLS_ROLE]->(role:Role)
RETURN c.oracle_id AS oracle_id, row.qty AS qty,
       collect([role.name, f.weight]) AS roles
"""

# Producers expand *up* the hierarchy: a card making Treasure also supplies
# ritual_mana and artifact_matters, so it satisfies anything wanting those.
DECK_PRODUCED = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})-[:PRODUCES]->(:Resource)-[:BROADER*0..]->(r:Resource)
RETURN r.name AS resource, count(DISTINCT c) AS cards, collect(DISTINCT c.name) AS names
"""

# Consumers stay exact. A card wanting `artifact_matters` wants the general
# thing; expanding it downward would claim it specifically wants Treasures.
DECK_WANTED = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})-[:CARES_ABOUT]->(r:Resource)
RETURN r.name AS resource, count(DISTINCT c) AS cards, collect(DISTINCT c.name) AS names
"""


def _deck_rows(deck: dict[str, int]) -> list[dict[str, Any]]:
    return [{"oracle_id": oid, "qty": qty} for oid, qty in deck.items()]


# The bracket-flag patterns, ported verbatim from the mtg service's
# `bracket_flags.rs` — the same regexes that stamp `extra_turns` and
# `mass_land_denial` onto the catalog the legality band counts. Ported rather
# than re-imagined so the advisor withholds exactly the cards the band would
# flag; if one side changes, change the other. Java regex, full-match, so the
# alternation is wrapped in `(?is).*(...).*`.
_EXTRA_TURN_PATTERN = r"(?is).*\btakes? (an|two|three|any number of) extra turns?\b.*"
_EXTRA_TURN_HATE_PATTERN = r"(?is).*can't take extra turns.*"
_MASS_LAND_DENIAL_PATTERN = (
    r"(?is).*("
    r"destroy (all|each|every)\b[^.]*\blands?\b"
    r"|exile (all|each|every)\b[^.]*\blands?\b"
    r"|each player sacrifices\b[^.]*\blands\b"
    r"|\blands (don't|do not) untap\b"
    r"|can't untap more than \w+ lands?\b"
    r"|nonbasic lands (are|lose)\b"
    r").*"
)


def bracket_breakers(oracle_ids: list[str]) -> dict[str, dict[str, bool]]:
    """Which cards would trip the claimed bracket's own legality band.

    Three flags per card: the curated Game Changer list (a Scryfall property),
    and extra turns / mass land denial read off the oracle text with the same
    patterns the mtg service's catalog sync uses. One call serves both sides
    of the headroom question — what the deck already holds, and which
    candidates would add to it.
    """
    if not oracle_ids:
        return {}

    query = """
    MATCH (c:Card) WHERE c.oracle_id IN $oracle_ids
    RETURN c.oracle_id AS oracle_id,
           coalesce(c.game_changer, false) AS game_changer,
           (c.oracle_text IS NOT NULL AND c.oracle_text =~ $extra
            AND NOT c.oracle_text =~ $extra_hate) AS extra_turns,
           (c.oracle_text IS NOT NULL AND c.oracle_text =~ $mld) AS mass_land_denial
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            r["oracle_id"]: {
                "game_changer": bool(r["game_changer"]),
                "extra_turns": bool(r["extra_turns"]),
                "mass_land_denial": bool(r["mass_land_denial"]),
            }
            for r in session.run(
                query,
                oracle_ids=oracle_ids,
                extra=_EXTRA_TURN_PATTERN,
                extra_hate=_EXTRA_TURN_HATE_PATTERN,
                mld=_MASS_LAND_DENIAL_PATTERN,
            )
        }


def identities_by_name(names: set[str]) -> dict[str, list[str]]:
    """Colour identity per card name, for names the combo rows could not type.

    The HTTP-fallback combos carry no identities — Spellbook's card objects
    have none — but the *cards* are usually in the graph even when the Combo
    nodes are not yet ingested, and /combos' identity filter should not wave a
    piece through on a fact one indexed lookup away. Names the graph does not
    hold are simply absent, which the caller reads as "still unknown".
    """
    if not names:
        return {}

    query = """
    UNWIND $names AS wanted
    MATCH (c:Card) WHERE c.name = wanted OR c.name STARTS WITH wanted + ' //'
    RETURN DISTINCT wanted AS name, c.color_identity AS identity
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            r["name"]: list(r["identity"] or []) for r in session.run(query, names=sorted(names))
        }


def fetch_deck(deck: dict[str, int]) -> list[dict[str, Any]]:
    """Look up deck cards by oracle_id. Missing ids are simply absent."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(DECK_CARDS, rows=_deck_rows(deck))]


def deck_role_weights(deck: dict[str, int]) -> dict[str, float]:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            r["role"]: r["weight"] for r in session.run(DECK_ROLE_WEIGHTS, rows=_deck_rows(deck))
        }


def deck_card_roles(deck: dict[str, int]) -> list[dict[str, Any]]:
    """Per-card role weights, keyed by oracle_id.

    Carries the id because the cut scorer removes one card at a time and needs
    to know which. Bucket aggregation only reads `roles` and `qty`.
    """
    out: list[dict[str, Any]] = []

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(DECK_CARD_ROLES, rows=_deck_rows(deck)):
            weights = {name: weight for name, weight in record["roles"] if name is not None}
            out.append({"oracle_id": record["oracle_id"], "roles": weights, "qty": record["qty"]})

    return out


def _empty_balance_entry() -> dict[str, Any]:
    return {"produced": 0, "wanted": 0, "produced_cards": [], "wanted_cards": []}


def deck_resource_balance(deck: dict[str, int]) -> dict[str, dict[str, Any]]:
    """Per resource: how many deck cards supply it, how many want it — and which."""
    rows = _deck_rows(deck)
    balance: dict[str, dict[str, Any]] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(DECK_PRODUCED, rows=rows):
            entry = balance.setdefault(record["resource"], _empty_balance_entry())
            entry["produced"] = record["cards"]
            entry["produced_cards"] = sorted(record["names"])
        for record in session.run(DECK_WANTED, rows=rows):
            entry = balance.setdefault(record["resource"], _empty_balance_entry())
            entry["wanted"] = record["cards"]
            entry["wanted_cards"] = sorted(record["names"])

    return balance


# Per-card creature types, the other axis. No hierarchy to expand: creature
# types are flat, which is precisely why they are not Resource members.
DECK_CARD_TYPES = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
OPTIONAL MATCH (c)-[:IS_TYPE]->(i:CreatureType)
WITH c, row.qty AS qty, collect(DISTINCT i.name) AS is_type
OPTIONAL MATCH (c)-[:CARES_ABOUT_TYPE]->(w:CreatureType)
WITH c, qty, is_type, collect(DISTINCT w.name) AS cares_type
OPTIONAL MATCH (c)-[:MAKES_TYPE]->(m:CreatureType)
RETURN c.oracle_id AS oracle_id, qty, is_type, cares_type,
       collect(DISTINCT m.name) AS makes_type
"""

# Bodies and payoffs per creature type, over the whole corpus. Feeds
# `typal_density` — see `themes.py` for why this is the weight rather than IDF.
TYPAL_CORPUS_COUNTS = """
MATCH (t:CreatureType)
OPTIONAL MATCH (b:Card)-[:IS_TYPE]->(t)
WITH t, count(DISTINCT b) AS bodies
OPTIONAL MATCH (p:Card)-[:CARES_ABOUT_TYPE]->(t)
RETURN t.name AS creature_type, bodies, count(DISTINCT p) AS payoffs
"""


def deck_card_types(deck: dict[str, int]) -> list[dict[str, Any]]:
    """Per-card creature types, keyed by oracle_id, carrying quantity."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(DECK_CARD_TYPES, rows=_deck_rows(deck))]


def typal_corpus_counts() -> tuple[dict[str, int], dict[str, int]]:
    """`(bodies, payoffs)` per creature type over the corpus."""
    bodies: dict[str, int] = {}
    payoffs: dict[str, int] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(TYPAL_CORPUS_COUNTS):
            # A type with no bodies is a payoff pointing at nothing — a typo in
            # extraction or a type that exists only in reminder text. It cannot
            # carry a deck, so it is dropped rather than given a density.
            if record["bodies"]:
                bodies[record["creature_type"]] = record["bodies"]
                payoffs[record["creature_type"]] = record["payoffs"]

    return bodies, payoffs


# Per-card resources, expanded up the hierarchy in Cypher so a Treasure producer
# already carries artifact_token and artifact_matters. Used by the theme layer
# and by the cut scorer, which removes one card at a time.
DECK_CARD_RESOURCES = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
OPTIONAL MATCH (c)-[:PRODUCES]->(:Resource)-[:BROADER*0..]->(p:Resource)
WITH c, collect(DISTINCT p.name) AS produces
OPTIONAL MATCH (c)-[:CARES_ABOUT]->(:Resource)-[:BROADER*0..]->(w:Resource)
RETURN c.oracle_id AS oracle_id, produces, collect(DISTINCT w.name) AS cares_about
"""

RESOURCE_CORPUS_COUNTS = """
MATCH (c:Card)-[:PRODUCES|CARES_ABOUT]->(:Resource)-[:BROADER*0..]->(r:Resource)
RETURN r.name AS resource, count(DISTINCT c) AS n
"""


def deck_card_resources(deck: dict[str, int]) -> dict[str, dict[str, set[str]]]:
    """Resources per card, hierarchy-expanded, with the two directions kept apart.

    Merging them loses the distinction between supplying a resource and being a
    payoff for it — and a deck with eight ramp spells is not a landfall deck.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            record["oracle_id"]: {
                "produces": {r for r in record["produces"] if r},
                "cares_about": {r for r in record["cares_about"] if r},
            }
            for record in session.run(DECK_CARD_RESOURCES, rows=_deck_rows(deck))
        }


TYPAL_SCHEMA = [
    "CREATE CONSTRAINT type_name IF NOT EXISTS FOR (t:CreatureType) REQUIRE t.name IS UNIQUE",
]

ALL_CARD_TEXT = """
MATCH (c:Card)
RETURN c.oracle_id AS oracle_id, c.name AS name,
       c.type_line AS type_line, c.oracle_text AS oracle_text
"""

WRITE_TYPAL = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
FOREACH (name IN row.is_type |
    MERGE (t:CreatureType {name: name}) MERGE (c)-[:IS_TYPE]->(t))
FOREACH (name IN row.cares |
    MERGE (t:CreatureType {name: name}) MERGE (c)-[:CARES_ABOUT_TYPE]->(t))
FOREACH (name IN row.makes |
    MERGE (t:CreatureType {name: name}) MERGE (c)-[:MAKES_TYPE]->(t))
"""


def all_card_text() -> list[dict[str, Any]]:
    """Every card's name, type line and oracle text.

    Typal extraction needs Python regex — backreferences, masking and a
    backwards list walk are past what a Cypher predicate can express — so this
    is the one layer that pulls text out rather than matching in place.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(ALL_CARD_TEXT)]


def clear_typal() -> None:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run(
            "MATCH ()-[r:IS_TYPE|CARES_ABOUT_TYPE|MAKES_TYPE]->() "
            "CALL (r) { DELETE r } IN TRANSACTIONS OF 20000 ROWS"
        )


def write_typal(rows: list[dict[str, Any]], *, batch_size: int = 2_000) -> int:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for statement in TYPAL_SCHEMA:
            session.run(statement)
        for chunk in _chunks(rows, batch_size):
            session.execute_write(lambda tx, c=chunk: tx.run(WRITE_TYPAL, rows=c).consume())
    return len(rows)


def typal_stats() -> dict[str, int]:
    query = """
    MATCH (t:CreatureType) WITH count(t) AS types
    OPTIONAL MATCH ()-[i:IS_TYPE]->() WITH types, count(i) AS is_type
    OPTIONAL MATCH ()-[c:CARES_ABOUT_TYPE]->() WITH types, is_type, count(c) AS cares
    OPTIONAL MATCH ()-[m:MAKES_TYPE]->()
    RETURN types, is_type, cares, count(m) AS makes
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def typal_bridge(creature_type: str, *, limit: int = 8) -> list[dict[str, str]]:
    """Payoffs for a type, and the creatures that satisfy them."""
    query = """
    MATCH (t:CreatureType) WHERE t.name = $type_name
    MATCH (p:Card)-[:CARES_ABOUT_TYPE]->(t)<-[:IS_TYPE]-(b:Card)
    // The sort key is computed here, not in ORDER BY: aliasing `p.name AS payoff`
    // rebinds the name to a String, and ordering by `payoff.edhrec_rank` then
    // reads a property off a string. The RETURN aliases shadow the nodes.
    RETURN p.name AS payoff, b.name AS body,
           coalesce(p.edhrec_rank, 999999) + coalesce(b.edhrec_rank, 999999) AS rank
    ORDER BY rank
    LIMIT $limit
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        # Parameters as keywords: driver 6 rejects a positionally-passed dict.
        return [dict(r) for r in session.run(query, type_name=creature_type, limit=limit)]


THEME_SCHEMA = [
    "CREATE CONSTRAINT theme_id IF NOT EXISTS FOR (t:Theme) REQUIRE t.id IS UNIQUE",
]

WRITE_THEMES = """
UNWIND $rows AS row
MATCH (c:Card {oracle_id: row.oracle_id})
UNWIND row.fits AS fit
MERGE (t:Theme {id: fit.theme})
SET t.label = fit.label
MERGE (c)-[f:FITS_THEME]->(t)
SET f.fit = fit.fit
"""


def clear_themes() -> None:
    """Drop the edges *and* the nodes.

    Clearing only the relationships left an orphan `:Theme` behind for every
    theme ever removed or renamed — `tribal` survived its own deletion with
    zero cards attached, and `theme_stats` went on reporting 15 themes for a
    vocabulary of 14. `write_themes` re-MERGEs every node it needs, so nothing
    outside FITS_THEME holds a reference and deleting them all is idempotent.
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        session.run(
            "MATCH ()-[r:FITS_THEME]->() CALL (r) { DELETE r } IN TRANSACTIONS OF 20000 ROWS"
        )
        session.run("MATCH (t:Theme) CALL (t) { DETACH DELETE t } IN TRANSACTIONS OF 1000 ROWS")


def write_themes(rows: list[dict[str, Any]], *, batch_size: int = 2_000) -> int:
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for statement in THEME_SCHEMA:
            session.run(statement)
        for chunk in _chunks(rows, batch_size):
            session.execute_write(lambda tx, c=chunk: tx.run(WRITE_THEMES, rows=c).consume())
    return len(rows)


def all_card_resources() -> list[dict[str, Any]]:
    """Every card's produced and cared-about resources, hierarchy-expanded.

    `name` rides along for `agreement.py`, which scores EDHREC's card *names*
    against theme membership and has no other way to get from one to the
    other. It costs nothing here and saves a second corpus scan there.
    """
    query = """
    MATCH (c:Card)
    OPTIONAL MATCH (c)-[:PRODUCES]->(:Resource)-[:BROADER*0..]->(p:Resource)
    WITH c, collect(DISTINCT p.name) AS produces
    OPTIONAL MATCH (c)-[:CARES_ABOUT]->(:Resource)-[:BROADER*0..]->(w:Resource)
    RETURN c.oracle_id AS oracle_id, c.name AS name, produces,
           collect(DISTINCT w.name) AS cares_about
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return [dict(r) for r in session.run(query)]


def theme_stats() -> dict[str, int]:
    query = """
    MATCH (t:Theme) WITH count(t) AS themes
    OPTIONAL MATCH ()-[f:FITS_THEME]->()
    RETURN themes, count(f) AS fits
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return dict(session.run(query).single())


def resource_edge_counts() -> tuple[dict[str, int], int]:
    """Direct producer and consumer counts per resource, for the audit.

    Deliberately *not* hierarchy-expanded: the audit asks whether a resource has
    edges of its own, and expansion would make a childless resource look wired
    because its parent is.
    """
    query = """
    MATCH (c:Card)-[r:PRODUCES|CARES_ABOUT]->(res:Resource)
    RETURN res.name AS resource, type(r) AS rel, count(DISTINCT c) AS n
    """
    produced: dict[str, int] = {}
    wanted: dict[str, int] = {}

    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        for record in session.run(query):
            target = produced if record["rel"] == "PRODUCES" else wanted
            target[record["resource"]] = record["n"]

    return produced, wanted


def roles_with_cards() -> set[str]:
    query = "MATCH (:Card)-[:FILLS_ROLE]->(r:Role) RETURN collect(DISTINCT r.name) AS names"
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return set(session.run(query).single()["names"])


def resource_corpus_counts() -> tuple[dict[str, int], int]:
    """How many cards carry each resource, and the corpus size, for IDF."""
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        counts = {r["resource"]: r["n"] for r in session.run(RESOURCE_CORPUS_COUNTS)}
        total = session.run("MATCH (c:Card) RETURN count(c) AS n").single()["n"]

    return counts, total


def cards_role_weights(oracle_ids: list[str]) -> dict[str, dict[str, float]]:
    """Role weights for arbitrary cards, keyed by oracle_id.

    Swap pairing needs the *candidate's* roles, and the candidate is by
    definition not in the deck, so `deck_card_roles` cannot answer it.
    """
    if not oracle_ids:
        return {}

    query = """
    UNWIND $ids AS oid
    MATCH (c:Card {oracle_id: oid})-[f:FILLS_ROLE]->(r:Role)
    RETURN c.oracle_id AS oracle_id, collect([r.name, f.weight]) AS roles
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {
            record["oracle_id"]: {name: weight for name, weight in record["roles"] if name}
            for record in session.run(query, ids=oracle_ids)
        }


def land_name_payoffs(oracle_ids: list[str]) -> list[str]:
    """Deck cards that count lands with different names, by name.

    A text rule rather than a vocabulary resource: the phrase "lands with
    different names" sits on exactly three cards (Field of the Dead, The
    Necrobloom, Monument to Perfection), too few to earn a Resource but
    enough to change what a mana base should look like. Retires into an
    extracted theme if the mechanic ever grows a real card pool.
    """
    query = """
    UNWIND $ids AS oid
    MATCH (c:Card {oracle_id: oid})
    WHERE c.oracle_text CONTAINS 'lands with different names'
    RETURN collect(DISTINCT c.name) AS names
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return session.run(query, ids=oracle_ids).single()["names"]


def resolve_names(names: list[str]) -> dict[str, str]:
    """Map card names to oracle_ids. Used by the CLI; the web path sends ids."""
    query = """
    UNWIND $names AS wanted
    MATCH (c:Card)
    WHERE toLower(c.name) = toLower(wanted)
       OR toLower(c.name) STARTS WITH toLower(wanted) + ' //'
    RETURN wanted, c.oracle_id AS oracle_id
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return {r["wanted"]: r["oracle_id"] for r in session.run(query, names=names)}


def count_for_tag(slug: str) -> int:
    query = """
    MATCH (root:Tag {slug: $slug})-[:PARENT_OF*0..]->(t:Tag)<-[:TAGGED]-(c:Card)
    RETURN count(DISTINCT c) AS n
    """
    with driver() as instance, instance.session(database=settings.neo4j_database) as session:
        return session.run(query, slug=slug).single()["n"]
