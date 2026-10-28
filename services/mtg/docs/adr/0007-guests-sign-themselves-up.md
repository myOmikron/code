# Guests sign themselves up and hold their Guest seat in the session

A Tournament may let people without an Account sign up as Guests: the Owner turns on Guest sign-up next to Self sign-up, and a visitor who is not logged in gives a name on the Tournament's page or its share link and becomes a Participant at once. The device holds that Guest through a **Guest seat** in its session, the same database-backed session a login lives in. Nothing about the seat is a bearer secret in the browser: the session cookie is the only proof, as it is for an Account.

Sessions end after 24 hours without a request, and a phone may lose its cookies. For that the sign-up answers a **Recovery code** once, in the response body, which the device keeps. Posting the Participant and the code from a fresh session restores the seat into it. Only the code's SHA-256 is stored on the Participant; it travels in request and response bodies only, never in a URL, so it never lands in an access log. The codes of a Tournament are wiped when it is Finished or Cancelled; taking back its last Round does not bring them back. Repeating the sign-up in a session that already holds a seat for the Tournament creates no second Guest: it answers the seat it holds, with a fresh code that replaces the old one, so a double tap or a retried request after a lost answer still leaves the device with a working code.

Guest sign-up needs Self sign-up, a public or unlisted Tournament and Check-in. Anybody can claim any name, and a Guest owes nothing to anybody, so the desk confirms every person before it is paired (ADR 0006): a Guest that signed up but never showed up is left out of the pairing like any Participant not checked in. The participant limit counts Guests, and sign-up closes when the first Round starts, as for Accounts.

This amends ADR 0003. The Participant route group now admits a caller that plays in the Tournament as an Account or through a Guest seat, and sits outside the login check: reading its own Match, reporting and disputing a Result, Dropping and withdrawing the sign-up. What only an Account can have stays in a group of its own that needs a login and the Account's own participation: the Registered deck, Tournament pushes, the Life history and the Account's Self sign-up. A seat counts only in the Tournament it was taken in, and an Account that plays in a Tournament is never treated as a Guest there; an Account that does not play in it but holds a seat in its session acts through the seat.

## Considered Options

- **A permanent claim token in the browser** (our first attempt): one secret for reattaching the device, claiming the Guest for an Account and the desk's QR code, stored in plain text, sent in URL paths and kept forever in local storage. Anybody who saw it, a staff member reading it off the desk included, could act as the Guest for good, and the session and local storage were two records of the same thing that drifted apart.
- **Local storage only, no session**: every request would carry the secret, and a request without it would be refused for a device that just signed up.
- **Requiring an Account**: no new access path, but a walk-in player at a store event will not create an Account to play one evening.

## Consequences

- A Guest seat lives in its session: logging in keeps it, logging out ends it, and a session holds at most 16 of them, dropping the Tournaments that are over whenever it takes a new one.
- Losing the session and the Recovery code together leaves the Guest to the Organizers, who report and Drop for it as for a Guest they added.
- Sign-up and recovery are rate-limited per IP address, sized for a store where every player shares one address, and Guest sign-ups are capped per Tournament, so one address cannot fill a Tournament and the participant limit still holds for everybody else.
- Guest names stay as public as every Participant's name is today. Hiding them from people outside the Tournament is a follow-up.

## Addendum: Claim and Seat links

An Account whose session holds a Guest seat can **Claim** the Guest. The Participant row takes the Account's key, the one a Participant of an Account always has, so the Account is found in the Tournament like any other; every foreign key to the row cascades on update, so Seats, reported and disputed Results and a Registered deck follow it. The Guest's name, Recovery code and Seat link go, and so does the seat. It is the reverse of a Deletion, which turns an Account's Participants into Guests and keeps their keys.

A Guest that lost its device and its Recovery code gets a **Seat link** from the desk: a random secret, of which only the hash is kept, good for one use within 15 minutes, and replaced by the next one issued. The secret sits in the fragment of the link, which no browser sends to a server, and the page posts it in a request body. Redeeming it needs no Tournament in the path: the secret names the Guest and is the authorization, as a share link's token is, so it works for a Tournament of any Visibility. Redeeming answers a new Recovery code. Seat links are forgotten with the Recovery codes once the Tournament is over.

- Creating an Account goes through a mailed Registration link, so a Guest that signs up for an Account leaves the Tournament's page. When it comes back logged in, the Recovery code its device kept restores the seat and the Claim is offered there.
