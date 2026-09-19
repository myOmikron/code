
# ComboRule

How much combo play a bracket tolerates  One step further than [`ExtraTurnRule`], because the published rules run one step further: Exhibition states \"no intentional infinite combos\", which is stricter than Core\'s \"none of two cards\", so a deck holding a three card line sits in Core rather than in Exhibition.  Upgraded is the fourth step. Its rule is not \"no two card combos\" and not \"any\" either — it bars the ones that go off in the early game, and the guidance behind it turns on how often a deck can assemble the pair before the table has a game, which is a fact about ramp and tutors and draw rather than about either card. Summing the pieces\' mana values would be a threshold this cannot defend: the eight mana Notary Hobbits and Umbral Mantle ask for is a turn four play in a deck with dorks, and a turn nine one without them.  So it is stated as the condition it is, and the client reads a deck holding a two card line as neither inside the bracket nor outside it. The alternative — the [`ComboRule::Any`] this used to carry — answered the question by not asking it, and told a deck with a two card infinite that it kept a rule written to catch exactly that.

## Properties

Name | Type
------------ | -------------


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


