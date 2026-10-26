/* tslint:disable */
/* eslint-disable */
/**
 * Why an Account could not be added as a Participant
 * @export
 * @interface AddAccountParticipantErrors
 */
export interface AddAccountParticipantErrors {
    /**
     * The Account already is a Participant
     * @type {boolean}
     * @memberof AddAccountParticipantErrors
     */
    already_participant: boolean;
    /**
     * The Swiss Rounds are over, so nobody is added any more
     * @type {boolean}
     * @memberof AddAccountParticipantErrors
     */
    roster_closed: boolean;
    /**
     * The caller named too many unknown usernames lately, so this one was not looked up
     * @type {boolean}
     * @memberof AddAccountParticipantErrors
     */
    too_many_unknown_usernames: boolean;
    /**
     * No Account goes by this username
     * @type {boolean}
     * @memberof AddAccountParticipantErrors
     */
    unknown_username: boolean;
}
/**
 * The Account an Organizer adds as a Participant
 * @export
 * @interface AddAccountParticipantRequest
 */
export interface AddAccountParticipantRequest {
    /**
     * Username of the Account, case ignored
     * @type {string}
     * @memberof AddAccountParticipantRequest
     */
    username: string;
}
/**
 * Why an Account could not be named a Co-organizer
 * @export
 * @interface AddCoOrganizerErrors
 */
export interface AddCoOrganizerErrors {
    /**
     * The Account is a Co-organizer already
     * @type {boolean}
     * @memberof AddCoOrganizerErrors
     */
    already_co_organizer: boolean;
    /**
     * The Account is the Owner
     * @type {boolean}
     * @memberof AddCoOrganizerErrors
     */
    owner: boolean;
    /**
     * The caller named too many unknown usernames lately, so this one was not looked up
     * @type {boolean}
     * @memberof AddCoOrganizerErrors
     */
    too_many_unknown_usernames: boolean;
    /**
     * No Account goes by this username
     * @type {boolean}
     * @memberof AddCoOrganizerErrors
     */
    unknown_username: boolean;
}
/**
 * Request to file stacks into a collection
 * @export
 * @interface AddCollectionEntriesRequest
 */
export interface AddCollectionEntriesRequest {
    /**
     * The stacks to file
     */
    entries: Array<NewCollectionEntry>;
}
/**
 * A card to put into a deck
 * @export
 * @interface AddDeckCardRequest
 */
export interface AddDeckCardRequest {
    /**
     * Whether the copies are the foil ones, `null` for the ordinary ones
     */
    foil?: boolean | null;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * Whether the copies are stand-ins rather than the real cards, `null` for the ordinary ones
     */
    proxy?: boolean | null;
    /**
     * How many copies to put in
     */
    quantity: number;
    /**
     * Which zone it goes into
     */
    zone: DeckZone;
}


/**
 * Why a Guest could not be added
 * @export
 * @interface AddGuestParticipantErrors
 */
export interface AddGuestParticipantErrors {
    /**
     * The name is empty or only blanks
     * @type {boolean}
     * @memberof AddGuestParticipantErrors
     */
    empty_name: boolean;
    /**
     * The Swiss Rounds are over, so nobody is added any more
     * @type {boolean}
     * @memberof AddGuestParticipantErrors
     */
    roster_closed: boolean;
}
/**
 * The Guest an Organizer adds as a Participant
 * @export
 * @interface AddGuestParticipantRequest
 */
export interface AddGuestParticipantRequest {
    /**
     * The name the Guest goes by in this Tournament
     * @type {string}
     * @memberof AddGuestParticipantRequest
     */
    name: string;
}
/**
 * Why a passkey could not be added
 * @export
 * @interface AddPasskeyErrors
 */
export interface AddPasskeyErrors {
    /**
     * This authenticator already holds a passkey for this account
     */
    already_registered: boolean;
    /**
     * The browser's response was not a credential
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `passkeys/start` was never called
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     */
    registration_failed: boolean;
}
/**
 * Add a stack to a session
 * @export
 * @interface AddScannerSessionEntryRequest
 */
export interface AddScannerSessionEntryRequest {
    /**
     * Physical finish
     */
    finish: CardFinish;
    /**
     * Scryfall printing id
     */
    printing: string;
    /**
     * Paid price per copy in euro cents
     */
    purchase_price_cents?: number | null;
    /**
     * Number of copies
     */
    quantity: number;
    /**
     * Whether the cards are signed
     */
    signed?: boolean;
}


/**
 * @type AddTournamentAccount200Response
 * 
 * @export
 */
export type AddTournamentAccount200Response = FormErrorResponseForAddAccountParticipantErrors | ParticipantResponse;
/**
 * @type AddTournamentCoOrganizer200Response
 * 
 * @export
 */
export type AddTournamentCoOrganizer200Response = FormErrorResponseForAddCoOrganizerErrors | OrganizerResponse;
/**
 * @type AddTournamentGuest200Response
 * 
 * @export
 */
export type AddTournamentGuest200Response = FormErrorResponseForAddGuestParticipantErrors | ParticipantResponse;
/**
 * Request to put a card on a watch list
 * @export
 * @interface AddWatchListEntryRequest
 */
export interface AddWatchListEntryRequest {
    /**
     * Alarm below this price in euro cents, `None` for no alarm
     */
    alarm_price_cents?: number | null;
    /**
     * Whether only this very printing counts
     */
    exact_printing: boolean;
    /**
     * The finish that is wanted
     */
    finish: CardFinish;
    /**
     * Which languages count, as Scryfall's codes; empty for any
     */
    languages?: Array<string>;
    /**
     * Whether only the named finish counts
     */
    match_finish: boolean;
    /**
     * What the entry is for
     */
    note: string;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * How many copies the account is after, at least one
     */
    wanted: number;
}


/**
 * An Account in the admin list
 * @export
 * @interface AdminAccount
 */
export interface AdminAccount {
    /**
     * Collections on the shelf, without the ones standing for a deck
     */
    collections: number;
    /**
     * When the Account was created
     */
    created_at: string;
    /**
     * Decks of the Account
     */
    decks: number;
    /**
     * Email address
     */
    email: string;
    /**
     * The Account's Lock, `None` while it is not locked
     */
    lock?: AdminAccountLock | null;
    /**
     * The OpenID provider an External Account logs in through, `None` for a Local Account
     */
    openid_provider?: AdminOpenIdProvider | null;
    /**
     * What the Account may do
     */
    role: Role;
    /**
     * Login handle and display name
     */
    username: string;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * An Account on the admin detail page
 * @export
 * @interface AdminAccountDetail
 */
export interface AdminAccountDetail {
    /**
     * What the list shows
     */
    account: AdminAccount;
    /**
     * Cards the Account owns, on the shelf and sleeved in decks
     */
    cards: number;
    /**
     * Passkeys the Account can log in with
     */
    passkeys: number;
}
/**
 * An Account's Lock
 * @export
 * @interface AdminAccountLock
 */
export interface AdminAccountLock {
    /**
     * When the Account was locked
     */
    locked_at: string;
    /**
     * Why it was locked
     */
    reason: string;
}
/**
 * A Bug report as the list shows it
 * @export
 * @interface AdminBugReport
 */
export interface AdminBugReport {
    /**
     * When it was sent
     */
    created_at: string;
    /**
     * The running number
     */
    number: number;
    /**
     * Whether its images and diagnostics were purged
     */
    purged: boolean;
    /**
     * The Release the app was running
     */
    release: string;
    /**
     * Who sent it
     */
    reporter: BugReportAccount;
    /**
     * The route the app was on
     */
    route: string;
    /**
     * Open or done
     */
    state: BugReportState;
}


/**
 * A Bug report with everything it holds
 * @export
 * @interface AdminBugReportDetail
 */
export interface AdminBugReportDetail {
    /**
     * The diagnostics document the app built, `None` once purged
     */
    diagnostics?: any | null;
    /**
     * When it was marked done
     */
    done_at?: string | null;
    /**
     * The Admin that marked it done, `None` while open or once that Admin is deleted
     */
    done_by?: BugReportAccount | null;
    /**
     * Its images, in the order they were sent, empty once purged
     */
    images: Array<BugReportImageInfo>;
    /**
     * The browser's language
     */
    language: string;
    /**
     * The Admins' internal note
     */
    note?: string | null;
    /**
     * When its images and diagnostics were purged
     */
    purged_at?: string | null;
    /**
     * What the list shows
     */
    report: AdminBugReport;
    /**
     * What went wrong, in the player's words
     */
    text: string;
    /**
     * The browser's user agent
     */
    user_agent: string;
    /**
     * The browser window's size
     */
    viewport: string;
}

/**
 * Which Bug reports the list shows
 * @export
 */
export const AdminBugReportFilter = {
    /**
    * The open ones
    */
    Open: 'Open',
    /**
    * The done ones
    */
    Done: 'Done',
    /**
    * All of them
    */
    All: 'All',
} as const;
export type AdminBugReportFilter = typeof AdminBugReportFilter[keyof typeof AdminBugReportFilter];

/**
 * The file the catalog was last read from
 * @export
 * @interface AdminCatalogStamp
 */
export interface AdminCatalogStamp {
    /**
     * The `updated_at` Scryfall stamped the bulk file with
     */
    bulk_updated_at: string;
    /**
     * When it was read
     */
    synced_at: string;
}
/**
 * The catalog sync
 * @export
 * @interface AdminCatalogSync
 */
export interface AdminCatalogSync {
    /**
     * Its Sync runs
     */
    runs: AdminSyncRuns;
    /**
     * The file the catalog was last read from, `None` before the first read
     */
    stamp?: AdminCatalogStamp | null;
}
/**
 * Why an Account could not be deleted
 * @export
 * @interface AdminDeleteAccountErrors
 */
export interface AdminDeleteAccountErrors {
    /**
     * The Account is the Admin's own, which it cannot delete
     */
    own_account: boolean;
    /**
     * The typed username is not the Account's
     */
    username_mismatch: boolean;
}
/**
 * Request to delete an Account
 * @export
 * @interface AdminDeleteAccountRequest
 */
export interface AdminDeleteAccountRequest {
    /**
     * What happens to the Account's public decks
     */
    mode?: DeletionMode;
    /**
     * The Account's username, typed out by the Admin
     */
    username: string;
}


/**
 * One page of the Account list, newest first
 * @export
 * @interface AdminListAccountsResponse
 */
export interface AdminListAccountsResponse {
    /**
     * The Accounts
     */
    accounts: Array<AdminAccount>;
    /**
     * Pass as `after` for the next page, `None` on the last one
     */
    next_cursor?: string | null;
}
/**
 * One page of Bug reports, newest first
 * @export
 * @interface AdminListBugReportsResponse
 */
export interface AdminListBugReportsResponse {
    /**
     * Pass as `after` for the next page, `None` on the last one
     */
    next_cursor?: number | null;
    /**
     * The Bug reports
     */
    reports: Array<AdminBugReport>;
}
/**
 * One page of the Admin log, newest first
 * @export
 * @interface AdminListLogResponse
 */
export interface AdminListLogResponse {
    /**
     * The entries
     */
    entries: Array<AdminLogEntryResponse>;
    /**
     * Pass as `after` for the next page, `None` on the last one
     */
    next_cursor?: string | null;
}
/**
 * Why an Account could not be locked
 * @export
 * @interface AdminLockAccountErrors
 */
export interface AdminLockAccountErrors {
    /**
     * The Account is locked already
     */
    already_locked: boolean;
    /**
     * The Account is the Admin's own, which it cannot Lock
     */
    own_account: boolean;
    /**
     * No reason was given
     */
    reason_missing: boolean;
}
/**
 * Request to Lock an Account
 * @export
 * @interface AdminLockAccountRequest
 */
export interface AdminLockAccountRequest {
    /**
     * Why the Account is locked, shown to Admins only
     */
    reason: string;
}
/**
 * @type AdminLogAction
 * What an Admin did to an Account, with what the action needs to be read
 * @export
 */
export type AdminLogAction = AdminLogActionOneOf | AdminLogActionOneOf1 | AdminLogActionOneOf2 | AdminLogActionOneOf3 | AdminLogActionOneOf4;
/**
 * Locked the Account
 * @export
 * @interface AdminLogActionOneOf
 */
export interface AdminLogActionOneOf {
    /**
     * 
     */
    kind: AdminLogActionOneOfKindEnum;
    /**
     * Why the Account was locked
     */
    reason: string;
}


/**
 * @export
 */
export const AdminLogActionOneOfKindEnum = {
    Lock: 'Lock',
} as const;
export type AdminLogActionOneOfKindEnum = typeof AdminLogActionOneOfKindEnum[keyof typeof AdminLogActionOneOfKindEnum];

/**
 * Lifted the Account's Lock
 * @export
 * @interface AdminLogActionOneOf1
 */
export interface AdminLogActionOneOf1 {
    /**
     * 
     */
    kind: AdminLogActionOneOf1KindEnum;
    /**
     * Why the Lock was lifted, if the Admin said
     */
    reason?: string | null;
}


/**
 * @export
 */
export const AdminLogActionOneOf1KindEnum = {
    Unlock: 'Unlock',
} as const;
export type AdminLogActionOneOf1KindEnum = typeof AdminLogActionOneOf1KindEnum[keyof typeof AdminLogActionOneOf1KindEnum];

/**
 * Gave the Account another Role
 * @export
 * @interface AdminLogActionOneOf2
 */
export interface AdminLogActionOneOf2 {
    /**
     * 
     */
    kind: AdminLogActionOneOf2KindEnum;
    /**
     * The Role the Account has now
     */
    role: Role;
}


/**
 * @export
 */
export const AdminLogActionOneOf2KindEnum = {
    RoleChange: 'RoleChange',
} as const;
export type AdminLogActionOneOf2KindEnum = typeof AdminLogActionOneOf2KindEnum[keyof typeof AdminLogActionOneOf2KindEnum];

/**
 * Deleted the Account
 * @export
 * @interface AdminLogActionOneOf3
 */
export interface AdminLogActionOneOf3 {
    /**
     * 
     */
    kind: AdminLogActionOneOf3KindEnum;
    /**
     * What happened to the Account's public decks
     */
    mode: DeletionMode;
}


/**
 * @export
 */
export const AdminLogActionOneOf3KindEnum = {
    Deletion: 'Deletion',
} as const;
export type AdminLogActionOneOf3KindEnum = typeof AdminLogActionOneOf3KindEnum[keyof typeof AdminLogActionOneOf3KindEnum];

/**
 * Gave the Account another username
 * @export
 * @interface AdminLogActionOneOf4
 */
export interface AdminLogActionOneOf4 {
    /**
     * 
     */
    kind: AdminLogActionOneOf4KindEnum;
    /**
     * The username the Account has now
     */
    new_username: any;
    /**
     * Why the Account was renamed
     */
    reason: string;
}


/**
 * @export
 */
export const AdminLogActionOneOf4KindEnum = {
    Rename: 'Rename',
} as const;
export type AdminLogActionOneOf4KindEnum = typeof AdminLogActionOneOf4KindEnum[keyof typeof AdminLogActionOneOf4KindEnum];

/**
 * One entry of the Admin log
 * @export
 * @interface AdminLogEntryResponse
 */
export interface AdminLogEntryResponse {
    /**
     * The affected Account, `None` once it is deleted
     */
    account?: string | null;
    /**
     * The affected Account's username at the time
     */
    account_username: string;
    /**
     * What the Admin did
     */
    action: AdminLogAction;
    /**
     * The acting Admin, `None` once it is deleted or for a change made through the cli
     */
    admin?: string | null;
    /**
     * The acting Admin's username at the time
     */
    admin_username: string;
    /**
     * When the Admin acted
     */
    created_at: string;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * The OpenID provider an External Account logs in through
 * @export
 * @interface AdminOpenIdProvider
 */
export interface AdminOpenIdProvider {
    /**
     * What the frontend calls the provider, `None` once it is no longer configured
     */
    display_name?: string | null;
    /**
     * The provider's issuer
     */
    issuer: string;
}
/**
 * The file the prices were last read from
 * @export
 * @interface AdminPriceGuideStamp
 */
export interface AdminPriceGuideStamp {
    /**
     * The day it quoted prices for
     */
    day: string;
    /**
     * The etag the file was served under
     */
    etag: string;
}
/**
 * The price guide sync
 * @export
 * @interface AdminPriceGuideSync
 */
export interface AdminPriceGuideSync {
    /**
     * Its Sync runs
     */
    runs: AdminSyncRuns;
    /**
     * The file the prices were last read from, `None` before the first read
     */
    stamp?: AdminPriceGuideStamp | null;
}
/**
 * Why an Account could not be renamed
 * @export
 * @interface AdminRenameAccountErrors
 */
export interface AdminRenameAccountErrors {
    /**
     * The Account is the Admin's own, which it renames through its own settings
     */
    own_account: boolean;
    /**
     * No reason was given
     */
    reason_missing: boolean;
    /**
     * Another Account goes by this username already, case ignored
     */
    username_taken: boolean;
}
/**
 * Request to Rename an Account
 * @export
 * @interface AdminRenameAccountRequest
 */
export interface AdminRenameAccountRequest {
    /**
     * The language of the mail that tells the Account its new username
     * 
     * The client sends the language its UI is showing; left out, the mail falls back to German, the app's primary language.
     */
    language?: MailLanguage;
    /**
     * Why the Account is renamed, shown to Admins only
     */
    reason: string;
    /**
     * The new username, held to the same rules as at signup
     */
    username: any;
}


/**
 * Request to set the Admins' note on a Bug report
 * @export
 * @interface AdminSetBugReportNoteRequest
 */
export interface AdminSetBugReportNoteRequest {
    /**
     * The note, empty to remove it
     */
    note: string;
}
/**
 * Why a Role could not be changed
 * @export
 * @interface AdminSetRoleErrors
 */
export interface AdminSetRoleErrors {
    /**
     * The Account is the Admin's own, which it cannot demote
     */
    own_account: boolean;
}
/**
 * Request to change an Account's Role
 * @export
 * @interface AdminSetRoleRequest
 */
export interface AdminSetRoleRequest {
    /**
     * The new Role
     */
    role: Role;
}


/**
 * The newest Statistics snapshot and the ones of the last 30 days
 * @export
 * @interface AdminStatisticsResponse
 */
export interface AdminStatisticsResponse {
    /**
     * Snapshots of the last 30 days, oldest first
     */
    history: Array<AdminStatisticsSnapshot>;
    /**
     * The most recent snapshot, `None` before the first one was taken
     */
    newest?: AdminStatisticsSnapshot | null;
}
/**
 * Service-wide counts at one point in time
 * @export
 * @interface AdminStatisticsSnapshot
 */
export interface AdminStatisticsSnapshot {
    /**
     * Accounts, without the Tombstone
     */
    accounts: number;
    /**
     * Cards, on the shelf and sleeved in decks
     */
    cards: number;
    /**
     * Collections on a shelf, without the ones standing for a deck
     */
    collections: number;
    /**
     * Decks
     */
    decks: number;
    /**
     * Finished Tournaments; zero before Tournaments were counted
     * @type {number}
     * @memberof AdminStatisticsSnapshot
     */
    finished_tournaments: number;
    /**
     * Accounts created in the 7 days before `taken_at`
     */
    new_accounts: number;
    /**
     * Scanner sessions holding at least one card not yet filed
     */
    open_scanner_sessions: number;
    /**
     * Public decks
     */
    public_decks: number;
    /**
     * When the counts were taken
     */
    taken_at: string;
    /**
     * Tournaments in any state; zero before Tournaments were counted
     * @type {number}
     * @memberof AdminStatisticsSnapshot
     */
    tournaments: number;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * One Sync run
 * @export
 * @interface AdminSyncRun
 */
export interface AdminSyncRun {
    /**
     * How long it took, in milliseconds
     */
    duration_ms: number;
    /**
     * Why it failed
     */
    error?: string | null;
    /**
     * What it came to
     */
    outcome: SyncRunOutcome;
    /**
     * When it started
     */
    started_at: string;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * The Sync runs of one sync
 * @export
 * @interface AdminSyncRuns
 */
export interface AdminSyncRuns {
    /**
     * The newest run
     */
    last_attempt?: AdminSyncRun | null;
    /**
     * The newest run that failed, with its error
     */
    last_failure?: AdminSyncRun | null;
    /**
     * The newest run that did not fail
     */
    last_success?: AdminSyncRun | null;
    /**
     * The newest runs, newest first
     */
    recent: Array<AdminSyncRun>;
}
/**
 * The state of both syncs
 * @export
 * @interface AdminSyncsResponse
 */
export interface AdminSyncsResponse {
    /**
     * The catalog sync from Scryfall
     */
    catalog: AdminCatalogSync;
    /**
     * The price guide sync from Cardmarket
     */
    price_guide: AdminPriceGuideSync;
}
/**
 * Why an Account's Lock could not be lifted
 * @export
 * @interface AdminUnlockAccountErrors
 */
export interface AdminUnlockAccountErrors {
    /**
     * The Account is not locked
     */
    not_locked: boolean;
}
/**
 * Request to lift an Account's Lock
 * @export
 * @interface AdminUnlockAccountRequest
 */
export interface AdminUnlockAccountRequest {
    /**
     * Why the Lock is lifted, shown to Admins only
     */
    reason?: string | null;
}
/**
 * One reader's advisor settings for one deck
 * 
 * The same six fields as [`SetAdvisorSettingsRequest`] — a settings document is the same document going in and coming out. Two named types rather than one reused so the generated client names request and response separately.
 * @export
 * @interface AdvisorSettingsResponse
 */
export interface AdvisorSettingsResponse {
    /**
     * Cards the advisor must never offer
     */
    ignored: Array<MarkedCard>;
    /**
     * Cards the advisor must never propose cutting
     */
    kept: Array<MarkedCard>;
    /**
     * The restriction on what may be suggested at all, `null` for the whole pool
     */
    pool_query?: string | null;
    /**
     * Whether the reader has been through the advisor's questions
     */
    setup_done: boolean;
    /**
     * The shape the deck is graded against, where it was moved
     */
    targets: DeckTargets;
    /**
     * Which themes to argue for and which to avoid
     */
    themes: ThemePrefs;
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
 * Why a layout of a previewed Round was refused
 * @export
 * @interface ArrangeRoundErrors
 */
export interface ArrangeRoundErrors {
    /**
     * A Match seats a number of Participants it cannot have
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    match_size: boolean;
    /**
     * The Ruleset never gives a Bye
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    no_byes: boolean;
    /**
     * Somebody sits who is no Participant the Round pairs
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    not_pairable: boolean;
    /**
     * No Round of that number is previewed
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    not_previewed: boolean;
    /**
     * A Participant the Round pairs sits nowhere
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    not_seated: boolean;
    /**
     * Somebody sits more than once
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    seated_twice: boolean;
    /**
     * The Round is one of the Top cut, which the standings seed
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    top_cut: boolean;
    /**
     * The Tournament is Finished or Cancelled
     * @type {boolean}
     * @memberof ArrangeRoundErrors
     */
    tournament_over: boolean;
}
/**
 * An Organizer's layout of a previewed Round
 * @export
 * @interface ArrangeRoundRequest
 */
export interface ArrangeRoundRequest {
    /**
     * Who has a Bye
     * @type {Array<string>}
     * @memberof ArrangeRoundRequest
     */
    byes: Array<string>;
    /**
     * The Matches, top table first, each listing its Participants in Seat order
     * @type {Array<Array<string>>}
     * @memberof ArrangeRoundRequest
     */
    matches: Array<Array<string>>;
}

/**
 * How many Games a one-on-one Match is played to
 * @export
 */
export const BestOf = {
    /**
    * One Game decides the Match
    */
    One: 'One',
    /**
    * Whoever wins two Games first wins the Match
    */
    Three: 'Three'
} as const;
export type BestOf = typeof BestOf[keyof typeof BestOf];

/**
 * Which Commander bracket rules one printing counts towards
 * @export
 * @interface BracketFlagsEntryResponse
 */
export interface BracketFlagsEntryResponse {
    /**
     * Whether the card takes extra turns
     */
    extra_turns: boolean;
    /**
     * Whether Wizards lists the card as a Game Changer
     */
    game_changer: boolean;
    /**
     * Scryfall's id of the printing
     */
    id: string;
    /**
     * Whether the card denies lands en masse
     */
    mass_land_denial: boolean;
}
/**
 * Printings to read the bracket flags of
 * @export
 * @interface BracketFlagsRequest
 */
export interface BracketFlagsRequest {
    /**
     * Scryfall's ids of the printings
     */
    printings: Array<string>;
}
/**
 * The printings asked about that count towards a bracket rule
 * @export
 * @interface BracketFlagsResponse
 */
export interface BracketFlagsResponse {
    /**
     * One per flagged printing; a printing that is missing counts towards none
     */
    printings: Array<BracketFlagsEntryResponse>;
}
/**
 * What a Commander bracket asks of a deck
 * @export
 * @interface BracketRulesResponse
 */
export interface BracketRulesResponse {
    /**
     * How much combo play the bracket tolerates
     */
    combos: ComboRule;
    /**
     * How much extra-turn play the bracket tolerates
     */
    extra_turns: ExtraTurnRule;
    /**
     * Whether mass land denial is expected to stay out
     */
    mass_land_denial: boolean;
    /**
     * How many Game Changers may be played, `null` for no limit
     */
    max_game_changers?: number | null;
    /**
     * Which bracket, one to five
     */
    number: number;
    /**
     * The slug the client turns into a name
     */
    slug: string;
}


/**
 * An Account named by a Bug report
 * @export
 * @interface BugReportAccount
 */
export interface BugReportAccount {
    /**
     * Its current username
     */
    username: string;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * An image of a Bug report, without its bytes
 * @export
 * @interface BugReportImageInfo
 */
export interface BugReportImageInfo {
    /**
     * The image's media type
     */
    content_type: string;
    /**
     * Primary key
     */
    uuid: string;
}

/**
 * Whether a Bug report still needs an Admin's attention
 * @export
 */
export const BugReportState = {
    /**
    * Not looked into yet, or reopened
    */
    Open: 'Open',
    /**
    * Marked done by an Admin
    */
    Done: 'Done',
} as const;
export type BugReportState = typeof BugReportState[keyof typeof BugReportState];


/**
 * Condition of a physical card, using Cardmarket's grades
 * 
 * The order of the variants is the grading scale, best first. Keep it that way — comparisons and sorting read better than a separate rank function.
 * @export
 */
export const CardCondition = {
    /**
    * Mint
    */
    Mint: 'Mint',
    /**
    * Near Mint
    */
    NearMint: 'NearMint',
    /**
    * Excellent
    */
    Excellent: 'Excellent',
    /**
    * Good
    */
    Good: 'Good',
    /**
    * Light Played
    */
    LightPlayed: 'LightPlayed',
    /**
    * Played
    */
    Played: 'Played',
    /**
    * Poor
    */
    Poor: 'Poor',
} as const;
export type CardCondition = typeof CardCondition[keyof typeof CardCondition];


/**
 * Finish of a physical card, mirroring Scryfall's `finishes`
 * 
 * These three are the complete set — Scryfall documents `finishes` as exactly `nonfoil`, `foil` and `etched`, and prices it accordingly (`eur`/`eur_foil`, `usd`/`usd_foil`/`usd_etched`).
 * 
 * Special treatments such as surge, textured, galaxy or neon ink are **not** finishes: they live in Scryfall's `promo_types`/`frame_effects` and get their own collector number, hence their own printing id. Adding them here would encode the same fact twice and allow combinations that cannot exist. A finish only ever describes what varies *within* one printing.
 * @export
 */
export const CardFinish = {
    /**
    * Regular, non-foil
    */
    Nonfoil: 'Nonfoil',
    /**
    * Traditional foil
    */
    Foil: 'Foil',
    /**
    * Etched foil
    */
    Etched: 'Etched',
} as const;
export type CardFinish = typeof CardFinish[keyof typeof CardFinish];


/**
 * Rarity of a printing, as Scryfall reports it
 * 
 * The order of the variants is the ladder, commonest first — the same order the set symbol's colours run in. Keep it that way: sorting a collection by rarity means sorting by this, and a separate rank function would be a second place to get it wrong.
 * 
 * [`Self::Special`] and [`Self::Bonus`] sit at the end because they are not a step on that ladder — they mark the timeshifted and bonus sheets, which have no place among the four.
 * @export
 */
export const CardRarity = {
    /**
    * Common
    */
    Common: 'Common',
    /**
    * Uncommon
    */
    Uncommon: 'Uncommon',
    /**
    * Rare
    */
    Rare: 'Rare',
    /**
    * Mythic rare
    */
    Mythic: 'Mythic',
    /**
    * Timeshifted and the like
    */
    Special: 'Special',
    /**
    * Bonus sheets
    */
    Bonus: 'Bonus',
} as const;
export type CardRarity = typeof CardRarity[keyof typeof CardRarity];

/**
 * Why the username step was refused
 * @export
 * @interface ChooseUsernameErrors
 */
export interface ChooseUsernameErrors {
    /**
     * The verified email came to belong to an Account since the login started; the pending login is gone
     */
    email_in_use: boolean;
    /**
     * No OIDC login is pending, or it ran out
     */
    nothing_pending: boolean;
    /**
     * The username belongs to another Account
     */
    username_taken: boolean;
}
/**
 * Request to finish the username step of a pending OIDC login
 * @export
 * @interface ChooseUsernameRequest
 */
export interface ChooseUsernameRequest {
    /**
     * The desired username
     */
    username: any;
}
/**
 * An Account whose username starts with what the owner typed
 * @export
 * @interface CollaboratorCandidateResponse
 */
export interface CollaboratorCandidateResponse {
    /**
     * The Account
     */
    account: string;
    /**
     * The Account's username as it is now
     */
    username: string;
}
/**
 * The Accounts whose username starts with what the owner typed
 * @export
 * @interface CollaboratorCandidatesResponse
 */
export interface CollaboratorCandidatesResponse {
    /**
     * Up to ten Accounts, alphabetically by username
     */
    accounts: Array<CollaboratorCandidateResponse>;
    /**
     * The caller searched too often lately, so nothing was searched
     */
    too_many_searches: boolean;
}

/**
 * What the owner lets a Collaborator do with the deck
 * @export
 */
export const CollaboratorLevel = {
    /**
    * Looks at the deck the way its Share link shows it
    */
    Viewer: 'Viewer',
    /**
    * Also builds the deck as a decklist
    */
    Editor: 'Editor',
} as const;
export type CollaboratorLevel = typeof CollaboratorLevel[keyof typeof CollaboratorLevel];

/**
 * One stack of identical cards in a collection
 * @export
 * @interface CollectionEntryResponse
 */
export interface CollectionEntryResponse {
    /**
     * The day the cards were acquired
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * When the stack was filed
     */
    created_at: string;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing — the client resolves name and image from it
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies this stack holds
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     */
    signed: boolean;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * A collection with what is inside it, for the overview
 * @export
 * @interface CollectionOverviewResponse
 */
export interface CollectionOverviewResponse {
    /**
     * Artwork of the most valuable cards in it, at most two
     */
    arts: Array<string>;
    /**
     * How many copies are filed in it
     */
    cards: number;
    /**
     * The collection itself
     */
    collection: CollectionResponse;
    /**
     * The colours the collection holds, as the letters `WUBRG`
     */
    colors: string;
    /**
     * What those copies are worth in euro cents
     */
    price_eur_cents: number;
    /**
     * Copies per rarity
     */
    rarities: RarityCountsResponse;
}
/**
 * 
 * @export
 * @interface CollectionResponse
 */
export interface CollectionResponse {
    /**
     * The colour the collection is drawn in
     */
    color: string;
    /**
     * 
     */
    created_at: string;
    /**
     * The deck this collection stands for, `None` for a collection on a shelf
     */
    deck?: string | null;
    /**
     * 
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     */
    icon: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    share_token?: string | null;
    /**
     * Wrapper for the primary key of the [`Collection`] model. To have better distinguishable types.
     */
    uuid: string;
    /**
     * 
     */
    visibility: Visibility;
}


/**
 * Everything the statistics tab shows, counted server-side
 * 
 * All money is euro cents. Every count is copies, not stacks — a playset of four counts four times.
 * @export
 * @interface CollectionStatisticsResponse
 */
export interface CollectionStatisticsResponse {
    /**
     * The most represented illustrators
     */
    artists: Array<StatBucketResponse>;
    /**
     * Mean value of a priced copy, in euro cents
     */
    average_value_cents: number;
    /**
     * Copies whose colour identity contains each colour, keyed `W U B R G`
     */
    color_identity: Array<StatBucketResponse>;
    /**
     * Copies per colour count, keyed `0` through `5`
     */
    color_spread: Array<StatBucketResponse>;
    /**
     * Copies per condition, best grade first
     */
    conditions: Array<StatBucketResponse>;
    /**
     * How many different sets are represented
     */
    distinct_sets: number;
    /**
     * Copies per finish
     */
    finishes: Array<StatBucketResponse>;
    /**
     * Copies legal in each tracked format
     */
    formats: Array<StatBucketResponse>;
    /**
     * The most common rules keywords
     */
    keywords: Array<StatBucketResponse>;
    /**
     * Copies per mana value, lands excluded, everything above `7` pooled there
     */
    mana_curve: Array<StatBucketResponse>;
    /**
     * Today's value of exactly those copies, in euro cents
     */
    market_of_purchased_cents: number;
    /**
     * What the whole collection fetches today, in euro cents
     */
    market_value_cents: number;
    /**
     * The oldest printing in the collection, `null` when nothing resolved
     */
    oldest?: OldestPrintingResponse | null;
    /**
     * Coloured mana symbols across all costs, weighted by copies, keyed `W U B R G`
     */
    pips: Array<StatBucketResponse>;
    /**
     * Paid against worth, for the stacks with the most money riding on them
     */
    price_points: Array<PricePointResponse>;
    /**
     * Copies the catalog has a price for
     */
    priced_cards: number;
    /**
     * What was paid, over the stacks that recorded it, in euro cents
     */
    purchase_total_cents: number;
    /**
     * Copies with a recorded purchase price
     */
    purchased_cards: number;
    /**
     * Copies per rarity, most first, keyed by Scryfall's lowercase spelling
     */
    rarities: Array<StatBucketResponse>;
    /**
     * Copies on the reserved list
     */
    reserved_cards: number;
    /**
     * What those are worth, in euro cents
     */
    reserved_value_cents: number;
    /**
     * Sets by copies, most first
     */
    sets: Array<SetBucketResponse>;
    /**
     * Cumulative copies and value over time
     */
    timeline: Array<TimelinePointResponse>;
    /**
     * The most valuable stacks
     */
    top_cards: Array<TopCardResponse>;
    /**
     * Copies filed in total
     */
    total_cards: number;
    /**
     * Copies per card type, keyed by lowercase type slug plus `other`
     */
    types: Array<StatBucketResponse>;
    /**
     * Copies per price bracket, keyed `bulk low mid high premium chase`
     */
    value_buckets: Array<StatBucketResponse>;
    /**
     * Copies per release year of the printing, oldest first
     */
    years: Array<StatBucketResponse>;
}

/**
 * How much combo play a bracket tolerates
 * 
 * Same three-step shape as [`ExtraTurnRule`] and for the same reason: the rule Exhibition states ("no intentional infinite combos") is stricter than the one Core states ("none of two cards"), so a deck holding a three card line sits in Core rather than in Exhibition. Upgraded's published rule is about how *early* a two card combo goes off, which nothing here can read, so it tolerates them outright — the same judgement call the table makes.
 * @export
 */
export const ComboRule = {
    /**
    * No complete combo of any length
    */
    none: 'none',
    /**
    * Combos, as long as none of them is two cards
    */
    no_two_card: 'no-two-card',
    /**
    * No limit
    */
    any: 'any',
} as const;
export type ComboRule = typeof ComboRule[keyof typeof ComboRule];

/**
 * @type CommanderRule
 * Whether the format is played with a commander
 * @export
 */
export type CommanderRule = CommanderRuleOneOf | CommanderRuleOneOf1;
/**
 * No commander zone
 * @export
 * @interface CommanderRuleOneOf
 */
export interface CommanderRuleOneOf {
    /**
     * 
     */
    kind: CommanderRuleOneOfKindEnum;
}


/**
 * @export
 */
export const CommanderRuleOneOfKindEnum = {
    none: 'none',
} as const;
export type CommanderRuleOneOfKindEnum = typeof CommanderRuleOneOfKindEnum[keyof typeof CommanderRuleOneOfKindEnum];

/**
 * A commander is required
 * @export
 * @interface CommanderRuleOneOf1
 */
export interface CommanderRuleOneOf1 {
    /**
     * 
     */
    kind: CommanderRuleOneOf1KindEnum;
    /**
     * Most cards in the commander zone, two for partners
     */
    max: number;
    /**
     * Fewest cards in the commander zone
     */
    min: number;
}


/**
 * @export
 */
export const CommanderRuleOneOf1KindEnum = {
    required: 'required',
} as const;
export type CommanderRuleOneOf1KindEnum = typeof CommanderRuleOneOf1KindEnum[keyof typeof CommanderRuleOneOf1KindEnum];

/**
 * One bucket's target corridor, in cards
 * @export
 * @interface Corridor
 */
export interface Corridor {
    /**
     * The ceiling
     */
    high: number;
    /**
     * The floor
     */
    low: number;
}
/**
 * 
 * @export
 * @interface CreateCollectionRequest
 */
export interface CreateCollectionRequest {
    /**
     * The colour the collection is drawn in
     */
    color: string;
    /**
     * 
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     */
    icon: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    visibility: Visibility;
}


/**
 * Request to make a folder
 * @export
 * @interface CreateDeckFolderRequest
 */
export interface CreateDeckFolderRequest {
    /**
     * What it is called
     */
    name: string;
}
/**
 * Request to create a deck
 * @export
 * @interface CreateDeckRequest
 */
export interface CreateDeckRequest {
    /**
     * The colours as the letters `WUBRG`, `null` or left out to follow the commander
     * 
     * Lets a clone take over its original's colours in its created Deck change instead of a Deck change of its own.
     */
    colors?: string | null;
    /**
     * Optional description
     */
    description?: string | null;
    /**
     * The format to build for
     */
    format: string;
    /**
     * Name of the deck
     */
    name: string;
    /**
     * Who may see the deck
     */
    visibility: Visibility;
}


/**
 * Request to create a tag on a deck
 * @export
 * @interface CreateDeckTagRequest
 */
export interface CreateDeckTagRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * Whether assignments follow the card through every deck and printing
     */
    global: boolean;
    /**
     * The icon drawn inside its colour marker
     */
    icon: string;
    /**
     * What the tag is called
     */
    name: string;
}
/**
 * Request to create a tag that follows a card everywhere
 * @export
 * @interface CreateGlobalTagRequest
 */
export interface CreateGlobalTagRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * The icon drawn inside its colour marker
     */
    icon: string;
    /**
     * What the tag is called
     */
    name: string;
}
/**
 * Start a persisted scanner session
 * @export
 * @interface CreateScannerSessionRequest
 */
export interface CreateScannerSessionRequest {
    /**
     * Optional preferred destination collection
     */
    collection?: string | null;
    /**
     * Marker colour
     */
    color: string;
    /**
     * Marker icon
     */
    icon: string;
    /**
     * Display name
     */
    name: string;
}
/**
 * @type CreateTournament200Response
 * 
 * @export
 */
export type CreateTournament200Response = FormErrorResponseForTournamentSettingsErrors | TournamentResponse;
/**
 * Request to create a watch list
 * @export
 * @interface CreateWatchListRequest
 */
export interface CreateWatchListRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * Description shown above the entries
     */
    description: string;
    /**
     * The pictogram drawn on it
     */
    icon: string;
    /**
     * What the list is called
     */
    name: string;
}
/**
 * The running Round as one Participant sees it
 * @export
 * @interface CurrentRoundResponse
 */
export interface CurrentRoundResponse {
    /**
     * The reader's Match or Bye in it; `null` if the reader is not seated in it
     * @type {MatchResponse}
     * @memberof CurrentRoundResponse
     */
    my_match?: MatchResponse | null;
    /**
     * Its number
     * @type {number}
     * @memberof CurrentRoundResponse
     */
    number: number;
    /**
     * Its round timer, `null` for a Tournament without one
     * @type {RoundTimerResponse}
     * @memberof CurrentRoundResponse
     */
    timer?: RoundTimerResponse | null;
}
/**
 * What the catalog knows about a deck card's printing
 * @export
 * @interface DeckCardCatalogResponse
 */
export interface DeckCardCatalogResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * Colour identity as the letters `WUBRG`
     */
    color_identity: string;
    /**
     * Whether the card takes extra turns, which brackets 1 and 2 play none of
     * 
     * Derived like [`Self::mass_land_denial`], with the same caveat.
     */
    extra_turns: boolean;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     */
    finishes: Array<string>;
    /**
     * Whether Wizards lists the card as a Game Changer
     * 
     * The curated list behind the Commander brackets, refreshed with the catalog. A deck's bracket is checked against how many of these it plays.
     */
    game_changer: boolean;
    /**
     * The back face's artwork for a closer look
     */
    image_back_normal?: string | null;
    /**
     * The back face's artwork for a list row
     * 
     * `None` unless the card is photographed twice: a transform card, a modal double-faced card, a battle. A split card or an adventure prints both halves on one side, so there is nothing to turn over.
     */
    image_back_small?: string | null;
    /**
     * Artwork for a closer look
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     */
    lang: string;
    /**
     * The formats this printing is legal in, of the ones the catalog tracks
     * 
     * Only a "legal" set: a format missing here may be banned, restricted or simply not offered, which the client tells apart via Scryfall when it needs the reason.
     */
    legal_formats: Array<string>;
    /**
     * Mana cost as printed, faces joined by ` // `
     */
    mana_cost: string;
    /**
     * Mana value
     */
    mana_value: number;
    /**
     * Whether the card denies lands en masse
     * 
     * Derived from the rules text when the catalog is synced, not stored as the text itself. Brackets 1 to 3 play none of these, so the legality band checks a claimed bracket against it. Detection errs toward silence: a card the patterns miss raises no warning, which is the right way for a warning to fail.
     */
    mass_land_denial: boolean;
    /**
     * The printed name
     */
    name: string;
    /**
     * Groups every printing of the same card, which is what a copy limit counts
     */
    oracle_id?: string | null;
    /**
     * Market price in euro cents
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     */
    price_eur_foil_cents?: number | null;
    /**
     * The colours the card can produce, as the letters `WUBRGC`
     * 
     * What a mana base is counted with: sources of each colour against the pips the deck asks for.
     */
    produced_mana: Array<string>;
    /**
     * How rare the printing is
     */
    rarity: CardRarity;
    /**
     * Whether the card is on the reserved list
     */
    reserved: boolean;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
    /**
     * Type line as printed
     */
    type_line: string;
}


/**
 * One slot of a deck, with the card it holds
 * @export
 * @interface DeckCardResponse
 */
export interface DeckCardResponse {
    /**
     * The card, as far as the catalog knows it
     */
    card?: DeckCardCatalogResponse | null;
    /**
     * Whether the copies in this slot are the foil ones
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * Whether the copies in this slot are stand-ins rather than the real cards
     */
    proxy: boolean;
    /**
     * How many copies this slot holds
     */
    quantity: number;
    /**
     * The tags put on this slot
     */
    tags: Array<string>;
    /**
     * Primary key
     */
    uuid: string;
    /**
     * Which zone the slot sits in
     */
    zone: DeckZone;
}



/**
 * What the owner or an Editor did in a Deck change
 * @export
 */
export const DeckChangeKind = {
    /**
    * The deck was created, empty
    */
    Created: 'Created',
    /**
    * The deck existed before Deck histories; its entries at that time
    */
    Introduced: 'Introduced',
    /**
    * Copies of a Deck entry added or taken away
    */
    Quantity: 'Quantity',
    /**
    * A Deck entry moved to another zone
    */
    Move: 'Move',
    /**
    * A Deck entry switched to another printing, finish or proxy status
    */
    Switch: 'Switch',
    /**
    * Copies of a Deck entry given up for another card in the same zone
    */
    Swap: 'Swap',
    /**
    * A decklist added to the deck
    */
    Import: 'Import',
    /**
    * A decklist that replaced the deck&#39;s Deck entries
    */
    Replace: 'Replace',
    /**
    * The advisor&#39;s suggestions added to the deck
    */
    Fill: 'Fill',
    /**
    * A Deck entry made to say what was sourced for it: another printing or finish, or no longer a proxy
    */
    Sourcing: 'Sourcing',
    /**
    * Deck fields changed: name, description, format, colors, bracket, rule-zero exceptions or size
    */
    Settings: 'Settings',
    /**
    * An earlier Deck change taken back
    */
    Undo: 'Undo',
    /**
    * An undone Deck change applied again
    */
    Redo: 'Redo',
    /**
    * The deck brought back to an earlier point of its Deck history
    */
    Reset: 'Reset',
} as const;
export type DeckChangeKind = typeof DeckChangeKind[keyof typeof DeckChangeKind];

/**
 * One Deck change
 * @export
 * @interface DeckChangeResponse
 */
export interface DeckChangeResponse {
    /**
     * When it happened
     */
    changed_at: string;
    /**
     * The Deck checkpoint the owner named it with, `None` when unnamed
     */
    checkpoint?: string | null;
    /**
     * The Deck entries it touched
     */
    entries: Array<DeckEntryChangeResponse>;
    /**
     * The deck fields it changed
     */
    fields: Array<FieldDifference>;
    /**
     * What the owner or an Editor did
     */
    kind: DeckChangeKind;
    /**
     * The Deck change an undo takes back, a redo applies again or a reset returns to, `None` for any other kind
     */
    reference?: string | null;
    /**
     * Whether an undo took it back and no redo applied it again since
     */
    undone: boolean;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * One Account named on a deck
 * @export
 * @interface DeckCollaboratorResponse
 */
export interface DeckCollaboratorResponse {
    /**
     * The Account, which is what removing it names
     */
    account: string;
    /**
     * What the owner lets it do
     */
    level: CollaboratorLevel;
    /**
     * The Account's username as it is now
     */
    username: string;
}


/**
 * One commander at the head of a deck
 * @export
 * @interface DeckCommanderResponse
 */
export interface DeckCommanderResponse {
    /**
     * Colour identity as the letters `WUBRG`
     */
    color_identity: string;
    /**
     * The illustration alone, in landscape, for a tile wider than a card is
     */
    image_art_crop?: string | null;
    /**
     * Artwork for a wider tile
     */
    image_normal?: string | null;
    /**
     * Artwork for a tile
     */
    image_small?: string | null;
    /**
     * The printed name
     */
    name: string;
}
/**
 * Where the deck list and the cardboard filed under it disagree
 * 
 * Every list empty means the deck in the box is the deck on the list, which is what lets the header say so without asking a second question.
 * @export
 * @interface DeckDriftResponse
 */
export interface DeckDriftResponse {
    /**
     * Whether the deck keeps a collection at all; nothing drifts while it does not
     */
    keeps_collection: boolean;
    /**
     * Copies lying in the deck whose card the list does not name at all
     */
    not_in_deck: Array<DeckDriftRowResponse>;
    /**
     * Copies lying in the deck in a printing or finish the list does not ask for
     */
    other_printing: Array<DeckDriftRowResponse>;
    /**
     * Copies the list asks for that are nowhere in the deck
     */
    pending: Array<DeckDriftRowResponse>;
    /**
     * Copies of a card the list wants, beyond the count it asks for
     */
    surplus: Array<DeckDriftRowResponse>;
}
/**
 * One card the deck list and the deck's own collection disagree about
 * @export
 * @interface DeckDriftRowResponse
 */
export interface DeckDriftRowResponse {
    /**
     * What the catalog knows about the printing
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Whether those copies are the foil ones
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing the row is about
     */
    printing: string;
    /**
     * How many copies the disagreement is about
     */
    quantity: number;
    /**
     * The printing the list asks for instead, only on `other_printing` rows
     */
    wanted?: SourcedPrintingResponse | null;
}
/**
 * How many copies one Deck entry held before and after a Deck change
 * @export
 * @interface DeckEntryChangeResponse
 */
export interface DeckEntryChangeResponse {
    /**
     * How many copies it holds after, zero for an entry that is gone
     */
    after: number;
    /**
     * How many copies it held before, zero for an entry that came into being
     */
    before: number;
    /**
     * Whether the copies are the foil ones
     */
    foil: boolean;
    /**
     * The card's printed name, `None` while the catalog does not know the printing
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * Whether the copies are stand-ins rather than the real cards
     */
    proxy: boolean;
    /**
     * Which zone the entry sits in
     */
    zone: DeckZone;
}



/**
 * Which of an account's folders a folder is
 * @export
 */
export const DeckFolderKind = {
    /**
    * A folder the account made and named
    */
    Custom: 'Custom',
    /**
    * The one folder the app knows: decks that were put away
    */
    Archive: 'Archive',
} as const;
export type DeckFolderKind = typeof DeckFolderKind[keyof typeof DeckFolderKind];

/**
 * A shelf an account files its decks on
 * @export
 * @interface DeckFolderResponse
 */
export interface DeckFolderResponse {
    /**
     * When the folder was made
     */
    created_at: string;
    /**
     * Which of the folders this is
     */
    kind: DeckFolderKind;
    /**
     * What the folder is called
     * 
     * The archive carries the name it was made under; a client shows it under its own word for the archive instead, in the language it is running in.
     */
    name: string;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * One page of a Deck history, newest first
 * @export
 * @interface DeckHistoryResponse
 */
export interface DeckHistoryResponse {
    /**
     * Whether there is an undone Deck change to redo
     */
    can_redo: boolean;
    /**
     * Whether there is a Deck change to undo
     */
    can_undo: boolean;
    /**
     * The Deck changes
     */
    changes: Array<DeckChangeResponse>;
    /**
     * Pass as `after` for the next page, `None` on the last one
     */
    next_cursor?: string | null;
}
/**
 * A deck as the list of decks shows it
 * @export
 * @interface DeckOverviewResponse
 */
export interface DeckOverviewResponse {
    /**
     * How many cards sit in the deck proper, the sideboard aside
     */
    cards: number;
    /**
     * The commanders, in the order they were put in
     */
    commanders: Array<DeckCommanderResponse>;
    /**
     * The deck itself
     */
    deck: DeckResponse;
    /**
     * What those cards are worth in euro cents
     */
    price_eur_cents: number;
}
/**
 * The Account owning a deck
 * @export
 * @interface DeckOwnerResponse
 */
export interface DeckOwnerResponse {
    /**
     * The Account
     */
    account: string;
    /**
     * The Account's username as it is now
     */
    username: string;
}
/**
 * One Deck entry a deck held at an earlier point
 * @export
 * @interface DeckPointEntryResponse
 */
export interface DeckPointEntryResponse {
    /**
     * Whether the copies were the foil ones
     */
    foil: boolean;
    /**
     * The card's printed name, `None` while the catalog does not know the printing
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * Whether the copies were stand-ins rather than the real cards
     */
    proxy: boolean;
    /**
     * How many copies it held
     */
    quantity: number;
    /**
     * Which zone the entry sat in
     */
    zone: DeckZone;
}


/**
 * A deck as it was right after one of its Deck changes, read-only
 * @export
 * @interface DeckPointResponse
 */
export interface DeckPointResponse {
    /**
     * The Deck change
     */
    change: DeckChangeResponse;
    /**
     * The Deck entries the deck held then
     */
    entries: Array<DeckPointEntryResponse>;
    /**
     * The recorded deck fields as they were then
     */
    settings: DeckSettingsResponse;
}
/**
 * A deck as its owner sees it
 * 
 * Anybody else gets it without the owner's share link and folder.
 * @export
 * @interface DeckResponse
 */
export interface DeckResponse {
    /**
     * Whether the table agreed to cards the format bans
     */
    allow_banned: boolean;
    /**
     * Whether the table agreed to more copies of a card than the format allows
     */
    allow_duplicates: boolean;
    /**
     * Whether the table agreed to more commanders than the format allows
     */
    allow_extra_commanders: boolean;
    /**
     * The colours the deck may play, `null` for whatever the commander allows
     */
    allowed_color_identity?: string | null;
    /**
     * Which Commander bracket the deck is built to, `null` when unset
     */
    bracket?: number | null;
    /**
     * Whether there is an undone Deck change to redo
     */
    can_redo: boolean;
    /**
     * Whether there is a Deck change to undo
     */
    can_undo: boolean;
    /**
     * When the deck was created
     */
    created_at: string;
    /**
     * How many cards the deck is built to, `null` for the format's rule
     * 
     * The commanders count toward it, the way the format's own size does.
     */
    deck_size?: number | null;
    /**
     * Optional description, e.g. the deck's game plan
     */
    description?: string | null;
    /**
     * The folder the deck is filed in, `null` while it is on no shelf
     */
    folder?: string | null;
    /**
     * The format the deck is built for
     */
    format: string;
    /**
     * Name of the deck
     */
    name: string;
    /**
     * The caller's role on the deck, `null` when only its Visibility shows it to them
     */
    role?: DeckRole | null;
    /**
     * Secret of the share link, `null` once the link is revoked
     */
    share_token?: string | null;
    /**
     * Primary key
     */
    uuid: string;
    /**
     * Who may see the deck
     */
    visibility: Visibility;
}



/**
 * The caller's standing on one deck
 * @export
 */
export const DeckRole = {
    /**
    * The account the deck belongs to
    */
    Owner: 'Owner',
    /**
    * A Collaborator who helps build the deck
    */
    Editor: 'Editor',
    /**
    * A Collaborator who only looks at the deck
    */
    Viewer: 'Viewer',
} as const;
export type DeckRole = typeof DeckRole[keyof typeof DeckRole];

/**
 * The recorded deck fields at an earlier point
 * @export
 * @interface DeckSettingsResponse
 */
export interface DeckSettingsResponse {
    /**
     * Whether the table agreed to cards the format bans
     */
    allow_banned: boolean;
    /**
     * Whether the table agreed to more copies of a card than the format allows
     */
    allow_duplicates: boolean;
    /**
     * Whether the table agreed to more commanders than the format allows
     */
    allow_extra_commanders: boolean;
    /**
     * The colours the deck could play, `None` for whatever the commander allows
     */
    allowed_color_identity?: string | null;
    /**
     * The Commander bracket the deck was built to, `None` when unset
     */
    bracket?: number | null;
    /**
     * How many cards the deck was built to, `None` for the format's rule
     */
    deck_size?: number | null;
    /**
     * The deck's description, `None` for none
     */
    description?: string | null;
    /**
     * The format the deck was built for
     */
    format: string;
    /**
     * The deck's name
     */
    name: string;
}
/**
 * @type DeckSize
 * How many cards a deck holds
 * @export
 */
export type DeckSize = DeckSizeOneOf | DeckSizeOneOf1;
/**
 * Exactly this many, commander included
 * @export
 * @interface DeckSizeOneOf
 */
export interface DeckSizeOneOf {
    /**
     * The count
     */
    cards: number;
    /**
     * 
     */
    kind: DeckSizeOneOfKindEnum;
}


/**
 * @export
 */
export const DeckSizeOneOfKindEnum = {
    exactly: 'exactly',
} as const;
export type DeckSizeOneOfKindEnum = typeof DeckSizeOneOfKindEnum[keyof typeof DeckSizeOneOfKindEnum];

/**
 * At least this many, no upper bound
 * @export
 * @interface DeckSizeOneOf1
 */
export interface DeckSizeOneOf1 {
    /**
     * The count
     */
    cards: number;
    /**
     * 
     */
    kind: DeckSizeOneOf1KindEnum;
}


/**
 * @export
 */
export const DeckSizeOneOf1KindEnum = {
    at_least: 'at_least',
} as const;
export type DeckSizeOneOf1KindEnum = typeof DeckSizeOneOf1KindEnum[keyof typeof DeckSizeOneOf1KindEnum];

/**
 * Everything the sourcing view is drawn from
 * @export
 * @interface DeckSourcingResponse
 */
export interface DeckSourcingResponse {
    /**
     * What could still be taken from elsewhere
     */
    candidates: Array<SourcingCandidateResponse>;
    /**
     * The deck's own collection, `None` while it keeps none
     */
    collection?: CollectionResponse | null;
    /**
     * What is filed in the deck's own collection
     */
    filed: Array<SourcedStackResponse>;
    /**
     * What the list asks for
     */
    slots: Array<SourcingSlotResponse>;
}
/**
 * An etiquette put on a deck's cards
 * @export
 * @interface DeckTagResponse
 */
export interface DeckTagResponse {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * The deck it is local to, `null` for one offered on every deck
     */
    deck?: string | null;
    /**
     * The icon drawn inside its colour marker
     */
    icon: string;
    /**
     * What the tag is called
     */
    name: string;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * What the deck is graded against, where the builder moved it
 * @export
 * @interface DeckTargets
 */
export interface DeckTargets {
    /**
     * Corridors by role bucket id, only for the ones that were moved
     */
    buckets?: { [key: string]: Corridor | undefined; };
    /**
     * The target curve as shares per mana value, `None` on the bracket's own shape
     */
    curve?: Array<number> | null;
    /**
     * Corridors by primary card type, only for the ones that were moved
     */
    types?: { [key: string]: Corridor | undefined; };
}
/**
 * What undo and redo can do
 * @export
 * @interface DeckUndoResponse
 */
export interface DeckUndoResponse {
    /**
     * Whether there is an undone Deck change to redo
     */
    can_redo: boolean;
    /**
     * Whether there is a Deck change to undo
     */
    can_undo: boolean;
}

/**
 * The zone a [`DeckCard`] sits in
 * @export
 */
export const DeckZone = {
    /**
    * The main deck
    */
    Main: 'Main',
    /**
    * The sideboard
    */
    Side: 'Side',
    /**
    * The command zone — one card, or two for Partner decks
    */
    Commander: 'Commander',
    /**
    * The companion slot
    */
    Companion: 'Companion',
    /**
    * Considered but not currently in the deck
    */
    Maybe: 'Maybe',
} as const;
export type DeckZone = typeof DeckZone[keyof typeof DeckZone];

/**
 * Why an account could not be deleted
 * @export
 * @interface DeleteAccountErrors
 */
export interface DeleteAccountErrors {
    /**
     * The typed username is not the one the session belongs to
     */
    username_mismatch: boolean;
}
/**
 * Request to delete the logged-in account
 * @export
 * @interface DeleteAccountRequest
 */
export interface DeleteAccountRequest {
    /**
     * The account's own username, typed out
     * 
     * Proof that the request means the account it is authenticated as, and not a stray click on a red button.
     */
    username: string;
}
/**
 * Why a passkey could not be deleted
 * @export
 * @interface DeletePasskeyErrors
 */
export interface DeletePasskeyErrors {
    /**
     * It is the account's only passkey — deleting it would lock the account out for good
     */
    last_passkey: boolean;
    /**
     * No passkey with that id belongs to this account
     */
    unknown_passkey: boolean;
}

/**
 * What [`Account::delete`] does with the Account's public decks
 * @export
 */
export const DeletionMode = {
    /**
    * Hands them to the Tombstone, so links to them keep working
    */
    Tombstone: 'Tombstone',
    /**
    * Deletes them along with everything else, the full Deletion
    */
    Full: 'Full',
} as const;
export type DeletionMode = typeof DeletionMode[keyof typeof DeletionMode];

/**
 * Why a Participant's dispute was refused
 * @export
 * @interface DisputeResultErrors
 */
export interface DisputeResultErrors {
    /**
     * An Organizer set the Result
     * @type {boolean}
     * @memberof DisputeResultErrors
     */
    confirmed: boolean;
    /**
     * The Match has no Result to dispute
     * @type {boolean}
     * @memberof DisputeResultErrors
     */
    no_result: boolean;
    /**
     * The Match's Round is not running, or the Tournament is over
     * @type {boolean}
     * @memberof DisputeResultErrors
     */
    not_running: boolean;
    /**
     * The Participant reported it itself; report again to correct it
     * @type {boolean}
     * @memberof DisputeResultErrors
     */
    own_report: boolean;
}
/**
 * Why a Participant could not Drop
 * @export
 * @interface DropErrors
 */
export interface DropErrors {
    /**
     * No Round started yet: before the first Round a Participant withdraws or is removed instead
     * @type {boolean}
     * @memberof DropErrors
     */
    not_started: boolean;
    /**
     * The Tournament is Finished or Cancelled
     * @type {boolean}
     * @memberof DropErrors
     */
    tournament_over: boolean;
}
/**
 * @type EndTournamentRound200Response
 * 
 * @export
 */
export type EndTournamentRound200Response = FormErrorResponseForRoundErrors | TournamentStateResponse;
/**
 * What playing in a Tournament costs
 * @export
 * @interface EntryFeeSchema
 */
export interface EntryFeeSchema {
    /**
     * The amount in the currency's smallest unit, cents for euros; above zero
     * @type {number}
     * @memberof EntryFeeSchema
     */
    amount: number;
    /**
     * The ISO 4217 code of the currency, three capital letters like `EUR`
     * @type {string}
     * @memberof EntryFeeSchema
     */
    currency: string;
}

/**
 * What a collection can be ordered by
 * @export
 */
export const EntrySort = {
    /**
    * The order the stacks were filed in
    */
    filed: 'filed',
    /**
    * Card name
    */
    name: 'name',
    /**
    * Set, then collector number — the order a binder is in
    */
    set: 'set',
    /**
    * Rarity, commonest first
    */
    rarity: 'rarity',
    /**
    * Mana value
    */
    mana_value: 'mana_value',
    /**
    * What one copy is worth
    */
    unit_price: 'unit_price',
    /**
    * What the whole stack is worth
    */
    stack_value: 'stack_value',
    /**
    * How many copies the stack holds
    */
    quantity: 'quantity',
    /**
    * Condition, best first
    */
    condition: 'condition',
} as const;
export type EntrySort = typeof EntrySort[keyof typeof EntrySort];


/**
 * Constant string `"Err"` which is documented by schemars
 * @export
 */
export const ErrorConstant = {
    Err: 'Err',
} as const;
export type ErrorConstant = typeof ErrorConstant[keyof typeof ErrorConstant];


/**
 * How much extra-turn play a bracket tolerates
 * 
 * Three values rather than a yes/no, because the published rule is not one: Exhibition plays no extra turns at all, Core and Upgraded ask only that they are not *chained*, and the top two ask nothing. A single Time Warp is a legal Core card, so a boolean here could only be wrong in one direction or the other.
 * @export
 */
export const ExtraTurnRule = {
    /**
    * No extra turns at all
    */
    none: 'none',
    /**
    * Extra turns, as long as the deck cannot take them back to back
    */
    no_chaining: 'no-chaining',
    /**
    * No limit
    */
    any: 'any',
} as const;
export type ExtraTurnRule = typeof ExtraTurnRule[keyof typeof ExtraTurnRule];

/**
 * @type FieldDifference
 * The value one deck field held before and after a Deck change
 * @export
 */
export type FieldDifference = FieldDifferenceOneOf | FieldDifferenceOneOf1 | FieldDifferenceOneOf2 | FieldDifferenceOneOf3 | FieldDifferenceOneOf4 | FieldDifferenceOneOf5 | FieldDifferenceOneOf6 | FieldDifferenceOneOf7 | FieldDifferenceOneOf8;
/**
 * The deck's name
 * @export
 * @interface FieldDifferenceOneOf
 */
export interface FieldDifferenceOneOf {
    /**
     * The name after
     */
    after: string;
    /**
     * The name before
     */
    before: string;
    /**
     * 
     */
    field: FieldDifferenceOneOfFieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOfFieldEnum = {
    Name: 'Name',
} as const;
export type FieldDifferenceOneOfFieldEnum = typeof FieldDifferenceOneOfFieldEnum[keyof typeof FieldDifferenceOneOfFieldEnum];

/**
 * The deck's description
 * @export
 * @interface FieldDifferenceOneOf1
 */
export interface FieldDifferenceOneOf1 {
    /**
     * The description after, `None` for none
     */
    after?: string | null;
    /**
     * The description before, `None` for none
     */
    before?: string | null;
    /**
     * 
     */
    field: FieldDifferenceOneOf1FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf1FieldEnum = {
    Description: 'Description',
} as const;
export type FieldDifferenceOneOf1FieldEnum = typeof FieldDifferenceOneOf1FieldEnum[keyof typeof FieldDifferenceOneOf1FieldEnum];

/**
 * The format the deck is built for
 * @export
 * @interface FieldDifferenceOneOf2
 */
export interface FieldDifferenceOneOf2 {
    /**
     * The format after
     */
    after: string;
    /**
     * The format before
     */
    before: string;
    /**
     * 
     */
    field: FieldDifferenceOneOf2FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf2FieldEnum = {
    Format: 'Format',
} as const;
export type FieldDifferenceOneOf2FieldEnum = typeof FieldDifferenceOneOf2FieldEnum[keyof typeof FieldDifferenceOneOf2FieldEnum];

/**
 * The colours the deck may play
 * @export
 * @interface FieldDifferenceOneOf3
 */
export interface FieldDifferenceOneOf3 {
    /**
     * The colours after, `None` for whatever the commander allows
     */
    after?: string | null;
    /**
     * The colours before, `None` for whatever the commander allows
     */
    before?: string | null;
    /**
     * 
     */
    field: FieldDifferenceOneOf3FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf3FieldEnum = {
    Colors: 'Colors',
} as const;
export type FieldDifferenceOneOf3FieldEnum = typeof FieldDifferenceOneOf3FieldEnum[keyof typeof FieldDifferenceOneOf3FieldEnum];

/**
 * The Commander bracket the deck is built to
 * @export
 * @interface FieldDifferenceOneOf4
 */
export interface FieldDifferenceOneOf4 {
    /**
     * The bracket after, `None` when unset
     */
    after?: number | null;
    /**
     * The bracket before, `None` when unset
     */
    before?: number | null;
    /**
     * 
     */
    field: FieldDifferenceOneOf4FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf4FieldEnum = {
    Bracket: 'Bracket',
} as const;
export type FieldDifferenceOneOf4FieldEnum = typeof FieldDifferenceOneOf4FieldEnum[keyof typeof FieldDifferenceOneOf4FieldEnum];

/**
 * Whether the table agreed to more commanders than the format allows
 * @export
 * @interface FieldDifferenceOneOf5
 */
export interface FieldDifferenceOneOf5 {
    /**
     * The agreement after
     */
    after: boolean;
    /**
     * The agreement before
     */
    before: boolean;
    /**
     * 
     */
    field: FieldDifferenceOneOf5FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf5FieldEnum = {
    AllowExtraCommanders: 'AllowExtraCommanders',
} as const;
export type FieldDifferenceOneOf5FieldEnum = typeof FieldDifferenceOneOf5FieldEnum[keyof typeof FieldDifferenceOneOf5FieldEnum];

/**
 * Whether the table agreed to more copies of a card than the format allows
 * @export
 * @interface FieldDifferenceOneOf6
 */
export interface FieldDifferenceOneOf6 {
    /**
     * The agreement after
     */
    after: boolean;
    /**
     * The agreement before
     */
    before: boolean;
    /**
     * 
     */
    field: FieldDifferenceOneOf6FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf6FieldEnum = {
    AllowDuplicates: 'AllowDuplicates',
} as const;
export type FieldDifferenceOneOf6FieldEnum = typeof FieldDifferenceOneOf6FieldEnum[keyof typeof FieldDifferenceOneOf6FieldEnum];

/**
 * Whether the table agreed to cards the format bans
 * @export
 * @interface FieldDifferenceOneOf7
 */
export interface FieldDifferenceOneOf7 {
    /**
     * The agreement after
     */
    after: boolean;
    /**
     * The agreement before
     */
    before: boolean;
    /**
     * 
     */
    field: FieldDifferenceOneOf7FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf7FieldEnum = {
    AllowBanned: 'AllowBanned',
} as const;
export type FieldDifferenceOneOf7FieldEnum = typeof FieldDifferenceOneOf7FieldEnum[keyof typeof FieldDifferenceOneOf7FieldEnum];

/**
 * How many cards the deck is built to
 * @export
 * @interface FieldDifferenceOneOf8
 */
export interface FieldDifferenceOneOf8 {
    /**
     * The size after, `None` for the format's rule
     */
    after?: number | null;
    /**
     * The size before, `None` for the format's rule
     */
    before?: number | null;
    /**
     * 
     */
    field: FieldDifferenceOneOf8FieldEnum;
}


/**
 * @export
 */
export const FieldDifferenceOneOf8FieldEnum = {
    DeckSize: 'DeckSize',
} as const;
export type FieldDifferenceOneOf8FieldEnum = typeof FieldDifferenceOneOf8FieldEnum[keyof typeof FieldDifferenceOneOf8FieldEnum];

/**
 * File a session's staging area into a collection
 * @export
 * @interface FileScannerSessionRequest
 */
export interface FileScannerSessionRequest {
    /**
     * Destination; omitted to use the session's preferred collection
     */
    collection?: string | null;
}
/**
 * Result of filing and clearing a staging area
 * @export
 * @interface FileScannerSessionResponse
 */
export interface FileScannerSessionResponse {
    /**
     * Destination collection
     */
    collection: string;
    /**
     * Copies filed
     */
    copies: number;
    /**
     * Distinct stacks filed
     */
    stacks: number;
}
/**
 * Request to declare that the deck holds what its list asks for
 * @export
 * @interface FillDeckCollectionRequest
 */
export interface FillDeckCollectionRequest {
    /**
     * The one slot to fill, `None` for every slot of the deck
     */
    slot?: string | null;
}
/**
 * What filling a deck's collection from its own list came to
 * @export
 * @interface FillDeckCollectionResponse
 */
export interface FillDeckCollectionResponse {
    /**
     * How many copies were filed as being in the deck
     */
    filed: number;
}
/**
 * Request to finish adding a passkey
 * @export
 * @interface FinishAddPasskeyRequest
 */
export interface FinishAddPasskeyRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     */
    credential: any | null;
    /**
     * What to call the device, or `None` to number it
     */
    label?: string | null;
}
/**
 * Why a login could not be completed
 * @export
 * @interface FinishLoginErrors
 */
export interface FinishLoginErrors {
    /**
     * The signature did not check out
     */
    authentication_failed: boolean;
    /**
     * An Admin locked the account
     */
    locked: boolean;
    /**
     * The browser's response was not a credential
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `login/start` was never called
     */
    no_ceremony: boolean;
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
    /**
     * Keep the session alive across browser restarts
     * 
     * Off means the cookie is dropped when the browser closes — the sensible default on a machine somebody else also uses.
     */
    remember_me: boolean;
}
/**
 * Request to finish a registration ceremony
 * @export
 * @interface FinishRegistrationRequest
 */
export interface FinishRegistrationRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     */
    credential: any | null;
    /**
     * The token from the registration link
     */
    token: string;
}
/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddAccountParticipantErrors
 */
export interface FormErrorResponseForAddAccountParticipantErrors {
    /**
     * The actual error struct
     * @type {AddAccountParticipantErrors}
     * @memberof FormErrorResponseForAddAccountParticipantErrors
     */
    error: AddAccountParticipantErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForAddAccountParticipantErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddCoOrganizerErrors
 */
export interface FormErrorResponseForAddCoOrganizerErrors {
    /**
     * The actual error struct
     * @type {AddCoOrganizerErrors}
     * @memberof FormErrorResponseForAddCoOrganizerErrors
     */
    error: AddCoOrganizerErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForAddCoOrganizerErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddGuestParticipantErrors
 */
export interface FormErrorResponseForAddGuestParticipantErrors {
    /**
     * The actual error struct
     * @type {AddGuestParticipantErrors}
     * @memberof FormErrorResponseForAddGuestParticipantErrors
     */
    error: AddGuestParticipantErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForAddGuestParticipantErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddPasskeyErrors
 */
export interface FormErrorResponseForAddPasskeyErrors {
    /**
     * The actual error struct
     */
    error: AddPasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAdminDeleteAccountErrors
 */
export interface FormErrorResponseForAdminDeleteAccountErrors {
    /**
     * The actual error struct
     */
    error: AdminDeleteAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAdminLockAccountErrors
 */
export interface FormErrorResponseForAdminLockAccountErrors {
    /**
     * The actual error struct
     */
    error: AdminLockAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAdminRenameAccountErrors
 */
export interface FormErrorResponseForAdminRenameAccountErrors {
    /**
     * The actual error struct
     */
    error: AdminRenameAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAdminSetRoleErrors
 */
export interface FormErrorResponseForAdminSetRoleErrors {
    /**
     * The actual error struct
     */
    error: AdminSetRoleErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAdminUnlockAccountErrors
 */
export interface FormErrorResponseForAdminUnlockAccountErrors {
    /**
     * The actual error struct
     */
    error: AdminUnlockAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForArrangeRoundErrors
 */
export interface FormErrorResponseForArrangeRoundErrors {
    /**
     * The actual error struct
     * @type {ArrangeRoundErrors}
     * @memberof FormErrorResponseForArrangeRoundErrors
     */
    error: ArrangeRoundErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForArrangeRoundErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForChooseUsernameErrors
 */
export interface FormErrorResponseForChooseUsernameErrors {
    /**
     * The actual error struct
     */
    error: ChooseUsernameErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDeleteAccountErrors
 */
export interface FormErrorResponseForDeleteAccountErrors {
    /**
     * The actual error struct
     */
    error: DeleteAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDeletePasskeyErrors
 */
export interface FormErrorResponseForDeletePasskeyErrors {
    /**
     * The actual error struct
     */
    error: DeletePasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDisputeResultErrors
 */
export interface FormErrorResponseForDisputeResultErrors {
    /**
     * The actual error struct
     * @type {DisputeResultErrors}
     * @memberof FormErrorResponseForDisputeResultErrors
     */
    error: DisputeResultErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForDisputeResultErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDropErrors
 */
export interface FormErrorResponseForDropErrors {
    /**
     * The actual error struct
     * @type {DropErrors}
     * @memberof FormErrorResponseForDropErrors
     */
    error: DropErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForDropErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForFinishLoginErrors
 */
export interface FormErrorResponseForFinishLoginErrors {
    /**
     * The actual error struct
     */
    error: FinishLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForMeErrors
 */
export interface FormErrorResponseForMeErrors {
    /**
     * The actual error struct
     */
    error: MeErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForOfferHandoverErrors
 */
export interface FormErrorResponseForOfferHandoverErrors {
    /**
     * The actual error struct
     * @type {OfferHandoverErrors}
     * @memberof FormErrorResponseForOfferHandoverErrors
     */
    error: OfferHandoverErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForOfferHandoverErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForPutDeckCollaboratorErrors
 */
export interface FormErrorResponseForPutDeckCollaboratorErrors {
    /**
     * The actual error struct
     */
    error: PutDeckCollaboratorErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRegisterDeckErrors
 */
export interface FormErrorResponseForRegisterDeckErrors {
    /**
     * The actual error struct
     * @type {RegisterDeckErrors}
     * @memberof FormErrorResponseForRegisterDeckErrors
     */
    error: RegisterDeckErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForRegisterDeckErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRegistrationErrors
 */
export interface FormErrorResponseForRegistrationErrors {
    /**
     * The actual error struct
     */
    error: RegistrationErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRenameAccountErrors
 */
export interface FormErrorResponseForRenameAccountErrors {
    /**
     * The actual error struct
     */
    error: RenameAccountErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRenamePasskeyErrors
 */
export interface FormErrorResponseForRenamePasskeyErrors {
    /**
     * The actual error struct
     */
    error: RenamePasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForReportResultErrors
 */
export interface FormErrorResponseForReportResultErrors {
    /**
     * The actual error struct
     * @type {ReportResultErrors}
     * @memberof FormErrorResponseForReportResultErrors
     */
    error: ReportResultErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForReportResultErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRoundErrors
 */
export interface FormErrorResponseForRoundErrors {
    /**
     * The actual error struct
     * @type {RoundErrors}
     * @memberof FormErrorResponseForRoundErrors
     */
    error: RoundErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForRoundErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSendBugReportErrors
 */
export interface FormErrorResponseForSendBugReportErrors {
    /**
     * The actual error struct
     */
    error: SendBugReportErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSetPaidErrors
 */
export interface FormErrorResponseForSetPaidErrors {
    /**
     * The actual error struct
     * @type {SetPaidErrors}
     * @memberof FormErrorResponseForSetPaidErrors
     */
    error: SetPaidErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSetPaidErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSetResultErrors
 */
export interface FormErrorResponseForSetResultErrors {
    /**
     * The actual error struct
     * @type {SetResultErrors}
     * @memberof FormErrorResponseForSetResultErrors
     */
    error: SetResultErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSetResultErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSetSwissRoundsErrors
 */
export interface FormErrorResponseForSetSwissRoundsErrors {
    /**
     * The actual error struct
     * @type {SetSwissRoundsErrors}
     * @memberof FormErrorResponseForSetSwissRoundsErrors
     */
    error: SetSwissRoundsErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSetSwissRoundsErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSignUpErrors
 */
export interface FormErrorResponseForSignUpErrors {
    /**
     * The actual error struct
     * @type {SignUpErrors}
     * @memberof FormErrorResponseForSignUpErrors
     */
    error: SignUpErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSignUpErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSignupErrors
 */
export interface FormErrorResponseForSignupErrors {
    /**
     * The actual error struct
     */
    error: SignupErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForStartLoginErrors
 */
export interface FormErrorResponseForStartLoginErrors {
    /**
     * The actual error struct
     */
    error: StartLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForStartOidcLoginErrors
 */
export interface FormErrorResponseForStartOidcLoginErrors {
    /**
     * The actual error struct
     */
    error: StartOidcLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSubscribePushDeviceErrors
 */
export interface FormErrorResponseForSubscribePushDeviceErrors {
    /**
     * The actual error struct
     * @type {SubscribePushDeviceErrors}
     * @memberof FormErrorResponseForSubscribePushDeviceErrors
     */
    error: SubscribePushDeviceErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSubscribePushDeviceErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForTournamentSettingsErrors
 */
export interface FormErrorResponseForTournamentSettingsErrors {
    /**
     * The actual error struct
     * @type {TournamentSettingsErrors}
     * @memberof FormErrorResponseForTournamentSettingsErrors
     */
    error: TournamentSettingsErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForTournamentSettingsErrors
     */
    result: ErrorConstant;
}


/**
 * What a format asks of a deck built for it
 * @export
 * @interface FormatRulesResponse
 */
export interface FormatRulesResponse {
    /**
     * Whether the deck's colours follow its commander unless overruled
     */
    color_identity_locked: boolean;
    /**
     * Whether a commander is required, and how many
     */
    commander: CommanderRule;
    /**
     * How many cards the deck holds
     */
    deck_size: DeckSize;
    /**
     * Whether a deck in this format claims one of the brackets
     */
    has_brackets: boolean;
    /**
     * How many copies of one card may be played, ignoring basic lands
     */
    max_copies: number;
    /**
     * The cards this format bans from a zone rather than from the deck
     */
    role_bans: RoleBansResponse;
    /**
     * How many cards the sideboard may hold, zero when the format has none
     */
    sideboard: number;
    /**
     * The slug, matching Scryfall's `legalities` keys
     */
    slug: string;
}
/**
 * The session's pending OIDC login
 * @export
 * @interface GetPendingOidcLoginResponse
 */
export interface GetPendingOidcLoginResponse {
    /**
     * The pending login, `None` if there is none or it ran out
     */
    pending?: PendingOidcLogin | null;
}
/**
 * A decklist to write into a deck
 * @export
 * @interface ImportDeckCardsRequest
 */
export interface ImportDeckCardsRequest {
    /**
     * The cards to put in
     */
    cards: Array<AddDeckCardRequest>;
    /**
     * Whether the cards add to the deck, replace it or fill it up for the advisor
     */
    mode: ImportMode;
}


/**
 * What an import wrote
 * @export
 * @interface ImportDeckCardsResponse
 */
export interface ImportDeckCardsResponse {
    /**
     * How many slots were added
     */
    added: number;
}

/**
 * How an import writes its cards into a deck
 * @export
 */
export const ImportMode = {
    /**
    * A decklist the owner pasted, linked or copied from another deck, added to what is there
    */
    Add: 'Add',
    /**
    * A decklist that throws away what is in the deck first

Gives every slot a new id, so anything hanging off those ids is lost. That is right for &quot;this decklist is the deck now&quot; and wrong for everything else, which is why it is the caller&#39;s decision.
    */
    Replace: 'Replace',
    /**
    * The cards the advisor suggested to fill the deck up with, added to what is there
    */
    Fill: 'Fill',
} as const;
export type ImportMode = typeof ImportMode[keyof typeof ImportMode];

/**
 * One page of a collection
 * @export
 * @interface ListCardsResponse
 */
export interface ListCardsResponse {
    /**
     * The stacks on this page
     */
    entries: Array<ListedEntryResponse>;
    /**
     * The page size actually applied, which may be below what was asked for
     */
    limit: number;
    /**
     * Pass back as `after` to get the next page, `None` at the end
     */
    next_cursor?: string | null;
    /**
     * How many stacks were skipped
     */
    offset: number;
    /**
     * How many stacks match the filters in total, for the pager
     */
    total: number;
    /**
     * How many copies those stacks hold — the cards, not the rows
     */
    total_copies: number;
}
/**
 * The stacks in a collection
 * @export
 * @interface ListCollectionEntriesResponse
 */
export interface ListCollectionEntriesResponse {
    /**
     * One entry per stack
     */
    entries: Array<CollectionEntryResponse>;
}
/**
 * Everything a deck's card list draws
 * @export
 * @interface ListDeckCardsResponse
 */
export interface ListDeckCardsResponse {
    /**
     * The slots, in the order they were added
     */
    cards: Array<DeckCardResponse>;
    /**
     * The tags that can be put on them
     */
    tags: Array<DeckTagResponse>;
}
/**
 * The owner and the Collaborators of a deck, the latter alphabetically by username
 * @export
 * @interface ListDeckCollaboratorsResponse
 */
export interface ListDeckCollaboratorsResponse {
    /**
     * The Collaborators
     */
    collaborators: Array<DeckCollaboratorResponse>;
    /**
     * The owner, which the list leaves out
     */
    owner: DeckOwnerResponse;
}
/**
 * Every folder an account keeps
 * @export
 * @interface ListDeckFoldersResponse
 */
export interface ListDeckFoldersResponse {
    /**
     * The folders, the account's own first and the archive last
     */
    folders: Array<DeckFolderResponse>;
}
/**
 * The formats a deck can be built for, and the Commander brackets
 * @export
 * @interface ListFormatsResponse
 */
export interface ListFormatsResponse {
    /**
     * The five Commander brackets, in order
     */
    brackets: Array<BracketRulesResponse>;
    /**
     * One entry per format
     */
    formats: Array<FormatRulesResponse>;
}
/**
 * The card-wide tags an account keeps
 * @export
 * @interface ListGlobalTagsResponse
 */
export interface ListGlobalTagsResponse {
    /**
     * The tags, by name
     */
    tags: Array<DeckTagResponse>;
}
/**
 * What a collection has lent out to decks
 * @export
 * @interface ListOnLoanResponse
 */
export interface ListOnLoanResponse {
    /**
     * One entry per stack, grouped by deck
     */
    loans: Array<OnLoanResponse>;
}
/**
 * The OpenID providers people may log in through
 * @export
 * @interface ListOpenIdProvidersResponse
 */
export interface ListOpenIdProvidersResponse {
    /**
     * The active providers, empty while OIDC login is off
     */
    providers: Array<SimpleOpenIdProvider>;
}
/**
 * Who runs a Tournament, and whom its Owner offered it to
 * @export
 * @interface ListOrganizersResponse
 */
export interface ListOrganizersResponse {
    /**
     * The Co-organizers, alphabetically by username
     * @type {Array<OrganizerResponse>}
     * @memberof ListOrganizersResponse
     */
    co_organizers: Array<OrganizerResponse>;
    /**
     * The Account the Tournament is offered to, `null` without a pending offer
     * @type {OrganizerResponse}
     * @memberof ListOrganizersResponse
     */
    handover?: OrganizerResponse | null;
    /**
     * The Owner, `null` while the Tombstone holds it
     * @type {OrganizerResponse}
     * @memberof ListOrganizersResponse
     */
    owner?: OrganizerResponse | null;
}
/**
 * The decks a Participant's Account owns, for an Organizer to register one
 * @export
 * @interface ListParticipantDecksResponse
 */
export interface ListParticipantDecksResponse {
    /**
     * Alphabetically by name; empty for a Guest
     * @type {Array<ParticipantDeckResponse>}
     * @memberof ListParticipantDecksResponse
     */
    decks: Array<ParticipantDeckResponse>;
}
/**
 * The Participants of a Tournament
 * @export
 * @interface ListParticipantsResponse
 */
export interface ListParticipantsResponse {
    /**
     * The reader's own Participant, `null` if the reader is none
     * @type {string}
     * @memberof ListParticipantsResponse
     */
    me?: string | null;
    /**
     * Every Participant, in the order they were added or signed up
     * @type {Array<ParticipantResponse>}
     * @memberof ListParticipantsResponse
     */
    participants: Array<ParticipantResponse>;
}
/**
 * The passkeys of the logged-in account
 * @export
 * @interface ListPasskeysResponse
 */
export interface ListPasskeysResponse {
    /**
     * One entry per registered device
     */
    passkeys: Array<SimplePasskey>;
}
/**
 * Every Registered deck of a Tournament, for its Organizers
 * @export
 * @interface ListRegisteredDecksResponse
 */
export interface ListRegisteredDecksResponse {
    /**
     * One per Participant that registered one, in the order they joined
     * @type {Array<RegisteredDeckResponse>}
     * @memberof ListRegisteredDecksResponse
     */
    decks: Array<RegisteredDeckResponse>;
}
/**
 * All scanner sessions owned by the account
 * @export
 * @interface ListScannerSessionsResponse
 */
export interface ListScannerSessionsResponse {
    /**
     * Sessions, newest first
     */
    sessions: Array<ScannerSessionResponse>;
}
/**
 * The decks other Accounts named the caller on, alphabetically by name
 * @export
 * @interface ListSharedWithMeResponse
 */
export interface ListSharedWithMeResponse {
    /**
     * The decks
     */
    decks: Array<SharedWithMeDeckResponse>;
}
/**
 * A list of Tournaments
 * @export
 * @interface ListTournamentsResponse
 */
export interface ListTournamentsResponse {
    /**
     * The Tournaments, latest start first
     * @type {Array<TournamentSummaryResponse>}
     * @memberof ListTournamentsResponse
     */
    tournaments: Array<TournamentSummaryResponse>;
}
/**
 * Every alarm that has gone off across an account's watch lists
 * @export
 * @interface ListWatchListAlarmsResponse
 */
export interface ListWatchListAlarmsResponse {
    /**
     * The alarms, newest first
     */
    alarms: Array<WatchListAlarmResponse>;
    /**
     * How many of them the reader has not seen yet
     */
    unread: number;
}
/**
 * Every stack one watch list entry counts
 * @export
 * @interface ListWatchListCopiesResponse
 */
export interface ListWatchListCopiesResponse {
    /**
     * The stacks, the ones on a shelf before the ones sleeved into a deck
     */
    copies: Array<WatchedCopyResponse>;
}
/**
 * Everything one watch list page is drawn from
 * @export
 * @interface ListWatchListEntriesResponse
 */
export interface ListWatchListEntriesResponse {
    /**
     * What is on it, oldest first
     */
    entries: Array<WatchListEntryResponse>;
    /**
     * The list itself
     */
    list: WatchListResponse;
    /**
     * The newest catalog sync any of these cards came out of
     * 
     * What the page dates its prices by. `None` for a list whose cards the catalog holds none of.
     */
    prices_updated_at?: string | null;
}
/**
 * Every watch list an account keeps
 * @export
 * @interface ListWatchListsResponse
 */
export interface ListWatchListsResponse {
    /**
     * The lists, oldest first
     */
    lists: Array<WatchListOverviewResponse>;
}
/**
 * What the catalog knows about a listed stack's card
 * 
 * `None` on an entry means the catalog has not caught up with that printing — a card filed from a set released since the last sync. The row still lists.
 * @export
 * @interface ListedCardResponse
 */
export interface ListedCardResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     * 
     * What a link to the card's market page is built from. The country page in front of it and the filters behind it are the reader's own settings. `None` when Cardmarket does not stock the printing, which is when the client falls back to a search by name.
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * Colour identity as the letters `WUBRG`
     */
    color_identity: string;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     */
    finishes: Array<string>;
    /**
     * The back face's artwork for a closer look
     */
    image_back_normal?: string | null;
    /**
     * The back face's artwork for a list row
     * 
     * `None` unless the card is photographed twice: a transform card, a modal double-faced card, a battle. A split card or an adventure prints both halves on one side, so there is nothing to turn over.
     */
    image_back_small?: string | null;
    /**
     * Artwork for a closer look — what a hover preview shows
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     */
    lang: string;
    /**
     * Mana value
     */
    mana_value: number;
    /**
     * The printed name
     */
    name: string;
    /**
     * Market price in euro cents
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     */
    price_eur_foil_cents?: number | null;
    /**
     * How rare the printing is
     */
    rarity: CardRarity;
    /**
     * Whether the card is on the reserved list
     */
    reserved: boolean;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
    /**
     * Type line as printed
     */
    type_line: string;
}


/**
 * One stack, with the card it holds
 * @export
 * @interface ListedEntryResponse
 */
export interface ListedEntryResponse {
    /**
     * The day the cards were acquired
     */
    acquired_at?: string | null;
    /**
     * The card, as far as the catalog knows it
     */
    card?: ListedCardResponse | null;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * When the stack was filed
     */
    created_at: string;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies this stack holds
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     */
    signed: boolean;
    /**
     * The owner's card-wide tags on the card this stack holds
     */
    tags: Array<string>;
    /**
     * Primary key
     */
    uuid: string;
}



/**
 * The language an outgoing mail is written in
 * 
 * Chosen by the client from the language its UI is showing — the mail should read like the page that caused it. Not persisted anywhere: every mail is triggered by a request, and that request carries the language.
 * @export
 */
export const MailLanguage = {
    /**
    * German — the default, matching the app&#39;s primary language
    */
    De: 'De',
    /**
    * English
    */
    En: 'En',
} as const;
export type MailLanguage = typeof MailLanguage[keyof typeof MailLanguage];

/**
 * A card the advisor has been told something about
 * @export
 * @interface MarkedCard
 */
export interface MarkedCard {
    /**
     * The name, so a list of these reads without resolving anything
     */
    name: string;
    /**
     * The oracle identity the advisor filters on
     */
    oracle_id: string;
}
/**
 * One Match, or a Bye
 * @export
 * @interface MatchResponse
 */
export interface MatchResponse {
    /**
     * Whether some of its Participants met in an earlier Round
     * @type {boolean}
     * @memberof MatchResponse
     */
    rematch: boolean;
    /**
     * Its Result, `null` while it has none and for a Bye
     * @type {ResultResponse}
     * @memberof MatchResponse
     */
    result?: ResultResponse | null;
    /**
     * Who plays, by Seat number
     * @type {Array<SeatResponse>}
     * @memberof MatchResponse
     */
    seats: Array<SeatResponse>;
    /**
     * The number of its table, 1 for the top table; `null` for a Bye
     * @type {number}
     * @memberof MatchResponse
     */
    table_number?: number | null;
    /**
     * Primary key
     * @type {string}
     * @memberof MatchResponse
     */
    uuid: string;
}
/**
 * @type Me200Response
 * 
 * @export
 */
export type Me200Response = FormErrorResponseForMeErrors | MeResponse;
/**
 * Why the session has no account to answer with
 * @export
 * @interface MeErrors
 */
export interface MeErrors {
    /**
     * An Admin locked the account; the session is logged out
     */
    locked: boolean;
}
/**
 * The account the current session belongs to
 * @export
 * @interface MeResponse
 */
export interface MeResponse {
    /**
     * Whether the account logs in through an OpenID provider (an External Account)
     * 
     * An External Account has no Passkeys and cannot add one.
     */
    external: boolean;
    /**
     * What the account may do, decides whether the admin dashboard is offered
     */
    role: Role;
    /**
     * The account's login handle and display name
     */
    username: string;
    /**
     * The account's primary key
     */
    uuid: string;
}


/**
 * Request to combine stacks of the same cards into one
 * @export
 * @interface MergeCollectionEntriesRequest
 */
export interface MergeCollectionEntriesRequest {
    /**
     * The stacks to combine — at least two, all of the same printing, condition and finish, and signed alike
     */
    entries: Array<string>;
}
/**
 * The art found for one name
 * @export
 * @interface MpcFillArtResponse
 */
export interface MpcFillArtResponse {
    /**
     * What was found, in the order MPCFill ranks it — empty for a card nobody drew
     */
    images: Array<MpcFillImageResponse>;
    /**
     * The name this answers, as it was asked
     */
    name: string;
}
/**
 * The card backs MPCFill offers
 * @export
 * @interface MpcFillCardbacksResponse
 */
export interface MpcFillCardbacksResponse {
    /**
     * The backs, in the order MPCFill ranks them
     */
    cardbacks: Array<MpcFillImageResponse>;
}
/**
 * One image of one card
 * @export
 * @interface MpcFillImageResponse
 */
export interface MpcFillImageResponse {
    /**
     * The resolution it was uploaded at
     */
    dpi: number;
    /**
     * The Google Drive file id — what the order xml names
     */
    id: string;
    /**
     * The language the card is printed in, as a two-letter code
     */
    language: string;
    /**
     * The file's name in the drive, which is what the order xml carries along
     */
    name: string;
    /**
     * How large the file is, in bytes
     */
    size: number;
    /**
     * The drive it came from, as its owner named it
     */
    source: string;
    /**
     * What the image is tagged with, e.g. `NSFW`, `Extended`
     */
    tags: Array<string>;
    /**
     * A thumbnail 800 pixels across, for looking at one closely
     */
    thumbnail_medium: string;
    /**
     * A thumbnail 400 pixels across, for a picker's grid
     */
    thumbnail_small: string;
}
/**
 * The cards to look for art for
 * @export
 * @interface MpcFillSearchRequest
 */
export interface MpcFillSearchRequest {
    /**
     * The names to look for, as printed
     * 
     * One entry per face rather than per card: the two halves of a double-faced card are two images in an order, and only the caller knows which half it is asking about.
     */
    names: Array<string>;
}
/**
 * What MPCFill has for the cards that were asked about
 * @export
 * @interface MpcFillSearchResponse
 */
export interface MpcFillSearchResponse {
    /**
     * One entry per name, in the order they were asked
     */
    results: Array<MpcFillArtResponse>;
}
/**
 * The reader's Match in the running Round of a Tournament
 * @export
 * @interface MyMatchResponse
 */
export interface MyMatchResponse {
    /**
     * The reader's Participant, `null` if the reader plays in none
     * @type {string}
     * @memberof MyMatchResponse
     */
    participant?: string | null;
    /**
     * The running Round, `null` while none runs
     * @type {CurrentRoundResponse}
     * @memberof MyMatchResponse
     */
    round?: CurrentRoundResponse | null;
    /**
     * The server's clock when it answered, to count the round timer down against
     * @type {string}
     * @memberof MyMatchResponse
     */
    server_time: string;
}
/**
 * The reader's own Registered deck in a Tournament
 * @export
 * @interface MyRegisteredDeckResponse
 */
export interface MyRegisteredDeckResponse {
    /**
     * Whether the reader may still register, swap or remove it itself
     * @type {boolean}
     * @memberof MyRegisteredDeckResponse
     */
    changeable: boolean;
    /**
     * The Registered deck, `null` while the reader plays without one
     * @type {RegisteredDeckResponse}
     * @memberof MyRegisteredDeckResponse
     */
    deck?: RegisteredDeckResponse | null;
}
/**
 * The Tournaments an Account runs and the ones it plays in
 * @export
 * @interface MyTournamentsResponse
 */
export interface MyTournamentsResponse {
    /**
     * The Tournaments it organizes, as Owner or Co-organizer, latest start first
     * @type {Array<TournamentSummaryResponse>}
     * @memberof MyTournamentsResponse
     */
    organizing: Array<TournamentSummaryResponse>;
    /**
     * The Tournaments it takes part in as a Participant, latest start first
     * @type {Array<TournamentSummaryResponse>}
     * @memberof MyTournamentsResponse
     */
    participating: Array<TournamentSummaryResponse>;
}
/**
 * Request naming an Account by its username
 * @export
 * @interface NameAccountRequest
 */
export interface NameAccountRequest {
    /**
     * Username of the Account, case ignored
     * @type {string}
     * @memberof NameAccountRequest
     */
    username: string;
}
/**
 * A stack to file into a collection
 * @export
 * @interface NewCollectionEntry
 */
export interface NewCollectionEntry {
    /**
     * The day the cards were acquired
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies to file
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     */
    signed?: boolean;
}


/**
 * Why a Tournament could not be offered to an Account
 * @export
 * @interface OfferHandoverErrors
 */
export interface OfferHandoverErrors {
    /**
     * The username is the caller's own, which owns the Tournament
     * @type {boolean}
     * @memberof OfferHandoverErrors
     */
    own_account: boolean;
    /**
     * The caller named too many unknown usernames lately, so this one was not looked up
     * @type {boolean}
     * @memberof OfferHandoverErrors
     */
    too_many_unknown_usernames: boolean;
    /**
     * No Account goes by this username
     * @type {boolean}
     * @memberof OfferHandoverErrors
     */
    unknown_username: boolean;
}
/**
 * @type OfferTournamentHandover200Response
 * 
 * @export
 */
export type OfferTournamentHandover200Response = FormErrorResponseForOfferHandoverErrors | OrganizerResponse;

/**
 * Why an OIDC login was refused, as the callback names it to the login page
 * 
 * Sent as the `oidc_error` query parameter of the login page, see [`OidcCallbackRedirect`].
 * @export
 */
export const OidcLoginFailure = {
    /**
    * The person cancelled at the provider
    */
    cancelled: 'cancelled',
    /**
    * The login was not started in this session, or ran out
    */
    expired: 'expired',
    /**
    * The provider cannot be reached right now
    */
    provider_unavailable: 'provider_unavailable',
    /**
    * The provider did not state a verified email
    */
    email_unverified: 'email_unverified',
    /**
    * The verified email belongs to an Account already
    */
    email_in_use: 'email_in_use',
    /**
    * An Admin locked the Account
    */
    locked: 'locked',
    /**
    * The provider&#39;s answer did not check out
    */
    failed: 'failed',
} as const;
export type OidcLoginFailure = typeof OidcLoginFailure[keyof typeof OidcLoginFailure];

/**
 * The oldest printing in the collection
 * @export
 * @interface OldestPrintingResponse
 */
export interface OldestPrintingResponse {
    /**
     * The card's name
     */
    name: string;
    /**
     * The day it was released
     */
    released_at: string;
    /**
     * Full set name
     */
    set_name: string;
}
/**
 * A stack out of this collection that is sleeved up in a deck right now
 * @export
 * @interface OnLoanResponse
 */
export interface OnLoanResponse {
    /**
     * Collector number as printed
     */
    collector_number?: string | null;
    /**
     * The deck they are in
     */
    deck: string;
    /**
     * What that deck is called
     */
    deck_name: string;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * The card's name, `None` for a printing the catalog has not caught up with
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * How many copies of it are in that deck
     */
    quantity: number;
    /**
     * Set code, upper case
     */
    set_code?: string | null;
    /**
     * Full set name
     */
    set_name?: string | null;
}
/**
 * One Organizer of a Tournament, or the Account it is offered to
 * @export
 * @interface OrganizerResponse
 */
export interface OrganizerResponse {
    /**
     * The Account, which is what removing a Co-organizer names
     * @type {string}
     * @memberof OrganizerResponse
     */
    account: string;
    /**
     * The Account's username as it is now
     * @type {string}
     * @memberof OrganizerResponse
     */
    username: string;
}

/**
 * The part an Account plays in running a Tournament
 * @export
 */
export const OrganizerRole = {
    /**
    * The Account the Tournament belongs to
    */
    Owner: 'Owner',
    /**
    * An Account named to run it with the Owner
    */
    CoOrganizer: 'CoOrganizer'
} as const;
export type OrganizerRole = typeof OrganizerRole[keyof typeof OrganizerRole];

/**
 * @type PairTournamentRound200Response
 * 
 * @export
 */
export type PairTournamentRound200Response = FormErrorResponseForRoundErrors | PairedRoundResponse;
/**
 * The Round just paired
 * @export
 * @interface PairedRoundResponse
 */
export interface PairedRoundResponse {
    /**
     * Its number
     * @type {number}
     * @memberof PairedRoundResponse
     */
    number: number;
}
/**
 * One deck a Participant's Account owns
 * @export
 * @interface ParticipantDeckResponse
 */
export interface ParticipantDeckResponse {
    /**
     * The format it is built for, a Scryfall slug
     * @type {string}
     * @memberof ParticipantDeckResponse
     */
    format: string;
    /**
     * Its name
     * @type {string}
     * @memberof ParticipantDeckResponse
     */
    name: string;
    /**
     * The deck
     * @type {string}
     * @memberof ParticipantDeckResponse
     */
    uuid: string;
}
/**
 * One Participant of a Tournament
 * @export
 * @interface ParticipantResponse
 */
export interface ParticipantResponse {
    /**
     * The last Round started before it Dropped, `null` while it plays on
     * @type {number}
     * @memberof ParticipantResponse
     */
    dropped_after_round?: number | null;
    /**
     * Whether it is a Guest rather than an Account
     * @type {boolean}
     * @memberof ParticipantResponse
     */
    guest: boolean;
    /**
     * The first Round it plays if it was added late, `null` if it was there before Round 1
     * @type {number}
     * @memberof ParticipantResponse
     */
    late_from_round?: number | null;
    /**
     * The Account's username as it is now, or the Guest's name
     * @type {string}
     * @memberof ParticipantResponse
     */
    name: string;
    /**
     * Whether it still owes the entry fee, which keeps it out of the pairing
     * 
     * Only Organizers learn it, `null` for every other reader. Always `false` while the Tournament has no entry fee.
     * @type {boolean}
     * @memberof ParticipantResponse
     */
    unpaid?: boolean | null;
    /**
     * Primary key
     * @type {string}
     * @memberof ParticipantResponse
     */
    uuid: string;
}
/**
 * An OIDC login waiting for its username step
 * @export
 * @interface PendingOidcLogin
 */
export interface PendingOidcLogin {
    /**
     * The verified email the Account will get
     */
    email: string;
    /**
     * The display name of the provider that vouched for the person
     */
    provider: string;
}
/**
 * An Account whose username starts with what the Organizer typed
 * @export
 * @interface PlayerCandidateResponse
 */
export interface PlayerCandidateResponse {
    /**
     * The Account
     * @type {string}
     * @memberof PlayerCandidateResponse
     */
    account: string;
    /**
     * The Account's username as it is now
     * @type {string}
     * @memberof PlayerCandidateResponse
     */
    username: string;
}
/**
 * The Accounts whose username starts with what the Organizer typed
 * @export
 * @interface PlayerCandidatesResponse
 */
export interface PlayerCandidatesResponse {
    /**
     * Up to ten Accounts, alphabetically by username
     * @type {Array<PlayerCandidateResponse>}
     * @memberof PlayerCandidatesResponse
     */
    accounts: Array<PlayerCandidateResponse>;
    /**
     * The caller searched too often lately, so nothing was searched
     * @type {boolean}
     * @memberof PlayerCandidatesResponse
     */
    too_many_searches: boolean;
}
/**
 * What one card cost on one day
 * 
 * All four are euro cents and all four may be absent: Cardmarket quotes no foil price for a card that was never printed in foil, and no price at all for a product nobody is offering that day.
 * @export
 * @interface PriceDayResponse
 */
export interface PriceDayResponse {
    /**
     * The day the guide quoted these prices for
     */
    day: string;
    /**
     * The cheapest offer
     */
    low_cents?: number | null;
    /**
     * The cheapest foil offer
     */
    low_foil_cents?: number | null;
    /**
     * Cardmarket's trend price
     */
    trend_cents?: number | null;
    /**
     * The foil trend price
     */
    trend_foil_cents?: number | null;
}
/**
 * What a card has cost over time
 * @export
 * @interface PriceHistoryResponse
 */
export interface PriceHistoryResponse {
    /**
     * The days, oldest first
     * 
     * Daily for the last quarter and weekly before that — the history is thinned as it ages, so a chart should plot against the dates rather than against the position in this list.
     */
    days: Array<PriceDayResponse>;
}
/**
 * One stack in the market-versus-purchase comparison
 * @export
 * @interface PricePointResponse
 */
export interface PricePointResponse {
    /**
     * How many copies the stack holds
     */
    copies: number;
    /**
     * What one copy fetches today, in euro cents
     */
    market_cents: number;
    /**
     * The card's name
     */
    name: string;
    /**
     * What was paid per copy, in euro cents
     */
    purchase_cents: number;
}
/**
 * One language the same card exists in
 * @export
 * @interface PrintingLanguageResponse
 */
export interface PrintingLanguageResponse {
    /**
     * Scryfall's id of that language's printing — what a stack stores
     */
    id: string;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * The language, as Scryfall's code
     */
    lang: string;
}
/**
 * The languages a card was printed in
 * @export
 * @interface PrintingLanguagesResponse
 */
export interface PrintingLanguagesResponse {
    /**
     * One per language, English first, the printing asked about included
     */
    languages: Array<PrintingLanguageResponse>;
}
/**
 * How one row of an import names the card it wants
 * 
 * Everything is optional because every exporter writes a different subset. What is present decides how precisely the card is named: an id names exactly one printing, a set code with a collector number names one card in every language, a name alone names a card but not which printing of it.
 * @export
 * @interface PrintingLookupRequest
 */
export interface PrintingLookupRequest {
    /**
     * Collector number as printed
     */
    collector_number?: string | null;
    /**
     * Scryfall's id of the printing, when the export carried one
     */
    id?: string | null;
    /**
     * The language the row is in, as Scryfall's code — English when absent
     */
    lang?: string | null;
    /**
     * The printed name
     */
    name?: string | null;
    /**
     * Set code, in any case
     */
    set_code?: string | null;
}
/**
 * A collection somebody put on show
 * 
 * What a collection looks like to a stranger: no share token, and no figure in money — see [`redact_entry`] for the same line drawn on its cards.
 * 
 * [`redact_entry`]: crate::http::handler_frontend::shared::schema::redact_entry
 * @export
 * @interface PublicCollectionResponse
 */
export interface PublicCollectionResponse {
    /**
     * Artwork of the most valuable cards in it, at most two
     */
    arts: Array<string>;
    /**
     * How many copies are filed in it
     */
    cards: number;
    /**
     * The colour the collection is drawn in
     */
    color: string;
    /**
     * The colours the collection holds, as the letters `WUBRG`
     */
    colors: string;
    /**
     * The point in time the collection was created
     */
    created_at: string;
    /**
     * Description shown above the card list
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     */
    icon: string;
    /**
     * Name of the collection
     */
    name: string;
    /**
     * The username of the account it belongs to
     */
    owner: string;
    /**
     * Copies per rarity
     */
    rarities: RarityCountsResponse;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * A deck somebody put on show
 * @export
 * @interface PublicDeckResponse
 */
export interface PublicDeckResponse {
    /**
     * The colours it may play, `null` for whatever the commander allows
     */
    allowed_color_identity?: string | null;
    /**
     * Which Commander bracket the deck is built to, `null` when it claims none
     */
    bracket?: number | null;
    /**
     * How many cards sit in the deck proper, the sideboard aside
     */
    cards: number;
    /**
     * The commanders, in the order they were put in
     */
    commanders: Array<DeckCommanderResponse>;
    /**
     * The point in time the deck was created
     */
    created_at: string;
    /**
     * Optional description, e.g. the deck's game plan
     */
    description?: string | null;
    /**
     * The format it is built for
     */
    format: string;
    /**
     * Name of the deck
     */
    name: string;
    /**
     * The username of the account that built it, `null` once it is deleted
     * 
     * The decklist stays; who built it does not.
     */
    owner?: string | null;
    /**
     * What those cards are worth in euro cents
     */
    price_eur_cents: number;
    /**
     * Primary key
     */
    uuid: string;
}

/**
 * What a public deck listing is ordered by
 * @export
 */
export const PublicDeckSort = {
    /**
    * Newest first
    */
    Created: 'Created',
    /**
    * By the deck&#39;s name
    */
    Name: 'Name',
    /**
    * By how many cards it holds
    */
    Cards: 'Cards',
    /**
    * By what those cards are worth
    */
    Price: 'Price',
} as const;
export type PublicDeckSort = typeof PublicDeckSort[keyof typeof PublicDeckSort];

/**
 * An account, as far as strangers get to see it
 * @export
 * @interface PublicProfileResponse
 */
export interface PublicProfileResponse {
    /**
     * The collections it put on show, alphabetically
     */
    collections: Array<PublicCollectionResponse>;
    /**
     * The point in time the account was created
     */
    created_at: string;
    /**
     * The decks it put on show, newest first
     */
    decks: Array<PublicDeckResponse>;
    /**
     * The public Tournaments it owns or plays in, latest start first
     * @type {Array<TournamentSummaryResponse>}
     * @memberof PublicProfileResponse
     */
    tournaments: Array<TournamentSummaryResponse>;
    /**
     * The account's login handle and display name
     */
    username: string;
}
/**
 * Names one device by its push endpoint
 * @export
 * @interface PushDeviceRequest
 */
export interface PushDeviceRequest {
    /**
     * The device's push endpoint
     * @type {string}
     * @memberof PushDeviceRequest
     */
    endpoint: string;
}
/**
 * Whether a device is subscribed for the account
 * @export
 * @interface PushDeviceResponse
 */
export interface PushDeviceResponse {
    /**
     * True if the device gets this account's pushes
     * @type {boolean}
     * @memberof PushDeviceResponse
     */
    subscribed: boolean;
}

/**
 * The language a device's pushes are written in
 * 
 * The one its app showed when it subscribed: the text has to be readable on the lock screen, without asking the service for anything.
 * @export
 */
export const PushLanguage = {
    /**
    * German, the app&#39;s primary language
    */
    De: 'De',
    /**
    * English
    */
    En: 'En'
} as const;
export type PushLanguage = typeof PushLanguage[keyof typeof PushLanguage];

/**
 * The account's push settings and what a device subscribes with
 * @export
 * @interface PushSettingsResponse
 */
export interface PushSettingsResponse {
    /**
     * The public VAPID key to pass to `PushManager.subscribe`, `None` while the service sends no pushes
     * @type {string}
     * @memberof PushSettingsResponse
     */
    public_key?: string | null;
    /**
     * Whether the account's devices get tournament pushes
     * @type {boolean}
     * @memberof PushSettingsResponse
     */
    tournament_pushes: boolean;
}
/**
 * @type PutDeckCollaborator200Response
 * 
 * @export
 */
export type PutDeckCollaborator200Response = DeckCollaboratorResponse | FormErrorResponseForPutDeckCollaboratorErrors;
/**
 * Why an Account could not be named on a deck
 * @export
 * @interface PutDeckCollaboratorErrors
 */
export interface PutDeckCollaboratorErrors {
    /**
     * The username is the caller's own, which owns the deck
     */
    own_account: boolean;
    /**
     * The caller named too many unknown usernames lately, so this one was not looked up
     */
    too_many_unknown_usernames: boolean;
    /**
     * No Account goes by this username
     */
    unknown_username: boolean;
}
/**
 * Request to name an Account on a deck, or to change its level
 * @export
 * @interface PutDeckCollaboratorRequest
 */
export interface PutDeckCollaboratorRequest {
    /**
     * What the owner lets it do
     */
    level: CollaboratorLevel;
    /**
     * Username of the Account, case ignored
     */
    username: string;
}


/**
 * Copies per rarity in a collection
 * @export
 * @interface RarityCountsResponse
 */
export interface RarityCountsResponse {
    /**
     * Copies of common cards
     */
    common: number;
    /**
     * Copies of mythic rare cards
     */
    mythic: number;
    /**
     * Copies of everything else the catalog files separately
     */
    other: number;
    /**
     * Copies of rare cards
     */
    rare: number;
    /**
     * Copies of uncommon cards
     */
    uncommon: number;
}
/**
 * One card of a decklist read off another site
 * @export
 * @interface ReadDeckCardResponse
 */
export interface ReadDeckCardResponse {
    /**
     * The collector number, when the site says
     */
    collector_number?: string | null;
    /**
     * Whether the list asks for the foil copies
     */
    foil: boolean;
    /**
     * The card's name, to be placed in the catalog by the client
     */
    name: string;
    /**
     * How many copies
     */
    quantity: number;
    /**
     * The set it was printed in, when the site says
     */
    set_code?: string | null;
    /**
     * Which zone it sits in
     */
    zone: DeckZone;
}


/**
 * A link to a deck on another site
 * @export
 * @interface ReadDeckUrlRequest
 */
export interface ReadDeckUrlRequest {
    /**
     * The link, as it was copied out of the address bar
     */
    url: string;
}
/**
 * A decklist read off another site
 * 
 * Deliberately not written to any deck: the cards are placed in the catalog by the client, exactly as a pasted list is, so both ways of importing end in the same place.
 * @export
 * @interface ReadDeckUrlResponse
 */
export interface ReadDeckUrlResponse {
    /**
     * The cards
     */
    cards: Array<ReadDeckCardResponse>;
    /**
     * The format it is built for, as the site spells it
     */
    format?: string | null;
    /**
     * What the deck is called there
     */
    name: string;
}
/**
 * Request a fresh registration link for an existing account
 * 
 * The "lost passkey" flow. Deliberately no response and no errors: whether the username exists must not be readable from the answer, so the endpoint says `200` either way and sends mail only where there is an account.
 * @export
 * @interface RecoverAccountRequest
 */
export interface RecoverAccountRequest {
    /**
     * The language the recovery mail is written in
     * 
     * The client sends the language its UI is showing; left out, the mail falls back to German, the app's primary language.
     */
    language?: MailLanguage;
    /**
     * The username to recover
     */
    username: any;
}


/**
 * Why a Registered deck could not be registered, swapped or removed
 * @export
 * @interface RegisterDeckErrors
 */
export interface RegisterDeckErrors {
    /**
     * The Participant is a Guest, which has no decks
     * @type {boolean}
     * @memberof RegisterDeckErrors
     */
    guest: boolean;
    /**
     * The deck does not exist or the Participant's Account does not own it
     * @type {boolean}
     * @memberof RegisterDeckErrors
     */
    not_their_deck: boolean;
    /**
     * The first Round started, so only Organizers change it
     * @type {boolean}
     * @memberof RegisterDeckErrors
     */
    registration_over: boolean;
}
/**
 * The deck to register
 * @export
 * @interface RegisterDeckRequest
 */
export interface RegisterDeckRequest {
    /**
     * One of the Participant's Account's decks
     * @type {string}
     * @memberof RegisterDeckRequest
     */
    deck: string;
}
/**
 * The deck a Participant plays in a Tournament
 * @export
 * @interface RegisteredDeckResponse
 */
export interface RegisteredDeckResponse {
    /**
     * The Commander bracket it is built to, `null` when unset
     * @type {number}
     * @memberof RegisteredDeckResponse
     */
    bracket?: number | null;
    /**
     * The deck it was made from, `null` once that deck is deleted
     * @type {string}
     * @memberof RegisteredDeckResponse
     */
    deck?: string | null;
    /**
     * The format the deck is built for, a Scryfall slug
     * @type {string}
     * @memberof RegisteredDeckResponse
     */
    format: string;
    /**
     * The deck's name: as it is now until pinned, as it was when pinned afterwards
     * @type {string}
     * @memberof RegisteredDeckResponse
     */
    name: string;
    /**
     * The Participant playing it
     * @type {string}
     * @memberof RegisteredDeckResponse
     */
    participant: string;
    /**
     * Whether it is a copy that no longer changes with the deck
     * @type {boolean}
     * @memberof RegisteredDeckResponse
     */
    pinned: boolean;
}
/**
 * Why a passkey registration could not be started or completed
 * @export
 * @interface RegistrationErrors
 */
export interface RegistrationErrors {
    /**
     * This authenticator already holds a passkey for this account
     */
    already_registered: boolean;
    /**
     * An Admin locked the account
     */
    locked: boolean;
    /**
     * The browser's response was not a credential
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `register/start` was never called
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     */
    registration_failed: boolean;
    /**
     * The token is past its validity
     */
    token_expired: boolean;
    /**
     * No such registration token
     */
    token_invalid: boolean;
    /**
     * The token was already used to register a passkey
     */
    token_used: boolean;
}
/**
 * @type RenameAccount200Response
 * 
 * @export
 */
export type RenameAccount200Response = FormErrorResponseForRenameAccountErrors | RenameAccountResponse;
/**
 * Why an account could not be renamed
 * @export
 * @interface RenameAccountErrors
 */
export interface RenameAccountErrors {
    /**
     * Another account goes by this username already, case ignored
     */
    username_taken: boolean;
}
/**
 * Request to rename the logged-in account
 * @export
 * @interface RenameAccountRequest
 */
export interface RenameAccountRequest {
    /**
     * The new username, held to the same rules as at signup
     */
    username: any;
}
/**
 * The renamed account, and what its passkeys' authenticators need to show the new name
 * @export
 * @interface RenameAccountResponse
 */
export interface RenameAccountResponse {
    /**
     * The `rpId` to pass to `PublicKeyCredential.signalCurrentUserDetails`
     */
    rp_id: string;
    /**
     * The base64url `userId` to pass to `PublicKeyCredential.signalCurrentUserDetails`
     */
    user_id: string;
    /**
     * The new username, spelled the way it was requested
     */
    username: string;
}
/**
 * Why a passkey could not be renamed
 * @export
 * @interface RenamePasskeyErrors
 */
export interface RenamePasskeyErrors {
    /**
     * Nothing is left of the label once trimmed
     */
    empty_label: boolean;
    /**
     * No passkey with that id belongs to this account
     */
    unknown_passkey: boolean;
}
/**
 * Request to rename one of the logged-in account's passkeys
 * @export
 * @interface RenamePasskeyRequest
 */
export interface RenamePasskeyRequest {
    /**
     * The new label, trimmed before it is stored
     */
    label: string;
}
/**
 * Why a Participant's report was refused
 * @export
 * @interface ReportResultErrors
 */
export interface ReportResultErrors {
    /**
     * An Organizer set the Result
     * @type {boolean}
     * @memberof ReportResultErrors
     */
    confirmed: boolean;
    /**
     * The Result is disputed; an Organizer settles it
     * @type {boolean}
     * @memberof ReportResultErrors
     */
    disputed: boolean;
    /**
     * The game score does not fit a Match of this Tournament
     * @type {boolean}
     * @memberof ReportResultErrors
     */
    invalid_score: boolean;
    /**
     * The Match's Round is not running, or the Tournament is over
     * @type {boolean}
     * @memberof ReportResultErrors
     */
    not_running: boolean;
    /**
     * Another Participant reported a different Result; dispute it instead
     * @type {boolean}
     * @memberof ReportResultErrors
     */
    reported_by_other: boolean;
}
/**
 * The Result a Participant reports for its Match
 * @export
 * @interface ReportResultRequest
 */
export interface ReportResultRequest {
    /**
     * Games nobody won
     * @type {number}
     * @memberof ReportResultRequest
     */
    games_drawn: number;
    /**
     * Games won per Seat, in Seat order
     * @type {Array<number>}
     * @memberof ReportResultRequest
     */
    games_won: Array<number>;
}
/**
 * A list of cards to place in the catalog
 * @export
 * @interface ResolvePrintingsRequest
 */
export interface ResolvePrintingsRequest {
    /**
     * The rows to look up, in any order
     */
    lookups: Array<PrintingLookupRequest>;
}
/**
 * What the catalog could place
 * @export
 * @interface ResolvePrintingsResponse
 */
export interface ResolvePrintingsResponse {
    /**
     * The printings, each naming the lookup it answers
     * 
     * A lookup no printing names is one the catalog holds no card for. That is an answer, not a failure — the row has to be reported as unmatched rather than dropped, and a card the catalog does not know cannot be filed anyway.
     */
    printings: Array<ResolvedPrintingResponse>;
}
/**
 * What the catalog knows about a card an import asked for
 * @export
 * @interface ResolvedPrintingResponse
 */
export interface ResolvedPrintingResponse {
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     */
    finishes: Array<string>;
    /**
     * Scryfall's id of the printing — what a collection entry stores
     */
    id: string;
    /**
     * Language of this printing, as Scryfall's code
     */
    lang: string;
    /**
     * Which lookup this answers, as its position in the request
     * 
     * Answers carry their question rather than the list carrying a hole per unmatched row: a five-figure import is mostly cards the catalog knows, and the few it does not are what the client reports as unmatched.
     */
    lookup: number;
    /**
     * The printed name
     */
    name: string;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
}
/**
 * The game score of a Match
 * @export
 * @interface ResultResponse
 */
export interface ResultResponse {
    /**
     * The Participant who disputed it, `null` unless it is disputed
     * @type {string}
     * @memberof ResultResponse
     */
    disputed_by?: string | null;
    /**
     * Games nobody won
     * @type {number}
     * @memberof ResultResponse
     */
    games_drawn: number;
    /**
     * Games won per Seat, in Seat order
     * @type {Array<number>}
     * @memberof ResultResponse
     */
    games_won: Array<number>;
    /**
     * The Participant who reported it, `null` when an Organizer set it
     * @type {string}
     * @memberof ResultResponse
     */
    reported_by?: string | null;
    /**
     * Where it stands: reported by a Participant, disputed, or set by an Organizer
     * @type {ResultState}
     * @memberof ResultResponse
     */
    state: ResultState;
}



/**
 * Where a Match's Result stands
 * @export
 */
export const ResultState = {
    /**
    * Reported by a Participant of the Match; it counts, and another Participant may dispute it
    */
    Reported: 'Reported',
    /**
    * Disputed by another Participant of the Match; it holds the Round open until an Organizer settles it
    */
    Disputed: 'Disputed',
    /**
    * Set by an Organizer; Participants can no longer change or dispute it
    */
    Confirmed: 'Confirmed'
} as const;
export type ResultState = typeof ResultState[keyof typeof ResultState];

/**
 * Request to sort everything in the deck back where it came from
 * @export
 * @interface ReturnAllDeckCardsRequest
 */
export interface ReturnAllDeckCardsRequest {
    /**
     * Where stacks without an origin go, `None` to leave those in the deck
     */
    target?: string | null;
}
/**
 * What sorting a deck back moved
 * @export
 * @interface ReturnAllDeckCardsResponse
 */
export interface ReturnAllDeckCardsResponse {
    /**
     * How many stayed, because nobody said where they belong
     */
    left: number;
    /**
     * How many stacks were sorted back
     */
    returned: number;
}
/**
 * Request to sort copies out of the deck back into a collection
 * @export
 * @interface ReturnDeckCardsRequest
 */
export interface ReturnDeckCardsRequest {
    /**
     * The stack in the deck to take them from
     */
    entry: string;
    /**
     * How many copies to sort back
     */
    quantity: number;
    /**
     * Where to put them, `None` to use where they came from
     */
    target?: string | null;
}

/**
 * What an [`Account`] may do beyond managing its own things
 * @export
 */
export const Role = {
    /**
    * Manages its own collections and decks
    */
    Member: 'Member',
    /**
    * Also manages other Accounts in the admin dashboard
    */
    Admin: 'Admin',
} as const;
export type Role = typeof Role[keyof typeof Role];

/**
 * The cards a format bans from a zone rather than from the deck
 * 
 * A card banned outright is simply not in `legal_formats`, which the catalog answers per printing. These cannot be answered there: the same card is legal in the ninety-nine and illegal in the command zone, so the question is about where it sits and only the deck knows that. Every list is empty for a format that bans nothing this way, which today is every format but Archon.
 * @export
 * @interface RoleBansResponse
 */
export interface RoleBansResponse {
    /**
     * Cards that may not be a commander, by name
     */
    commander: Array<string>;
    /**
     * Cards that may not be the companion, by name
     */
    companion: Array<string>;
    /**
     * Commander pairs that may not sit in the command zone together
     * 
     * Each entry is the two names, both of them legal commanders apart.
     */
    pairings: Array<Array<string>>;
    /**
     * Cards that may not be one of a pair of partnered commanders, by name
     * 
     * Alone they are legal commanders — only the second seat is the problem.
     */
    partner: Array<string>;
}
/**
 * The freshly minted secret of a deck's share link
 * @export
 * @interface RotateDeckShareTokenResponse
 */
export interface RotateDeckShareTokenResponse {
    /**
     * The new secret — every link handed out before this call stopped working
     */
    share_token: string;
}
/**
 * The freshly minted secret of a collection's share link
 * @export
 * @interface RotateShareTokenResponse
 */
export interface RotateShareTokenResponse {
    /**
     * The new secret — every link handed out before this call stopped working
     */
    share_token: string;
}
/**
 * Why a Round could not be paired, started, ended or discarded
 * @export
 * @interface RoundErrors
 */
export interface RoundErrors {
    /**
     * Every Swiss Round was paired
     * @type {boolean}
     * @memberof RoundErrors
     */
    all_rounds_paired: boolean;
    /**
     * A later Round started, so this one cannot be taken back
     * @type {boolean}
     * @memberof RoundErrors
     */
    later_round_started: boolean;
    /**
     * No Round of that number ended
     * @type {boolean}
     * @memberof RoundErrors
     */
    not_ended: boolean;
    /**
     * No Round of that number is previewed
     * @type {boolean}
     * @memberof RoundErrors
     */
    not_previewed: boolean;
    /**
     * No Round of that number is running
     * @type {boolean}
     * @memberof RoundErrors
     */
    not_running: boolean;
    /**
     * A Result of the Round is disputed; an Organizer settles it first
     * @type {boolean}
     * @memberof RoundErrors
     */
    results_disputed: boolean;
    /**
     * A Match of the Round has no Result yet
     * @type {boolean}
     * @memberof RoundErrors
     */
    results_missing: boolean;
    /**
     * A Round is previewed or running, so the next one waits
     * @type {boolean}
     * @memberof RoundErrors
     */
    round_open: boolean;
    /**
     * mtg does not pair this Tournament's Ruleset yet
     * @type {boolean}
     * @memberof RoundErrors
     */
    ruleset_not_paired: boolean;
    /**
     * Fewer than two Participants can be paired
     * @type {boolean}
     * @memberof RoundErrors
     */
    too_few_participants: boolean;
    /**
     * The Tournament is Finished or Cancelled
     * @type {boolean}
     * @memberof RoundErrors
     */
    tournament_over: boolean;
}
/**
 * One Round
 * @export
 * @interface RoundResponse
 */
export interface RoundResponse {
    /**
     * Its Matches by table number, then its Byes
     * @type {Array<MatchResponse>}
     * @memberof RoundResponse
     */
    matches: Array<MatchResponse>;
    /**
     * Its number, 1 for the first Round; the Top cut goes on counting after the Swiss Rounds
     * @type {number}
     * @memberof RoundResponse
     */
    number: number;
    /**
     * Whether it is a Swiss Round or one of the Top cut
     * @type {RoundStage}
     * @memberof RoundResponse
     */
    stage: RoundStage;
    /**
     * How far it got
     * @type {RoundState}
     * @memberof RoundResponse
     */
    state: RoundState;
    /**
     * Its round timer while it runs; `null` before and after, and for a Tournament without one
     * @type {RoundTimerResponse}
     * @memberof RoundResponse
     */
    timer?: RoundTimerResponse | null;
}



/**
 * Which part of a Tournament a Round belongs to
 * @export
 */
export const RoundStage = {
    /**
    * A Swiss Round: it counts for the standings
    */
    Swiss: 'Swiss',
    /**
    * A Round of the Top cut: single elimination, no standings
    */
    TopCut: 'TopCut'
} as const;
export type RoundStage = typeof RoundStage[keyof typeof RoundStage];


/**
 * How far a Round got
 * @export
 */
export const RoundState = {
    /**
    * Paired, seen by Organizers only, not played yet
    */
    Previewed: 'Previewed',
    /**
    * Started: its Matches are being played
    */
    Running: 'Running',
    /**
    * Over: every Match has its Result, none disputed
    */
    Ended: 'Ended'
} as const;
export type RoundState = typeof RoundState[keyof typeof RoundState];

/**
 * The round timer of a running Round
 * @export
 * @interface RoundTimerResponse
 */
export interface RoundTimerResponse {
    /**
     * When time is up
     * @type {string}
     * @memberof RoundTimerResponse
     */
    ends_at: string;
    /**
     * How many turns follow the active player's turn once time is up, under the Tournament's Ruleset
     * 
     * Information only: 5 under MTR, 0 under the multiplayer Rulesets.
     * @type {number}
     * @memberof RoundTimerResponse
     */
    extra_turns: number;
    /**
     * How long the Round runs, in seconds
     * @type {number}
     * @memberof RoundTimerResponse
     */
    length_seconds: number;
    /**
     * Seconds left when the server answered, 0 once time is up
     * @type {number}
     * @memberof RoundTimerResponse
     */
    remaining_seconds: number;
    /**
     * Whether time was up when the server answered
     * @type {boolean}
     * @memberof RoundTimerResponse
     */
    time_up: boolean;
}
/**
 * The Rounds of a Tournament the reader may see, and how many are planned
 * @export
 * @interface RoundsResponse
 */
export interface RoundsResponse {
    /**
     * The Rounds, oldest first; a previewed one only for Organizers
     * @type {Array<RoundResponse>}
     * @memberof RoundsResponse
     */
    rounds: Array<RoundResponse>;
    /**
     * The server's clock when it answered, to count a round timer down against
     * @type {string}
     * @memberof RoundsResponse
     */
    server_time: string;
    /**
     * How many Swiss Rounds mtg suggests for the Participants there are now; `null` for a Ruleset mtg does not pair yet
     * @type {number}
     * @memberof RoundsResponse
     */
    suggested_swiss_rounds?: number | null;
    /**
     * How many Swiss Rounds an Organizer set, or the first Round settled; `null` while the suggestion applies
     * @type {number}
     * @memberof RoundsResponse
     */
    swiss_rounds?: number | null;
    /**
     * How many Participants the Top cut takes, `null` without one
     * 
     * Once it started the size it started with; before, the size the Participants who play on fill, so a Top 8 of seven reads 4.
     * @type {number}
     * @memberof RoundsResponse
     */
    top_cut_size?: number | null;
}

/**
 * The published tournament rules a Tournament follows
 * 
 * A closed set, chosen per Tournament and never edited: Match points, Byes, smaller Matches and Tiebreakers all follow from it.
 * @export
 */
export const Ruleset = {
    /**
    * The Magic Tournament Rules, one-on-one
    */
    Mtr: 'Mtr',
    /**
    * TopDeck&#39;s multiplayer rules: smaller Matches or Byes
    */
    TopDeck: 'TopDeck',
    /**
    * The Multiplayer Addendum to the MTR: smaller Matches, never a Bye
    */
    MultiplayerAddendum: 'MultiplayerAddendum'
} as const;
export type Ruleset = typeof Ruleset[keyof typeof Ruleset];

/**
 * One session together with its staging area
 * @export
 * @interface ScannerSessionDetailResponse
 */
export interface ScannerSessionDetailResponse {
    /**
     * Staged stacks, newest first
     */
    entries: Array<ScannerSessionEntryResponse>;
    /**
     * Session metadata and counts
     */
    session: ScannerSessionResponse;
}
/**
 * One editable staged stack
 * @export
 * @interface ScannerSessionEntryResponse
 */
export interface ScannerSessionEntryResponse {
    /**
     * When this stack was first staged
     */
    created_at: string;
    /**
     * Physical finish
     */
    finish: CardFinish;
    /**
     * Scryfall printing id
     */
    printing: string;
    /**
     * Paid price per copy in euro cents
     */
    purchase_price_cents?: number | null;
    /**
     * Number of copies
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     */
    signed: boolean;
    /**
     * Primary key
     */
    uuid: string;
}


/**
 * Scanner session metadata
 * @export
 * @interface ScannerSessionResponse
 */
export interface ScannerSessionResponse {
    /**
     * Preferred destination collection
     */
    collection?: string | null;
    /**
     * Marker colour
     */
    color: string;
    /**
     * Number of staged copies
     */
    copies: number;
    /**
     * Creation time
     */
    created_at: string;
    /**
     * Marker icon
     */
    icon: string;
    /**
     * Display name
     */
    name: string;
    /**
     * Number of distinct staged stacks
     */
    stacks: number;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * One page of the decks their owners put on show
 * @export
 * @interface SearchPublicDecksResponse
 */
export interface SearchPublicDecksResponse {
    /**
     * The decks on this page
     */
    decks: Array<PublicDeckResponse>;
    /**
     * How many decks were asked for
     */
    limit: number;
    /**
     * How many decks were skipped
     */
    offset: number;
    /**
     * How many decks the search found in total
     */
    total: number;
}
/**
 * A Participant's Seat in a Match
 * @export
 * @interface SeatResponse
 */
export interface SeatResponse {
    /**
     * Whether it is a Guest rather than an Account
     * @type {boolean}
     * @memberof SeatResponse
     */
    guest: boolean;
    /**
     * The Account's username as it is now, or the Guest's name
     * @type {string}
     * @memberof SeatResponse
     */
    name: string;
    /**
     * Who sits there
     * @type {string}
     * @memberof SeatResponse
     */
    participant: string;
    /**
     * The Seat number, 1 for the first turn
     * @type {number}
     * @memberof SeatResponse
     */
    seat: number;
}
/**
 * @type SendBugReport200Response
 * 
 * @export
 */
export type SendBugReport200Response = FormErrorResponseForSendBugReportErrors | SendBugReportResponse;
/**
 * Why a Bug report could not be sent
 * @export
 * @interface SendBugReportErrors
 */
export interface SendBugReportErrors {
    /**
     * A part sent as an image is no JPEG, PNG or WebP
     */
    image_invalid: boolean;
    /**
     * An image is larger than 5 MB
     */
    image_too_large: boolean;
    /**
     * The Account sent 15 Bug reports within the last hour
     */
    rate_limited: boolean;
    /**
     * The `report` part is missing, larger than 512 KB or not the expected json
     */
    report_invalid: boolean;
    /**
     * The text is empty or too short
     */
    text_missing: boolean;
    /**
     * The text has more than 5000 characters
     */
    text_too_long: boolean;
    /**
     * More than three images
     */
    too_many_images: boolean;
}
/**
 * The `report` part of a Bug report: what the player wrote and what the app knew
 * @export
 * @interface SendBugReportRequest
 */
export interface SendBugReportRequest {
    /**
     * The diagnostics document the app built, stored as is
     */
    diagnostics: any | null;
    /**
     * The browser's language
     */
    language: string;
    /**
     * The Release the app was running
     */
    release: string;
    /**
     * The route the app was on
     */
    route: string;
    /**
     * What went wrong, in the player's words
     */
    text: string;
    /**
     * The browser's user agent
     */
    user_agent: string;
    /**
     * The browser window's size, as `<width>x<height>`
     */
    viewport: string;
}
/**
 * A sent Bug report
 * @export
 * @interface SendBugReportResponse
 */
export interface SendBugReportResponse {
    /**
     * Its running number, for the player to quote
     */
    number: number;
}
/**
 * Request to replace a deck's advisor settings
 * 
 * Whole-document, not per-field: every writer today (ignoring a card, dragging a corridor, pinning a theme) already rewrites its own slice of this, so a `PATCH` per field would buy nothing.
 * 
 * `pool_query` is a plain string here rather than [`MaxStr`] like everywhere else in this document: the handler trims it and turns an empty result into `None` before it becomes the bounded type, so the length that is actually checked is the trimmed one.
 * @export
 * @interface SetAdvisorSettingsRequest
 */
export interface SetAdvisorSettingsRequest {
    /**
     * Cards the advisor must never offer
     */
    ignored: Array<MarkedCard>;
    /**
     * Cards the advisor must never propose cutting
     */
    kept: Array<MarkedCard>;
    /**
     * The restriction on what may be suggested at all, blank for the whole pool
     */
    pool_query?: string | null;
    /**
     * Whether the reader has been through the advisor's questions
     */
    setup_done: boolean;
    /**
     * The shape the deck is graded against, where it was moved
     */
    targets: DeckTargets;
    /**
     * Which themes to argue for and which to avoid
     */
    themes: ThemePrefs;
}
/**
 * One set's share of the collection
 * @export
 * @interface SetBucketResponse
 */
export interface SetBucketResponse {
    /**
     * Copies from this set
     */
    cards: number;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
    /**
     * What those copies are worth, in euro cents
     */
    value_cents: number;
}
/**
 * Request to change who may see a collection
 * @export
 * @interface SetCollectionVisibilityRequest
 */
export interface SetCollectionVisibilityRequest {
    /**
     * The visibility to switch to
     */
    visibility: Visibility;
}


/**
 * Request to say which Commander bracket a deck is built to
 * @export
 * @interface SetDeckBracketRequest
 */
export interface SetDeckBracketRequest {
    /**
     * The bracket, one to five, or `null` to leave it unsaid
     */
    bracket?: number | null;
}
/**
 * The name of a Deck checkpoint
 * @export
 * @interface SetDeckCheckpointRequest
 */
export interface SetDeckCheckpointRequest {
    /**
     * The name, never blank; surrounding whitespace is dropped
     */
    name: string;
}
/**
 * Request to overrule which colours a deck may play
 * @export
 * @interface SetDeckColorsRequest
 */
export interface SetDeckColorsRequest {
    /**
     * The colours as the letters `WUBRG`, or `null` to follow the commander
     */
    colors?: string | null;
}
/**
 * Request to file a deck into a folder, or onto no shelf at all
 * @export
 * @interface SetDeckFolderRequest
 */
export interface SetDeckFolderRequest {
    /**
     * The folder to file it in, `null` to take it off every shelf
     */
    folder?: string | null;
}
/**
 * Request to record the house rules a deck is played under
 * 
 * The whole Rule 0 form, colours included, so saving it is one Deck change.
 * @export
 * @interface SetDeckRuleZeroRequest
 */
export interface SetDeckRuleZeroRequest {
    /**
     * Whether the table agreed to cards the format bans
     */
    allow_banned: boolean;
    /**
     * Whether the table agreed to multiple copies of a card
     */
    allow_duplicates: boolean;
    /**
     * Whether the table agreed to more than the format's commanders
     */
    allow_extra_commanders: boolean;
    /**
     * The colours as the letters `WUBRG`, `null` or left out to follow the commander
     */
    colors?: string | null;
    /**
     * How many cards the deck is built to, `null` for the format's rule
     */
    deck_size?: number | null;
}
/**
 * Request to change who may see a deck
 * @export
 * @interface SetDeckVisibilityRequest
 */
export interface SetDeckVisibilityRequest {
    /**
     * The visibility to switch to
     */
    visibility: Visibility;
}


/**
 * Why a Participant could not be marked paid or unpaid
 * @export
 * @interface SetPaidErrors
 */
export interface SetPaidErrors {
    /**
     * The Tournament has no entry fee, so nobody is unpaid
     * @type {boolean}
     * @memberof SetPaidErrors
     */
    no_entry_fee: boolean;
    /**
     * The Tournament is Finished or Cancelled
     * @type {boolean}
     * @memberof SetPaidErrors
     */
    tournament_over: boolean;
}
/**
 * Whether a Participant paid the entry fee
 * @export
 * @interface SetPaidRequest
 */
export interface SetPaidRequest {
    /**
     * `true` once it paid, `false` to take that back
     * @type {boolean}
     * @memberof SetPaidRequest
     */
    paid: boolean;
}
/**
 * Changes the account's push settings
 * @export
 * @interface SetPushSettingsRequest
 */
export interface SetPushSettingsRequest {
    /**
     * Whether the account's devices get tournament pushes
     * @type {boolean}
     * @memberof SetPushSettingsRequest
     */
    tournament_pushes: boolean;
}
/**
 * Why a Result could not be set
 * @export
 * @interface SetResultErrors
 */
export interface SetResultErrors {
    /**
     * The game score does not fit a Match of this Tournament
     * @type {boolean}
     * @memberof SetResultErrors
     */
    invalid_score: boolean;
    /**
     * The Match's Round is only previewed
     * @type {boolean}
     * @memberof SetResultErrors
     */
    not_started: boolean;
}
/**
 * The Result an Organizer sets for a Match
 * @export
 * @interface SetResultRequest
 */
export interface SetResultRequest {
    /**
     * Games nobody won
     * @type {number}
     * @memberof SetResultRequest
     */
    games_drawn: number;
    /**
     * Games won per Seat, in Seat order
     * @type {Array<number>}
     * @memberof SetResultRequest
     */
    games_won: Array<number>;
}
/**
 * Why the number of Swiss Rounds was refused
 * @export
 * @interface SetSwissRoundsErrors
 */
export interface SetSwissRoundsErrors {
    /**
     * Below the Rounds paired so far, below one or above 30, or the Tournament is over
     * @type {boolean}
     * @memberof SetSwissRoundsErrors
     */
    out_of_range: boolean;
}
/**
 * How many Swiss Rounds an Organizer wants played
 * @export
 * @interface SetSwissRoundsRequest
 */
export interface SetSwissRoundsRequest {
    /**
     * The number, at least the Rounds paired so far and at most 30
     * @type {number}
     * @memberof SetSwissRoundsRequest
     */
    swiss_rounds: number;
}
/**
 * @type SetTournamentSwissRounds200Response
 * 
 * @export
 */
export type SetTournamentSwissRounds200Response = FormErrorResponseForSetSwissRoundsErrors | TournamentStateResponse;
/**
 * A collection as the holder of its share link sees it
 * @export
 * @interface SharedCollectionResponse
 */
export interface SharedCollectionResponse {
    /**
     * The point in time the collection was created
     */
    created_at: string;
    /**
     * Description shown above the card list
     */
    description: string;
    /**
     * Name of the collection
     */
    name: string;
    /**
     * Display name of the account the collection belongs to
     */
    owner: string;
}
/**
 * A deck as the holder of its share link sees it
 * @export
 * @interface SharedDeckResponse
 */
export interface SharedDeckResponse {
    /**
     * The colours the deck may play, `null` for whatever the commander allows
     */
    allowed_color_identity?: string | null;
    /**
     * The point in time the deck was created
     */
    created_at: string;
    /**
     * Optional description, e.g. the deck's game plan
     */
    description?: string | null;
    /**
     * The format the deck is built for
     */
    format: string;
    /**
     * Name of the deck
     */
    name: string;
    /**
     * Display name of the account the deck belongs to
     */
    owner: string;
}
/**
 * A deck another Account named the caller on
 * @export
 * @interface SharedWithMeDeckResponse
 */
export interface SharedWithMeDeckResponse {
    /**
     * What the owner lets the caller do
     */
    level: CollaboratorLevel;
    /**
     * The deck as the list of decks shows it, without the owner's share link and folder
     */
    overview: DeckOverviewResponse;
    /**
     * The owner's username as it is now
     */
    owner_username: string;
}


/**
 * Why an Account could not sign up
 * @export
 * @interface SignUpErrors
 */
export interface SignUpErrors {
    /**
     * The Account already is a Participant
     * @type {boolean}
     * @memberof SignUpErrors
     */
    already_participant: boolean;
    /**
     * Self sign-up is off, the Tournament is private or its first Round started
     * @type {boolean}
     * @memberof SignUpErrors
     */
    closed: boolean;
    /**
     * The participant limit is reached
     * @type {boolean}
     * @memberof SignUpErrors
     */
    full: boolean;
}
/**
 * @type SignUpForSharedTournament200Response
 * 
 * @export
 */
export type SignUpForSharedTournament200Response = FormErrorResponseForSignUpErrors | ParticipantResponse;
/**
 * @type Signup200Response
 * 
 * @export
 */
export type Signup200Response = FormErrorResponseForSignupErrors | SignupResponse;
/**
 * Why a signup request was rejected, for the form to show on the offending field
 * 
 * Only the username is ever reported: profiles are reachable by name, so whether one is taken is public anyway. Whether an *email address* is already in use stays unrevealable — that request still answers `200` and simply sends no mail.
 * @export
 * @interface SignupErrors
 */
export interface SignupErrors {
    /**
     * The email address is not shaped like one
     */
    email_malformed: boolean;
    /**
     * The username belongs to an account that has already finished its registration
     */
    username_taken: boolean;
}
/**
 * Request to sign up for a new account
 * @export
 * @interface SignupRequest
 */
export interface SignupRequest {
    /**
     * The email address the registration link is sent to
     */
    email: string;
    /**
     * The language the registration mail is written in
     * 
     * The client sends the language its UI is showing; left out, the mail falls back to German, the app's primary language.
     */
    language?: MailLanguage;
    /**
     * The desired username
     */
    username: any;
}


/**
 * Response to an accepted signup request
 * @export
 * @interface SignupResponse
 */
export interface SignupResponse {
    /**
     * The username the registration link is for
     * 
     * Echoed back so the confirmation screen can name the account without claiming which address the mail went to — for a re-issued invite that is the address already on the account, not the one just typed.
     */
    username: string;
}
/**
 * An OpenID provider people may log in through
 * @export
 * @interface SimpleOpenIdProvider
 */
export interface SimpleOpenIdProvider {
    /**
     * What the frontend calls the provider, e.g. `Google`
     */
    display_name: string;
    /**
     * The provider's id, to start a login with, e.g. `google`
     */
    id: string;
}
/**
 * A passkey registered on the account
 * @export
 * @interface SimplePasskey
 */
export interface SimplePasskey {
    /**
     * When the passkey was registered
     */
    created_at: string;
    /**
     * Human-readable device label
     */
    label: string;
    /**
     * When the passkey was last used to log in, if ever
     */
    last_used_at?: string | null;
    /**
     * The passkey's primary key
     */
    uuid: string;
}
/**
 * What the catalog knows about a card the sourcing view shows
 * @export
 * @interface SourcedPrintingResponse
 */
export interface SourcedPrintingResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * Artwork for a tile, which a row-sized scan is too small for
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * Language of the printing
     */
    lang: string;
    /**
     * The printed name
     */
    name: string;
    /**
     * Groups every printing of the same card, which is what a wider match uses
     */
    oracle_id?: string | null;
    /**
     * What a copy costs, in euro cents
     */
    price_eur_cents?: number | null;
    /**
     * What a foil copy costs, in euro cents
     */
    price_eur_foil_cents?: number | null;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
}
/**
 * One stack lying in the deck's own collection
 * @export
 * @interface SourcedStackResponse
 */
export interface SourcedStackResponse {
    /**
     * What the catalog knows about the printing
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * The collection they were taken out of, `None` if they were bought into it
     */
    origin?: string | null;
    /**
     * Its marker colour
     */
    origin_color?: string | null;
    /**
     * Its marker pictogram
     */
    origin_icon?: string | null;
    /**
     * What that collection is called, `None` once it is gone
     */
    origin_name?: string | null;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * How many copies the stack holds
     */
    quantity: number;
    /**
     * Primary key of the stack
     */
    uuid: string;
}


/**
 * One stack elsewhere in the account that could fill a slot
 * @export
 * @interface SourcingCandidateResponse
 */
export interface SourcingCandidateResponse {
    /**
     * What the catalog knows about the printing
     */
    card: SourcedPrintingResponse;
    /**
     * The collection it lies in
     */
    collection: string;
    /**
     * Its marker colour
     */
    collection_color: string;
    /**
     * The deck it stands for, so taking from another deck is visibly that
     */
    collection_deck?: string | null;
    /**
     * Its marker pictogram
     */
    collection_icon: string;
    /**
     * What that collection is called
     */
    collection_name: string;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * How many copies the stack holds
     */
    quantity: number;
    /**
     * Primary key of the stack
     */
    uuid: string;
}


/**
 * One slot of the deck list, as the sourcing view sees it
 * @export
 * @interface SourcingSlotResponse
 */
export interface SourcingSlotResponse {
    /**
     * What the catalog knows, `None` for a printing it has not caught up with
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Whether the list asks for foils
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing the list asks for
     */
    printing: string;
    /**
     * Whether the slot is a stand-in — it asks for no cardboard
     */
    proxy: boolean;
    /**
     * How many copies it asks for
     */
    quantity: number;
    /**
     * Primary key of the slot
     */
    uuid: string;
    /**
     * Which zone the slot sits in
     */
    zone: DeckZone;
}


/**
 * Request to move copies out of a stack into a new one
 * @export
 * @interface SplitCollectionEntryRequest
 */
export interface SplitCollectionEntryRequest {
    /**
     * The day the split-off cards were acquired; inherited when omitted, `null` clears it
     */
    acquired_at?: string | null;
    /**
     * The condition of the split-off cards; inherited when omitted
     */
    condition?: CardCondition | null;
    /**
     * The finish of the split-off cards; inherited when omitted
     */
    finish?: CardFinish | null;
    /**
     * What was paid per copy, in euro cents; inherited when omitted, `null` clears it
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies move out — fewer than the stack holds
     */
    quantity: number;
    /**
     * Whether the split-off cards carry a signature; inherited when omitted
     */
    signed?: boolean | null;
}


/**
 * The two stacks a split leaves behind
 * @export
 * @interface SplitCollectionEntryResponse
 */
export interface SplitCollectionEntryResponse {
    /**
     * The stack the copies moved into
     */
    created: CollectionEntryResponse;
    /**
     * The original stack, now holding the copies that stayed
     */
    source: CollectionEntryResponse;
}
/**
 * One Participant's line in the standings
 * @export
 * @interface StandingResponse
 */
export interface StandingResponse {
    /**
     * Byes had
     * @type {number}
     * @memberof StandingResponse
     */
    byes: number;
    /**
     * Matches drawn
     * @type {number}
     * @memberof StandingResponse
     */
    draws: number;
    /**
     * The last Round started before it Dropped, `null` while it plays on
     * @type {number}
     * @memberof StandingResponse
     */
    dropped_after_round?: number | null;
    /**
     * Whether it is a Guest rather than an Account
     * @type {boolean}
     * @memberof StandingResponse
     */
    guest: boolean;
    /**
     * Matches lost
     * @type {number}
     * @memberof StandingResponse
     */
    losses: number;
    /**
     * Its Match points, Byes included
     * @type {number}
     * @memberof StandingResponse
     */
    match_points: number;
    /**
     * The Account's username as it is now, or the Guest's name
     * @type {string}
     * @memberof StandingResponse
     */
    name: string;
    /**
     * Who
     * @type {string}
     * @memberof StandingResponse
     */
    participant: string;
    /**
     * Its place, 1 for the top; Participants equal on everything share one
     * @type {number}
     * @memberof StandingResponse
     */
    place: number;
    /**
     * Its Tiebreakers between 0 and 1, in the order of [`StandingsResponse::tiebreakers`]
     * @type {Array<number>}
     * @memberof StandingResponse
     */
    tiebreakers: Array<number>;
    /**
     * Matches won, Byes not included
     * @type {number}
     * @memberof StandingResponse
     */
    wins: number;
}
/**
 * The standings of a Tournament
 * @export
 * @interface StandingsResponse
 */
export interface StandingsResponse {
    /**
     * Every Participant, best first
     * @type {Array<StandingResponse>}
     * @memberof StandingsResponse
     */
    standings: Array<StandingResponse>;
    /**
     * The Ruleset's Tiebreakers after Match points, the most significant first
     * @type {Array<Tiebreaker>}
     * @memberof StandingsResponse
     */
    tiebreakers: Array<Tiebreaker>;
}
/**
 * Response to a started add-passkey ceremony
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
 * @type StartLogin200Response
 * 
 * @export
 */
export type StartLogin200Response = FormErrorResponseForStartLoginErrors | StartLoginResponse;
/**
 * Why a login could not be started
 * @export
 * @interface StartLoginErrors
 */
export interface StartLoginErrors {
    /**
     * An Admin locked the account
     */
    locked: boolean;
    /**
     * No account by that name, or it has no passkey — deliberately the same flag, so the endpoint does not say which usernames are actually able to log in
     */
    unknown_username: boolean;
}
/**
 * Request to start a login ceremony
 * @export
 * @interface StartLoginRequest
 */
export interface StartLoginRequest {
    /**
     * The username to log in as
     */
    username: any;
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
 * @type StartOidcLogin200Response
 * 
 * @export
 */
export type StartOidcLogin200Response = FormErrorResponseForStartOidcLoginErrors | StartOidcLoginResponse;
/**
 * Why an OIDC login could not be started
 * @export
 * @interface StartOidcLoginErrors
 */
export interface StartOidcLoginErrors {
    /**
     * The provider cannot be reached right now
     */
    provider_unavailable: boolean;
}
/**
 * Request to start an OIDC login
 * @export
 * @interface StartOidcLoginRequest
 */
export interface StartOidcLoginRequest {
    /**
     * The id of the provider to log in through
     */
    provider: string;
    /**
     * Keep the session alive across browser restarts
     */
    remember_me: boolean;
}
/**
 * Response to a started OIDC login
 * @export
 * @interface StartOidcLoginResponse
 */
export interface StartOidcLoginResponse {
    /**
     * The provider's authorization url to send the browser to
     */
    url: string;
}
/**
 * @type StartRegistration200Response
 * 
 * @export
 */
export type StartRegistration200Response = FormErrorResponseForRegistrationErrors | StartRegistrationResponse;
/**
 * Request to start a registration ceremony
 * @export
 * @interface StartRegistrationRequest
 */
export interface StartRegistrationRequest {
    /**
     * The token from the registration link
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
 * A labelled count of copies
 * 
 * The key is a stable slug — a colour letter, a type slug, a bucket name — which the client turns into a label; raw data such as artist names and set codes pass through as they are.
 * @export
 * @interface StatBucketResponse
 */
export interface StatBucketResponse {
    /**
     * Copies in it
     */
    cards: number;
    /**
     * Identifies the bucket
     */
    key: string;
}
/**
 * Why a device could not subscribe
 * @export
 * @interface SubscribePushDeviceErrors
 */
export interface SubscribePushDeviceErrors {
    /**
     * The endpoint is no https url
     * @type {boolean}
     * @memberof SubscribePushDeviceErrors
     */
    invalid_endpoint: boolean;
}
/**
 * A device's push subscription, as `PushSubscription.toJSON()` reports it
 * @export
 * @interface SubscribePushDeviceRequest
 */
export interface SubscribePushDeviceRequest {
    /**
     * The device's authentication secret, base64url
     * @type {string}
     * @memberof SubscribePushDeviceRequest
     */
    auth: string;
    /**
     * Where pushes for the device are posted
     * @type {string}
     * @memberof SubscribePushDeviceRequest
     */
    endpoint: string;
    /**
     * The language the app shows on the device, which its pushes are written in
     * @type {PushLanguage}
     * @memberof SubscribePushDeviceRequest
     */
    language: PushLanguage;
    /**
     * The device's P-256 public key, base64url
     * @type {string}
     * @memberof SubscribePushDeviceRequest
     */
    p256dh: string;
}


/**
 * Copies of a Deck entry to give up for another card in the same zone
 * @export
 * @interface SwapDeckCardRequest
 */
export interface SwapDeckCardRequest {
    /**
     * Whether the incoming copies are the foil ones, `null` for the ordinary ones
     */
    foil?: boolean | null;
    /**
     * Scryfall's id of the printing coming in
     */
    printing: string;
    /**
     * Whether the incoming copies are stand-ins rather than the real cards, `null` for the ordinary ones
     */
    proxy?: boolean | null;
    /**
     * How many copies leave the entry and how many of the other card come in
     */
    quantity: number;
}

/**
 * What a Sync run came to
 * @export
 */
export const SyncRunOutcome = {
    /**
    * A new file was read
    */
    Synced: 'Synced',
    /**
    * The file on offer was the one already read
    */
    Unchanged: 'Unchanged',
    /**
    * The run failed
    */
    Failed: 'Failed',
} as const;
export type SyncRunOutcome = typeof SyncRunOutcome[keyof typeof SyncRunOutcome];

/**
 * Request to move copies out of a collection and into the deck
 * @export
 * @interface TakeDeckCardsRequest
 */
export interface TakeDeckCardsRequest {
    /**
     * The stack to take them from
     */
    entry: string;
    /**
     * How many copies to take
     */
    quantity: number;
    /**
     * The slot they are being sourced for, which then follows the printing
     */
    slot?: string | null;
}
/**
 * Which themes the advisor argues for, and which it steers away from
 * @export
 * @interface ThemePrefs
 */
export interface ThemePrefs {
    /**
     * Themes to steer away from
     */
    excluded?: Array<string>;
    /**
     * Themes to steer toward
     */
    pinned?: Array<string>;
}

/**
 * A Tiebreaker: a number a Ruleset orders Participants with equal Match points by
 * @export
 */
export const Tiebreaker = {
    /**
    * OMW%: the average of the opponents&#39; Match-win percentages, each at least the floor
    */
    OpponentMatchWinPercentage: 'OpponentMatchWinPercentage',
    /**
    * GW%: game points over three per game played, at least the floor
    */
    GameWinPercentage: 'GameWinPercentage',
    /**
    * OGW%: the average of the opponents&#39; game-win percentages, each at least the floor
    */
    OpponentGameWinPercentage: 'OpponentGameWinPercentage',
    /**
    * Opponent win rate: the average of the opponents&#39; win rates; every Bye adds a Match of opponents at the floor
    */
    OpponentWinRate: 'OpponentWinRate',
    /**
    * Win rate: Match points over the most a Participant could have won, at least the floor
    */
    WinRate: 'WinRate'
} as const;
export type Tiebreaker = typeof Tiebreaker[keyof typeof Tiebreaker];


/**
 * Whether a Tournament is still ahead or already over
 * 
 * A running Tournament is upcoming and a finished or cancelled one is past, whatever their start. One still in Registration is upcoming until its start has passed.
 * @export
 */
export const Timeframe = {
    /**
    * Not started yet or running now, the soonest start first
    */
    Upcoming: 'Upcoming',
    /**
    * Over, or never started although its start has passed, the latest start first
    */
    Past: 'Past'
} as const;
export type Timeframe = typeof Timeframe[keyof typeof Timeframe];

/**
 * One point of the acquisition timeline
 * @export
 * @interface TimelinePointResponse
 */
export interface TimelinePointResponse {
    /**
     * Copies owned by the end of that month
     */
    cards: number;
    /**
     * The month as `YYYY-MM`
     */
    month: string;
    /**
     * What those copies are worth today, in euro cents
     */
    value_cents: number;
}
/**
 * A stack worth calling out
 * @export
 * @interface TopCardResponse
 */
export interface TopCardResponse {
    /**
     * Copies in the stack
     */
    copies: number;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * The card's name
     */
    name: string;
    /**
     * Scryfall's id of the printing
     */
    printing: string;
    /**
     * Full set name
     */
    set_name: string;
    /**
     * The entry it came from
     */
    uuid: string;
    /**
     * What the whole stack is worth, in euro cents
     */
    value_cents: number;
}

/**
 * How many Participants a one-on-one Top cut takes
 * @export
 */
export const TopCut = {
    /**
    * The best four: two semifinals and a final
    */
    Top4: 'Top4',
    /**
    * The best eight: quarterfinals, semifinals and a final
    */
    Top8: 'Top8'
} as const;
export type TopCut = typeof TopCut[keyof typeof TopCut];

/**
 * A Tournament as one reader sees it
 * @export
 * @interface TournamentResponse
 */
export interface TournamentResponse {
    /**
     * How many Games a one-on-one Match is played to, `null` for a multiplayer one
     * @type {BestOf}
     * @memberof TournamentResponse
     */
    best_of?: BestOf | null;
    /**
     * What Participants should know beforehand
     * @type {string}
     * @memberof TournamentResponse
     */
    description?: string | null;
    /**
     * What playing costs, `null` for nothing
     * @type {EntryFeeSchema}
     * @memberof TournamentResponse
     */
    entry_fee?: EntryFeeSchema | null;
    /**
     * The format played, `null` for any
     * @type {string}
     * @memberof TournamentResponse
     */
    format?: string | null;
    /**
     * Where it takes place, as free text
     * @type {string}
     * @memberof TournamentResponse
     */
    location?: string | null;
    /**
     * What the Tournament is called
     * @type {string}
     * @memberof TournamentResponse
     */
    name: string;
    /**
     * The part the reader plays in running it, `null` for none
     * @type {OrganizerRole}
     * @memberof TournamentResponse
     */
    organizer_role?: OrganizerRole | null;
    /**
     * Its Owner's username, `null` while the Tombstone holds it
     * @type {string}
     * @memberof TournamentResponse
     */
    owner?: string | null;
    /**
     * How many Participants self sign-up admits at most, `null` for no limit
     * @type {number}
     * @memberof TournamentResponse
     */
    participant_limit?: number | null;
    /**
     * How many minutes the round timer gives a Round, `null` for no timer
     * @type {number}
     * @memberof TournamentResponse
     */
    round_minutes?: number | null;
    /**
     * The Ruleset it follows
     * @type {Ruleset}
     * @memberof TournamentResponse
     */
    ruleset: Ruleset;
    /**
     * Whether Accounts may sign up themselves
     * @type {boolean}
     * @memberof TournamentResponse
     */
    self_sign_up: boolean;
    /**
     * Secret of the share link while it is Unlisted, for its Organizers only
     * @type {string}
     * @memberof TournamentResponse
     */
    share_token?: string | null;
    /**
     * When it is announced to start
     * @type {string}
     * @memberof TournamentResponse
     */
    starts_at: string;
    /**
     * Where it stands
     * @type {TournamentState}
     * @memberof TournamentResponse
     */
    state: TournamentState;
    /**
     * How many Participants a full Match seats
     * @type {number}
     * @memberof TournamentResponse
     */
    table_size: number;
    /**
     * The Top cut after the Swiss Rounds, `null` for none
     * @type {TopCut}
     * @memberof TournamentResponse
     */
    top_cut?: TopCut | null;
    /**
     * How many Games a Top cut Match is played to, `null` without a Top cut
     * @type {BestOf}
     * @memberof TournamentResponse
     */
    top_cut_best_of?: BestOf | null;
    /**
     * Primary key
     * @type {string}
     * @memberof TournamentResponse
     */
    uuid: string;
    /**
     * Who may see it
     * @type {Visibility}
     * @memberof TournamentResponse
     */
    visibility: Visibility;
}


/**
 * Why a Tournament's settings were refused
 * @export
 * @interface TournamentSettingsErrors
 */
export interface TournamentSettingsErrors {
    /**
     * Best-of is missing at Table size 2 or given above it
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    best_of_mismatch: boolean;
    /**
     * The entry fee is zero or less
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    entry_fee_not_positive: boolean;
    /**
     * The participant limit is below two
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    participant_limit_too_small: boolean;
    /**
     * The round timer is below a minute or above 240
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    round_minutes_out_of_range: boolean;
    /**
     * Table size, Ruleset or best-of changed, or an entry fee was taken up or dropped, after the first Round started
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    rules_locked: boolean;
    /**
     * The Ruleset is not played at the Table size
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    ruleset_mismatch: boolean;
    /**
     * Self sign-up is on for a private Tournament
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    self_sign_up_needs_visibility: boolean;
    /**
     * The Table size is outside 2 to 5
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    table_size_out_of_range: boolean;
    /**
     * The Top cut's best-of is missing with a Top cut or given without one
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    top_cut_best_of_mismatch: boolean;
    /**
     * The Top cut or its best-of changed after the Swiss Rounds were over
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    top_cut_locked: boolean;
    /**
     * The Top cut is not played at the Table size
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    top_cut_mismatch: boolean;
    /**
     * The entry fee's currency is not three capital letters
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    unknown_currency: boolean;
    /**
     * The format is not one a deck can be built for
     * @type {boolean}
     * @memberof TournamentSettingsErrors
     */
    unknown_format: boolean;
}
/**
 * Every setting of a Tournament, to create one or to replace its settings
 * @export
 * @interface TournamentSettingsRequest
 */
export interface TournamentSettingsRequest {
    /**
     * How many Games a one-on-one Match is played to: required at Table size 2, `null` above
     * @type {BestOf}
     * @memberof TournamentSettingsRequest
     */
    best_of?: BestOf | null;
    /**
     * What Participants should know beforehand
     * @type {string}
     * @memberof TournamentSettingsRequest
     */
    description?: string | null;
    /**
     * What playing costs, `null` or left out for nothing
     * 
     * With a fee every Participant starts unpaid and is only paired once an Organizer marked it paid. Taking a fee up or dropping it is refused after the first Round started; amount and currency stay editable.
     * @type {EntryFeeSchema}
     * @memberof TournamentSettingsRequest
     */
    entry_fee?: EntryFeeSchema | null;
    /**
     * The format played, a slug from the deck formats; `null` for any
     * @type {string}
     * @memberof TournamentSettingsRequest
     */
    format?: string | null;
    /**
     * Where it takes place, as free text
     * @type {string}
     * @memberof TournamentSettingsRequest
     */
    location?: string | null;
    /**
     * What the Tournament is called
     * @type {string}
     * @memberof TournamentSettingsRequest
     */
    name: string;
    /**
     * How many Participants self sign-up admits at most, two or more; `null` for no limit
     * @type {number}
     * @memberof TournamentSettingsRequest
     */
    participant_limit?: number | null;
    /**
     * How many minutes the round timer gives a Round, 1 to 240; `null` for no timer
     * @type {number}
     * @memberof TournamentSettingsRequest
     */
    round_minutes?: number | null;
    /**
     * The Ruleset to follow: `Mtr` at 2, `TopDeck` or `MultiplayerAddendum` at 3 to 5
     * @type {Ruleset}
     * @memberof TournamentSettingsRequest
     */
    ruleset: Ruleset;
    /**
     * Whether Accounts may sign up themselves; only for a public or unlisted Tournament
     * @type {boolean}
     * @memberof TournamentSettingsRequest
     */
    self_sign_up: boolean;
    /**
     * When it is announced to start: the date and the start time
     * @type {string}
     * @memberof TournamentSettingsRequest
     */
    starts_at: string;
    /**
     * How many Participants a full Match seats, 2 to 5
     * @type {number}
     * @memberof TournamentSettingsRequest
     */
    table_size: number;
    /**
     * The Top cut after the Swiss Rounds, at Table size 2 only; `null` for none
     * @type {TopCut}
     * @memberof TournamentSettingsRequest
     */
    top_cut?: TopCut | null;
    /**
     * How many Games a Top cut Match is played to: required with a Top cut, `null` without
     * @type {BestOf}
     * @memberof TournamentSettingsRequest
     */
    top_cut_best_of?: BestOf | null;
    /**
     * Who may see the Tournament
     * @type {Visibility}
     * @memberof TournamentSettingsRequest
     */
    visibility: Visibility;
}



/**
 * Where a Tournament stands
 * 
 * Registration, Swiss, Top cut, then Finished; Cancelled can follow any of them and keeps the Rounds played so far.
 * @export
 */
export const TournamentState = {
    /**
    * Before the first Round starts
    */
    Registration: 'Registration',
    /**
    * While Swiss Rounds are played
    */
    Swiss: 'Swiss',
    /**
    * During the playoff
    */
    TopCut: 'TopCut',
    /**
    * Over, with its standings final
    */
    Finished: 'Finished',
    /**
    * Called off; the Rounds played so far stay
    */
    Cancelled: 'Cancelled'
} as const;
export type TournamentState = typeof TournamentState[keyof typeof TournamentState];

/**
 * Where the Tournament stands after a Round ended or the Swiss Rounds changed
 * @export
 * @interface TournamentStateResponse
 */
export interface TournamentStateResponse {
    /**
     * The Tournament's state now, `Finished` after the last Swiss Round
     * @type {TournamentState}
     * @memberof TournamentStateResponse
     */
    state: TournamentState;
}


/**
 * A Tournament in a list
 * @export
 * @interface TournamentSummaryResponse
 */
export interface TournamentSummaryResponse {
    /**
     * The format played, `null` for any
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    format?: string | null;
    /**
     * Where it takes place, as free text
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    location?: string | null;
    /**
     * What the Tournament is called
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    name: string;
    /**
     * Its Owner's username, `null` while the Tombstone holds it
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    owner?: string | null;
    /**
     * The Ruleset it follows
     * @type {Ruleset}
     * @memberof TournamentSummaryResponse
     */
    ruleset: Ruleset;
    /**
     * When it is announced to start
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    starts_at: string;
    /**
     * Where it stands
     * @type {TournamentState}
     * @memberof TournamentSummaryResponse
     */
    state: TournamentState;
    /**
     * How many Participants a full Match seats
     * @type {number}
     * @memberof TournamentSummaryResponse
     */
    table_size: number;
    /**
     * Primary key
     * @type {string}
     * @memberof TournamentSummaryResponse
     */
    uuid: string;
    /**
     * Who may see it
     * @type {Visibility}
     * @memberof TournamentSummaryResponse
     */
    visibility: Visibility;
}


/**
 * Request to change some of a stack's fields
 * 
 * Every field is optional and an omitted one is left alone. The two nullable ones are wrapped twice so that `null` can mean "clear this": with a single `Option` a cleared price and an untouched one arrive as the same value.
 * @export
 * @interface UpdateCollectionEntryRequest
 */
export interface UpdateCollectionEntryRequest {
    /**
     * The day the cards were acquired; `null` clears it
     */
    acquired_at?: string | null;
    /**
     * The condition the cards are in
     */
    condition?: CardCondition | null;
    /**
     * The finish the cards have
     */
    finish?: CardFinish | null;
    /**
     * Scryfall's id of the printing — send this to correct a mis-identified card
     */
    printing?: string | null;
    /**
     * What was paid per copy, in euro cents; `null` clears it
     */
    purchase_price_cents?: number | null;
    /**
     * The new count
     */
    quantity?: number | null;
    /**
     * Whether the cards carry an artist's signature
     */
    signed?: boolean | null;
}


/**
 * 
 * @export
 * @interface UpdateCollectionRequest
 */
export interface UpdateCollectionRequest {
    /**
     * The colour the collection is drawn in
     */
    color: string;
    /**
     * 
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     */
    icon: string;
    /**
     * 
     */
    name: string;
}
/**
 * Request to change some of a slot's fields, leaving the rest alone
 * @export
 * @interface UpdateDeckCardRequest
 */
export interface UpdateDeckCardRequest {
    /**
     * Whether the copies in this slot are the foil ones
     */
    foil?: boolean | null;
    /**
     * Scryfall's id of the printing — send this to sleeve a different print
     */
    printing?: string | null;
    /**
     * Whether the copies in this slot are stand-ins rather than the real cards
     */
    proxy?: boolean | null;
    /**
     * The new count, zero removes the Deck entry
     */
    quantity?: number | null;
    /**
     * The zone to move it to
     */
    zone?: DeckZone | null;
}


/**
 * Request to rename a folder
 * @export
 * @interface UpdateDeckFolderRequest
 */
export interface UpdateDeckFolderRequest {
    /**
     * What it is called now
     */
    name: string;
}
/**
 * Request to rename a deck, change its description or its format
 * @export
 * @interface UpdateDeckRequest
 */
export interface UpdateDeckRequest {
    /**
     * Optional description
     */
    description?: string | null;
    /**
     * The format to build for
     */
    format: string;
    /**
     * Name of the deck
     */
    name: string;
}
/**
 * Request to rename a tag, change its marker or change which decks it is offered on
 * @export
 * @interface UpdateDeckTagRequest
 */
export interface UpdateDeckTagRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * Whether assignments follow the card through every deck and printing
     */
    global: boolean;
    /**
     * The icon drawn inside its colour marker
     */
    icon: string;
    /**
     * What the tag is called
     */
    name: string;
}
/**
 * Request to rename a card-wide tag or change its marker
 * @export
 * @interface UpdateGlobalTagRequest
 */
export interface UpdateGlobalTagRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * The icon drawn inside its colour marker
     */
    icon: string;
    /**
     * What the tag is called
     */
    name: string;
}
/**
 * Change selected fields of a staged stack
 * @export
 * @interface UpdateScannerSessionEntryRequest
 */
export interface UpdateScannerSessionEntryRequest {
    /**
     * New finish
     */
    finish?: CardFinish | null;
    /**
     * Corrected printing
     */
    printing?: string | null;
    /**
     * Paid price per copy; `null` clears it
     */
    purchase_price_cents?: number | null;
    /**
     * New number of copies
     */
    quantity?: number | null;
    /**
     * New signed state
     */
    signed?: boolean | null;
}


/**
 * Rename or reorganise a scanner session
 * @export
 * @interface UpdateScannerSessionRequest
 */
export interface UpdateScannerSessionRequest {
    /**
     * Optional preferred destination collection
     */
    collection?: string | null;
    /**
     * Marker colour
     */
    color: string;
    /**
     * Marker icon
     */
    icon: string;
    /**
     * Display name
     */
    name: string;
}
/**
 * Request to change some of an entry's fields, leaving the rest alone
 * 
 * Anything the alarm reads disarms it when it changes: the stored alarm is a comparison between one price and one threshold, and once either side moves it no longer describes anything. The next catalog sync sets it again if it still holds.
 * @export
 * @interface UpdateWatchListEntryRequest
 */
export interface UpdateWatchListEntryRequest {
    /**
     * Alarm below this price in euro cents; `null` takes the alarm off
     */
    alarm_price_cents?: number | null;
    /**
     * Whether only the named printing counts
     */
    exact_printing?: boolean | null;
    /**
     * A different finish
     */
    finish?: CardFinish | null;
    /**
     * Which languages count; an empty list means any
     */
    languages?: Array<string> | null;
    /**
     * Whether only the named finish counts
     */
    match_finish?: boolean | null;
    /**
     * What the entry is for
     */
    note?: string | null;
    /**
     * A different printing
     */
    printing?: string | null;
    /**
     * How many copies the account is after
     */
    wanted?: number | null;
}


/**
 * Request to rename a watch list or change its marker
 * @export
 * @interface UpdateWatchListRequest
 */
export interface UpdateWatchListRequest {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * Description shown above the entries
     */
    description: string;
    /**
     * The pictogram drawn on it
     */
    icon: string;
    /**
     * What the list is called
     */
    name: string;
}

/**
 * Who may see a collection or a deck
 * 
 * [`Self::Unlisted`] is not resolved by the ordinary visibility check — the share token is the authorization for those, not the viewer's identity.
 * @export
 */
export const Visibility = {
    /**
    * Listed on the owner&#39;s public profile
    */
    Public: 'Public',
    /**
    * Anyone who knows the share link
    */
    Unlisted: 'Unlisted',
    /**
    * Only the owner
    */
    Private: 'Private',
} as const;
export type Visibility = typeof Visibility[keyof typeof Visibility];

/**
 * One alarm that has gone off, as the navigation badge shows it
 * @export
 * @interface WatchListAlarmResponse
 */
export interface WatchListAlarmResponse {
    /**
     * The threshold it fell through, in euro cents
     */
    alarm_price_cents?: number | null;
    /**
     * The entry whose alarm went off
     */
    entry: string;
    /**
     * The printed name of the card, empty while the catalog misses it
     */
    name: string;
    /**
     * When it went off
     */
    triggered_at: string;
    /**
     * What the card cost when the alarm went off, in euro cents
     */
    triggered_price_cents?: number | null;
    /**
     * The list the entry sits on
     */
    watch_list: string;
    /**
     * What that list is called
     */
    watch_list_name: string;
}
/**
 * One card on a watch list, with everything the row shows
 * @export
 * @interface WatchListEntryResponse
 */
export interface WatchListEntryResponse {
    /**
     * Whether the reader has seen the alarm
     */
    acknowledged: boolean;
    /**
     * Alarm below this price in euro cents, `None` for an entry without one
     */
    alarm_price_cents?: number | null;
    /**
     * What the catalog knows, `None` for a printing it has not caught up with
     */
    card?: WatchedCardResponse | null;
    /**
     * The point in time the entry was added
     */
    created_at: string;
    /**
     * Whether only this very printing counts
     */
    exact_printing: boolean;
    /**
     * The finish that is wanted
     */
    finish: CardFinish;
    /**
     * Which languages count, as Scryfall's codes, empty for any
     * 
     * Only in force while the printing is not pinned: a pinned printing is already one language.
     */
    languages: Array<string>;
    /**
     * The printing the price and the alarm actually refer to
     * 
     * For an entry that watches one printing this is that printing. For a wide one it is the cheapest print of the card the switches accept, which is a different card than the row is named after — so it carries its own identity, and a shop link opens the product that actually costs what the row says. `None` when the catalog prices nothing the entry accepts.
     */
    market?: WatchedMarketResponse | null;
    /**
     * Whether only the entry's finish counts
     */
    match_finish: boolean;
    /**
     * What the entry is for, in the account's own words
     */
    note: string;
    /**
     * Scryfall's id of the printing the entry names
     */
    printing: string;
    /**
     * What the account already holds
     */
    stock: WatchedStockResponse;
    /**
     * When the price last fell through the alarm, `None` while it has not
     */
    triggered_at?: string | null;
    /**
     * What the card cost when the alarm went off, in euro cents
     */
    triggered_price_cents?: number | null;
    /**
     * Which printing was that cheap
     */
    triggered_printing?: string | null;
    /**
     * Primary key
     */
    uuid: string;
    /**
     * How many copies the account is after
     */
    wanted: number;
}


/**
 * One watch list as the overview grid shows it
 * @export
 * @interface WatchListOverviewResponse
 */
export interface WatchListOverviewResponse {
    /**
     * How many entries have a standing alarm
     */
    alarms: number;
    /**
     * Artwork of the dearest entries, at most two
     */
    arts: Array<string>;
    /**
     * The colours the list asks for, as the letters `WUBRG`
     */
    colors: string;
    /**
     * How many cards are on it
     */
    entries: number;
    /**
     * The list itself
     */
    list: WatchListResponse;
    /**
     * How many of those copies are still missing
     * 
     * Counted against the copies lying free in a collection only. A copy sleeved up in a deck is spoken for.
     */
    missing: number;
    /**
     * What the missing copies cost, in euro cents
     */
    price_eur_cents: number;
    /**
     * Wanted copies per rarity
     */
    rarities: WatchedRaritiesResponse;
    /**
     * How many of those alarms the reader has not seen yet
     */
    unread: number;
    /**
     * How many copies they ask for between them
     */
    wanted: number;
}
/**
 * A list of cards an account is after
 * @export
 * @interface WatchListResponse
 */
export interface WatchListResponse {
    /**
     * The colour it is drawn in
     */
    color: string;
    /**
     * The point in time the list was created
     */
    created_at: string;
    /**
     * Description shown above the entries
     */
    description: string;
    /**
     * The pictogram drawn on it
     */
    icon: string;
    /**
     * What the list is called
     */
    name: string;
    /**
     * Primary key
     */
    uuid: string;
}
/**
 * What the catalog knows about a watched card
 * @export
 * @interface WatchedCardResponse
 */
export interface WatchedCardResponse {
    /**
     * Cardmarket's product id, `None` when Cardmarket does not stock it
     * 
     * Without one there is no price and therefore no alarm.
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * Comma separated finishes this printing exists in
     */
    finishes: string;
    /**
     * Artwork for a closer look
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     */
    lang: string;
    /**
     * The printed name
     */
    name: string;
    /**
     * Groups every printing of the same card
     */
    oracle_id?: string | null;
    /**
     * Market price in euro cents
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     */
    price_eur_foil_cents?: number | null;
    /**
     * Set code, upper case
     */
    set_code: string;
    /**
     * Full set name
     */
    set_name: string;
    /**
     * When this printing last came out of a catalog sync
     * 
     * How old the prices on this row are: they do not move between syncs.
     */
    updated_at: string;
}
/**
 * One stack of a watched card, and where it lies
 * @export
 * @interface WatchedCopyResponse
 */
export interface WatchedCopyResponse {
    /**
     * The collection the stack lies in
     */
    collection: string;
    /**
     * Its marker colour
     */
    collection_color: string;
    /**
     * Its marker pictogram
     */
    collection_icon: string;
    /**
     * What that collection is called
     */
    collection_name: string;
    /**
     * Collector number as printed
     */
    collector_number?: string | null;
    /**
     * Condition of the cards
     */
    condition: CardCondition;
    /**
     * The deck the collection stands for, `None` for a collection on a shelf
     */
    deck?: string | null;
    /**
     * What that deck is called
     */
    deck_name?: string | null;
    /**
     * Finish of the cards
     */
    finish: CardFinish;
    /**
     * Artwork for a list row
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     */
    lang?: string | null;
    /**
     * The printed name, `None` while the catalog misses the printing
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing this stack holds
     */
    printing: string;
    /**
     * How many copies the stack holds
     */
    quantity: number;
    /**
     * Set code, upper case
     */
    set_code?: string | null;
    /**
     * Full set name
     */
    set_name?: string | null;
}


/**
 * The printing an entry's price and alarm refer to
 * @export
 * @interface WatchedMarketResponse
 */
export interface WatchedMarketResponse {
    /**
     * Cardmarket's id of the product it is sold as, `None` when unstocked
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     */
    collector_number: string;
    /**
     * Language of the printing, as Scryfall's code
     */
    lang: string;
    /**
     * The printed name
     */
    name: string;
    /**
     * What one copy of it costs, in euro cents
     */
    price_cents: number;
    /**
     * Scryfall's id of the printing being priced
     */
    printing: string;
    /**
     * Set code, upper case
     */
    set_code: string;
}
/**
 * Wanted copies per rarity, for the bar under a tile
 * @export
 * @interface WatchedRaritiesResponse
 */
export interface WatchedRaritiesResponse {
    /**
     * Wanted copies of common cards
     */
    common: number;
    /**
     * Wanted copies of mythic rare cards
     */
    mythic: number;
    /**
     * Wanted copies of everything else the catalog files separately
     */
    other: number;
    /**
     * Wanted copies of rare cards
     */
    rare: number;
    /**
     * Wanted copies of uncommon cards
     */
    uncommon: number;
}
/**
 * How many copies of a watched card the account already holds
 * @export
 * @interface WatchedStockResponse
 */
export interface WatchedStockResponse {
    /**
     * Copies lying in a collection that is not a deck's
     */
    free: number;
    /**
     * Free copies a looser finish match would count, including [`Self::free`]
     */
    free_any_finish: number;
    /**
     * Free copies a wider printing match would count
     * 
     * Includes [`Self::free`]; the difference is what the entry's printing switch is turning away.
     */
    free_any_printing: number;
    /**
     * Copies sleeved up in a deck
     */
    sleeved: number;
}
