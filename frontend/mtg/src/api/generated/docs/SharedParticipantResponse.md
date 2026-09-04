
# SharedParticipantResponse

One redacted row of a shared tournament\'s roster  No uuid, no notes, no timestamps, no `has_decklist` — a type of its own rather than a redacted reuse of [`crate::http::handler_frontend::tournaments::schema::TournamentParticipantResponse`], so this public surface cannot grow such a field by accident: adding one here is a deliberate, visible edit to this struct, never a forgotten redaction somewhere else.

## Properties

Name | Type
------------ | -------------
`display_name` | string
`is_guest` | boolean
`status` | [ParticipantStatus](ParticipantStatus.md)


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


