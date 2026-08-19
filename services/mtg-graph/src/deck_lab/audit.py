"""Health of the extraction layer.

The failure modes this catches are all silent. A resource with consumers and no
producers bridges to nothing; a resource with no edges at all makes any theme
built on it read as zero; an unreachable role is invisible to the quota solver.
None of them raise, and none of them show up in a coverage percentage — the
landfall bug sat behind a 90% coverage number for two commits.

Run `deck-lab audit` after any change to the tag mapping or the rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .vocabulary import (
    BUCKET_ROLES,
    RESOURCE_PARENTS,
    Resource,
    Role,
    is_bridge_resource,
    resource_ancestors,
)


def _descendants() -> dict[Resource, set[Resource]]:
    """Inverse of RESOURCE_PARENTS: every resource that rolls up into each."""
    out: dict[Resource, set[Resource]] = {r: set() for r in Resource}
    for child in RESOURCE_PARENTS:
        for ancestor in resource_ancestors(child):
            out[ancestor].add(child)
    return out


@dataclass
class ResourceHealth:
    resource: str
    produced_by: int
    wanted_by: int
    supply_only: bool
    # Producers reachable only through the hierarchy. `artifact_matters` has no
    # direct producer but every mana rock rolls up into it, so the bridge does
    # find counterparties at query time.
    produced_below: int = 0
    # Consumers reachable by rolling *up*: `untap_creature` has no consumer of
    # its own, but `tap_outlet` wants `untap_permanent`, and the bridge matches
    # a producer against the consumer's resource or any ancestor of it.
    wanted_above: int = 0
    is_root: bool = False

    @property
    def dead(self) -> bool:
        """No edges anywhere. A hierarchy root is not dead — its children carry
        the edges and it exists to be queried through."""
        if self.is_root and (self.produced_below or self.wanted_by):
            return False
        return self.produced_by == 0 and self.wanted_by == 0

    @property
    def orphaned_consumers(self) -> bool:
        """Cards want it, nothing supplies it. A bridge that returns nothing."""
        return self.wanted_by > 0 and self.produced_by == 0 and self.produced_below == 0

    @property
    def orphaned_producers(self) -> bool:
        """Cards supply it, nothing wants it — fine only if it is supply-only."""
        return (
            self.produced_by > 0
            and self.wanted_by == 0
            and self.wanted_above == 0
            and not self.supply_only
        )


@dataclass
class AuditReport:
    resources: list[ResourceHealth] = field(default_factory=list)
    unreachable_roles: list[str] = field(default_factory=list)
    unmapped_roles: list[str] = field(default_factory=list)

    @property
    def dead(self) -> list[ResourceHealth]:
        return [r for r in self.resources if r.dead]

    @property
    def orphaned_consumers(self) -> list[ResourceHealth]:
        return sorted(
            (r for r in self.resources if r.orphaned_consumers),
            key=lambda r: -r.wanted_by,
        )

    @property
    def orphaned_producers(self) -> list[ResourceHealth]:
        return sorted(
            (r for r in self.resources if r.orphaned_producers),
            key=lambda r: -r.produced_by,
        )

    @property
    def healthy(self) -> list[ResourceHealth]:
        return [r for r in self.resources if r.produced_by and r.wanted_by]

    def score(self) -> float:
        """Share of resources that are neither dead nor half-wired."""
        if not self.resources:
            return 0.0
        broken = len(self.dead) + len(self.orphaned_consumers) + len(self.orphaned_producers)
        return 1.0 - broken / len(self.resources)


def build_report(
    produced: dict[str, int], wanted: dict[str, int], roles_with_cards: set[str]
) -> AuditReport:
    """Assemble the report. Pure — the graph supplies the three inputs."""
    below = _descendants()
    resources = [
        ResourceHealth(
            resource=str(resource),
            produced_by=produced.get(str(resource), 0),
            wanted_by=wanted.get(str(resource), 0),
            supply_only=not is_bridge_resource(resource),
            produced_below=sum(produced.get(str(d), 0) for d in below[resource]),
            wanted_above=sum(wanted.get(str(a), 0) for a in resource_ancestors(resource)),
            is_root=bool(below[resource]),
        )
        for resource in Resource
    ]

    reachable = set().union(*BUCKET_ROLES.values())

    return AuditReport(
        resources=resources,
        unreachable_roles=sorted(str(r) for r in set(Role) - reachable),
        unmapped_roles=sorted(str(r) for r in Role if str(r) not in roles_with_cards),
    )


def audit() -> AuditReport:
    from .graph import resource_edge_counts, roles_with_cards

    produced, wanted = resource_edge_counts()
    return build_report(produced, wanted, roles_with_cards())
