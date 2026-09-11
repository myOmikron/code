# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acknowledgeWatchListAlarm**](DefaultApi.md#acknowledgewatchlistalarm) | **POST** /api/frontend/v1/watch-lists/{list}/entries/{entry}/acknowledge | Mark an alarm as seen |
| [**addCollectionEntries**](DefaultApi.md#addcollectionentriesoperation) | **POST** /api/frontend/v1/collections/{collection}/entries | File stacks of cards into a collection |
| [**addDeckCard**](DefaultApi.md#adddeckcardoperation) | **POST** /api/frontend/v1/decks/{deck}/cards | Put a card into a deck |
| [**addScannerSessionEntry**](DefaultApi.md#addscannersessionentryoperation) | **POST** /api/frontend/v1/scanner-sessions/{session}/entries | Add scanned copies to a session |
| [**addTournamentOrganizer**](DefaultApi.md#addtournamentorganizeroperation) | **POST** /api/frontend/v1/tournaments/{tournament}/organizers | Add an account as staff — owner only |
| [**addTournamentParticipant**](DefaultApi.md#addtournamentparticipantoperation) | **POST** /api/frontend/v1/tournaments/{tournament}/participants | Walk a guest into the roster by name |
| [**addWatchListEntry**](DefaultApi.md#addwatchlistentryoperation) | **POST** /api/frontend/v1/watch-lists/{list}/entries | Put a card on a watch list |
| [**assignCollectionEntryTag**](DefaultApi.md#assigncollectionentrytag) | **POST** /api/frontend/v1/collections/{collection}/entries/{entry}/tags/{tag} | Put a card-wide tag on a stack |
| [**assignDeckCardTag**](DefaultApi.md#assigndeckcardtag) | **POST** /api/frontend/v1/decks/{deck}/cards/{card}/tags/{tag} | Put a tag on a card |
| [**attachDeckCollection**](DefaultApi.md#attachdeckcollection) | **POST** /api/frontend/v1/decks/{deck}/collection | Start keeping the cards that are physically in this deck |
| [**checkInTournamentParticipant**](DefaultApi.md#checkintournamentparticipant) | **POST** /api/frontend/v1/tournaments/{tournament}/participants/{participant}/check-in | Check in, self-service or by staff |
| [**claimTournamentParticipant**](DefaultApi.md#claimtournamentparticipant) | **POST** /api/frontend/v1/tournaments/participants/claim | Attach the caller\&#39;s account to a guest row using its claim token |
| [**completeTournamentRound**](DefaultApi.md#completetournamentround) | **POST** /api/frontend/v1/tournaments/{tournament}/rounds/{round}/complete | Close a round |
| [**createCollection**](DefaultApi.md#createcollectionoperation) | **POST** /api/frontend/v1/collections |  |
| [**createDeck**](DefaultApi.md#createdeckoperation) | **POST** /api/frontend/v1/decks | Create a deck |
| [**createDeckFolder**](DefaultApi.md#createdeckfolderoperation) | **POST** /api/frontend/v1/folders | Make a folder |
| [**createDeckTag**](DefaultApi.md#createdecktagoperation) | **POST** /api/frontend/v1/decks/{deck}/tags | Create a tag on a deck |
| [**createGlobalTag**](DefaultApi.md#createglobaltagoperation) | **POST** /api/frontend/v1/tags | Create a tag that follows a card through every deck and every collection |
| [**createScannerSession**](DefaultApi.md#createscannersessionoperation) | **POST** /api/frontend/v1/scanner-sessions | Start a new persisted scanner session |
| [**createTournament**](DefaultApi.md#createtournamentoperation) | **POST** /api/frontend/v1/tournaments | Create a tournament; the caller becomes its owner |
| [**createTournamentRound**](DefaultApi.md#createtournamentround) | **POST** /api/frontend/v1/tournaments/{tournament}/rounds | Add a round to a running tournament |
| [**createWatchList**](DefaultApi.md#createwatchlistoperation) | **POST** /api/frontend/v1/watch-lists | Start a new watch list |
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
| [**deleteTournament**](DefaultApi.md#deletetournament) | **DELETE** /api/frontend/v1/tournaments/{tournament} | Delete a tournament outright — owner only |
| [**deleteTournamentParticipant**](DefaultApi.md#deletetournamentparticipant) | **DELETE** /api/frontend/v1/tournaments/{tournament}/participants/{participant} | Remove a participant outright |
| [**deleteTournamentRound**](DefaultApi.md#deletetournamentround) | **DELETE** /api/frontend/v1/tournaments/{tournament}/rounds/{round} | Delete a round nobody has played |
| [**deleteTournamentVenue**](DefaultApi.md#deletetournamentvenue) | **DELETE** /api/frontend/v1/tournaments/venues/{venue} | Drop one entry from the caller\&#39;s own venue book |
| [**deleteWatchList**](DefaultApi.md#deletewatchlist) | **DELETE** /api/frontend/v1/watch-lists/{list} | Throw a watch list away, taking every entry on it with it |
| [**deleteWatchListEntry**](DefaultApi.md#deletewatchlistentry) | **DELETE** /api/frontend/v1/watch-lists/{list}/entries/{entry} | Take a card off a watch list |
| [**detachDeckCollection**](DefaultApi.md#detachdeckcollection) | **DELETE** /api/frontend/v1/decks/{deck}/collection | Stop keeping them |
| [**dropTournamentParticipant**](DefaultApi.md#droptournamentparticipant) | **POST** /api/frontend/v1/tournaments/{tournament}/participants/{participant}/drop | Drop, self-service or by staff |
| [**fileScannerSession**](DefaultApi.md#filescannersessionoperation) | **POST** /api/frontend/v1/scanner-sessions/{session}/file | Atomically file every staged stack and empty the session |
| [**fillDeckCollection**](DefaultApi.md#filldeckcollectionoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/fill | Declare that the deck holds what its list asks for |
| [**finishAddPasskey**](DefaultApi.md#finishaddpasskeyoperation) | **POST** /api/frontend/v1/accounts/passkeys/finish | Finish registering another passkey for the logged-in account |
| [**finishLogin**](DefaultApi.md#finishloginoperation) | **POST** /api/frontend/v1/auth/login/finish | Finish a passkey login |
| [**finishRegistration**](DefaultApi.md#finishregistrationoperation) | **POST** /api/frontend/v1/auth/register/finish | Finish a passkey registration |
| [**getAllCollections**](DefaultApi.md#getallcollections) | **GET** /api/frontend/v1/collections |  |
| [**getAllDeckFolders**](DefaultApi.md#getalldeckfolders) | **GET** /api/frontend/v1/folders | List every folder the account keeps |
| [**getAllDecks**](DefaultApi.md#getalldecks) | **GET** /api/frontend/v1/decks | The decks an account owns |
| [**getAllGlobalTags**](DefaultApi.md#getallglobaltags) | **GET** /api/frontend/v1/tags | Every tag the account keeps for all of its decks and collections |
| [**getAllScannerSessions**](DefaultApi.md#getallscannersessions) | **GET** /api/frontend/v1/scanner-sessions | List every scanner session and its current staging count |
| [**getAllWatchLists**](DefaultApi.md#getallwatchlists) | **GET** /api/frontend/v1/watch-lists | Every watch list the account keeps |
| [**getCollection**](DefaultApi.md#getcollection) | **GET** /api/frontend/v1/collections/{collection} | Fetch a single collection |
| [**getCollectionStatistics**](DefaultApi.md#getcollectionstatistics) | **GET** /api/frontend/v1/collections/{collection}/statistics |  |
| [**getDeck**](DefaultApi.md#getdeck) | **GET** /api/frontend/v1/decks/{deck} | Fetch a single deck |
| [**getDeckAdvisorSettings**](DefaultApi.md#getdeckadvisorsettings) | **GET** /api/frontend/v1/decks/{deck}/advisor-settings | Read this deck\&#39;s advisor settings |
| [**getDeckCollectionDrift**](DefaultApi.md#getdeckcollectiondrift) | **GET** /api/frontend/v1/decks/{deck}/collection/drift | Where the deck list and the deck\&#39;s own collection disagree |
| [**getDeckFormats**](DefaultApi.md#getdeckformats) | **GET** /api/frontend/v1/decks/formats | What the offered formats ask of a deck |
| [**getDeckSourcing**](DefaultApi.md#getdecksourcing) | **GET** /api/frontend/v1/decks/{deck}/sourcing | What the deck asks for, what is in it, and where the rest could come from |
| [**getMpcfillCardbacks**](DefaultApi.md#getmpcfillcardbacks) | **GET** /api/frontend/v1/mpcfill/cardbacks | The card backs MPCFill offers |
| [**getParticipantClaimToken**](DefaultApi.md#getparticipantclaimtoken) | **GET** /api/frontend/v1/tournaments/{tournament}/participants/{participant}/claim-token | Hand a guest row\&#39;s live claim token to staff, e.g. to render as a QR code |
| [**getParticipantDecklist**](DefaultApi.md#getparticipantdecklist) | **GET** /api/frontend/v1/tournaments/{tournament}/participants/{participant}/decklist | Read a participant\&#39;s decklist — staff, or the participant themself |
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
| [**getSharedTournament**](DefaultApi.md#getsharedtournament) | **GET** /api/frontend/v1/shared/tournaments/{token} | Fetch the tournament a share link points at |
| [**getTournament**](DefaultApi.md#gettournament) | **GET** /api/frontend/v1/tournaments/{tournament} | One tournament, with what the viewer may do with it |
| [**getTournamentState**](DefaultApi.md#gettournamentstate) | **GET** /api/frontend/v1/tournaments/{tournament}/state | What a client polls to know whether anything moved |
| [**getWatchList**](DefaultApi.md#getwatchlist) | **GET** /api/frontend/v1/watch-lists/{list} | One watch list, without what is on it |
| [**getWatchListAlarms**](DefaultApi.md#getwatchlistalarms) | **GET** /api/frontend/v1/watch-lists/alarms | Every alarm standing across the account\&#39;s watch lists |
| [**importDeckCards**](DefaultApi.md#importdeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/cards/import | Write a whole decklist into a deck |
| [**joinTournamentAsGuest**](DefaultApi.md#jointournamentasguest) | **POST** /api/frontend/v1/join/{code}/guest | Join a tournament as a guest — no account, just a name for the pairings list |
| [**joinTournamentByCode**](DefaultApi.md#jointournamentbycode) | **POST** /api/frontend/v1/join/{code} | Join a tournament as the logged-in account |
| [**listCollectionCards**](DefaultApi.md#listcollectioncards) | **GET** /api/frontend/v1/collections/{collection}/cards | List a page of a collection\&#39;s cards, sorted and filtered |
| [**listCollectionEntries**](DefaultApi.md#listcollectionentries) | **GET** /api/frontend/v1/collections/{collection}/entries | List every stack filed in a collection |
| [**listCollectionOnLoan**](DefaultApi.md#listcollectiononloan) | **GET** /api/frontend/v1/collections/{collection}/on-loan | Count a collection\&#39;s statistics |
| [**listDeckCards**](DefaultApi.md#listdeckcards) | **GET** /api/frontend/v1/decks/{deck}/cards | Every card of a deck, with the catalog data and the tags on it |
| [**listPasskeys**](DefaultApi.md#listpasskeys) | **GET** /api/frontend/v1/accounts/passkeys | List the passkeys of the logged-in account |
| [**listPublicCollectionCards**](DefaultApi.md#listpubliccollectioncards) | **GET** /api/frontend/v1/explore/collections/{collection}/cards | List a page of a public collection\&#39;s cards, sorted and filtered |
| [**listPublicDeckCards**](DefaultApi.md#listpublicdeckcards) | **GET** /api/frontend/v1/explore/decks/{deck}/cards | Every card of a public deck, with the catalog data and the tags on it |
| [**listRoundTables**](DefaultApi.md#listroundtables) | **GET** /api/frontend/v1/tournaments/{tournament}/rounds/{round}/tables | Every table of one round |
| [**listSharedCollectionCards**](DefaultApi.md#listsharedcollectioncards) | **GET** /api/frontend/v1/shared/collections/{token}/cards | List a page of a shared collection\&#39;s cards, sorted and filtered |
| [**listSharedDeckCards**](DefaultApi.md#listshareddeckcards) | **GET** /api/frontend/v1/shared/decks/{token}/cards | Every card of a shared deck, with the catalog data and the tags on it |
| [**listSharedTournamentParticipants**](DefaultApi.md#listsharedtournamentparticipants) | **GET** /api/frontend/v1/shared/tournaments/{token}/participants | List a shared tournament\&#39;s roster, redacted through the same |
| [**listTournamentAudit**](DefaultApi.md#listtournamentaudit) | **GET** /api/frontend/v1/tournaments/{tournament}/audit | A tournament\&#39;s audit log, newest first |
| [**listTournamentOrganizers**](DefaultApi.md#listtournamentorganizers) | **GET** /api/frontend/v1/tournaments/{tournament}/organizers | The staff list, visible to any role holder |
| [**listTournamentParticipants**](DefaultApi.md#listtournamentparticipants) | **GET** /api/frontend/v1/tournaments/{tournament}/participants | A tournament\&#39;s roster, redacted through [&#x60;public::roster_view&#x60;] |
| [**listTournamentRounds**](DefaultApi.md#listtournamentrounds) | **GET** /api/frontend/v1/tournaments/{tournament}/rounds | Every round of a tournament |
| [**listTournamentVenues**](DefaultApi.md#listtournamentvenues) | **GET** /api/frontend/v1/tournaments/venues | The caller\&#39;s own venue book, most recently used first |
| [**listTournaments**](DefaultApi.md#listtournaments) | **GET** /api/frontend/v1/tournaments | Every tournament the actor may see |
| [**listWatchListCopies**](DefaultApi.md#listwatchlistcopies) | **GET** /api/frontend/v1/watch-lists/{list}/entries/{entry}/copies | Where the copies of one watched card are |
| [**listWatchListEntries**](DefaultApi.md#listwatchlistentries) | **GET** /api/frontend/v1/watch-lists/{list}/entries | Everything one watch list page is drawn from |
| [**lockTournamentDecklists**](DefaultApi.md#locktournamentdecklists) | **POST** /api/frontend/v1/tournaments/{tournament}/decklists/lock | Lock every decklist in the tournament: players may no longer write their |
| [**logout**](DefaultApi.md#logout) | **GET** /api/frontend/v1/auth/logout | Log out, dropping the session |
| [**lookUpClaimToken**](DefaultApi.md#lookupclaimtoken) | **GET** /api/frontend/v1/join/claim/{token} | Look up a claim token before committing to anything: what it names, or |
| [**lookUpJoinCode**](DefaultApi.md#lookupjoincode) | **GET** /api/frontend/v1/join/{code} | Resolve a typed code into the tournament it names, before anybody joins |
| [**me**](DefaultApi.md#me) | **GET** /api/frontend/v1/accounts/me | The account the current session belongs to |
| [**mergeCollectionEntries**](DefaultApi.md#mergecollectionentriesoperation) | **POST** /api/frontend/v1/collections/{collection}/entries/merge | Combine stacks of the same cards into one |
| [**pairTournamentRound**](DefaultApi.md#pairtournamentround) | **POST** /api/frontend/v1/tournaments/{tournament}/rounds/{round}/pairings | Pair a round, replacing whatever it already held |
| [**readDeckUrl**](DefaultApi.md#readdeckurloperation) | **POST** /api/frontend/v1/decks/import/url | Read a decklist off a link to another builder, or off one of our own links |
| [**reattachClaimToken**](DefaultApi.md#reattachclaimtoken) | **POST** /api/frontend/v1/join/claim/{token}/reattach | Re-attach a guest session to its row using a still-live claim token |
| [**recoverAccount**](DefaultApi.md#recoveraccountoperation) | **POST** /api/frontend/v1/auth/recover | Send a fresh registration link to an account\&#39;s stored address |
| [**removeTournamentOrganizer**](DefaultApi.md#removetournamentorganizer) | **DELETE** /api/frontend/v1/tournaments/{tournament}/organizers/{account} | Remove an account from staff — owner only |
| [**resolvePrintings**](DefaultApi.md#resolveprintingsoperation) | **POST** /api/frontend/v1/printings/resolve | Place cards in the catalog |
| [**returnAllDeckCards**](DefaultApi.md#returnalldeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/return-all | Sort everything in the deck back where it came from |
| [**returnDeckCards**](DefaultApi.md#returndeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/return | Sort copies out of the deck back into a collection |
| [**revokeTournamentJoinCode**](DefaultApi.md#revoketournamentjoincode) | **DELETE** /api/frontend/v1/tournaments/{tournament}/join-code | Withdraw a tournament\&#39;s join code without minting a new one |
| [**rotateDeckShareToken**](DefaultApi.md#rotatedecksharetoken) | **POST** /api/frontend/v1/decks/{deck}/share-token | Mint a fresh secret for a deck\&#39;s share link |
| [**rotateShareToken**](DefaultApi.md#rotatesharetoken) | **POST** /api/frontend/v1/collections/{collection}/share-token | Mint a fresh secret for a collection\&#39;s share link |
| [**rotateTournamentJoinCode**](DefaultApi.md#rotatetournamentjoincode) | **POST** /api/frontend/v1/tournaments/{tournament}/join-code | Mint a fresh join code, invalidating whatever one was live before |
| [**searchMpcfillArt**](DefaultApi.md#searchmpcfillart) | **POST** /api/frontend/v1/mpcfill/search | The art MPCFill has for these cards |
| [**searchPublicDecks**](DefaultApi.md#searchpublicdecks) | **GET** /api/frontend/v1/explore/decks | Search the decks their owners put on show |
| [**searchTournamentPlayers**](DefaultApi.md#searchtournamentplayers) | **GET** /api/frontend/v1/tournaments/{tournament}/player-search | Look accounts up by username, to seat a player whose phone is dead |
| [**setDeckAdvisorSettings**](DefaultApi.md#setdeckadvisorsettings) | **PUT** /api/frontend/v1/decks/{deck}/advisor-settings | Replace this deck\&#39;s advisor settings |
| [**setDeckBracket**](DefaultApi.md#setdeckbracketoperation) | **PUT** /api/frontend/v1/decks/{deck}/bracket | Say which Commander bracket the deck is built to |
| [**setDeckColors**](DefaultApi.md#setdeckcolorsoperation) | **PUT** /api/frontend/v1/decks/{deck}/colors | Overrule which colours the deck may play |
| [**setDeckFolder**](DefaultApi.md#setdeckfolderoperation) | **POST** /api/frontend/v1/decks/{deck}/folder | File a deck into one of the account\&#39;s folders |
| [**setDeckRuleZero**](DefaultApi.md#setdeckrulezerooperation) | **PUT** /api/frontend/v1/decks/{deck}/rule-zero | Record the house rules the deck is played under |
| [**setParticipantDecklist**](DefaultApi.md#setparticipantdecklist) | **PUT** /api/frontend/v1/tournaments/{tournament}/participants/{participant}/decklist | Write, replace or clear a participant\&#39;s decklist — staff, or the |
| [**setProfileVisibility**](DefaultApi.md#setprofilevisibilityoperation) | **PUT** /api/frontend/v1/accounts/me/profile-visibility | Open or close the logged-in account\&#39;s public profile |
| [**setTournamentRoundTimer**](DefaultApi.md#settournamentroundtimer) | **PUT** /api/frontend/v1/tournaments/{tournament}/rounds/{round}/timer | Start, pause, adjust or reset a round\&#39;s clock |
| [**setTournamentStatus**](DefaultApi.md#settournamentstatusoperation) | **PUT** /api/frontend/v1/tournaments/{tournament}/status | Move a tournament to a new lifecycle status |
| [**setTournamentVisibility**](DefaultApi.md#settournamentvisibilityoperation) | **PUT** /api/frontend/v1/tournaments/{tournament}/visibility | Change who may see a tournament |
| [**setVisibilityCollection**](DefaultApi.md#setvisibilitycollection) | **POST** /api/frontend/v1/collections/{collection} | Change who may see a collection |
| [**setVisibilityDeck**](DefaultApi.md#setvisibilitydeck) | **POST** /api/frontend/v1/decks/{deck} | Change who may see a deck |
| [**signup**](DefaultApi.md#signupoperation) | **POST** /api/frontend/v1/auth/signup | Sign up for a new account |
| [**splitCollectionEntry**](DefaultApi.md#splitcollectionentryoperation) | **POST** /api/frontend/v1/collections/{collection}/entries/{entry}/split | Move copies out of a stack into a new one |
| [**startAddPasskey**](DefaultApi.md#startaddpasskey) | **POST** /api/frontend/v1/accounts/passkeys/start | Start registering another passkey for the logged-in account |
| [**startLogin**](DefaultApi.md#startloginoperation) | **POST** /api/frontend/v1/auth/login/start | Start a passkey login for a given username |
| [**startRegistration**](DefaultApi.md#startregistrationoperation) | **POST** /api/frontend/v1/auth/register/start | Start a passkey registration |
| [**startTournamentRound**](DefaultApi.md#starttournamentround) | **POST** /api/frontend/v1/tournaments/{tournament}/rounds/{round}/start | Hand a round to the room and start its clock |
| [**takeDeckCards**](DefaultApi.md#takedeckcardsoperation) | **POST** /api/frontend/v1/decks/{deck}/sourcing/take | Move copies out of a collection and into the deck |
| [**unassignCollectionEntryTag**](DefaultApi.md#unassigncollectionentrytag) | **DELETE** /api/frontend/v1/collections/{collection}/entries/{entry}/tags/{tag} | Take a card-wide tag off a stack, see [&#x60;assign_collection_entry_tag&#x60;] |
| [**unassignDeckCardTag**](DefaultApi.md#unassigndeckcardtag) | **DELETE** /api/frontend/v1/decks/{deck}/cards/{card}/tags/{tag} | Take a tag off a card |
| [**unlockTournamentDecklists**](DefaultApi.md#unlocktournamentdecklists) | **POST** /api/frontend/v1/tournaments/{tournament}/decklists/unlock | Unlock every decklist in the tournament, letting players write their own again |
| [**updateCollection**](DefaultApi.md#updatecollectionoperation) | **PUT** /api/frontend/v1/collections/{collection} |  |
| [**updateCollectionEntry**](DefaultApi.md#updatecollectionentryoperation) | **PATCH** /api/frontend/v1/collections/{collection}/entries/{entry} | Change a stack: its count, condition, finish, signature, price, date or printing |
| [**updateDeck**](DefaultApi.md#updatedeckoperation) | **PUT** /api/frontend/v1/decks/{deck} | Rename a deck, change its description or the format it is built for |
| [**updateDeckCard**](DefaultApi.md#updatedeckcardoperation) | **PATCH** /api/frontend/v1/decks/{deck}/cards/{card} | Change a slot: its count, its zone or the print it sleeves |
| [**updateDeckFolder**](DefaultApi.md#updatedeckfolderoperation) | **PUT** /api/frontend/v1/folders/{folder} | Rename a folder |
| [**updateDeckTag**](DefaultApi.md#updatedecktagoperation) | **PUT** /api/frontend/v1/decks/{deck}/tags/{tag} | Rename a tag, change its marker or move its scope |
| [**updateGlobalTag**](DefaultApi.md#updateglobaltagoperation) | **PUT** /api/frontend/v1/tags/{tag} | Rename a card-wide tag or change its marker |
| [**updateScannerSession**](DefaultApi.md#updatescannersessionoperation) | **PUT** /api/frontend/v1/scanner-sessions/{session} | Rename a session or change its marker and preferred collection |
| [**updateScannerSessionEntry**](DefaultApi.md#updatescannersessionentryoperation) | **PATCH** /api/frontend/v1/scanner-sessions/{session}/entries/{entry} | Adjust count, finish, signed state, paid price or printing |
| [**updateTournament**](DefaultApi.md#updatetournament) | **PUT** /api/frontend/v1/tournaments/{tournament} | Update a tournament\&#39;s settings |
| [**updateTournamentParticipant**](DefaultApi.md#updatetournamentparticipantoperation) | **PUT** /api/frontend/v1/tournaments/{tournament}/participants/{participant} | Change a participant\&#39;s display name and/or organizer notes |
| [**updateWatchList**](DefaultApi.md#updatewatchlistoperation) | **PUT** /api/frontend/v1/watch-lists/{list} | Rename a watch list or change its marker |
| [**updateWatchListEntry**](DefaultApi.md#updatewatchlistentryoperation) | **PUT** /api/frontend/v1/watch-lists/{list}/entries/{entry} | Change some of an entry\&#39;s fields, leaving the rest alone |



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

Put a card into a deck  Copies of a print already sitting in the zone (same finish) fold into that slot instead of opening a second row beside it. The answer is the slot\&#39;s bookkeeping fields either way — catalog data and tags come from the list endpoint.

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


## addTournamentOrganizer

> FormErrorResponseForAddOrganizerErrors addTournamentOrganizer(tournament, AddTournamentOrganizerRequest)

Add an account as staff — owner only

Add an account as staff — owner only

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddTournamentOrganizerOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddTournamentOrganizerRequest (optional)
    AddTournamentOrganizerRequest: ...,
  } satisfies AddTournamentOrganizerOperationRequest;

  try {
    const data = await api.addTournamentOrganizer(body);
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
| **AddTournamentOrganizerRequest** | [AddTournamentOrganizerRequest](AddTournamentOrganizerRequest.md) |  | [Optional] |

### Return type

[**FormErrorResponseForAddOrganizerErrors**](FormErrorResponseForAddOrganizerErrors.md)

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


## addTournamentParticipant

> AddTournamentParticipant200Response addTournamentParticipant(tournament, AddTournamentParticipantRequest)

Walk a guest into the roster by name

Walk a guest into the roster by name  [&#x60;participant::register_guest&#x60;] trusts its &#x60;added_by&#x60; argument to mean the caller already holds a role — this is the one place in the module tree allowed to make that promise, immediately after checking it.  &#x60;decklist_text&#x60;, if given, is written in the same transaction right after the row exists to hold it — no policy check here, the same as &#x60;register_guest&#x60; itself: an organizer may register a walk-in with or without a list regardless of [&#x60;crate::models::tournament::DecklistPolicy&#x60;], since a policy governs self-service registration, not staff typing somebody in by hand.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { AddTournamentParticipantOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // AddTournamentParticipantRequest (optional)
    AddTournamentParticipantRequest: ...,
  } satisfies AddTournamentParticipantOperationRequest;

  try {
    const data = await api.addTournamentParticipant(body);
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
| **AddTournamentParticipantRequest** | [AddTournamentParticipantRequest](AddTournamentParticipantRequest.md) |  | [Optional] |

### Return type

[**AddTournamentParticipant200Response**](AddTournamentParticipant200Response.md)

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

Put a tag on a card

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


## checkInTournamentParticipant

> FormErrorResponseForCheckInErrors checkInTournamentParticipant(tournament, participant)

Check in, self-service or by staff

Check in, self-service or by staff  Under [&#x60;crate::models::tournament::DecklistPolicy::RequiredToCheckIn&#x60;], a player with no decklist on file is refused with [&#x60;CheckInErrors::decklist_missing&#x60;] instead of the generic denial — see [&#x60;participant::check_in&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CheckInTournamentParticipantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies CheckInTournamentParticipantRequest;

  try {
    const data = await api.checkInTournamentParticipant(body);
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

[**FormErrorResponseForCheckInErrors**](FormErrorResponseForCheckInErrors.md)

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


## claimTournamentParticipant

> ClaimTournamentParticipant200Response claimTournamentParticipant(ClaimParticipantRequest)

Attach the caller\&#39;s account to a guest row using its claim token

Attach the caller\&#39;s account to a guest row using its claim token

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ClaimTournamentParticipantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // ClaimParticipantRequest (optional)
    ClaimParticipantRequest: ...,
  } satisfies ClaimTournamentParticipantRequest;

  try {
    const data = await api.claimTournamentParticipant(body);
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
| **ClaimParticipantRequest** | [ClaimParticipantRequest](ClaimParticipantRequest.md) |  | [Optional] |

### Return type

[**ClaimTournamentParticipant200Response**](ClaimTournamentParticipant200Response.md)

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


## completeTournamentRound

> CompleteTournamentRound200Response completeTournamentRound(tournament, round, CompleteRoundRequest)

Close a round

Close a round

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CompleteTournamentRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CompleteRoundRequest (optional)
    CompleteRoundRequest: ...,
  } satisfies CompleteTournamentRoundRequest;

  try {
    const data = await api.completeTournamentRound(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |
| **CompleteRoundRequest** | [CompleteRoundRequest](CompleteRoundRequest.md) |  | [Optional] |

### Return type

[**CompleteTournamentRound200Response**](CompleteTournamentRound200Response.md)

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

Create a tag on a deck

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

> CreateTournament200Response createTournament(CreateTournamentRequest)

Create a tournament; the caller becomes its owner

Create a tournament; the caller becomes its owner  A non-blank &#x60;venue&#x60; is remembered into the caller\&#39;s own venue book — see [&#x60;remember_venue&#x60;]. It is written *before* the tournament, because building the insert consumes the request; the two share one transaction, so a tournament that fails to insert takes the remembered venue with it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateTournamentOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // CreateTournamentRequest (optional)
    CreateTournamentRequest: ...,
  } satisfies CreateTournamentOperationRequest;

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
| **CreateTournamentRequest** | [CreateTournamentRequest](CreateTournamentRequest.md) |  | [Optional] |

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


## createTournamentRound

> CreateTournamentRound200Response createTournamentRound(tournament, CreateRoundRequest)

Add a round to a running tournament

Add a round to a running tournament

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateTournamentRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // CreateRoundRequest (optional)
    CreateRoundRequest: ...,
  } satisfies CreateTournamentRoundRequest;

  try {
    const data = await api.createTournamentRound(body);
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
| **CreateRoundRequest** | [CreateRoundRequest](CreateRoundRequest.md) |  | [Optional] |

### Return type

[**CreateTournamentRound200Response**](CreateTournamentRound200Response.md)

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

Delete a tag, taking it off every card it sat on

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

Delete a tournament outright — owner only

Delete a tournament outright — owner only

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


## deleteTournamentParticipant

> any deleteTournamentParticipant(tournament, participant)

Remove a participant outright

Remove a participant outright

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteTournamentParticipantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteTournamentParticipantRequest;

  try {
    const data = await api.deleteTournamentParticipant(body);
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


## deleteTournamentRound

> FormErrorResponseForRoundLifecycleErrors deleteTournamentRound(tournament, round)

Delete a round nobody has played

Delete a round nobody has played

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteTournamentRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteTournamentRoundRequest;

  try {
    const data = await api.deleteTournamentRound(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |

### Return type

[**FormErrorResponseForRoundLifecycleErrors**](FormErrorResponseForRoundLifecycleErrors.md)

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


## deleteTournamentVenue

> any deleteTournamentVenue(venue)

Drop one entry from the caller\&#39;s own venue book

Drop one entry from the caller\&#39;s own venue book

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DeleteTournamentVenueRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    venue: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteTournamentVenueRequest;

  try {
    const data = await api.deleteTournamentVenue(body);
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
| **venue** | `string` |  | [Defaults to `undefined`] |

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


## dropTournamentParticipant

> any dropTournamentParticipant(tournament, participant)

Drop, self-service or by staff

Drop, self-service or by staff

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { DropTournamentParticipantRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DropTournamentParticipantRequest;

  try {
    const data = await api.dropTournamentParticipant(body);
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

Fetch a single deck

Fetch a single deck

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

Read this deck\&#39;s advisor settings  A deck nobody has advised yet still answers: the document at its defaults, not a 404. The 404 is reserved for a deck this account does not own.

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


## getParticipantClaimToken

> ClaimTokenResponse getParticipantClaimToken(tournament, participant)

Hand a guest row\&#39;s live claim token to staff, e.g. to render as a QR code

Hand a guest row\&#39;s live claim token to staff, e.g. to render as a QR code for a walk-in to scan  Guard: [&#x60;participant::claim_token&#x60;] — any role, deliberately not [&#x60;TournamentRole::may_manage&#x60;], the same reasoning as [&#x60;update_tournament_participant&#x60;]: walking a guest through claiming their own row is exactly what a scorekeeper is for. &#x60;claim_token: None&#x60; covers both \&quot;already claimed\&quot; and \&quot;this is an account row\&quot; — either way there is no live token to show, and the caller has no reason to tell the two apart.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetParticipantClaimTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetParticipantClaimTokenRequest;

  try {
    const data = await api.getParticipantClaimToken(body);
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

[**ClaimTokenResponse**](ClaimTokenResponse.md)

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


## getParticipantDecklist

> GetDecklistResponse getParticipantDecklist(tournament, participant)

Read a participant\&#39;s decklist — staff, or the participant themself

Read a participant\&#39;s decklist — staff, or the participant themself  Guard: [&#x60;decklist::get&#x60;]. See [&#x60;get_decklist_response&#x60;] for how [&#x60;GetDecklistResponse::locked&#x60;]/[&#x60;GetDecklistResponse::may_edit&#x60;] are filled in.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetParticipantDecklistRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetParticipantDecklistRequest;

  try {
    const data = await api.getParticipantDecklist(body);
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

[**GetDecklistResponse**](GetDecklistResponse.md)

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

Fetch an account\&#39;s public profile: what it put on show  Three answers, not two: the profile, a refusal for a name nobody holds, and the profile\&#39;s own &#x60;is_public: false&#x60; for an account that keeps it closed. That last one does tell a reader the name is taken — a deliberate trade for being able to say \&quot;they would rather not show their cards\&quot; instead of \&quot;no such person\&quot;.

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

> SharedTournamentResponse getSharedTournament(token)

Fetch the tournament a share link points at

Fetch the tournament a share link points at  &#x60;participant_count&#x60; is counted the same way [&#x60;crate::http::handler_frontend::tournaments::handler::get_tournament&#x60;] counts it: the true roster size, never redacted. &#x60;roster_available&#x60; runs [&#x60;public::roster_view&#x60;] with &#x60;is_staff&#x60;/&#x60;is_participant&#x60; both &#x60;false&#x60; — nobody reading by share link holds either — the identical decision [&#x60;list_tournament_participants&#x60;](crate::http::handler_frontend::tournaments::handler::list_tournament_participants) applies to the ordinary authed read.

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

[**SharedTournamentResponse**](SharedTournamentResponse.md)

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

> GetTournamentResponse getTournament(tournament)

One tournament, with what the viewer may do with it

One tournament, with what the viewer may do with it

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

[**GetTournamentResponse**](GetTournamentResponse.md)

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


## getTournamentState

> TournamentStateResponse getTournamentState(tournament)

What a client polls to know whether anything moved

What a client polls to know whether anything moved  In the actor block on purpose: a guest\&#39;s phone is exactly the device that needs this most, and wrapping it in an auth layer would lock the room out. Deliberately cheap — a handful of indexed reads and never a standings computation, because every phone hits it on a timer.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetTournamentStateRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetTournamentStateRequest;

  try {
    const data = await api.getTournamentState(body);
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

[**TournamentStateResponse**](TournamentStateResponse.md)

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


## joinTournamentAsGuest

> JoinTournamentAsGuest200Response joinTournamentAsGuest(code, GuestJoinRequest)

Join a tournament as a guest — no account, just a name for the pairings list

Join a tournament as a guest — no account, just a name for the pairings list  Unauthenticated and rate limited, same reasoning as [&#x60;look_up_join_code&#x60;]. The session is only told about the new participant *after* the transaction commits: a session entry naming a row that turned out not to exist would be worse than losing this one join to a crash in between.  &#x60;decklist_text&#x60;, if given, is written in the same transaction right after the row exists to hold it. A refusal past that point (only [&#x60;JoinErrors::invalid_decklist&#x60;] can actually happen for a guest, pasted text is the only source they have) answers its form error *without* committing — the transaction simply drops, so the participant row this handler just inserted is rolled back along with it, exactly like a failed [&#x60;participant::register_guest&#x60;] would be.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { JoinTournamentAsGuestRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    code: code_example,
    // GuestJoinRequest (optional)
    GuestJoinRequest: ...,
  } satisfies JoinTournamentAsGuestRequest;

  try {
    const data = await api.joinTournamentAsGuest(body);
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
| **GuestJoinRequest** | [GuestJoinRequest](GuestJoinRequest.md) |  | [Optional] |

### Return type

[**JoinTournamentAsGuest200Response**](JoinTournamentAsGuest200Response.md)

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


## joinTournamentByCode

> JoinTournamentByCode200Response joinTournamentByCode(code, JoinTournamentRequest)

Join a tournament as the logged-in account

Join a tournament as the logged-in account  &#x60;deck&#x60;/&#x60;decklist_text&#x60; are handled exactly like [&#x60;join_tournament_as_guest&#x60;]\&#39;s &#x60;decklist_text&#x60;: written in the same transaction right after the participant row exists, and a refusal past that point answers its form error without committing, so the fresh participant row never actually exists either. &#x60;deck_owner&#x60; and &#x60;actor&#x60; are both the joining account — [&#x60;decklist::write&#x60;] checks deck ownership against the former and audits against the latter, and here they are always the same person.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { JoinTournamentByCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    code: code_example,
    // JoinTournamentRequest (optional)
    JoinTournamentRequest: ...,
  } satisfies JoinTournamentByCodeRequest;

  try {
    const data = await api.joinTournamentByCode(body);
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
| **JoinTournamentRequest** | [JoinTournamentRequest](JoinTournamentRequest.md) |  | [Optional] |

### Return type

[**JoinTournamentByCode200Response**](JoinTournamentByCode200Response.md)

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

Every card of a deck, with the catalog data and the tags on it  The whole deck in one answer: a hundred slots are not worth paging, and the client groups and sorts them however the list is being looked at.

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


## listRoundTables

> ListTablesResponse listRoundTables(tournament, round)

Every table of one round

Every table of one round  In the actor block beside the round list: a player\&#39;s own table is the single thing their phone is open for, and an auth layer here would lock out every guest in the room.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListRoundTablesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListRoundTablesRequest;

  try {
    const data = await api.listRoundTables(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ListTablesResponse**](ListTablesResponse.md)

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

> ListSharedParticipantsResponse listSharedTournamentParticipants(token)

List a shared tournament\&#39;s roster, redacted through the same

List a shared tournament\&#39;s roster, redacted through the same [&#x60;public::roster_view&#x60;] decision the ordinary authed read applies  A [&#x60;public::RosterView::Hidden&#x60;] tournament answers the identical [&#x60;unknown_link&#x60;] refusal a dead token gets: a reader must not be able to tell \&quot;no roster for you\&quot; apart from \&quot;no such link\&quot; — see the module docs on [&#x60;super&#x60;].

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

[**ListSharedParticipantsResponse**](ListSharedParticipantsResponse.md)

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


## listTournamentAudit

> ListTournamentAuditResponse listTournamentAudit(tournament, limit)

A tournament\&#39;s audit log, newest first

A tournament\&#39;s audit log, newest first

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentAuditRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // number (optional)
    limit: 56,
  } satisfies ListTournamentAuditRequest;

  try {
    const data = await api.listTournamentAudit(body);
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
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**ListTournamentAuditResponse**](ListTournamentAuditResponse.md)

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

> ListTournamentOrganizersResponse listTournamentOrganizers(tournament)

The staff list, visible to any role holder

The staff list, visible to any role holder

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

[**ListTournamentOrganizersResponse**](ListTournamentOrganizersResponse.md)

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

> ListTournamentParticipantsResponse listTournamentParticipants(tournament)

A tournament\&#39;s roster, redacted through [&#x60;public::roster_view&#x60;]

A tournament\&#39;s roster, redacted through [&#x60;public::roster_view&#x60;]  This is the leak the model layer\&#39;s own docs warn about: skip [&#x60;public::roster_view&#x60;]/[&#x60;public::apply_roster_view&#x60;] here and a [&#x60;crate::models::visibility::Visibility::Public&#x60;] tournament hands every guest\&#39;s real name to any logged-in stranger, using nothing but this ordinary authed read — no share token needed. The share surface ([&#x60;crate::http::handler_frontend::shared::handler::list_shared_tournament_participants&#x60;]) applies the identical decision with &#x60;is_staff&#x60;/&#x60;is_participant&#x60; both &#x60;false&#x60;.

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

[**ListTournamentParticipantsResponse**](ListTournamentParticipantsResponse.md)

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


## listTournamentRounds

> ListRoundsResponse listTournamentRounds(tournament)

Every round of a tournament

Every round of a tournament

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentRoundsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies ListTournamentRoundsRequest;

  try {
    const data = await api.listTournamentRounds(body);
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

[**ListRoundsResponse**](ListRoundsResponse.md)

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


## listTournamentVenues

> ListTournamentVenuesResponse listTournamentVenues()

The caller\&#39;s own venue book, most recently used first

The caller\&#39;s own venue book, most recently used first  Note: &#x60;/venues&#x60; is a static path segment while &#x60;/{tournament}&#x60; is a dynamic one, so axum\&#39;s router already prefers the static match here — nothing to arrange, just worth being aware of on a route table shaped like this one.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentVenuesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listTournamentVenues();
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

[**ListTournamentVenuesResponse**](ListTournamentVenuesResponse.md)

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


## listTournaments

> ListTournamentsResponse listTournaments()

Every tournament the actor may see

Every tournament the actor may see

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTournamentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.listTournaments();
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


## lockTournamentDecklists

> any lockTournamentDecklists(tournament)

Lock every decklist in the tournament: players may no longer write their

Lock every decklist in the tournament: players may no longer write their own, staff still can

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LockTournamentDecklistsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies LockTournamentDecklistsRequest;

  try {
    const data = await api.lockTournamentDecklists(body);
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


## lookUpClaimToken

> LookUpClaimToken200Response lookUpClaimToken(token)

Look up a claim token before committing to anything: what it names, or

Look up a claim token before committing to anything: what it names, or that it does not resolve to anything live  Unauthenticated and rate limited, same reasoning as [&#x60;look_up_join_code&#x60;] — this is the screen a scanned claim QR lands on before the player has chosen anything. [&#x60;ClaimErrors::invalid_token&#x60;], not a bad request: a stale or already-claimed QR is an everyday outcome, not a caller mistake.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LookUpClaimTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies LookUpClaimTokenRequest;

  try {
    const data = await api.lookUpClaimToken(body);
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

[**LookUpClaimToken200Response**](LookUpClaimToken200Response.md)

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


## lookUpJoinCode

> LookUpJoinCode200Response lookUpJoinCode(code)

Resolve a typed code into the tournament it names, before anybody joins

Resolve a typed code into the tournament it names, before anybody joins  Unauthenticated and rate limited (see [&#x60;super::initialize_routes&#x60;]) — a phone reading a whiteboard has no session yet. [&#x60;JoinLookupResponse::already_registered&#x60;] is always &#x60;false&#x60; here; there is no account to check it against.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LookUpJoinCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    code: code_example,
  } satisfies LookUpJoinCodeRequest;

  try {
    const data = await api.lookUpJoinCode(body);
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

[**LookUpJoinCode200Response**](LookUpJoinCode200Response.md)

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


## pairTournamentRound

> PairTournamentRound200Response pairTournamentRound(tournament, round)

Pair a round, replacing whatever it already held

Pair a round, replacing whatever it already held  One endpoint for both the first pairing and every re-pair after it. There is no preview to commit: the race a staged pairing would guard is better served by pressing this again, and writing straight through survives a crashed tab and a locked phone, which a staged one does not.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { PairTournamentRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies PairTournamentRoundRequest;

  try {
    const data = await api.pairTournamentRound(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PairTournamentRound200Response**](PairTournamentRound200Response.md)

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


## reattachClaimToken

> LookUpClaimToken200Response reattachClaimToken(token)

Re-attach a guest session to its row using a still-live claim token

Re-attach a guest session to its row using a still-live claim token  Unauthenticated and rate limited, same reasoning as [&#x60;look_up_join_code&#x60;]. Does **not** consume the token — see [&#x60;participant::reattach&#x60;]: the same device may lose its cookie and need the token again, and only an account\&#39;s claim retires it for good. The session only learns about the participant *after* the transaction commits, the same reasoning as [&#x60;join_tournament_as_guest&#x60;]: a session pointed at a row the commit then failed to actually touch would be worse than losing this one reattach to a crash in between. Same typed error as [&#x60;look_up_claim_token&#x60;].

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ReattachClaimTokenRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    token: token_example,
  } satisfies ReattachClaimTokenRequest;

  try {
    const data = await api.reattachClaimToken(body);
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

[**LookUpClaimToken200Response**](LookUpClaimToken200Response.md)

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


## recoverAccount

> any recoverAccount(RecoverAccountRequest)

Send a fresh registration link to an account\&#39;s stored address

Send a fresh registration link to an account\&#39;s stored address  The \&quot;lost passkey\&quot; flow: a new device has no passkey, so the login form offers this instead of a dead end. Registering over the link only *adds* a passkey — the existing ones keep working until their owner removes them.  Always answers &#x60;200&#x60;, whether or not the username exists — the response must not be usable to probe which usernames are registered. The link is only ever sent to the address stored on the account, never to one from the request, so this endpoint cannot be used to mail a third party.

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


## removeTournamentOrganizer

> any removeTournamentOrganizer(tournament, account)

Remove an account from staff — owner only

Remove an account from staff — owner only

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RemoveTournamentOrganizerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    account: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RemoveTournamentOrganizerRequest;

  try {
    const data = await api.removeTournamentOrganizer(body);
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


## revokeTournamentJoinCode

> any revokeTournamentJoinCode(tournament)

Withdraw a tournament\&#39;s join code without minting a new one

Withdraw a tournament\&#39;s join code without minting a new one

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RevokeTournamentJoinCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RevokeTournamentJoinCodeRequest;

  try {
    const data = await api.revokeTournamentJoinCode(body);
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


## rotateTournamentJoinCode

> TournamentJoinCodeResponse rotateTournamentJoinCode(tournament)

Mint a fresh join code, invalidating whatever one was live before

Mint a fresh join code, invalidating whatever one was live before

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { RotateTournamentJoinCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies RotateTournamentJoinCodeRequest;

  try {
    const data = await api.rotateTournamentJoinCode(body);
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

[**TournamentJoinCodeResponse**](TournamentJoinCodeResponse.md)

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

> SearchPlayersResponse searchTournamentPlayers(tournament, q)

Look accounts up by username, to seat a player whose phone is dead

Look accounts up by username, to seat a player whose phone is dead  Organizer-only and tournament-scoped: the guard is the role on this event, and the answer says which hits are already on this roster so the dialog can grey them out. A blank needle answers nothing rather than the whole table.

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
    q: q_example,
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
| **q** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**SearchPlayersResponse**](SearchPlayersResponse.md)

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

Record the house rules the deck is played under

Record the house rules the deck is played under  Beyond a deck size that would hold no cards, nothing is checked: what a table agreed to is a claim its builder makes, and the client says where the claim and the cards disagree.

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


## setParticipantDecklist

> SetParticipantDecklist200Response setParticipantDecklist(tournament, participant, SetDecklistRequest)

Write, replace or clear a participant\&#39;s decklist — staff, or the

Write, replace or clear a participant\&#39;s decklist — staff, or the participant themself while the tournament\&#39;s decklists are not locked  Guard: [&#x60;decklist::set&#x60;]. &#x60;deck&#x60; and &#x60;text&#x60; both present is refused as [&#x60;DecklistErrors::invalid_decklist&#x60;] before the guard even runs — a request names at most one source.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetParticipantDecklistRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetDecklistRequest (optional)
    SetDecklistRequest: ...,
  } satisfies SetParticipantDecklistRequest;

  try {
    const data = await api.setParticipantDecklist(body);
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
| **SetDecklistRequest** | [SetDecklistRequest](SetDecklistRequest.md) |  | [Optional] |

### Return type

[**SetParticipantDecklist200Response**](SetParticipantDecklist200Response.md)

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


## setProfileVisibility

> any setProfileVisibility(SetProfileVisibilityRequest)

Open or close the logged-in account\&#39;s public profile

Open or close the logged-in account\&#39;s public profile  Discovery only: the decks and collections already set to [&#x60;crate::models::visibility::Visibility::Public&#x60;] stay exactly as public as they were, and the deck search keeps finding them. What closes is the profile page and the organizer\&#39;s player lookup.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetProfileVisibilityOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // SetProfileVisibilityRequest (optional)
    SetProfileVisibilityRequest: ...,
  } satisfies SetProfileVisibilityOperationRequest;

  try {
    const data = await api.setProfileVisibility(body);
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
| **SetProfileVisibilityRequest** | [SetProfileVisibilityRequest](SetProfileVisibilityRequest.md) |  | [Optional] |

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


## setTournamentRoundTimer

> StartTournamentRound200Response setTournamentRoundTimer(tournament, round, SetTimerRequest)

Start, pause, adjust or reset a round\&#39;s clock

Start, pause, adjust or reset a round\&#39;s clock

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetTournamentRoundTimerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetTimerRequest (optional)
    SetTimerRequest: ...,
  } satisfies SetTournamentRoundTimerRequest;

  try {
    const data = await api.setTournamentRoundTimer(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |
| **SetTimerRequest** | [SetTimerRequest](SetTimerRequest.md) |  | [Optional] |

### Return type

[**StartTournamentRound200Response**](StartTournamentRound200Response.md)

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


## setTournamentStatus

> SetTournamentStatusResponse setTournamentStatus(tournament, SetTournamentStatusRequest)

Move a tournament to a new lifecycle status

Move a tournament to a new lifecycle status

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetTournamentStatusOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetTournamentStatusRequest (optional)
    SetTournamentStatusRequest: ...,
  } satisfies SetTournamentStatusOperationRequest;

  try {
    const data = await api.setTournamentStatus(body);
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
| **SetTournamentStatusRequest** | [SetTournamentStatusRequest](SetTournamentStatusRequest.md) |  | [Optional] |

### Return type

[**SetTournamentStatusResponse**](SetTournamentStatusResponse.md)

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


## setTournamentVisibility

> any setTournamentVisibility(tournament, SetTournamentVisibilityRequest)

Change who may see a tournament

Change who may see a tournament  Discards the freshly minted share token the same way [&#x60;crate::http::handler_frontend::decks::handler::set_visibility_deck&#x60;] does: the client re-fetches [&#x60;get_tournament&#x60;] for it.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { SetTournamentVisibilityOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SetTournamentVisibilityRequest (optional)
    SetTournamentVisibilityRequest: ...,
  } satisfies SetTournamentVisibilityOperationRequest;

  try {
    const data = await api.setTournamentVisibility(body);
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
| **SetTournamentVisibilityRequest** | [SetTournamentVisibilityRequest](SetTournamentVisibilityRequest.md) |  | [Optional] |

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


## startTournamentRound

> StartTournamentRound200Response startTournamentRound(tournament, round)

Hand a round to the room and start its clock

Hand a round to the room and start its clock

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { StartTournamentRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    round: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies StartTournamentRoundRequest;

  try {
    const data = await api.startTournamentRound(body);
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
| **round** | `string` |  | [Defaults to `undefined`] |

### Return type

[**StartTournamentRound200Response**](StartTournamentRound200Response.md)

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

Take a tag off a card

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


## unlockTournamentDecklists

> any unlockTournamentDecklists(tournament)

Unlock every decklist in the tournament, letting players write their own again

Unlock every decklist in the tournament, letting players write their own again

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UnlockTournamentDecklistsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies UnlockTournamentDecklistsRequest;

  try {
    const data = await api.unlockTournamentDecklists(body);
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

Change a slot: its count, its zone or the print it sleeves

Change a slot: its count, its zone or the print it sleeves

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

Rename a tag, change its marker or move its scope

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

> FormErrorResponseForTournamentSettingsErrors updateTournament(tournament, TournamentSettingsRequest)

Update a tournament\&#39;s settings

Update a tournament\&#39;s settings  The always-editable fields (name, description, venue, start time, round length) go through even while the event is running; a structural change (format, pod size, pairing, scoring, ...) while [&#x60;SettingsChange::Locked&#x60;] answers [&#x60;TournamentSettingsErrors::settings_locked&#x60;] instead — see [&#x60;Tournament::update_settings&#x60;]\&#39;s doc comment for exactly what counts as structural. A non-blank &#x60;venue&#x60; is remembered into the caller\&#39;s own venue book — see [&#x60;remember_venue&#x60;] — once the write actually goes through.

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

[**FormErrorResponseForTournamentSettingsErrors**](FormErrorResponseForTournamentSettingsErrors.md)

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


## updateTournamentParticipant

> any updateTournamentParticipant(tournament, participant, UpdateTournamentParticipantRequest)

Change a participant\&#39;s display name and/or organizer notes

Change a participant\&#39;s display name and/or organizer notes

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UpdateTournamentParticipantOperationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    tournament: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    participant: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // UpdateTournamentParticipantRequest (optional)
    UpdateTournamentParticipantRequest: ...,
  } satisfies UpdateTournamentParticipantOperationRequest;

  try {
    const data = await api.updateTournamentParticipant(body);
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
| **UpdateTournamentParticipantRequest** | [UpdateTournamentParticipantRequest](UpdateTournamentParticipantRequest.md) |  | [Optional] |

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

