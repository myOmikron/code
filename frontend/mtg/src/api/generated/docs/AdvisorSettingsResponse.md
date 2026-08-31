
# AdvisorSettingsResponse

One reader\'s advisor settings for one deck  The same six fields as [`SetAdvisorSettingsRequest`] — a settings document is the same document going in and coming out. Two named types rather than one reused so the generated client names request and response separately.

## Properties

Name | Type
------------ | -------------
`ignored` | [Array&lt;MarkedCard&gt;](MarkedCard.md)
`kept` | [Array&lt;MarkedCard&gt;](MarkedCard.md)
`pool_query` | string
`setup_done` | boolean
`targets` | [DeckTargets](DeckTargets.md)
`themes` | [ThemePrefs](ThemePrefs.md)


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


