# Check-in gates pairing like Paid and never freezes the Registered deck

A Tournament may ask for Check-in, optionally with a Registered deck for Accounts. Organizers check Participants in at the desk, and a Participant not checked in is left out of the pairing the way an unpaid one is: it stays on the roster, counts towards the participant limit and is paired from the next Round once checked in. Nobody is removed or Dropped for missing the check-in, so an Organizer who forgot someone fixes it with one click instead of re-adding a Participant. The rule is fixed once the first Round started, like the entry fee, because changing it would pair or leave out Participants at once.

Checking in records presence only. The Registered deck keeps following its deck until the first Round starts (ADR 0002); with a deck required, checking in only asks that one is registered. Guests cannot have a Registered deck, so Organizers check them in without one; whether a Guest was checked in without a deck follows from the Guest, the flag and the rule, and is not stored.

## Considered Options

- **Drop who is not checked in when the first Round starts**: fewer flags, but a late arrival would be a Drop that can never be undone, and Rounds after the first would need their own rule.
- **Pin the Registered deck at check-in**: a fixed list from the desk on, but last-minute tuning before the first Round would no longer count, against ADR 0002.

## Consequences

- Once the first Round started, a Participant is checked in but no longer out: leaving then is a Drop.
- Removing a Registered deck after checking in leaves the Participant checked in; the desk sees the missing deck on the roster.
- Checking in or out discards a previewed Round, like marking a Participant paid.
