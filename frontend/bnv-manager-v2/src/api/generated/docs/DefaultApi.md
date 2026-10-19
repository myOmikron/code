# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acceptInvite**](DefaultApi.md#acceptinvite) | **POST** /api/v1/frontend/invite/{uuid}/accept |  |
| [**associateDomain**](DefaultApi.md#associatedomainoperation) | **POST** /api/v1/frontend/admin/clubs/{uuid}/domains/associate |  |
| [**auth**](DefaultApi.md#auth) | **GET** /api/v1/auth/auth | The authorization endpoint |
| [**createClub**](DefaultApi.md#createcluboperation) | **POST** /api/v1/frontend/admin/clubs |  |
| [**createInvite**](DefaultApi.md#createinvite) | **POST** /api/v1/frontend/admin/invites |  |
| [**createMemberInvite**](DefaultApi.md#creatememberinviteoperation) | **POST** /api/v1/frontend/club-admin/clubs/{club_uuid}/invites |  |
| [**createOidcClient**](DefaultApi.md#createoidcclientoperation) | **POST** /api/v1/frontend/admin/oidc-clients | Register a new OIDC client |
| [**deleteClub**](DefaultApi.md#deleteclub) | **DELETE** /api/v1/frontend/admin/clubs/{uuid} |  |
| [**deleteClubAdmin**](DefaultApi.md#deleteclubadmin) | **DELETE** /api/v1/frontend/admin/accounts/club-admins/{uuid} |  |
| [**deleteMember**](DefaultApi.md#deletemember) | **DELETE** /api/v1/frontend/club-admin/clubs/{club_uuid}/members/{member_uuid} |  |
| [**deleteOidcClient**](DefaultApi.md#deleteoidcclient) | **DELETE** /api/v1/frontend/admin/oidc-clients/{uuid} | Delete an OIDC client |
| [**discovery**](DefaultApi.md#discovery) | **GET** /api/v1/auth/.well-known/openid-configuration | The OpenID provider\&#39;s metadata (OpenID Connect Discovery 1.0) |
| [**extendInviteExpiry**](DefaultApi.md#extendinviteexpiry) | **POST** /api/v1/frontend/admin/invites/{uuid}/extend-expiry |  |
| [**extendInviteExpiryAsClubAdmin**](DefaultApi.md#extendinviteexpiryasclubadmin) | **POST** /api/v1/frontend/club-admin/clubs/{club_uuid}/invites/{invite_uuid}/extend-expiry |  |
| [**finishAuth**](DefaultApi.md#finishauth) | **GET** /api/v1/auth/finish-auth | Issue the authorization code for the pending authorization request and redirect to the client |
| [**getAllOidcClients**](DefaultApi.md#getalloidcclients) | **GET** /api/v1/frontend/admin/oidc-clients | Retrieve all registered OIDC clients |
| [**getAllSuperadmins**](DefaultApi.md#getallsuperadmins) | **GET** /api/v1/frontend/admin/accounts/superadmins |  |
| [**getClub**](DefaultApi.md#getclub) | **GET** /api/v1/frontend/admin/clubs/{uuid} |  |
| [**getClubAdminInvites**](DefaultApi.md#getclubadmininvites) | **GET** /api/v1/frontend/admin/clubs/{uuid}/admins/invites |  |
| [**getClubAdmins**](DefaultApi.md#getclubadmins) | **GET** /api/v1/frontend/admin/clubs/{uuid}/admins |  |
| [**getClubAsClubAdmin**](DefaultApi.md#getclubasclubadmin) | **GET** /api/v1/frontend/club-admin/clubs/{club_uuid}/club |  |
| [**getClubDomains**](DefaultApi.md#getclubdomains) | **GET** /api/v1/frontend/admin/clubs/{uuid}/domains |  |
| [**getClubMemberInvites**](DefaultApi.md#getclubmemberinvites) | **GET** /api/v1/frontend/admin/clubs/{uuid}/members/invites |  |
| [**getClubMemberInvitesAsClubAdmin**](DefaultApi.md#getclubmemberinvitesasclubadmin) | **GET** /api/v1/frontend/club-admin/clubs/{club_uuid}/club/members/invites |  |
| [**getClubMembers**](DefaultApi.md#getclubmembers) | **GET** /api/v1/frontend/admin/clubs/{uuid}/members |  |
| [**getClubMembersAsClubAdmin**](DefaultApi.md#getclubmembersasclubadmin) | **GET** /api/v1/frontend/club-admin/clubs/{club_uuid}/club/members |  |
| [**getClubs**](DefaultApi.md#getclubs) | **GET** /api/v1/frontend/admin/clubs |  |
| [**getDashboardStats**](DefaultApi.md#getdashboardstats) | **GET** /api/v1/frontend/admin/clubs/{uuid}/dashboard-stats |  |
| [**getDashboardStatsAsClubAdmin**](DefaultApi.md#getdashboardstatsasclubadmin) | **GET** /api/v1/frontend/club-admin/clubs/{club_uuid}/club/dashboard-stats |  |
| [**getInviteCommon**](DefaultApi.md#getinvitecommon) | **GET** /api/v1/frontend/invite/{uuid} |  |
| [**getMe**](DefaultApi.md#getme) | **GET** /api/v1/frontend/common/me |  |
| [**getSettings**](DefaultApi.md#getsettings) | **GET** /api/v1/frontend/common/settings |  |
| [**getToken**](DefaultApi.md#gettoken) | **POST** /api/v1/auth/token | Exchange an authorization code for an ID token and an access token |
| [**getUnassociatedDomains**](DefaultApi.md#getunassociateddomains) | **GET** /api/v1/frontend/admin/domains/unassociated | Retrieve all domains that aren\&#39;t associated with a club |
| [**getUserinfo**](DefaultApi.md#getuserinfo) | **GET** /api/v1/auth/userinfo | Claims about the end-user the bearer access token grants |
| [**jwks**](DefaultApi.md#jwks) | **GET** /api/v1/auth/jwks.json | The public keys tokens of this provider are signed with (RFC 7517) |
| [**postUserinfo**](DefaultApi.md#postuserinfo) | **POST** /api/v1/auth/userinfo | Claims about the end-user the bearer access token grants |
| [**resetCredentials**](DefaultApi.md#resetcredentials) | **POST** /api/v1/frontend/admin/accounts/{uuid}/reset-credentials |  |
| [**resetCredentialsAsClubAdmin**](DefaultApi.md#resetcredentialsasclubadmin) | **POST** /api/v1/frontend/club-admin/clubs/{club_uuid}/members/{uuid}/reset-credentials |  |
| [**resetPassword**](DefaultApi.md#resetpasswordoperation) | **POST** /api/v1/frontend/credential-reset/{code}/reset |  |
| [**resetPasswordByUuid**](DefaultApi.md#resetpasswordbyuuid) | **POST** /api/v1/frontend/credential-reset/by-uuid/{uuid}/reset |  |
| [**retractInvite**](DefaultApi.md#retractinvite) | **POST** /api/v1/frontend/admin/invites/{uuid}/retract |  |
| [**retractInviteAsClubAdmin**](DefaultApi.md#retractinviteasclubadmin) | **POST** /api/v1/frontend/club-admin/clubs/{club_uuid}/invites/{uuid}/retract |  |
| [**setPassword**](DefaultApi.md#setpasswordoperation) | **POST** /api/v1/frontend/common/me/set-password |  |
| [**signIn**](DefaultApi.md#signinoperation) | **POST** /api/v1/auth/sign-in | Sign in with username (or email) and password |
| [**signOut**](DefaultApi.md#signout) | **POST** /api/v1/auth/sign-out | Sign out of the current session |
| [**unassociateDomain**](DefaultApi.md#unassociatedomainoperation) | **POST** /api/v1/frontend/admin/clubs/{uuid}/domains/unassociate |  |
| [**updateMe**](DefaultApi.md#updatemeoperation) | **PUT** /api/v1/frontend/common/me |  |
| [**verifyCode**](DefaultApi.md#verifycode) | **GET** /api/v1/frontend/credential-reset/{code} |  |
| [**verifyUuid**](DefaultApi.md#verifyuuid) | **GET** /api/v1/frontend/credential-reset/by-uuid/{uuid} |  |



## acceptInvite

> FormResultForNullAndAcceptInviteError acceptInvite(uuid, AcceptInvite)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AcceptInviteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AcceptInvite (optional)
    AcceptInvite: ...,
  } satisfies AcceptInviteRequest;

  try {
    const data = await api.acceptInvite(body);
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
| **AcceptInvite** | [AcceptInvite](AcceptInvite.md) |  | [Optional] |

### Return type

[**FormResultForNullAndAcceptInviteError**](FormResultForNullAndAcceptInviteError.md)

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


## associateDomain

> associateDomain(uuid, AssociateDomainRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AssociateDomainOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AssociateDomainRequest (optional)
    AssociateDomainRequest: ...,
  } satisfies AssociateDomainOperationRequest;

  try {
    const data = await api.associateDomain(body);
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
| **AssociateDomainRequest** | [AssociateDomainRequest](AssociateDomainRequest.md) |  | [Optional] |

### Return type

`void` (Empty response body)

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


## auth

> auth(client_id, code_challenge, code_challenge_method, max_age, nonce, prompt, redirect_uri, response_mode, response_type, scope, state)

The authorization endpoint

The authorization endpoint  Stores the authorization request in the session and sends the user to the login page, or straight on to finishing the authorization when they are signed in already and the login is recent enough for &#x60;prompt&#x60; and &#x60;max_age&#x60;. With &#x60;prompt&#x3D;none&#x60; the user never sees the login page, the client gets &#x60;login_required&#x60; instead.  An unknown client or &#x60;redirect_uri&#x60; sends the user to the error page and never to the client. RFC 6749 §4.1.2.1: \&quot;the authorization server SHOULD inform the resource owner of the error and MUST NOT automatically redirect the user-agent to the invalid redirection URI.\&quot; Every other error goes back to the client.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AuthRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    client_id: ...,
    // string (optional)
    code_challenge: ...,
    // string (optional)
    code_challenge_method: ...,
    // number (optional)
    max_age: 56,
    // string (optional)
    nonce: ...,
    // string (optional)
    prompt: ...,
    // string (optional)
    redirect_uri: redirect_uri_example,
    // string (optional)
    response_mode: ...,
    // string (optional)
    response_type: ...,
    // string (optional)
    scope: ...,
    // string (optional)
    state: ...,
  } satisfies AuthRequest;

  try {
    const data = await api.auth(body);
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
| **client_id** | `string` |  | [Optional] [Defaults to `undefined`] |
| **code_challenge** | `string` |  | [Optional] [Defaults to `undefined`] |
| **code_challenge_method** | `string` |  | [Optional] [Defaults to `undefined`] |
| **max_age** | `number` |  | [Optional] [Defaults to `undefined`] |
| **nonce** | `string` |  | [Optional] [Defaults to `undefined`] |
| **prompt** | `string` |  | [Optional] [Defaults to `undefined`] |
| **redirect_uri** | `string` |  | [Optional] [Defaults to `undefined`] |
| **response_mode** | `string` |  | [Optional] [Defaults to `undefined`] |
| **response_type** | `string` |  | [Optional] [Defaults to `undefined`] |
| **scope** | `string` |  | [Optional] [Defaults to `undefined`] |
| **state** | `string` |  | [Optional] [Defaults to `undefined`] |

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
| **302** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createClub

> FormResultForClubUuidAndCreateClubError createClub(CreateClubRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateClubOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateClubRequest (optional)
    CreateClubRequest: ...,
  } satisfies CreateClubOperationRequest;

  try {
    const data = await api.createClub(body);
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
| **CreateClubRequest** | [CreateClubRequest](CreateClubRequest.md) |  | [Optional] |

### Return type

[**FormResultForClubUuidAndCreateClubError**](FormResultForClubUuidAndCreateClubError.md)

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


## createInvite

> FormResultForSingleLinkAndCreateInviteError createInvite(CreateInviteRequestAdmin)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateInviteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateInviteRequestAdmin (optional)
    CreateInviteRequestAdmin: ...,
  } satisfies CreateInviteRequest;

  try {
    const data = await api.createInvite(body);
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
| **CreateInviteRequestAdmin** | [CreateInviteRequestAdmin](CreateInviteRequestAdmin.md) |  | [Optional] |

### Return type

[**FormResultForSingleLinkAndCreateInviteError**](FormResultForSingleLinkAndCreateInviteError.md)

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


## createMemberInvite

> FormResultForSingleLinkAndCreateInviteError createMemberInvite(club_uuid, CreateMemberInviteRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateMemberInviteOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CreateMemberInviteRequest (optional)
    CreateMemberInviteRequest: ...,
  } satisfies CreateMemberInviteOperationRequest;

  try {
    const data = await api.createMemberInvite(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **CreateMemberInviteRequest** | [CreateMemberInviteRequest](CreateMemberInviteRequest.md) |  | [Optional] |

### Return type

[**FormResultForSingleLinkAndCreateInviteError**](FormResultForSingleLinkAndCreateInviteError.md)

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


## createOidcClient

> FormResultForCreatedOidcClientAndCreateOidcClientError createOidcClient(CreateOidcClientRequest)

Register a new OIDC client

Register a new OIDC client  The response contains the client secret, which is not retrievable afterwards.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateOidcClientOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateOidcClientRequest (optional)
    CreateOidcClientRequest: ...,
  } satisfies CreateOidcClientOperationRequest;

  try {
    const data = await api.createOidcClient(body);
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
| **CreateOidcClientRequest** | [CreateOidcClientRequest](CreateOidcClientRequest.md) |  | [Optional] |

### Return type

[**FormResultForCreatedOidcClientAndCreateOidcClientError**](FormResultForCreatedOidcClientAndCreateOidcClientError.md)

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


## deleteClub

> deleteClub(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteClubRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteClubRequest;

  try {
    const data = await api.deleteClub(body);
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


## deleteClubAdmin

> deleteClubAdmin(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteClubAdminRequest;

  try {
    const data = await api.deleteClubAdmin(body);
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


## deleteMember

> deleteMember(club_uuid, member_uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteMemberRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    member_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteMemberRequest;

  try {
    const data = await api.deleteMember(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **member_uuid** | `string` |  | [Defaults to `undefined`] |

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


## deleteOidcClient

> deleteOidcClient(uuid)

Delete an OIDC client

Delete an OIDC client  Its pending authorization codes are deleted with it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteOidcClientRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteOidcClientRequest;

  try {
    const data = await api.deleteOidcClient(body);
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


## discovery

> DiscoveryResponse discovery()

The OpenID provider\&#39;s metadata (OpenID Connect Discovery 1.0)

The OpenID provider\&#39;s metadata (OpenID Connect Discovery 1.0)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DiscoveryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.discovery();
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

[**DiscoveryResponse**](DiscoveryResponse.md)

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


## extendInviteExpiry

> FormResultForNullAndExtendInviteExpiryError extendInviteExpiry(uuid, ExtendInviteRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ExtendInviteExpiryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ExtendInviteRequest (optional)
    ExtendInviteRequest: ...,
  } satisfies ExtendInviteExpiryRequest;

  try {
    const data = await api.extendInviteExpiry(body);
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
| **ExtendInviteRequest** | [ExtendInviteRequest](ExtendInviteRequest.md) |  | [Optional] |

### Return type

[**FormResultForNullAndExtendInviteExpiryError**](FormResultForNullAndExtendInviteExpiryError.md)

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


## extendInviteExpiryAsClubAdmin

> FormResultForNullAndExtendInviteExpiryError extendInviteExpiryAsClubAdmin(club_uuid, invite_uuid, ExtendInviteRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ExtendInviteExpiryAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    invite_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ExtendInviteRequest (optional)
    ExtendInviteRequest: ...,
  } satisfies ExtendInviteExpiryAsClubAdminRequest;

  try {
    const data = await api.extendInviteExpiryAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **invite_uuid** | `string` |  | [Defaults to `undefined`] |
| **ExtendInviteRequest** | [ExtendInviteRequest](ExtendInviteRequest.md) |  | [Optional] |

### Return type

[**FormResultForNullAndExtendInviteExpiryError**](FormResultForNullAndExtendInviteExpiryError.md)

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


## finishAuth

> finishAuth(request_id)

Issue the authorization code for the pending authorization request and redirect to the client

Issue the authorization code for the pending authorization request and redirect to the client  Sends the user back to the login page when they are not signed in yet or their login is too old for the request (&#x60;login_required&#x60; with &#x60;prompt&#x3D;none&#x60;), and to the error page when this session has no pending request with that id. An account that is no club member, or no longer exists, gets &#x60;access_denied&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FinishAuthRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    request_id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies FinishAuthRequest;

  try {
    const data = await api.finishAuth(body);
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
| **request_id** | `string` |  | [Optional] [Defaults to `undefined`] |

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
| **302** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getAllOidcClients

> Array&lt;OidcClientSchema&gt; getAllOidcClients()

Retrieve all registered OIDC clients

Retrieve all registered OIDC clients

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllOidcClientsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllOidcClients();
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

[**Array&lt;OidcClientSchema&gt;**](OidcClientSchema.md)

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


## getAllSuperadmins

> Array&lt;SimpleAccountSchema&gt; getAllSuperadmins()



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllSuperadminsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllSuperadmins();
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

[**Array&lt;SimpleAccountSchema&gt;**](SimpleAccountSchema.md)

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


## getClub

> ClubSchema getClub(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubRequest;

  try {
    const data = await api.getClub(body);
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

[**ClubSchema**](ClubSchema.md)

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


## getClubAdminInvites

> Array&lt;GetInvite&gt; getClubAdminInvites(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubAdminInvitesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubAdminInvitesRequest;

  try {
    const data = await api.getClubAdminInvites(body);
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

[**Array&lt;GetInvite&gt;**](GetInvite.md)

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


## getClubAdmins

> PageForSimpleAccountSchema getClubAdmins(uuid, limit, offset, search)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubAdminsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    search: ...,
  } satisfies GetClubAdminsRequest;

  try {
    const data = await api.getClubAdmins(body);
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
| **limit** | `number` |  | [Optional] [Defaults to `undefined`] |
| **offset** | `number` |  | [Optional] [Defaults to `undefined`] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**PageForSimpleAccountSchema**](PageForSimpleAccountSchema.md)

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


## getClubAsClubAdmin

> ClubSchema getClubAsClubAdmin(club_uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubAsClubAdminRequest;

  try {
    const data = await api.getClubAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ClubSchema**](ClubSchema.md)

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


## getClubDomains

> Array&lt;DomainSchema&gt; getClubDomains(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubDomainsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubDomainsRequest;

  try {
    const data = await api.getClubDomains(body);
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

[**Array&lt;DomainSchema&gt;**](DomainSchema.md)

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


## getClubMemberInvites

> Array&lt;GetInvite&gt; getClubMemberInvites(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubMemberInvitesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubMemberInvitesRequest;

  try {
    const data = await api.getClubMemberInvites(body);
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

[**Array&lt;GetInvite&gt;**](GetInvite.md)

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


## getClubMemberInvitesAsClubAdmin

> Array&lt;GetInvite&gt; getClubMemberInvitesAsClubAdmin(club_uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubMemberInvitesAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetClubMemberInvitesAsClubAdminRequest;

  try {
    const data = await api.getClubMemberInvitesAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**Array&lt;GetInvite&gt;**](GetInvite.md)

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


## getClubMembers

> PageForSimpleMemberAccountSchema getClubMembers(uuid, limit, offset, search)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubMembersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    search: ...,
  } satisfies GetClubMembersRequest;

  try {
    const data = await api.getClubMembers(body);
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
| **limit** | `number` |  | [Optional] [Defaults to `undefined`] |
| **offset** | `number` |  | [Optional] [Defaults to `undefined`] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**PageForSimpleMemberAccountSchema**](PageForSimpleMemberAccountSchema.md)

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


## getClubMembersAsClubAdmin

> PageForSimpleMemberAccountSchema getClubMembersAsClubAdmin(club_uuid, limit, offset, search)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubMembersAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    search: ...,
  } satisfies GetClubMembersAsClubAdminRequest;

  try {
    const data = await api.getClubMembersAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `undefined`] |
| **offset** | `number` |  | [Optional] [Defaults to `undefined`] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**PageForSimpleMemberAccountSchema**](PageForSimpleMemberAccountSchema.md)

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


## getClubs

> Array&lt;ClubSchema&gt; getClubs()



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetClubsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getClubs();
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

[**Array&lt;ClubSchema&gt;**](ClubSchema.md)

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


## getDashboardStats

> DashboardStatsSchema getDashboardStats(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDashboardStatsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDashboardStatsRequest;

  try {
    const data = await api.getDashboardStats(body);
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

[**DashboardStatsSchema**](DashboardStatsSchema.md)

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


## getDashboardStatsAsClubAdmin

> DashboardStatsSchema getDashboardStatsAsClubAdmin(club_uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDashboardStatsAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDashboardStatsAsClubAdminRequest;

  try {
    const data = await api.getDashboardStatsAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DashboardStatsSchema**](DashboardStatsSchema.md)

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


## getInviteCommon

> GetInvite getInviteCommon(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetInviteCommonRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetInviteCommonRequest;

  try {
    const data = await api.getInviteCommon(body);
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

[**GetInvite**](GetInvite.md)

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


## getMe

> MeSchema getMe()



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetMeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getMe();
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

[**MeSchema**](MeSchema.md)

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


## getSettings

> SettingsSchema getSettings()



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getSettings();
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

[**SettingsSchema**](SettingsSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getToken

> TokenResponse getToken(grant_type, client_id, client_secret, code, code_verifier, redirect_uri)

Exchange an authorization code for an ID token and an access token

Exchange an authorization code for an ID token and an access token  The client authenticates with &#x60;client_secret_basic&#x60; or &#x60;client_secret_post&#x60; (RFC 6749 §2.3.1). Errors are RFC 6749 §5.2 error objects. Every response carries &#x60;Cache-Control: no-store&#x60; and &#x60;Pragma: no-cache&#x60; (RFC 6749 §5.1).  A code is redeemed once. RFC 6749 §4.1.2: \&quot;The client MUST NOT use the authorization code more than once. If an authorization code is used more than once, the authorization server MUST deny the request\&quot;. A row lock serializes concurrent redemptions.  The &#x60;redirect_uri&#x60; has to equal the one of the authorization request exactly, compared as a string like the authorization endpoint does.  RFC 9700 §2.1.1: \&quot;a token request containing a code_verifier parameter is accepted only if a code_challenge parameter was present in the authorization request\&quot;

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string | Type of the grant, only `authorization_code` is supported
    grant_type: ...,
    // string | Client id, required for `client_secret_post` (optional)
    client_id: ...,
    // string | Secret the client authenticates with in `client_secret_post` (optional)
    client_secret: ...,
    // string | Code to exchange for tokens (optional)
    code: ...,
    // string | PKCE code verifier (RFC 7636) (optional)
    code_verifier: ...,
    // string | Redirect uri of the authorization request (optional)
    redirect_uri: ...,
  } satisfies GetTokenRequest;

  try {
    const data = await api.getToken(body);
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
| **grant_type** | `string` | Type of the grant, only &#x60;authorization_code&#x60; is supported | [Defaults to `undefined`] |
| **client_id** | `string` | Client id, required for &#x60;client_secret_post&#x60; | [Optional] [Defaults to `undefined`] |
| **client_secret** | `string` | Secret the client authenticates with in &#x60;client_secret_post&#x60; | [Optional] [Defaults to `undefined`] |
| **code** | `string` | Code to exchange for tokens | [Optional] [Defaults to `undefined`] |
| **code_verifier** | `string` | PKCE code verifier (RFC 7636) | [Optional] [Defaults to `undefined`] |
| **redirect_uri** | `string` | Redirect uri of the authorization request | [Optional] [Defaults to `undefined`] |

### Return type

[**TokenResponse**](TokenResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/x-www-form-urlencoded`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **401** |  |  -  |
| **500** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getUnassociatedDomains

> Array&lt;DomainSchema&gt; getUnassociatedDomains()

Retrieve all domains that aren\&#39;t associated with a club

Retrieve all domains that aren\&#39;t associated with a club

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetUnassociatedDomainsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getUnassociatedDomains();
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

[**Array&lt;DomainSchema&gt;**](DomainSchema.md)

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


## getUserinfo

> UserinfoResponse getUserinfo()

Claims about the end-user the bearer access token grants

Claims about the end-user the bearer access token grants

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetUserinfoRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getUserinfo();
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

[**UserinfoResponse**](UserinfoResponse.md)

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
| **401** |  |  -  |
| **500** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## jwks

> any jwks()

The public keys tokens of this provider are signed with (RFC 7517)

The public keys tokens of this provider are signed with (RFC 7517)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { JwksRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.jwks();
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

**any**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postUserinfo

> UserinfoResponse postUserinfo()

Claims about the end-user the bearer access token grants

Claims about the end-user the bearer access token grants

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostUserinfoRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.postUserinfo();
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

[**UserinfoResponse**](UserinfoResponse.md)

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
| **401** |  |  -  |
| **500** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## resetCredentials

> CredentialResetSchema resetCredentials(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResetCredentialsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ResetCredentialsRequest;

  try {
    const data = await api.resetCredentials(body);
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

[**CredentialResetSchema**](CredentialResetSchema.md)

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


## resetCredentialsAsClubAdmin

> CredentialResetSchema resetCredentialsAsClubAdmin(club_uuid, uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResetCredentialsAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ResetCredentialsAsClubAdminRequest;

  try {
    const data = await api.resetCredentialsAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CredentialResetSchema**](CredentialResetSchema.md)

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


## resetPassword

> FormResultForNullAndResetPasswordError resetPassword(code, ResetPasswordRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResetPasswordOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    code: code_example,
    // ResetPasswordRequest (optional)
    ResetPasswordRequest: ...,
  } satisfies ResetPasswordOperationRequest;

  try {
    const data = await api.resetPassword(body);
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
| **code** | `string` |  | [Defaults to `undefined`] |
| **ResetPasswordRequest** | [ResetPasswordRequest](ResetPasswordRequest.md) |  | [Optional] |

### Return type

[**FormResultForNullAndResetPasswordError**](FormResultForNullAndResetPasswordError.md)

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


## resetPasswordByUuid

> FormResultForNullAndResetPasswordError resetPasswordByUuid(uuid, ResetPasswordRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResetPasswordByUuidRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ResetPasswordRequest (optional)
    ResetPasswordRequest: ...,
  } satisfies ResetPasswordByUuidRequest;

  try {
    const data = await api.resetPasswordByUuid(body);
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
| **ResetPasswordRequest** | [ResetPasswordRequest](ResetPasswordRequest.md) |  | [Optional] |

### Return type

[**FormResultForNullAndResetPasswordError**](FormResultForNullAndResetPasswordError.md)

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


## retractInvite

> retractInvite(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RetractInviteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RetractInviteRequest;

  try {
    const data = await api.retractInvite(body);
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


## retractInviteAsClubAdmin

> retractInviteAsClubAdmin(club_uuid, uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RetractInviteAsClubAdminRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    club_uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RetractInviteAsClubAdminRequest;

  try {
    const data = await api.retractInviteAsClubAdmin(body);
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
| **club_uuid** | `string` |  | [Defaults to `undefined`] |
| **uuid** | `string` |  | [Defaults to `undefined`] |

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


## setPassword

> FormResultForNullAndSetPasswordErrors setPassword(SetPasswordRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetPasswordOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SetPasswordRequest (optional)
    SetPasswordRequest: ...,
  } satisfies SetPasswordOperationRequest;

  try {
    const data = await api.setPassword(body);
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
| **SetPasswordRequest** | [SetPasswordRequest](SetPasswordRequest.md) |  | [Optional] |

### Return type

[**FormResultForNullAndSetPasswordErrors**](FormResultForNullAndSetPasswordErrors.md)

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


## signIn

> signIn(SignInRequest)

Sign in with username (or email) and password

Sign in with username (or email) and password  An unknown username and a wrong password fail alike, so the response does not tell which usernames exist. On success the session gets a new id, so an id planted or seen before the login does not become a signed in session (session fixation).

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SignInOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SignInRequest (optional)
    SignInRequest: ...,
  } satisfies SignInOperationRequest;

  try {
    const data = await api.signIn(body);
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
| **SignInRequest** | [SignInRequest](SignInRequest.md) |  | [Optional] |

### Return type

`void` (Empty response body)

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


## signOut

> signOut()

Sign out of the current session

Sign out of the current session

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SignOutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.signOut();
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


## unassociateDomain

> unassociateDomain(uuid, UnassociateDomainRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UnassociateDomainOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UnassociateDomainRequest (optional)
    UnassociateDomainRequest: ...,
  } satisfies UnassociateDomainOperationRequest;

  try {
    const data = await api.unassociateDomain(body);
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
| **UnassociateDomainRequest** | [UnassociateDomainRequest](UnassociateDomainRequest.md) |  | [Optional] |

### Return type

`void` (Empty response body)

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


## updateMe

> updateMe(UpdateMeRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateMeOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // UpdateMeRequest (optional)
    UpdateMeRequest: ...,
  } satisfies UpdateMeOperationRequest;

  try {
    const data = await api.updateMe(body);
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
| **UpdateMeRequest** | [UpdateMeRequest](UpdateMeRequest.md) |  | [Optional] |

### Return type

`void` (Empty response body)

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


## verifyCode

> VerifyResetCodeResponse verifyCode(code)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { VerifyCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    code: code_example,
  } satisfies VerifyCodeRequest;

  try {
    const data = await api.verifyCode(body);
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
| **code** | `string` |  | [Defaults to `undefined`] |

### Return type

[**VerifyResetCodeResponse**](VerifyResetCodeResponse.md)

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


## verifyUuid

> VerifyResetCodeResponse verifyUuid(uuid)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { VerifyUuidRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies VerifyUuidRequest;

  try {
    const data = await api.verifyUuid(body);
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

[**VerifyResetCodeResponse**](VerifyResetCodeResponse.md)

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

