# Tournament player experience

The Tournament experience prioritizes Participants using phones: finding their current Match, playing with a Life counter and Round timer, reporting a Result, and understanding what happens next. The agreed decisions from the product interview form the basis of the implementation specification in issue #355.

## Participant views

A Participant's own situation comes first on the Tournament page. During Registration, emphasize their participation and Registered deck. During a running Round, show their table, Seat, opponents, Round timer and direct actions to open the Life counter or report the Result. After playing, emphasize their Result and next steps. Standings and all Matches remain accessible.

An Account that both organizes and participates can deliberately switch to the Organizer view. The Participant experience remains useful throughout the Tournament, including between Rounds, rather than disappearing whenever no Round runs.

Throughout the mtg app, a compact indication of an ongoing Tournament the Account participates in provides a direct entry. If several are ongoing, offer a selection. Participation is also clear in Tournament lists and the Tournament header.

Phone use is primary; desktop remains supported. Essential personal information and actions take priority over comprehensive tables and settings.

## Tournament push activation

After successful Self sign-up, offer to enable Tournament pushes. Also offer activation on the Tournament page, using a clear explanation such as "Enable notifications so you don't miss events". This refers to Tournament Self sign-up, not Account creation.

Only an explicit activation action starts the browser permission request. Reuse the existing device subscription and Account preference rather than creating a separate notification channel.

## Create and edit pages

Replace the creation and editing dialogs with dedicated pages sharing a form structure. Begin with Name, deck format, Table size and Ruleset, followed by the remaining settings. Use a single column on phones, with basic information before further settings.

Selecting a deck format supplies editable defaults:

| Deck formats | Table size | Ruleset |
| --- | --- | --- |
| Commander, PreDH, Pauper Commander, Oathbreaker | 4 | TopDeck |
| All other offered formats, including Duel Commander, Archon and Brawl variants | 2 | MTR |
| No deck format | 4 | TopDeck |

These are product defaults, not restrictions on how a format may be played. A later format change updates automatically supplied values, while preserving deliberate manual choices where the combination is valid. Loading an existing Tournament for editing preserves its saved settings. Existing restrictions on changing rules after play starts still apply.

MTR is the Ruleset for Table size 2. TopDeck is the default for multiplayer; Multiplayer Addendum remains selectable. Explain the Match points for a win, draw and loss next to the selected Ruleset. Keep existing Tournaments' Rulesets and Results.

## Life counter and Games

Open the existing Life counter for the Participant's current Match, populated with its names and Seat order. One phone counts for the whole table. Keep the server-based Round timer visible and provide direct Result reporting. The Round timer belongs to the Round and continues across Games.

Before a Game begins, suggest editable starting life totals:

| Deck formats | Starting life |
| --- | --- |
| Commander, PreDH | 40 |
| Pauper Commander | 30 |
| Oathbreaker, Duel Commander, Archon | 20 |
| Brawl variants in a two-person Match | 25 |
| Other ordinary Constructed formats | 20 |
| No deck format | 20 at Table size 2; 40 for multiplayer |

Paper Standard Brawl uses 30 in multiplayer under the [Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), rule 103.4. Arena Brawl variants are ordinarily one-on-one; manually choosing multiplayer remains a product override with an editable starting life total. [Pauper Commander](https://pdhhomebase.com/rules/) starts at 30 and [Oathbreaker](https://oathbreakermtg.org/faq/) at 20.

Explicitly ending a Game records its winner or a draw. Starting the next Game in a best-of-three Match resets life and commander damage while preserving the preceding Games and their outcomes. Their outcomes prefill a Result report, which still requires explicit submission. Reaching zero life never reports a Result automatically. Existing Result correction and dispute behavior remains available from the personal Match view and Life counter.

The Life counter is optional. Participants can play and report Results without it; Organizers can operate it for tables with Guests.

## Life history and device handover

Record starting totals, life and commander-damage changes, corrections, and Game starts and ends with timestamps and affected Participants. Present a run of taps as one understandable change, such as "Anna: 40 → 35". Corrections remain visible.

Save immediately on the device, retain unsent changes through connection interruptions, and upload the Life history to its Match. It remains accessible after the Tournament finishes to the Match's Participants and the Organizers, not to other Participants or public visitors.

One device leads the Match's Life counter; other devices may read the stored state. Explicit handover requires a connection and resumes the last uploaded state. If the previous device is unavailable, confirm that state before taking over. Retain any subsequently recovered changes from the old device as a conflict rather than silently merging or discarding them.

The standalone Life counter gains local history, its history view and restoration as well. Server persistence initially applies to Tournament Matches only. See [ADR 0005](./adr/0005-match-life-history-outlives-the-counting-device.md) for the storage boundary and its trade-offs.

## Review scenarios

- A signed-up Participant sees their participation before play, their own Match during a Round and useful next steps between Rounds, including while also acting as Organizer.
- An Account can reach an ongoing Tournament from elsewhere in mtg and choose between multiple ongoing participations.
- Tournament Self sign-up and the Tournament page expose push activation without automatically requesting browser permission.
- Create and edit pages show format early, apply the agreed defaults and preserve valid manual choices and existing Tournament settings.
- A two-person Match and a multiplayer Match both open with the correct names, Seats, suggested life totals, Round timer and Result actions.
- Game changes and corrections survive reloads; a new Game keeps the preceding history; reporting a Result remains explicit and possible without history.
- Connection loss preserves local changes for upload. Device handover and a returning former device do not silently overwrite either history.
- Only the Match's Participants and Organizers can read its stored history, including after the Tournament finishes.
