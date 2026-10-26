# Live updates go through an in-process hub

A Tournament's live updates reach its readers as Server-Sent Events from a hub inside the webserver process: one broadcast channel per followed Tournament, fed by every route that changes it once its transaction is committed. Events are not stored; a reader that connects late or falls behind fetches the current state again. We chose this because mtg runs one webserver instance, and the hub needs no broker, no schema and no delivery guarantees beyond "something changed, read it again".

## Consequences

- It only works while there is exactly one webserver instance. A second instance would never see the events the first one emits, and its readers would miss changes until they reload. Scaling out needs a fan-out between instances first, over NATS, which mtg already runs: each instance publishes the events it emits on a Tournament subject and feeds what it receives into its own hub.
- A restart drops every open stream; the browser reconnects and fetches the current state, so nothing is lost but the moment of the change.
