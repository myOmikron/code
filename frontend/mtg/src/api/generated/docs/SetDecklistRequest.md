
# SetDecklistRequest

Request to write, replace or clear a participant\'s decklist  Both fields absent clears the list; both present is refused as [`DecklistErrors::invalid_decklist`] — a request names at most one source.

## Properties

Name | Type
------------ | -------------
`deck` | string
`text` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


