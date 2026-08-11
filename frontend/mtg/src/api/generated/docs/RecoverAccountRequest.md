
# RecoverAccountRequest

Request a fresh registration link for an existing account  The \"lost passkey\" flow. Deliberately no response and no errors: whether the username exists must not be readable from the answer, so the endpoint says `200` either way and sends mail only where there is an account.

## Properties

Name | Type
------------ | -------------
`language` | [MailLanguage](MailLanguage.md)
`username` | any


[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


