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
    #
    # `storm_count` used to be in this list and is not any more. The four
    # resources it asserted were *byte-identical* on the produces side — all
    # 5,739 of these cards, 18% of the corpus — which put `storm_count`'s IDF
    # at 1.7 against proliferate's 5.5 and made it worth almost nothing
    # wherever it was weighted. Three of the four belong here: a cheap
    # instant genuinely is what a cast, magecraft or prowess trigger counts,
    # and those three have distinct consumer sets (1,618 / 31 / 101). Storm
    # does not: what a storm payoff wants is not "a spell" but "many spells
    # this turn", which is `storm_engine` below.
    Rule(
        id="instants_and_sorceries_supply_casts",
        where="(c.type_line CONTAINS 'Instant' OR c.type_line CONTAINS 'Sorcery') AND c.cmc <= 4",
        produces=(R.CAST_TRIGGER, R.MAGECRAFT_TRIGGER, R.PROWESS_TRIGGER),
        why="A cheap instant or sorcery is what cast, magecraft and prowess payoffs count.",
    ),
    # The Storm carriers themselves, read off `keywords` — the same treatment
    # `infect_toxic_keywords` gets, and for the same reason: Tagger's slugs
    # reach the grant effects (`gives-storm`, 4 cards) and the payoffs, not
    # the 33 cards that simply have the keyword.
    Rule(
        id="storm_keyword",
        where="any(k IN c.keywords WHERE k = 'Storm')",
        cares_about=(R.STORM_COUNT,),
        why="Carries Storm — the card is worth playing only at a high spell count.",
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
            # Proliferate is polarity-blind: Contagion Engine and Thrummingbird
            # multiply a -1/-1 counter as readily as a +1/+1 one, and this is
            # the one place the two kinds genuinely share a consumer.
            R.MINUS_ONE_COUNTER,
            R.CHARGE_COUNTER,
            R.LOYALTY_COUNTER,
            R.EXPERIENCE_COUNTER,
            R.POISON_COUNTER,
            R.ENERGY,
        ),
        why="Keyword action, exact by definition — and it multiplies every counter kind.",
    ),
    # Raised 0.4 → 0.8 in the wincon-evidence round (see `alt_win` and
    # `overrun_finisher` below): an extra turn is live from an empty board —
    # closer to a true win condition than any of the reactive-damage grants
    # `Role.WINCON` used to rely on alone. Kept identical to the `extra-turn`
    # tag's own weight in `tag_mapping.py` on purpose — max-merge would hide
    # any drift between the two, so a cross-consistency test pins them equal.
    # Accepted noise: Final Fortune-class cards (an extra turn with a cost)
    # rise too, which is correct — they are played precisely as wincons.
    Rule(
        id="extra_turn",
        where="c.oracle_text =~ $extra_turn",
        params={"extra_turn": r"(?si).*takes? an extra turn\b.*"},
        produces=(R.EXTRA_TURN,),
        roles=((Role.WINCON, 0.8),),
        why="Scored precision 1.00 / recall 0.96 against Tagger.",
    ),
    # `Role.WINCON` had exactly six weak-proxy grant sites before this rule —
    # ways games tend to end, none of them "this card's text ends the game" —
    # and alt-win/forced-loss cards were entirely unmodelled (alt-win scoped
    # out as a theme in docs/themes.md:428; there was no role either). Three
    # templates, unioned:
    #
    # - `you_win`: "you win the game" — 37 cards (Approach of the Second Sun,
    #   Thassa's Oracle, Laboratory Maniac, Felidar Sovereign, Revel in
    #   Riches, Maze's End…), zero false positives.
    # - `opp_loses`: "(each|target) (player|opponent) loses the game" — 2
    #   cards (Mirrodin Besieged, Door to Nothingness).
    # - `that_player_loses`: "that player loses the game" — 11 cards (Phage
    #   the Untouchable, Etrata the Silencer, three Vraska planeswalker
    #   ultimates, Atemsis, All-Seeing…).
    #
    # Union **50 cards**, of which only 3 already carried a `wincon` edge
    # before this rule — almost all of it is new signal, not reweighted old
    # signal.
    #
    # The classic trap, checked directly: Platinum Angel ("You can't lose
    # the game and your opponents can't win the game") and Abyssal
    # Persecutor ("You can't win the game and your opponents can't lose the
    # game") read like a near miss but match no arm — the guarded phrase is
    # "win"/"lose", never "loses the game". The Pacts' own delayed
    # self-loss (Angel's Grace's split-second cost, Demonic Pact's fourth
    # chapter, Pact of Negation's failure clause) all read "you lose the
    # game", first person, never "that player"/"an opponent"/"each player" —
    # measured overlap zero, excluded by construction rather than by an
    # explicit guard. The poison reminder text ("A player with ten or more
    # poison counters loses the game.") also misses every arm: the word
    # immediately before "loses the game" is "counters", not "player" or
    # "opponent", and it is never "that player". Share the Spoils ("whenever
    # an opponent loses the game, exile the top card...") tempts a fourth
    # arm — `an opponent loses the game` — but that pattern's corpus
    # population is exactly this one card; dropped rather than added for a
    # population of one, recorded here in case a future printing changes
    # that. `would win the game` (Mindslaver-style hypotheticals): 0 corpus
    # matches today — noted here for the next set review, not implemented
    # against zero evidence.
    Rule(
        id="alt_win",
        where=(
            "c.oracle_text =~ $you_win OR c.oracle_text =~ $opp_loses OR "
            "c.oracle_text =~ $that_player_loses"
        ),
        params={
            "you_win": r"(?si).*\byou win the game\b.*",
            "opp_loses": r"(?si).*\b(each|target) (player|opponent) loses the game\b.*",
            "that_player_loses": r"(?si).*\bthat player loses the game\b.*",
        },
        roles=((Role.WINCON, 1.0),),
        why="Card text ends the game outright — an alternate win or a forced loss.",
    ),
    # Craterhoof Behemoth, Overrun, End-Raze Forerunners and Triumph of the
    # Hordes carry no role at all today: `power-boost-to-all`
    # (tag_mapping.py) deliberately produces only the bare `power_boost`
    # resource, because its closure is 1,175 cards and includes every static
    # anthem ever printed (Elesh Norn, Grand Cenobite; Tempered Steel…) —
    # hanging a `wincon` role on that tag would call a 2-mana lord the same
    # win condition as Craterhoof. The discriminator has to be the *shape*
    # of the pump, not that a pump exists: an Overrun effect scales with
    # board size (`+X/+X`, not a flat bonus) and/or grants the evasion that
    # turns a wide board into lethal in one swing (trample, double strike,
    # infect). Three templates, unioned:
    #
    # - `xpump`: "creatures you control (get|gain) ... +X/+X" — the
    #   `(get|gain)` alternation and the window both matter: Craterhoof's own
    #   line is "creatures you control gain trample and get +X/+X", the verb
    #   split across the clause by the trample grant in between.
    # - `overrun_grant`: "creatures you control get +N/+M ... trample" or
    #   "... double strike" — Overrun itself and End-Raze Forerunners, a
    #   flat but large, evasion-granting team pump.
    # - `infect_pump`: "creatures you control get +N/+M ... infect" —
    #   Triumph of the Hordes' own shape, a one-swing kill via poison rather
    #   than combat damage.
    #
    # Measured union **50 cards**; the head is exactly the target class
    # (Craterhoof, Overrun, End-Raze Forerunners, Triumph of the Hordes,
    # Pathbreaker Ibex all present). Anthem negatives verified excluded:
    # Glorious Anthem ("creatures you control get +1/+1") fails the
    # `[2-9]|X` floor and grants no evasion; Bastion Protector ("Commander
    # creatures you control get +2/+2 and have indestructible") clears the
    # floor but grants no trample/double strike/infect; Giant Growth
    # ("Target creature gets +3/+3") is a single-target trick and matches no
    # arm's "creatures you control" subject at all.
    #
    # `produces=(R.POWER_BOOST,)` stays as cold-start cover so these cards
    # keep sitting in the existing `power-boost-to-all` → `power-matters`
    # resource bridge; adding the role does not remove it.
    #
    # Weight 0.7, not 1.0: an Overrun effect needs an established board to
    # close a game out, unlike `alt_win`'s unconditional 1.0 or
    # `extra_turn`'s 0.8 (an extra turn is live from an empty board). It
    # sits above the derived `payoff` ceiling of 0.6, so these cards win the
    # within-bucket max instead of falling through to a generic payoff read.
    Rule(
        id="overrun_finisher",
        where=(
            "c.oracle_text =~ $xpump OR c.oracle_text =~ $overrun_grant OR "
            "c.oracle_text =~ $infect_pump"
        ),
        params={
            "xpump": r"(?si).*creatures you control (get|gain)[^.]{0,60}\+X/\+X.*",
            "overrun_grant": (
                r"(?si).*creatures you control get \+([2-9]|X)/\+[0-9X]+[^.]{0,80}"
                r"\b(trample|double strike)\b.*"
            ),
            "infect_pump": (r"(?si).*creatures you control get \+\d+/\+\d+[^.]{0,80}\binfect\b.*"),
        },
        produces=(R.POWER_BOOST,),
        roles=((Role.WINCON, 0.7),),
        why="Scaling or evasion-granting team pump that ends games outright — Overrun's own class.",
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
    # Odric, Lunarch Marshal and Kathril, Aspect Warper are breadth payoffs:
    # they want a body that already carries several of the twelve
    # keyword-counter keywords, and Tagger's `keyword-soup` tag only reaches
    # the 23 hand-curated payoffs, not the bodies that supply them. Read off
    # `keywords`, the `infect_toxic_keywords` treatment: exact by definition,
    # so a printing without reminder text still counts.
    #
    # The threshold is measured, not guessed — twice. Corpus distribution of
    # creatures carrying N of the twelve: >=1 is 6,343 creatures, >=2 is 991,
    # >=3 is 132. The first build shipped >=2 and the rebuilt corpus measured
    # the resource's relative IDF at 0.859 — BELOW the 1.0 floor the supply
    # arm and match filters enforce, so the signal was born vague and the
    # boost machinery would have ignored it (991 producers is five times
    # `treasure`'s ~190, not its peer). At >=3 the producers are the
    # genuinely Akroma-class bodies, which is also what an Odric or Kathril
    # player wants offered: nobody needs the advisor to suggest a
    # two-keyword bear.
    #
    # Gated on `c.type_line CONTAINS 'Creature'`: an Equipment granting two
    # keywords is a granter, not a body, and v1 stays to bodies.
    Rule(
        id="keyword_rich_bodies",
        where=(
            "c.type_line CONTAINS 'Creature' AND "
            "size([k IN c.keywords WHERE k IN "
            "['Flying', 'First strike', 'Double strike', 'Deathtouch', 'Haste', "
            "'Hexproof', 'Indestructible', 'Lifelink', 'Menace', 'Reach', "
            "'Trample', 'Vigilance']]) >= 3"
        ),
        produces=(R.KEYWORD_SOUP,),
        why="Carries three or more of the twelve keyword-counter keywords — Kathril's fuel",
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
    # The command zone as a resource the 99 can be built to exploit. Tagger's
    # `synergy-commander` closure (166 cards) is the obvious source and is the
    # wrong one: it puts Command Tower, Arcane Signet, Commander's Sphere and
    # Path of Ancestry — colour-identity fixers that read identically whether
    # you field one commander or four — in the same bag as Bastion Protector.
    # The whole point of this family is that its rate scales with the number of
    # seats, so the fixers are not merely noise, they are the counter-example.
    # Text is the honest predicate; the tag is not.
    #
    # Measured on the 32,041-card dev corpus: **73 payoffs**, from the Lieutenant
    # cycle through the Will cycle to Dancer's Chakrams ("Other commanders you
    # control get +2/+2" — the family's thesis printed on a card).
    #
    # Three guards, each earned by a false positive the first draft admitted:
    #   * `lieutenant —` and not `\blieutenant\b`, or Lieutenant Kirtar joins on
    #     his own name. The em dash is the ability-word marker and is exact.
    #   * the opponent-facing clause drops Sauron, Lord of the Rings ("whenever
    #     a commander an opponent controls dies") — a commander-matters card
    #     keyed on *their* zone, which your seat count cannot improve.
    #   * Backgrounds are excluded by type line. "Commander creatures you own
    #     have ..." is 29 cards and every one of them is a Background, which
    #     does nothing from the 99 — offering one as a deck card is offering a
    #     blank. They belong to the command zone, and the zone is not our pool.
    # `can have two commanders if` drops the 100 partner legends carrying the
    # reminder text: being a partner is not caring that you have one.
    Rule(
        id="commander_matters_payoff",
        where=(
            "c.oracle_text =~ $cm_payoff "
            "AND NOT c.oracle_text =~ $cm_not_payoff "
            "AND NOT c.type_line CONTAINS 'Background'"
        ),
        params={
            "cm_payoff": (
                r"(?si).*(lieutenant —|commander creatures you (own|control)"
                r"|commanders you control|a commander you control"
                r"|if you control (a|your) commander"
                r"|as long as you control (a|your) commander"
                r"|whenever (a|your) commander"
                r"|your commander (enters|attacks|deals|is put)"
                r"|for each time [^.]{0,20}cast (a|your) commander).*"
            ),
            "cm_not_payoff": (
                r"(?si).*(can have two commanders if|deck with this commander can have"
                r"|as a second commander"
                r"|commanders? (an opponent|they|each opponent|target opponent) (control|own)).*"
            ),
        },
        cares_about=(R.COMMANDER_MATTERS,),
        why="Pays off when a commander of yours is out or acting — better with every extra seat.",
    ),
    # The supply half, and the reason this is a bridge rather than a cares-only
    # orphan: 9 cards manufacture commander activity, by putting the commander
    # back in your hand to recast (Command Beacon, Netherborn Altar, Road of
    # Return, Campfire, Sanctum of Eternity), cheating it onto the battlefield
    # (Hellkite Courser, Geode Golem, Tevesh Szat) or making the recast cheap
    # (Myth Unbound). A Lieutenant deck that never gets its commander back is a
    # deck of vanilla bears, so this is exactly what such a deck is short of.
    #
    # Narrow templates rather than one loose "commander ... command zone"
    # pattern, because the cast-*count* payoffs (the Storm cycle, Commander's
    # Insignia, Jyoti, Jirina) share every keyword with the enablers and sit on
    # the other side of the bridge. "for each time" is what separates them, but
    # it cannot be a blanket exclusion — Myth Unbound reduces the cost *and*
    # counts, in one sentence.
    Rule(
        id="commander_matters_supply",
        where="c.oracle_text =~ $cm_supply",
        params={
            "cm_supply": (
                r"(?si).*((put|return) [^.]{0,50}commanders?[^.]{0,60}"
                r"(into your hand|to your hand|onto the battlefield)"
                r"|cast (a|your) commander from the command zone without paying"
                r"|your commander costs).*"
            ),
        },
        produces=(R.COMMANDER_MATTERS,),
        why="Gets your commander back into play or hand — fuel for the payoffs that count seats.",
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
    # Tapping your own creatures for value instead of attacking. Seven printed
    # keywords do it, and the youngest of them are exactly the ones Tagger
    # lags on — the case this layer exists for. Read off `keywords` rather
    # than reminder text, the `infect_toxic_keywords` treatment: the keyword
    # either appears in the list or it does not, and a printing without
    # reminder text still carries it.
    #
    # `Improvise` is absent on purpose — it taps *artifacts*, and a Springleaf
    # Drum deck and an Improvise deck want different cards. So is `Exert`: an
    # exerted creature is tapped by attacking, which every payoff here already
    # sees for free, and counting it would call every aggro deck a tap deck.
    #
    # Measured over the 32,041-card dev corpus: 387 keyword carriers, 332 on
    # the cost template, 515 together. Only 3 of those are outside Tagger's
    # `tap-fuel-creature` closure, which is the honest number — the tag layer
    # already has this family, and this rule is the cover for the next set.
    Rule(
        id="tap_own_creature_supply",
        where=(
            "any(k IN c.keywords WHERE k IN "
            "['Crew', 'Convoke', 'Saddle', 'Station', 'Enlist', 'Teamwork', 'Harmonize']) "
            "OR c.oracle_text =~ $tap_cost"
        ),
        params={
            # "Tap an untapped creature you control:" and every variant of it.
            # `[^.:]` stops the window at a sentence *or* an ability's colon, so
            # a cost on one line cannot reach a noun on the next.
            "tap_cost": (
                r"(?si).*\btap (a|an|another|one|two|three|four|five|X|any number of|\d+) "
                r"[^.:]{0,40}creatures? you control.*"
            )
        },
        produces=(R.TAP_OWN_CREATURE,),
        why="Taps creatures you control as a cost — crew, convoke, saddle, station, a Drum.",
    ),
    # The payoff side, and the reason it cannot be a tag mapping: Tagger's
    # `uninspired` (141 cards, "effects that trigger when something becomes
    # tapped") is polarity-blind. Half of it — Psychic Venom, Verity Circle,
    # Gideon's Avenger, every enchant-land punisher — wants an *opponent's*
    # permanent tapped, which is a tapper deck and the exact opposite of this.
    #
    # So the polarity is stated in the predicate instead. A creature whose text
    # says "becomes tapped" without naming an opponent, an enchanted/equipped
    # permanent or a land is talking about itself: 66 cards, and the four the
    # guard drops — Gideon's Avenger, Rhoda, Stinging Licid, Mine Layer — are
    # all correctly dropped. The other arms are `... you control becomes tapped`,
    # the grant template (Haunted One, Tale of Katara and Toph), the Survival /
    # Kalamax state check `if <it> is tapped,` and `tapped creature(s) you
    # control` — Far Traveler, Throne of the God-Pharaoh, Harvest Season.
    #
    # 121 cards, 74 of them outside `tapped-matters-self` + `synergy-tapped`.
    # That gap is the whole "whenever this creature becomes tapped" family —
    # Emmara, Fallowsage, Magda, Judge of Currents, Quest for Renewal — which
    # is the archetype's centre and which Tagger files only under `uninspired`.
    Rule(
        id="tap_own_creature_payoff",
        where=(
            "(c.type_line CONTAINS 'Creature' AND c.oracle_text =~ $becomes_tapped "
            "AND NOT c.oracle_text =~ $someone_elses) "
            "OR c.oracle_text =~ $yours_becomes_tapped "
            "OR c.oracle_text =~ $granted "
            "OR (c.type_line CONTAINS 'Creature' AND c.oracle_text =~ $is_tapped) "
            "OR c.oracle_text =~ $tapped_yours "
            "OR any(k IN c.keywords WHERE k IN ['Survival', 'Web-slinging'])"
        ),
        params={
            "becomes_tapped": r"(?si).*\bbecomes tapped\b.*",
            "someone_elses": (
                r"(?si).*(opponent|enchanted|equipped|fortified|\bland\b)"
                r"[^.]{0,60}becomes tapped.*"
            ),
            "yours_becomes_tapped": r"(?si).*\byou control becomes tapped\b.*",
            "granted": r'(?si).*have "Whenever this (creature|token) becomes tapped.*',
            # The trailing `[,.]` is what keeps the storage lands, Mana Vault and
            # the "if a land is tapped for mana" replacement effects out: those
            # all read "is tapped for", never "is tapped,".
            "is_tapped": r"(?si).*\bif [^.]{0,40} is tapped[,.].*",
            "tapped_yours": r"(?si).*\btapped [^.]{0,25}creatures? you control\b.*",
        },
        cares_about=(R.TAP_OWN_CREATURE,),
        why="Pays off a creature *you* control being tapped — Survival, Emmara, Far Traveler.",
    ),
    # Y'shtola, Glarb, Bello and Imoti, Celebrant of Bounty all key a benefit
    # on casting, playing or controlling something at or above a mana-value
    # threshold. Precision-guarded the way `high_power_payoff` guards against
    # Elspeth, Sun's Champion: the identical phrase is also a removal template
    # ("destroy/exile target creature with mana value 3 or greater"), and
    # there `target` sits where a payoff has `you cast` or `you control` — the
    # guard word must precede the band within the same clause, not merely
    # co-occur with it in the same sentence.
    #
    # Measured over the 32,041-card live corpus: "mana value N or greater"
    # appears on 129 cards. Most of the population is unrelated to this rule —
    # removal ("destroy/exile target ... with mana value N or greater"),
    # "collect evidence" costs, and Tagger's evidence-collection reprint of
    # the same number. The guard below matches 62 of the 129, and every one of
    # the 62 was eyeballed true — precision 1.00 against the file's 0.95 bar —
    # including all four anchor cards. Every removal template and every "or
    # less" band in the population is correctly excluded.
    Rule(
        id="high_mv_payoff",
        where="c.oracle_text =~ $high_mv_payoff",
        params={
            "high_mv_payoff": (
                r"(?si).*\b(you cast|you may cast|cast (a |an )?spells?|you control)\b"
                r"[^.]{0,80}\bmana value [3-9] or greater.*"
            )
        },
        cares_about=(R.HIGH_MV_SPELL,),
        why="Keys a benefit on casting, playing or controlling something at a mana-value band.",
    ),
    # The structural supply side: what a high_mv_payoff card is waiting to
    # see. Nonland and noncreature — a payoff cares about the *spell*, not a
    # body already resolved and sitting on the battlefield — at cmc >= 4.
    #
    # The threshold is measured, not left at Y'shtola's own number. Of the 62
    # `high_mv_payoff` matches above, the N each names clusters high: N=3 is 5
    # cards (8%), N=4 through N=7 together are 57 (92%). 3 is rare and the
    # mass sits at 4+, so the produces side is cut at 4. Y'shtola's own "mana
    # value 3 or greater" is unaffected as a payoff — it lives on her
    # CARES_ABOUT edge from the rule above, not on this structural threshold.
    # The known cost: the five N=3 payoffs (Y'shtola among them) are not
    # offered the cmc-3 slice of their band; for the other 92% that slice is
    # dead weight, and a cutoff serving the few would pad the channel for the
    # many.
    #
    # 4,514 producers at this cutoff (7,760 at cmc >= 3, measured for
    # comparison). A large produces population is fine — spellslinger's
    # produces side is 6,665 cards by the same precedent (see its comment in
    # themes.py); fit still ranks inside it.
    Rule(
        id="high_mv_spell_producer",
        where="NOT c.is_land AND NOT c.type_line CONTAINS 'Creature' AND c.cmc >= 4",
        produces=(R.HIGH_MV_SPELL,),
        why="A nonland, noncreature card is the thing a mana-value payoff is waiting to see.",
    ),
    # Nekusar's own top EDHREC tag (`TOP50-COVERAGE.md` gap 1, `wheels`, 5.3k
    # decks) and a term the vocabulary never had: the punisher half of
    # opponents drawing cards.
    #
    # Measured over the live 32,041-card corpus: the pattern below matches
    # **29 cards**. All 29 eyeballed true — precision 1.00 against the file's
    # 0.95 bar — including Nekusar, the Mindrazer himself ("Whenever an
    # opponent draws a card, Nekusar deals 1 damage to that player") and
    # Underworld Dreams. "Whenever you draw a card" (103 corpus matches) is a
    # self-draw payoff, a different deck (Sheoldred and Consecrated Sphinx
    # both carry it *alongside* this rule's pattern for their other ability,
    # and both are correctly read as genuinely both) — it is excluded by
    # requiring the subject to be "an opponent", "each opponent" or "a
    # player" rather than "you".
    Rule(
        id="opponent_draw_payoff",
        where="c.oracle_text =~ $opponent_draw_payoff",
        params={
            "opponent_draw_payoff": (
                r"(?si).*\bwhenever (an opponent|each opponent|a player) draws\b.*"
            )
        },
        cares_about=(R.OPPONENT_DRAW,),
        why="Triggers when an opponent, or any player, draws a card — Nekusar's punisher half.",
    ),
    # The other half: what an `opponent_draw_payoff` card is waiting to see.
    # Built from the real templates rather than one regex, and measured as
    # such — three shapes, unioned:
    #
    # - **Wheels** — "each player discards their hand, then draws N cards"
    #   (Wheel of Fortune, Windfall, Whispering Madness). The "then draws"
    #   anchor is load-bearing: without it, "each player discards their
    #   hand" alone also catches Mindslicer and Sire of Insanity, which
    #   discard and never redraw — a pure discard effect, not an
    #   opponent-draw one.
    # - **Symmetric draw** — "each player draws" (Prosperity, Howling Golem,
    #   Jace Beleren) and the "each player's draw step ... draws" template
    #   (Howling Mine, Font of Mythos, Dictate of Kruphix, Nekusar's own
    #   first ability).
    # - **Directed gifts** — "each opponent draws" (Master of the Feast, Cut
    #   a Deal) and "target opponent draws"/"target opponent may draw" (Ms.
    #   Bumbleflower, Phelddagrif, Bargain).
    #
    # 85 distinct matches, union of all five sub-patterns, eyeballed in full:
    # zero false positives found — every match genuinely causes another
    # player to draw. Wheel of Fortune, Windfall, Howling Mine and Ms.
    # Bumbleflower herself all land here, as required.
    #
    # The classic trap, checked directly: "an opponent draws a card" inside a
    # punisher's own trigger text must not earn a produces edge from the
    # trigger phrase alone. Five cards match both this rule and the payoff
    # rule above (Nekusar, Scrawling Crawler, Faerie Mastermind, Spiteful
    # Visions, Tataru Taru) — each does so on a genuinely distinct sentence
    # ("At the beginning of each player's draw step..." / "{3}{U}: Each
    # player draws a card." / "target opponent may draw a card") sitting
    # beside the punisher trigger, not the trigger phrase itself being
    # reused. Confirmed by inspecting all five: this is the "fine, it is
    # genuinely both" case the trap warning allows for, not the trap itself.
    Rule(
        id="opponent_draw_producer",
        where=(
            "c.oracle_text =~ $discard_then_draw OR c.oracle_text =~ $symmetric_draw OR "
            "c.oracle_text =~ $each_opponent_draws OR c.oracle_text =~ $target_opponent_draws OR "
            "c.oracle_text =~ $draw_step_template"
        ),
        params={
            "discard_then_draw": (
                r"(?si).*each player discards (their|his or her) hand,? *then draws\b.*"
            ),
            "symmetric_draw": r"(?si).*each player draws\b.*",
            "each_opponent_draws": r"(?si).*each opponent draws\b.*",
            "target_opponent_draws": r"(?si).*target opponent (may )?draws?\b.*",
            "draw_step_template": r"(?si).*each player.{0,15}draw step.{0,60}draws?\b.*",
        },
        produces=(R.OPPONENT_DRAW,),
        why="Makes another player draw a card — wheels, symmetric draw, and directed gifts.",
    ),
    # Arcades, the Strategist is the worst reader in the top 50 — 14/61
    # themed, no concept of "toughness matters" or Defender at all
    # (`TOP50-COVERAGE.md` gap 4). Built from the real templates and unioned,
    # the `high_mv_payoff` multi-branch style rather than one regex:
    #
    # - "creature(s) you control with defender" — counting or boosting your
    #   own Walls (Vent Sentinel, Overgrown Battlement, Stalwart
    #   Shield-Bearers, Arcades' own first ability). 12 matches.
    # - "assigns combat damage equal to its/their toughness" — the Doran
    #   template (Doran, the Siege Tower; Assault Formation; High Alert;
    #   Arcades' own second clause). 21 matches.
    # - "toughness greater than its/their power" — the same idea read as a
    #   condition (Tapestry Warden, Catapult Fodder). 9 raw matches, one
    #   dropped by the hate guard below.
    # - "can attack as though it/they didn't have defender" — genuinely
    #   fires for cards that grant the unlock to *other* Walls (Wakestone
    #   Gargoyle, Rolling Stones, Warmonger's Chariot, Guardians of Oboro).
    #   Guarded: the raw 31-card population is dominated (24 of 31) by a
    #   different, self-only template — "As long as <a Gate, metalcraft, a
    #   counter, delirium — never the archetype>, THIS creature can attack
    #   as though it didn't have defender", every printed Defender
    #   creature's own built-in escape hatch, unrelated to caring about the
    #   archetype (Bristlepack Sentry wants a power-4 creature elsewhere on
    #   the board, Ogre Jailbreaker wants a Gate, Spire Serpent wants
    #   metalcraft). The guard requires the unlock's subject to name
    #   defender/Wall/"creatures you control" explicitly rather than being
    #   the self-referential "this creature"/"it".
    #
    # The `toughness greater than power` hate guard, checked directly:
    # Immobilizer Eldrazi ("Each creature with toughness greater than its
    # power can't block this turn") uses the identical band phrase as a
    # *hoser* against toughness-heavy creatures, the `high_power_hate`
    # shape — dropped by requiring the hate verb not follow the band within
    # the same clause.
    #
    # Measured over the 32,041-card corpus: union **38 cards**, all
    # eyeballed true — precision 1.00 against the file's 0.95 bar. Arcades
    # and High Alert both match, the plan's two mandatory anchors; "target
    # creature gets +0/+3" (a plain combat trick) matches none of the four
    # branches.
    Rule(
        id="high_toughness_payoff",
        where=(
            "c.oracle_text =~ $ht_defenders "
            "OR c.oracle_text =~ $ht_toughness_damage "
            "OR (c.oracle_text =~ $ht_toughness_gt_power "
            "AND NOT c.oracle_text =~ $ht_toughness_gt_power_hate) "
            "OR c.oracle_text =~ $ht_attack_unlock"
        ),
        params={
            "ht_defenders": r"(?si).*\bcreatures? you control with defender\b.*",
            "ht_toughness_damage": (
                r"(?si).*\bassigns? combat damage equal to (its|their) toughness\b.*"
            ),
            "ht_toughness_gt_power": r"(?si).*\btoughness greater than (its|their) power\b.*",
            "ht_toughness_gt_power_hate": (
                r"(?si).*\btoughness greater than (its|their) power\b[^.]{0,60}"
                r"\b(can.t block|can.t attack|destroy|exile|sacrifices?)\b.*"
            ),
            "ht_attack_unlock": (
                r"(?si).*\b(creatures? you control with defender|wall creatures|"
                r"modified creatures you control|target creature (you control )?with defender|"
                r"equipped creature has defender)\b[^.]{0,150}\bcan attack\b[^.]{0,60}"
                r"\bdidn.t have defender\b.*"
            ),
        },
        cares_about=(R.HIGH_TOUGHNESS,),
        why="Checks for defender, toughness-as-damage, or toughness>power — the wall-payoff shape.",
    ),
    # The structural supply side, the `high_power`/`legendary_matters`
    # template applied to the other stat: what a `high_toughness_payoff`
    # card is waiting to see. Two shapes, unioned:
    #
    # - Defender, read off `keywords` — the `infect_toxic_keywords`
    #   treatment: exact by definition, and the reminder-text trap the plan
    #   warned about ("(This creature can't attack.)" appearing on tokens)
    #   does not exist in this corpus — checked directly, zero cards carry
    #   that reminder text without also carrying the Defender keyword.
    # - A body whose toughness clears its power by 3 or more, admitted
    #   because `power`/`toughness` are reliably typed floats here — 17,603
    #   of 17,907 creatures (98.3%) carry both, so the numeric comparison is
    #   trustworthy rather than a string trap (the known gap: `power = "*"`
    #   creatures like Tarmogoyf carry `power = null` and are silently
    #   excluded, the same known cost `high_power`'s comment records).
    #
    # Measured over the live corpus: 307 Defender creatures, 935 creatures at
    # toughness − power >= 3, 170 overlap — union **1,072**. Large, the
    # `high_power` (4,282) / `legendary_matters` (4,134) precedent:
    # thousands of structural producers is fine because the theme gates on
    # cares, not this side.
    Rule(
        id="high_toughness_producer",
        where=(
            "any(k IN c.keywords WHERE k = 'Defender') "
            "OR (c.is_creature AND c.power IS NOT NULL AND c.toughness IS NOT NULL "
            "AND c.toughness - c.power >= 3)"
        ),
        produces=(R.HIGH_TOUGHNESS,),
        why="Carries Defender, or a body whose toughness clears its power by 3 or more.",
    ),
    # Enriches the 245 existing `enchantment_matters` cares cards (Tagger's
    # `synergy-enchantment` closure) and, critically, gives Bello, Bard of
    # the Brambles his missing edge: his own text ("each non-Equipment
    # artifact and non-Aura enchantment you control with mana value 4 or
    # greater is a 4/4 Elemental creature...") carries no
    # `enchantment_matters` edge at all today, so neither detection nor
    # Round A's commander-anchored unlock can fire for him
    # (`TOP50-COVERAGE.md` gap 5).
    #
    # Two templates, unioned; a third was measured and dropped:
    #
    # - "enchantment(s) you control ... [is/are/becomes/get/have/gain]" —
    #   the Constellation/Theros shape (Doomwake Giant, Starfield of Nyx,
    #   Ethereal Armor, Zur, Eternal Schemer, Bello himself) and the
    #   graveyard-trigger variants ("...is put into a graveyard from the
    #   battlefield, ..."). 39 corpus matches, all eyeballed true.
    # - "whenever you cast an enchantment spell" — the named-Enchantress
    #   shape (Argothian Enchantress, Verduran Enchantress, Sythis,
    #   Harvest's Hand, Mesa Enchantress). 19 corpus matches, all eyeballed
    #   true, zero overlap with the branch above.
    # - "whenever an enchantment enters" (the plan's third candidate idea) —
    #   measured and dropped: 0 corpus matches verbatim, with or without
    #   "an"/"another". Real Constellation text reads "Whenever this or
    #   another enchantment you control enters", which the first branch
    #   above already reaches (the trailing clause almost always contains
    #   one of is/are/becomes/get/have/gain).
    #
    # Union 58 cards, precision 1.00 (all eyeballed genuine) — but the
    # marginal gain over Tagger's existing 245 is small: only **4** cards are
    # new — Bello, Bard of the Brambles; Yenna, Redtooth Regent; Estrid's
    # Invocation; Zur, Eternal Schemer. Tagger's own Constellation/Enchantress
    # coverage is already thorough. Kept anyway, per the plan's instruction —
    # it is the exact 4 the round needs, Bello named among them, and every
    # match is genuine at the precision bar.
    Rule(
        id="enchantment_payoff",
        where="c.oracle_text =~ $ench_you_control OR c.oracle_text =~ $ench_cast_spell",
        params={
            "ench_you_control": (
                r"(?si).*\benchantments? you control[^.]{0,80}"
                r"\b(is|are|becomes?|gets?|have|has|gains?)\b.*"
            ),
            "ench_cast_spell": r"(?si).*\bwhenever you cast an enchantment spell\b.*",
        },
        cares_about=(R.ENCHANTMENT_MATTERS,),
        why="Cares about enchantments you control, or casting one — Constellation and Enchantress.",
    ),
    # Gap 7 (`TOP50-COVERAGE.md`): Esika's Prismatic Bridge line and Atraxa's
    # own second-most-famous build have no theme, though `loyalty_counter`
    # already exists on both sides of the bridge and the type axis already
    # grades planeswalker counts. The `loyalty_counters` rule above is the
    # text-pattern half (61 producers, explicit "loyalty counters" wording);
    # this is the structural complement — a planeswalker *is* the loyalty its
    # payoffs count, whether or not its own rules text spells the words out
    # (most just print "+1:"/"-2:" costs against the loyalty number on the
    # frame).
    #
    # Measured over the live corpus: 318 cards carry 'Planeswalker' on their
    # type line. 39 of those already produce `loyalty_counter` via the text
    # rule (their abilities do use the words); this rule adds 279 new
    # producers, for a union of 340. The other 22 of the text rule's 61
    # producers are non-planeswalker cards that add loyalty counters to a
    # planeswalker *you control* (Kaya's Ghostform-shaped effects) — correctly
    # left alone, since this structural rule only ever fires on the
    # planeswalker's own type line.
    Rule(
        id="planeswalker_producer",
        where="c.type_line CONTAINS 'Planeswalker'",
        produces=(R.LOYALTY_COUNTER,),
        why="A planeswalker is the loyalty its payoffs count, whether or not its text says so.",
    ),
    # --- Fast mana: the half of it Tagger has no tag for -----------------
    #
    # Tagger's `moxen` tag (mapped in `tag_mapping.py`) reaches the six cards
    # literally named "Mox" that resolve in this corpus, including three
    # conditional shapes — Mox Jasper (needs a Dragon), Mox Opal (metalcraft),
    # Mox Tantalite (Suspend) — this rule deliberately excludes. What no tag
    # reaches is the *shape*: an artifact whose only cost is `{T}` (optionally
    # plus sacrificing itself) and whose output is worth more than its own
    # mana cost, the turn it lands. Sol Ring and Mana Vault are that shape at
    # {1}; every "Mox"-named card and Lotus Petal are that shape at {0}.
    #
    # Three arms, gated on cmc because the bar is different at each: a {0}
    # artifact is fast mana the instant it adds *any* mana (arm one), a {1}
    # artifact needs to add two or more (arm two), a {2} artifact needs to
    # add three or more (arm three) — the trap the brief names directly,
    # restated at each price point. Mind Stone ({2}, taps for one) fails arm
    # three's symbol count; a hypothetical {1} rock that only added one mana
    # would fail arm two's symbol-count requirement the same way.
    #
    # Five guard words, each earned by a false positive measured on the live
    # 32,041-card corpus before it was added: `suspend` (Lotus Bloom, Sol
    # Talisman, Mox Tantalite — the mana is real but three turns away, which
    # fails "immediately"), `multikicker` and `for each` (Everflowing Chalice
    # — {T}: Add {C} for each charge counter, and it enters with none unless
    # kicked, so the unkicked case is worth nothing), `activate only`
    # (Pyramid of the Pantheon — its 3-mana mode needs three brick counters
    # built up over several turns of the weaker mode first), `spend this mana
    # only` (The Enigma Jewel — genuinely taps for two at {1},
    # but the mana can't cast a spell, which is not what a cEDH deck reaches
    # for fast mana to do).
    #
    # Measured on the live corpus: arm one (cmc 0) matches 4 — Chrome Mox,
    # Lotus Petal, Mox Amber, Mox Diamond (the first and last two overlap
    # `moxen` above; Lotus Petal is net new). Arm two (cmc 1) matches 2 — Sol
    # Ring, Mana Vault, both net new. Mana Crypt is absent from this corpus
    # because it is banned in Commander (September 2024), not because the
    # pattern misses it — its own text (`{T}: Add {C}{C}.` at cmc 0) passes
    # every guard when checked directly against the bulk file. See the
    # `moxen` comment in `tag_mapping.py` for the evidence.
    #
    # Arm three, added later: Grim Monolith is {2} for `{T}: Add {C}{C}{C}`
    # — net +1 the turn it lands, the same shape as Sol Ring one price point
    # down, and a cEDH staple the rule was missing outright (cmc=2 fell
    # through both existing arms, and neither `moxen` nor `sol-land` reaches
    # it — it is neither a Mox nor a land). The bar rises with the price the
    # same way arm two's does: a {2} artifact must add three or more, not
    # two. Basalt Monolith ({3}, `{T}: Add {C}{C}{C}`) and Worn Powerstone
    # ({3}, enters tapped, `{T}: Add {C}{C}`) both correctly miss on cmc
    # alone — neither reaches any arm's `c.cmc` gate, so no extra guard word
    # was needed to exclude either one. cEDH Pro round gap-closing pass,
    # corpus counts and spot checks measured and recorded once the dev graph
    # was reachable again — see the task report for the exact before/after
    # numbers this comment intentionally does not freeze a stale copy of.
    Rule(
        id="fast_mana_artifact",
        where=(
            "c.type_line CONTAINS 'Artifact' "
            "AND NOT c.type_line CONTAINS 'Land' "
            "AND NOT c.type_line CONTAINS 'Token' "
            "AND NOT c.type_line CONTAINS 'Equipment' "
            "AND NOT c.oracle_text =~ $fm_exclude "
            "AND ((c.cmc = 0 AND c.oracle_text =~ $fm_free_add) "
            "OR (c.cmc = 1 AND c.oracle_text =~ $fm_burst_add) "
            "OR (c.cmc = 2 AND c.oracle_text =~ $fm_triple_add))"
        ),
        params={
            "fm_free_add": (
                r"(?si).*\{T\}(, sacrifice (this artifact|this permanent))?:\s*add\b.*"
            ),
            "fm_burst_add": (
                r"(?si).*\{T\}:\s*add (\{[wubrgc]\}\{[wubrgc]\}|(two|three|four|five|x) mana).*"
            ),
            # No `x` here, unlike the {1} arm: at {2} every "add X mana"
            # artifact in the corpus scales X off counters it enters without
            # (Séance Board: soul counters, plus a spend restriction) — the
            # opposite of mana the turn it lands.
            "fm_triple_add": (
                r"(?si).*\{T\}:\s*add (\{[wubrgc]\}\{[wubrgc]\}\{[wubrgc]\}|"
                r"(three|four|five) mana).*"
            ),
            "fm_exclude": (
                r"(?si).*(suspend|multikicker|activate only|for each|"
                r"spend this mana only).*"
            ),
        },
        produces=(R.FAST_MANA,),
        why="A bare {T}-tap artifact that nets more mana than its own cost, the turn it lands.",
    ),
    # The land side. Tagger's `sol-land` — "Lands that mimic the mana ability
    # of Sol Ring: add two colorless mana" — is the obvious source and is
    # only half right: its 11-card closure describes the ability's *shape*,
    # not whether the land is actually fast. Four of the 11 fail on inspection
    # for reasons the shape can't see: Arid Archway and Guildless Commons
    # enter tapped *and* bounce a land you control, so they cost a land drop
    # and a turn of tempo rather than accelerating one; Muraganda Raceway's
    # second mode needs Max Speed, an Aetherdrift mechanic built up over
    # several of your turns; Untaidake enters tapped. Shrine of the Forsaken
    # Gods and Temple of the False God are gated on controlling seven and five
    # lands respectively — by the turn either unlocks, the deck no longer
    # needs accelerating.
    #
    # The guard is the same shape as the artifact rule's: text that says
    # "enters tapped", "activate only if" or "max speed" disqualifies. Ancient
    # Tomb, City of Traitors, Crystal Vein, Eldrazi Temple and Ugin's
    # Labyrinth clear it — the same 5-card population a hand audit of all 11
    # reaches.
    #
    # Known, deliberate gap: Gaea's Cradle. It is not in `sol-land` — its
    # ability scales with creatures you control rather than adding a flat
    # amount, so it fails "mimics Sol Ring" by Tagger's own definition — and
    # a bespoke regex for one card is the `Share the Spoils` anti-pattern this
    # file already declines elsewhere: dropped for a population of one, noted
    # here in case a future round wants a general "scales with a board-state
    # count" template.
    Rule(
        id="fast_mana_land",
        where=(
            "EXISTS { MATCH (c)-[:TAGGED]->(:Tag)<-[:PARENT_OF*0..]"
            "-(:Tag {slug: 'sol-land'}) } "
            "AND NOT c.oracle_text =~ $fm_land_exclude"
        ),
        params={"fm_land_exclude": r"(?si).*(enters tapped|activate only if|max speed).*"},
        produces=(R.FAST_MANA,),
        why="Taps for two colorless with no drawback that delays or gates it — Ancient Tomb.",
    ),
    # The third fast-mana shape, and the only one with no permanent at all:
    # Elvish Spirit Guide and Simian Spirit Guide exile themselves from hand
    # for one colored mana, no tap, no mana cost paid, no battlefield step —
    # as fast as fast mana gets, and entirely outside `fast_mana_artifact`
    # above, which is gated on `c.type_line CONTAINS 'Artifact'`. Both are
    # Creatures.
    #
    # Surveyed before writing a regex, the `free_spell` mapping's own
    # discipline in `tag_mapping.py` (grep the slug space, then decide):
    # Scryfall Tagger carries no `spirit-guide`, `exile-from-hand` or
    # `pitch-mana` slug at all. The two real slugs that *do* apply to Elvish
    # Spirit Guide, checked live via Scryfall's own `otag:` search (the
    # dev graph's `(:Tag)` nodes were unreachable this session — see the
    # task report) are `ramp` (2,097-card closure, already mapped above to
    # `Role.RAMP_OTHER` only — no resource) and `manaless-value` — the exact
    # tag `tag_mapping.py`'s `free_spell` comment already surveyed and
    # rejected for this family: dredge (Bloodghast, Ichorid), the Chancellor
    # cycle and Affinity creatures (Frogmite, Hollow One) share it, and none
    # of those are free mana. No slug reaches this narrow a class cleanly; a
    # regex is the honest v1, the same call `fast_mana_artifact` and
    # `fast_mana_land` above already made.
    #
    # The guard is `exile this card from your hand`, not a looser `exile ...
    # from your hand` — the polarity trap the brief names directly. A
    # cost-cheating payoff (a card that *cares about* exiling cards from
    # hand — Pitch Elemental-style alternate costs read "exile a card from
    # your hand" with no "this", never "this card") cannot match: the
    # pronoun only appears in a card's own self-referential cost, never in
    # another card's payoff clause. [measured count / spot checks / false-
    # positive sweep pending — corpus temporarily unreachable this session,
    # see task report].
    Rule(
        id="spirit_guide_free_mana",
        where="c.oracle_text =~ $spirit_guide",
        params={"spirit_guide": r"(?si).*exile this card from your hand:\s*add\b.*"},
        produces=(R.FAST_MANA,),
        why="Exiles itself from hand for one mana, no tap and no mana cost paid — free mana.",
    ),
)
