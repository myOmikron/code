
# Phrase

A sentence the backend composes and a UI is free to word itself.  `text` is the English rendering and stays authoritative for anything with no translations to reach for — `cli.py` prints these, and a consumer given a bare key instead of a sentence is worse off than one given English. `code` and `params` are what a localised frontend uses instead; an unknown code falls back to `text` rather than rendering a key at the reader.  Codes are stable identifiers, kebab-case, and must not be recycled: the frontend keys off them, so reusing one for a different sentence silently mistranslates rather than failing.

## Properties

Name | Type
------------ | -------------
`code` | string
`params` | { [key: string]: string | undefined; }
`text` | string


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


