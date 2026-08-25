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

    /// Cardmarket's id of the product this printing is sold as
    ///
    /// The whole address: Cardmarket resolves `/Magic/Products?idProduct=…` to
    /// the product page, under any of its country domains, which is why nothing
    /// about the url itself is stored. Their product names and set names differ
    /// from Scryfall's often enough that building the path by hand would miss.
    ///
    /// `None` for everything Cardmarket does not stock as a product (tokens,
    /// digital-only printings) and for rows written before this column existed;
    /// the next catalog sync fills those in.
    pub cardmarket_id: Option<i32>,

    /// The day the printing was released
    pub released_at: Option<Date>,

    /// Scryfall's finishes, comma separated — `nonfoil,foil`
    pub finishes: MaxStr<64>,

    /// Artwork for a list row
    pub image_small: Option<MaxStr<512>>,

    /// Artwork for the detail view
    pub image_normal: Option<MaxStr<512>>,

    /// The back face's artwork for a list row
    ///
    /// Only a card that is photographed twice has one: a transform card, a
    /// modal double-faced card, a battle. A split or an adventure prints both
    /// halves on the one side and leaves this `None`, which is what tells the
    /// client whether there is anything to flip to.
    pub image_back_small: Option<MaxStr<512>>,

    /// The back face's artwork for the detail view, see [`Self::image_back_small`]
    pub image_back_normal: Option<MaxStr<512>>,

    /// Market price in euro cents, `None` when unpriced
    ///
    /// Cents rather than a float: these are summed over a whole collection, and
    /// a binary fraction of a euro does not add up to what a person expects.
    pub price_eur: Option<i64>,

    /// Foil market price in euro cents
    pub price_eur_foil: Option<i64>,

    /// The colours the card can produce, as the letters `WUBRGC`
    ///
    /// Scryfall's `produced_mana`. What a mana base is counted with: how many
    /// sources of each colour a deck plays against how many pips it asks for.
    /// Deriving it would mean reading rules text, which the catalog does not
    /// carry.
    #[rorm(default = "")]
    pub produced_mana: MaxStr<16>,

    /// Whether Wizards lists the card as a Game Changer
    ///
    /// The curated list behind the Commander brackets. It is a judgement, not a
    /// rule that can be derived from a card, so it is taken from Scryfall's
    /// `game_changer` flag and refreshed with the rest of the catalog.
    #[rorm(default = false)]
    pub game_changer: bool,

    /// Whether the card denies lands en masse
    ///
    /// Derived from the rules text once per sync rather than stored as the
    /// text itself: the answer is a property of the oracle card and cannot
    /// change between syncs, and two booleans per row cost a megabyte across
    /// the catalog where the text they were read from would cost ninety.
    /// Brackets 1 to 3 play none of these — see `utils::bracket_flags`.
    #[rorm(default = false)]
    pub mass_land_denial: bool,

    /// Whether the card takes extra turns, which brackets 1 and 2 play none of
    #[rorm(default = false)]
    pub extra_turns: bool,

    /// Whether the card is on the reserved list
    pub reserved: bool,

    /// When this row last came out of a sync
    #[rorm(auto_create_time)]
    pub updated_at: OffsetDateTime,
}
