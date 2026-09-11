
# TournamentSettingsRequest

The editable shape of a tournament, shared by [`CreateTournamentRequest`] and [`super::handler::update_tournament`]  One type for both requests: an update sends exactly the same fields a create does, minus [`Visibility`] (which has its own endpoint and its own audit action). Validated in the handler against [`TournamentSettingsErrors`].

## Properties

Name | Type
------------ | -------------
`allow_late_entry` | boolean
`decklist_policy` | [DecklistPolicy](DecklistPolicy.md)
`description` | string
`format` | string
`games_per_match` | number
`guest_names_public` | boolean
`late_entry_as_losses` | boolean
`max_participants` | number
`name` | string
`pairing_system` | [PairingSystem](PairingSystem.md)
`participant_audience` | [ParticipantAudience](ParticipantAudience.md)
`planned_rounds` | number
`pod_size` | number
`points_bye` | number
`points_draw` | number
`points_loss` | number
`points_win` | number
`round_minutes` | number
`starts_at` | string
`venue` | string
`venue_address` | string
`venue_instructions` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


