
# ClaimErrors

Why a claim-token action was refused  Shared by [`super::handler::claim_tournament_participant`] (which can also answer [`Self::already_registered`]) and, unauthenticated, by [`crate::http::handler_frontend::join::handler::look_up_claim_token`] and [`crate::http::handler_frontend::join::handler::reattach_claim_token`] — the latter two only ever set [`Self::invalid_token`], since there is no account on a guest request for [`Self::already_registered`] to describe.

## Properties

Name | Type
------------ | -------------
`already_registered` | boolean
`invalid_token` | boolean


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


