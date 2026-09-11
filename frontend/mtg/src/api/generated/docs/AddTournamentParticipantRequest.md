
# AddTournamentParticipantRequest

Request to put a player on the roster from the desk  Two shapes in one request: with `account` the row belongs to that account from the start — the organizer looked the player up because their phone was dead — and `display_name` is optional, defaulting to the username. Without it the row is a guest a name was typed for, claimable later by QR.

## Properties

Name | Type
------------ | -------------
`account` | string
`decklist_text` | string
`display_name` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


