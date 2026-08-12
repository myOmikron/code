/* tslint:disable */
/* eslint-disable */
/**
 * A staff account as shown to admins
 * @export
 * @interface AccountSchema
 */
export interface AccountSchema {
    /**
     * The point in time the account was created
     * @type {string}
     * @memberof AccountSchema
     */
    created_at: string;
    /**
     * The point in time when the account logged in recently
     * @type {string}
     * @memberof AccountSchema
     */
    last_login_at?: string | null;
    /**
     * The account's role
     * @type {Role}
     * @memberof AccountSchema
     */
    role: Role;
    /**
     * The username of the account
     * @type {string}
     * @memberof AccountSchema
     */
    username: string;
    /**
     * Primary key
     * @type {string}
     * @memberof AccountSchema
     */
    uuid: string;
}


/**
 * An item as shown to admins (includes inactive items)
 * @export
 * @interface AdminItem
 */
export interface AdminItem {
    /**
     * Whether the item is currently orderable
     * @type {boolean}
     * @memberof AdminItem
     */
    active: boolean;
    /**
     * Optional customer-facing details such as allergens or ingredients
     * @type {string}
     * @memberof AdminItem
     */
    additional_info?: string | null;
    /**
     * The category the item belongs to
     * @type {string}
     * @memberof AdminItem
     */
    category?: string | null;
    /**
     * The point in time the item was created
     * @type {string}
     * @memberof AdminItem
     */
    created_at: string;
    /**
     * Cache-busting version of the item's image, unset if there is none
     * @type {number}
     * @memberof AdminItem
     */
    image_version?: number | null;
    /**
     * The name of the item
     * @type {string}
     * @memberof AdminItem
     */
    name: string;
    /**
     * The price in euro cents
     * @type {number}
     * @memberof AdminItem
     */
    price_cents: number;
    /**
     * Primary key
     * @type {string}
     * @memberof AdminItem
     */
    uuid: string;
}
/**
 * A single upcoming pickup day, rule and override already applied
 * @export
 * @interface AdminPickupDay
 */
export interface AdminPickupDay {
    /**
     * Whether the pickup day was called off
     * @type {boolean}
     * @memberof AdminPickupDay
     */
    closed: boolean;
    /**
     * The point in time orders close
     * @type {string}
     * @memberof AdminPickupDay
     */
    deadline: string;
    /**
     * Whether the day is frozen: past its deadline or locked early
     * @type {boolean}
     * @memberof AdminPickupDay
     */
    locked: boolean;
    /**
     * When the day was frozen, if it already was
     * @type {string}
     * @memberof AdminPickupDay
     */
    locked_at?: string | null;
    /**
     * How many orders are placed for this day (cancelled ones excluded)
     * @type {number}
     * @memberof AdminPickupDay
     */
    order_count: number;
    /**
     * Whether the day deviates from the rule
     * @type {boolean}
     * @memberof AdminPickupDay
     */
    overridden: boolean;
    /**
     * The date orders are actually picked up on
     * @type {string}
     * @memberof AdminPickupDay
     */
    pickup_date: string;
    /**
     * The date the recurring rule produced — the identity of this day
     * @type {string}
     * @memberof AdminPickupDay
     */
    rule_date: string;
}
/**
 * The response that is sent in a case of an error the caller should report to an admin
 * @export
 * @interface ApiErrorResponse
 */
export interface ApiErrorResponse {
    /**
     * ID of the opentelemetry trace this error originated in
     * @type {string}
     * @memberof ApiErrorResponse
     */
    trace_id: string;
}
/**
 * Request to create or update a category
 * @export
 * @interface CategoryRequest
 */
export interface CategoryRequest {
    /**
     * The name of the category
     * @type {string}
     * @memberof CategoryRequest
     */
    name: string;
}
/**
 * Request to create a staff account
 * @export
 * @interface CreateAccountRequest
 */
export interface CreateAccountRequest {
    /**
     * The account's role
     * @type {Role}
     * @memberof CreateAccountRequest
     */
    role: Role;
    /**
     * The username of the account
     * @type {string}
     * @memberof CreateAccountRequest
     */
    username: string;
}


/**
 * Request to place a pre-order
 * @export
 * @interface CreateOrderRequest
 */
export interface CreateOrderRequest {
    /**
     * The customer's name
     * @type {string}
     * @memberof CreateOrderRequest
     */
    customer_name: string;
    /**
     * The customer's email address (this or `phone` must be set)
     * @type {string}
     * @memberof CreateOrderRequest
     */
    email?: string | null;
    /**
     * The positions to order
     * @type {Array<OrderPositionRequest>}
     * @memberof CreateOrderRequest
     */
    items: Array<OrderPositionRequest>;
    /**
     * The language the shop was shown in — every mail about this order uses it
     * @type {OrderLanguage}
     * @memberof CreateOrderRequest
     */
    language?: OrderLanguage;
    /**
     * Optional free-text note
     * @type {string}
     * @memberof CreateOrderRequest
     */
    note?: string | null;
    /**
     * The customer's phone number (this or `email` must be set)
     * @type {string}
     * @memberof CreateOrderRequest
     */
    phone?: string | null;
}


/**
 * Response to a placed order
 * @export
 * @interface CreateOrderResponse
 */
export interface CreateOrderResponse {
    /**
     * The created order
     * @type {PublicOrder}
     * @memberof CreateOrderResponse
     */
    order: PublicOrder;
    /**
     * The customer-facing order code
     * @type {string}
     * @memberof CreateOrderResponse
     */
    pickup_code: string;
}
/**
 * Request to finish an add-passkey ceremony
 * @export
 * @interface FinishAddPasskeyRequest
 */
export interface FinishAddPasskeyRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishAddPasskeyRequest
     */
    credential: any | null;
}
/**
 * Request to finish a login ceremony
 * @export
 * @interface FinishLoginRequest
 */
export interface FinishLoginRequest {
    /**
     * The browser's `PublicKeyCredential` response
     * @type {any}
     * @memberof FinishLoginRequest
     */
    credential: any | null;
}
/**
 * Request to finish an invite-based registration ceremony
 * @export
 * @interface FinishRegistrationRequest
 */
export interface FinishRegistrationRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishRegistrationRequest
     */
    credential: any | null;
    /**
     * The invite token from the registration link
     * @type {string}
     * @memberof FinishRegistrationRequest
     */
    token: string;
}
/**
 * An order as shown to staff (includes contact data)
 * @export
 * @interface FullOrder
 */
export interface FullOrder {
    /**
     * The point in time the order was placed
     * @type {string}
     * @memberof FullOrder
     */
    created_at: string;
    /**
     * The customer's name
     * @type {string}
     * @memberof FullOrder
     */
    customer_name: string;
    /**
     * The customer's email address
     * @type {string}
     * @memberof FullOrder
     */
    email?: string | null;
    /**
     * Whether the order is frozen: the bakery has it, the customer cannot cancel
     * @type {boolean}
     * @memberof FullOrder
     */
    locked: boolean;
    /**
     * Optional note
     * @type {string}
     * @memberof FullOrder
     */
    note?: string | null;
    /**
     * The customer's phone number
     * @type {string}
     * @memberof FullOrder
     */
    phone?: string | null;
    /**
     * The customer-facing order code
     * @type {string}
     * @memberof FullOrder
     */
    pickup_code: string;
    /**
     * The day the order is picked up on
     * @type {string}
     * @memberof FullOrder
     */
    pickup_date: string;
    /**
     * The order's positions
     * @type {Array<FullOrderPosition>}
     * @memberof FullOrder
     */
    positions: Array<FullOrderPosition>;
    /**
     * Current status
     * @type {OrderStatus}
     * @memberof FullOrder
     */
    status: OrderStatus;
    /**
     * Total over all positions in euro cents
     * @type {number}
     * @memberof FullOrder
     */
    total_cents: number;
    /**
     * Primary key
     * @type {string}
     * @memberof FullOrder
     */
    uuid: string;
}


/**
 * A position of an order as shown to staff
 * @export
 * @interface FullOrderPosition
 */
export interface FullOrderPosition {
    /**
     * Item name (snapshot at order time)
     * @type {string}
     * @memberof FullOrderPosition
     */
    name: string;
    /**
     * Whether the position has been packed
     * @type {boolean}
     * @memberof FullOrderPosition
     */
    packed: boolean;
    /**
     * Price per unit in euro cents (snapshot at order time)
     * @type {number}
     * @memberof FullOrderPosition
     */
    price_cents: number;
    /**
     * How many units were ordered
     * @type {number}
     * @memberof FullOrderPosition
     */
    quantity: number;
    /**
     * Primary key (PATCH target for packing)
     * @type {string}
     * @memberof FullOrderPosition
     */
    uuid: string;
}
/**
 * Response to a created account or invite
 * @export
 * @interface InviteResponse
 */
export interface InviteResponse {
    /**
     * One-time link the new device opens to register its passkey
     * @type {string}
     * @memberof InviteResponse
     */
    registration_link: string;
    /**
     * Primary key of the account
     * @type {string}
     * @memberof InviteResponse
     */
    uuid: string;
}
/**
 * Request to create or update an item
 * @export
 * @interface ItemRequest
 */
export interface ItemRequest {
    /**
     * Whether the item is currently orderable
     * @type {boolean}
     * @memberof ItemRequest
     */
    active: boolean;
    /**
     * Optional customer-facing details such as allergens or ingredients
     * @type {string}
     * @memberof ItemRequest
     */
    additional_info?: string | null;
    /**
     * The category the item belongs to
     * @type {string}
     * @memberof ItemRequest
     */
    category?: string | null;
    /**
     * The name of the item
     * @type {string}
     * @memberof ItemRequest
     */
    name: string;
    /**
     * The price in euro cents
     * @type {number}
     * @memberof ItemRequest
     */
    price_cents: number;
}
/**
 * The shop's legal links, as shown in the public footer
 * @export
 * @interface LegalLinks
 */
export interface LegalLinks {
    /**
     * Url of the imprint, unset while the operator has not configured one
     * @type {string}
     * @memberof LegalLinks
     */
    imprint_url?: string | null;
    /**
     * Url of the privacy policy, unset while the operator has not configured one
     * @type {string}
     * @memberof LegalLinks
     */
    privacy_url?: string | null;
}
/**
 * All staff accounts
 * @export
 * @interface ListAccountsResponse
 */
export interface ListAccountsResponse {
    /**
     * The accounts
     * @type {Array<AccountSchema>}
     * @memberof ListAccountsResponse
     */
    accounts: Array<AccountSchema>;
}
/**
 * All items
 * @export
 * @interface ListAdminItemsResponse
 */
export interface ListAdminItemsResponse {
    /**
     * The items
     * @type {Array<AdminItem>}
     * @memberof ListAdminItemsResponse
     */
    items: Array<AdminItem>;
}
/**
 * All categories
 * @export
 * @interface ListCategoriesResponse
 */
export interface ListCategoriesResponse {
    /**
     * The categories
     * @type {Array<PublicCategory>}
     * @memberof ListCategoriesResponse
     */
    categories: Array<PublicCategory>;
}
/**
 * All orderable items
 * @export
 * @interface ListItemsResponse
 */
export interface ListItemsResponse {
    /**
     * The items
     * @type {Array<PublicItem>}
     * @memberof ListItemsResponse
     */
    items: Array<PublicItem>;
}
/**
 * All orders matching the filters
 * @export
 * @interface ListOrdersResponse
 */
export interface ListOrdersResponse {
    /**
     * The orders
     * @type {Array<FullOrder>}
     * @memberof ListOrdersResponse
     */
    orders: Array<FullOrder>;
}
/**
 * All passkeys of the current account
 * @export
 * @interface ListPasskeysResponse
 */
export interface ListPasskeysResponse {
    /**
     * The passkeys
     * @type {Array<PasskeySchema>}
     * @memberof ListPasskeysResponse
     */
    passkeys: Array<PasskeySchema>;
}
/**
 * The upcoming pickup days
 * @export
 * @interface ListPickupDaysResponse
 */
export interface ListPickupDaysResponse {
    /**
     * The days, earliest first
     * @type {Array<AdminPickupDay>}
     * @memberof ListPickupDaysResponse
     */
    days: Array<AdminPickupDay>;
}
/**
 * The currently logged-in account
 * @export
 * @interface MeResponse
 */
export interface MeResponse {
    /**
     * The account's role
     * @type {Role}
     * @memberof MeResponse
     */
    role: Role;
    /**
     * The username of the account
     * @type {string}
     * @memberof MeResponse
     */
    username: string;
    /**
     * Primary key of the account
     * @type {string}
     * @memberof MeResponse
     */
    uuid: string;
}



/**
 * The language every mail about an order is written in
 * 
 * Taken from the UI the customer ordered in and stored with the order: the confirmation mail goes out at the deadline, without a request to ask.
 * @export
 */
export const OrderLanguage = {
    /**
    * German — the default, matching the shop&#39;s primary language
    */
    De: 'De',
    /**
    * English
    */
    En: 'En'
} as const;
export type OrderLanguage = typeof OrderLanguage[keyof typeof OrderLanguage];

/**
 * A single position of an order request
 * @export
 * @interface OrderPositionRequest
 */
export interface OrderPositionRequest {
    /**
     * The item to order
     * @type {string}
     * @memberof OrderPositionRequest
     */
    item: string;
    /**
     * How many units to order (1..=99)
     * @type {number}
     * @memberof OrderPositionRequest
     */
    quantity: number;
}

/**
 * Status of a pre-order
 * 
 * Allowed transitions: `Open -> Ready -> PickedUp`; `Open | Ready -> Cancelled`. `Open -> PickedUp` skips packing — not every order is pre-packed, some are assembled while the customer waits.
 * @export
 */
export const OrderStatus = {
    /**
    * Placed by the customer, not assembled yet
    */
    Open: 'Open',
    /**
    * Assembled and ready for pickup
    */
    Ready: 'Ready',
    /**
    * Handed over to the customer
    */
    PickedUp: 'PickedUp',
    /**
    * Cancelled by the shop
    */
    Cancelled: 'Cancelled'
} as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

/**
 * A passkey registered to the current account
 * @export
 * @interface PasskeySchema
 */
export interface PasskeySchema {
    /**
     * The point in time this passkey was registered
     * @type {string}
     * @memberof PasskeySchema
     */
    created_at: string;
    /**
     * Human-readable device label
     * @type {string}
     * @memberof PasskeySchema
     */
    label: string;
    /**
     * The point in time this passkey was last used for a login
     * @type {string}
     * @memberof PasskeySchema
     */
    last_used_at?: string | null;
    /**
     * Primary key of the passkey
     * @type {string}
     * @memberof PasskeySchema
     */
    uuid: string;
}
/**
 * What a change to a pickup day did
 * @export
 * @interface PickupDayChangeResponse
 */
export interface PickupDayChangeResponse {
    /**
     * How many orders were cancelled by calling the day off
     * @type {number}
     * @memberof PickupDayChangeResponse
     */
    cancelled_orders: number;
    /**
     * How many confirmation mails were queued by freezing the day
     * @type {number}
     * @memberof PickupDayChangeResponse
     */
    confirmed_orders: number;
    /**
     * The day after the change
     * @type {AdminPickupDay}
     * @memberof PickupDayChangeResponse
     */
    day: AdminPickupDay;
}
/**
 * The pickup day customers can currently order for
 * @export
 * @interface PickupWindowResponse
 */
export interface PickupWindowResponse {
    /**
     * The point in time orders close, unset while no day is open
     * @type {string}
     * @memberof PickupWindowResponse
     */
    deadline?: string | null;
    /**
     * The pickup date after this one, if the shop already knows it
     * @type {string}
     * @memberof PickupWindowResponse
     */
    next_pickup_date?: string | null;
    /**
     * The date orders are picked up on, unset while no day is open
     * @type {string}
     * @memberof PickupWindowResponse
     */
    pickup_date?: string | null;
}
/**
 * One item summed over every order of a pickup day
 * @export
 * @interface ProcurementPosition
 */
export interface ProcurementPosition {
    /**
     * Item name (snapshot at order time)
     * @type {string}
     * @memberof ProcurementPosition
     */
    name: string;
    /**
     * How many orders contain the item
     * @type {number}
     * @memberof ProcurementPosition
     */
    order_count: number;
    /**
     * Price per unit in euro cents (snapshot at order time)
     * @type {number}
     * @memberof ProcurementPosition
     */
    price_cents: number;
    /**
     * How many units to procure in total
     * @type {number}
     * @memberof ProcurementPosition
     */
    total_quantity: number;
}
/**
 * What has to be procured for one pickup day
 * @export
 * @interface ProcurementSummary
 */
export interface ProcurementSummary {
    /**
     * Whether the day was called off
     * @type {boolean}
     * @memberof ProcurementSummary
     */
    closed: boolean;
    /**
     * The point in time orders close
     * @type {string}
     * @memberof ProcurementSummary
     */
    deadline: string;
    /**
     * Whether the day is frozen — only then the list is final
     * @type {boolean}
     * @memberof ProcurementSummary
     */
    locked: boolean;
    /**
     * How many orders the summary covers (cancelled ones excluded)
     * @type {number}
     * @memberof ProcurementSummary
     */
    order_count: number;
    /**
     * The day the orders are picked up on
     * @type {string}
     * @memberof ProcurementSummary
     */
    pickup_date: string;
    /**
     * The items to procure, most units first
     * @type {Array<ProcurementPosition>}
     * @memberof ProcurementSummary
     */
    positions: Array<ProcurementPosition>;
    /**
     * Total over all positions in euro cents
     * @type {number}
     * @memberof ProcurementSummary
     */
    total_cents: number;
}
/**
 * A category as shown in the public shop
 * @export
 * @interface PublicCategory
 */
export interface PublicCategory {
    /**
     * The name of the category
     * @type {string}
     * @memberof PublicCategory
     */
    name: string;
    /**
     * Primary key
     * @type {string}
     * @memberof PublicCategory
     */
    uuid: string;
}
/**
 * An orderable item as shown in the public shop
 * @export
 * @interface PublicItem
 */
export interface PublicItem {
    /**
     * Optional customer-facing details such as allergens or ingredients
     * @type {string}
     * @memberof PublicItem
     */
    additional_info?: string | null;
    /**
     * The category the item belongs to
     * @type {string}
     * @memberof PublicItem
     */
    category?: string | null;
    /**
     * Cache-busting version of the item's image, unset if there is none
     * @type {number}
     * @memberof PublicItem
     */
    image_version?: number | null;
    /**
     * The name of the item
     * @type {string}
     * @memberof PublicItem
     */
    name: string;
    /**
     * The price in euro cents
     * @type {number}
     * @memberof PublicItem
     */
    price_cents: number;
    /**
     * Primary key
     * @type {string}
     * @memberof PublicItem
     */
    uuid: string;
}
/**
 * An order as shown to the customer (no contact data echoed)
 * @export
 * @interface PublicOrder
 */
export interface PublicOrder {
    /**
     * The customer's name
     * @type {string}
     * @memberof PublicOrder
     */
    customer_name: string;
    /**
     * The point in time the order became binding (or will)
     * @type {string}
     * @memberof PublicOrder
     */
    deadline: string;
    /**
     * Whether the order is frozen: no cancelling anymore
     * @type {boolean}
     * @memberof PublicOrder
     */
    locked: boolean;
    /**
     * Optional note
     * @type {string}
     * @memberof PublicOrder
     */
    note?: string | null;
    /**
     * The customer-facing order code
     * @type {string}
     * @memberof PublicOrder
     */
    pickup_code: string;
    /**
     * The day the order is picked up on
     * @type {string}
     * @memberof PublicOrder
     */
    pickup_date: string;
    /**
     * The order's positions
     * @type {Array<PublicOrderPosition>}
     * @memberof PublicOrder
     */
    positions: Array<PublicOrderPosition>;
    /**
     * Current status
     * @type {OrderStatus}
     * @memberof PublicOrder
     */
    status: OrderStatus;
    /**
     * Total over all positions in euro cents
     * @type {number}
     * @memberof PublicOrder
     */
    total_cents: number;
}


/**
 * A position of an order as shown to the customer
 * @export
 * @interface PublicOrderPosition
 */
export interface PublicOrderPosition {
    /**
     * Item name (snapshot at order time)
     * @type {string}
     * @memberof PublicOrderPosition
     */
    name: string;
    /**
     * Price per unit in euro cents (snapshot at order time)
     * @type {number}
     * @memberof PublicOrderPosition
     */
    price_cents: number;
    /**
     * How many units were ordered
     * @type {number}
     * @memberof PublicOrderPosition
     */
    quantity: number;
}

/**
 * Role of a staff account
 * 
 * `Admin` implies all permissions of `Verkauf`.
 * @export
 */
export const Role = {
    /**
    * Manages items, prices, categories and staff accounts
    */
    Admin: 'Admin',
    /**
    * Processes incoming pre-orders in the shop
    */
    Verkauf: 'Verkauf'
} as const;
export type Role = typeof Role[keyof typeof Role];

/**
 * The recurring rule every pickup date and deadline is derived from
 * @export
 * @interface ScheduleSchema
 */
export interface ScheduleSchema {
    /**
     * How many days before the pickup date orders close (0 = the day itself)
     * @type {number}
     * @memberof ScheduleSchema
     */
    deadline_offset_days: number;
    /**
     * Wall-clock time (Europe/Berlin) orders close at
     * @type {string}
     * @memberof ScheduleSchema
     */
    deadline_time: string;
    /**
     * The weekday orders are picked up on
     * @type {ScheduleWeekday}
     * @memberof ScheduleSchema
     */
    pickup_weekday: ScheduleWeekday;
}



/**
 * A weekday, stored by name
 * 
 * [`time::Weekday`] cannot be a database field, and a plain integer would leave the numbering (Monday = 0? = 1? = 7?) implicit in every conversion.
 * @export
 */
export const ScheduleWeekday = {
    /**
    * Monday
    */
    Monday: 'Monday',
    /**
    * Tuesday
    */
    Tuesday: 'Tuesday',
    /**
    * Wednesday
    */
    Wednesday: 'Wednesday',
    /**
    * Thursday
    */
    Thursday: 'Thursday',
    /**
    * Friday
    */
    Friday: 'Friday',
    /**
    * Saturday
    */
    Saturday: 'Saturday',
    /**
    * Sunday
    */
    Sunday: 'Sunday'
} as const;
export type ScheduleWeekday = typeof ScheduleWeekday[keyof typeof ScheduleWeekday];

/**
 * Request to set an item's product photo
 * @export
 * @interface SetItemImageRequest
 */
export interface SetItemImageRequest {
    /**
     * The image file (jpeg/png/webp), base64 encoded
     * @type {string}
     * @memberof SetItemImageRequest
     */
    data: string;
}
/**
 * Response to a started add-passkey ceremony (logged-in user, new device)
 * @export
 * @interface StartAddPasskeyResponse
 */
export interface StartAddPasskeyResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartAddPasskeyResponse
     */
    options: any | null;
}
/**
 * Request to start a login ceremony
 * @export
 * @interface StartLoginRequest
 */
export interface StartLoginRequest {
    /**
     * The username to authenticate
     * @type {string}
     * @memberof StartLoginRequest
     */
    username: string;
}
/**
 * Response to a started login ceremony
 * @export
 * @interface StartLoginResponse
 */
export interface StartLoginResponse {
    /**
     * `PublicKeyCredentialRequestOptions` to pass to the browser
     * @type {any}
     * @memberof StartLoginResponse
     */
    options: any | null;
}
/**
 * Request to start an invite-based registration ceremony
 * @export
 * @interface StartRegistrationRequest
 */
export interface StartRegistrationRequest {
    /**
     * The invite token from the registration link
     * @type {string}
     * @memberof StartRegistrationRequest
     */
    token: string;
}
/**
 * Response to a started registration ceremony
 * @export
 * @interface StartRegistrationResponse
 */
export interface StartRegistrationResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartRegistrationResponse
     */
    options: any | null;
    /**
     * The username the passkey will be registered for
     * @type {string}
     * @memberof StartRegistrationResponse
     */
    username: string;
}
/**
 * Request to update a staff account
 * @export
 * @interface UpdateAccountRequest
 */
export interface UpdateAccountRequest {
    /**
     * The account's role
     * @type {Role}
     * @memberof UpdateAccountRequest
     */
    role: Role;
    /**
     * The username of the account
     * @type {string}
     * @memberof UpdateAccountRequest
     */
    username: string;
}


/**
 * Request to change a position's packed flag
 * @export
 * @interface UpdateOrderItemPackedRequest
 */
export interface UpdateOrderItemPackedRequest {
    /**
     * Whether the position has been packed
     * @type {boolean}
     * @memberof UpdateOrderItemPackedRequest
     */
    packed: boolean;
}
/**
 * Request to change an order's status
 * @export
 * @interface UpdateOrderStatusRequest
 */
export interface UpdateOrderStatusRequest {
    /**
     * The new status
     * @type {OrderStatus}
     * @memberof UpdateOrderStatusRequest
     */
    status: OrderStatus;
}


/**
 * Request to change a single pickup day
 * @export
 * @interface UpdatePickupDayRequest
 */
export interface UpdatePickupDayRequest {
    /**
     * Whether the pickup day is called off
     * 
     * Calling off a day cancels every order placed for it.
     * @type {boolean}
     * @memberof UpdatePickupDayRequest
     */
    closed: boolean;
    /**
     * The point in time orders close
     * @type {string}
     * @memberof UpdatePickupDayRequest
     */
    deadline: string;
    /**
     * The date orders are actually picked up on
     * @type {string}
     * @memberof UpdatePickupDayRequest
     */
    pickup_date: string;
}
