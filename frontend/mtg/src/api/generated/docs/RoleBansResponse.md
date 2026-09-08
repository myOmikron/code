
# RoleBansResponse

The cards a format bans from a zone rather than from the deck  A card banned outright is simply not in `legal_formats`, which the catalog answers per printing. These cannot be answered there: the same card is legal in the ninety-nine and illegal in the command zone, so the question is about where it sits and only the deck knows that. Every list is empty for a format that bans nothing this way, which today is every format but Archon.

## Properties

Name | Type
------------ | -------------
`commander` | Array&lt;string&gt;
`companion` | Array&lt;string&gt;
`pairings` | Array&lt;Array&lt;string&gt;&gt;
`partner` | Array&lt;string&gt;


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


