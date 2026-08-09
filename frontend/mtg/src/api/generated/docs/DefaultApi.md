# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**deletePasskey**](DefaultApi.md#deletepasskey) | **DELETE** /api/frontend/v1/accounts/passkeys/{uuid} | Delete one of the logged-in account\&#39;s passkeys |
| [**finishAddPasskey**](DefaultApi.md#finishaddpasskeyoperation) | **POST** /api/frontend/v1/accounts/passkeys/finish | Finish registering another passkey for the logged-in account |
| [**finishLogin**](DefaultApi.md#finishloginoperation) | **POST** /api/frontend/v1/auth/login/finish | Finish a passkey login |
| [**finishRegistration**](DefaultApi.md#finishregistrationoperation) | **POST** /api/frontend/v1/auth/register/finish | Finish a passkey registration |
| [**listPasskeys**](DefaultApi.md#listpasskeys) | **GET** /api/frontend/v1/accounts/passkeys | List the passkeys of the logged-in account |
| [**logout**](DefaultApi.md#logout) | **GET** /api/frontend/v1/auth/logout | Log out, dropping the session |
| [**me**](DefaultApi.md#me) | **GET** /api/frontend/v1/accounts/me | The account the current session belongs to |
| [**signup**](DefaultApi.md#signupoperation) | **POST** /api/frontend/v1/auth/signup | Sign up for a new account |
| [**startAddPasskey**](DefaultApi.md#startaddpasskey) | **POST** /api/frontend/v1/accounts/passkeys/start | Start registering another passkey for the logged-in account |
| [**startLogin**](DefaultApi.md#startloginoperation) | **POST** /api/frontend/v1/auth/login/start | Start a passkey login for a given username |
| [**startRegistration**](DefaultApi.md#startregistrationoperation) | **POST** /api/frontend/v1/auth/register/start | Start a passkey registration |



## deletePasskey

> FormErrorResponseForDeletePasskeyErrors deletePasskey(uuid)

Delete one of the logged-in account\&#39;s passkeys

Delete one of the logged-in account\&#39;s passkeys  The last one cannot be deleted: with no passkey left there is no way back into the account, and the invite flow only issues a token while an account has none — which this would not restore, since the account still exists.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeletePasskeyRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeletePasskeyRequest;

  try {
    const data = await api.deletePasskey(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**FormErrorResponseForDeletePasskeyErrors**](FormErrorResponseForDeletePasskeyErrors.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finishAddPasskey

> FormErrorResponseForAddPasskeyErrors finishAddPasskey(FinishAddPasskeyRequest)

Finish registering another passkey for the logged-in account

Finish registering another passkey for the logged-in account

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FinishAddPasskeyOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // FinishAddPasskeyRequest (optional)
    FinishAddPasskeyRequest: ...,
  } satisfies FinishAddPasskeyOperationRequest;

  try {
    const data = await api.finishAddPasskey(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **FinishAddPasskeyRequest** | [FinishAddPasskeyRequest](FinishAddPasskeyRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAddPasskeyErrors**](FormErrorResponseForAddPasskeyErrors.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finishLogin

> FormErrorResponseForFinishLoginErrors finishLogin(FinishLoginRequest)

Finish a passkey login

Finish a passkey login  Verifies the browser\&#39;s credential and logs the account in.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FinishLoginOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // FinishLoginRequest (optional)
    FinishLoginRequest: ...,
  } satisfies FinishLoginOperationRequest;

  try {
    const data = await api.finishLogin(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **FinishLoginRequest** | [FinishLoginRequest](FinishLoginRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForFinishLoginErrors**](FormErrorResponseForFinishLoginErrors.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finishRegistration

> FormErrorResponseForRegistrationErrors finishRegistration(FinishRegistrationRequest)

Finish a passkey registration

Finish a passkey registration

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FinishRegistrationOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // FinishRegistrationRequest (optional)
    FinishRegistrationRequest: ...,
  } satisfies FinishRegistrationOperationRequest;

  try {
    const data = await api.finishRegistration(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **FinishRegistrationRequest** | [FinishRegistrationRequest](FinishRegistrationRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForRegistrationErrors**](FormErrorResponseForRegistrationErrors.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listPasskeys

> ListPasskeysResponse listPasskeys()

List the passkeys of the logged-in account

List the passkeys of the logged-in account

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListPasskeysRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listPasskeys();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ListPasskeysResponse**](ListPasskeysResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## logout

> logout()

Log out, dropping the session

Log out, dropping the session

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LogoutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.logout();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## me

> MeResponse me()

The account the current session belongs to

The account the current session belongs to

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { MeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.me();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**MeResponse**](MeResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## signup

> Signup200Response signup(SignupRequest)

Sign up for a new account

Sign up for a new account  Reports a taken username back to the form — profiles are reachable by name, so that is public information anyway. Everything else answers &#x60;200&#x60; whether or not anything was created, so the response cannot be used to probe which email addresses are in use.  A link is only ever sent to the address stored on the account, never to the one in the request, so this endpoint cannot be used to mail a third party.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SignupOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SignupRequest (optional)
    SignupRequest: ...,
  } satisfies SignupOperationRequest;

  try {
    const data = await api.signup(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **SignupRequest** | [SignupRequest](SignupRequest.md) |  | [Optional] |

### Return type

[**Signup200Response**](Signup200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startAddPasskey

> StartAddPasskeyResponse startAddPasskey()

Start registering another passkey for the logged-in account

Start registering another passkey for the logged-in account  This is how a second device is added. Unlike the invite flow it needs no token — proving the session is proof enough, and the account already exists.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { StartAddPasskeyRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.startAddPasskey();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**StartAddPasskeyResponse**](StartAddPasskeyResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startLogin

> StartLogin200Response startLogin(StartLoginRequest)

Start a passkey login for a given username

Start a passkey login for a given username  The account\&#39;s passkeys are sent as the credential allow-list. Registration asks for &#x60;residentKey: discouraged&#x60;, so the credentials are not necessarily discoverable by the authenticator on its own — it has to be told which ones to look for.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { StartLoginOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // StartLoginRequest (optional)
    StartLoginRequest: ...,
  } satisfies StartLoginOperationRequest;

  try {
    const data = await api.startLogin(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **StartLoginRequest** | [StartLoginRequest](StartLoginRequest.md) |  | [Optional] |

### Return type

[**StartLogin200Response**](StartLogin200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startRegistration

> StartRegistration200Response startRegistration(StartRegistrationRequest)

Start a passkey registration

Start a passkey registration

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { StartRegistrationOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // StartRegistrationRequest (optional)
    StartRegistrationRequest: ...,
  } satisfies StartRegistrationOperationRequest;

  try {
    const data = await api.startRegistration(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **StartRegistrationRequest** | [StartRegistrationRequest](StartRegistrationRequest.md) |  | [Optional] |

### Return type

[**StartRegistration200Response**](StartRegistration200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

