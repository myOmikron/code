# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createAccount**](DefaultApi.md#createaccountoperation) | **POST** /api/frontend/v1/admin/accounts | Create a staff account and return its one-time registration link |
| [**createCategory**](DefaultApi.md#createcategory) | **POST** /api/frontend/v1/admin/categories | Create a category |
| [**createInvite**](DefaultApi.md#createinvite) | **POST** /api/frontend/v1/admin/accounts/{uuid}/invite | Issue a new one-time registration link for an account (\&quot;lost device\&quot;) |
| [**createItem**](DefaultApi.md#createitem) | **POST** /api/frontend/v1/admin/items | Create an item |
| [**createOrder**](DefaultApi.md#createorderoperation) | **POST** /api/frontend/v1/shop/orders | Place a pre-order |
| [**deleteAccount**](DefaultApi.md#deleteaccount) | **DELETE** /api/frontend/v1/admin/accounts/{uuid} | Delete a staff account |
| [**deleteCategory**](DefaultApi.md#deletecategory) | **DELETE** /api/frontend/v1/admin/categories/{uuid} | Delete a category |
| [**deleteItem**](DefaultApi.md#deleteitem) | **DELETE** /api/frontend/v1/admin/items/{uuid} | Delete an item |
| [**deleteItemImage**](DefaultApi.md#deleteitemimage) | **DELETE** /api/frontend/v1/admin/items/{uuid}/image | Remove an item\&#39;s product photo |
| [**deletePasskey**](DefaultApi.md#deletepasskey) | **DELETE** /api/frontend/v1/auth/passkeys/{uuid} | Delete one of the logged-in account\&#39;s passkeys |
| [**finishAddPasskey**](DefaultApi.md#finishaddpasskeyoperation) | **POST** /api/frontend/v1/auth/passkeys/finish | Finish adding another passkey to the logged-in account |
| [**finishLogin**](DefaultApi.md#finishloginoperation) | **POST** /api/frontend/v1/auth/login/finish | Finish a passkey login |
| [**finishRegistration**](DefaultApi.md#finishregistrationoperation) | **POST** /api/frontend/v1/auth/register/finish | Finish an invite-based passkey registration |
| [**getCategories**](DefaultApi.md#getcategories) | **GET** /api/frontend/v1/shop/categories | List all categories |
| [**getItems**](DefaultApi.md#getitems) | **GET** /api/frontend/v1/shop/items | List all currently orderable items |
| [**getOrder**](DefaultApi.md#getorder) | **GET** /api/frontend/v1/shop/orders/{pickup_code} | Get an order by its pickup code |
| [**getOrderDetail**](DefaultApi.md#getorderdetail) | **GET** /api/frontend/v1/verkauf/orders/{uuid} | Get a single order |
| [**listAccounts**](DefaultApi.md#listaccounts) | **GET** /api/frontend/v1/admin/accounts | List all staff accounts |
| [**listCategories**](DefaultApi.md#listcategories) | **GET** /api/frontend/v1/admin/categories | List all categories |
| [**listItems**](DefaultApi.md#listitems) | **GET** /api/frontend/v1/admin/items | List all items, including inactive ones |
| [**listOrders**](DefaultApi.md#listorders) | **GET** /api/frontend/v1/verkauf/orders | List orders, optionally filtered by status and pickup date |
| [**listPasskeys**](DefaultApi.md#listpasskeys) | **GET** /api/frontend/v1/auth/passkeys | List the passkeys of the logged-in account |
| [**logout**](DefaultApi.md#logout) | **GET** /api/frontend/v1/auth/logout | Log out of the current session |
| [**me**](DefaultApi.md#me) | **GET** /api/frontend/v1/auth/me | Get the currently logged-in account |
| [**setItemImage**](DefaultApi.md#setitemimageoperation) | **PUT** /api/frontend/v1/admin/items/{uuid}/image | Set an item\&#39;s product photo |
| [**startAddPasskey**](DefaultApi.md#startaddpasskey) | **POST** /api/frontend/v1/auth/passkeys/start | Start adding another passkey to the logged-in account |
| [**startLogin**](DefaultApi.md#startloginoperation) | **POST** /api/frontend/v1/auth/login/start | Start a passkey login for a given username |
| [**startRegistration**](DefaultApi.md#startregistrationoperation) | **POST** /api/frontend/v1/auth/register/start | Start an invite-based passkey registration |
| [**test**](DefaultApi.md#test) | **GET** /api/frontend/v1/auth/test | Cheap probe whether the session is logged in |
| [**updateAccount**](DefaultApi.md#updateaccountoperation) | **PUT** /api/frontend/v1/admin/accounts/{uuid} | Update a staff account |
| [**updateCategory**](DefaultApi.md#updatecategory) | **PUT** /api/frontend/v1/admin/categories/{uuid} | Rename a category |
| [**updateItem**](DefaultApi.md#updateitem) | **PUT** /api/frontend/v1/admin/items/{uuid} | Update an item |
| [**updateOrderItemPacked**](DefaultApi.md#updateorderitempackedoperation) | **PATCH** /api/frontend/v1/verkauf/order-items/{uuid} | Change a position\&#39;s packed flag (packing list checkbox) |
| [**updateOrderStatus**](DefaultApi.md#updateorderstatusoperation) | **PATCH** /api/frontend/v1/verkauf/orders/{uuid} | Change an order\&#39;s status |



## createAccount

> InviteResponse createAccount(CreateAccountRequest)

Create a staff account and return its one-time registration link

Create a staff account and return its one-time registration link

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateAccountRequest (optional)
    CreateAccountRequest: ...,
  } satisfies CreateAccountOperationRequest;

  try {
    const data = await api.createAccount(body);
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
| **CreateAccountRequest** | [CreateAccountRequest](CreateAccountRequest.md) |  | [Optional] |

### Return type

[**InviteResponse**](InviteResponse.md)

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


## createCategory

> string createCategory(CategoryRequest)

Create a category

Create a category

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateCategoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CategoryRequest (optional)
    CategoryRequest: ...,
  } satisfies CreateCategoryRequest;

  try {
    const data = await api.createCategory(body);
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
| **CategoryRequest** | [CategoryRequest](CategoryRequest.md) |  | [Optional] |

### Return type

**string**

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

> InviteResponse createInvite(uuid)

Issue a new one-time registration link for an account (\&quot;lost device\&quot;)

Issue a new one-time registration link for an account (\&quot;lost device\&quot;)

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
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
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
| **uuid** | `string` |  | [Defaults to `undefined`] |

### Return type

[**InviteResponse**](InviteResponse.md)

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


## createItem

> string createItem(ItemRequest)

Create an item

Create an item

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ItemRequest (optional)
    ItemRequest: ...,
  } satisfies CreateItemRequest;

  try {
    const data = await api.createItem(body);
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
| **ItemRequest** | [ItemRequest](ItemRequest.md) |  | [Optional] |

### Return type

**string**

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


## createOrder

> CreateOrderResponse createOrder(CreateOrderRequest)

Place a pre-order

Place a pre-order  Customers need no account: name plus phone or email is enough. The pickup date is not chosen by the customer — every order is for the next Saturday.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateOrderOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateOrderRequest (optional)
    CreateOrderRequest: ...,
  } satisfies CreateOrderOperationRequest;

  try {
    const data = await api.createOrder(body);
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
| **CreateOrderRequest** | [CreateOrderRequest](CreateOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrderResponse**](CreateOrderResponse.md)

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


## deleteAccount

> deleteAccount(uuid)

Delete a staff account

Delete a staff account  Admins cannot delete themselves.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteAccountRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteAccountRequest;

  try {
    const data = await api.deleteAccount(body);
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


## deleteCategory

> deleteCategory(uuid)

Delete a category

Delete a category  Items of the category are kept (their category is set to null).

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteCategoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteCategoryRequest;

  try {
    const data = await api.deleteCategory(body);
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


## deleteItem

> deleteItem(uuid)

Delete an item

Delete an item  Positions of existing orders keep their snapshots (item link set to null). Prefer deactivating items over deleting them.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteItemRequest;

  try {
    const data = await api.deleteItem(body);
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


## deleteItemImage

> deleteItemImage(uuid)

Remove an item\&#39;s product photo

Remove an item\&#39;s product photo

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteItemImageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteItemImageRequest;

  try {
    const data = await api.deleteItemImage(body);
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


## deletePasskey

> deletePasskey(uuid)

Delete one of the logged-in account\&#39;s passkeys

Delete one of the logged-in account\&#39;s passkeys  The last passkey cannot be deleted — the account would be locked out.

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


## finishAddPasskey

> finishAddPasskey(FinishAddPasskeyRequest)

Finish adding another passkey to the logged-in account

Finish adding another passkey to the logged-in account

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


## finishLogin

> MeResponse finishLogin(FinishLoginRequest)

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

[**MeResponse**](MeResponse.md)

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

> finishRegistration(FinishRegistrationRequest)

Finish an invite-based passkey registration

Finish an invite-based passkey registration

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


## getCategories

> ListCategoriesResponse getCategories()

List all categories

List all categories

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetCategoriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getCategories();
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

[**ListCategoriesResponse**](ListCategoriesResponse.md)

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


## getItems

> ListItemsResponse getItems()

List all currently orderable items

List all currently orderable items

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetItemsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getItems();
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

[**ListItemsResponse**](ListItemsResponse.md)

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


## getOrder

> PublicOrder getOrder(pickup_code)

Get an order by its pickup code

Get an order by its pickup code  Deliberately does not echo phone/email: the code is a weak bearer secret, so a guessed code must not leak contact data.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetOrderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    pickup_code: pickup_code_example,
  } satisfies GetOrderRequest;

  try {
    const data = await api.getOrder(body);
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
| **pickup_code** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PublicOrder**](PublicOrder.md)

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


## getOrderDetail

> FullOrder getOrderDetail(uuid)

Get a single order

Get a single order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetOrderDetailRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetOrderDetailRequest;

  try {
    const data = await api.getOrderDetail(body);
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

[**FullOrder**](FullOrder.md)

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


## listAccounts

> ListAccountsResponse listAccounts()

List all staff accounts

List all staff accounts

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListAccountsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listAccounts();
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

[**ListAccountsResponse**](ListAccountsResponse.md)

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


## listCategories

> ListCategoriesResponse listCategories()

List all categories

List all categories

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListCategoriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listCategories();
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

[**ListCategoriesResponse**](ListCategoriesResponse.md)

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


## listItems

> ListAdminItemsResponse listItems()

List all items, including inactive ones

List all items, including inactive ones

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListItemsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listItems();
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

[**ListAdminItemsResponse**](ListAdminItemsResponse.md)

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


## listOrders

> ListOrdersResponse listOrders(pickup_date, status)

List orders, optionally filtered by status and pickup date

List orders, optionally filtered by status and pickup date

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListOrdersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    pickup_date: ...,
    // OrderStatus (optional)
    status: ...,
  } satisfies ListOrdersRequest;

  try {
    const data = await api.listOrders(body);
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
| **pickup_date** | `string` |  | [Optional] [Defaults to `undefined`] |
| **status** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Open, Ready, PickedUp, Cancelled] |

### Return type

[**ListOrdersResponse**](ListOrdersResponse.md)

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

Log out of the current session

Log out of the current session

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

Get the currently logged-in account

Get the currently logged-in account

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


## setItemImage

> setItemImage(uuid, SetItemImageRequest)

Set an item\&#39;s product photo

Set an item\&#39;s product photo  Accepts jpeg/png/webp, downscales to a bounded size and stores a re-encoded jpeg.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetItemImageOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetItemImageRequest (optional)
    SetItemImageRequest: ...,
  } satisfies SetItemImageOperationRequest;

  try {
    const data = await api.setItemImage(body);
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
| **SetItemImageRequest** | [SetItemImageRequest](SetItemImageRequest.md) |  | [Optional] |

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


## startAddPasskey

> StartAddPasskeyResponse startAddPasskey()

Start adding another passkey to the logged-in account

Start adding another passkey to the logged-in account

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

> StartLoginResponse startLogin(StartLoginRequest)

Start a passkey login for a given username

Start a passkey login for a given username  The account\&#39;s passkeys are sent as the credential allow-list, so this works with roaming authenticators (e.g. YubiKeys) whose credentials are not client-side discoverable.

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

[**StartLoginResponse**](StartLoginResponse.md)

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

> StartRegistrationResponse startRegistration(StartRegistrationRequest)

Start an invite-based passkey registration

Start an invite-based passkey registration

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

[**StartRegistrationResponse**](StartRegistrationResponse.md)

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


## test

> test()

Cheap probe whether the session is logged in

Cheap probe whether the session is logged in

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { TestRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.test();
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
- **Accept**: `text/plain; charset=utf-8`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateAccount

> updateAccount(uuid, UpdateAccountRequest)

Update a staff account

Update a staff account  Admins cannot demote themselves — this avoids locking the last admin out of account management.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateAccountRequest (optional)
    UpdateAccountRequest: ...,
  } satisfies UpdateAccountOperationRequest;

  try {
    const data = await api.updateAccount(body);
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
| **UpdateAccountRequest** | [UpdateAccountRequest](UpdateAccountRequest.md) |  | [Optional] |

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


## updateCategory

> updateCategory(uuid, CategoryRequest)

Rename a category

Rename a category

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateCategoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CategoryRequest (optional)
    CategoryRequest: ...,
  } satisfies UpdateCategoryRequest;

  try {
    const data = await api.updateCategory(body);
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
| **CategoryRequest** | [CategoryRequest](CategoryRequest.md) |  | [Optional] |

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


## updateItem

> updateItem(uuid, ItemRequest)

Update an item

Update an item  Existing orders are unaffected: they carry name/price snapshots.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ItemRequest (optional)
    ItemRequest: ...,
  } satisfies UpdateItemRequest;

  try {
    const data = await api.updateItem(body);
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
| **ItemRequest** | [ItemRequest](ItemRequest.md) |  | [Optional] |

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


## updateOrderItemPacked

> updateOrderItemPacked(uuid, UpdateOrderItemPackedRequest)

Change a position\&#39;s packed flag (packing list checkbox)

Change a position\&#39;s packed flag (packing list checkbox)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateOrderItemPackedOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateOrderItemPackedRequest (optional)
    UpdateOrderItemPackedRequest: ...,
  } satisfies UpdateOrderItemPackedOperationRequest;

  try {
    const data = await api.updateOrderItemPacked(body);
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
| **UpdateOrderItemPackedRequest** | [UpdateOrderItemPackedRequest](UpdateOrderItemPackedRequest.md) |  | [Optional] |

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


## updateOrderStatus

> FullOrder updateOrderStatus(uuid, UpdateOrderStatusRequest)

Change an order\&#39;s status

Change an order\&#39;s status  Allowed transitions: &#x60;Open -&gt; Ready -&gt; PickedUp&#x60;; &#x60;Open | Ready -&gt; Cancelled&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateOrderStatusOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateOrderStatusRequest (optional)
    UpdateOrderStatusRequest: ...,
  } satisfies UpdateOrderStatusOperationRequest;

  try {
    const data = await api.updateOrderStatus(body);
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
| **UpdateOrderStatusRequest** | [UpdateOrderStatusRequest](UpdateOrderStatusRequest.md) |  | [Optional] |

### Return type

[**FullOrder**](FullOrder.md)

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

