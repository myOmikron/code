use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::http::handler_frontend::collections::schema::CollectionResponse;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::card_attributes::CardRarity;
use crate::models::collection::Collection;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::deck::Deck;
use crate::models::deck::DeckCardUuid;
use crate::models::deck::DeckUuid;
use crate::models::deck::DeckZone;
use crate::models::deck::folder::DeckFolderUuid;
use crate::models::deck::listing::DeckCommander;
use crate::models::deck::listing::DeckSummary;
use crate::models::deck::listing::ListedDeckCard;
use crate::models::deck::listing::ListedSlot;
use crate::models::deck::sourcing::DeckSourcing;
use crate::models::deck::sourcing::SourcedPrinting;
use crate::models::deck::sourcing::SourcedStack;
use crate::models::deck::sourcing::SourcingCandidate;
use crate::models::deck::sourcing::SourcingSlot;
use crate::models::deck::tag::DeckTag;
use crate::models::deck::tag::DeckTagUuid;
use crate::models::format::BracketRules;
use crate::models::format::CommanderRule;
use crate::models::format::DeckSize;
use crate::models::format::FormatRules;
use crate::models::visibility::Visibility;

/// A deck as its owner sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckResponse {
    /// Primary key
    pub uuid: DeckUuid,
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description, e.g. the deck's game plan
    pub description: Option<MaxStr<1024>>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// Who may see the deck
    pub visibility: Visibility,
    /// Secret of the share link, `null` once the link is revoked
    pub share_token: Option<MaxStr<64>>,
    /// The colours the deck may play, `null` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// Which Commander bracket the deck is built to, `null` when unset
    pub bracket: Option<i16>,
    /// When the deck was created
    pub created_at: SchemaDateTime,
    /// The folder the deck is filed in, `null` while it is on no shelf
    pub folder: Option<DeckFolderUuid>,
}

/// What the catalog knows about a card the sourcing view shows
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourcedPrintingResponse {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card, which is what a wider match uses
    pub oracle_id: Option<Uuid>,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing
    pub lang: String,
    /// Cardmarket's id of the product this printing is sold as
    pub cardmarket_id: Option<i32>,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a tile, which a row-sized scan is too small for
    pub image_normal: Option<String>,
    /// What a copy costs, in euro cents
    pub price_eur_cents: Option<i64>,
    /// What a foil copy costs, in euro cents
    pub price_eur_foil_cents: Option<i64>,
}

/// One slot of the deck list, as the sourcing view sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourcingSlotResponse {
    /// Primary key of the slot
    pub uuid: DeckCardUuid,
    /// Scryfall's id of the printing the list asks for
    pub printing: Uuid,
    /// How many copies it asks for
    pub quantity: i32,
    /// Which zone the slot sits in
    pub zone: DeckZone,
    /// Whether the list asks for foils
    pub foil: bool,
    /// What the catalog knows, `None` for a printing it has not caught up with
    pub card: Option<SourcedPrintingResponse>,
}

/// One stack lying in the deck's own collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourcedStackResponse {
    /// Primary key of the stack
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies the stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// The collection they were taken out of, `None` if they were bought into it
    pub origin: Option<CollectionUuid>,
    /// What that collection is called, `None` once it is gone
    pub origin_name: Option<String>,
    /// Its marker colour
    pub origin_color: Option<String>,
    /// Its marker pictogram
    pub origin_icon: Option<String>,
    /// What the catalog knows about the printing
    pub card: Option<SourcedPrintingResponse>,
}

/// One stack elsewhere in the account that could fill a slot
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SourcingCandidateResponse {
    /// Primary key of the stack
    pub uuid: CollectionEntryUuid,
    /// The collection it lies in
    pub collection: CollectionUuid,
    /// What that collection is called
    pub collection_name: String,
    /// Its marker colour
    pub collection_color: String,
    /// Its marker pictogram
    pub collection_icon: String,
    /// The deck it stands for, so taking from another deck is visibly that
    pub collection_deck: Option<DeckUuid>,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies the stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What the catalog knows about the printing
    pub card: SourcedPrintingResponse,
}

/// Everything the sourcing view is drawn from
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckSourcingResponse {
    /// The deck's own collection, `None` while it keeps none
    pub collection: Option<CollectionResponse>,
    /// What the list asks for
    pub slots: Vec<SourcingSlotResponse>,
    /// What is filed in the deck's own collection
    pub filed: Vec<SourcedStackResponse>,
    /// What could still be taken from elsewhere
    pub candidates: Vec<SourcingCandidateResponse>,
}

/// Request to move copies out of a collection and into the deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TakeDeckCardsRequest {
    /// The stack to take them from
    pub entry: CollectionEntryUuid,
    /// How many copies to take
    pub quantity: i32,
    /// The slot they are being sourced for, which then follows the printing
    pub slot: Option<DeckCardUuid>,
}

/// Request to sort copies out of the deck back into a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReturnDeckCardsRequest {
    /// The stack in the deck to take them from
    pub entry: CollectionEntryUuid,
    /// How many copies to sort back
    pub quantity: i32,
    /// Where to put them, `None` to use where they came from
    pub target: Option<CollectionUuid>,
}

/// Request to sort everything in the deck back where it came from
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReturnAllDeckCardsRequest {
    /// Where stacks without an origin go, `None` to leave those in the deck
    pub target: Option<CollectionUuid>,
}

/// What sorting a deck back moved
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReturnAllDeckCardsResponse {
    /// How many stacks were sorted back
    pub returned: u32,
    /// How many stayed, because nobody said where they belong
    pub left: u32,
}

/// Request to declare that the deck holds what its list asks for
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FillDeckCollectionRequest {
    /// The one slot to fill, `None` for every slot of the deck
    pub slot: Option<DeckCardUuid>,
}

/// What filling a deck's collection from its own list came to
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FillDeckCollectionResponse {
    /// How many copies were filed as being in the deck
    pub filed: u32,
}

/// Request to file a deck into a folder, or onto no shelf at all
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetDeckFolderRequest {
    /// The folder to file it in, `null` to take it off every shelf
    pub folder: Option<DeckFolderUuid>,
}

impl From<SourcedPrinting> for SourcedPrintingResponse {
    fn from(card: SourcedPrinting) -> Self {
        Self {
            name: card.name,
            oracle_id: card.oracle_id,
            set_code: card.set_code,
            set_name: card.set_name,
            collector_number: card.collector_number,
            lang: card.lang,
            cardmarket_id: card.cardmarket_id,
            image_small: card.image_small,
            image_normal: card.image_normal,
            price_eur_cents: card.price_eur,
            price_eur_foil_cents: card.price_eur_foil,
        }
    }
}

impl From<SourcingSlot> for SourcingSlotResponse {
    fn from(slot: SourcingSlot) -> Self {
        Self {
            uuid: slot.uuid,
            printing: slot.printing,
            quantity: slot.quantity,
            zone: slot.zone,
            foil: slot.foil,
            card: slot.card.map(SourcedPrintingResponse::from),
        }
    }
}

impl From<SourcedStack> for SourcedStackResponse {
    fn from(stack: SourcedStack) -> Self {
        Self {
            uuid: stack.uuid,
            printing: stack.printing,
            quantity: stack.quantity,
            condition: stack.condition,
            finish: stack.finish,
            origin: stack.origin,
            origin_name: stack.origin_name,
            origin_color: stack.origin_color,
            origin_icon: stack.origin_icon,
            card: stack.card.map(SourcedPrintingResponse::from),
        }
    }
}

impl From<SourcingCandidate> for SourcingCandidateResponse {
    fn from(candidate: SourcingCandidate) -> Self {
        Self {
            uuid: candidate.uuid,
            collection: candidate.collection,
            collection_name: candidate.collection_name,
            collection_color: candidate.collection_color,
            collection_icon: candidate.collection_icon,
            collection_deck: candidate.collection_deck,
            printing: candidate.printing,
            quantity: candidate.quantity,
            condition: candidate.condition,
            finish: candidate.finish,
            card: SourcedPrintingResponse::from(candidate.card),
        }
    }
}

impl DeckSourcingResponse {
    /// Puts the three lists and the deck's own collection into one answer
    pub fn new(sourcing: DeckSourcing, collection: Option<Collection>) -> Self {
        Self {
            collection: collection.map(CollectionResponse::from),
            slots: sourcing
                .slots
                .into_iter()
                .map(SourcingSlotResponse::from)
                .collect(),
            filed: sourcing
                .filed
                .into_iter()
                .map(SourcedStackResponse::from)
                .collect(),
            candidates: sourcing
                .candidates
                .into_iter()
                .map(SourcingCandidateResponse::from)
                .collect(),
        }
    }
}

/// Request to create a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateDeckRequest {
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format to build for
    pub format: MaxStr<32>,
    /// Who may see the deck
    pub visibility: Visibility,
}

/// Request to rename a deck, change its description or its format
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateDeckRequest {
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The format to build for
    pub format: MaxStr<32>,
}

/// Request to change who may see a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetDeckVisibilityRequest {
    /// The visibility to switch to
    pub visibility: Visibility,
}

/// Request to overrule which colours a deck may play
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetDeckColorsRequest {
    /// The colours as the letters `WUBRG`, or `null` to follow the commander
    pub colors: Option<MaxStr<8>>,
}

/// Request to say which Commander bracket a deck is built to
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetDeckBracketRequest {
    /// The bracket, one to five, or `null` to leave it unsaid
    pub bracket: Option<i16>,
}

/// What a Commander bracket asks of a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct BracketRulesResponse {
    /// Which bracket, one to five
    pub number: u8,
    /// The slug the client turns into a name
    pub slug: String,
    /// How many Game Changers may be played, `null` for no limit
    pub max_game_changers: Option<u8>,
    /// Whether mass land denial is expected to stay out
    pub mass_land_denial: bool,
    /// Whether chained extra turns are expected to stay out
    pub extra_turns: bool,
    /// Whether two card infinite combos are expected to stay out
    pub two_card_combos: bool,
}

/// The freshly minted secret of a deck's share link
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RotateDeckShareTokenResponse {
    /// The new secret — every link handed out before this call stopped working
    pub share_token: MaxStr<64>,
}

/// What a format asks of a deck built for it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FormatRulesResponse {
    /// The slug, matching Scryfall's `legalities` keys
    pub slug: String,
    /// How many cards the deck holds
    pub deck_size: DeckSize,
    /// How many copies of one card may be played, ignoring basic lands
    pub max_copies: u8,
    /// Whether a commander is required, and how many
    pub commander: CommanderRule,
    /// How many cards the sideboard may hold, zero when the format has none
    pub sideboard: u8,
    /// Whether the deck's colours follow its commander unless overruled
    pub color_identity_locked: bool,
}

/// The formats a deck can be built for, and the Commander brackets
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListFormatsResponse {
    /// One entry per format
    pub formats: Vec<FormatRulesResponse>,
    /// The five Commander brackets, in order
    pub brackets: Vec<BracketRulesResponse>,
}

/// What the catalog knows about a deck card's printing
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckCardCatalogResponse {
    /// The printed name
    pub name: String,
    /// Groups every printing of the same card, which is what a copy limit counts
    pub oracle_id: Option<Uuid>,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// Language of the printing, as Scryfall's code
    pub lang: String,
    /// Cardmarket's id of the product this printing is sold as
    pub cardmarket_id: Option<i32>,
    /// How rare the printing is
    pub rarity: CardRarity,
    /// Mana value
    pub mana_value: f64,
    /// Mana cost as printed, faces joined by ` // `
    pub mana_cost: String,
    /// Colour identity as the letters `WUBRG`
    pub color_identity: String,
    /// Type line as printed
    pub type_line: String,
    /// The formats this printing is legal in, of the ones the catalog tracks
    ///
    /// Only a "legal" set: a format missing here may be banned, restricted or
    /// simply not offered, which the client tells apart via Scryfall when it
    /// needs the reason.
    pub legal_formats: Vec<String>,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look
    pub image_normal: Option<String>,
    /// The back face's artwork for a list row
    ///
    /// `None` unless the card is photographed twice: a transform card, a modal
    /// double-faced card, a battle. A split card or an adventure prints both
    /// halves on one side, so there is nothing to turn over.
    pub image_back_small: Option<String>,
    /// The back face's artwork for a closer look
    pub image_back_normal: Option<String>,
    /// Market price in euro cents
    pub price_eur_cents: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil_cents: Option<i64>,
    /// The finishes this printing exists in, as Scryfall spells them
    pub finishes: Vec<String>,
    /// The colours the card can produce, as the letters `WUBRGC`
    ///
    /// What a mana base is counted with: sources of each colour against the
    /// pips the deck asks for.
    pub produced_mana: Vec<String>,
    /// Whether Wizards lists the card as a Game Changer
    ///
    /// The curated list behind the Commander brackets, refreshed with the
    /// catalog. A deck's bracket is checked against how many of these it plays.
    pub game_changer: bool,
    /// Whether the card is on the reserved list
    pub reserved: bool,
}

/// One slot of a deck, with the card it holds
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckCardResponse {
    /// Primary key
    pub uuid: DeckCardUuid,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies this slot holds
    pub quantity: i32,
    /// Which zone the slot sits in
    pub zone: DeckZone,
    /// Whether the copies in this slot are the foil ones
    pub foil: bool,
    /// The card, as far as the catalog knows it
    pub card: Option<DeckCardCatalogResponse>,
    /// The tags put on this slot
    pub tags: Vec<DeckTagUuid>,
}

/// An etiquette put on a deck's cards
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckTagResponse {
    /// Primary key
    pub uuid: DeckTagUuid,
    /// The deck it is local to, `null` for one offered on every deck
    pub deck: Option<DeckUuid>,
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
}

/// Everything a deck's card list draws
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListDeckCardsResponse {
    /// The slots, in the order they were added
    pub cards: Vec<DeckCardResponse>,
    /// The tags that can be put on them
    pub tags: Vec<DeckTagResponse>,
}

/// A card to put into a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddDeckCardRequest {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies to put in
    pub quantity: i32,
    /// Which zone it goes into
    pub zone: DeckZone,
    /// Whether the copies are the foil ones, `null` for the ordinary ones
    #[serde(default)]
    pub foil: Option<bool>,
}

/// Request to change some of a slot's fields, leaving the rest alone
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateDeckCardRequest {
    /// Scryfall's id of the printing — send this to sleeve a different print
    #[serde(default)]
    pub printing: Option<Uuid>,
    /// The new count
    #[serde(default)]
    pub quantity: Option<i32>,
    /// The zone to move it to
    #[serde(default)]
    pub zone: Option<DeckZone>,
    /// Whether the copies in this slot are the foil ones
    #[serde(default)]
    pub foil: Option<bool>,
}

/// A decklist to write into a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ImportDeckCardsRequest {
    /// The cards to put in
    pub cards: Vec<AddDeckCardRequest>,
    /// Whether to throw away what is in the deck first
    ///
    /// Replacing gives every slot a new id, so anything hanging off those ids
    /// is lost. That is right for "this decklist is the deck now" and wrong for
    /// everything else, which is why it is the caller's decision.
    pub replace: bool,
}

/// What an import wrote
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ImportDeckCardsResponse {
    /// How many slots were added
    pub added: u32,
}

/// A link to a deck on another site
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReadDeckUrlRequest {
    /// The link, as it was copied out of the address bar
    pub url: MaxStr<512>,
}

/// One card of a decklist read off another site
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReadDeckCardResponse {
    /// How many copies
    pub quantity: i32,
    /// The card's name, to be placed in the catalog by the client
    pub name: String,
    /// The set it was printed in, when the site says
    pub set_code: Option<String>,
    /// The collector number, when the site says
    pub collector_number: Option<String>,
    /// Which zone it sits in
    pub zone: DeckZone,
}

/// A decklist read off another site
///
/// Deliberately not written to any deck: the cards are placed in the catalog by
/// the client, exactly as a pasted list is, so both ways of importing end in
/// the same place.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReadDeckUrlResponse {
    /// What the deck is called there
    pub name: String,
    /// The format it is built for, as the site spells it
    pub format: Option<String>,
    /// The cards
    pub cards: Vec<ReadDeckCardResponse>,
}

/// One commander at the head of a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckCommanderResponse {
    /// The printed name
    pub name: String,
    /// Artwork for a tile
    pub image_small: Option<String>,
    /// Artwork for a wider tile
    pub image_normal: Option<String>,
    /// Colour identity as the letters `WUBRG`
    pub color_identity: String,
}

/// A deck as the list of decks shows it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeckOverviewResponse {
    /// The deck itself
    pub deck: DeckResponse,
    /// How many cards sit in the deck proper, the sideboard aside
    pub cards: i64,
    /// What those cards are worth in euro cents
    pub price_eur_cents: i64,
    /// The commanders, in the order they were put in
    pub commanders: Vec<DeckCommanderResponse>,
}

/// Request to create a tag on a deck
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateDeckTagRequest {
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
    /// Whether assignments follow the card through every deck and printing
    pub global: bool,
}

/// Request to rename a tag, change its marker or change which decks it is offered on
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateDeckTagRequest {
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
    /// Whether assignments follow the card through every deck and printing
    pub global: bool,
}

impl From<Deck> for DeckResponse {
    fn from(deck: Deck) -> Self {
        Self {
            uuid: deck.uuid,
            name: deck.name,
            description: deck.description,
            format: deck.format,
            visibility: deck.visibility,
            share_token: deck.share_token,
            allowed_color_identity: deck.allowed_color_identity,
            bracket: deck.bracket,
            folder: deck.folder,
            created_at: SchemaDateTime(deck.created_at),
        }
    }
}

impl From<&'static FormatRules> for FormatRulesResponse {
    fn from(rules: &'static FormatRules) -> Self {
        Self {
            slug: rules.slug.to_owned(),
            deck_size: rules.deck_size,
            max_copies: rules.max_copies,
            commander: rules.commander,
            sideboard: rules.sideboard,
            color_identity_locked: rules.color_identity_locked,
        }
    }
}

impl From<&'static BracketRules> for BracketRulesResponse {
    fn from(rules: &'static BracketRules) -> Self {
        Self {
            number: rules.number,
            slug: rules.slug.to_owned(),
            max_game_changers: rules.max_game_changers,
            mass_land_denial: rules.mass_land_denial,
            extra_turns: rules.extra_turns,
            two_card_combos: rules.two_card_combos,
        }
    }
}

impl From<ListedDeckCard> for DeckCardCatalogResponse {
    fn from(card: ListedDeckCard) -> Self {
        Self {
            name: card.name,
            oracle_id: card.oracle_id,
            set_code: card.set_code,
            set_name: card.set_name,
            collector_number: card.collector_number,
            lang: card.lang,
            cardmarket_id: card.cardmarket_id,
            rarity: card.rarity,
            mana_value: card.mana_value,
            mana_cost: card.mana_cost,
            color_identity: card.color_identity,
            type_line: card.type_line,
            legal_formats: split_list(&card.legal_formats),
            image_small: card.image_small,
            image_normal: card.image_normal,
            image_back_small: card.image_back_small,
            image_back_normal: card.image_back_normal,
            price_eur_cents: card.price_eur,
            price_eur_foil_cents: card.price_eur_foil,
            finishes: split_list(&card.finishes),
            produced_mana: card.produced_mana.chars().map(String::from).collect(),
            game_changer: card.game_changer,
            reserved: card.reserved,
        }
    }
}

impl From<ListedSlot> for DeckCardResponse {
    fn from(slot: ListedSlot) -> Self {
        Self {
            uuid: slot.uuid,
            printing: slot.printing,
            quantity: slot.quantity,
            zone: slot.zone,
            foil: slot.foil,
            card: slot.card.map(DeckCardCatalogResponse::from),
            tags: slot.tags,
        }
    }
}

impl From<DeckTag> for DeckTagResponse {
    fn from(tag: DeckTag) -> Self {
        Self {
            uuid: tag.uuid,
            deck: tag.deck,
            name: tag.name,
            color: tag.color,
            icon: tag.icon,
        }
    }
}

/// Split a comma-joined catalog column into its parts
fn split_list(joined: &str) -> Vec<String> {
    joined
        .split(',')
        .filter(|part| !part.is_empty())
        .map(str::to_owned)
        .collect()
}

impl DeckOverviewResponse {
    /// Put a deck and what was read about it together
    ///
    /// A deck the summary has no row for is one without cards, which is what a
    /// deck looks like right after it was created.
    pub fn new(deck: Deck, summary: Option<DeckSummary>) -> Self {
        let summary = summary.unwrap_or_default();
        Self {
            deck: DeckResponse::from(deck),
            cards: summary.cards,
            price_eur_cents: summary.price_eur,
            commanders: summary
                .commanders
                .into_iter()
                .map(DeckCommanderResponse::from)
                .collect(),
        }
    }
}

impl From<DeckCommander> for DeckCommanderResponse {
    fn from(commander: DeckCommander) -> Self {
        Self {
            name: commander.name,
            image_small: commander.image_small,
            image_normal: commander.image_normal,
            color_identity: commander.color_identity,
        }
    }
}
