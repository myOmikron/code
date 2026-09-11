
# TournamentResponse

A tournament, as an actor may see it  [`Self::share_token`] and [`Self::join_code`] are organizer-only secrets: see [`Self::from_parts`].

## Properties

Name | Type
------------ | -------------
`allow_late_entry` | boolean
`created_at` | string
`decklist_policy` | [DecklistPolicy](DecklistPolicy.md)
`decklists_locked_at` | string
`description` | string
`finished_at` | string
`format` | string
`games_per_match` | number
`guest_names_public` | boolean
`join_code` | string
`join_code_expires_at` | string
`late_entry_as_losses` | boolean
`max_participants` | number
`name` | string
`owner` | string
`pairing_system` | [PairingSystem](PairingSystem.md)
`participant_audience` | [ParticipantAudience](ParticipantAudience.md)
`planned_rounds` | number
`pod_size` | number
`points_bye` | number
`points_draw` | number
`points_loss` | number
`points_win` | number
`round_minutes` | number
`share_token` | string
`starts_at` | string
`status` | [TournamentStatus](TournamentStatus.md)
`uuid` | string
`venue` | string
`venue_address` | string
`venue_instructions` | string
`visibility` | [Visibility](Visibility.md)


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


