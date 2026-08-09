
# SignupErrors

Why a signup request was rejected, for the form to show on the offending field  Only the username is ever reported: profiles are reachable by name, so whether one is taken is public anyway. Whether an *email address* is already in use stays unrevealable — that request still answers `200` and simply sends no mail.

## Properties

Name | Type
------------ | -------------
`email_malformed` | boolean
`username_taken` | boolean


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


