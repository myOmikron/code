
# CardFinish

Finish of a physical card, mirroring Scryfall\'s `finishes`  These three are the complete set — Scryfall documents `finishes` as exactly `nonfoil`, `foil` and `etched`, and prices it accordingly (`eur`/`eur_foil`, `usd`/`usd_foil`/`usd_etched`).  Special treatments such as surge, textured, galaxy or neon ink are **not** finishes: they live in Scryfall\'s `promo_types`/`frame_effects` and get their own collector number, hence their own printing id. Adding them here would encode the same fact twice and allow combinations that cannot exist. A finish only ever describes what varies *within* one printing.

## Properties

Name | Type
------------ | -------------


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


