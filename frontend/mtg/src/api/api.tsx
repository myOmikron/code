import { redirect } from "@tanstack/react-router";
import { SESSION_STORE } from "src/api/session";
import { ERROR_STORE } from "src/context/error-context";
import {
    AddDeckCardRequest,
    Configuration,
    CreateCollectionRequest,
    CreateDeckRequest,
    CreateDeckTagRequest,
    CreateGlobalTagRequest,
    UpdateGlobalTagRequest,
    DefaultApi,
    ImportDeckCardsRequest,
    ListCollectionCardsRequest,
    ListSharedCollectionCardsRequest,
    MailLanguage,
    NewCollectionEntry,
    PrintingLookupRequest,
    RequiredError,
    ResponseError,
    SignupRequest,
    SplitCollectionEntryRequest,
    UpdateCollectionEntryRequest,
    UpdateCollectionRequest,
    UpdateDeckCardRequest,
    UpdateDeckRequest,
    UpdateDeckTagRequest,
    Visibility,
} from "src/api/generated";

/** Hyphen separated uuid */
export type UUID = string;

const configuration = new Configuration({
    basePath: window.location.origin,
});
const defaultApi = new DefaultApi(configuration);

export const Api = {
    signup: {
        begin: async (req: SignupRequest) => handleError(defaultApi.signup({ SignupRequest: req })),
    },
    // The auth ceremonies deliberately bypass `handleError`. Their callers show a message per
    // failure — an unknown username reads differently from a cancelled prompt — and
    // `handleError` would report to `ERROR_STORE` first, which replaces the entire page with
    // the router's error screen before the form ever sees the rejection.
    auth: {
        // The username picks the account; its passkeys come back as the allow-list, so the
        // authenticator knows which credential to look for.
        startLogin: (username: string) => defaultApi.startLogin({ StartLoginRequest: { username } }),
        // Answers with no body — who was logged in is read back from `account.me`, so there
        // is exactly one place the session is derived from.
        finishLogin: (credential: unknown, rememberMe: boolean) =>
            defaultApi.finishLogin({ FinishLoginRequest: { credential, remember_me: rememberMe } }),
        // The "lost passkey" flow: mails a fresh registration link to the account's stored
        // address. Answers 200 whether or not the username exists. Bypasses `handleError`
        // like the ceremonies above — a rate-limited request should read as a note next to
        // the button, not replace the page with the error screen.
        recover: (username: string, language: MailLanguage) =>
            defaultApi.recoverAccount({ RecoverAccountRequest: { username, language } }),
        logout: async () => handleError(defaultApi.logout()),
    },
    accounts: {
        // Answers 401 for anyone not logged in, which is the normal case for a visitor —
        // reporting that would put the error screen in front of every public page.
        me: () => defaultApi.me(),
        passkeys: {
            list: async () => handleError(defaultApi.listPasskeys()),
            // Adding a device from an existing session; the ceremony failures are the caller's
            // to render, same as on login.
            startAdd: () => defaultApi.startAddPasskey(),
            finishAdd: (credential: unknown, label?: string) =>
                defaultApi.finishAddPasskey({ FinishAddPasskeyRequest: { credential, label } }),
            delete: async (uuid: string) => handleError(defaultApi.deletePasskey({ uuid })),
        },
    },
    collections: {
        list: async () => handleError(defaultApi.getAllCollections()),
        get: async (uuid: UUID) => handleError(defaultApi.getCollection({ collection: uuid })),
        getIfThere: async (uuid: UUID) => orGone(defaultApi.getCollection({ collection: uuid })),
        create: async (req: CreateCollectionRequest) =>
            handleError(defaultApi.createCollection({ CreateCollectionRequest: req })),
        update: async (uuid: UUID, req: UpdateCollectionRequest) =>
            handleError(defaultApi.updateCollection({ collection: uuid, UpdateCollectionRequest: req })),
        // Cascades to every entry in the collection.
        delete: async (uuid: UUID) => handleError(defaultApi.deleteCollection({ collection: uuid })),
        // One page of a collection, sorted and filtered by the database and
        // carrying the card data with it. This is what the card list reads;
        // `entries` below still exists for the few places that genuinely need
        // every row at once.
        cards: async (collection: UUID, query: Omit<ListCollectionCardsRequest, "collection"> = {}) =>
            handleError(defaultApi.listCollectionCards({ collection, ...query })),
        cardsIfThere: async (collection: UUID, query: Omit<ListCollectionCardsRequest, "collection"> = {}) =>
            orGone(defaultApi.listCollectionCards({ collection, ...query })),
        // Everything the statistics tab draws, counted server-side — one
        // request instead of every entry plus a Scryfall lookup per printing.
        // What this box has lent to decks. Those cards are not rows of the box
        // any more, so the page asks for them separately.
        onLoan: async (collection: UUID) => handleError(defaultApi.listCollectionOnLoan({ collection })),
        onLoanIfThere: async (collection: UUID) => orGone(defaultApi.listCollectionOnLoan({ collection })),
        statistics: async (collection: UUID) => handleError(defaultApi.getCollectionStatistics({ collection })),
        statisticsIfThere: async (collection: UUID) => orGone(defaultApi.getCollectionStatistics({ collection })),
        entries: {
            list: async (collection: UUID) => handleError(defaultApi.listCollectionEntries({ collection })),
            add: async (collection: UUID, entries: Array<NewCollectionEntry>) =>
                handleError(
                    defaultApi.addCollectionEntries({
                        collection,
                        AddCollectionEntriesRequest: { entries },
                    }),
                ),
            // Partial: a field left out of `req` is left alone server-side, and
            // `null` on one of the nullable ones clears it. `JSON.stringify`
            // drops `undefined`, which is what makes the distinction survive
            // the wire.
            update: async (collection: UUID, entry: UUID, req: UpdateCollectionEntryRequest) =>
                handleError(
                    defaultApi.updateCollectionEntry({
                        collection,
                        entry,
                        UpdateCollectionEntryRequest: req,
                    }),
                ),
            // Moves copies out of a stack into a new one; answers with both.
            split: async (collection: UUID, entry: UUID, req: SplitCollectionEntryRequest) =>
                handleError(
                    defaultApi.splitCollectionEntry({
                        collection,
                        entry,
                        SplitCollectionEntryRequest: req,
                    }),
                ),
            // Folds stacks of the same printing, condition and finish into the
            // oldest of them, which is the one that comes back.
            merge: async (collection: UUID, entries: Array<UUID>) =>
                handleError(
                    defaultApi.mergeCollectionEntries({
                        collection,
                        MergeCollectionEntriesRequest: { entries },
                    }),
                ),
            delete: async (collection: UUID, entry: UUID) =>
                handleError(defaultApi.deleteCollectionEntry({ collection, entry })),
            tag: async (collection: UUID, entry: UUID, tag: UUID) =>
                handleError(defaultApi.assignCollectionEntryTag({ collection, entry, tag })),
            untag: async (collection: UUID, entry: UUID, tag: UUID) =>
                handleError(defaultApi.unassignCollectionEntryTag({ collection, entry, tag })),
        },
        // Visibility is its own endpoint, not part of `update` — switching to
        // `Unlisted` mints a share token and switching away revokes it, which is
        // not something a rename should do as a side effect.
        setVisibility: async (uuid: UUID, visibility: Visibility) =>
            handleError(
                defaultApi.setVisibilityCollection({
                    collection: uuid,
                    SetCollectionVisibilityRequest: { visibility },
                }),
            ),
        rotateShareToken: async (uuid: UUID) => handleError(defaultApi.rotateShareToken({ collection: uuid })),
    },
    decks: {
        list: async () => handleError(defaultApi.getAllDecks()),
        get: async (uuid: UUID) => handleError(defaultApi.getDeck({ deck: uuid })),
        create: async (req: CreateDeckRequest) => handleError(defaultApi.createDeck({ CreateDeckRequest: req })),
        update: async (uuid: UUID, req: UpdateDeckRequest) =>
            handleError(defaultApi.updateDeck({ deck: uuid, UpdateDeckRequest: req })),
        delete: async (uuid: UUID) => handleError(defaultApi.deleteDeck({ deck: uuid })),
        setVisibility: async (uuid: UUID, visibility: Visibility) =>
            handleError(defaultApi.setVisibilityDeck({ deck: uuid, SetDeckVisibilityRequest: { visibility } })),
        rotateShareToken: async (uuid: UUID) => handleError(defaultApi.rotateDeckShareToken({ deck: uuid })),
        // `null` hands the decision back to the commander zone. Its own endpoint
        // because it is set from the legality band, not from the deck's form.
        setColors: async (uuid: UUID, colors: string | null) =>
            handleError(defaultApi.setDeckColors({ deck: uuid, SetDeckColorsRequest: { colors } })),
        // Which Commander bracket the deck claims to be, `null` for unsaid.
        setBracket: async (uuid: UUID, bracket: number | null) =>
            handleError(defaultApi.setDeckBracket({ deck: uuid, SetDeckBracketRequest: { bracket } })),
        // What every format asks of a deck built for it. Constant per release,
        // so the deck pages read it once through their loader.
        formats: async () => handleError(defaultApi.getDeckFormats()),
        // The service reads the deck behind a link to another builder — the
        // browser cannot, those sites answer no cross-origin request.
        readUrl: async (url: string) => handleError(defaultApi.readDeckUrl({ ReadDeckUrlRequest: { url } })),
        // Whether the deck is put away. Archived decks keep their cards; this
        // only decides where they stand in the list.
        setArchived: async (uuid: UUID, archived: boolean) =>
            handleError(defaultApi.setDeckArchived({ deck: uuid, SetDeckArchivedRequest: { archived } })),
        collection: {
            // Start keeping the cards that are physically in the deck. Idempotent.
            attach: async (deck: UUID) => handleError(defaultApi.attachDeckCollection({ deck })),
            // Only while nothing is filed in it.
            detach: async (deck: UUID) => handleError(defaultApi.detachDeckCollection({ deck })),
        },
        sourcing: {
            // What the deck asks for, what is in it, and where the rest could
            // come from — three flat lists the client matches up itself.
            read: async (deck: UUID) => handleError(defaultApi.getDeckSourcing({ deck })),
            // Move copies out of a box and into the deck, remembering the box.
            take: async (deck: UUID, entry: UUID, quantity: number, slot: UUID | null = null) =>
                handleError(defaultApi.takeDeckCards({ deck, TakeDeckCardsRequest: { entry, quantity, slot } })),
            // The way back. `target` is only needed for cards that remember no
            // origin, which is what was bought straight into the deck.
            returnCards: async (deck: UUID, entry: UUID, quantity: number, target: UUID | null = null) =>
                handleError(defaultApi.returnDeckCards({ deck, ReturnDeckCardsRequest: { entry, quantity, target } })),
            // Says the deck already holds what its list asks for, which is how a
            // deck imported from elsewhere gets its cards without a shopping trip.
            fill: async (deck: UUID, slot: UUID | null = null) =>
                handleError(defaultApi.fillDeckCollection({ deck, FillDeckCollectionRequest: { slot } })),
            // Taking the whole deck apart.
            returnAll: async (deck: UUID, target: UUID | null = null) =>
                handleError(defaultApi.returnAllDeckCards({ deck, ReturnAllDeckCardsRequest: { target } })),
        },
        cards: {
            // The whole deck in one answer, catalog data and tags included.
            list: async (deck: UUID) => handleError(defaultApi.listDeckCards({ deck })),
            add: async (deck: UUID, req: AddDeckCardRequest) =>
                handleError(defaultApi.addDeckCard({ deck, AddDeckCardRequest: req })),
            update: async (deck: UUID, card: UUID, req: UpdateDeckCardRequest) =>
                handleError(defaultApi.updateDeckCard({ deck, card, UpdateDeckCardRequest: req })),
            delete: async (deck: UUID, card: UUID) => handleError(defaultApi.deleteDeckCard({ deck, card })),
            // A pasted decklist in one transaction: it either lands whole or
            // not at all.
            import: async (deck: UUID, req: ImportDeckCardsRequest) =>
                handleError(defaultApi.importDeckCards({ deck, ImportDeckCardsRequest: req })),
            tag: async (deck: UUID, card: UUID, tag: UUID) =>
                handleError(defaultApi.assignDeckCardTag({ deck, card, tag })),
            untag: async (deck: UUID, card: UUID, tag: UUID) =>
                handleError(defaultApi.unassignDeckCardTag({ deck, card, tag })),
        },
        tags: {
            create: async (deck: UUID, req: CreateDeckTagRequest) =>
                handleError(defaultApi.createDeckTag({ deck, CreateDeckTagRequest: req })),
            update: async (deck: UUID, tag: UUID, req: UpdateDeckTagRequest) =>
                handleError(defaultApi.updateDeckTag({ deck, tag, UpdateDeckTagRequest: req })),
            delete: async (deck: UUID, tag: UUID) => handleError(defaultApi.deleteDeckTag({ deck, tag })),
        },
    },
    // Bypasses `handleError` like the auth ceremonies above: a revoked, replaced
    // or mistyped link is the normal way for these to fail, and the pages
    // behind a share link say so themselves.
    tags: {
        list: async () => handleError(defaultApi.getAllGlobalTags()),
        create: async (req: CreateGlobalTagRequest) =>
            handleError(defaultApi.createGlobalTag({ CreateGlobalTagRequest: req })),
        update: async (tag: UUID, req: UpdateGlobalTagRequest) =>
            handleError(defaultApi.updateGlobalTag({ tag, UpdateGlobalTagRequest: req })),
        delete: async (tag: UUID) => handleError(defaultApi.deleteGlobalTag({ tag })),
    },
    shared: {
        decks: {
            get: (token: string) => defaultApi.getSharedDeck({ token }),
            cards: (token: string) => defaultApi.listSharedDeckCards({ token }),
        },
        collections: {
            get: (token: string) => defaultApi.getSharedCollection({ token }),
            cards: (token: string, query: Omit<ListSharedCollectionCardsRequest, "token"> = {}) =>
                defaultApi.listSharedCollectionCards({ token, ...query }),
            statistics: (token: string) => defaultApi.getSharedCollectionStatistics({ token }),
        },
    },
    printings: {
        // The service's own copy of Scryfall's catalog, asked in bulk. This is
        // what an import places its rows against — see `printing-catalog.ts`,
        // which batches and de-duplicates on the way here.
        resolve: async (lookups: Array<PrintingLookupRequest>) =>
            handleError(defaultApi.resolvePrintings({ ResolvePrintingsRequest: { lookups } })),
    },
    register: {
        // Called twice per registration: once on mount to validate the token and read the
        // username, once on submit for the ceremony the browser actually answers. Both
        // failures are shown on the page itself, hence no `handleError` here either.
        start: (token: string) => defaultApi.startRegistration({ StartRegistrationRequest: { token } }),
        finish: (token: string, credential: unknown) =>
            defaultApi.finishRegistration({ FinishRegistrationRequest: { token, credential } }),
    },
};

/**
 * Answers `null` where the server refused because the thing is gone
 *
 * A request the api refuses is reported and lands on the error screen, which is
 * right for a broken call and wrong for a stale link: a collection deleted in
 * another tab is still on the shelf of a page opened before that, and hovering
 * it must not take the app down. The refusal is deliberately the same answer
 * for "not there" and "not yours", so both come back as nothing to show.
 *
 * @param promise the raw call, unreported
 *
 * @returns what came back, or `null` where the request was refused
 */
async function orGone<T>(promise: Promise<T>): Promise<T | null> {
    try {
        return await promise;
    } catch (error) {
        if (error instanceof ResponseError && error.response.status === 400) return null;
        return handleError(Promise.reject(error));
    }
}

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
                SESSION_STORE.expired();
                throw redirect({ to: "/auth/login", search: { redirect: window.location.pathname } });
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
