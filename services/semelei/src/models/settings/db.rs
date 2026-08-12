use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::MaxStr;
use time::OffsetDateTime;
use time::Time;
use uuid::Uuid;

use crate::models::settings::ScheduleWeekday;

/// The shop's global settings
///
/// Exactly one row, identified by [`super::SETTINGS_UUID`] — a table with a
/// fixed primary key keeps "there is only one" a database fact instead of a
/// convention every query has to remember.
#[derive(Model, Debug)]
#[rorm(rename = "shopsettings")]
pub struct ShopSettingsModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The weekday orders are picked up on
    pub pickup_weekday: ScheduleWeekday,

    /// How many days before the pickup date orders close
    pub deadline_offset_days: i16,

    /// Wall-clock time (Europe/Berlin) orders close at
    pub deadline_time: Time,

    /// Url of the shop's imprint, shown in the public footer
    ///
    /// Lives in the database, not in the config: the operator maintains it
    /// themselves, and it points at whatever page they already have.
    pub imprint_url: Option<MaxStr<512>>,

    /// Url of the shop's privacy policy, shown in the public footer
    pub privacy_url: Option<MaxStr<512>>,

    /// The point in time the settings were last changed
    #[rorm(auto_create_time, auto_update_time)]
    pub updated_at: OffsetDateTime,
}

/// Insert patch for [`ShopSettingsModel`]
#[derive(Patch)]
#[rorm(model = "ShopSettingsModel")]
pub struct ShopSettingsInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The weekday orders are picked up on
    pub pickup_weekday: ScheduleWeekday,
    /// How many days before the pickup date orders close
    pub deadline_offset_days: i16,
    /// Wall-clock time (Europe/Berlin) orders close at
    pub deadline_time: Time,
    /// Url of the shop's imprint
    pub imprint_url: Option<MaxStr<512>>,
    /// Url of the shop's privacy policy
    pub privacy_url: Option<MaxStr<512>>,
}
