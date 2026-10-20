# The Deck history only grows and stores differences

A deck's Deck history is append-only: undo, redo and resetting to an earlier point are Deck changes of their own, and nothing is ever cut from the history while the deck exists. Each Deck change stores only its difference, and an earlier state is computed backwards from the current deck. Resetting a reset, undoing across devices days later and keeping Deck checkpoints valid all fall out of this, and storing differences keeps a 100-card Commander deck edited click by click small.

This rests on Deck entries being unique per printing, zone, foil and proxy: a difference names the entry it changes by those four, so two alike entries side by side would make it ambiguous. Edits that would create such a pair merge them instead, and the migration that introduces the history merges existing duplicates first.

## Considered Options

- A full copy of the deck after every Deck change: simpler to read back, but many times the storage for decks edited one click at a time.
- Cutting off the redo branch or the changes after a reset, like an editor's undo stack: a reset could then not be undone, and a Deck checkpoint could vanish with the branch it sat on.

## Consequences

- Shortening the history is only safe from the start forward, never from the middle; today it is kept for as long as the deck exists.
- A deck that existed before Deck histories starts with one Deck change holding its state at that time, which cannot be reset past.
