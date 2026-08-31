
# SetAdvisorSettingsRequest

Request to replace a deck\'s advisor settings  Whole-document, not per-field: every writer today (ignoring a card, dragging a corridor, pinning a theme) already rewrites its own slice of this, so a `PATCH` per field would buy nothing.  `pool_query` is a plain string here rather than [`MaxStr`] like everywhere else in this document: the handler trims it and turns an empty result into `None` before it becomes the bounded type, so the length that is actually checked is the trimmed one.

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


