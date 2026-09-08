# DefaultApi

All URIs are relative to */api/graph*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getFacets**](DefaultApi.md#getfacets) | **GET** /facets | Get Facets |
| [**health**](DefaultApi.md#health) | **GET** /health | Health |
| [**postCombos**](DefaultApi.md#postcombos) | **POST** /combos | Post Combos |
| [**postDiagnostics**](DefaultApi.md#postdiagnostics) | **POST** /diagnostics | Post Diagnostics |
| [**postFill**](DefaultApi.md#postfill) | **POST** /fill | Post Fill |
| [**postLines**](DefaultApi.md#postlines) | **POST** /lines | Post Lines |
| [**postPoolQuery**](DefaultApi.md#postpoolquery) | **POST** /pool-query | Post Pool Query |
| [**postReplace**](DefaultApi.md#postreplace) | **POST** /replace | Post Replace |
| [**postSearch**](DefaultApi.md#postsearch) | **POST** /search | Post Search |
| [**postSuggestions**](DefaultApi.md#postsuggestions) | **POST** /suggestions | Post Suggestions |
| [**postSwaps**](DefaultApi.md#postswaps) | **POST** /swaps | Post Swaps |
| [**postWarm**](DefaultApi.md#postwarm) | **POST** /warm | Post Warm |



## getFacets

> { [key: string]: Array&lt;{ [key: string]: any | undefined; }&gt; | undefined; } getFacets()

Get Facets

Filter values that actually have cards behind them.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetFacetsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getFacets();
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

**{ [key: string]: Array<{ [key: string]: any | undefined; }> | undefined; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## health

> { [key: string]: string | undefined; } health()

Health

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { HealthRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.health();
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

**{ [key: string]: string | undefined; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postCombos

> CombosResponse postCombos(CombosRequest)

Post Combos

Combos the deck completes, and combos it is one card short of.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostCombosRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CombosRequest
    CombosRequest: ...,
  } satisfies PostCombosRequest;

  try {
    const data = await api.postCombos(body);
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
| **CombosRequest** | [CombosRequest](CombosRequest.md) |  | |

### Return type

[**CombosResponse**](CombosResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postDiagnostics

> Diagnostics postDiagnostics(DiagnosticsRequest)

Post Diagnostics

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostDiagnosticsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // DiagnosticsRequest
    DiagnosticsRequest: ...,
  } satisfies PostDiagnosticsRequest;

  try {
    const data = await api.postDiagnostics(body);
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
| **DiagnosticsRequest** | [DiagnosticsRequest](DiagnosticsRequest.md) |  | |

### Return type

[**Diagnostics**](Diagnostics.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postFill

> FillResult postFill(FillRequest)

Post Fill

Fill an incomplete deck to &#x60;deck_size&#x60;, respecting the chosen ratios.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostFillRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // FillRequest
    FillRequest: ...,
  } satisfies PostFillRequest;

  try {
    const data = await api.postFill(body);
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
| **FillRequest** | [FillRequest](FillRequest.md) |  | |

### Return type

[**FillResult**](FillResult.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postLines

> LineReportResponse postLines(LinesRequest)

Post Lines

Complete combo lines and near-misses: cost, colours, zones, prerequisites, fold classes, tutor reach, and redundancy.  No HTTP fallback: unlike &#x60;/combos&#x60;, the cost/zone/prerequisite data this endpoint exists for only lives on the ingested graph, so a combo layer that has never been ingested is reported as a note, not silently answered from a shape that cannot carry the fields at all.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostLinesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // LinesRequest
    LinesRequest: ...,
  } satisfies PostLinesRequest;

  try {
    const data = await api.postLines(body);
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
| **LinesRequest** | [LinesRequest](LinesRequest.md) |  | |

### Return type

[**LineReportResponse**](LineReportResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postPoolQuery

> PoolQueryResponse postPoolQuery(PoolQueryRequest)

Post Pool Query

Check a pool restriction without running one.  Its own endpoint so the builder can tell someone mid-sentence that &#x60;year&gt;&#x3D;202&#x60; is not a year yet, without posting a deck or spending a suggestion. Parse-only — it never touches the graph.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostPoolQueryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // PoolQueryRequest
    PoolQueryRequest: ...,
  } satisfies PostPoolQueryRequest;

  try {
    const data = await api.postPoolQuery(body);
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
| **PoolQueryRequest** | [PoolQueryRequest](PoolQueryRequest.md) |  | |

### Return type

[**PoolQueryResponse**](PoolQueryResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postReplace

> ReplaceResponse postReplace(ReplaceRequest)

Post Replace

Alternatives to one card the user has marked, each with its shape delta.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostReplaceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ReplaceRequest
    ReplaceRequest: ...,
  } satisfies PostReplaceRequest;

  try {
    const data = await api.postReplace(body);
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
| **ReplaceRequest** | [ReplaceRequest](ReplaceRequest.md) |  | |

### Return type

[**ReplaceResponse**](ReplaceResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postSearch

> SearchResponse postSearch(SearchRequest)

Post Search

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostSearchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SearchRequest
    SearchRequest: ...,
  } satisfies PostSearchRequest;

  try {
    const data = await api.postSearch(body);
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
| **SearchRequest** | [SearchRequest](SearchRequest.md) |  | |

### Return type

[**SearchResponse**](SearchResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postSuggestions

> SuggestionReport postSuggestions(SuggestionsRequest)

Post Suggestions

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostSuggestionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SuggestionsRequest
    SuggestionsRequest: ...,
  } satisfies PostSuggestionsRequest;

  try {
    const data = await api.postSuggestions(body);
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
| **SuggestionsRequest** | [SuggestionsRequest](SuggestionsRequest.md) |  | |

### Return type

[**SuggestionReport**](SuggestionReport.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postSwaps

> SwapsResponse postSwaps(SwapsRequest)

Post Swaps

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostSwapsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SwapsRequest
    SwapsRequest: ...,
  } satisfies PostSwapsRequest;

  try {
    const data = await api.postSwaps(body);
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
| **SwapsRequest** | [SwapsRequest](SwapsRequest.md) |  | |

### Return type

[**SwapsResponse**](SwapsResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## postWarm

> { [key: string]: string | undefined; } postWarm(WarmRequest)

Post Warm

Prefetch EDHREC for a commander, fire-and-forget.  Called by the frontend the moment a commander is chosen, so the once-per-commander fetch happens while the deck is still being built instead of inside the first /suggestions request.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PostWarmRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // WarmRequest
    WarmRequest: ...,
  } satisfies PostWarmRequest;

  try {
    const data = await api.postWarm(body);
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
| **WarmRequest** | [WarmRequest](WarmRequest.md) |  | |

### Return type

**{ [key: string]: string | undefined; }**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

