
# UpdateWatchListEntryRequest

Request to change some of an entry\'s fields, leaving the rest alone  Anything the alarm reads disarms it when it changes: the stored alarm is a comparison between one price and one threshold, and once either side moves it no longer describes anything. The next catalog sync sets it again if it still holds.

## Properties

Name | Type
------------ | -------------
`alarm_price_cents` | number
`exact_printing` | boolean
`finish` | [CardFinish](CardFinish.md)
`match_finish` | boolean
`note` | string
`printing` | string
`wanted` | number


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


