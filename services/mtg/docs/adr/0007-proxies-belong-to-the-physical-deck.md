# Proxies belong to the Physical deck, not to the deck list

A deck list says what a deck should be, its Physical deck what is really in the box, and the Deviation between them is what the owner works through. Whether a copy is a Proxy is a fact about the cardboard, so it lives in the Physical deck: a Deck entry carries no proxy flag, and a Proxy is a stand-in filed in the Physical deck without a collection it came from. A Proxy fulfils its Deck entry, adds nothing to the Physical value, and stays a card worth buying. The Physical deck is stored as the deck's own collection, hidden from the shelf, so real cards in a deck stay one inventory with the rest; Proxies are filtered out wherever cards are counted or valued.

## Considered Options

- **Keep the proxy flag on the Deck entry**: one place for list and plan, but it mixes "I will proxy this" with "a Proxy is in the box", and a Physical deck beside it would say a second, disagreeing thing about the same copies. That double truth is what made the deck collection hard to follow.
- **A planning mark on the list next to the Physical deck**: the old flag under a new name, with the same double truth.
- **A table of its own for the Physical deck**: a cleaner name, but stock, search, loans and statistics would have to join two inventories.

## Consequences

- Existing proxy Deck entries become Proxies in the deck's Physical deck, which is created for them; they merge with an equal non-proxy Deck entry. Old Deck changes keep their stored flag, and a reset ignores it.
- The Deck history does not record the Physical deck, so an undo never moves cardboard (ADR 0001).
- A Registered deck records how many copies of each Deck entry are Proxies when it becomes a copy, so a Tournament's Proxy rule can be checked against it (ADR 0002).
- Viewers, Share links and public decks never see Proxies; an Editor sees the Physical deck but does not change it.
