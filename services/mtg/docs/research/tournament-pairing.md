# Tournament pairing, standings and Rulesets

Research note for the tournament planner (spec #174). It collects what the published rules say about pairing Swiss Rounds, Byes, smaller Matches, Seats, Tiebreakers, round counts and the Top cut for the three Rulesets mtg offers, and turns each into a rule the pairing and standings engine can implement. Vocabulary follows the Tournaments section of `services/mtg/GLOSSARY.md`; the documents say "pod" where mtg says Match.

Every rule below is marked:

- **Source**: stated by the cited document.
- **Decision**: the documents leave it open or contradict each other; this note picks one, with the reason.
- **Open**: not settled; the engine ticket decides and records it here.

Sources were read on 2026-10-25.

## Sources

| Short name | Document | Where |
| --- | --- | --- |
| MTR | Magic: The Gathering Tournament Rules, effective 2026-02-27 (Wizards of the Coast). Sections 2.2, 2.4, 2.10, 3.1, 10.2, 10.4, Appendix C (Tiebreakers), Appendix E (number of rounds) | https://media.wizards.com/ContentResources/WPN/MTG_MTR_2026_Feb27_EN.pdf, linked from https://wpn.wizards.com/en/rules-documents |
| MIPG | Magic Infraction Procedure Guide, effective 2024-09-23 | https://media.wizards.com/ContentResources/WPN/MTG_IPG_2024Sep23_EN.pdf |
| TopDeck MTRA | TopDeck.gg "Multiplayer Tournament Addendum" (MTRA), updated 2025-06-24, owner Maxwell Molinari. Supplement to MTR and Competitive IPG, the rules most TopDeck cEDH events run under | https://topdeck.gg/mtr-ipg-addendum |
| TopDeck help | TopDeck.gg help center: "Event configuration" (Tiebreakers, Bye Mode, round counts) and "Running a Commander tournament" | https://topdeck.gg/help/event-configuration, https://topdeck.gg/help/running-commander-tournament |
| Addendum | "Multiplayer Addendum to the Magic Tournament Rules", Juízes MTG Portugal, page dated 2026-09-27; initial authors Erin Leonard, Fábio Batista, Graydon Beadle. Rule numbers mirror the MTR (2.2A, 3.1A, 10.4A, Appendix C and E policy additions). Also published as the Benelux and European cEDH addendum | https://juizes-mtg-portugal.github.io/multiplayer-addendum-mtr, https://benelux-cedh-rules.eu/multiplayer-addendum-mtr |
| canivete | Fábio Batista's open-source tournament app (Ruby on Rails), named by the Addendum as an implementation of its pairing. Read at `HEAD` on 2026-10-25: `app/models/{tournament,event,event_participant,pod,ghost}.rb`, `app/services/tournaments/{uneven_pod_generator,player_sorter}.rb`, `app/services/tournaments/strategies/{swiss_matcher,spread_matcher}.rb`, `app/jobs/tournaments/create_*_pods_job.rb` | https://github.com/fbatista/canivete |

The Ruleset "TopDeck" is the TopDeck MTRA together with TopDeck's default event settings; the Ruleset "Multiplayer Addendum" is the Juízes MTG Portugal document. Both call themselves a multiplayer addendum to the MTR, which is the main source of confusion when reading about them.

The MIPG has no rules on pairing or standings. Its penalties reach the engine only as Results: a Match loss is recorded as a lost Match (one-on-one e.g. 0-2), which the engine scores like any other loss.

## Ruleset summary

| | MTR | TopDeck | Multiplayer Addendum |
| --- | --- | --- | --- |
| Table size | 2 | 3–5 (written for 4) | 3–5 (written for 4, formulas take any n) |
| Match points win/draw/loss | 3/1/0 (MTR App. C) | 5/1/0 (MTRA Appendix "Match Points") | (2n−1)/1/0, n = Table size: 7/1/0 at 4, 5 at 3, 9 at 5 (Addendum App. C) |
| Bye | 2-0 win: 3 Match points, 6 game points (MTR App. C "Byes") | a win: 5 Match points (MTRA Appendix) | none; smaller Matches instead (Addendum 10.4A) |
| Uneven player count | one Bye | full Matches first, at most one smaller Match per Round, otherwise Byes (MTRA "Pairing Guidelines") | fewest smaller Matches, a Participant in one at most once (Addendum x.1B, 10.4A) |
| Tiebreakers after Match points | OMW%, GW%, OGW% (MTR 3.1) | Opponent win rate, game win rate, opponent game win rate (TopDeck help defaults) | MW%, OAMP, OMW% (Addendum 3.1A) |
| Floor | 0.33 (MTR App. C) | 0.2 for every Tiebreaker (MTRA Appendix "Tie Breakers") | 1 / points per win, for opponents only (Addendum App. C) |
| Bye in opponents' Tiebreakers | ignored (MTR App. C) | counts as 3 opponents at 0.2 (MTRA 3.1) | no Byes |
| Smaller Match in Tiebreakers | n/a | not mentioned | one phantom opponent at the floor (Addendum App. C) |
| Swiss Seats | play/draw chosen by the winner of a random method (MTR 2.2) | "predetermined order established by pairing software", Seat 1 starts (MTRA 2.2) | random (Addendum 2.2A, x.3A) |
| Top cut Seats | higher ranked chooses play/draw (MTR 2.2) | seed order, top seed first (MTRA Appendix "Top cut Format") | Swiss standing order, top seed first (Addendum 2.2B) |
| Draw in the Top cut | impossible, play continues (MTR 2.4) | highest ranked advances (MTRA 2.1) | highest Swiss standing wins (Addendum 2.4C) |

## Where the two multiplayer Rulesets disagree

1. **Points.** TopDeck 5/1/0 fixed; Addendum 2n−1 per win (7 in four-player Matches). Both give 1 per draw and the same win value in smaller Matches.
2. **Uneven counts.** TopDeck gives Byes and allows at most one smaller Match per Round ("no more than 2 byes per round due to player count" at Table size 4). The Addendum never gives Byes and plays as many smaller Matches as needed (21 players: three of 4, three of 3).
3. **Tiebreakers.** TopDeck ranks by opponents' strength first (opponent win rate), the Addendum by own Match-win percentage first, then opponents' average Match points, then opponents' Match-win percentage.
4. **Floor.** TopDeck 0.2 on every Tiebreaker; the Addendum 1/7 (at Table size 4), only on an opponent's Match-win percentage.
5. **Missing opponents.** TopDeck pads a Bye with 3 opponents at 0.2; the Addendum pads each smaller Match with a phantom opponent at the floor.
6. **Round counts.** Different tables, see below. TopDeck's own software default (help center) differs from its MTRA table too.
7. **Top cut size.** TopDeck: Top 4, 10 or 16; Addendum: Top 4, 7, 10, 13, 16, 40, 64. Irrelevant to mtg, whose multiplayer Top cut is one final Match (multi-stage cuts are #171).
8. **Swiss Seats.** The Addendum seats at random; TopDeck leaves it to the software. mtg uses canivete's weighted seating for both (spec #174), which is a deliberate deviation from the Addendum's text.

## Match points and Results

- **MTR** (Source, MTR App. C): win 3, draw 1, loss 0 Match points. Game points: 3 per game won, 1 per drawn game, 0 per game lost; unfinished games count as draws, unplayed games 0. So 2-1 gives the winner 6 and the loser 3 game points; 1-1-1 gives each 4 game points and is a Match draw.
- **TopDeck** (Source, MTRA Appendix): win 5, draw 1, loss 0. A Match is one Game (MTRA 2.1).
- **Multiplayer Addendum** (Source, App. C): win 2n−1 with n the Table size, draw 1 to every Participant of the Match, loss 0. The win value does not shrink in a smaller Match.
- **Decision**: TopDeck keeps 5/1/0 at Table size 3 and 5 as well, since the MTRA states fixed numbers; the Addendum applies its formula (5 at Table size 3, 9 at 5).
- **Decision**: in multiplayer, a Result is a single winner or a draw of all Participants of the Match (spec). The Addendum's exception that Participants who conceded or got a Match loss do not share the draw (Addendum 2.1A) is not modelled; an Organizer can set such a Result by hand only if the Result shape allows it. **Open** for the Result ticket whether a draw can exclude Participants.

## Byes

- **MTR**: a Bye is a 2-0 win (3 Match points, 6 game points, 2 games) (Source, App. C). The MTR does not say who gets it. **Decision** (spec): the lowest-ranked Participant without a Bye so far; in Round 1, where all are equal, a random one. If every unpaired candidate already had a Bye, the lowest-ranked of them.
- **TopDeck**: a Bye is a won Match, 5 Match points (Source, MTRA Appendix). Who gets it is not stated. **Decision**: same as MTR, the lowest-ranked Participants without a Bye so far.
- **Multiplayer Addendum**: no Byes, ever (Source, 10.4A).
- In every Ruleset a Bye is not an opponent: it never enters the opponents' list of anyone.

## Match sizes for an uneven number of Participants

Let n be the number of Participants paired this Round (paid, not dropped) and T the Table size.

**MTR (T = 2)**: n/2 Matches; if n is odd, one Bye.

**TopDeck** (Source for T = 4: "as many pods with 4 players as possible", pods of 3 only "to avoid multiple byes", "no more than one pod of 3 players" per Round, at most 2 Byes from the player count). With r = n mod T:

| r | Matches |
| --- | --- |
| 0 | n/T full Matches |
| T−1 | full Matches plus one smaller Match of T−1 |
| otherwise | full Matches plus r Byes |

At T = 4: r = 1 gives 1 Bye, r = 2 gives 2 Byes, r = 3 gives one Match of 3. **Decision**: the same rule for T = 3 (r = 2 is a smaller Match of 2, r = 1 a Bye) and T = 5 (r = 4 a Match of 4, r = 1 to 3 Byes); the MTRA only speaks about four-player pods. If n < T, one Match of all n (n ≥ 2), or a Bye for a single Participant.

TopDeck's software offers "Pair Low Standings" or "Pair High Standings" into the smaller pod (help center, Bye Mode). **Decision**: the smaller Match is the lowest table ("Pair Low Standings"), matching the Addendum's top-to-bottom fill. **Open**: TopDeck's own default mode is not documented.

**Multiplayer Addendum** (Source, x.1B and 10.4A: "the minimum possible number of Pods with three Players", "always trying to minimize the difference in pod size towards the norm", examples 21, 22, 23 players). **Decision** (it reproduces every example and canivete's `UnevenPodGenerator`): play m = ⌈n / T⌉ Matches and split n over them as evenly as possible, so sizes differ by at most one. At T = 4:

| n | Matches |
| --- | --- |
| 3 | 3 |
| 5 | one Match of 5 (exception below) |
| 6 | 3, 3 |
| 7 | 4, 3 |
| 9 | 3, 3, 3 |
| 10 | 4, 3, 3 |
| 11 | 4, 4, 3 |
| 21 | 4, 4, 4, 3, 3, 3 |
| 22 | 4, 4, 4, 4, 3, 3 |
| 23 | 4, 4, 4, 4, 4, 3 |

Exception (Source, canivete: exactly 5 players play one pod of 5; Addendum App. E: "4–5 players: run 1 single elimination round"): n = T + 1 plays one Match of T + 1 when that is at most 5, the largest Table size. So 4 Participants at T = 3 play one Match of 4, 5 at T = 4 one Match of 5, and 6 at T = 5 split into 3, 3.

The even split can make a Match two smaller than T (T = 5, n = 7: 4, 3; n = 11: 4, 4, 3) which the Addendum never discusses. **Decision**: accept it; the even split still minimizes the difference to the norm.

"It is desirable that Players only get matched in smaller size pods at most once per event" (Source, 10.4A). **Decision**: a soft constraint in the pairing cost (see below), weaker than avoiding repeat opponents.

## Pairing

### MTR

The MTR only says Swiss (10.4). **Decision** (spec): Round 1 at random. Later Rounds: maximum-weight matching over all Participants, where a rematch is never an edge, a pairing within the same Match points scores highest and every point of difference costs (pair-downs minimized), so pairings stay within point groups wherever possible. The Bye is taken out before matching (see Byes).

**Decision** (#305): when no rematch-free pairing exists (e.g. 4 Participants in Round 4), the engine pairs the fewest rematches and flags each such Match, since an Organizer checks the preview anyway. The matching minimizes, lexicographically, the number of rematches and then the sum of squared Match point differences of its Matches: squared, so two pair-downs of one point group each beat one pair-down across two. Chance decides between equally good pairings (the vertex order is shuffled from the Round's stored seed), which makes Round 1 random. Seat 1 is drawn, and the Match holding the best-ranked Participant gets table 1.

### Multiplayer (TopDeck and Multiplayer Addendum)

Source (Addendum 10.4A): sort by standings, fill Matches "Top-to-Bottom", "must avoid matching between Players that have already played against each other", and when the first pass leaves Participants without a Match, swap them with Participants of earlier Matches who fit; swapped Participants are paired up or down. TopDeck documents no algorithm ("Swiss pods: groups players with similar records", help center).

canivete as written (`SwissMatcher`, `Pod`), for reference, not to copy:

- Round 1 sorts randomly; ties in the standings are broken by a shuffle (`PlayerSorter`).
- Round 2 uses a different strategy, `SpreadMatcher`: serpentine over the tables (1, 2, 3, 3, 2, 1, ...) by standings, so winners are spread out instead of meeting. The last Swiss Round uses `forced`.
- The rematch check sits behind an inverted flag: in `standard` Rounds `match!` calls `force_candidate`, which ignores rematches, and only `forced` Rounds check them. This looks like a bug.
- A Participant who already played a smaller Match may be paired with a former opponent (`can_match?`), so keeping people out of a second smaller Match beats avoiding a rematch there.

**Decision** (spec: repeat opponents minimized, not forbidden): Round 1 at random. Later Rounds:

1. Order Participants by standings, ties at random.
2. TopDeck: take out the Byes (lowest-ranked without a Bye).
3. Lay out the Match sizes (rules above), full Matches on the top tables, smaller Matches at the bottom.
4. Fill top to bottom by standings.
5. Improve by swapping Participants between Matches while the cost drops, compared lexicographically:
   1. number of repeat-opponent pairs within Matches (each pair of Participants who already met counts once per earlier meeting),
   2. number of Participants in a smaller Match for the second time or more (Multiplayer Addendum; for TopDeck also: Participants in the smaller Match who already had one),
   3. the sum over Matches of the spread of Match points within the Match (pair-ups and pair-downs).

The swap search is a local search; it need not be optimal, it needs to be deterministic for a given seed so tests can pin it.

## Seats

- **MTR**: in a one-on-one Swiss Match the winner of a random method chooses play or draw (MTR 2.2); in the Top cut the higher-ranked Participant chooses. **Decision**: Seat 1 is the Participant who chooses: random in Swiss Rounds, the higher seed in the Top cut. The game score is not tied to Seats.
- **Multiplayer Swiss Rounds**, both Rulesets. **Decision** (spec, from canivete `Pod#weighted_seatings`): order the Participants of a Match by the tuple (times in Seat 1, times in Seat 2, ..., times in Seat T, minus Match points rank, random), ascending, and give them Seats 1, 2, ... in that order. The counts run over the Participant's earlier Swiss Matches. So whoever has started least often starts; among equals, whoever has had Seat 2 least often, and so on; then the higher-ranked; then chance. In a smaller Match only Seats 1 to its size are given, but the tuple still counts all T Seats.
- **Multiplayer Top cut**: Seats by seed, top seed in Seat 1 (Source: MTRA Appendix, Addendum 2.2B).

## Standings and Tiebreakers

Shared rules (Decision unless marked):

- Only Swiss Matches count towards Match points and Tiebreakers; the Top cut orders its Participants by how far they got, then by Swiss standings (canivete excludes Top cut pods from opponents the same way).
- A Participant's opponents are a list, not a set: everyone it shared a Swiss Match with, once per Match. A dropped opponent counts with its record up to its Drop. A late Participant's Matches played start in its first Round (MTR App. C: "in those Rounds"); it gets no losses for the Rounds it missed.
- Compare exact fractions; round only for display (two decimals, as in MTR App. C). canivete and TopDeck round to four decimals before comparing; exact comparison only differs on near ties.
- Participants equal on everything are ordered at random from the Tournament's seed (Source: TopDeck help "tied players resolve randomly"; canivete shuffles). The standings show them on the same rank; pairing and the Top cut use the drawn order.

### MTR (Source, MTR 3.1 and App. C)

Order: Match points, OMW%, GW%, OGW%.

- **MW%** = Match points / (3 × Rounds played), at least 0.33. A Bye counts as a Round played and a win (example: 3-2-0 including a Bye, 9 / 15 = 0.60).
- **GW%** = game points / (3 × games played), at least 0.33. A Bye counts as two games won (6 game points).
- **OMW%** = average of each opponent's MW% (each already floored at 0.33); Byes are skipped, not counted as opponents.
- **OGW%** = average of each opponent's GW%, floored the same way.
- **Decision**: the floor is 0.33 as written, not 1/3.
- A Participant with no Matches yet (only a Bye or nothing) has OMW% and OGW% of 0.

### TopDeck

Order (Source, TopDeck help "Event configuration", the default "standard Magic set"): Match points, Opponent Win Rate (points/max), Game Win Rate, Opponent Game Win Rate (points/max). Floor and Byes (Source, MTRA Appendix "Tie Breakers" and 3.1): "The lower limit for a tie breaker is updated to .2 for all players", and a Participant with a Bye gets "3 opponents added to their opponent history with a 0.2 win rate percentage"; Tiebreakers are "calculated the same regardless if a player received a bye or not".

TopDeck publishes no formulas. **Decision**, reading "points/max" literally:

- **Win rate** = Match points / (5 × Matches played, Byes included as won Matches), at least 0.2. Since every multiplayer Match is one Game, the game win rate equals the win rate, and the opponent game win rate equals the opponent win rate; the engine computes win rate once.
- **Opponent win rate** = average over the opponents list of each opponent's win rate (floored at 0.2), where each Bye adds T−1 phantom opponents at 0.2 (3 at Table size 4, as the MTRA says).
- Effective order: Match points, opponent win rate, win rate.
- **Open**: whether a smaller Match is padded with phantoms under TopDeck (the MTRA is silent; the decision is no padding).

### Multiplayer Addendum (Source, 3.1A and App. C)

Order: Match points, Match-win percentage (MW%), Opponents' Average Match Points (OAMP), Opponents' Match-win percentage (OMW%). Points per win p = 2T−1.

- **MW%** = (Match points − Byes × p) / (Matches played × p). There are no Byes, so Match points / (Matches played × p). No floor on a Participant's own MW%.
- **OAMP** = sum of the opponents' Match points / number of opponents.
- **OMW%** = average of each opponent's MW%, each raised to at least 1/p (1/7 at Table size 4). "We don't minimum-cap it to 0.33."
- **Smaller Matches**: "an extra Player with the minimum-cap win percentage should be considered as having played in that pod". **Decision** (canivete's `Ghost` and `number_of_ghost_opponents`): one phantom opponent per empty Seat, T − size of the Match, with 0 Match points and MW% 1/p; phantoms count in OAMP and OMW%.
- canivete folds the Tiebreakers into one weighted number (`rank_score`) whose weights let OMW% outweigh OAMP, against the Addendum's order. **Decision**: follow the Addendum's order strictly.

## Suggested number of Swiss Rounds and Top cut

The count comes from the Participants who would be paired in Round 1 (paid, not dropped; before Round 1, everyone registered). Organizers can change it until the Swiss Rounds are over (spec), so these are suggestions.

### MTR (Source, MTR Appendix E)

| Participants | Swiss Rounds | Top cut |
| --- | --- | --- |
| 2 | 1 | none |
| 3–4 | 2 | none |
| 5–8 | 3 | none |
| 9–16 | 5 | Top 4 |
| 17–32 | 5 | Top 8 |
| 33–64 | 6 | Top 8 |
| 65–128 | 7 | Top 8 |
| 129–226 | 8 | Top 8 |
| 227–409 | 9 | Top 8 |
| 410+ | 10 | Top 8 |

Appendix E runs 5–8 players as single elimination without Swiss and has no row below 4 individual players. **Decision**: mtg always plays Swiss, so up to 8 Participants get ⌈log2 n⌉ Rounds and no Top cut, the same numbers TopDeck's software uses (help center: "1 round for 2 players, 2 for 3-4, 3 for 5-8"). The 9–16 row's "4 Rounds with a Top 8 draft" variant does not apply, since mtg has no booster draft playoff.

### TopDeck (Source, MTRA Appendix "Recommended Number of Rounds")

| Participants | Swiss Rounds | Cut in the MTRA | Top cut in mtg |
| --- | --- | --- | --- |
| up to 16 | 3 | 4 | final Match |
| 17–34 | 4 | 4 | final Match |
| 35–64 | 5 | 10 | final Match |
| 65–128 | 5 | 16 | final Match |
| 129–208 | 6 | 16 | final Match |
| 209–304 | 7 | 16 | final Match |
| 305–540 | 8 | 16 | final Match |
| 541–960 | 9 | 16 | final Match |
| 961+ | 10 | 16 | final Match |

TopDeck's software default for pod events differs: "2 rounds for up to 16 players, 3 up to 28, 4 up to 56, and 5 up to 128" (help center). **Decision**: the MTRA table, since the Ruleset is the document. **Decision**: below 2T Participants (one or two Matches per Round) suggest no Top cut, since the final would replay a Swiss Match.

### Multiplayer Addendum (Source, Addendum Appendix E, for Table size 4)

| Participants | Swiss Rounds | Cut in the Addendum | Top cut in mtg |
| --- | --- | --- | --- |
| 4–5 | none, 1 single-elimination Round | none | 1 Swiss Round, none |
| 6–16 | 2 | Top 4 | final Match |
| 17–24 | 3 | Top 7 | final Match |
| 25–32 | 4 | Top 10 | final Match |
| 33–40 | 5 | Top 13 | final Match |
| 41–64 | 5 | Top 16 | final Match |
| 65–128 | 6 | Top 16 | final Match |
| 129–256 | 7 | Top 40 | final Match |
| 257–512 | 8 | Top 40 | final Match |
| 513+ | 9 | Top 64 | final Match |

The table lists 512 in two rows; canivete starts the last row at 513. "For each smaller size pod, it's as if an extra invisible Player is added" (Source): count n plus the number of empty Seats of Round 1's Matches (30 Participants in two Matches of 3 count as 32). **Decision**: below 4 Participants, 1 Round and no Top cut; the same table for Table size 3 and 5 (the Addendum has none for them), with invisible Participants counted as T − size per smaller Match. **Open**: whether Table size 3 deserves more Rounds, since Matches of 3 meet fewer opponents.

## Top cut

- **MTR** (Source, 10.4): Top 8 pairs 1v8, 4v5, 2v7, 3v6; the winners of 1v8 and 4v5 meet, the winners of 2v7 and 3v6 meet. Top 4 pairs 1v4 and 2v3. A Top cut Match cannot end in a draw (MTR 2.4: play continues until someone wins), so its Result always has a winner.
- **Multiplayer**, both Rulesets: mtg plays one final Match of the T best Participants, Seats by seed. A drawn final goes to the highest seed in it (Source: MTRA 2.1 "the highest ranked player is considered to advance"; Addendum 2.4C "the Player with the highest Standing from the Swiss Portion ... should be considered the Winner").
- **Drops**: a Participant who Drops after the cut was made is not replaced, and in single elimination the opponent advances (Source, MTR 2.10: "no other player is advanced as a replacement", the highest ranked remaining player "receives a bye for the next round instead"). A Drop before the cut is made leaves room for the next in the standings (spec). The multiplayer documents say nothing; **Decision** (spec): the dropped Participant loses the final, the rest play on.
- If Drops leave fewer Participants than the Top cut size before it starts, **Open** for the Top cut ticket; recommendation: shrink to the next size that fits (Top 8 to Top 4, a multiplayer final to the Participants left).

## Still uncertain

- TopDeck's exact Tiebreaker formulas and its handling of smaller Matches; only names, order and the 0.2 floor are published.
- Which Participants TopDeck puts into Byes and the smaller Match by default.
- Round counts for Table size 3 and 5 under both multiplayer Rulesets.
- Whether a multiplayer draw can exclude Participants who conceded or were penalized (Addendum 2.1A).
- How the Top cut shrinks when Drops leave fewer Participants than its size.
