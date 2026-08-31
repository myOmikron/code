
# UpdateCollectionEntryRequest

Request to change some of a stack\'s fields  Every field is optional and an omitted one is left alone. The two nullable ones are wrapped twice so that `null` can mean \"clear this\": with a single `Option` a cleared price and an untouched one arrive as the same value.

## Properties

Name | Type
------------ | -------------
`acquired_at` | string
`condition` | [CardCondition](CardCondition.md)
`finish` | [CardFinish](CardFinish.md)
`printing` | string
`purchase_price_cents` | number
`quantity` | number
`signed` | boolean


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


