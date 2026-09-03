
# JoinTournamentRequest

Request to join by code as a logged-in account  `deck` and `decklist_text` are mutually exclusive — both present answers [`JoinErrors::invalid_decklist`]; both absent is fine unless the tournament\'s [`Tournament::needs_decklist_to_register`](crate::models::tournament::Tournament::needs_decklist_to_register) says otherwise.

## Properties

Name | Type
------------ | -------------
`deck` | string
`decklist_text` | string
`display_name` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


