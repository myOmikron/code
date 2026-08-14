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
    ///
    /// Leads the index an import resolves against — a set code and a collector
    /// number are how an exported collection names a card, and the catalog
    /// holds every language of every printing to search through. Leading the
    /// index also means it still answers everything a lone one on this column
    /// did, which is why there is no second one.
    #[rorm(index(name = "printing_coordinate", priority = 1))]
    pub set_code: MaxStr<16>,

    /// Full set name
    pub set_name: MaxStr<255>,

    /// Collector number as printed, which is not always a number
    #[rorm(index(name = "printing_coordinate", priority = 2))]
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

    /// Mana cost as Scryfall spells it — `{1}{W}`, split cards joined by ` // `
    ///
    /// A two-faced card carries its costs per face; they are joined here the
    /// same way, so counting pips over the string counts every castable half.
    ///
    /// The default backfills rows from before the column existed — the next
    /// catalog sync overwrites every row anyway.
    #[rorm(default = "")]
    pub mana_cost: MaxStr<128>,

    /// Illustrator, empty when Scryfall has none on file
    ///
    /// Defaulted for the same reason as [`Self::mana_cost`].
    #[rorm(default = "")]
    pub artist: MaxStr<255>,

    /// The rules keywords Scryfall recognised, comma separated
    ///
    /// Defaulted for the same reason as [`Self::mana_cost`].
    #[rorm(default = "")]
    pub keywords: MaxStr<512>,

    /// The tracked formats this card is legal in, comma separated
    ///
    /// Only the formats the statistics ask about, not Scryfall's full map —
    /// see `TRACKED_FORMATS` in the statistics module.
    ///
    /// Defaulted for the same reason as [`Self::mana_cost`].
    #[rorm(default = "")]
    pub legal_formats: MaxStr<128>,

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
