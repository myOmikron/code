"""The closed vocabulary.

This is the most load-bearing file in the project. Free-form extraction yields
thousands of near-duplicate resource names ("treasure token" / "Treasures" /
"treasure_tokens") and the 2-hop bridge query then joins on nothing. Every
extraction is constrained to these enums, and the extractor is instructed to
emit nothing rather than invent a term.

Three distinct vocabularies, deliberately not merged:

`Resource`  A *thing* a card makes or wants. The join key for the bipartite
            bridge: `A -PRODUCES-> r <-CARES_ABOUT- B`. Answers "do these two
            cards talk to each other?"

`Role`      The *function* a card performs in deck composition. Feeds the
            quota solver. Answers "what job does this card do?"

`Bucket`    User-facing composition categories. Aggregations over roles, and
            deliberately many-to-many — a mana rock is simultaneously a mana
            source and a ramp piece. Modelling buckets as sets of roles is what
            lets a card count toward two quotas without double-counting bugs.
"""

from __future__ import annotations

from enum import StrEnum


class Resource(StrEnum):
    """Things cards produce or care about. Keep additions rare and deliberate."""

    # --- Tokens and generated permanents ---
    TREASURE = "treasure"
    FOOD = "food"
    CLUE = "clue"
    BLOOD = "blood"
    POWERSTONE = "powerstone"
    ARTIFACT_TOKEN = "artifact_token"
    CREATURE_TOKEN = "creature_token"
    TOKEN_COPY = "token_copy"

    # --- Counters ---
    PLUS_ONE_COUNTER = "plus_one_counter"
    # The opposite polarity, and the reason it needs a term of its own rather
    # than sharing `plus_one_counter`: Tagger hangs `mm-counters-matter`
    # directly under `counters-matter`, so the closure made 82 cards whose text
    # says "-1/-1" and never "+1/+1" members of the +1/+1 counters theme —
    # Hapatra, Necroskitter, Blowfly Infestation, The Scorpion God. Measured
    # from the other side, EDHREC's own `minus-1-minus-1-counters` high-synergy
    # list scored 8/10 *inside* our +1/+1 theme.
    MINUS_ONE_COUNTER = "minus_one_counter"
    CHARGE_COUNTER = "charge_counter"
    LOYALTY_COUNTER = "loyalty_counter"
    EXPERIENCE_COUNTER = "experience_counter"
    ENERGY = "energy"
    POISON_COUNTER = "poison_counter"

    # --- Card flow ---
    CARD_DRAW = "card_draw"
    IMPULSE_DRAW = "impulse_draw"
    TUTOR_TO_HAND = "tutor_to_hand"
    TUTOR_TO_BATTLEFIELD = "tutor_to_battlefield"
    TUTOR_TO_TOP = "tutor_to_top"
    # Two-sided, though it spent a long time listed supply-only on the
    # argument that nothing wants to discard. Madness, Hellbent and the
    # "whenever you discard" payoffs want exactly that, and while the claim
    # stood the audit could not report the gap: 1,242 producers, 0 consumers,
    # vocabulary health 98%.
    DISCARD_OWN = "discard_own"
    DISCARD_OPPONENT = "discard_opponent"

    # --- Graveyard ---
    SELF_MILL = "self_mill"
    MILL_OPPONENT = "mill_opponent"
    GRAVEYARD_ANY = "graveyard_any"
    GRAVEYARD_CREATURE = "graveyard_creature"
    GRAVEYARD_INSTANT_SORCERY = "graveyard_instant_sorcery"
    GRAVEYARD_ARTIFACT = "graveyard_artifact"
    GRAVEYARD_LAND = "graveyard_land"
    RECURSION_ANY = "recursion_any"
    RECURSION_TO_HAND = "recursion_to_hand"
    RECURSION_TO_BATTLEFIELD = "recursion_to_battlefield"
    EXILE_FROM_GRAVEYARD = "exile_from_graveyard"

    # --- Mana ---
    MANA_ROCK = "mana_rock"
    MANA_DORK = "mana_dork"
    LAND_RAMP = "land_ramp"
    RITUAL_MANA = "ritual_mana"
    MANA_FIXING = "mana_fixing"
    COST_REDUCTION = "cost_reduction"
    EXTRA_LAND_DROP = "extra_land_drop"
    UNTAP_PERMANENT = "untap_permanent"
    UNTAP_LAND = "untap_land"
    UNTAP_CREATURE = "untap_creature"
    UNTAP_ARTIFACT = "untap_artifact"

    # --- Lands ---
    LANDFALL_TRIGGER = "landfall_trigger"
    LAND_ANIMATION = "land_animation"

    # --- Events other cards trigger on ---
    ETB_TRIGGER = "etb_trigger"
    LTB_TRIGGER = "ltb_trigger"
    DEATH_TRIGGER = "death_trigger"
    ATTACK_TRIGGER = "attack_trigger"
    COMBAT_DAMAGE_TRIGGER = "combat_damage_trigger"
    # One of *your* creatures being tapped, and — the whole point — tapped by
    # something other than an attack. Crew, convoke, saddle, station, enlist,
    # teamwork, harmonize and every "Tap an untapped creature you control:"
    # cost supply it; Survival, Emmara, Far Traveler and "whenever this
    # creature becomes tapped" pay it off.
    #
    # Named with the `discard_own` / `mill_opponent` idiom because polarity is
    # the whole discriminator here. Roughly half the "becomes tapped" text in
    # the corpus is aimed at *someone else's* permanents — Psychic Venom,
    # Verity Circle, Gideon's Avenger — and a deck of those wants a tapper,
    # the exact opposite of a Vehicle. Merging the two sides would bridge
    # Winter Orb decks to Springleaf Drum.
    #
    # Distinct from `untap_creature`, which is the other half of a pseudo-vigilance
    # loop and already carries `untap_combo`. A Survival creature does not want
    # to be untapped; it wants to end the turn tapped.
    TAP_OWN_CREATURE = "tap_own_creature"
    CAST_TRIGGER = "cast_trigger"
    UPKEEP_TRIGGER = "upkeep_trigger"
    END_STEP_TRIGGER = "end_step_trigger"
    LIFEGAIN_TRIGGER = "lifegain_trigger"

    # --- Combat ---
    EXTRA_COMBAT = "extra_combat"
    EXTRA_TURN = "extra_turn"
    EVASION = "evasion"
    HASTE_GRANT = "haste_grant"
    POWER_BOOST = "power_boost"
    # A creature with power 4 or greater, and the payoffs that check for one.
    # Distinct from `power_boost`: a pump spell changes power, a Ghalta *is*
    # power, and "power matters" payoffs (Ferocious, Garruk's Uprising, cheat
    # effects like Ilharg) want the second. The producing side is structural —
    # every creature printed at power >= 4 — the same shape as
    # `legendary_matters`; the caring side is a text rule plus curated tags,
    # because the raw Tagger family conflates "wants big power" with "wants
    # power 2 or less" (Delney, Tetsuko) and polarity decides the archetype.
    HIGH_POWER = "high_power"
    GOAD = "goad"

    # --- Life ---
    LIFEGAIN = "lifegain"
    LIFELOSS_OPPONENT = "lifeloss_opponent"
    LIFE_PAYMENT = "life_payment"

    # --- Sacrifice and blink ---
    SACRIFICE_OUTLET = "sacrifice_outlet"
    SACRIFICE_OUTLET_CREATURE = "sacrifice_outlet_creature"
    SACRIFICE_OUTLET_PERMANENT = "sacrifice_outlet_permanent"
    # Combos need the outlet to be free. This is the canonical case for
    # sub-resources: "a sacrifice outlet" and "a *free* sacrifice outlet" are
    # different questions and a flat vocabulary can only answer one.
    FREE_SACRIFICE_OUTLET = "free_sacrifice_outlet"
    # The *event* of a land leaving play, not the outlet that causes it —
    # modelled exactly like `death_trigger`, which is the creature equivalent.
    # Outlets produce it; Titania, Gitrog and Hearthhull care about it.
    #
    # This exists because a land going to the graveyard does **not** "die" in
    # the rules sense, so it triggers no Blood Artist. Without a term of its
    # own, `sacrifice-outlet` mapped land sacrifice to `death_trigger` and
    # Hearthhull, the Worldseed read as an aristocrats enabler.
    #
    # Only the event is added, not a `sacrifice_outlet_land` sibling: the
    # payoffs want the event, and nothing so far asks for "a land sac outlet
    # specifically". Additions here stay rare and deliberate.
    SACRIFICE_LAND = "sacrifice_land"
    BLINK = "blink"

    # --- Spellslinger ---
    STORM_COUNT = "storm_count"
    PROWESS_TRIGGER = "prowess_trigger"
    MAGECRAFT_TRIGGER = "magecraft_trigger"
    COPY_SPELL = "copy_spell"

    # --- Interaction (as resources: things a card *supplies* to the deck) ---
    SPOT_REMOVAL = "spot_removal"
    MASS_REMOVAL = "mass_removal"
    COUNTERSPELL = "counterspell"
    GRAVEYARD_HATE = "graveyard_hate"
    PROTECTION = "protection"
    TAX_EFFECT = "tax_effect"
    # Denying the table its resources — mass land destruction, Stasis effects,
    # untap-step and activation locks. Distinct from `tax_effect`: a tax makes
    # things cost more, denial stops them happening at all. Winter Orb and
    # Smokestack live here, not there.
    RESOURCE_DENIAL = "resource_denial"

    # --- Tribal and misc ---
    TRIBAL_LORD = "tribal_lord"
    TRIBAL_PAYOFF = "tribal_payoff"
    PROLIFERATE = "proliferate"
    POPULATE = "populate"
    ARTIFACT_MATTERS = "artifact_matters"
    ENCHANTMENT_MATTERS = "enchantment_matters"
    # Same shape as artifact_matters: every legendary permanent supplies it
    # structurally (4,134 cards), and the 194 cards that count legends —
    # Sisay, Jodah, Esika, Reki — care about it.
    LEGENDARY_MATTERS = "legendary_matters"
    # Kept as two members rather than one `attach_matters`: 105 consumers care
    # about Auras only and 136 about Equipment only, so 73% of the payoff side
    # carries one-sided information the bridge would lose in a merge. On the
    # theme axis alone the merge measures identically — this split is priced
    # for retrieval, not for themes.
    AURA_MATTERS = "aura_matters"
    EQUIPMENT_MATTERS = "equipment_matters"
    # Vehicles are their own axis rather than a slice of artifact_matters. A
    # deck can be built around them without being an artifact deck, and — the
    # case this exists for — an artifact commander can be famous for vehicles
    # while a given deck ignores them entirely. Hung under artifact_matters in
    # RESOURCE_PARENTS a vehicle payoff would read as artifacts, and excluding
    # it would take the whole artifact theme down with it.
    VEHICLE_MATTERS = "vehicle_matters"

    # --- Commander-zone specific (see context_rules) ---
    COMMANDER_RECURSION = "commander_recursion"
    COMMANDER_PROTECTION = "commander_protection"


class Role(StrEnum):
    """What job a card does. Primitive units the quota solver reasons over."""

    LAND = "land"
    MANA_ROCK = "mana_rock"
    MANA_DORK = "mana_dork"
    LAND_RAMP = "land_ramp"
    # Rituals, cost reduction and generic "add mana" effects: ramp that is
    # neither a rock, a dork, nor a land fetch. Exposed by the Tagger mapping —
    # the generic `ramp` tag covers 2,097 cards that fit none of the above.
    RAMP_OTHER = "ramp_other"
    CARD_ADVANTAGE = "card_advantage"
    TUTOR = "tutor"
    SPOT_REMOVAL = "spot_removal"
    BOARD_WIPE = "board_wipe"
    COUNTERSPELL = "counterspell"
    GRAVEYARD_HATE = "graveyard_hate"
    PROTECTION = "protection"
    RECURSION = "recursion"
    STAX = "stax"
    PAYOFF = "payoff"
    WINCON = "wincon"
    COMBO_PIECE = "combo_piece"


class Bucket(StrEnum):
    """User-facing composition categories, shown on the diagnostics tab."""

    MANA_SOURCES = "mana_sources"
    RAMP = "ramp"
    CARD_DRAW = "card_draw"
    INTERACTION = "interaction"
    SYNERGY_WINCON = "synergy_wincon"


# A role may feed several buckets. This is the overlap that makes naive
# per-bucket greedy filling wrong: a Signet is a mana source *and* a ramp piece,
# so the two quotas are not independent and cannot be satisfied one at a time.
BUCKET_ROLES: dict[Bucket, frozenset[Role]] = {
    Bucket.MANA_SOURCES: frozenset({Role.LAND, Role.MANA_ROCK, Role.MANA_DORK}),
    Bucket.RAMP: frozenset({Role.MANA_ROCK, Role.MANA_DORK, Role.LAND_RAMP, Role.RAMP_OTHER}),
    Bucket.CARD_DRAW: frozenset({Role.CARD_ADVANTAGE}),
    # Protection sits here rather than with synergy: Heroic Intervention is a
    # reactive answer held up during someone else's turn, and it competes for
    # the same slot as a counterspell.
    Bucket.INTERACTION: frozenset(
        {
            Role.SPOT_REMOVAL,
            Role.BOARD_WIPE,
            Role.COUNTERSPELL,
            Role.GRAVEYARD_HATE,
            Role.PROTECTION,
        }
    ),
    Bucket.SYNERGY_WINCON: frozenset(
        {Role.PAYOFF, Role.WINCON, Role.COMBO_PIECE, Role.RECURSION, Role.TUTOR, Role.STAX}
    ),
}

RESOURCES: frozenset[str] = frozenset(Resource)
ROLES: frozenset[str] = frozenset(Role)


# --------------------------------------------------------------------------
# Resource hierarchy
# --------------------------------------------------------------------------
#
# Specificity without fragmenting the join. A card producing
# `free_sacrifice_outlet` also satisfies anything wanting `sacrifice_outlet`,
# because the bridge matches a producer's resource against the consumer's
# resource *or any ancestor of it*. Broad questions get recall from the roots;
# combo questions get precision from the leaves.
#
# This is a DAG, not a tree: a Treasure is an artifact token *and* a mana
# source, and both parents carry real queries.
#
# The rule for adding depth — worth stating because getting it wrong is what
# kills a closed vocabulary:
#
#   Is it a *kind of* the parent?          -> child resource
#   Is it a *property of this card's*      -> edge qualifier on PRODUCES
#   version of the same thing?                (amount, conditional, trigger)
#
# `free_sacrifice_outlet` is a kind of sacrifice outlet, so it is a child.
# "makes a Treasure when a creature dies" is not a kind of Treasure — encoding
# it as `treasure_from_death` starts a combinatorial explosion that leaves
# every leaf too sparse to join. That belongs on the edge.

RESOURCE_PARENTS: dict[Resource, tuple[Resource, ...]] = {
    # Sacrifice outlets — combo detection needs "free", diagnostics need "any".
    Resource.SACRIFICE_OUTLET_CREATURE: (Resource.SACRIFICE_OUTLET,),
    Resource.SACRIFICE_OUTLET_PERMANENT: (Resource.SACRIFICE_OUTLET,),
    Resource.FREE_SACRIFICE_OUTLET: (Resource.SACRIFICE_OUTLET,),
    # Untap effects — Kiki lines, High Tide lines and Paradox Engine lines are
    # entirely different combos that a flat `untap_permanent` cannot separate.
    Resource.UNTAP_LAND: (Resource.UNTAP_PERMANENT,),
    Resource.UNTAP_CREATURE: (Resource.UNTAP_PERMANENT,),
    Resource.UNTAP_ARTIFACT: (Resource.UNTAP_PERMANENT,),
    # Graveyard contents — reanimator cares which card types are down there.
    Resource.GRAVEYARD_CREATURE: (Resource.GRAVEYARD_ANY,),
    Resource.GRAVEYARD_INSTANT_SORCERY: (Resource.GRAVEYARD_ANY,),
    Resource.GRAVEYARD_ARTIFACT: (Resource.GRAVEYARD_ANY,),
    Resource.GRAVEYARD_LAND: (Resource.GRAVEYARD_ANY,),
    # Recursion destination — the command-tax rule needs "to battlefield"
    # specifically; a Regrowth does not dodge the tax.
    Resource.RECURSION_TO_HAND: (Resource.RECURSION_ANY,),
    Resource.RECURSION_TO_BATTLEFIELD: (Resource.RECURSION_ANY,),
    Resource.COMMANDER_RECURSION: (Resource.RECURSION_TO_BATTLEFIELD,),
    # Artifact tokens. Treasure and Powerstone have two parents each — they are
    # artifacts for Academy Manufactor and mana for a ritual line.
    Resource.TREASURE: (Resource.ARTIFACT_TOKEN, Resource.RITUAL_MANA),
    Resource.POWERSTONE: (Resource.ARTIFACT_TOKEN, Resource.RITUAL_MANA),
    Resource.FOOD: (Resource.ARTIFACT_TOKEN,),
    Resource.CLUE: (Resource.ARTIFACT_TOKEN,),
    Resource.BLOOD: (Resource.ARTIFACT_TOKEN,),
    Resource.ARTIFACT_TOKEN: (Resource.ARTIFACT_MATTERS,),
    Resource.MANA_ROCK: (Resource.ARTIFACT_MATTERS,),
    # Impulse draw is card draw for quota purposes, but not for "draw matters".
    Resource.IMPULSE_DRAW: (Resource.CARD_DRAW,),
}


def resource_ancestors(resource: Resource) -> set[Resource]:
    """Every resource `resource` also satisfies, transitively. Excludes itself."""
    seen: set[Resource] = set()
    frontier = list(RESOURCE_PARENTS.get(resource, ()))

    while frontier:
        parent = frontier.pop()
        if parent in seen:
            continue
        seen.add(parent)
        frontier.extend(RESOURCE_PARENTS.get(parent, ()))

    return seen


def resource_hierarchy_cycles() -> list[Resource]:
    """Resources that are their own ancestor. Must always be empty."""
    return [r for r in RESOURCE_PARENTS if r in resource_ancestors(r)]


# Not every resource is a bridge. Some are supplied *to the deck* rather than
# traded between cards — nothing "synergises with" a counterspell the way an
# aristocrats payoff synergises with a sacrifice outlet.
#
# The distinction matters operationally: a two-sided resource with producers and
# no consumers is a bug (landfall_trigger had payoffs and no producers, and
# bridged to nothing until land ramp was mapped). A supply-only resource with no
# consumers is correct, and flagging it would train us to ignore the real alarm.
SUPPLY_ONLY: frozenset[Resource] = frozenset(
    {
        Resource.SPOT_REMOVAL,
        Resource.MASS_REMOVAL,
        Resource.COUNTERSPELL,
        Resource.GRAVEYARD_HATE,
        Resource.PROTECTION,
        Resource.TAX_EFFECT,
        # Nothing in Magic wants a Winter Orb. Supply-only by the nature of the
        # archetype, not by an extraction gap — same standing as mill_opponent.
        Resource.RESOURCE_DENIAL,
        Resource.COMMANDER_PROTECTION,
        Resource.MANA_FIXING,
        Resource.EXTRA_TURN,
        Resource.EXTRA_COMBAT,
        Resource.EVASION,
        Resource.HASTE_GRANT,
        Resource.TUTOR_TO_HAND,
        Resource.TUTOR_TO_TOP,
        Resource.TUTOR_TO_BATTLEFIELD,
        Resource.DISCARD_OPPONENT,
        Resource.MILL_OPPONENT,
        Resource.LIFELOSS_OPPONENT,
        Resource.LIFE_PAYMENT,
        # Blink is the enabler; what it *wants* is etb_trigger, which is where
        # the actual bridge lives.
        Resource.BLINK,
        Resource.EXILE_FROM_GRAVEYARD,
        Resource.SELF_MILL,
        Resource.LAND_RAMP,
        Resource.EXTRA_LAND_DROP,
        Resource.RECURSION_ANY,
        Resource.RECURSION_TO_HAND,
        Resource.RECURSION_TO_BATTLEFIELD,
        Resource.COMMANDER_RECURSION,
        Resource.CARD_DRAW,
        Resource.IMPULSE_DRAW,
        # Confirmed by `deck-lab audit`: these have thousands of producers and
        # no consumer, and that is correct. Nothing in Magic "wants a sacrifice
        # outlet" the way an aristocrats payoff wants a death trigger — the
        # outlet supplies the death, and `death_trigger` is where they meet.
        Resource.SACRIFICE_OUTLET,
        Resource.SACRIFICE_OUTLET_CREATURE,
        Resource.SACRIFICE_OUTLET_PERMANENT,
        Resource.FREE_SACRIFICE_OUTLET,
        Resource.MANA_DORK,
        Resource.MANA_ROCK,
        Resource.LAND_ANIMATION,
        Resource.COST_REDUCTION,
        Resource.HASTE_GRANT,
        Resource.GOAD,
        Resource.UPKEEP_TRIGGER,
        Resource.END_STEP_TRIGGER,
        Resource.LIFEGAIN_TRIGGER,
        Resource.POWERSTONE,
        Resource.TOKEN_COPY,
        Resource.POPULATE,
        Resource.PROLIFERATE,
        Resource.MANA_FIXING,
    }
)


def is_bridge_resource(resource: Resource) -> bool:
    """Whether a missing consumer side should be treated as a defect."""
    return resource not in SUPPLY_ONLY
