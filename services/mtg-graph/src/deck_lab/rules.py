"""Deterministic rules over oracle text — the extensible knowledge base.

Measured profile (see `docs/extraction.md`): ten hand-written rules scored mean
precision 0.95, mean recall 0.65 against curated Tagger labels. Templated oracle
text does not lie, so a firing rule is nearly always right; what it misses is a
long tail of alternative phrasings. Every rule added is a permanent, auditable
gain, which is why this is a knowledge base rather than a model.

Rules exist to cover what Tagger cannot:

- **Concepts Tagger has no tag for.** There is no broad "has an ETB trigger"
  tag; `thingfall` is only the payoff side. That left `blink` with producers and
  no consumers. The `blink` *resource* is producer-only again, deliberately —
  see `leaves_the_battlefield` — but the blink *theme* is not: it fires on the
  1,137 cards that care about `etb_trigger`.
- **Recall gaps.** `sweeper` and `reanimate` scored 0.148 and 0.159 because one
  concept has many templates.
- **New sets.** Tagger lags a release by weeks. Regex does not.

Each rule is a Cypher predicate over `c`, so matching happens in the database
with no round trip. Regexes carry `(?si)` — Java regex is case-sensitive and
`.` excludes newlines by default, and oracle text is multi-line.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .vocabulary import Resource as R
from .vocabulary import Role

# A card's own enter-the-battlefield trigger reads "When ~ enters"; a payoff
# that watches *other* permanents reads "Whenever ~ enters". That single word is
# a remarkably clean discriminator — spot-checked, it separates Solemn
# Simulacrum and Gray Merchant from Impact Tremors and Guardian Project.
ETB_OWN = r"(?si).*\bwhen [^.]{0,60}\benters\b.*"
ETB_PAYOFF = r"(?si).*\bwhenever [^.]{0,70}\benters\b.*"


@dataclass(frozen=True, slots=True)
class Rule:
    id: str
    where: str
    why: str
    produces: tuple[R, ...] = ()
    cares_about: tuple[R, ...] = ()
    roles: tuple[tuple[Role, float], ...] = ()
    params: dict[str, str] = field(default_factory=dict)


RULES: tuple[Rule, ...] = (
    Rule(
        id="etb_trigger_producer",
        where="c.oracle_text =~ $etb_own AND NOT c.oracle_text =~ $etb_payoff",
        params={"etb_own": ETB_OWN, "etb_payoff": ETB_PAYOFF},
        produces=(R.ETB_TRIGGER,),
        why="Has its own enter-the-battlefield trigger, so blink and flicker re-use it.",
    ),
    Rule(
        id="etb_trigger_payoff",
        where="c.oracle_text =~ $etb_payoff",
        params={"etb_payoff": ETB_PAYOFF},
        cares_about=(R.ETB_TRIGGER,),
        why="Triggers whenever another permanent enters.",
    ),
    # Tagger's `sweeper` closure scored 0.148 recall against one regex, because
    # a board wipe has at least five unrelated templates.
    # Land sacrifice, both sides. Tagger has no tag for either, and the
    # `sacrifice-outlet` closure actively mislabels the outlets as producing
    # `death_trigger` — a land put into a graveyard does not "die", so it
    # triggers no Blood Artist. See `SACRIFICE_LAND` in `vocabulary.py`.
    #
    # Measured over the 38,623-card oracle export with the patterns below:
    # **177 outlets, 21 payoffs**, of which 129 outlets sacrifice lands and
    # nothing else and so lose their `death_trigger` (see the structural
    # correction in `graph.py`); the other 48 also eat creatures and keep it.
    #
    # A looser outlet pattern reaches ~360 by allowing "sacrifice <anything>
    # land", but it drags in enough non-land text to not be worth the recall.
    #
    # The 8:1 asymmetry is real rather than an extraction gap — sacrificing a
    # land is a cost many cards charge and few cards reward — so this bridge is
    # narrow by nature. It is still live, which is the bar: Titania (both
    # printings), Gitrog, Slogurk, Countryside Crusher and Hearthhull all sit on
    # the consumer side.
    Rule(
        id="land_sacrifice_outlet",
        where="c.oracle_text =~ $sac_land",
        params={
            "sac_land": (
                r"(?si).*sacrifice (a|another|one|two|three|X|that|an untapped)"
                r"[^.:]{0,25}land.*"
            )
        },
        produces=(R.SACRIFICE_LAND,),
        why="Sacrificing a land is a cost this card can pay or an effect it chooses.",
    ),
    Rule(
        id="land_sacrifice_payoff",
        # Deliberately NOT `whenever a land enters` — that is landfall, and an
        # earlier draft of this pattern caught Avenger of Zendikar as a
        # sacrifice payoff. The trigger must be on a land *leaving*.
        where=(
            "c.oracle_text =~ $on_sacrifice OR c.oracle_text =~ $to_graveyard "
            "OR c.oracle_text =~ $is_sacrificed"
        ),
        params={
            "on_sacrifice": (
                r"(?si).*whenever you sacrifice (a|another|one or more)[^.]{0,25}land.*"
            ),
            # "put into a graveyard" and "put into your graveyard" are both in
            # use, as are "land" and "land cards" — Gitrog and Titania, Voice of
            # Gaea were lost to a pattern that only allowed the first of each.
            "to_graveyard": (
                r"(?si).*whenever (a|an|another|one or more)[^.]{0,35}lands?( cards?)?"
                r"[^.]{0,25}(is|are) put into (a|your|their)[^.]{0,10}graveyard.*"
            ),
            "is_sacrificed": (
                r"(?si).*whenever (a|an|another|one or more)[^.]{0,30}lands?"
                r"[^.]{0,20}(is|are) sacrificed.*"
            ),
        },
        cares_about=(R.SACRIFICE_LAND,),
        why="Triggers when a land is sacrificed or otherwise leaves for the graveyard.",
    ),
    Rule(
        id="sweeper_templates",
        where=(
            "c.oracle_text =~ $destroy_all OR c.oracle_text =~ $each_sacrifices "
            "OR c.oracle_text =~ $mass_minus OR c.oracle_text =~ $damage_each"
        ),
        params={
            "destroy_all": r"(?si).*(destroy|exile) all\b.*",
            "each_sacrifices": r"(?si).*each (player|opponent) sacrifices\b.*",
            "mass_minus": r"(?si).*all creatures get -\d+/-\d+.*",
            "damage_each": r"(?si).*deals \d+ damage to each creature\b.*",
        },
        produces=(R.MASS_REMOVAL,),
        roles=((Role.BOARD_WIPE, 1.0),),
        why="Removes multiple permanents at once.",
    ),
    Rule(
        id="reanimation_templates",
        where="c.oracle_text =~ $to_battlefield OR c.oracle_text =~ $put_onto",
        params={
            "to_battlefield": (
                r"(?si).*return .{0,60}\bcard\b.{0,40}from .{0,30}graveyard to the battlefield.*"
            ),
            "put_onto": r"(?si).*put .{0,60}from .{0,30}graveyard onto the battlefield.*",
        },
        produces=(R.RECURSION_TO_BATTLEFIELD,),
        cares_about=(R.GRAVEYARD_CREATURE,),
        roles=((Role.RECURSION, 1.0),),
        why="Returns a permanent from a graveyard directly to the battlefield.",
    ),
    # `cast_trigger` payoffs had no counterparty: the diagnostics read "wants 4,
    # makes 0". What supplies cast triggers is simply castable spells.
    Rule(
        id="instants_and_sorceries_supply_casts",
        where="(c.type_line CONTAINS 'Instant' OR c.type_line CONTAINS 'Sorcery') AND c.cmc <= 4",
        produces=(R.CAST_TRIGGER, R.STORM_COUNT, R.MAGECRAFT_TRIGGER, R.PROWESS_TRIGGER),
        why="A cheap instant or sorcery is what cast, magecraft and prowess payoffs count.",
    ),
    # A combo needs the outlet to cost nothing. Tagger's
    # `repeatable-sacrifice-outlet` means "repeatable", which is not the same.
    Rule(
        id="free_sacrifice_outlet",
        where="c.oracle_text =~ $free_sac",
        params={"free_sac": r"(?si).*(^|\n)sacrifice (a|an|another|two|three) [^:{}]{0,40}:.*"},
        produces=(R.FREE_SACRIFICE_OUTLET,),
        why="Sacrifice appears as the whole activation cost, with no mana alongside it.",
    ),
    Rule(
        id="graveyard_hate",
        where="c.oracle_text =~ $gy_hate",
        params={
            "gy_hate": (
                r"(?si).*exile (all|target|each|any number of) .{0,50}"
                r"(from (a|all|target|each) .{0,20}graveyard|graveyards?)\b.*"
            )
        },
        produces=(R.GRAVEYARD_HATE, R.EXILE_FROM_GRAVEYARD),
        roles=((Role.GRAVEYARD_HATE, 1.0),),
        why="Exiles cards from graveyards. Tagger has no graveyard-hate concept.",
    ),
    # Tagger cannot have tagged a card that releases in three months, so a
    # brand-new commander arrives with no mechanical identity at all. These
    # three were added after a spoiled crabs/landfall/mill commander ingested
    # with an empty `produces` set — the exact cold-start case the rule layer
    # exists to cover, and it was not covering it.
    Rule(
        id="landfall",
        where="c.oracle_text =~ $landfall",
        params={"landfall": r"(?si).*(\blandfall\b|whenever a land[^.]{0,40}enters).*"},
        cares_about=(R.LANDFALL_TRIGGER,),
        why="Triggers on lands entering — the keyword, or the templated wording behind it.",
    ),
    Rule(
        id="mill_opponent",
        # Any player-reference within a sentence of "mills" — the enumerated
        # alternation missed Bruvac's replacement phrasing ("If an opponent
        # would mill") and "each of your opponents mills". "you mill" stays
        # excluded because "you" is neither word. Exile-theft (Etali, Ashiok's
        # +2) stays excluded on purpose: exiling library tops to cast them is
        # theft aimed at a library, and no "mills" appears in the text.
        where="c.oracle_text =~ $mill_them",
        params={"mill_them": r"(?si).*\b(players?|opponents?)\b[^.]{0,60}\bmills?\b.*"},
        produces=(R.MILL_OPPONENT,),
        why="Mills someone other than only yourself.",
    ),
    Rule(
        id="mill_self",
        where="c.oracle_text =~ $mill_self",
        params={
            # "Mill three cards." with no player named means you. The older
            # wording spells the zone change out in full, and both forms are
            # still in print, so both are matched.
            "mill_self": (
                r"(?si).*(\byou mill\b|(^|\n|\. )mill \w+ cards?\b|"
                r"put the top .{0,40} of your library into your graveyard).*"
            )
        },
        produces=(
            R.SELF_MILL,
            R.GRAVEYARD_CREATURE,
            R.GRAVEYARD_INSTANT_SORCERY,
            R.GRAVEYARD_ARTIFACT,
            R.GRAVEYARD_LAND,
        ),
        why="Fills your own graveyard on purpose.",
    ),
    Rule(
        id="proliferate",
        where="c.oracle_text =~ $proliferate",
        params={"proliferate": r"(?si).*\bproliferate\b.*"},
        produces=(R.PROLIFERATE,),
        # Proliferate is the universal counter payoff: it multiplies whatever
        # counters are already there, so it wants all of them. Without this,
        # every counter type except +1/+1 had producers and no consumer.
        cares_about=(
            R.PLUS_ONE_COUNTER,
            R.CHARGE_COUNTER,
            R.LOYALTY_COUNTER,
            R.EXPERIENCE_COUNTER,
            R.POISON_COUNTER,
            R.ENERGY,
        ),
        why="Keyword action, exact by definition — and it multiplies every counter kind.",
    ),
    Rule(
        id="extra_turn",
        where="c.oracle_text =~ $extra_turn",
        params={"extra_turn": r"(?si).*takes? an extra turn\b.*"},
        produces=(R.EXTRA_TURN,),
        roles=((Role.WINCON, 0.4),),
        why="Scored precision 1.00 / recall 0.96 against Tagger.",
    ),
    # Keyword actions and named counters. Tagger has no tag for any of these,
    # and they are the most templated text in the game — the keyword either
    # appears or it does not.
    Rule(
        id="goad",
        where="c.oracle_text =~ $goad",
        params={"goad": r"(?si).*\bgoads?\b.*"},
        produces=(R.GOAD, R.ATTACK_TRIGGER),
        why="Goading forces attacks, which is what an attack trigger is waiting for.",
    ),
    Rule(
        id="populate",
        where="c.oracle_text =~ $populate",
        params={"populate": r"(?si).*\bpopulate\b.*"},
        produces=(R.POPULATE, R.TOKEN_COPY),
        why="Keyword action, exact by definition.",
    ),
    Rule(
        id="prowess",
        where="c.oracle_text =~ $prowess",
        params={"prowess": r"(?si).*\bprowess\b.*"},
        cares_about=(R.PROWESS_TRIGGER, R.CAST_TRIGGER),
        why="Triggers on casting noncreature spells.",
    ),
    Rule(
        id="named_counters",
        where=(
            "c.oracle_text =~ $charge OR c.oracle_text =~ $loyalty OR c.oracle_text =~ $experience"
        ),
        params={
            "charge": r"(?si).*\bcharge counters?\b.*",
            "loyalty": r"(?si).*\bloyalty counters?\b.*",
            "experience": r"(?si).*\bexperience counters?\b.*",
        },
        produces=(R.CHARGE_COUNTER,),
        why="Named counters other than +1/+1, which proliferate and untappers care about.",
    ),
    Rule(
        id="loyalty_counters",
        where="c.oracle_text =~ $loyalty",
        params={"loyalty": r"(?si).*\bloyalty counters?\b.*"},
        produces=(R.LOYALTY_COUNTER,),
        why="Planeswalker loyalty, the other thing proliferate multiplies.",
    ),
    Rule(
        id="experience_counters",
        where="c.oracle_text =~ $experience",
        params={"experience": r"(?si).*\bexperience counters?\b.*"},
        produces=(R.EXPERIENCE_COUNTER,),
        why="Experience counters, a commander-only counter type.",
    ),
    Rule(
        id="leaves_the_battlefield",
        where="c.oracle_text =~ $ltb",
        params={"ltb": r"(?si).*\bwhen(ever)? [^.]{0,50}leaves the battlefield.*"},
        produces=(R.LTB_TRIGGER,),
        why=(
            "Triggers on leaving, which is the half of a blink a flicker card also uses. "
            "Stated as a fact and nothing more: this used to assert that the card *wants* "
            "to be blinked, which holds only when the trigger benefits its controller. "
            "Animate Dead's leave trigger makes its owner sacrifice the creature, and "
            "because `blink` is the blink theme's own 1.0 weight that edge scored it 100% "
            "there — ahead of the reanimator theme it actually belongs to. "
            "Do not move the edge to the ETB rule instead: 4,539 cards produce "
            "`etb_trigger` against 228 that produce this, and a theme on 14% of the corpus "
            "is how `card_advantage` earned its deletion. Blink keeps a consumer side "
            "without it — 1,137 cards care about `etb_trigger`, which is what flicker "
            "cards are for, and the theme still reads `ltb_trigger` at 0.3."
        ),
    ),
    Rule(
        id="cost_reduction",
        where="c.oracle_text =~ $cheaper",
        params={
            "cheaper": (
                r"(?si).*(spells? you cast|creature spells?|this spell) "
                r"costs? \{?\d?\}? ?less to cast.*"
            )
        },
        produces=(R.COST_REDUCTION,),
        why="Makes your spells cheaper, which is what a big-mana or storm plan wants.",
    ),
    Rule(
        id="extra_combat",
        where="c.oracle_text =~ $extra_combat",
        params={"extra_combat": r"(?si).*additional combat phase\b.*"},
        produces=(R.EXTRA_COMBAT,),
        why="Scored precision 1.00 / recall 1.00 against Tagger.",
    ),
    # `prevent-activation`, admitted pruned. The tag's closure holds the
    # `detain` subtree (16 cards) and 34 Aura/Equipment shells — Pacifism-shaped
    # spot removal, which is exactly what excluding `lockdown-creature` from the
    # denial mapping was for, and what a naive closure lets back in through
    # three other doors. Tag predicates here are direct `TAGGED` plus the
    # closure, mirroring what `build_semantics` does, minus the poison.
    Rule(
        id="prevent_activation_denial",
        where=(
            "EXISTS { MATCH (c)-[:TAGGED]->(:Tag)<-[:PARENT_OF*0..]"
            "-(:Tag {slug: 'prevent-activation'}) } "
            "AND NOT EXISTS { MATCH (c)-[:TAGGED]->(:Tag)<-[:PARENT_OF*0..]"
            "-(:Tag {slug: 'detain'}) } "
            "AND NOT c.type_line CONTAINS 'Aura' "
            "AND NOT c.type_line CONTAINS 'Equipment'"
        ),
        produces=(R.RESOURCE_DENIAL,),
        roles=((Role.STAX, 0.8),),
        why="Stops activated abilities table-wide, once the removal shells are pruned.",
    ),
    # Deliberately NON-transitive, unlike every tag mapping: `synergy-legendary`
    # has `synergy-historic` in its closure, and that tag has three parents —
    # `synergy-legendary`, `synergy-artifact`, `synergy-saga` — so a transitive
    # mapping double-maps 53 cards that are already `artifact_matters`. The
    # direct-tag predicate reaches 194 cards and adds zero of them.
    Rule(
        id="legendary_matters_payoff",
        where=(
            "EXISTS { MATCH (c)-[:TAGGED]->(t:Tag) WHERE t.slug IN "
            "['synergy-legendary', 'legendfall', 'mirror-gallery'] }"
        ),
        cares_about=(R.LEGENDARY_MATTERS,),
        why="Counts, copies or unbinds legendary permanents — Sisay to Sakashima.",
    ),
    # The Infect and Toxic carriers themselves. Tagger's slugs only reach the
    # grant-effects ("target creature gains infect"); the 84 cards that simply
    # have the keyword are read off the `keywords` property, which is exact.
    Rule(
        id="infect_toxic_keywords",
        where="any(k IN c.keywords WHERE k = 'Infect' OR k STARTS WITH 'Toxic')",
        produces=(R.POISON_COUNTER,),
        why="Carries Infect or Toxic — poison is the card's only way to win.",
    ),
    # Protection that names the commander. The `protects-creature` mapping
    # gave commander_protection to all 880 of its cards, duplicating
    # `protection` exactly — zero independent information, the defect ledger's
    # measurement. Text that says "commander" near a protection word is the
    # honest predicate: 7 cards, Bastion Protector to Vexilus Praetor, and
    # every one of them is about the command zone specifically.
    Rule(
        id="commander_protection",
        where="c.oracle_text =~ $cp_after OR c.oracle_text =~ $cp_before",
        params={
            "cp_after": (
                r"(?si).*commanders?[^.]{0,80}"
                r"\b(hexproof|shroud|indestructible|protection from|can.t be|prevent)\b.*"
            ),
            "cp_before": (
                r"(?si).*\b(hexproof|shroud|indestructible|protection from)\b"
                r"[^.]{0,80}commanders?.*"
            ),
        },
        produces=(R.COMMANDER_PROTECTION,),
        why="Protection that names the commander — Bastion Protector, not Heroic Intervention.",
    ),
    # "Power 4 or greater" is the payoff template Ferocious canonised, and the
    # number is the discriminator: Tagger's power-matters family cannot say
    # which way the check points, and `synergy-low-power` (Delney, Tetsuko —
    # "power 2 or less") shares child slugs with the payoffs. The text can:
    # a threshold of 4+ is always the big-creature side.
    #
    # The guard drops the same template used as *hate* — "destroy all
    # creatures with power 4 or greater" (Elspeth, Sun's Champion; Retribution
    # of the Meek) checks for big creatures in order to kill them, and a deck
    # of board wipes is not a stompy deck. Measured: 168 payoffs pass, 38
    # hate cards are dropped by the guard.
    Rule(
        id="high_power_payoff",
        where="c.oracle_text =~ $hp_payoff AND NOT c.oracle_text =~ $hp_hate",
        params={
            "hp_payoff": r"(?si).*\bpower ([4-9]|[1-9][0-9]) or greater\b.*",
            "hp_hate": (
                r"(?si).*\b(destroy|exile|sacrifices?) "
                r"[^.]{0,80}\bpower ([4-9]|[1-9][0-9]) or greater\b.*"
            ),
        },
        cares_about=(R.HIGH_POWER,),
        why="Checks for a creature with power 4 or greater — the Ferocious line.",
    ),
)
