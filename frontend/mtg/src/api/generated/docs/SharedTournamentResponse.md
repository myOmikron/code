
# SharedTournamentResponse

A tournament as the holder of its share link sees it  Event header and roster only: no decklists (`decklist_audience`/ `decklist_reveal` stay for a milestone that actually has rounds to hide), no standings (M3), no room display (M2), and none of the organizer-only fields [`crate::models::tournament::Tournament`] carries — a type of its own rather than a redacted [`crate::http::handler_frontend::tournaments::schema::TournamentResponse`], the same reasoning as [`SharedParticipantResponse`]. `participant_count` is the true count and is never redacted by the roster view — an event may advertise its size while keeping names to itself; `roster_available` says whether [`super::handler::list_shared_tournament_participants`] has anything to answer for this link at all.

## Properties

Name | Type
------------ | -------------
`description` | string
`format` | string
`max_participants` | number
`name` | string
`participant_count` | number
`pod_size` | number
`roster_available` | boolean
`starts_at` | string
`status` | [TournamentStatus](TournamentStatus.md)
`venue` | string
`venue_address` | string
`venue_instructions` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


