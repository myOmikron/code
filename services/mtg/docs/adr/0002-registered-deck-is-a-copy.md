# A Registered deck is a copy taken when the first Round starts

A Registered deck follows its deck until the first Round of the Tournament starts (for a late Participant, until it joins). At that moment it copies the deck's Deck entries into the Tournament, and from then on the copy never changes with the deck. A Deck checkpoint named after the Tournament marks the same point in the deck's Deck history, for the deck owner's convenience only. The record of what was played has to hold for as long as the Tournament exists, and nothing on the deck's side does: the deck can be edited, deleted or handed to the Tombstone, and its Deck history and Deck checkpoints belong to the deck owner (ADR 0001).

## Considered Options

- **A link to the deck, read live**: no storage, but the list shown for a Finished Tournament would be whatever the deck holds today, and gone once the deck is deleted.
- **A link to a Deck change in the Deck history**: no copy, but the Deck history is dropped when the deck is deleted or handed to the Tombstone, and only the owner sees it. A Deck checkpoint can be renamed or removed by the owner, so the Tournament cannot rest on one either.
- **A copy taken at registration**: simple, but last-minute tuning between signing up and the first Round would not count.

## Consequences

- One copy of the Deck entries per Registered deck: about 100 entries for a Commander deck. Cards are named by their printings, which stay in the catalog.
- An Organizer swapping a Registered deck after the first Round started takes a new copy at that moment and sets a new Deck checkpoint.
- Renaming or removing the Deck checkpoint, editing the deck or deleting it leaves the Registered deck as it is.
