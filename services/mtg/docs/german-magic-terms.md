# German Magic terms

The lookup for every Magic term in mtg's German text (`frontend/mtg/public/locales/de/`).
Look a term up here before writing it, and add it here if it is missing. Do not write one
from memory: "Schlachtfeld", "Verlies", "Ebene" for planes and "Ränke" all looked right and
were all wrong.

## Which term to use

1. What cards print uses the German card wording ([Printed on cards](#printed-on-cards)).
2. Deckbuilding jargon stays English ([Jargon](#jargon)), because that is what players say.
3. If in doubt, the original English term.

The **UI** column says when the UI uses something other than the card wording.

## Printed on cards

A source like `frc/97` is the set and collector number of a German printing where the term
appears: <https://scryfall.com/card/frc/97/de>.

### Zones

| English | On German cards | UI | Source |
| --- | --- | --- | --- |
| on the battlefield | `im Spiel` | Zone label: Spielfeld, never Schlachtfeld | frc/97 |
| enters | `ins Spiel kommt` | | fra/357 |
| enters tapped | `kommt getappt ins Spiel` | | frc/103 |
| put onto the battlefield | `bringe sie getappt ins Spiel` | | frc/78 |
| from the battlefield | `aus dem Spiel` | | hob/303 |
| graveyard, put into | `auf deinen Friedhof` | Not "in den Friedhof" | frc/41 |
| graveyard, from | `aus deinem Friedhof` | | frc/55 |
| library | `Bibliothek` | | spg/159 |
| exile | `ins Exil` | | frc/37 |
| return to hand | `auf die Hand` | | mom/242 |
| command zone | `Kommandozone` | | frc/97 |

### Types

| English | On German cards | UI | Source |
| --- | --- | --- | --- |
| Artifact | `Artefakt` | | tdm/347 |
| Aura | `Aura` | | tdc/231 |
| Basic land | `Standardland` | | tdm/291 |
| Battle | `Schlacht` | | mom/242 |
| Creature | `Kreatur` | | tdm/425 |
| Dungeon | `Gewölbe` | | afc/326 |
| Enchantment | `Verzauberung` | | tdm/392 |
| Equipment | `Ausrüstung` | | fra/365 |
| Instant | `Spontanzauber` | | tdm/367 |
| Kindred | `Stammes-` | | dsc/61 |
| Land | `Land` | | tdm/397 |
| Legendary | `Legendär` | | tdm/376 |
| Nonbasic land | `Nichtstandardland` | | soc/184 |
| Permanent | `Permanent` | Cards until 2023 print "bleibende Karte" (mul/65) | frc/50 |
| Phenomenon | `Phänomen` | | who/582 |
| Plane | `Welt` | "Ebene" is the land Plains | who/600 |
| Planeswalker | `Planeswalker` | | tdm/398 |
| Saga | `Sage` | | tdm/391 |
| Scheme | `Komplott` | | dsc/367 |
| Snow | `Verschneit` | | mh3/439 |
| Sorcery | `Hexerei` | | tdm/368 |
| Token | `Spielstein` | Token | frc/99 |
| Vehicle | `Fahrzeug` | | drc/127 |

### Rules words

| English | On German cards | UI | Source |
| --- | --- | --- | --- |
| activated ability | `aktivierte` | | hob/246 |
| cast | `wirkst` | | frc/97 |
| clue | `Hinweis-Spielsteine` | | tle/190 |
| color identity | `Farbidentität` | | frc/22 |
| combat damage | `Kampfschaden` | | frc/96 |
| commander | `Commander` | | frc/22 |
| controller | `Beherrscher` | | frc/37 |
| counter (a spell) | `Neutralisiere` | Counterspell for the card role | spg/163 |
| counter (marker) | `+1/+1-Marke` | | fra/363 |
| destroy | `Zerstöre` | | frc/35 |
| discard | `abwirfst` | | frc/55 |
| draw a card | `Ziehe eine Karte` | | spg/164 |
| draw step | `Ziehsegment` | | spg/165 |
| end step | `Endsegment` | | spg/165 |
| food | `Speise-Spielstein` | | hoc/5 |
| life | `Lebenspunkt` | | frc/99 |
| mana cost | `Manakosten` | | who/600 |
| mana value | `Manabetrag` | Short form: MV | frc/50 |
| monarch | `Monarchen` | | frc/96 |
| owner | `Besitzers` | | mom/242 |
| sacrifice | `opfere` | | frc/99 |
| shuffle | `mische` | | spg/159 |
| spell | `Zauberspruch` | | hob/307 |
| tap | `tappe` | | ecl/344 |
| treasure | `Schatz-Spielstein` | | who/599 |
| triggered ability | `ausgelöste` | | spg/163 |
| untap | `enttappe` | | frc/71 |
| upkeep | `Versorgungssegment` | | frc/48 |
| venture into the dungeon | `wage dich ins Gewölbe` | | afc/326 |

### Keywords

| English | On German cards | UI | Source |
| --- | --- | --- | --- |
| Companion | `Gefährte` | Companion | ecc/125 |
| Crew | `Bemannen` | | hob/291 |
| Deathtouch | `Todesberührung` | | frc/92 |
| Defender | `Verteidiger` | | msh/57 |
| Double strike | `Doppelschlag` | | frc/96 |
| Eminence | `Eminenz` | | frc/97 |
| Enchant | `Verzaubert` | | spg/167 |
| First strike | `Erstschlag` | | fra/227 |
| Flash | `Aufblitzen` | | frc/94 |
| Flashback | `Rückblende` | | frc/27 |
| Flying | `Fliegend` | | frc/98 |
| Foretell | `Vorherbestimmung` | | tla/332 |
| Haste | `Eile` | | frc/96 |
| Hexproof | `Fluchsicher` | | hob/307 |
| Indestructible | `Unzerstörbar` | | frc/100 |
| Kicker | `Bonus` | | hob/205 |
| Landfall | `Landung` | Landfall in deckbuilding text | frc/2 |
| Lifelink | `Lebensverknüpfung` | | fra/321 |
| Magecraft | `Magiefertigkeit` | Magecraft in deckbuilding text | spg/150 |
| Menace | `Bedrohlich` | | fra/344 |
| Mill | `millen` | | fra/155 |
| Partner | `Partner` | | tmc/94 |
| Protection | `Schutz vor` | Protection for the card role | frc/19 |
| Reach | `Reichweite` | | fra/266 |
| Scry | `Hellsicht` | | fra/42 |
| Surveil | `Überwachen` | | spg/164 |
| Trample | `verursacht Trampelschaden` | | frc/19 |
| Vigilance | `Wachsamkeit` | | frc/2 |
| Ward | `Abwehr` | | fra/352 |

## Jargon

Project decisions, not printed on cards, so no source.

| Meaning | Use | Not |
| --- | --- | --- |
| a card's printing | Printing (das, Printings) | Druck, Version, Edition |
| mana value, short form | MV | MW, Mana |
| maybe zone | Maybeboard | Vielleicht, Vielleicht-Liste |
| board wipe | Boardwipe | Massenentfernung |
| spot removal | Spot Removal | Gezielte Entfernung |
| counterspell | Counterspell | Gegenzauber |
| card draw | Card Draw | Kartenzug |
| card advantage | Card Advantage | Kartenvorteil |
| fast mana | Fast Mana | Schnelles Mana |
| free interaction | Free Interaction | Kostenlose Interaktion |
| mana rock | Mana-Rock | Mana-Artefakt, Stein |
| mana dork | Mana-Dork | Mana-Kreatur |
| land ramp | Land-Ramp | Länder-Ramp |
| recursion | Recursion | Wiederbeschaffung |
| graveyard, artifact, ability hate | Graveyard Hate, Artifact Hate, Ability Hate | Friedhofshass, Artefakt-Hass |
| mass land denial | Mass Land Denial | Massenlandzerstörung: Blood Moon and Winter Orb destroy no land |
| staple | Staple | Standard |
| a cut | Cut | Kürzung |
| to cut | rausnehmen | cutten, kürzen, streichen, schneiden |
| threats | Threats | Bedrohungen |
| too many, too few lands | Flood, Screw | Geflutet, zu wenig Land |
| enters-the-battlefield trigger | ETB | Bei Eintritt |
| cast trigger | Cast-Trigger | Zauber-Trigger |
| held up mana | Held up | Offengehalten, Zurückgehalten |
| protection as a role | Protection, Proactive Protection | Schutz, Proaktiver Schutz |
| instant speed | Instant-Speed | |
| on the play | als Startspieler | auf dem Zug |
| shock land | Shockland | Schock-Land |
| combo | die Combo | das Combo |
| proxy | Proxy, Proxies | Proxys |
| the cardboard really in a deck | Physisches Deck | Deck-Sammlung |
| where a deck list and its Physical deck disagree | Abweichung | Drift, Unterschied |
| extra turn | Extrazug, Extrazüge | Extra-Zug |

These stay as they are, in German or English: Hauptdeck, Sideboard, Mulligan, Starthand, Ramp,
Removal, Tutor (Tutoren), Wincon, Finisher, Payoff, Stax, Game Changer, Foil, Bracket and its
names (Exhibition, Core, Upgraded, Optimized, cEDH), and the Drop sizes (2-Drop, 6+-Drops).

## No German source

These have no German printing on Scryfall or never appeared in the fetched text, so they stay
English until one turns up.

| Term | Use | Why |
| --- | --- | --- |
| Conspiracy | Conspiracy | No German printing on Scryfall |
| Vanguard | Vanguard | No German printing on Scryfall |
| Stack | Stack | No card text found that names it |

## Adding a term

Find a German printing that uses the term and cite it. Oracle text is always English, so read
`printed_text` and `printed_type_line`, for example:

```
https://api.scryfall.com/cards/search?q=keyword:ward+lang:de&order=released&dir=desc&unique=prints
```

- Read the newest printings first: older cards keep older wording.
- The newest sets often have no `printed_type_line`. Use an older set for types.
- Send a `User-Agent` and `Accept: application/json`, and leave about two seconds between
  requests. Eight requests a second ended in HTTP 429.
- No German printing: use the English term and list it under [No German source](#no-german-source).
