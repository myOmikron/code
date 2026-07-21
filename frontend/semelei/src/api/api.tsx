import { ERROR_STORE } from "src/context/error-context";
import {
    Configuration,
    DefaultApi,
    RequiredError,
    ResponseError,
    type CreateAccountRequest,
    type CreateOrderRequest,
    type ItemRequest,
    type CategoryRequest,
    type OrderStatus,
    type UpdateAccountRequest,
} from "src/api/generated";

/** Hyphen separated uuid */
export type UUID = string;

/** Date without time, formatted as `YYYY-MM-DD` */
export type IsoDate = string;

const configuration = new Configuration({
    basePath: window.location.origin,
});

const defaultApi = new DefaultApi(configuration);

/**
 * Public URL of an item's product photo (for `<img src>`).
 *
 * `version` busts the immutable cache when the photo changes.
 *
 * @param itemId the item's uuid
 * @param version the item's `image_version`
 *
 * @returns the image url
 */
export function itemImageUrl(itemId: UUID, version: number): string {
    return `/api/frontend/v1/shop/items/${itemId}/image?v=${version}`;
}

export const Api = {
    auth: {
        test: () => defaultApi.test(),
        me: () => defaultApi.me(),
        logout: () => handleError(defaultApi.logout()),
        startLogin: (username: string) => handleError(defaultApi.startLogin({ StartLoginRequest: { username } })),
        finishLogin: (credential: unknown) =>
            handleError(defaultApi.finishLogin({ FinishLoginRequest: { credential } })),
        startRegistration: (token: string) =>
            handleError(defaultApi.startRegistration({ StartRegistrationRequest: { token } })),
        finishRegistration: (token: string, credential: unknown) =>
            handleError(
                defaultApi.finishRegistration({
                    FinishRegistrationRequest: { token, credential },
                }),
            ),
        passkeys: {
            list: () => handleError(defaultApi.listPasskeys()),
            startAdd: () => handleError(defaultApi.startAddPasskey()),
            finishAdd: (credential: unknown) =>
                handleError(defaultApi.finishAddPasskey({ FinishAddPasskeyRequest: { credential } })),
            delete: (uuid: UUID) => handleError(defaultApi.deletePasskey({ uuid })),
        },
    },
    shop: {
        categories: () => handleError(defaultApi.getCategories()),
        items: () => handleError(defaultApi.getItems()),
        createOrder: (request: CreateOrderRequest) =>
            handleError(defaultApi.createOrder({ CreateOrderRequest: request })),
        orderStatus: (pickupCode: string) => handleError(defaultApi.getOrder({ pickup_code: pickupCode })),
    },
    verkauf: {
        orders: (filter: { status?: OrderStatus; pickup_date?: IsoDate }) => handleError(defaultApi.listOrders(filter)),
        order: (uuid: UUID) => handleError(defaultApi.getOrderDetail({ uuid })),
        setStatus: (uuid: UUID, status: OrderStatus) =>
            handleError(defaultApi.updateOrderStatus({ uuid, UpdateOrderStatusRequest: { status } })),
        setPacked: (uuid: UUID, packed: boolean) =>
            handleError(defaultApi.updateOrderItemPacked({ uuid, UpdateOrderItemPackedRequest: { packed } })),
    },
    admin: {
        categories: {
            list: () => handleError(defaultApi.listCategories()),
            create: (request: CategoryRequest) => handleError(defaultApi.createCategory({ CategoryRequest: request })),
            update: (uuid: UUID, request: CategoryRequest) =>
                handleError(defaultApi.updateCategory({ uuid, CategoryRequest: request })),
            delete: (uuid: UUID) => handleError(defaultApi.deleteCategory({ uuid })),
        },
        items: {
            list: () => handleError(defaultApi.listItems()),
            create: (request: ItemRequest) => handleError(defaultApi.createItem({ ItemRequest: request })),
            update: (uuid: UUID, request: ItemRequest) =>
                handleError(defaultApi.updateItem({ uuid, ItemRequest: request })),
            delete: (uuid: UUID) => handleError(defaultApi.deleteItem({ uuid })),
            setImage: (uuid: UUID, data: string) =>
                handleError(defaultApi.setItemImage({ uuid, SetItemImageRequest: { data } })),
            deleteImage: (uuid: UUID) => handleError(defaultApi.deleteItemImage({ uuid })),
        },
        accounts: {
            list: () => handleError(defaultApi.listAccounts()),
            create: (request: CreateAccountRequest) =>
                handleError(defaultApi.createAccount({ CreateAccountRequest: request })),
            update: (uuid: UUID, request: UpdateAccountRequest) =>
                handleError(defaultApi.updateAccount({ uuid, UpdateAccountRequest: request })),
            invite: (uuid: UUID) => handleError(defaultApi.createInvite({ uuid })),
            delete: (uuid: UUID) => handleError(defaultApi.deleteAccount({ uuid })),
        },
    },
};

/**
 * Wraps a promise returned by the generated SDK which handles its errors and returns a {@link Result}
 *
 * @param promise The promise to wrap. This should be a promise defined in the generated part of the API
 *
 * @returns a new promise with a result that wraps errors from the API
 */
export async function handleError<T>(promise: Promise<T>): Promise<T> {
    try {
        return await promise;
    } catch (e) {
        let msg;
        if (e instanceof ResponseError) {
            if (e.response.status === 401) {
                msg = "Unauthorized";
            } else {
                try {
                    const err = await e.response.json();
                    msg = `${e.response.statusText}. TraceId: ${err.trace_id}`;
                } catch {
                    console.error("Got invalid json", e.response.body);
                    msg = `${e.response.statusText}. The server's response was invalid json.`;
                }
            }
        } else if (e instanceof RequiredError) {
            console.error(e);
            msg = "The server's response didn't match the spec";
        } else {
            console.error("Unknown error occurred:", e);
            msg = "Unknown error occurred";
        }
        ERROR_STORE.report(msg);
        throw msg;
    }
}
