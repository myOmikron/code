
# TimerResponse

A round\'s clock, with the server\'s own reading of the time beside it  One struct rather than two sibling fields, so that serialising a deadline without the reference point it is measured against is not expressible. A phone with a wrong clock is the normal case, not the exception.

## Properties

Name | Type
------------ | -------------
`ends_at` | string
`length_seconds` | number
`paused_at` | string
`remaining_seconds` | number
`state` | [TimerStateResponse](TimerStateResponse.md)


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


