//! Database model backing [`super`]

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::card_attributes::CardRarity;

/// One printing of a card, as far as listing a collection needs it
///
/// A copy of the part of Scryfall's catalog that queries have to touch — name,
/// set, rarity, colours, price, artwork. Not the whole card object: rules text,
/// legalities and faces are only ever read one card at a time, and the client
/// already has them cached from the detail view.
///
/// The rows are refreshed wholesale by `sync-catalog`, so nothing here is
/// authored by this service and nothing here is worth preserving on conflict —
/// Scryfall is the only writer.
#[derive(Model, Debug)]
#[rorm(rename = "printing")]
pub struct PrintingModel {
    /// Scryfall's id of the printing
    ///
    /// The same value `collection_entry.printing` holds. Deliberately not
    /// joined by a foreign key: a card can be filed before the catalog has
    /// caught up with the set it came from, and an entry that cannot be saved
    /// because a sync is overdue would be the worse failure.
    #[rorm(primary_key)]
    pub id: Uuid,

    /// Groups every printing of the same card
    #[rorm(index)]
    pub oracle_id: Option<Uuid>,

    /// The printed name
    #[rorm(index)]
    pub name: MaxStr<512>,

    /// The name folded for searching and sorting — lowercase, accents removed
    ///
    /// Sorting by the printed name would put "Æther Vial" and "Ölvæk" wherever
    /// the database's collation feels like, and a search would miss them.
    #[rorm(index)]
    pub name_sort: MaxStr<512>,

    /// Set code, upper case
    #[rorm(index)]
    pub set_code: MaxStr<16>,

    /// Full set name
    pub set_name: MaxStr<255>,

    /// Collector number as printed, which is not always a number
    pub collector_number: MaxStr<32>,

    /// The leading digits of the collector number
    ///
    /// Sorting by the printed value puts "10" before "9". This is what a
    /// collection sorted "by set, then by number" actually orders by.
    pub collector_number_sort: i32,

    /// How rare the printing is
    pub rarity: CardRarity,

    /// Where the rarity sits on the ladder — see [`CardRarity::rank`]
    pub rarity_rank: i16,

    /// Mana value, which Scryfall reports fractional for the joke sets
    pub mana_value: f64,

    /// Colour identity as the letters `WUBRG`, empty for colourless
    pub color_identity: MaxStr<8>,

    /// Type line as printed
    pub type_line: MaxStr<255>,

    /// Language of this printing, as Scryfall's code
    pub lang: MaxStr<16>,

    /// The day the printing was released
    pub released_at: Option<Date>,

    /// Scryfall's finishes, comma separated — `nonfoil,foil`
    pub finishes: MaxStr<64>,

    /// Artwork for a list row
    pub image_small: Option<MaxStr<512>>,

    /// Artwork for the detail view
    pub image_normal: Option<MaxStr<512>>,

    /// Market price in euro cents, `None` when unpriced
    ///
    /// Cents rather than a float: these are summed over a whole collection, and
    /// a binary fraction of a euro does not add up to what a person expects.
    pub price_eur: Option<i64>,

    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,

    /// Whether the card is on the reserved list
    pub reserved: bool,

    /// When this row last came out of a sync
    #[rorm(auto_create_time)]
    pub updated_at: OffsetDateTime,
}
