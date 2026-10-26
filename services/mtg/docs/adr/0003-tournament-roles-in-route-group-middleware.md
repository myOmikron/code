# Tournament roles are checked by the route group's middleware

Every route on one Tournament sits in one of four route groups, named after the part its caller has to play there: Owner, Organizer (the Owner or a Co-organizer), Participant (the Account plays in it) or Viewer (it may see the Tournament, logged in or not). Each group is wrapped in a `TournamentAccessLayer` that reads the `{tournament}` path segment, fetches the Tournament, refuses a caller without that part as if the Tournament did not exist, and hands the handler the Tournament it fetched (`TournamentGrant`), so the handler neither checks a role nor fetches the Tournament again. We chose this because `CODING_STANDARDS.md` puts auth in the route groups' middleware, never in per-handler checks: with roles checked in each handler, a forgotten check is a hole nobody sees in review, while a route in the wrong group is visible in the group lists.

Whether a Match is the caller's own, whether a Co-organizer may take off another, and similar questions about one row stay in the models: they are not roles but rules of the operation. Routes on no Tournament in particular (the overview, creating one, "my Tournaments", answering a handover offer, where the offer is the check) need a logged-in Account only. Reading by share link keeps its own routes, where the link is the authorization.

## Considered Options

- **Per-handler checks** (`get_as_organizer`, `get_as_owner` in every handler): what the Tournaments started with; it put auth in the handlers and repeated the same refusal in some forty places.
- **A middleware that only checks and lets the handler fetch again**: simple, but every request would read the Tournament twice.

## Consequences

- A handler that writes still takes the Tournament afresh under its row lock (`Tournament::lock_for_update`), so what it acts on is what the last writer left. The role was checked a moment earlier, outside that lock: a Co-organizer removed between the check and the lock can still finish the one request it sent. We accept that window over holding a transaction open across the middleware and the handler.
- Handlers keep their `Path` extractor for the `{tournament}` segment, unused, so the OpenAPI spec and the generated client still name the parameter.
- A caller without the part gets the same `400 No such tournament` whether the Tournament is missing, private or simply not theirs.
