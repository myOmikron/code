//! The Bakery order: what goes to the Bakery at the Dispatch, and its CSV

use std::collections::BTreeMap;
use std::collections::HashMap;

use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use time::Date;
use tracing::instrument;
use tracing::warn;

use crate::models::Item;
use crate::models::ItemUuid;
use crate::models::Order;
use crate::models::OrderItem;
use crate::models::OrderStatus;
use crate::models::PickupDay;

/// One position of a non-cancelled order, as the Bakery order sees it
pub struct BakeryPosition<'a> {
    /// The live Bakery Article Number of the position's Item
    pub article_number: &'a str,
    /// Item name (snapshot at order time)
    pub name: &'a str,
    /// How many units were ordered
    pub quantity: i64,
    /// Price per unit in euro cents (snapshot at order time)
    pub price_cents: i64,
}

/// One line of the Bakery order: everything ordered under one article number
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BakeryLine {
    /// The Bakery Article Number
    pub article_number: String,
    /// The distinct item names under the number, in the order they were first seen
    pub names: Vec<String>,
    /// How many units, summed over all positions
    pub quantity: i64,
    /// Price per unit in euro cents, taken from the first position
    pub price_cents: i64,
    /// Prices of later positions that differ from [`Self::price_cents`], ascending
    pub differing_prices: Vec<i64>,
}

/// The CSV's header line
const HEADER: [&str; 4] = ["Artikel", "Artikelnummer", "Menge", "Einzelpreis"];

/// The content type the CSV is attached with
pub const CONTENT_TYPE: &str = "text/csv; charset=utf-8";

/// Group positions into Bakery lines, sorted by article number
pub fn build_lines<'a>(positions: impl IntoIterator<Item = BakeryPosition<'a>>) -> Vec<BakeryLine> {
    let mut lines: BTreeMap<&str, BakeryLine> = BTreeMap::new();
    for position in positions {
        let line = lines
            .entry(position.article_number)
            .or_insert_with(|| BakeryLine {
                article_number: position.article_number.to_string(),
                names: Vec::new(),
                quantity: 0,
                price_cents: position.price_cents,
                differing_prices: Vec::new(),
            });
        line.quantity += position.quantity;
        if !line.names.iter().any(|name| name == position.name) {
            line.names.push(position.name.to_string());
        }
        if position.price_cents != line.price_cents
            && !line.differing_prices.contains(&position.price_cents)
        {
            line.differing_prices.push(position.price_cents);
        }
    }
    lines
        .into_values()
        .map(|mut line| {
            line.differing_prices.sort_unstable();
            line
        })
        .collect()
}

/// Render the lines as the CSV the Bakery imports
///
/// UTF-8 with a BOM, so Excel shows the umlauts; `;`-separated with CRLF
/// line ends, as a German Excel expects.
pub fn render_csv(lines: &[BakeryLine]) -> Vec<u8> {
    let mut csv = String::from("\u{feff}");
    push_row(&mut csv, &HEADER.map(String::from));
    for line in lines {
        push_row(
            &mut csv,
            &[
                line.names.join(" / "),
                line.article_number.clone(),
                line.quantity.to_string(),
                format_price(line.price_cents),
            ],
        );
    }
    csv.into_bytes()
}

/// Append one CSV row, quoting the fields that need it (RFC 4180)
fn push_row(csv: &mut String, fields: &[String; 4]) {
    let fields: Vec<String> = fields.iter().map(|field| quote(field)).collect();
    csv.push_str(&fields.join(";"));
    csv.push_str("\r\n");
}

/// Quote a field if it holds the separator, a quote or a line break
fn quote(field: &str) -> String {
    if field.contains([';', '"', '\r', '\n']) {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// Euro cents with a decimal comma and no currency sign, `2,50`
///
/// The Bakery's spreadsheet reads that as a number.
fn format_price(cents: i64) -> String {
    format!("{},{:02}", cents / 100, (cents % 100).abs())
}

/// The file name of a pickup day's CSV
pub fn filename(pickup_date: Date) -> String {
    format!("bestellung-{pickup_date}.csv")
}

/// The live Bakery Article Number of every Item that has one
pub async fn article_numbers(
    exe: impl Executor<'_>,
) -> Result<HashMap<ItemUuid, String>, rorm::Error> {
    Ok(Item::get_all(exe)
        .await?
        .into_iter()
        .filter_map(|item| Some((item.uuid, item.bakery_article_number?.to_string())))
        .collect())
}

/// The Bakery order of a pickup day, from all its non-cancelled orders
///
/// The article number is read live through each position's Item link (#84):
/// positions of deleted Items or of Items without a number are left out.
/// Differing prices under one number are logged, the CSV uses the first.
#[instrument(name = "bakery::bakery_order", skip(tx, day), fields(pickup_date = %day.pickup_date))]
pub async fn bakery_order(
    tx: &mut Transaction,
    day: &PickupDay,
) -> Result<Vec<BakeryLine>, rorm::Error> {
    let numbers = article_numbers(&mut *tx).await?;

    let mut positions: Vec<(String, OrderItem)> = Vec::new();
    for order in Order::get_by_pickup_day(&mut *tx, day.uuid).await? {
        if order.status == OrderStatus::Cancelled {
            continue;
        }
        for position in OrderItem::get_by_order(&mut *tx, order.uuid).await? {
            if let Some(number) = position.item.and_then(|item| numbers.get(&item)) {
                positions.push((number.clone(), position));
            }
        }
    }

    let lines = build_lines(positions.iter().map(|(number, position)| BakeryPosition {
        article_number: number,
        name: &position.name,
        quantity: position.quantity,
        price_cents: position.price_cents,
    }));
    for line in &lines {
        if !line.differing_prices.is_empty() {
            warn!(
                article_number = %line.article_number,
                price_cents = line.price_cents,
                differing_prices = ?line.differing_prices,
                "Items sharing a Bakery Article Number have different prices, the CSV uses the first"
            );
        }
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use time::macros::date;

    use super::*;

    fn position<'a>(
        number: &'a str,
        name: &'a str,
        quantity: i64,
        price: i64,
    ) -> BakeryPosition<'a> {
        BakeryPosition {
            article_number: number,
            name,
            quantity,
            price_cents: price,
        }
    }

    fn line(number: &str, names: &[&str], quantity: i64, price: i64) -> BakeryLine {
        BakeryLine {
            article_number: number.to_string(),
            names: names.iter().map(|name| name.to_string()).collect(),
            quantity,
            price_cents: price,
            differing_prices: Vec::new(),
        }
    }

    #[test]
    fn positions_under_one_number_become_one_line() {
        let lines = build_lines([
            position("00412", "Semmel", 2, 45),
            position("00412", "Kaisersemmel", 3, 45),
            position("00412", "Semmel", 1, 45),
        ]);

        assert_eq!(
            lines,
            vec![line("00412", &["Semmel", "Kaisersemmel"], 6, 45)]
        );
    }

    #[test]
    fn lines_are_sorted_by_article_number() {
        let lines = build_lines([
            position("B-17", "Brezel", 1, 90),
            position("00412", "Semmel", 1, 45),
        ]);

        let numbers: Vec<&str> = lines.iter().map(|l| l.article_number.as_str()).collect();
        assert_eq!(numbers, vec!["00412", "B-17"]);
    }

    #[test]
    fn the_first_price_wins_and_others_are_reported() {
        let lines = build_lines([
            position("00412", "Semmel", 1, 45),
            position("00412", "Kaisersemmel", 1, 50),
            position("00412", "Semmel", 1, 45),
        ]);

        assert_eq!(lines[0].price_cents, 45);
        assert_eq!(lines[0].differing_prices, vec![50]);
    }

    #[test]
    fn the_csv_has_a_bom_a_header_and_crlf_lines() {
        let csv = render_csv(&[
            line("00412", &["Semmel", "Kaisersemmel"], 6, 250),
            line("B-17", &["Brezel"], 1, 90),
        ]);

        assert_eq!(
            csv,
            "\u{feff}Artikel;Artikelnummer;Menge;Einzelpreis\r\n\
             Semmel / Kaisersemmel;00412;6;2,50\r\n\
             Brezel;B-17;1;0,90\r\n"
                .as_bytes()
        );
    }

    #[test]
    fn fields_with_separators_or_quotes_are_quoted() {
        let csv = render_csv(&[line("7;1", &["Das \"Große\" Brot"], 1, 1000)]);

        assert_eq!(
            csv,
            "\u{feff}Artikel;Artikelnummer;Menge;Einzelpreis\r\n\
             \"Das \"\"Große\"\" Brot\";\"7;1\";1;10,00\r\n"
                .as_bytes()
        );
    }

    #[test]
    fn the_file_is_named_after_the_pickup_date() {
        assert_eq!(filename(date!(2026 - 10 - 24)), "bestellung-2026-10-24.csv");
    }
}
