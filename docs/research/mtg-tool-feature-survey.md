# Feature survey: what other MTG tools offer

Research for #104 (map: #99). Question: which features of other Magic tools matter
to one fixed play group (mostly Commander) running its own league, and which of
them mtg is missing.

Surveyed 2026-10-19. Each claim links the page it rests on. Moxfield answers
every request to its site with HTTP 403 (Cloudflare), so its official help could
not be read; Moxfield rows rest on its own feedback board (moxfield.nolt.io) or
are marked as unverified.

## What mtg already has

Checked against `frontend/mtg/src/routes` and `services/mtg/src/http/handler_frontend`
on `main`, plus `origin/feat/tournament-play`:

- **Collections**: storage locations, loans (`on-loan`), statistics, price history,
  CSV import that reads Moxfield, Archidekt, Deckbox and ManaBox exports
  (`frontend/mtg/src/utils/csv-import.ts`), sharing by token, public profiles.
- **Decks**: tags, folders, bracket and rule zero fields, Game Changer markers,
  statistics, odds and hand composition, goldfish, sourcing against attached
  collections, plain-text export (`export-deck-dialog.tsx`), import from text or a
  Moxfield/Archidekt link (`services/mtg/src/utils/deck_source.rs`).
- **Advisor** (with `services/mtg-graph`): EDHREC-derived suggestions and cuts,
  Commander Spellbook combos (complete and one card short), a Scryfall-flavoured
  pool query with one-click presets such as `eur<5`, and "never offer" / "never
  cut" lists (`services/mtg/src/models/deck/advisor.rs`).
- **Other**: watch lists, explore, scanner, life tracker with commander damage,
  proxy printer, MPC fill, admin dashboard.
- **Branch `feat/tournament-play`** (75 commits, unmerged): Swiss and pods,
  guests and claim tokens, join codes, check-in, decklists with lock, round timer,
  results with corrections, standings, audit log. No leagues, no cross-event
  stats, no pod balancing by deck power.

## Play table and group

These matter most for a fixed group: the tools that serve groups well
(Playgroup.gg, Nerd Leagues) are built around *logging casual games over time*,
not around single events.

| Candidate | Value for the group | Who does it, how |
|---|---|---|
| Casual game log | Every pod night leaves a record without running a "tournament" for it. | Playgroup.gg logs live (shared tablet or synced devices) or "log the result in about a minute afterward" ([playgroup.gg](https://playgroup.gg/)). Nerd Leagues: "Play Game, Already Played", one row per player with deck and winner, notes with `[[Card]]` links ([Nerd Leagues](https://www.nerdleagues.com/how-it-works/commander-pod-league)). |
| League with seasons | A season gives the group a goal and a reset, all-time stays as history. | Nerd Leagues: league with invite code and commissioner, seasons are date-bounded scoreboards that reset to 1000 beside all-time standings ([Nerd Leagues](https://www.nerdleagues.com/how-it-works/commander-pod-league)). Playgroup.gg: seasons can be archived and restarted ([Playscore](https://playgroup.gg/playscore)). |
| Configurable league points | The group writes its house rules (no infinite, no extra turns) into the score. | Playgroup.gg Playscore: defaults such as kill +2, first blood +1, win +1, going infinite -2, extra turn -1, 2+ tutors -1, turn over 10 min -1; custom templates allowed ([Playscore](https://playgroup.gg/playscore)). TopDeck.gg: points for win/draw/loss/bye, draw modes, max points per round, seat scaling ([TopDeck help](https://topdeck.gg/help/running-commander-tournament)). |
| Elo per player and per deck | Shows who and which deck is actually strong, not only who played most. | Nerd Leagues: players and decks start at 1000, decks register themselves on first use, Elo history chart ([Nerd Leagues](https://www.nerdleagues.com/how-it-works/commander-pod-league)). Playgroup.gg: Elo leaderboards ([playgroup.gg](https://playgroup.gg/)). |
| Deck winrate and rivals | Answers "is my deck too strong for this table?" with data. | Playgroup.gg: per-deck win rates and "arch-enemies" ([playgroup.gg](https://playgroup.gg/)), and a commander tier list from tracked casual games ([tier list](https://playgroup.gg/commanders/tier-list/180-days)). |
| Turn order stats | Seat one wins far more in cEDH; a group can check whether that holds for it. | Playgroup.gg tracks who wins the starting roll and whether the starting player wins more ([playgroup.gg](https://playgroup.gg/)). EDHREC reports seat 1 at 35-40% vs seat 4 at 10-15% in cEDH pods ([EDHREC, 2026-03-24](https://edhrec.com/articles/does-cedh-have-a-seat-order-problem)). |
| Pod pairing modes | Avoids the same four people facing each other every week. | TopDeck.gg: Swiss pods (avoid re-pairs), power pods, random, bubble pods, bye mode with 3- or 5-player pods, pool play ([TopDeck help](https://topdeck.gg/help/running-commander-tournament)). No surveyed tool balances pods by deck power. |
| Bracket check | Settles "is this really a bracket 3 deck?" before the game, not after. | Playgroup.gg bracket calculator counts Game Changers, banned cards, mass land denial, extra-turn chains and two-card combos, caps at bracket 4 ([calculator](https://playgroup.gg/commander/bracket-calculator)). Commander Spellbook offers an `estimate-bracket` endpoint ([API](https://backend.commanderspellbook.com/)). |
| Results to Discord | The group sees results where it already talks. | Nerd Leagues posts every recorded game to a Discord webhook ([Nerd Leagues](https://www.nerdleagues.com/how-it-works/commander-pod-league)). TopDeck.gg has a Discord bot ([topdeck.gg](https://topdeck.gg/)). |
| Self-reported results | Nobody has to be the scorekeeper. | TopDeck.gg: players self-report with optional confirmation; staff confirm, dispute or overwrite ([TopDeck help](https://topdeck.gg/help/running-commander-tournament)). Companion: report match results in the app ([App Store](https://apps.apple.com/us/app/magic-the-gathering-companion/id1455161962)). |
| Remote play | Lets the group play when someone is away. | SpellTable: webcam play with card recognition by click, a lobby ([magic.gg, 2022](https://www.magic.gg/news/play-more-magic-with-spelltable)). Manabrew: rules-enforcing client (Forge engine), browser or desktop, up to 4 players, AGPL ([manabrew.app](https://manabrew.app/)). Integrate by link at most; not worth building. |

## Deckbuilding

| Candidate | Value for the group | Who does it, how |
|---|---|---|
| Deck compare | See what a friend's take on the same commander does differently. | Archidekt links a "Compare decks" tool from its navigation ([archidekt.com](https://archidekt.com/landing)); details only in third-party guides. A Moxfield user describes copying decks and using "Compare" as a version workaround ([nolt #2617](https://moxfield.nolt.io/2617)). |
| Deck history / versions | Shows what changed since the last league night, and lets winrate be tied to a version. | Requested on Moxfield ([nolt #795](https://moxfield.nolt.io/795)) and on the Archidekt forum ([forum](https://www.archidekt.com/forum/thread/7059508/1)); not confirmed as shipped by either. MythicHub records deck- and card-level changes ([MythicHub](https://mythichub.com/help/deck-history)). |
| Card packages | Reuse a "ramp package" across decks. | Archidekt lists "card packages" in deck discovery ([archidekt.com](https://archidekt.com/landing)). |
| Combos in deck | Warns before a combo surprises the table. | Commander Spellbook Find My Combos takes a list or URL ([find-my-combos](https://commanderspellbook.com/find-my-combos/)). mtg already has this in the advisor. |
| Salt score | Flags cards the table will resent. | EDHREC salt score from a yearly 0-4 survey, "Saltiest Cards" list ([EDHREC FAQ](https://edhrec.com/faq)). Not in mtg. |
| Lift instead of synergy | Better card pair signals for the advisor. | EDHREC retires synergy for lift, "how often two cards are run together, relative to what random chance expects" ([EDHREC, 2025-12-15](https://edhrec.com/articles/from-synergy-to-lift-the-math-behind-edhrecs-new-era)). Check what `services/mtg-graph/src/deck_lab/edhrec.py` reads. |
| Budget / bracket filters on recs | Suggestions that fit the wallet and the table. | EDHREC filters stats by budget, bracket and tag ([EDHREC FAQ](https://edhrec.com/faq)). mtg covers budget through the pool query. |
| Playtester | Goldfish a hand. | Archidekt "first-class playtester" ([archidekt.com](https://archidekt.com/landing)), ManaBox deck simulator ([manabox.app](https://manabox.app/)). mtg has goldfish. |

## Collection

| Candidate | Value for the group | Who does it, how |
|---|---|---|
| Trade tool | Fair trades between members at the table. | ManaBox has a built-in trade tool and multi-shop price compare ([manabox.app](https://manabox.app/)). mtg has loans but no trade between accounts. |
| Compare wish list to a friend's binder | "Who in the group has my missing cards?" | Requested on Moxfield, not supported ([nolt #2150](https://moxfield.nolt.io/2150)). mtg sourcing already checks attached collections; extending it to the group's shared collections would beat both. |
| Price spike notice | Notice when an old deck got expensive. | Requested on Moxfield ([nolt #2655](https://moxfield.nolt.io/2655)). mtg has price history and watch lists. |
| Multi-language offline search | Phone use at the table. | ManaBox: offline search in 7 languages, currency conversion ([manabox.app](https://manabox.app/)). |

## Import and export

| Candidate | Value for the group | Who does it, how |
|---|---|---|
| Decklist URL import beyond Moxfield/Archidekt | Members keep their builder of choice. | Commander Spellbook exposes `card-list-from-url` and `card-list-from-text` ([API](https://backend.commanderspellbook.com/)); playgroup.gg's calculator takes Moxfield or Archidekt links ([calculator](https://playgroup.gg/commander/bracket-calculator)). mtg already reads both. |
| Standings export | Keep league history outside the app. | Melee exports final standings as CSV ([help.melee.gg](https://help.melee.gg/docs/decklists-a-help-guide-for-organizers/)). |
| Buy missing cards | One click from sourcing to a cart. | Moxfield links decks to Mana Pool's cart optimizer ([Mana Pool, 2025-05-30](https://manapool.com/library/platform/2025/05/30/moxfield-manapool-integration.html)). mtg links Cardmarket per card. |
| Tournament data API | Pull event results into stats. | TopDeck.gg publishes a tournaments v2 API ([topdeck.gg](https://topdeck.gg/)). Not needed for a closed group. |

## The old idea issues

- **#4 Include Manabrew?** Manabrew is a rules-enforcing game client, not a builder: Forge engine, AGPL, browser and desktop, up to 4 players, no account ([manabrew.app](https://manabrew.app/)); its engine is on crates.io as `manabrew-engine`. At most an "open in Manabrew" export; nothing to absorb.
- **#6 Scryfall query for suggestions.** Done in mtg: the advisor's `pool_query` is a Scryfall-flavoured query, compiled by the service, with presets.
- **#7 "Don't show anymore" for suggestions.** Done in mtg: advisor `ignored` cards ("never offer").
- **#8 Compare a deck with others of the same tag.** Partly solved elsewhere: Archidekt compares two decks and has deck tag pages ([archidekt.com](https://archidekt.com/landing)); EDHREC filters commander stats by tag ([EDHREC FAQ](https://edhrec.com/faq)). Nobody compares against "decks with this tag" in one view; mtg has explore and tags, so it is buildable.
- **#9 Track winrate of decks.** Solved by Playgroup.gg (per-deck win rate, rivals) and Nerd Leagues (deck Elo). This is the biggest gap for the group and needs a casual game log, not only tournaments.
- **#10 Proximity based matchup tracking.** No surveyed tool does proximity. The closest are Playgroup.gg's synced devices and "arch-enemies" ([playgroup.gg](https://playgroup.gg/)). With a fixed group, a join code per table (already on the tournament branch) is simpler than proximity.
- **#12 Leagues.** Solved by Nerd Leagues (seasons, Elo, Discord) and Playgroup.gg (Playscore with custom points, seasons). The tournament branch has the per-event pieces; the league layer on top is missing.
- **#24 Budget brews.** EDHREC offers budget filters ([EDHREC FAQ](https://edhrec.com/faq)); mtg has the `eur<5` pool preset. A deck-level budget cap (total price target in the advisor) is not seen in any tool surveyed.
- **#76 Show the tokens a deck creates.** Not confirmed in any surveyed tool's primary docs. Scryfall's `all_parts` is the data source, as the issue says.

## Takeaways

1. The group-facing gap is a **casual game log** that feeds deck winrate, Elo,
   rivals and turn-order stats; leagues and seasons sit on top of it. Playgroup.gg
   and Nerd Leagues are the models.
2. **Configurable league points** (Playscore style) fit a group with house rules
   better than plain win/loss.
3. **Pod balancing by deck power** is offered by none of the surveyed tools;
   mtg already knows brackets, Game Changers and combos, so it could be first.
4. Deck **versions** are requested on both big builders and shipped by neither;
   they matter once winrates are tracked per deck.
5. Remote play (SpellTable, Manabrew) is out of scope; link out at most.
6. #6 and #7 are already done and can be closed.
