# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acceptTournamentHandover**](DefaultApi.md#accepttournamenthandover) | **POST** /api/frontend/v1/tournaments/{tournament}/handover/accept | Take over a Tournament offered to the logged-in Account |
| [**acknowledgeWatchListAlarm**](DefaultApi.md#acknowledgewatchlistalarm) | **POST** /api/frontend/v1/watch-lists/{list}/entries/{entry}/acknowledge | Mark an alarm as seen |
| [**addCollectionEntries**](DefaultApi.md#addcollectionentriesoperation) | **POST** /api/frontend/v1/collections/{collection}/entries | File stacks of cards into a collection |
| [**addDeckCard**](DefaultApi.md#adddeckcardoperation) | **POST** /api/frontend/v1/decks/{deck}/cards | Put a card into a deck |
| [**addScannerSessionEntry**](DefaultApi.md#addscannersessionentryoperation) | **POST** /api/frontend/v1/scanner-sessions/{session}/entries | Add scanned copies to a session |
| [**addTournamentAccount**](DefaultApi.md#addtournamentaccount) | **POST** /api/frontend/v1/tournaments/{tournament}/participants/accounts | Add an Account as a Participant by its username, as an Organizer |
| [**addTournamentCoOrganizer**](DefaultApi.md#addtournamentcoorganizer) | **POST** /api/frontend/v1/tournaments/{tournament}/organizers | Name an Account a Co-organizer by its username, as one of the Organizers |
| [**addTournamentGuest**](DefaultApi.md#addtournamentguest) | **POST** /api/frontend/v1/tournaments/{tournament}/participants/guests | Add a Guest by name, as an Organizer |
| [**addWatchListEntry**](DefaultApi.md#addwatchlistentryoperation) | **POST** /api/frontend/v1/watch-lists/{list}/entries | Put a card on a watch list |
| [**adminDeleteAccount**](DefaultApi.md#admindeleteaccountoperation) | **DELETE** /api/frontend/v1/admin/accounts/{uuid} | Delete an Account |
| [**adminGetAccount**](DefaultApi.md#admingetaccount) | **GET** /api/frontend/v1/admin/accounts/{uuid} | One Account with its card and passkey counts |
| [**adminGetBugReport**](DefaultApi.md#admingetbugreport) | **GET** /api/frontend/v1/admin/bug-reports/{number} | One Bug report with its text, diagnostics and image references |
| [**adminGetBugReportImage**](DefaultApi.md#admingetbugreportimage) | **GET** /api/frontend/v1/admin/bug-reports/{number}/images/{image} | One image of a Bug report |
| [**adminGetStatistics**](DefaultApi.md#admingetstatistics) | **GET** /api/frontend/v1/admin/statistics | The newest Statistics snapshot and the last 30 days of them |
| [**adminGetSyncs**](DefaultApi.md#admingetsyncs) | **GET** /api/frontend/v1/admin/syncs | The state of the catalog and price guide syncs, with their recent Sync runs |
| [**adminListAccounts**](DefaultApi.md#adminlistaccounts) | **GET** /api/frontend/v1/admin/accounts | List Accounts, newest first |
| [**adminListBugReports**](DefaultApi.md#adminlistbugreports) | **GET** /api/frontend/v1/admin/bug-reports | List Bug reports, newest first, the open ones unless asked otherwise |
| [**adminListLog**](DefaultApi.md#adminlistlog) | **GET** /api/frontend/v1/admin/log | List the Admin log, newest first |
| [**adminLockAccount**](DefaultApi.md#adminlockaccountoperation) | **POST** /api/frontend/v1/admin/accounts/{uuid}/lock | Lock an Account |
| [**adminMarkBugReportDone**](DefaultApi.md#adminmarkbugreportdone) | **POST** /api/frontend/v1/admin/bug-reports/{number}/done | Mark a Bug report done, recording the Admin and the time |
| [**adminRenameAccount**](DefaultApi.md#adminrenameaccountoperation) | **PUT** /api/frontend/v1/admin/accounts/{uuid}/username | Rename an Account |
| [**adminReopenBugReport**](DefaultApi.md#adminreopenbugreport) | **POST** /api/frontend/v1/admin/bug-reports/{number}/reopen | Open a done Bug report again |
| [**adminSetBugReportNote**](DefaultApi.md#adminsetbugreportnoteoperation) | **PUT** /api/frontend/v1/admin/bug-reports/{number}/note | Set the Admins\&#39; internal note on a Bug report, an empty note removes it |
| [**adminSetRole**](DefaultApi.md#adminsetroleoperation) | **PUT** /api/frontend/v1/admin/accounts/{uuid}/role | Change an Account\&#39;s Role |
| [**adminUnlockAccount**](DefaultApi.md#adminunlockaccountoperation) | **POST** /api/frontend/v1/admin/accounts/{uuid}/unlock | Lift an Account\&#39;s Lock |
| [**assignCollectionEntryTag**](DefaultApi.md#assigncollectionentrytag) | **POST** /api/frontend/v1/collections/{collection}/entries/{entry}/tags/{tag} | Put a card-wide tag on a stack |
| [**assignDeckCardTag**](DefaultApi.md#assigndeckcardtag) | **POST** /api/frontend/v1/decks/{deck}/cards/{card}/tags/{tag} | Put a tag on a card |
| [**attachDeckCollection**](DefaultApi.md#attachdeckcollection) | **POST** /api/frontend/v1/decks/{deck}/collection | Start keeping the cards that are physically in this deck |
| [**chooseUsername**](DefaultApi.md#chooseusernameoperation) | **POST** /api/frontend/v1/auth/oidc/username | Finish the username step: create the External Account and log it in |
| [**createCollection**](DefaultApi.md#createcollectionoperation) | **POST** /api/frontend/v1/collections |  |
| [**createDeck**](DefaultApi.md#createdeckoperation) | **POST** /api/frontend/v1/decks | Create a deck |
| [**createDeckFolder**](DefaultApi.md#createdeckfolderoperation) | **POST** /api/frontend/v1/folders | Make a folder |
| [**createDeckTag**](DefaultApi.md#createdecktagoperation) | **POST** /api/frontend/v1/decks/{deck}/tags | Create a tag on a deck |
| [**createGlobalTag**](DefaultApi.md#createglobaltagoperation) | **POST** /api/frontend/v1/tags | Create a tag that follows a card through every deck and every collection |
| [**createScannerSession**](DefaultApi.md#createscannersessionoperation) | **POST** /api/frontend/v1/scanner-sessions | Start a new persisted scanner session |
| [**createTournament**](DefaultApi.md#createtournament) | **POST** /api/frontend/v1/tournaments | Create a Tournament, owned by the logged-in Account |
| [**createWatchList**](DefaultApi.md#createwatchlistoperation) | **POST** /api/frontend/v1/watch-lists | Start a new watch list |
| [**declineTournamentHandover**](DefaultApi.md#declinetournamenthandover) | **POST** /api/frontend/v1/tournaments/{tournament}/handover/decline | Turn down a Tournament offered to the logged-in Account |
| [**deleteAccount**](DefaultApi.md#deleteaccountoperation) | **DELETE** /api/frontend/v1/accounts/me | Delete the logged-in account |
| [**deleteCollection**](DefaultApi.md#deletecollection) | **DELETE** /api/frontend/v1/collections/{collection} |  |
| [**deleteCollectionEntry**](DefaultApi.md#deletecollectionentry) | **DELETE** /api/frontend/v1/collections/{collection}/entries/{entry} | Remove a stack from a collection |
| [**deleteDeck**](DefaultApi.md#deletedeck) | **DELETE** /api/frontend/v1/decks/{deck} | Delete a deck and everything in it |
| [**deleteDeckCard**](DefaultApi.md#deletedeckcard) | **DELETE** /api/frontend/v1/decks/{deck}/cards/{card} | Take a card out of a deck |
| [**deleteDeckFolder**](DefaultApi.md#deletedeckfolder) | **DELETE** /api/frontend/v1/folders/{folder} | Throw a folder away |
| [**deleteDeckTag**](DefaultApi.md#deletedecktag) | **DELETE** /api/frontend/v1/decks/{deck}/tags/{tag} | Delete a tag, taking it off every card it sat on |
| [**deleteGlobalTag**](DefaultApi.md#deleteglobaltag) | **DELETE** /api/frontend/v1/tags/{tag} | Throw a card-wide tag away, taking it off every card it sat on |
| [**deletePasskey**](DefaultApi.md#deletepasskey) | **DELETE** /api/frontend/v1/accounts/passkeys/{uuid} | Delete one of the logged-in account\&#39;s passkeys |
| [**deleteScannerSession**](DefaultApi.md#deletescannersession) | **DELETE** /api/frontend/v1/scanner-sessions/{session} | Delete a session and its staging area |
| [**deleteScannerSessionEntry**](DefaultApi.md#deletescannersessionentry) | **DELETE** /api/frontend/v1/scanner-sessions/{session}/entries/{entry} | Remove a staged stack |
| [**deleteTournament**](DefaultApi.md#deletetournament) | **DELETE** /api/frontend/v1/tournaments/{tournament} | Delete a Tournament and everything in it, as its Owner |
| [**deleteWatchList**](DefaultApi.md#deletewatchlist) | **DELETE** /api/frontend/v1/watch-lists/{list} | Throw a watch list away, taking every entry on it with it |
| [**deleteWatchListEntry**](DefaultApi.md#deletewatchlistentry) | **DELETE** /api/frontend/v1/watch-lists/{list}/entries/{entry} | Take a card off a watch list |
| [**detachDeckCollection**](DefaultApi.md#detachdeckcollection) | **DELETE** /api/frontend/v1/decks/{deck}/collection | Stop keeping them |
| [**fileScannerSession**](DefaultApi.md#filescannersessionoperation) | **POST** /api/frontend/v1/scanner-sessions/{session}/file | Atomically file every staged stack and empty the session |
| [**fillDeckCollection**](DefaultApi.md#filldeckcollectionoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/fill | Declare that the deck holds what its list asks for |
| [**finishAddPasskey**](DefaultApi.md#finishaddpasskeyoperation) | **POST** /api/frontend/v1/accounts/passkeys/finish | Finish registering another passkey for the logged-in account |
| [**finishLogin**](DefaultApi.md#finishloginoperation) | **POST** /api/frontend/v1/auth/login/finish | Finish a passkey login |
| [**finishOidcLogin**](DefaultApi.md#finishoidclogin) | **GET** /api/frontend/v1/auth/oidc/callback | Finish an OIDC login: the provider sends the browser back here |
| [**finishRegistration**](DefaultApi.md#finishregistrationoperation) | **POST** /api/frontend/v1/auth/register/finish | Finish a passkey registration |
| [**getAllCollections**](DefaultApi.md#getallcollections) | **GET** /api/frontend/v1/collections |  |
| [**getAllDeckFolders**](DefaultApi.md#getalldeckfolders) | **GET** /api/frontend/v1/folders | List every folder the account keeps |
| [**getAllDecks**](DefaultApi.md#getalldecks) | **GET** /api/frontend/v1/decks | The decks an account owns |
| [**getAllGlobalTags**](DefaultApi.md#getallglobaltags) | **GET** /api/frontend/v1/tags | Every tag the account keeps for all of its decks and collections |
| [**getAllScannerSessions**](DefaultApi.md#getallscannersessions) | **GET** /api/frontend/v1/scanner-sessions | List every scanner session and its current staging count |
| [**getAllWatchLists**](DefaultApi.md#getallwatchlists) | **GET** /api/frontend/v1/watch-lists | Every watch list the account keeps |
| [**getBracketFlags**](DefaultApi.md#getbracketflags) | **POST** /api/frontend/v1/printings/bracket-flags | Which Commander bracket rules the given printings count towards |
| [**getCollection**](DefaultApi.md#getcollection) | **GET** /api/frontend/v1/collections/{collection} | Fetch a single collection |
| [**getCollectionStatistics**](DefaultApi.md#getcollectionstatistics) | **GET** /api/frontend/v1/collections/{collection}/statistics |  |
| [**getDeck**](DefaultApi.md#getdeck) | **GET** /api/frontend/v1/decks/{deck} | Fetch a single deck, with the caller\&#39;s role on it |
| [**getDeckAdvisorSettings**](DefaultApi.md#getdeckadvisorsettings) | **GET** /api/frontend/v1/decks/{deck}/advisor-settings | Read this deck\&#39;s advisor settings |
| [**getDeckCollectionDrift**](DefaultApi.md#getdeckcollectiondrift) | **GET** /api/frontend/v1/decks/{deck}/collection/drift | Where the deck list and the deck\&#39;s own collection disagree |
| [**getDeckFormats**](DefaultApi.md#getdeckformats) | **GET** /api/frontend/v1/decks/formats | What the offered formats ask of a deck |
| [**getDeckHistory**](DefaultApi.md#getdeckhistory) | **GET** /api/frontend/v1/decks/{deck}/history | A deck\&#39;s Deck history, newest first |
| [**getDeckPoint**](DefaultApi.md#getdeckpoint) | **GET** /api/frontend/v1/decks/{deck}/history/{change} | The deck as it was right after one of its Deck changes, read-only |
| [**getDeckSourcing**](DefaultApi.md#getdecksourcing) | **GET** /api/frontend/v1/decks/{deck}/sourcing | What the deck asks for, what is in it, and where the rest could come from |
| [**getDecksSharedWithMe**](DefaultApi.md#getdeckssharedwithme) | **GET** /api/frontend/v1/decks/shared-with-me | The decks other Accounts named the caller on, alphabetically by name |
| [**getMpcfillCardbacks**](DefaultApi.md#getmpcfillcardbacks) | **GET** /api/frontend/v1/mpcfill/cardbacks | The card backs MPCFill offers |
| [**getMyTournaments**](DefaultApi.md#getmytournaments) | **GET** /api/frontend/v1/tournaments/mine | The Tournaments the logged-in Account organizes and the ones it plays in |
| [**getPendingOidcLogin**](DefaultApi.md#getpendingoidclogin) | **GET** /api/frontend/v1/auth/oidc/pending | The session\&#39;s OIDC login waiting for its username step |
| [**getPriceHistory**](DefaultApi.md#getpricehistory) | **GET** /api/frontend/v1/printings/{printing}/price-history | What a card has cost over time |
| [**getPrintingLanguages**](DefaultApi.md#getprintinglanguages) | **GET** /api/frontend/v1/printings/{printing}/languages | Every language the same card exists in |
| [**getPublicCollection**](DefaultApi.md#getpubliccollection) | **GET** /api/frontend/v1/explore/collections/{collection} | Fetch one collection its owner put on show |
| [**getPublicCollectionStatistics**](DefaultApi.md#getpubliccollectionstatistics) | **GET** /api/frontend/v1/explore/collections/{collection}/statistics | Count a public collection\&#39;s statistics |
| [**getPublicDeck**](DefaultApi.md#getpublicdeck) | **GET** /api/frontend/v1/explore/decks/{deck} | Fetch one deck its owner put on show |
| [**getPublicProfile**](DefaultApi.md#getpublicprofile) | **GET** /api/frontend/v1/explore/profiles/{username} | Fetch an account\&#39;s public profile: what it put on show |
| [**getScannerSession**](DefaultApi.md#getscannersession) | **GET** /api/frontend/v1/scanner-sessions/{session} | Read one session from any signed-in device |
| [**getSharedCollection**](DefaultApi.md#getsharedcollection) | **GET** /api/frontend/v1/shared/collections/{token} | Fetch the collection a share link points at |
| [**getSharedCollectionStatistics**](DefaultApi.md#getsharedcollectionstatistics) | **GET** /api/frontend/v1/shared/collections/{token}/statistics | Count a shared collection\&#39;s statistics |
| [**getSharedDeck**](DefaultApi.md#getshareddeck) | **GET** /api/frontend/v1/shared/decks/{token} | Fetch the deck a share link points at |
| [**getSharedTournament**](DefaultApi.md#getsharedtournament) | **GET** /api/frontend/v1/shared/tournaments/{token} | Fetch the Tournament a share link points at |
| [**getTournament**](DefaultApi.md#gettournament) | **GET** /api/frontend/v1/tournaments/{tournament} | Fetch a Tournament by its id |
| [**getTournamentHandovers**](DefaultApi.md#gettournamenthandovers) | **GET** /api/frontend/v1/tournaments/handovers | The Tournaments offered to the logged-in Account to take over, latest start first |
| [**getWatchList**](DefaultApi.md#getwatchlist) | **GET** /api/frontend/v1/watch-lists/{list} | One watch list, without what is on it |
| [**getWatchListAlarms**](DefaultApi.md#getwatchlistalarms) | **GET** /api/frontend/v1/watch-lists/alarms | Every alarm standing across the account\&#39;s watch lists |
| [**importDeckCards**](DefaultApi.md#importdeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/cards/import | Write a whole decklist into a deck |
| [**leaveDeck**](DefaultApi.md#leavedeck) | **POST** /api/frontend/v1/decks/{deck}/leave | Take oneself off a deck another Account named one on |
| [**listCollectionCards**](DefaultApi.md#listcollectioncards) | **GET** /api/frontend/v1/collections/{collection}/cards | List a page of a collection\&#39;s cards, sorted and filtered |
| [**listCollectionEntries**](DefaultApi.md#listcollectionentries) | **GET** /api/frontend/v1/collections/{collection}/entries | List every stack filed in a collection |
| [**listCollectionOnLoan**](DefaultApi.md#listcollectiononloan) | **GET** /api/frontend/v1/collections/{collection}/on-loan | Count a collection\&#39;s statistics |
| [**listDeckCards**](DefaultApi.md#listdeckcards) | **GET** /api/frontend/v1/decks/{deck}/cards | Every card of a deck, with the catalog data and the tags on it |
| [**listDeckCollaborators**](DefaultApi.md#listdeckcollaborators) | **GET** /api/frontend/v1/decks/{deck}/collaborators | The owner and the Collaborators of a deck, the latter alphabetically by username |
| [**listOpenidProviders**](DefaultApi.md#listopenidproviders) | **GET** /api/frontend/v1/auth/oidc/providers | List the OpenID providers people may log in through |
| [**listPasskeys**](DefaultApi.md#listpasskeys) | **GET** /api/frontend/v1/accounts/passkeys | List the passkeys of the logged-in account |
| [**listPublicCollectionCards**](DefaultApi.md#listpubliccollectioncards) | **GET** /api/frontend/v1/explore/collections/{collection}/cards | List a page of a public collection\&#39;s cards, sorted and filtered |
| [**listPublicDeckCards**](DefaultApi.md#listpublicdeckcards) | **GET** /api/frontend/v1/explore/decks/{deck}/cards | Every card of a public deck, with the catalog data and the tags on it |
| [**listPublicTournaments**](DefaultApi.md#listpublictournaments) | **GET** /api/frontend/v1/tournaments | The public Tournaments, narrowed down by the filters given |
| [**listSharedCollectionCards**](DefaultApi.md#listsharedcollectioncards) | **GET** /api/frontend/v1/shared/collections/{token}/cards | List a page of a shared collection\&#39;s cards, sorted and filtered |
| [**listSharedDeckCards**](DefaultApi.md#listshareddeckcards) | **GET** /api/frontend/v1/shared/decks/{token}/cards | Every card of a shared deck, with the catalog data and the tags on it |
| [**listSharedTournamentParticipants**](DefaultApi.md#listsharedtournamentparticipants) | **GET** /api/frontend/v1/shared/tournaments/{token}/participants | The Participants of the Tournament a share link points at |
| [**listTournamentOrganizers**](DefaultApi.md#listtournamentorganizers) | **GET** /api/frontend/v1/tournaments/{tournament}/organizers | Who runs a Tournament, and whom its Owner offered it to |
| [**listTournamentParticipants**](DefaultApi.md#listtournamentparticipants) | **GET** /api/frontend/v1/tournaments/{tournament}/participants | The Participants of a Tournament the reader may see |
| [**listWatchListCopies**](DefaultApi.md#listwatchlistcopies) | **GET** /api/frontend/v1/watch-lists/{list}/entries/{entry}/copies | Where the copies of one watched card are |
| [**listWatchListEntries**](DefaultApi.md#listwatchlistentries) | **GET** /api/frontend/v1/watch-lists/{list}/entries | Everything one watch list page is drawn from |
| [**logout**](DefaultApi.md#logout) | **GET** /api/frontend/v1/auth/logout | Log out, dropping the session |
| [**me**](DefaultApi.md#me) | **GET** /api/frontend/v1/accounts/me | The account the current session belongs to |
| [**mergeCollectionEntries**](DefaultApi.md#mergecollectionentriesoperation) | **POST** /api/frontend/v1/collections/{collection}/entries/merge | Combine stacks of the same cards into one |
| [**offerTournamentHandover**](DefaultApi.md#offertournamenthandover) | **PUT** /api/frontend/v1/tournaments/{tournament}/handover | Offer a Tournament to an Account by its username, as its Owner |
| [**putDeckCollaborator**](DefaultApi.md#putdeckcollaboratoroperation) | **PUT** /api/frontend/v1/decks/{deck}/collaborators | Name an Account on a deck by its username, or change the level it is named at |
| [**readDeckUrl**](DefaultApi.md#readdeckurloperation) | **POST** /api/frontend/v1/decks/import/url | Read a decklist off a link to another builder, or off one of our own links |
| [**recoverAccount**](DefaultApi.md#recoveraccountoperation) | **POST** /api/frontend/v1/auth/recover | Send a fresh registration link to an account\&#39;s stored address |
| [**redoDeckChange**](DefaultApi.md#redodeckchange) | **POST** /api/frontend/v1/decks/{deck}/history/redo | Apply the latest undone Deck change again |
| [**removeDeckCheckpoint**](DefaultApi.md#removedeckcheckpoint) | **DELETE** /api/frontend/v1/decks/{deck}/history/{change}/checkpoint | Remove the Deck checkpoint of one of the deck\&#39;s Deck changes |
| [**removeDeckCollaborator**](DefaultApi.md#removedeckcollaborator) | **DELETE** /api/frontend/v1/decks/{deck}/collaborators/{account} | Take an Account off a deck |
| [**removeTournamentCoOrganizer**](DefaultApi.md#removetournamentcoorganizer) | **DELETE** /api/frontend/v1/tournaments/{tournament}/organizers/{account} | Take a Co-organizer off a Tournament |
| [**removeTournamentParticipant**](DefaultApi.md#removetournamentparticipant) | **DELETE** /api/frontend/v1/tournaments/{tournament}/participants/{participant} | Take a Participant out of a Tournament, as an Organizer |
| [**renameAccount**](DefaultApi.md#renameaccountoperation) | **PUT** /api/frontend/v1/accounts/me/username | Rename the logged-in account |
| [**renamePasskey**](DefaultApi.md#renamepasskeyoperation) | **PUT** /api/frontend/v1/accounts/passkeys/{uuid} | Rename one of the logged-in account\&#39;s passkeys |
| [**resetDeck**](DefaultApi.md#resetdeck) | **POST** /api/frontend/v1/decks/{deck}/history/{change}/reset | Bring the deck back to how it was right after one of its Deck changes |
| [**resolvePrintings**](DefaultApi.md#resolveprintingsoperation) | **POST** /api/frontend/v1/printings/resolve | Place cards in the catalog |
| [**returnAllDeckCards**](DefaultApi.md#returnalldeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/return-all | Sort everything in the deck back where it came from |
| [**returnDeckCards**](DefaultApi.md#returndeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/return | Sort copies out of the deck back into a collection |
| [**rotateDeckShareToken**](DefaultApi.md#rotatedecksharetoken) | **POST** /api/frontend/v1/decks/{deck}/share-token | Mint a fresh secret for a deck\&#39;s share link |
| [**rotateShareToken**](DefaultApi.md#rotatesharetoken) | **POST** /api/frontend/v1/collections/{collection}/share-token | Mint a fresh secret for a collection\&#39;s share link |
| [**searchCollaboratorCandidates**](DefaultApi.md#searchcollaboratorcandidates) | **GET** /api/frontend/v1/decks/{deck}/collaborators/candidates | Accounts whose username starts with what the owner typed, to name on a deck |
| [**searchMpcfillArt**](DefaultApi.md#searchmpcfillart) | **POST** /api/frontend/v1/mpcfill/search | The art MPCFill has for these cards |
| [**searchPublicDecks**](DefaultApi.md#searchpublicdecks) | **GET** /api/frontend/v1/explore/decks | Search the decks their owners put on show |
| [**searchTournamentPlayers**](DefaultApi.md#searchtournamentplayers) | **GET** /api/frontend/v1/tournaments/{tournament}/player-search | Accounts whose username starts with what an Organizer typed, to add as Participants |
| [**sendBugReport**](DefaultApi.md#sendbugreportoperation) | **POST** /api/frontend/v1/bug-reports | Send a Bug report |
| [**setDeckAdvisorSettings**](DefaultApi.md#setdeckadvisorsettings) | **PUT** /api/frontend/v1/decks/{deck}/advisor-settings | Replace this deck\&#39;s advisor settings |
| [**setDeckBracket**](DefaultApi.md#setdeckbracketoperation) | **PUT** /api/frontend/v1/decks/{deck}/bracket | Say which Commander bracket the deck is built to |
| [**setDeckCheckpoint**](DefaultApi.md#setdeckcheckpointoperation) | **PUT** /api/frontend/v1/decks/{deck}/history/{change}/checkpoint | Name one of the deck\&#39;s Deck changes with a Deck checkpoint, or rename its |
| [**setDeckColors**](DefaultApi.md#setdeckcolorsoperation) | **PUT** /api/frontend/v1/decks/{deck}/colors | Overrule which colours the deck may play |
| [**setDeckFolder**](DefaultApi.md#setdeckfolderoperation) | **POST** /api/frontend/v1/decks/{deck}/folder | File a deck into one of the account\&#39;s folders |
| [**setDeckRuleZero**](DefaultApi.md#setdeckrulezerooperation) | **PUT** /api/frontend/v1/decks/{deck}/rule-zero | Record the house rules the deck is played under, colours included |
| [**setVisibilityCollection**](DefaultApi.md#setvisibilitycollection) | **POST** /api/frontend/v1/collections/{collection} | Change who may see a collection |
| [**setVisibilityDeck**](DefaultApi.md#setvisibilitydeck) | **POST** /api/frontend/v1/decks/{deck} | Change who may see a deck |
| [**signUpForSharedTournament**](DefaultApi.md#signupforsharedtournament) | **POST** /api/frontend/v1/shared/tournaments/{token}/sign-up | Sign the logged-in Account up for the Tournament a share link points at |
| [**signUpForTournament**](DefaultApi.md#signupfortournament) | **POST** /api/frontend/v1/tournaments/{tournament}/sign-up | Sign the logged-in Account up for a Tournament it sees by its id |
| [**signup**](DefaultApi.md#signupoperation) | **POST** /api/frontend/v1/auth/signup | Sign up for a new account |
| [**splitCollectionEntry**](DefaultApi.md#splitcollectionentryoperation) | **POST** /api/frontend/v1/collections/{collection}/entries/{entry}/split | Move copies out of a stack into a new one |
| [**startAddPasskey**](DefaultApi.md#startaddpasskey) | **POST** /api/frontend/v1/accounts/passkeys/start | Start registering another passkey for the logged-in account |
| [**startLogin**](DefaultApi.md#startloginoperation) | **POST** /api/frontend/v1/auth/login/start | Start a passkey login for a given username |
| [**startOidcLogin**](DefaultApi.md#startoidcloginoperation) | **POST** /api/frontend/v1/auth/oidc/start | Start an OIDC login, for signing up and logging in alike |
| [**startRegistration**](DefaultApi.md#startregistrationoperation) | **POST** /api/frontend/v1/auth/register/start | Start a passkey registration |
| [**swapDeckCard**](DefaultApi.md#swapdeckcardoperation) | **POST** /api/frontend/v1/decks/{deck}/cards/{card}/swap | Give up copies of a Deck entry for another card in the same zone |
| [**takeDeckCards**](DefaultApi.md#takedeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/take | Move copies out of a collection and into the deck |
| [**unassignCollectionEntryTag**](DefaultApi.md#unassigncollectionentrytag) | **DELETE** /api/frontend/v1/collections/{collection}/entries/{entry}/tags/{tag} | Take a card-wide tag off a stack, see [&#x60;assign_collection_entry_tag&#x60;] |
| [**unassignDeckCardTag**](DefaultApi.md#unassigndeckcardtag) | **DELETE** /api/frontend/v1/decks/{deck}/cards/{card}/tags/{tag} | Take a tag off a card |
| [**undoDeckChange**](DefaultApi.md#undodeckchange) | **POST** /api/frontend/v1/decks/{deck}/history/undo | Take back the latest Deck change that is not undone yet |
| [**updateCollection**](DefaultApi.md#updatecollectionoperation) | **PUT** /api/frontend/v1/collections/{collection} |  |
| [**updateCollectionEntry**](DefaultApi.md#updatecollectionentryoperation) | **PATCH** /api/frontend/v1/collections/{collection}/entries/{entry} | Change a stack: its count, condition, finish, signature, price, date or printing |
| [**updateDeck**](DefaultApi.md#updatedeckoperation) | **PUT** /api/frontend/v1/decks/{deck} | Rename a deck, change its description or the format it is built for |
| [**updateDeckCard**](DefaultApi.md#updatedeckcardoperation) | **PATCH** /api/frontend/v1/decks/{deck}/cards/{card} | Change a Deck entry: its count, its zone or the print it sleeves |
| [**updateDeckFolder**](DefaultApi.md#updatedeckfolderoperation) | **PUT** /api/frontend/v1/folders/{folder} | Rename a folder |
| [**updateDeckTag**](DefaultApi.md#updatedecktagoperation) | **PUT** /api/frontend/v1/decks/{deck}/tags/{tag} | Rename a tag, change its marker or move its scope |
| [**updateGlobalTag**](DefaultApi.md#updateglobaltagoperation) | **PUT** /api/frontend/v1/tags/{tag} | Rename a card-wide tag or change its marker |
| [**updateScannerSession**](DefaultApi.md#updatescannersessionoperation) | **PUT** /api/frontend/v1/scanner-sessions/{session} | Rename a session or change its marker and preferred collection |
| [**updateScannerSessionEntry**](DefaultApi.md#updatescannersessionentryoperation) | **PATCH** /api/frontend/v1/scanner-sessions/{session}/entries/{entry} | Adjust count, finish, signed state, paid price or printing |
| [**updateTournament**](DefaultApi.md#updatetournament) | **PUT** /api/frontend/v1/tournaments/{tournament} | Replace a Tournament\&#39;s settings, as one of its Organizers |
| [**updateWatchList**](DefaultApi.md#updatewatchlistoperation) | **PUT** /api/frontend/v1/watch-lists/{list} | Rename a watch list or change its marker |
| [**updateWatchListEntry**](DefaultApi.md#updatewatchlistentryoperation) | **PUT** /api/frontend/v1/watch-lists/{list}/entries/{entry} | Change some of an entry\&#39;s fields, leaving the rest alone |
| [**withdrawTournamentHandover**](DefaultApi.md#withdrawtournamenthandover) | **DELETE** /api/frontend/v1/tournaments/{tournament}/handover | Withdraw the pending offer of a Tournament, as its Owner |
| [**withdrawTournamentSignUp**](DefaultApi.md#withdrawtournamentsignup) | **DELETE** /api/frontend/v1/tournaments/{tournament}/sign-up | Withdraw the logged-in Account\&#39;s own sign-up |



## acceptTournamentHandover

> TournamentResponse acceptTournamentHandover(tournament)

Take over a Tournament offered to the logged-in Account

Take over a Tournament offered to the logged-in Account  It becomes the Owner; the former Owner stays as a Co-organizer.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AcceptTournamentHandoverRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AcceptTournamentHandoverRequest;

  try {
    const data = await api.acceptTournamentHandover(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TournamentResponse**](TournamentResponse.md)

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


## acknowledgeWatchListAlarm

> any acknowledgeWatchListAlarm(list, entry)

Mark an alarm as seen

Mark an alarm as seen  Only the reading is recorded. The alarm itself stays on the entry until the price rises back through the threshold, because it is still true.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AcknowledgeWatchListAlarmRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AcknowledgeWatchListAlarmRequest;

  try {
    const data = await api.acknowledgeWatchListAlarm(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## addCollectionEntries

> any addCollectionEntries(collection, AddCollectionEntriesRequest)

File stacks of cards into a collection

File stacks of cards into a collection

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddCollectionEntriesOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddCollectionEntriesRequest (optional)
    AddCollectionEntriesRequest: ...,
  } satisfies AddCollectionEntriesOperationRequest;

  try {
    const data = await api.addCollectionEntries(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **AddCollectionEntriesRequest** | [AddCollectionEntriesRequest](AddCollectionEntriesRequest.md) |  | [Optional] |

### Return type

**any**

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


## addDeckCard

> DeckCardResponse addDeckCard(deck, AddDeckCardRequest)

Put a card into a deck

Put a card into a deck  Copies joining an alike Deck entry (same printing, zone, finish and proxy status) raise its count instead of opening a second line beside it. The answer is the entry\&#39;s bookkeeping fields either way; catalog data and tags come from the list endpoint. Only the owner adds proxies, see [&#x60;DeckGrant::proxy&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddDeckCardOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddDeckCardRequest (optional)
    AddDeckCardRequest: ...,
  } satisfies AddDeckCardOperationRequest;

  try {
    const data = await api.addDeckCard(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **AddDeckCardRequest** | [AddDeckCardRequest](AddDeckCardRequest.md) |  | [Optional] |

### Return type

[**DeckCardResponse**](DeckCardResponse.md)

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


## addScannerSessionEntry

> ScannerSessionEntryResponse addScannerSessionEntry(session, AddScannerSessionEntryRequest)

Add scanned copies to a session

Add scanned copies to a session

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddScannerSessionEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddScannerSessionEntryRequest (optional)
    AddScannerSessionEntryRequest: ...,
  } satisfies AddScannerSessionEntryOperationRequest;

  try {
    const data = await api.addScannerSessionEntry(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |
| **AddScannerSessionEntryRequest** | [AddScannerSessionEntryRequest](AddScannerSessionEntryRequest.md) |  | [Optional] |

### Return type

[**ScannerSessionEntryResponse**](ScannerSessionEntryResponse.md)

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


## addTournamentAccount

> AddTournamentAccount200Response addTournamentAccount(tournament, AddAccountParticipantRequest)

Add an Account as a Participant by its username, as an Organizer

Add an Account as a Participant by its username, as an Organizer  An Organizer may add itself. Only while the Tournament is in Registration; the participant limit does not hold Organizers back. Unknown usernames are capped per caller, see [&#x60;UNKNOWN_USERNAMES&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddTournamentAccountRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddAccountParticipantRequest (optional)
    AddAccountParticipantRequest: ...,
  } satisfies AddTournamentAccountRequest;

  try {
    const data = await api.addTournamentAccount(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **AddAccountParticipantRequest** | [AddAccountParticipantRequest](AddAccountParticipantRequest.md) |  | [Optional] |

### Return type

[**AddTournamentAccount200Response**](AddTournamentAccount200Response.md)

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


## addTournamentCoOrganizer

> AddTournamentCoOrganizer200Response addTournamentCoOrganizer(tournament, NameAccountRequest)

Name an Account a Co-organizer by its username, as one of the Organizers

Name an Account a Co-organizer by its username, as one of the Organizers  Unknown usernames are capped per caller, see [&#x60;UNKNOWN_USERNAMES&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddTournamentCoOrganizerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // NameAccountRequest (optional)
    NameAccountRequest: ...,
  } satisfies AddTournamentCoOrganizerRequest;

  try {
    const data = await api.addTournamentCoOrganizer(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **NameAccountRequest** | [NameAccountRequest](NameAccountRequest.md) |  | [Optional] |

### Return type

[**AddTournamentCoOrganizer200Response**](AddTournamentCoOrganizer200Response.md)

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


## addTournamentGuest

> AddTournamentGuest200Response addTournamentGuest(tournament, AddGuestParticipantRequest)

Add a Guest by name, as an Organizer

Add a Guest by name, as an Organizer  Only while the Tournament is in Registration. The name is trimmed; two Guests may share one.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddTournamentGuestRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddGuestParticipantRequest (optional)
    AddGuestParticipantRequest: ...,
  } satisfies AddTournamentGuestRequest;

  try {
    const data = await api.addTournamentGuest(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **AddGuestParticipantRequest** | [AddGuestParticipantRequest](AddGuestParticipantRequest.md) |  | [Optional] |

### Return type

[**AddTournamentGuest200Response**](AddTournamentGuest200Response.md)

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


## addWatchListEntry

> any addWatchListEntry(list, AddWatchListEntryRequest)

Put a card on a watch list

Put a card on a watch list

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddWatchListEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddWatchListEntryRequest (optional)
    AddWatchListEntryRequest: ...,
  } satisfies AddWatchListEntryOperationRequest;

  try {
    const data = await api.addWatchListEntry(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **AddWatchListEntryRequest** | [AddWatchListEntryRequest](AddWatchListEntryRequest.md) |  | [Optional] |

### Return type

**any**

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


## adminDeleteAccount

> FormErrorResponseForAdminDeleteAccountErrors adminDeleteAccount(uuid, AdminDeleteAccountRequest)

Delete an Account

Delete an Account  By default its public decks go to the Tombstone, as on a self-deletion; a full Deletion takes them too. The Admin types the Account\&#39;s username to confirm, and cannot delete itself. The Admin log entry is written first, so it keeps the username once the Account is gone.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminDeleteAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AdminDeleteAccountRequest (optional)
    AdminDeleteAccountRequest: ...,
  } satisfies AdminDeleteAccountOperationRequest;

  try {
    const data = await api.adminDeleteAccount(body);
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
| **AdminDeleteAccountRequest** | [AdminDeleteAccountRequest](AdminDeleteAccountRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAdminDeleteAccountErrors**](FormErrorResponseForAdminDeleteAccountErrors.md)

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


## adminGetAccount

> AdminAccountDetail adminGetAccount(uuid)

One Account with its card and passkey counts

One Account with its card and passkey counts

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminGetAccountRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AdminGetAccountRequest;

  try {
    const data = await api.adminGetAccount(body);
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

[**AdminAccountDetail**](AdminAccountDetail.md)

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


## adminGetBugReport

> AdminBugReportDetail adminGetBugReport(number)

One Bug report with its text, diagnostics and image references

One Bug report with its text, diagnostics and image references

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminGetBugReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number
    number: 789,
  } satisfies AdminGetBugReportRequest;

  try {
    const data = await api.adminGetBugReport(body);
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
| **number** | `number` |  | [Defaults to `undefined`] |

### Return type

[**AdminBugReportDetail**](AdminBugReportDetail.md)

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


## adminGetBugReportImage

> adminGetBugReportImage(number, image)

One image of a Bug report

One image of a Bug report

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminGetBugReportImageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number
    number: 789,
    // string
    image: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AdminGetBugReportImageRequest;

  try {
    const data = await api.adminGetBugReportImage(body);
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
| **number** | `number` |  | [Defaults to `undefined`] |
| **image** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `image/*`, `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminGetStatistics

> AdminStatisticsResponse adminGetStatistics()

The newest Statistics snapshot and the last 30 days of them

The newest Statistics snapshot and the last 30 days of them

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminGetStatisticsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.adminGetStatistics();
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

[**AdminStatisticsResponse**](AdminStatisticsResponse.md)

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


## adminGetSyncs

> AdminSyncsResponse adminGetSyncs()

The state of the catalog and price guide syncs, with their recent Sync runs

The state of the catalog and price guide syncs, with their recent Sync runs

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminGetSyncsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.adminGetSyncs();
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

[**AdminSyncsResponse**](AdminSyncsResponse.md)

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


## adminListAccounts

> AdminListAccountsResponse adminListAccounts(after, limit, locked, role, search)

List Accounts, newest first

List Accounts, newest first

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminListAccountsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    after: ...,
    // number (optional)
    limit: 56,
    // boolean (optional)
    locked: true,
    // Role (optional)
    role: ...,
    // string (optional)
    search: ...,
  } satisfies AdminListAccountsRequest;

  try {
    const data = await api.adminListAccounts(body);
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
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **locked** | `boolean` |  | [Optional] [Defaults to `undefined`] |
| **role** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Member, Admin] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**AdminListAccountsResponse**](AdminListAccountsResponse.md)

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


## adminListBugReports

> AdminListBugReportsResponse adminListBugReports(after, filter, limit)

List Bug reports, newest first, the open ones unless asked otherwise

List Bug reports, newest first, the open ones unless asked otherwise

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminListBugReportsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number (optional)
    after: ...,
    // AdminBugReportFilter (optional)
    filter: ...,
    // number (optional)
    limit: 56,
  } satisfies AdminListBugReportsRequest;

  try {
    const data = await api.adminListBugReports(body);
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
| **after** | `number` |  | [Optional] [Defaults to `undefined`] |
| **filter** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Open, Done, All] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**AdminListBugReportsResponse**](AdminListBugReportsResponse.md)

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


## adminListLog

> AdminListLogResponse adminListLog(account, after, limit)

List the Admin log, newest first

List the Admin log, newest first

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminListLogRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    account: ...,
    // string (optional)
    after: ...,
    // number (optional)
    limit: 56,
  } satisfies AdminListLogRequest;

  try {
    const data = await api.adminListLog(body);
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
| **account** | `string` |  | [Optional] [Defaults to `undefined`] |
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**AdminListLogResponse**](AdminListLogResponse.md)

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


## adminLockAccount

> FormErrorResponseForAdminLockAccountErrors adminLockAccount(uuid, AdminLockAccountRequest)

Lock an Account

Lock an Account  Its Login and Registration link Enrollment are refused from now on, and its sessions fail on their next request. An Admin cannot Lock itself.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminLockAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AdminLockAccountRequest (optional)
    AdminLockAccountRequest: ...,
  } satisfies AdminLockAccountOperationRequest;

  try {
    const data = await api.adminLockAccount(body);
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
| **AdminLockAccountRequest** | [AdminLockAccountRequest](AdminLockAccountRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAdminLockAccountErrors**](FormErrorResponseForAdminLockAccountErrors.md)

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


## adminMarkBugReportDone

> any adminMarkBugReportDone(number)

Mark a Bug report done, recording the Admin and the time

Mark a Bug report done, recording the Admin and the time

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminMarkBugReportDoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number
    number: 789,
  } satisfies AdminMarkBugReportDoneRequest;

  try {
    const data = await api.adminMarkBugReportDone(body);
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
| **number** | `number` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminRenameAccount

> FormErrorResponseForAdminRenameAccountErrors adminRenameAccount(uuid, AdminRenameAccountRequest)

Rename an Account

Rename an Account  Takes the same usernames as a Rename by the Account itself, also for a locked Account, and mails the Account its new username without the reason. An Admin renames itself through its own settings, not here.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminRenameAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AdminRenameAccountRequest (optional)
    AdminRenameAccountRequest: ...,
  } satisfies AdminRenameAccountOperationRequest;

  try {
    const data = await api.adminRenameAccount(body);
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
| **AdminRenameAccountRequest** | [AdminRenameAccountRequest](AdminRenameAccountRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAdminRenameAccountErrors**](FormErrorResponseForAdminRenameAccountErrors.md)

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


## adminReopenBugReport

> any adminReopenBugReport(number)

Open a done Bug report again

Open a done Bug report again  What a purge removed stays removed.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminReopenBugReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number
    number: 789,
  } satisfies AdminReopenBugReportRequest;

  try {
    const data = await api.adminReopenBugReport(body);
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
| **number** | `number` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## adminSetBugReportNote

> any adminSetBugReportNote(number, AdminSetBugReportNoteRequest)

Set the Admins\&#39; internal note on a Bug report, an empty note removes it

Set the Admins\&#39; internal note on a Bug report, an empty note removes it

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminSetBugReportNoteOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number
    number: 789,
    // AdminSetBugReportNoteRequest (optional)
    AdminSetBugReportNoteRequest: ...,
  } satisfies AdminSetBugReportNoteOperationRequest;

  try {
    const data = await api.adminSetBugReportNote(body);
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
| **number** | `number` |  | [Defaults to `undefined`] |
| **AdminSetBugReportNoteRequest** | [AdminSetBugReportNoteRequest](AdminSetBugReportNoteRequest.md) |  | [Optional] |

### Return type

**any**

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


## adminSetRole

> FormErrorResponseForAdminSetRoleErrors adminSetRole(uuid, AdminSetRoleRequest)

Change an Account\&#39;s Role

Change an Account\&#39;s Role  An Admin cannot demote itself, so there is always an Admin left to undo a change. A change writes an Admin log entry; setting the Role an Account has already writes none.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminSetRoleOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AdminSetRoleRequest (optional)
    AdminSetRoleRequest: ...,
  } satisfies AdminSetRoleOperationRequest;

  try {
    const data = await api.adminSetRole(body);
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
| **AdminSetRoleRequest** | [AdminSetRoleRequest](AdminSetRoleRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAdminSetRoleErrors**](FormErrorResponseForAdminSetRoleErrors.md)

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


## adminUnlockAccount

> FormErrorResponseForAdminUnlockAccountErrors adminUnlockAccount(uuid, AdminUnlockAccountRequest)

Lift an Account\&#39;s Lock

Lift an Account\&#39;s Lock

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AdminUnlockAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AdminUnlockAccountRequest (optional)
    AdminUnlockAccountRequest: ...,
  } satisfies AdminUnlockAccountOperationRequest;

  try {
    const data = await api.adminUnlockAccount(body);
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
| **AdminUnlockAccountRequest** | [AdminUnlockAccountRequest](AdminUnlockAccountRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAdminUnlockAccountErrors**](FormErrorResponseForAdminUnlockAccountErrors.md)

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


## assignCollectionEntryTag

> any assignCollectionEntryTag(collection, entry, tag)

Put a card-wide tag on a stack

Put a card-wide tag on a stack  The tag lands on the card the stack holds, not on the row: another copy of the same card, in another printing, language or collection, carries it from then on, and so does every slot of it in a deck. That is what makes a tag worth keeping across a whole account, and why only the tags that are not local to a deck can be put on here.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AssignCollectionEntryTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AssignCollectionEntryTagRequest;

  try {
    const data = await api.assignCollectionEntryTag(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## assignDeckCardTag

> any assignDeckCardTag(deck, card, tag)

Put a tag on a card

Put a tag on a card  An Editor only puts on tags local to this deck: a global one would tag the card on every deck of the owner.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AssignDeckCardTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    card: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AssignDeckCardTagRequest;

  try {
    const data = await api.assignDeckCardTag(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **card** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## attachDeckCollection

> CollectionResponse attachDeckCollection(deck)

Start keeping the cards that are physically in this deck

Start keeping the cards that are physically in this deck  The deck gets a collection of its own. Idempotent, so the client can call it without first asking whether there already is one.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AttachDeckCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies AttachDeckCollectionRequest;

  try {
    const data = await api.attachDeckCollection(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionResponse**](CollectionResponse.md)

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


## chooseUsername

> FormErrorResponseForChooseUsernameErrors chooseUsername(ChooseUsernameRequest)

Finish the username step: create the External Account and log it in

Finish the username step: create the External Account and log it in  Creates the Identity, the External identity and the Account, with the provider\&#39;s verified email, in one transaction. A refused username keeps the login pending, so the person can pick another, also when a concurrent request took it after the check. An email an Account took since the callback ends the pending login.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ChooseUsernameOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ChooseUsernameRequest (optional)
    ChooseUsernameRequest: ...,
  } satisfies ChooseUsernameOperationRequest;

  try {
    const data = await api.chooseUsername(body);
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
| **ChooseUsernameRequest** | [ChooseUsernameRequest](ChooseUsernameRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForChooseUsernameErrors**](FormErrorResponseForChooseUsernameErrors.md)

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


## createCollection

> CollectionResponse createCollection(CreateCollectionRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateCollectionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateCollectionRequest (optional)
    CreateCollectionRequest: ...,
  } satisfies CreateCollectionOperationRequest;

  try {
    const data = await api.createCollection(body);
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
| **CreateCollectionRequest** | [CreateCollectionRequest](CreateCollectionRequest.md) |  | [Optional] |

### Return type

[**CollectionResponse**](CollectionResponse.md)

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


## createDeck

> DeckResponse createDeck(CreateDeckRequest)

Create a deck

Create a deck

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateDeckOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateDeckRequest (optional)
    CreateDeckRequest: ...,
  } satisfies CreateDeckOperationRequest;

  try {
    const data = await api.createDeck(body);
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
| **CreateDeckRequest** | [CreateDeckRequest](CreateDeckRequest.md) |  | [Optional] |

### Return type

[**DeckResponse**](DeckResponse.md)

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


## createDeckFolder

> DeckFolderResponse createDeckFolder(CreateDeckFolderRequest)

Make a folder

Make a folder

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateDeckFolderOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateDeckFolderRequest (optional)
    CreateDeckFolderRequest: ...,
  } satisfies CreateDeckFolderOperationRequest;

  try {
    const data = await api.createDeckFolder(body);
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
| **CreateDeckFolderRequest** | [CreateDeckFolderRequest](CreateDeckFolderRequest.md) |  | [Optional] |

### Return type

[**DeckFolderResponse**](DeckFolderResponse.md)

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


## createDeckTag

> DeckTagResponse createDeckTag(deck, CreateDeckTagRequest)

Create a tag on a deck

Create a tag on a deck  The tag is the owner\&#39;s, whoever creates it. An Editor only creates tags local to this deck: a global one reaches every deck of the owner.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateDeckTagOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CreateDeckTagRequest (optional)
    CreateDeckTagRequest: ...,
  } satisfies CreateDeckTagOperationRequest;

  try {
    const data = await api.createDeckTag(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **CreateDeckTagRequest** | [CreateDeckTagRequest](CreateDeckTagRequest.md) |  | [Optional] |

### Return type

[**DeckTagResponse**](DeckTagResponse.md)

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


## createGlobalTag

> DeckTagResponse createGlobalTag(CreateGlobalTagRequest)

Create a tag that follows a card through every deck and every collection

Create a tag that follows a card through every deck and every collection  The same thing a deck\&#39;s tag manager makes when it is asked for a global tag, reachable without naming a deck: a shelf is worth sorting before the first deck exists.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateGlobalTagOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateGlobalTagRequest (optional)
    CreateGlobalTagRequest: ...,
  } satisfies CreateGlobalTagOperationRequest;

  try {
    const data = await api.createGlobalTag(body);
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
| **CreateGlobalTagRequest** | [CreateGlobalTagRequest](CreateGlobalTagRequest.md) |  | [Optional] |

### Return type

[**DeckTagResponse**](DeckTagResponse.md)

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


## createScannerSession

> ScannerSessionResponse createScannerSession(CreateScannerSessionRequest)

Start a new persisted scanner session

Start a new persisted scanner session

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateScannerSessionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateScannerSessionRequest (optional)
    CreateScannerSessionRequest: ...,
  } satisfies CreateScannerSessionOperationRequest;

  try {
    const data = await api.createScannerSession(body);
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
| **CreateScannerSessionRequest** | [CreateScannerSessionRequest](CreateScannerSessionRequest.md) |  | [Optional] |

### Return type

[**ScannerSessionResponse**](ScannerSessionResponse.md)

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


## createTournament

> CreateTournament200Response createTournament(TournamentSettingsRequest)

Create a Tournament, owned by the logged-in Account

Create a Tournament, owned by the logged-in Account

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // TournamentSettingsRequest (optional)
    TournamentSettingsRequest: ...,
  } satisfies CreateTournamentRequest;

  try {
    const data = await api.createTournament(body);
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
| **TournamentSettingsRequest** | [TournamentSettingsRequest](TournamentSettingsRequest.md) |  | [Optional] |

### Return type

[**CreateTournament200Response**](CreateTournament200Response.md)

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


## createWatchList

> WatchListResponse createWatchList(CreateWatchListRequest)

Start a new watch list

Start a new watch list

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateWatchListOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateWatchListRequest (optional)
    CreateWatchListRequest: ...,
  } satisfies CreateWatchListOperationRequest;

  try {
    const data = await api.createWatchList(body);
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
| **CreateWatchListRequest** | [CreateWatchListRequest](CreateWatchListRequest.md) |  | [Optional] |

### Return type

[**WatchListResponse**](WatchListResponse.md)

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


## declineTournamentHandover

> any declineTournamentHandover(tournament)

Turn down a Tournament offered to the logged-in Account

Turn down a Tournament offered to the logged-in Account  Everything stays as it was, and the offer is gone.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeclineTournamentHandoverRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeclineTournamentHandoverRequest;

  try {
    const data = await api.declineTournamentHandover(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteAccount

> FormErrorResponseForDeleteAccountErrors deleteAccount(DeleteAccountRequest)

Delete the logged-in account

Delete the logged-in account  The account, its passkeys, its collections, its watch lists and every deck it kept to itself are gone for good. What stays are the decks it put on show: those are handed to a tombstone, so a decklist somebody linked to keeps working while nothing points back at the account that built it.  The request has to spell the account\&#39;s own username. It is authenticated either way, so this is not what makes the deletion safe: it is what makes it deliberate.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // DeleteAccountRequest (optional)
    DeleteAccountRequest: ...,
  } satisfies DeleteAccountOperationRequest;

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
| **DeleteAccountRequest** | [DeleteAccountRequest](DeleteAccountRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForDeleteAccountErrors**](FormErrorResponseForDeleteAccountErrors.md)

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


## deleteCollection

> any deleteCollection(collection)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteCollectionRequest;

  try {
    const data = await api.deleteCollection(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteCollectionEntry

> any deleteCollectionEntry(collection, entry)

Remove a stack from a collection

Remove a stack from a collection

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteCollectionEntryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteCollectionEntryRequest;

  try {
    const data = await api.deleteCollectionEntry(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteDeck

> any deleteDeck(deck)

Delete a deck and everything in it

Delete a deck and everything in it

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteDeckRequest;

  try {
    const data = await api.deleteDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteDeckCard

> any deleteDeckCard(deck, card)

Take a card out of a deck

Take a card out of a deck

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteDeckCardRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    card: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteDeckCardRequest;

  try {
    const data = await api.deleteDeckCard(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **card** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteDeckFolder

> any deleteDeckFolder(folder)

Throw a folder away

Throw a folder away  The decks in it are not touched; they turn up among the ones on no shelf. The archive is refused, see [&#x60;update_deck_folder&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteDeckFolderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    folder: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteDeckFolderRequest;

  try {
    const data = await api.deleteDeckFolder(body);
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
| **folder** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteDeckTag

> any deleteDeckTag(deck, tag)

Delete a tag, taking it off every card it sat on

Delete a tag, taking it off every card it sat on  An Editor only deletes a tag local to this deck.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteDeckTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteDeckTagRequest;

  try {
    const data = await api.deleteDeckTag(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteGlobalTag

> any deleteGlobalTag(tag)

Throw a card-wide tag away, taking it off every card it sat on

Throw a card-wide tag away, taking it off every card it sat on

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteGlobalTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteGlobalTagRequest;

  try {
    const data = await api.deleteGlobalTag(body);
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
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


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


## deleteScannerSession

> any deleteScannerSession(session)

Delete a session and its staging area

Delete a session and its staging area

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteScannerSessionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteScannerSessionRequest;

  try {
    const data = await api.deleteScannerSession(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteScannerSessionEntry

> any deleteScannerSessionEntry(session, entry)

Remove a staged stack

Remove a staged stack

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteScannerSessionEntryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteScannerSessionEntryRequest;

  try {
    const data = await api.deleteScannerSessionEntry(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteTournament

> any deleteTournament(tournament)

Delete a Tournament and everything in it, as its Owner

Delete a Tournament and everything in it, as its Owner

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteTournamentRequest;

  try {
    const data = await api.deleteTournament(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteWatchList

> any deleteWatchList(list)

Throw a watch list away, taking every entry on it with it

Throw a watch list away, taking every entry on it with it

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteWatchListRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteWatchListRequest;

  try {
    const data = await api.deleteWatchList(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteWatchListEntry

> any deleteWatchListEntry(list, entry)

Take a card off a watch list

Take a card off a watch list

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteWatchListEntryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteWatchListEntryRequest;

  try {
    const data = await api.deleteWatchListEntry(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## detachDeckCollection

> any detachDeckCollection(deck)

Stop keeping them

Stop keeping them  Refused while cards are still filed in it: they would otherwise leave the account\&#39;s inventory without anybody saying where they went.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DetachDeckCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DetachDeckCollectionRequest;

  try {
    const data = await api.detachDeckCollection(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fileScannerSession

> FileScannerSessionResponse fileScannerSession(session, FileScannerSessionRequest)

Atomically file every staged stack and empty the session

Atomically file every staged stack and empty the session

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FileScannerSessionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // FileScannerSessionRequest (optional)
    FileScannerSessionRequest: ...,
  } satisfies FileScannerSessionOperationRequest;

  try {
    const data = await api.fileScannerSession(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |
| **FileScannerSessionRequest** | [FileScannerSessionRequest](FileScannerSessionRequest.md) |  | [Optional] |

### Return type

[**FileScannerSessionResponse**](FileScannerSessionResponse.md)

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


## fillDeckCollection

> FillDeckCollectionResponse fillDeckCollection(deck, FillDeckCollectionRequest)

Declare that the deck holds what its list asks for

Declare that the deck holds what its list asks for  Two things at once, because they are the same thing at different sizes: the way in for a deck that arrived from somewhere else, where the list is already right and saying so one card at a time would be an afternoon\&#39;s work, and the answer to \&quot;I bought that one\&quot; for a single slot.  The slots are topped up to what they ask for, in the printing and finish they name, as near mint and without an origin: nothing was taken out of a collection, so there is nowhere to put it back. Sorting them into one later is the same return call with a target.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FillDeckCollectionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // FillDeckCollectionRequest (optional)
    FillDeckCollectionRequest: ...,
  } satisfies FillDeckCollectionOperationRequest;

  try {
    const data = await api.fillDeckCollection(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **FillDeckCollectionRequest** | [FillDeckCollectionRequest](FillDeckCollectionRequest.md) |  | [Optional] |

### Return type

[**FillDeckCollectionResponse**](FillDeckCollectionResponse.md)

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

Finish a passkey login  Verifies the browser\&#39;s credential and logs the account in. An account locked since its login started is logged right out again.

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


## finishOidcLogin

> finishOidcLogin(code, error, state)

Finish an OIDC login: the provider sends the browser back here

Finish an OIDC login: the provider sends the browser back here  A known External identity is logged in and lands on the app, unless its Account is locked. An unknown one is held pending and goes to the username step. A refused login goes back to the login page with &#x60;oidc_error&#x60; naming why.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { FinishOidcLoginRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    code: ...,
    // string (optional)
    error: ...,
    // string (optional)
    state: ...,
  } satisfies FinishOidcLoginRequest;

  try {
    const data = await api.finishOidcLogin(body);
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
| **code** | `string` |  | [Optional] [Defaults to `undefined`] |
| **error** | `string` |  | [Optional] [Defaults to `undefined`] |
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
| **303** |  |  -  |
| **307** |  |  -  |
| **308** |  |  -  |
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


## getAllCollections

> Array&lt;CollectionOverviewResponse&gt; getAllCollections()



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllCollectionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllCollections();
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

[**Array&lt;CollectionOverviewResponse&gt;**](CollectionOverviewResponse.md)

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


## getAllDeckFolders

> ListDeckFoldersResponse getAllDeckFolders()

List every folder the account keeps

List every folder the account keeps  The archive is part of the answer whether or not anything was ever put away: a client offering to file a deck needs the shelf to exist before the first deck goes onto it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllDeckFoldersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllDeckFolders();
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

[**ListDeckFoldersResponse**](ListDeckFoldersResponse.md)

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


## getAllDecks

> Array&lt;DeckOverviewResponse&gt; getAllDecks()

The decks an account owns

The decks an account owns

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllDecksRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllDecks();
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

[**Array&lt;DeckOverviewResponse&gt;**](DeckOverviewResponse.md)

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


## getAllGlobalTags

> ListGlobalTagsResponse getAllGlobalTags()

Every tag the account keeps for all of its decks and collections

Every tag the account keeps for all of its decks and collections

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllGlobalTagsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllGlobalTags();
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

[**ListGlobalTagsResponse**](ListGlobalTagsResponse.md)

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


## getAllScannerSessions

> ListScannerSessionsResponse getAllScannerSessions()

List every scanner session and its current staging count

List every scanner session and its current staging count

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllScannerSessionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllScannerSessions();
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

[**ListScannerSessionsResponse**](ListScannerSessionsResponse.md)

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


## getAllWatchLists

> ListWatchListsResponse getAllWatchLists()

Every watch list the account keeps

Every watch list the account keeps

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetAllWatchListsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getAllWatchLists();
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

[**ListWatchListsResponse**](ListWatchListsResponse.md)

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


## getBracketFlags

> BracketFlagsResponse getBracketFlags(BracketFlagsRequest)

Which Commander bracket rules the given printings count towards

Which Commander bracket rules the given printings count towards  What a card would do to a deck\&#39;s Bracket claim, asked before it is added.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetBracketFlagsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // BracketFlagsRequest (optional)
    BracketFlagsRequest: ...,
  } satisfies GetBracketFlagsRequest;

  try {
    const data = await api.getBracketFlags(body);
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
| **BracketFlagsRequest** | [BracketFlagsRequest](BracketFlagsRequest.md) |  | [Optional] |

### Return type

[**BracketFlagsResponse**](BracketFlagsResponse.md)

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


## getCollection

> CollectionResponse getCollection(collection)

Fetch a single collection

Fetch a single collection  Resolves for the owner and for anything public — a page showing one collection should not have to pull the whole list to learn its name.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetCollectionRequest;

  try {
    const data = await api.getCollection(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionResponse**](CollectionResponse.md)

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


## getCollectionStatistics

> CollectionStatisticsResponse getCollectionStatistics(collection)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetCollectionStatisticsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetCollectionStatisticsRequest;

  try {
    const data = await api.getCollectionStatistics(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionStatisticsResponse**](CollectionStatisticsResponse.md)

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


## getDeck

> DeckResponse getDeck(deck)

Fetch a single deck, with the caller\&#39;s role on it

Fetch a single deck, with the caller\&#39;s role on it  Only the owner gets its share link and folder.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDeckRequest;

  try {
    const data = await api.getDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckResponse**](DeckResponse.md)

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


## getDeckAdvisorSettings

> AdvisorSettingsResponse getDeckAdvisorSettings(deck)

Read this deck\&#39;s advisor settings

Read this deck\&#39;s advisor settings  A deck nobody has advised yet still answers: the document at its defaults, not a 404. The 404 is reserved for a deck this account may not edit.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckAdvisorSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDeckAdvisorSettingsRequest;

  try {
    const data = await api.getDeckAdvisorSettings(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**AdvisorSettingsResponse**](AdvisorSettingsResponse.md)

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


## getDeckCollectionDrift

> DeckDriftResponse getDeckCollectionDrift(deck)

Where the deck list and the deck\&#39;s own collection disagree

Where the deck list and the deck\&#39;s own collection disagree  Read on its own rather than out of the sourcing answer: the header asks this on every tab of the deck, and it has no use for the whole account\&#39;s shelf.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckCollectionDriftRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDeckCollectionDriftRequest;

  try {
    const data = await api.getDeckCollectionDrift(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckDriftResponse**](DeckDriftResponse.md)

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


## getDeckFormats

> ListFormatsResponse getDeckFormats()

What the offered formats ask of a deck

What the offered formats ask of a deck  Construction rules only: size, copies, commander, sideboard. Whether a card is legal is answered per card by the catalog — except for the bans that apply to a zone rather than to a deck, which a printing row cannot carry and which ride along here instead.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckFormatsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getDeckFormats();
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

[**ListFormatsResponse**](ListFormatsResponse.md)

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


## getDeckHistory

> DeckHistoryResponse getDeckHistory(deck, after, limit)

A deck\&#39;s Deck history, newest first

A deck\&#39;s Deck history, newest first  Only the owner reads it, whoever else may see the deck itself.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    after: ...,
    // number (optional)
    limit: 56,
  } satisfies GetDeckHistoryRequest;

  try {
    const data = await api.getDeckHistory(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**DeckHistoryResponse**](DeckHistoryResponse.md)

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


## getDeckPoint

> DeckPointResponse getDeckPoint(deck, change)

The deck as it was right after one of its Deck changes, read-only

The deck as it was right after one of its Deck changes, read-only  Only the owner reads it. Computed backwards from the deck as it is now.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckPointRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    change: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDeckPointRequest;

  try {
    const data = await api.getDeckPoint(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **change** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckPointResponse**](DeckPointResponse.md)

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


## getDeckSourcing

> DeckSourcingResponse getDeckSourcing(deck)

What the deck asks for, what is in it, and where the rest could come from

What the deck asks for, what is in it, and where the rest could come from

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDeckSourcingRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetDeckSourcingRequest;

  try {
    const data = await api.getDeckSourcing(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckSourcingResponse**](DeckSourcingResponse.md)

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


## getDecksSharedWithMe

> ListSharedWithMeResponse getDecksSharedWithMe()

The decks other Accounts named the caller on, alphabetically by name

The decks other Accounts named the caller on, alphabetically by name  \&quot;Shared with me\&quot;: never filed into the caller\&#39;s folders, which hold only the caller\&#39;s own decks.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetDecksSharedWithMeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getDecksSharedWithMe();
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

[**ListSharedWithMeResponse**](ListSharedWithMeResponse.md)

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


## getMpcfillCardbacks

> MpcFillCardbacksResponse getMpcfillCardbacks()

The card backs MPCFill offers

The card backs MPCFill offers  An order names one back for every card that does not bring its own, so this is the list that choice is made from. The same for everybody, so it is fetched once and held for a few hours.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetMpcfillCardbacksRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getMpcfillCardbacks();
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

[**MpcFillCardbacksResponse**](MpcFillCardbacksResponse.md)

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


## getMyTournaments

> MyTournamentsResponse getMyTournaments()

The Tournaments the logged-in Account organizes and the ones it plays in

The Tournaments the logged-in Account organizes and the ones it plays in  Private and unlisted ones included: the Account has its part in each.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetMyTournamentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getMyTournaments();
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

[**MyTournamentsResponse**](MyTournamentsResponse.md)

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


## getPendingOidcLogin

> GetPendingOidcLoginResponse getPendingOidcLogin()

The session\&#39;s OIDC login waiting for its username step

The session\&#39;s OIDC login waiting for its username step

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPendingOidcLoginRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getPendingOidcLogin();
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

[**GetPendingOidcLoginResponse**](GetPendingOidcLoginResponse.md)

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


## getPriceHistory

> PriceHistoryResponse getPriceHistory(printing)

What a card has cost over time

What a card has cost over time  Read from Cardmarket\&#39;s daily price guide, keyed by the product the printing is sold as. Daily for the last quarter, weekly before that — see &#x60;models::price&#x60;.  An empty list is the honest answer for a card the guide does not carry and for one whose first day has not been read yet. Nothing here is per language: Cardmarket sells every language of a card as the one product.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPriceHistoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    printing: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetPriceHistoryRequest;

  try {
    const data = await api.getPriceHistory(body);
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
| **printing** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PriceHistoryResponse**](PriceHistoryResponse.md)

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


## getPrintingLanguages

> PrintingLanguagesResponse getPrintingLanguages(printing)

Every language the same card exists in

Every language the same card exists in  A printing is one language, so this is what a card\&#39;s language is changed through: pick the sibling and point the stack at it. Nothing is fetched from Scryfall for this — the catalog already holds every language of every printing, prices included (see &#x60;Printing::inherit_from_english&#x60;).  An empty list is the honest answer for a printing the catalog does not know.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPrintingLanguagesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    printing: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetPrintingLanguagesRequest;

  try {
    const data = await api.getPrintingLanguages(body);
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
| **printing** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PrintingLanguagesResponse**](PrintingLanguagesResponse.md)

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


## getPublicCollection

> PublicCollectionResponse getPublicCollection(collection)

Fetch one collection its owner put on show

Fetch one collection its owner put on show

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPublicCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetPublicCollectionRequest;

  try {
    const data = await api.getPublicCollection(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PublicCollectionResponse**](PublicCollectionResponse.md)

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


## getPublicCollectionStatistics

> CollectionStatisticsResponse getPublicCollectionStatistics(collection)

Count a public collection\&#39;s statistics

Count a public collection\&#39;s statistics  Minus the purchase figures, see [&#x60;redact_statistics&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPublicCollectionStatisticsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetPublicCollectionStatisticsRequest;

  try {
    const data = await api.getPublicCollectionStatistics(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionStatisticsResponse**](CollectionStatisticsResponse.md)

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


## getPublicDeck

> PublicDeckResponse getPublicDeck(deck)

Fetch one deck its owner put on show

Fetch one deck its owner put on show

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPublicDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetPublicDeckRequest;

  try {
    const data = await api.getPublicDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PublicDeckResponse**](PublicDeckResponse.md)

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


## getPublicProfile

> PublicProfileResponse getPublicProfile(username)

Fetch an account\&#39;s public profile: what it put on show

Fetch an account\&#39;s public profile: what it put on show

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetPublicProfileRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    username: username_example,
  } satisfies GetPublicProfileRequest;

  try {
    const data = await api.getPublicProfile(body);
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
| **username** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PublicProfileResponse**](PublicProfileResponse.md)

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


## getScannerSession

> ScannerSessionDetailResponse getScannerSession(session)

Read one session from any signed-in device

Read one session from any signed-in device

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetScannerSessionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetScannerSessionRequest;

  try {
    const data = await api.getScannerSession(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ScannerSessionDetailResponse**](ScannerSessionDetailResponse.md)

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


## getSharedCollection

> SharedCollectionResponse getSharedCollection(token)

Fetch the collection a share link points at

Fetch the collection a share link points at

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetSharedCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies GetSharedCollectionRequest;

  try {
    const data = await api.getSharedCollection(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SharedCollectionResponse**](SharedCollectionResponse.md)

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


## getSharedCollectionStatistics

> CollectionStatisticsResponse getSharedCollectionStatistics(token)

Count a shared collection\&#39;s statistics

Count a shared collection\&#39;s statistics  Minus the purchase figures, see [&#x60;redact_statistics&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetSharedCollectionStatisticsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies GetSharedCollectionStatisticsRequest;

  try {
    const data = await api.getSharedCollectionStatistics(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionStatisticsResponse**](CollectionStatisticsResponse.md)

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


## getSharedDeck

> SharedDeckResponse getSharedDeck(token)

Fetch the deck a share link points at

Fetch the deck a share link points at

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetSharedDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies GetSharedDeckRequest;

  try {
    const data = await api.getSharedDeck(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SharedDeckResponse**](SharedDeckResponse.md)

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


## getSharedTournament

> TournamentResponse getSharedTournament(token)

Fetch the Tournament a share link points at

Fetch the Tournament a share link points at  As anybody without a part in running it sees it: the link is the authorization, not the reader, so even an Organizer gets no share link back.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetSharedTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies GetSharedTournamentRequest;

  try {
    const data = await api.getSharedTournament(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TournamentResponse**](TournamentResponse.md)

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


## getTournament

> TournamentResponse getTournament(tournament)

Fetch a Tournament by its id

Fetch a Tournament by its id  Anybody gets a public one; its Organizers get it whatever its Visibility. An unlisted one is read through its share link, see &#x60;get_shared_tournament&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetTournamentRequest;

  try {
    const data = await api.getTournament(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TournamentResponse**](TournamentResponse.md)

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


## getTournamentHandovers

> ListTournamentsResponse getTournamentHandovers()

The Tournaments offered to the logged-in Account to take over, latest start first

The Tournaments offered to the logged-in Account to take over, latest start first

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetTournamentHandoversRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getTournamentHandovers();
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

[**ListTournamentsResponse**](ListTournamentsResponse.md)

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


## getWatchList

> WatchListResponse getWatchList(list)

One watch list, without what is on it

One watch list, without what is on it

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetWatchListRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetWatchListRequest;

  try {
    const data = await api.getWatchList(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WatchListResponse**](WatchListResponse.md)

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


## getWatchListAlarms

> ListWatchListAlarmsResponse getWatchListAlarms()

Every alarm standing across the account\&#39;s watch lists

Every alarm standing across the account\&#39;s watch lists  What the navigation badge is drawn from, which is why it is reachable without naming a list: the point of an alarm is to be seen from wherever the reader happens to be.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetWatchListAlarmsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getWatchListAlarms();
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

[**ListWatchListAlarmsResponse**](ListWatchListAlarmsResponse.md)

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


## importDeckCards

> ImportDeckCardsResponse importDeckCards(deck, ImportDeckCardsRequest)

Write a whole decklist into a deck

Write a whole decklist into a deck  One transaction for the lot: a pasted list either lands or it does not.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ImportDeckCardsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ImportDeckCardsRequest (optional)
    ImportDeckCardsRequest: ...,
  } satisfies ImportDeckCardsOperationRequest;

  try {
    const data = await api.importDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **ImportDeckCardsRequest** | [ImportDeckCardsRequest](ImportDeckCardsRequest.md) |  | [Optional] |

### Return type

[**ImportDeckCardsResponse**](ImportDeckCardsResponse.md)

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


## leaveDeck

> any leaveDeck(deck)

Take oneself off a deck another Account named one on

Take oneself off a deck another Account named one on  The deck leaves \&quot;Shared with me\&quot; and its access ends with the next request. Its owner cannot leave it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LeaveDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies LeaveDeckRequest;

  try {
    const data = await api.leaveDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listCollectionCards

> ListCardsResponse listCollectionCards(collection, after, condition, descending, finish, limit, offset, printing, rarity, search, sort)

List a page of a collection\&#39;s cards, sorted and filtered

List a page of a collection\&#39;s cards, sorted and filtered  The endpoint the card list is meant to be read through. Everything comes out of one query joined against the catalog, so a page costs one request and the client resolves nothing against Scryfall.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListCollectionCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    after: ...,
    // CardCondition (optional)
    condition: ...,
    // boolean (optional)
    descending: true,
    // CardFinish (optional)
    finish: ...,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    printing: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CardRarity (optional)
    rarity: ...,
    // string (optional)
    search: search_example,
    // EntrySort (optional)
    sort: ...,
  } satisfies ListCollectionCardsRequest;

  try {
    const data = await api.listCollectionCards(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **condition** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Mint, NearMint, Excellent, Good, LightPlayed, Played, Poor] |
| **descending** | `boolean` |  | [Optional] [Defaults to `false`] |
| **finish** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Nonfoil, Foil, Etched] |
| **limit** | `number` |  | [Optional] [Defaults to `60`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |
| **printing** | `string` |  | [Optional] [Defaults to `undefined`] |
| **rarity** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Common, Uncommon, Rare, Mythic, Special, Bonus] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |
| **sort** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: filed, name, set, rarity, mana_value, unit_price, stack_value, quantity, condition] |

### Return type

[**ListCardsResponse**](ListCardsResponse.md)

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


## listCollectionEntries

> ListCollectionEntriesResponse listCollectionEntries(collection)

List every stack filed in a collection

List every stack filed in a collection  Superseded by [&#x60;list_collection_cards&#x60;], which pages and carries the card data with it. Kept while the import dialog still reads the whole collection to work out what it would be topping up.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListCollectionEntriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListCollectionEntriesRequest;

  try {
    const data = await api.listCollectionEntries(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListCollectionEntriesResponse**](ListCollectionEntriesResponse.md)

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


## listCollectionOnLoan

> ListOnLoanResponse listCollectionOnLoan(collection)

Count a collection\&#39;s statistics

Count a collection\&#39;s statistics  Everything the statistics tab draws, from one query joined against the catalog — the client fetches this single object instead of every entry and every card behind it. All money is euro cents, all counts are copies. What this collection has lent out to decks  Cards that moved into a deck are no longer rows of the collection, so a list of it would quietly be missing them. This is the other half of the shelf: what is out, and which deck it is in.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListCollectionOnLoanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListCollectionOnLoanRequest;

  try {
    const data = await api.listCollectionOnLoan(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListOnLoanResponse**](ListOnLoanResponse.md)

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


## listDeckCards

> ListDeckCardsResponse listDeckCards(deck)

Every card of a deck, with the catalog data and the tags on it

Every card of a deck, with the catalog data and the tags on it  The whole deck in one answer: a hundred slots are not worth paging, and the client groups and sorts them however the list is being looked at. A Collaborator gets it the way the Share link shows it, see [&#x60;redact_slot&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListDeckCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListDeckCardsRequest;

  try {
    const data = await api.listDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListDeckCardsResponse**](ListDeckCardsResponse.md)

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


## listDeckCollaborators

> ListDeckCollaboratorsResponse listDeckCollaborators(deck)

The owner and the Collaborators of a deck, the latter alphabetically by username

The owner and the Collaborators of a deck, the latter alphabetically by username  The owner and every Collaborator read it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListDeckCollaboratorsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListDeckCollaboratorsRequest;

  try {
    const data = await api.listDeckCollaborators(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListDeckCollaboratorsResponse**](ListDeckCollaboratorsResponse.md)

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


## listOpenidProviders

> ListOpenIdProvidersResponse listOpenidProviders()

List the OpenID providers people may log in through

List the OpenID providers people may log in through  Empty while no provider is configured; the frontend then shows no button.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListOpenidProvidersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listOpenidProviders();
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

[**ListOpenIdProvidersResponse**](ListOpenIdProvidersResponse.md)

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


## listPublicCollectionCards

> ListCardsResponse listPublicCollectionCards(collection, after, condition, descending, finish, limit, offset, printing, rarity, search, sort)

List a page of a public collection\&#39;s cards, sorted and filtered

List a page of a public collection\&#39;s cards, sorted and filtered  The listing the owner reads, minus what was paid, see [&#x60;redact_entry&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListPublicCollectionCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    after: ...,
    // CardCondition (optional)
    condition: ...,
    // boolean (optional)
    descending: true,
    // CardFinish (optional)
    finish: ...,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    printing: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CardRarity (optional)
    rarity: ...,
    // string (optional)
    search: search_example,
    // EntrySort (optional)
    sort: ...,
  } satisfies ListPublicCollectionCardsRequest;

  try {
    const data = await api.listPublicCollectionCards(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **condition** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Mint, NearMint, Excellent, Good, LightPlayed, Played, Poor] |
| **descending** | `boolean` |  | [Optional] [Defaults to `false`] |
| **finish** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Nonfoil, Foil, Etched] |
| **limit** | `number` |  | [Optional] [Defaults to `60`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |
| **printing** | `string` |  | [Optional] [Defaults to `undefined`] |
| **rarity** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Common, Uncommon, Rare, Mythic, Special, Bonus] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |
| **sort** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: filed, name, set, rarity, mana_value, unit_price, stack_value, quantity, condition] |

### Return type

[**ListCardsResponse**](ListCardsResponse.md)

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


## listPublicDeckCards

> ListDeckCardsResponse listPublicDeckCards(deck)

Every card of a public deck, with the catalog data and the tags on it

Every card of a public deck, with the catalog data and the tags on it  The listing the owner reads, minus the proxy flags, see [&#x60;redact_slot&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListPublicDeckCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListPublicDeckCardsRequest;

  try {
    const data = await api.listPublicDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListDeckCardsResponse**](ListDeckCardsResponse.md)

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


## listPublicTournaments

> ListTournamentsResponse listPublicTournaments(format, location, timeframe)

The public Tournaments, narrowed down by the filters given

The public Tournaments, narrowed down by the filters given  Upcoming ones come soonest first, past and unfiltered ones latest first.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListPublicTournamentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    format: ...,
    // string (optional)
    location: ...,
    // Timeframe (optional)
    timeframe: ...,
  } satisfies ListPublicTournamentsRequest;

  try {
    const data = await api.listPublicTournaments(body);
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
| **format** | `string` |  | [Optional] [Defaults to `undefined`] |
| **location** | `string` |  | [Optional] [Defaults to `undefined`] |
| **timeframe** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Upcoming, Past] |

### Return type

[**ListTournamentsResponse**](ListTournamentsResponse.md)

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


## listSharedCollectionCards

> ListCardsResponse listSharedCollectionCards(token, after, condition, descending, finish, limit, offset, printing, rarity, search, sort)

List a page of a shared collection\&#39;s cards, sorted and filtered

List a page of a shared collection\&#39;s cards, sorted and filtered  The listing the owner reads, minus what was paid, see [&#x60;redact_entry&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListSharedCollectionCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
    // string (optional)
    after: ...,
    // CardCondition (optional)
    condition: ...,
    // boolean (optional)
    descending: true,
    // CardFinish (optional)
    finish: ...,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    printing: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CardRarity (optional)
    rarity: ...,
    // string (optional)
    search: search_example,
    // EntrySort (optional)
    sort: ...,
  } satisfies ListSharedCollectionCardsRequest;

  try {
    const data = await api.listSharedCollectionCards(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |
| **after** | `string` |  | [Optional] [Defaults to `undefined`] |
| **condition** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Mint, NearMint, Excellent, Good, LightPlayed, Played, Poor] |
| **descending** | `boolean` |  | [Optional] [Defaults to `false`] |
| **finish** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Nonfoil, Foil, Etched] |
| **limit** | `number` |  | [Optional] [Defaults to `60`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |
| **printing** | `string` |  | [Optional] [Defaults to `undefined`] |
| **rarity** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Common, Uncommon, Rare, Mythic, Special, Bonus] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |
| **sort** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: filed, name, set, rarity, mana_value, unit_price, stack_value, quantity, condition] |

### Return type

[**ListCardsResponse**](ListCardsResponse.md)

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


## listSharedDeckCards

> ListDeckCardsResponse listSharedDeckCards(token)

Every card of a shared deck, with the catalog data and the tags on it

Every card of a shared deck, with the catalog data and the tags on it  The listing the owner reads, minus the proxy flags, see [&#x60;redact_slot&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListSharedDeckCardsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies ListSharedDeckCardsRequest;

  try {
    const data = await api.listSharedDeckCards(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListDeckCardsResponse**](ListDeckCardsResponse.md)

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


## listSharedTournamentParticipants

> ListParticipantsResponse listSharedTournamentParticipants(token)

The Participants of the Tournament a share link points at

The Participants of the Tournament a share link points at  Says which of them is the reader, if any.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListSharedTournamentParticipantsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies ListSharedTournamentParticipantsRequest;

  try {
    const data = await api.listSharedTournamentParticipants(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListParticipantsResponse**](ListParticipantsResponse.md)

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


## listTournamentOrganizers

> ListOrganizersResponse listTournamentOrganizers(tournament)

Who runs a Tournament, and whom its Owner offered it to

Who runs a Tournament, and whom its Owner offered it to  Every Organizer reads it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentOrganizersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListTournamentOrganizersRequest;

  try {
    const data = await api.listTournamentOrganizers(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListOrganizersResponse**](ListOrganizersResponse.md)

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


## listTournamentParticipants

> ListParticipantsResponse listTournamentParticipants(tournament)

The Participants of a Tournament the reader may see

The Participants of a Tournament the reader may see  Says which of them is the reader, if any.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentParticipantsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListTournamentParticipantsRequest;

  try {
    const data = await api.listTournamentParticipants(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListParticipantsResponse**](ListParticipantsResponse.md)

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


## listWatchListCopies

> ListWatchListCopiesResponse listWatchListCopies(list, entry)

Where the copies of one watched card are

Where the copies of one watched card are  Fetched when a row is opened rather than with the list: most rows are never opened, and a shelf of full collections is a lot of stacks to send along on the chance that one of them is.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListWatchListCopiesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListWatchListCopiesRequest;

  try {
    const data = await api.listWatchListCopies(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListWatchListCopiesResponse**](ListWatchListCopiesResponse.md)

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


## listWatchListEntries

> ListWatchListEntriesResponse listWatchListEntries(list)

Everything one watch list page is drawn from

Everything one watch list page is drawn from  The catalog data, the stock counts and the alarm state in one request: the counting follows each entry\&#39;s own switches, so it is the database that does it and the client is handed numbers rather than the whole shelf.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListWatchListEntriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListWatchListEntriesRequest;

  try {
    const data = await api.listWatchListEntries(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListWatchListEntriesResponse**](ListWatchListEntriesResponse.md)

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

> Me200Response me()

The account the current session belongs to

The account the current session belongs to  The one route a locked Account\&#39;s session still reaches: it answers with the &#x60;locked&#x60; flag, never the Lock reason, and logs the session out.

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

[**Me200Response**](Me200Response.md)

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


## mergeCollectionEntries

> CollectionEntryResponse mergeCollectionEntries(collection, MergeCollectionEntriesRequest)

Combine stacks of the same cards into one

Combine stacks of the same cards into one  The oldest of them survives and takes over the copies, the averaged purchase price and the earliest acquisition date.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { MergeCollectionEntriesOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // MergeCollectionEntriesRequest (optional)
    MergeCollectionEntriesRequest: ...,
  } satisfies MergeCollectionEntriesOperationRequest;

  try {
    const data = await api.mergeCollectionEntries(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **MergeCollectionEntriesRequest** | [MergeCollectionEntriesRequest](MergeCollectionEntriesRequest.md) |  | [Optional] |

### Return type

[**CollectionEntryResponse**](CollectionEntryResponse.md)

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


## offerTournamentHandover

> OfferTournamentHandover200Response offerTournamentHandover(tournament, NameAccountRequest)

Offer a Tournament to an Account by its username, as its Owner

Offer a Tournament to an Account by its username, as its Owner  Replaces a pending offer. Nothing changes until the Account accepts. Unknown usernames are capped per caller, see [&#x60;UNKNOWN_USERNAMES&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { OfferTournamentHandoverRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // NameAccountRequest (optional)
    NameAccountRequest: ...,
  } satisfies OfferTournamentHandoverRequest;

  try {
    const data = await api.offerTournamentHandover(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **NameAccountRequest** | [NameAccountRequest](NameAccountRequest.md) |  | [Optional] |

### Return type

[**OfferTournamentHandover200Response**](OfferTournamentHandover200Response.md)

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


## putDeckCollaborator

> PutDeckCollaborator200Response putDeckCollaborator(deck, PutDeckCollaboratorRequest)

Name an Account on a deck by its username, or change the level it is named at

Name an Account on a deck by its username, or change the level it is named at  Naming an Account that is already on the deck changes its level, so it is on the deck once. The owner and the Tombstone cannot be named.  Unknown usernames are capped per caller, see [&#x60;UNKNOWN_USERNAMES&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PutDeckCollaboratorOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // PutDeckCollaboratorRequest (optional)
    PutDeckCollaboratorRequest: ...,
  } satisfies PutDeckCollaboratorOperationRequest;

  try {
    const data = await api.putDeckCollaborator(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **PutDeckCollaboratorRequest** | [PutDeckCollaboratorRequest](PutDeckCollaboratorRequest.md) |  | [Optional] |

### Return type

[**PutDeckCollaborator200Response**](PutDeckCollaborator200Response.md)

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


## readDeckUrl

> ReadDeckUrlResponse readDeckUrl(ReadDeckUrlRequest)

Read a decklist off a link to another builder, or off one of our own links

Read a decklist off a link to another builder, or off one of our own links  Only the sites this knows are fetched, and only through a url composed here from the deck\&#39;s id — the link is read, never followed. A link to this instance is not fetched at all: it is resolved against the database, which is what lets a deck come back with the print of every card.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ReadDeckUrlOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ReadDeckUrlRequest (optional)
    ReadDeckUrlRequest: ...,
  } satisfies ReadDeckUrlOperationRequest;

  try {
    const data = await api.readDeckUrl(body);
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
| **ReadDeckUrlRequest** | [ReadDeckUrlRequest](ReadDeckUrlRequest.md) |  | [Optional] |

### Return type

[**ReadDeckUrlResponse**](ReadDeckUrlResponse.md)

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


## recoverAccount

> any recoverAccount(RecoverAccountRequest)

Send a fresh registration link to an account\&#39;s stored address

Send a fresh registration link to an account\&#39;s stored address  The \&quot;lost passkey\&quot; flow: a new device has no passkey, so the login form offers this instead of a dead end. Registering over the link only *adds* a passkey — the existing ones keep working until their owner removes them.  Always answers &#x60;200&#x60;, whether or not the username exists — the response must not be usable to probe which usernames are registered. The link is only ever sent to the address stored on the account, never to one from the request, so this endpoint cannot be used to mail a third party. A locked account gets no link either, and only a Local Account gets one at all, including one not enrolled yet whose invite mail got lost; the answer is the same &#x60;200&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RecoverAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // RecoverAccountRequest (optional)
    RecoverAccountRequest: ...,
  } satisfies RecoverAccountOperationRequest;

  try {
    const data = await api.recoverAccount(body);
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
| **RecoverAccountRequest** | [RecoverAccountRequest](RecoverAccountRequest.md) |  | [Optional] |

### Return type

**any**

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


## redoDeckChange

> DeckUndoResponse redoDeckChange(deck)

Apply the latest undone Deck change again

Apply the latest undone Deck change again  Only the owner redoes. Refused when nothing is undone or a later Deck change discarded the undo.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RedoDeckChangeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RedoDeckChangeRequest;

  try {
    const data = await api.redoDeckChange(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckUndoResponse**](DeckUndoResponse.md)

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


## removeDeckCheckpoint

> any removeDeckCheckpoint(deck, change)

Remove the Deck checkpoint of one of the deck\&#39;s Deck changes

Remove the Deck checkpoint of one of the deck\&#39;s Deck changes  Only the owner removes. A Deck change without one stays as it is.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RemoveDeckCheckpointRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    change: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RemoveDeckCheckpointRequest;

  try {
    const data = await api.removeDeckCheckpoint(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **change** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## removeDeckCollaborator

> any removeDeckCollaborator(deck, account)

Take an Account off a deck

Take an Account off a deck  It loses its access with the next request it makes.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RemoveDeckCollaboratorRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    account: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RemoveDeckCollaboratorRequest;

  try {
    const data = await api.removeDeckCollaborator(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **account** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## removeTournamentCoOrganizer

> any removeTournamentCoOrganizer(tournament, account)

Take a Co-organizer off a Tournament

Take a Co-organizer off a Tournament  The Owner takes off any Co-organizer, a Co-organizer only itself.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RemoveTournamentCoOrganizerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    account: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RemoveTournamentCoOrganizerRequest;

  try {
    const data = await api.removeTournamentCoOrganizer(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **account** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## removeTournamentParticipant

> any removeTournamentParticipant(tournament, participant)

Take a Participant out of a Tournament, as an Organizer

Take a Participant out of a Tournament, as an Organizer  Only before the first Round starts; afterwards a Participant leaves by a Drop.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RemoveTournamentParticipantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RemoveTournamentParticipantRequest;

  try {
    const data = await api.removeTournamentParticipant(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **participant** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## renameAccount

> RenameAccount200Response renameAccount(RenameAccountRequest)

Rename the logged-in account

Rename the logged-in account  The old username is free for anybody right away, and its profile link stops working. The session stays: it belongs to the account\&#39;s identity, not its name.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RenameAccountOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // RenameAccountRequest (optional)
    RenameAccountRequest: ...,
  } satisfies RenameAccountOperationRequest;

  try {
    const data = await api.renameAccount(body);
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
| **RenameAccountRequest** | [RenameAccountRequest](RenameAccountRequest.md) |  | [Optional] |

### Return type

[**RenameAccount200Response**](RenameAccount200Response.md)

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


## renamePasskey

> FormErrorResponseForRenamePasskeyErrors renamePasskey(uuid, RenamePasskeyRequest)

Rename one of the logged-in account\&#39;s passkeys

Rename one of the logged-in account\&#39;s passkeys

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RenamePasskeyOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    uuid: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // RenamePasskeyRequest (optional)
    RenamePasskeyRequest: ...,
  } satisfies RenamePasskeyOperationRequest;

  try {
    const data = await api.renamePasskey(body);
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
| **RenamePasskeyRequest** | [RenamePasskeyRequest](RenamePasskeyRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForRenamePasskeyErrors**](FormErrorResponseForRenamePasskeyErrors.md)

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


## resetDeck

> DeckUndoResponse resetDeck(deck, change)

Bring the deck back to how it was right after one of its Deck changes

Bring the deck back to how it was right after one of its Deck changes  Only the owner resets. Recorded as one Deck change of its own, which can be undone; the Deck changes since stay in the Deck history.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResetDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    change: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ResetDeckRequest;

  try {
    const data = await api.resetDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **change** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckUndoResponse**](DeckUndoResponse.md)

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


## resolvePrintings

> ResolvePrintingsResponse resolvePrintings(ResolvePrintingsRequest)

Place cards in the catalog

Place cards in the catalog  Takes the rows of an imported collection as the exporter wrote them — an id, a set and a collector number, or a bare name — and answers with the printing each names. Every answer carries the position of the lookup it belongs to; a lookup nothing names is one the catalog holds no card for.  This is the catalog the collection listing and the statistics are already answered from, so nothing can be filed here that those cannot read back.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ResolvePrintingsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ResolvePrintingsRequest (optional)
    ResolvePrintingsRequest: ...,
  } satisfies ResolvePrintingsOperationRequest;

  try {
    const data = await api.resolvePrintings(body);
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
| **ResolvePrintingsRequest** | [ResolvePrintingsRequest](ResolvePrintingsRequest.md) |  | [Optional] |

### Return type

[**ResolvePrintingsResponse**](ResolvePrintingsResponse.md)

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


## returnAllDeckCards

> ReturnAllDeckCardsResponse returnAllDeckCards(deck, ReturnAllDeckCardsRequest)

Sort everything in the deck back where it came from

Sort everything in the deck back where it came from  This is what taking a deck apart does. Stacks that remember no origin only move when the client says where they should go; otherwise they stay, and the answer says how many that was.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ReturnAllDeckCardsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ReturnAllDeckCardsRequest (optional)
    ReturnAllDeckCardsRequest: ...,
  } satisfies ReturnAllDeckCardsOperationRequest;

  try {
    const data = await api.returnAllDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **ReturnAllDeckCardsRequest** | [ReturnAllDeckCardsRequest](ReturnAllDeckCardsRequest.md) |  | [Optional] |

### Return type

[**ReturnAllDeckCardsResponse**](ReturnAllDeckCardsResponse.md)

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


## returnDeckCards

> any returnDeckCards(deck, ReturnDeckCardsRequest)

Sort copies out of the deck back into a collection

Sort copies out of the deck back into a collection

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ReturnDeckCardsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ReturnDeckCardsRequest (optional)
    ReturnDeckCardsRequest: ...,
  } satisfies ReturnDeckCardsOperationRequest;

  try {
    const data = await api.returnDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **ReturnDeckCardsRequest** | [ReturnDeckCardsRequest](ReturnDeckCardsRequest.md) |  | [Optional] |

### Return type

**any**

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


## rotateDeckShareToken

> RotateDeckShareTokenResponse rotateDeckShareToken(deck)

Mint a fresh secret for a deck\&#39;s share link

Mint a fresh secret for a deck\&#39;s share link

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RotateDeckShareTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RotateDeckShareTokenRequest;

  try {
    const data = await api.rotateDeckShareToken(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RotateDeckShareTokenResponse**](RotateDeckShareTokenResponse.md)

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


## rotateShareToken

> RotateShareTokenResponse rotateShareToken(collection)

Mint a fresh secret for a collection\&#39;s share link

Mint a fresh secret for a collection\&#39;s share link  Invalidates every link handed out so far. Does not change the visibility — a token only resolves while the collection is &#x60;Unlisted&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RotateShareTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RotateShareTokenRequest;

  try {
    const data = await api.rotateShareToken(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RotateShareTokenResponse**](RotateShareTokenResponse.md)

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


## searchCollaboratorCandidates

> CollaboratorCandidatesResponse searchCollaboratorCandidates(deck, query)

Accounts whose username starts with what the owner typed, to name on a deck

Accounts whose username starts with what the owner typed, to name on a deck  Answers with up to ten Accounts, the caller among them if it matches, alphabetically by username. Fewer than two characters search nothing. Searches are capped per caller, see [&#x60;CANDIDATE_SEARCHES&#x60;]; past the cap the answer is empty and says so.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SearchCollaboratorCandidatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    query: ...,
  } satisfies SearchCollaboratorCandidatesRequest;

  try {
    const data = await api.searchCollaboratorCandidates(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **query** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**CollaboratorCandidatesResponse**](CollaboratorCandidatesResponse.md)

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


## searchMpcfillArt

> MpcFillSearchResponse searchMpcfillArt(MpcFillSearchRequest)

The art MPCFill has for these cards

The art MPCFill has for these cards  One list per name, in the order they were asked, each in the order MPCFill ranks it. Every image carries the Google Drive id an order xml names it by, plus the thumbnails to show it with, so a client can put the art in front of a reader and write the order they pick.  Proxied rather than asked from the browser: MPCFill answers cross-origin requests for their own site only. The answers are cached for a few hours per name, so picking through a deck card by card is one request per card at worst, not one per click.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SearchMpcfillArtRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // MpcFillSearchRequest (optional)
    MpcFillSearchRequest: ...,
  } satisfies SearchMpcfillArtRequest;

  try {
    const data = await api.searchMpcfillArt(body);
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
| **MpcFillSearchRequest** | [MpcFillSearchRequest](MpcFillSearchRequest.md) |  | [Optional] |

### Return type

[**MpcFillSearchResponse**](MpcFillSearchResponse.md)

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


## searchPublicDecks

> SearchPublicDecksResponse searchPublicDecks(bracket, descending, format, limit, offset, owner, search, sort)

Search the decks their owners put on show

Search the decks their owners put on show  By what a deck or its commander is called, by format, by the Commander bracket it claims, or by who built it. Only decks at [&#x60;Visibility::Public&#x60;] are ever found here — an unlisted deck stays behind its share link.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SearchPublicDecksRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // number (optional)
    bracket: 56,
    // boolean (optional)
    descending: true,
    // string (optional)
    format: format_example,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
    // string (optional)
    owner: owner_example,
    // string (optional)
    search: search_example,
    // PublicDeckSort (optional)
    sort: ...,
  } satisfies SearchPublicDecksRequest;

  try {
    const data = await api.searchPublicDecks(body);
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
| **bracket** | `number` |  | [Optional] [Defaults to `undefined`] |
| **descending** | `boolean` |  | [Optional] [Defaults to `false`] |
| **format** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `24`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |
| **owner** | `string` |  | [Optional] [Defaults to `undefined`] |
| **search** | `string` |  | [Optional] [Defaults to `undefined`] |
| **sort** | [](.md) |  | [Optional] [Defaults to `undefined`] [Enum: Created, Name, Cards, Price] |

### Return type

[**SearchPublicDecksResponse**](SearchPublicDecksResponse.md)

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


## searchTournamentPlayers

> PlayerCandidatesResponse searchTournamentPlayers(tournament, query)

Accounts whose username starts with what an Organizer typed, to add as Participants

Accounts whose username starts with what an Organizer typed, to add as Participants  Answers with up to ten Accounts, the caller among them if it matches, alphabetically by username. Fewer than two characters search nothing. Searches are capped per caller, see [&#x60;PLAYER_SEARCHES&#x60;]; past the cap the answer is empty and says so.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SearchTournamentPlayersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    query: ...,
  } satisfies SearchTournamentPlayersRequest;

  try {
    const data = await api.searchTournamentPlayers(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **query** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**PlayerCandidatesResponse**](PlayerCandidatesResponse.md)

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


## sendBugReport

> SendBugReport200Response sendBugReport(report, images)

Send a Bug report

Send a Bug report  A multipart body: the &#x60;report&#x60; part as json and up to three &#x60;images&#x60;. Every Admin is mailed a notice without diagnostics or images; a mail that fails is logged and does not fail the send.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SendBugReportOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SendBugReportRequest | The [`SendBugReportRequest`] as json
    report: ...,
    // Array<Blob> | JPEG, PNG or WebP images of at most 5 MB each (optional)
    images: /path/to/file.txt,
  } satisfies SendBugReportOperationRequest;

  try {
    const data = await api.sendBugReport(body);
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
| **report** | [SendBugReportRequest](SendBugReportRequest.md) | The [&#x60;SendBugReportRequest&#x60;] as json | [Defaults to `undefined`] |
| **images** | `Array<Blob>` | JPEG, PNG or WebP images of at most 5 MB each | [Optional] |

### Return type

[**SendBugReport200Response**](SendBugReport200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** |  |  -  |
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setDeckAdvisorSettings

> any setDeckAdvisorSettings(deck, SetAdvisorSettingsRequest)

Replace this deck\&#39;s advisor settings

Replace this deck\&#39;s advisor settings  A theme id, a bucket id and an oracle id are the graph service\&#39;s vocabulary and it already reports what it cannot parse, so nothing here validates them. The only two shapes checked are the pool query\&#39;s length and the curve\&#39;s.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckAdvisorSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetAdvisorSettingsRequest (optional)
    SetAdvisorSettingsRequest: ...,
  } satisfies SetDeckAdvisorSettingsRequest;

  try {
    const data = await api.setDeckAdvisorSettings(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetAdvisorSettingsRequest** | [SetAdvisorSettingsRequest](SetAdvisorSettingsRequest.md) |  | [Optional] |

### Return type

**any**

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


## setDeckBracket

> any setDeckBracket(deck, SetDeckBracketRequest)

Say which Commander bracket the deck is built to

Say which Commander bracket the deck is built to  Nothing is checked: the bracket is a claim its builder makes, and the client says where the claim and the cards disagree.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckBracketOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckBracketRequest (optional)
    SetDeckBracketRequest: ...,
  } satisfies SetDeckBracketOperationRequest;

  try {
    const data = await api.setDeckBracket(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetDeckBracketRequest** | [SetDeckBracketRequest](SetDeckBracketRequest.md) |  | [Optional] |

### Return type

**any**

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


## setDeckCheckpoint

> any setDeckCheckpoint(deck, change, SetDeckCheckpointRequest)

Name one of the deck\&#39;s Deck changes with a Deck checkpoint, or rename its

Name one of the deck\&#39;s Deck changes with a Deck checkpoint, or rename its Deck checkpoint  Only the owner names. A Deck change carries at most one Deck checkpoint, so naming a named one renames it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckCheckpointOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    change: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckCheckpointRequest (optional)
    SetDeckCheckpointRequest: ...,
  } satisfies SetDeckCheckpointOperationRequest;

  try {
    const data = await api.setDeckCheckpoint(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **change** | `string` |  | [Defaults to `undefined`] |
| **SetDeckCheckpointRequest** | [SetDeckCheckpointRequest](SetDeckCheckpointRequest.md) |  | [Optional] |

### Return type

**any**

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


## setDeckColors

> any setDeckColors(deck, SetDeckColorsRequest)

Overrule which colours the deck may play

Overrule which colours the deck may play  &#x60;null&#x60; hands the decision back to the commander zone. This exists because there are commanders that grant the deck a colour outside their own identity, and the service has no business knowing which ones.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckColorsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckColorsRequest (optional)
    SetDeckColorsRequest: ...,
  } satisfies SetDeckColorsOperationRequest;

  try {
    const data = await api.setDeckColors(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetDeckColorsRequest** | [SetDeckColorsRequest](SetDeckColorsRequest.md) |  | [Optional] |

### Return type

**any**

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


## setDeckFolder

> any setDeckFolder(deck, SetDeckFolderRequest)

File a deck into one of the account\&#39;s folders

File a deck into one of the account\&#39;s folders  &#x60;null&#x60; takes it off every shelf. Putting a deck away is this call with the archive, which is the folder [&#x60;crate::http::handler_frontend::folders&#x60;] hands out alongside the account\&#39;s own.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckFolderOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckFolderRequest (optional)
    SetDeckFolderRequest: ...,
  } satisfies SetDeckFolderOperationRequest;

  try {
    const data = await api.setDeckFolder(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetDeckFolderRequest** | [SetDeckFolderRequest](SetDeckFolderRequest.md) |  | [Optional] |

### Return type

**any**

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


## setDeckRuleZero

> any setDeckRuleZero(deck, SetDeckRuleZeroRequest)

Record the house rules the deck is played under, colours included

Record the house rules the deck is played under, colours included  Beyond a deck size that would hold no cards, nothing is checked: what a table agreed to is a claim its builder makes, and the client says where the claim and the cards disagree.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetDeckRuleZeroOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckRuleZeroRequest (optional)
    SetDeckRuleZeroRequest: ...,
  } satisfies SetDeckRuleZeroOperationRequest;

  try {
    const data = await api.setDeckRuleZero(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetDeckRuleZeroRequest** | [SetDeckRuleZeroRequest](SetDeckRuleZeroRequest.md) |  | [Optional] |

### Return type

**any**

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


## setVisibilityCollection

> any setVisibilityCollection(collection, SetCollectionVisibilityRequest)

Change who may see a collection

Change who may see a collection

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetVisibilityCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetCollectionVisibilityRequest (optional)
    SetCollectionVisibilityRequest: ...,
  } satisfies SetVisibilityCollectionRequest;

  try {
    const data = await api.setVisibilityCollection(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **SetCollectionVisibilityRequest** | [SetCollectionVisibilityRequest](SetCollectionVisibilityRequest.md) |  | [Optional] |

### Return type

**any**

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


## setVisibilityDeck

> any setVisibilityDeck(deck, SetDeckVisibilityRequest)

Change who may see a deck

Change who may see a deck

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetVisibilityDeckRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDeckVisibilityRequest (optional)
    SetDeckVisibilityRequest: ...,
  } satisfies SetVisibilityDeckRequest;

  try {
    const data = await api.setVisibilityDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **SetDeckVisibilityRequest** | [SetDeckVisibilityRequest](SetDeckVisibilityRequest.md) |  | [Optional] |

### Return type

**any**

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


## signUpForSharedTournament

> SignUpForSharedTournament200Response signUpForSharedTournament(token)

Sign the logged-in Account up for the Tournament a share link points at

Sign the logged-in Account up for the Tournament a share link points at  The way into an unlisted Tournament; refused like &#x60;sign_up_for_tournament&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SignUpForSharedTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies SignUpForSharedTournamentRequest;

  try {
    const data = await api.signUpForSharedTournament(body);
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
| **token** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SignUpForSharedTournament200Response**](SignUpForSharedTournament200Response.md)

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


## signUpForTournament

> SignUpForSharedTournament200Response signUpForTournament(tournament)

Sign the logged-in Account up for a Tournament it sees by its id

Sign the logged-in Account up for a Tournament it sees by its id  Takes effect at once. Refused unless the Owner turned self sign-up on and the Tournament is in Registration, and once the participant limit is reached. An unlisted Tournament is signed up for through its share link, see &#x60;sign_up_for_shared_tournament&#x60;.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SignUpForTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies SignUpForTournamentRequest;

  try {
    const data = await api.signUpForTournament(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SignUpForSharedTournament200Response**](SignUpForSharedTournament200Response.md)

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


## splitCollectionEntry

> SplitCollectionEntryResponse splitCollectionEntry(collection, entry, SplitCollectionEntryRequest)

Move copies out of a stack into a new one

Move copies out of a stack into a new one  For the case where part of a stack is no longer interchangeable with the rest — one of four copies got played, or was sleeved as a foil by mistake.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SplitCollectionEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SplitCollectionEntryRequest (optional)
    SplitCollectionEntryRequest: ...,
  } satisfies SplitCollectionEntryOperationRequest;

  try {
    const data = await api.splitCollectionEntry(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **SplitCollectionEntryRequest** | [SplitCollectionEntryRequest](SplitCollectionEntryRequest.md) |  | [Optional] |

### Return type

[**SplitCollectionEntryResponse**](SplitCollectionEntryResponse.md)

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

Start a passkey login for a given username  The account\&#39;s passkeys are sent as the credential allow-list.

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


## startOidcLogin

> StartOidcLogin200Response startOidcLogin(StartOidcLoginRequest)

Start an OIDC login, for signing up and logging in alike

Start an OIDC login, for signing up and logging in alike  Answers the provider\&#39;s authorization url to send the browser to.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { StartOidcLoginOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // StartOidcLoginRequest (optional)
    StartOidcLoginRequest: ...,
  } satisfies StartOidcLoginOperationRequest;

  try {
    const data = await api.startOidcLogin(body);
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
| **StartOidcLoginRequest** | [StartOidcLoginRequest](StartOidcLoginRequest.md) |  | [Optional] |

### Return type

[**StartOidcLogin200Response**](StartOidcLogin200Response.md)

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


## swapDeckCard

> DeckCardResponse swapDeckCard(deck, card, SwapDeckCardRequest)

Give up copies of a Deck entry for another card in the same zone

Give up copies of a Deck entry for another card in the same zone  Both halves happen in one transaction: the entry loses the copies, which removes it when none are left, and the incoming card joins an alike Deck entry or opens its own. A swap that cannot happen as a whole changes nothing. The answer is the Deck entry the incoming card sits in.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SwapDeckCardOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    card: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SwapDeckCardRequest (optional)
    SwapDeckCardRequest: ...,
  } satisfies SwapDeckCardOperationRequest;

  try {
    const data = await api.swapDeckCard(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **card** | `string` |  | [Defaults to `undefined`] |
| **SwapDeckCardRequest** | [SwapDeckCardRequest](SwapDeckCardRequest.md) |  | [Optional] |

### Return type

[**DeckCardResponse**](DeckCardResponse.md)

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


## takeDeckCards

> any takeDeckCards(deck, TakeDeckCardsRequest)

Move copies out of a collection and into the deck

Move copies out of a collection and into the deck  Where they came from is written down with them, which is what makes taking the deck apart again possible.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { TakeDeckCardsOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // TakeDeckCardsRequest (optional)
    TakeDeckCardsRequest: ...,
  } satisfies TakeDeckCardsOperationRequest;

  try {
    const data = await api.takeDeckCards(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **TakeDeckCardsRequest** | [TakeDeckCardsRequest](TakeDeckCardsRequest.md) |  | [Optional] |

### Return type

**any**

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


## unassignCollectionEntryTag

> any unassignCollectionEntryTag(collection, entry, tag)

Take a card-wide tag off a stack, see [&#x60;assign_collection_entry_tag&#x60;]

Take a card-wide tag off a stack, see [&#x60;assign_collection_entry_tag&#x60;]

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UnassignCollectionEntryTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies UnassignCollectionEntryTagRequest;

  try {
    const data = await api.unassignCollectionEntryTag(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## unassignDeckCardTag

> any unassignDeckCardTag(deck, card, tag)

Take a tag off a card

Take a tag off a card  An Editor only takes off tags local to this deck, as with putting one on.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UnassignDeckCardTagRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    card: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies UnassignDeckCardTagRequest;

  try {
    const data = await api.unassignDeckCardTag(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **card** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## undoDeckChange

> DeckUndoResponse undoDeckChange(deck)

Take back the latest Deck change that is not undone yet

Take back the latest Deck change that is not undone yet  Only the owner undoes. Refused when only the deck\&#39;s first Deck change is left.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UndoDeckChangeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies UndoDeckChangeRequest;

  try {
    const data = await api.undoDeckChange(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |

### Return type

[**DeckUndoResponse**](DeckUndoResponse.md)

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


## updateCollection

> any updateCollection(collection, UpdateCollectionRequest)



### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateCollectionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateCollectionRequest (optional)
    UpdateCollectionRequest: ...,
  } satisfies UpdateCollectionOperationRequest;

  try {
    const data = await api.updateCollection(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **UpdateCollectionRequest** | [UpdateCollectionRequest](UpdateCollectionRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateCollectionEntry

> CollectionEntryResponse updateCollectionEntry(collection, entry, UpdateCollectionEntryRequest)

Change a stack: its count, condition, finish, signature, price, date or printing

Change a stack: its count, condition, finish, signature, price, date or printing  Every field is optional; whatever is left out stays as it is.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateCollectionEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    collection: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateCollectionEntryRequest (optional)
    UpdateCollectionEntryRequest: ...,
  } satisfies UpdateCollectionEntryOperationRequest;

  try {
    const data = await api.updateCollectionEntry(body);
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
| **collection** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **UpdateCollectionEntryRequest** | [UpdateCollectionEntryRequest](UpdateCollectionEntryRequest.md) |  | [Optional] |

### Return type

[**CollectionEntryResponse**](CollectionEntryResponse.md)

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


## updateDeck

> any updateDeck(deck, UpdateDeckRequest)

Rename a deck, change its description or the format it is built for

Rename a deck, change its description or the format it is built for

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateDeckOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateDeckRequest (optional)
    UpdateDeckRequest: ...,
  } satisfies UpdateDeckOperationRequest;

  try {
    const data = await api.updateDeck(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **UpdateDeckRequest** | [UpdateDeckRequest](UpdateDeckRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateDeckCard

> any updateDeckCard(deck, card, UpdateDeckCardRequest)

Change a Deck entry: its count, its zone or the print it sleeves

Change a Deck entry: its count, its zone or the print it sleeves  An entry made alike to another one merges into it, and a count of zero removes it. A Collaborator\&#39;s change leaves the proxy flag as it is, see [&#x60;DeckGrant::proxy&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateDeckCardOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    card: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateDeckCardRequest (optional)
    UpdateDeckCardRequest: ...,
  } satisfies UpdateDeckCardOperationRequest;

  try {
    const data = await api.updateDeckCard(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **card** | `string` |  | [Defaults to `undefined`] |
| **UpdateDeckCardRequest** | [UpdateDeckCardRequest](UpdateDeckCardRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateDeckFolder

> any updateDeckFolder(folder, UpdateDeckFolderRequest)

Rename a folder

Rename a folder  The archive is refused: it is called what the app calls it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateDeckFolderOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    folder: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateDeckFolderRequest (optional)
    UpdateDeckFolderRequest: ...,
  } satisfies UpdateDeckFolderOperationRequest;

  try {
    const data = await api.updateDeckFolder(body);
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
| **folder** | `string` |  | [Defaults to `undefined`] |
| **UpdateDeckFolderRequest** | [UpdateDeckFolderRequest](UpdateDeckFolderRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateDeckTag

> any updateDeckTag(deck, tag, UpdateDeckTagRequest)

Rename a tag, change its marker or move its scope

Rename a tag, change its marker or move its scope  An Editor only changes a tag local to this deck and keeps it there.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateDeckTagOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    deck: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateDeckTagRequest (optional)
    UpdateDeckTagRequest: ...,
  } satisfies UpdateDeckTagOperationRequest;

  try {
    const data = await api.updateDeckTag(body);
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
| **deck** | `string` |  | [Defaults to `undefined`] |
| **tag** | `string` |  | [Defaults to `undefined`] |
| **UpdateDeckTagRequest** | [UpdateDeckTagRequest](UpdateDeckTagRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateGlobalTag

> any updateGlobalTag(tag, UpdateGlobalTagRequest)

Rename a card-wide tag or change its marker

Rename a card-wide tag or change its marker

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateGlobalTagOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tag: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateGlobalTagRequest (optional)
    UpdateGlobalTagRequest: ...,
  } satisfies UpdateGlobalTagOperationRequest;

  try {
    const data = await api.updateGlobalTag(body);
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
| **tag** | `string` |  | [Defaults to `undefined`] |
| **UpdateGlobalTagRequest** | [UpdateGlobalTagRequest](UpdateGlobalTagRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateScannerSession

> any updateScannerSession(session, UpdateScannerSessionRequest)

Rename a session or change its marker and preferred collection

Rename a session or change its marker and preferred collection

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateScannerSessionOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateScannerSessionRequest (optional)
    UpdateScannerSessionRequest: ...,
  } satisfies UpdateScannerSessionOperationRequest;

  try {
    const data = await api.updateScannerSession(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |
| **UpdateScannerSessionRequest** | [UpdateScannerSessionRequest](UpdateScannerSessionRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateScannerSessionEntry

> ScannerSessionEntryResponse updateScannerSessionEntry(session, entry, UpdateScannerSessionEntryRequest)

Adjust count, finish, signed state, paid price or printing

Adjust count, finish, signed state, paid price or printing

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateScannerSessionEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    session: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateScannerSessionEntryRequest (optional)
    UpdateScannerSessionEntryRequest: ...,
  } satisfies UpdateScannerSessionEntryOperationRequest;

  try {
    const data = await api.updateScannerSessionEntry(body);
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
| **session** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **UpdateScannerSessionEntryRequest** | [UpdateScannerSessionEntryRequest](UpdateScannerSessionEntryRequest.md) |  | [Optional] |

### Return type

[**ScannerSessionEntryResponse**](ScannerSessionEntryResponse.md)

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


## updateTournament

> CreateTournament200Response updateTournament(tournament, TournamentSettingsRequest)

Replace a Tournament\&#39;s settings, as one of its Organizers

Replace a Tournament\&#39;s settings, as one of its Organizers

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateTournamentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // TournamentSettingsRequest (optional)
    TournamentSettingsRequest: ...,
  } satisfies UpdateTournamentRequest;

  try {
    const data = await api.updateTournament(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |
| **TournamentSettingsRequest** | [TournamentSettingsRequest](TournamentSettingsRequest.md) |  | [Optional] |

### Return type

[**CreateTournament200Response**](CreateTournament200Response.md)

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


## updateWatchList

> any updateWatchList(list, UpdateWatchListRequest)

Rename a watch list or change its marker

Rename a watch list or change its marker

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateWatchListOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateWatchListRequest (optional)
    UpdateWatchListRequest: ...,
  } satisfies UpdateWatchListOperationRequest;

  try {
    const data = await api.updateWatchList(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **UpdateWatchListRequest** | [UpdateWatchListRequest](UpdateWatchListRequest.md) |  | [Optional] |

### Return type

**any**

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


## updateWatchListEntry

> any updateWatchListEntry(list, entry, UpdateWatchListEntryRequest)

Change some of an entry\&#39;s fields, leaving the rest alone

Change some of an entry\&#39;s fields, leaving the rest alone

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateWatchListEntryOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    list: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    entry: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateWatchListEntryRequest (optional)
    UpdateWatchListEntryRequest: ...,
  } satisfies UpdateWatchListEntryOperationRequest;

  try {
    const data = await api.updateWatchListEntry(body);
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
| **list** | `string` |  | [Defaults to `undefined`] |
| **entry** | `string` |  | [Defaults to `undefined`] |
| **UpdateWatchListEntryRequest** | [UpdateWatchListEntryRequest](UpdateWatchListEntryRequest.md) |  | [Optional] |

### Return type

**any**

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


## withdrawTournamentHandover

> any withdrawTournamentHandover(tournament)

Withdraw the pending offer of a Tournament, as its Owner

Withdraw the pending offer of a Tournament, as its Owner

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { WithdrawTournamentHandoverRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies WithdrawTournamentHandoverRequest;

  try {
    const data = await api.withdrawTournamentHandover(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## withdrawTournamentSignUp

> any withdrawTournamentSignUp(tournament)

Withdraw the logged-in Account\&#39;s own sign-up

Withdraw the logged-in Account\&#39;s own sign-up  Only before the first Round starts; afterwards a Participant leaves by a Drop.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { WithdrawTournamentSignUpRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies WithdrawTournamentSignUpRequest;

  try {
    const data = await api.withdrawTournamentSignUp(body);
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
| **tournament** | `string` |  | [Defaults to `undefined`] |

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
| **400** |  |  -  |
| **500** |  |  -  |
| **401** |  |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

