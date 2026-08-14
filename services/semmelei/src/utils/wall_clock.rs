//! A time of day as a form sends it
//!
//! galvyn's `SchemaTime` inherits `time`'s own serde format, which is
//! `[hour]:[minute]:[second].[subsecond]` with the fractional part required in
//! both directions. A browser's `<input type="time">` produces `13:00`, and
//! anything built from it reads `13:00:00`, which that format rejects: the body
//! fails to deserialize and the client gets a 400 with nothing in it.
//!
//! This is the same value on the wire, read leniently and written in the shape
//! a form field expects back.

use std::fmt;

use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::r#gen::SchemaGenerator;
use galvyn::core::re_exports::schemars::schema::InstanceType;
use galvyn::core::re_exports::schemars::schema::Metadata;
use galvyn::core::re_exports::schemars::schema::Schema;
use galvyn::core::re_exports::schemars::schema::SchemaObject;
use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::Serializer;
use serde::de;
use serde_json::json;
use time::Time;
use time::macros::format_description;

/// How the time is written out: seconds always, fractions never
const WRITE: &[time::format_description::FormatItem<'_>] =
    format_description!("[hour]:[minute]:[second]");

/// The shapes accepted on the way in, most specific first
const READ: [&[time::format_description::FormatItem<'_>]; 3] = [
    format_description!("[hour]:[minute]:[second].[subsecond]"),
    format_description!("[hour]:[minute]:[second]"),
    format_description!("[hour]:[minute]"),
];

/// A wall clock time of day, `13:00:00`
///
/// Wall clock, so no offset and no date: the shop's deadline is "one o'clock",
/// whatever that means on the day. See [`schedule`](crate::utils::schedule) for
/// where the timezone comes in.
#[derive(Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Hash, Debug)]
pub struct WallClock(pub Time);

impl Serialize for WallClock {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let formatted = self
            .0
            .format(WRITE)
            .map_err(|_| serde::ser::Error::custom("failed formatting a time of day"))?;
        serializer.serialize_str(&formatted)
    }
}

impl<'de> Deserialize<'de> for WallClock {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct WallClockVisitor;

        impl de::Visitor<'_> for WallClockVisitor {
            type Value = WallClock;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a time of day, e.g. \"13:00:00\"")
            }

            fn visit_str<E: de::Error>(self, value: &str) -> Result<WallClock, E> {
                READ.iter()
                    .find_map(|format| Time::parse(value, format).ok())
                    .map(WallClock)
                    .ok_or_else(|| E::custom(format!("{value:?} is not a time of day")))
            }
        }

        deserializer.deserialize_str(WallClockVisitor)
    }
}

impl JsonSchema for WallClock {
    fn is_referenceable() -> bool {
        true
    }

    fn schema_name() -> String {
        String::from("WallClock")
    }

    fn schema_id() -> std::borrow::Cow<'static, str> {
        std::borrow::Cow::Borrowed("WallClock")
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        SchemaObject {
            instance_type: Some(InstanceType::String.into()),
            format: Some(String::from("partial-date-time")),
            metadata: Some(Box::new(Metadata {
                examples: vec![json!("13:00:00")],
                ..Default::default()
            })),
            ..Default::default()
        }
        .into()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use time::macros::time;

    use super::WallClock;

    /// Reads a json string into a wall clock time
    fn read(value: &str) -> Option<WallClock> {
        serde_json::from_value(json!(value)).ok()
    }

    #[test]
    fn reads_what_a_time_field_produces() {
        assert_eq!(read("13:00"), Some(WallClock(time!(13:00:00))));
        assert_eq!(read("13:00:00"), Some(WallClock(time!(13:00:00))));
        assert_eq!(read("13:00:30"), Some(WallClock(time!(13:00:30))));
    }

    #[test]
    fn still_reads_what_it_used_to_send() {
        assert_eq!(read("13:00:00.0"), Some(WallClock(time!(13:00:00))));
    }

    #[test]
    fn refuses_what_is_not_a_time() {
        assert_eq!(read(""), None);
        assert_eq!(read("13"), None);
        assert_eq!(read("25:00:00"), None);
        assert_eq!(read("nachmittags"), None);
    }

    #[test]
    fn writes_seconds_and_no_fraction() {
        assert_eq!(
            serde_json::to_value(WallClock(time!(13:00:00))).unwrap(),
            json!("13:00:00")
        );
    }
}
