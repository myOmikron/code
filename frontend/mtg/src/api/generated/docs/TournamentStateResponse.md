
# TournamentStateResponse

What a client polls to know whether anything moved  Deliberately cheap: a handful of indexed reads and no standings, because every phone in the room hits it on a timer.

## Properties

Name | Type
------------ | -------------
`outstanding_tables` | number
`planned_rounds` | number
`revision` | string
`round` | [RoundResponse](RoundResponse.md)
`server_time` | string
`status` | [TournamentStatus](TournamentStatus.md)


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


