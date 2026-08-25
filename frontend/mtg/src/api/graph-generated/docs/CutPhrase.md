
# CutPhrase

A cut reason: a Phrase whose code is drawn from the closed set.  A separate subclass, not a narrowing of `Phrase.code` itself — `Phrase` is the shared schema component `SuggestionReport.notes` also uses, and those notes carry free-form codes.

## Properties

Name | Type
------------ | -------------
`code` | [CutCode](CutCode.md)
`params` | { [key: string]: string | undefined; }
`text` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


