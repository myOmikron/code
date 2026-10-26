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
     */
    created_at: string;
    /**
     * The point in time when the account logged in recently
     */
    last_login_at?: string | null;
    /**
     * The account's role
     */
    role: Role;
    /**
     * The username of the account
     */
    username: string;
    /**
     * Primary key
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
     */
    active: boolean;
    /**
     * Optional customer-facing details such as allergens or ingredients
     */
    additional_info?: string | null;
    /**
     * The number the Bakery orders the item under, unset if it has none
     */
    bakery_article_number?: string | null;
    /**
     * The category the item belongs to
     */
    category?: string | null;
    /**
     * The point in time the item was created
     */
    created_at: string;
    /**
     * Cache-busting version of the item's image, unset if there is none
     */
    image_version?: number | null;
    /**
     * The name of the item
     */
    name: string;
    /**
     * The price in euro cents
     */
    price_cents: number;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * A News Post as Admins see it, Draft or Published
 * @export
 * @interface AdminNewsPost
 */
export interface AdminNewsPost {
    /**
     * The text, as Markdown
     */
    body: string;
    /**
     * The point in time the News Post was created
     */
    created_at: string;
    /**
     * The point in time the News Post was published, unset for a Draft
     */
    published_at?: string | null;
    /**
     * The title
     */
    title: string;
    /**
     * The point in time the News Post was last changed
     */
    updated_at: string;
    /**
     * Primary key
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
     */
    closed: boolean;
    /**
     * The point in time orders close
     */
    deadline: string;
    /**
     * Whether the day is frozen: past its deadline or locked early
     */
    locked: boolean;
    /**
     * When the day was frozen, if it already was
     */
    locked_at?: string | null;
    /**
     * How many orders are placed for this day (cancelled ones excluded)
     */
    order_count: number;
    /**
     * Whether the day deviates from the rule
     */
    overridden: boolean;
    /**
     * The date orders are actually picked up on
     */
    pickup_date: string;
    /**
     * The date the recurring rule produced — the identity of this day
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
     */
    trace_id: string;
}
/**
 * Where the Bakery order goes at the Dispatch
 * @export
 * @interface BakeryAddresses
 */
export interface BakeryAddresses {
    /**
     * The Bakery's mail address; no pickup day is Dispatched while unset
     */
    bakery_email?: string | null;
    /**
     * The Nachbarschaftshilfe's mail address, in CC of the Bakery order
     */
    copy_email?: string | null;
}
/**
 * Request to create or update a category
 * @export
 * @interface CategoryRequest
 */
export interface CategoryRequest {
    /**
     * The name of the category
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
     */
    role: Role;
    /**
     * The username of the account
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
     * Whether the customer wants to pick the order up early in the day
     */
    early_pickup?: boolean;
    /**
     * The customer's email address (this or `phone` must be set)
     */
    email?: string | null;
    /**
     * The customer's first name
     */
    first_name?: string | null;
    /**
     * The positions to order
     */
    items: Array<OrderPositionRequest>;
    /**
     * The language the shop was shown in — every mail about this order uses it
     */
    language?: OrderLanguage;
    /**
     * The customer's last name
     */
    last_name: string;
    /**
     * Optional free-text note
     */
    note?: string | null;
    /**
     * The customer's phone number (this or `email` must be set)
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
     */
    order: PublicOrder;
    /**
     * The customer-facing order code
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
     */
    credential: any | null;
    /**
     * The invite token from the registration link
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
     */
    created_at: string;
    /**
     * Whether the order's pickup day was Dispatched: the Bakery has it
     * 
     * Staff may still cancel the order; what went to the Bakery stays as it is.
     */
    dispatched: boolean;
    /**
     * Whether the customer wants to pick the order up early in the day
     */
    early_pickup: boolean;
    /**
     * The customer's email address
     */
    email?: string | null;
    /**
     * The customer's first name, if given
     */
    first_name?: string | null;
    /**
     * The customer's last name
     */
    last_name: string;
    /**
     * Whether the order is frozen: the customer can no longer cancel it
     */
    locked: boolean;
    /**
     * Optional note
     */
    note?: string | null;
    /**
     * The customer's phone number
     */
    phone?: string | null;
    /**
     * The customer-facing order code
     */
    pickup_code: string;
    /**
     * The day the order is picked up on
     */
    pickup_date: string;
    /**
     * The order's positions
     */
    positions: Array<FullOrderPosition>;
    /**
     * Current status
     */
    status: OrderStatus;
    /**
     * Total over all positions in euro cents
     */
    total_cents: number;
    /**
     * Primary key
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
     */
    name: string;
    /**
     * Whether the position has been packed
     */
    packed: boolean;
    /**
     * Price per unit in euro cents (snapshot at order time)
     */
    price_cents: number;
    /**
     * How many units were ordered
     */
    quantity: number;
    /**
     * Primary key (PATCH target for packing)
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
     */
    registration_link: string;
    /**
     * Primary key of the account
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
     */
    active: boolean;
    /**
     * Optional customer-facing details such as allergens or ingredients
     */
    additional_info?: string | null;
    /**
     * The number the Bakery orders the item under (at most 32 bytes after trimming)
     * 
     * Surrounding whitespace is trimmed; blank or unset means the item has none.
     */
    bakery_article_number?: string | null;
    /**
     * The category the item belongs to
     */
    category?: string | null;
    /**
     * The name of the item
     */
    name: string;
    /**
     * The price in euro cents
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
     */
    imprint_url?: string | null;
    /**
     * Url of the privacy policy, unset while the operator has not configured one
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
     */
    items: Array<AdminItem>;
}
/**
 * All News Posts, Drafts included, newest first
 * @export
 * @interface ListAdminNewsPostsResponse
 */
export interface ListAdminNewsPostsResponse {
    /**
     * The News Posts
     */
    news_posts: Array<AdminNewsPost>;
}
/**
 * All categories
 * @export
 * @interface ListCategoriesResponse
 */
export interface ListCategoriesResponse {
    /**
     * The categories
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
     */
    days: Array<AdminPickupDay>;
}
/**
 * All Published News Posts, newest first
 * @export
 * @interface ListPublishedNewsPostsResponse
 */
export interface ListPublishedNewsPostsResponse {
    /**
     * The News Posts
     */
    news_posts: Array<PublishedNewsPost>;
}
/**
 * The currently logged-in account
 * @export
 * @interface MeResponse
 */
export interface MeResponse {
    /**
     * The account's role
     */
    role: Role;
    /**
     * The username of the account
     */
    username: string;
    /**
     * Primary key of the account
     */
    uuid: string;
}


/**
 * Request to create a News Post or change its title and body
 * @export
 * @interface NewsPostRequest
 */
export interface NewsPostRequest {
    /**
     * The text, as Markdown
     */
    body: string;
    /**
     * The title
     */
    title: string;
}

/**
 * What keeps a frozen pickup day from being Dispatched
 * 
 * Reported from the freeze on, not only once the Dispatch is due, so Verkauf learns during the Review Window that the order will not go out.
 * @export
 */
export const NotDispatchedReason = {
    /**
    * Nothing: the day is open, waits for its Dispatch time, was Dispatched or called off
    */
    None: 'None',
    /**
    * No Bakery address is set, so the Dispatch waits for one
    */
    NoBakeryAddress: 'NoBakeryAddress',
} as const;
export type NotDispatchedReason = typeof NotDispatchedReason[keyof typeof NotDispatchedReason];


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
    En: 'En',
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
     */
    item: string;
    /**
     * How many units to order (1..=99)
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
    Cancelled: 'Cancelled',
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
     */
    created_at: string;
    /**
     * Human-readable device label
     */
    label: string;
    /**
     * The point in time this passkey was last used for a login
     */
    last_used_at?: string | null;
    /**
     * Primary key of the passkey
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
     */
    cancelled_orders: number;
    /**
     * The day after the change
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
     */
    deadline?: string | null;
    /**
     * The pickup date after this one, if the shop already knows it
     */
    next_pickup_date?: string | null;
    /**
     * The date orders are picked up on, unset while no day is open
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
     * The distinct Bakery Article Numbers of the line's Items, sorted
     * 
     * Read live from the Items: deleted Items and Items without a number add none.
     */
    bakery_article_numbers: Array<string>;
    /**
     * Item name (snapshot at order time)
     */
    name: string;
    /**
     * How many orders contain the item
     */
    order_count: number;
    /**
     * Price per unit in euro cents (snapshot at order time)
     */
    price_cents: number;
    /**
     * How many units to procure in total
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
     */
    closed: boolean;
    /**
     * The point in time orders close
     */
    deadline: string;
    /**
     * The point in time the day is Dispatched: its Deadline plus the Review Window
     */
    dispatch_due: string;
    /**
     * When the day was Dispatched; from then on the list is final
     */
    dispatched_at?: string | null;
    /**
     * Whether the day is frozen: customers can no longer order or cancel
     */
    locked: boolean;
    /**
     * Why a frozen day is not Dispatched (yet)
     */
    not_dispatched_reason: NotDispatchedReason;
    /**
     * How many orders the summary covers (cancelled ones excluded)
     */
    order_count: number;
    /**
     * The day the orders are picked up on
     */
    pickup_date: string;
    /**
     * The items to procure, most units first
     */
    positions: Array<ProcurementPosition>;
    /**
     * Total over all positions in euro cents
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
     */
    name: string;
    /**
     * Primary key
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
     */
    additional_info?: string | null;
    /**
     * The category the item belongs to
     */
    category?: string | null;
    /**
     * Cache-busting version of the item's image, unset if there is none
     */
    image_version?: number | null;
    /**
     * The name of the item
     */
    name: string;
    /**
     * The price in euro cents
     */
    price_cents: number;
    /**
     * Primary key
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
     * The point in time the order became binding (or will)
     */
    deadline: string;
    /**
     * Whether the customer wants to pick the order up early in the day
     */
    early_pickup: boolean;
    /**
     * The customer's first name, if given
     */
    first_name?: string | null;
    /**
     * The customer's last name
     */
    last_name: string;
    /**
     * Whether the order is frozen: no cancelling anymore
     */
    locked: boolean;
    /**
     * Optional note
     */
    note?: string | null;
    /**
     * The customer-facing order code
     */
    pickup_code: string;
    /**
     * The day the order is picked up on
     */
    pickup_date: string;
    /**
     * The order's positions
     */
    positions: Array<PublicOrderPosition>;
    /**
     * Current status
     */
    status: OrderStatus;
    /**
     * Total over all positions in euro cents
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
     */
    name: string;
    /**
     * Price per unit in euro cents (snapshot at order time)
     */
    price_cents: number;
    /**
     * How many units were ordered
     */
    quantity: number;
}
/**
 * A Published News Post as customers see it
 * @export
 * @interface PublishedNewsPost
 */
export interface PublishedNewsPost {
    /**
     * The text, as Markdown
     */
    body: string;
    /**
     * The point in time the News Post was published
     */
    published_at: string;
    /**
     * The title
     */
    title: string;
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
    Verkauf: 'Verkauf',
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
     */
    deadline_offset_days: number;
    /**
     * Wall-clock time (Europe/Berlin) orders close at, `13:00:00`
     */
    deadline_time: string;
    /**
     * The weekday orders are picked up on
     */
    pickup_weekday: ScheduleWeekday;
    /**
     * Minutes from a pickup day's Deadline to its Dispatch, 0 or more
     */
    review_window_minutes: number;
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
    Sunday: 'Sunday',
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
     */
    options: any | null;
    /**
     * The username the passkey will be registered for
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
     */
    role: Role;
    /**
     * The username of the account
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
     */
    closed: boolean;
    /**
     * The point in time orders close
     */
    deadline: string;
    /**
     * The date orders are actually picked up on
     */
    pickup_date: string;
}
