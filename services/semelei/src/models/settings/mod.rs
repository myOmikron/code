//! The shop's global settings: which weekday is pickup day, and when orders close

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm;
use galvyn::rorm::db::Executor;
use galvyn::rorm::db::transaction::Transaction;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use service_bootstrap::custom_db_enum;
use time::Time;
use time::Weekday;
use tracing::instrument;
use uuid::Uuid;
use uuid::uuid;

use crate::models::settings::db::ShopSettingsInsertPatch;
use crate::models::settings::db::ShopSettingsModel;

pub(in crate::models) mod db;

/// Primary key of the one and only settings row
const SETTINGS_UUID: Uuid = uuid!("00000000-0000-0000-0000-000000000001");

/// A weekday, stored by name
///
/// [`time::Weekday`] cannot be a database field, and a plain integer would
/// leave the numbering (Monday = 0? = 1? = 7?) implicit in every conversion.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ScheduleWeekday {
    /// Monday
    Monday,
    /// Tuesday
    Tuesday,
    /// Wednesday
    Wednesday,
    /// Thursday
    Thursday,
    /// Friday
    Friday,
    /// Saturday
    Saturday,
    /// Sunday
    Sunday,
}
custom_db_enum! {
    enum: ScheduleWeekday,
    variants: [Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday],
    decoder: ScheduleWeekdayDecoder,
}

impl From<ScheduleWeekday> for Weekday {
    fn from(value: ScheduleWeekday) -> Self {
        match value {
            ScheduleWeekday::Monday => Weekday::Monday,
            ScheduleWeekday::Tuesday => Weekday::Tuesday,
            ScheduleWeekday::Wednesday => Weekday::Wednesday,
            ScheduleWeekday::Thursday => Weekday::Thursday,
            ScheduleWeekday::Friday => Weekday::Friday,
            ScheduleWeekday::Saturday => Weekday::Saturday,
            ScheduleWeekday::Sunday => Weekday::Sunday,
        }
    }
}

impl From<Weekday> for ScheduleWeekday {
    fn from(value: Weekday) -> Self {
        match value {
            Weekday::Monday => ScheduleWeekday::Monday,
            Weekday::Tuesday => ScheduleWeekday::Tuesday,
            Weekday::Wednesday => ScheduleWeekday::Wednesday,
            Weekday::Thursday => ScheduleWeekday::Thursday,
            Weekday::Friday => ScheduleWeekday::Friday,
            Weekday::Saturday => ScheduleWeekday::Saturday,
            Weekday::Sunday => ScheduleWeekday::Sunday,
        }
    }
}

/// Everything about the shop an admin can configure
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShopSettings {
    /// The weekday orders are picked up on
    pub pickup_weekday: ScheduleWeekday,

    /// How many days before the pickup date orders close
    ///
    /// `1` with a Saturday pickup means "Friday", `0` would mean the pickup
    /// day itself.
    pub deadline_offset_days: i16,

    /// Wall-clock time (Europe/Berlin) orders close at
    pub deadline_time: Time,

    /// Url of the shop's imprint, shown in the public footer while set
    pub imprint_url: Option<MaxStr<512>>,

    /// Url of the shop's privacy policy, shown in the public footer while set
    pub privacy_url: Option<MaxStr<512>>,
}

impl Default for ShopSettings {
    fn default() -> Self {
        Self {
            pickup_weekday: ScheduleWeekday::Saturday,
            deadline_offset_days: 1,
            deadline_time: Time::from_hms(16, 0, 0)
                .unwrap_or_else(|_| unreachable!("16:00:00 is a valid time")),
            imprint_url: None,
            privacy_url: None,
        }
    }
}

impl ShopSettings {
    /// Fetch the settings, falling back to the defaults while none were saved
    ///
    /// Deliberately does not write the defaults: this runs on every public
    /// shop request, and a read should not need a writable transaction.
    #[instrument(name = "ShopSettings::get", skip(exe))]
    pub async fn get(exe: impl Executor<'_>) -> Result<ShopSettings, rorm::Error> {
        let settings = rorm::query(exe, ShopSettingsModel)
            .condition(ShopSettingsModel.uuid.equals(SETTINGS_UUID))
            .optional()
            .await?;
        Ok(settings.map(ShopSettings::from).unwrap_or_default())
    }

    /// Save the settings, creating the row on first use
    ///
    /// Takes a transaction: update and insert have to be one step, otherwise
    /// two admins saving at once both see "no row" and both insert.
    #[instrument(name = "ShopSettings::set", skip(tx))]
    pub async fn set(tx: &mut Transaction, settings: ShopSettings) -> Result<(), rorm::Error> {
        let affected = rorm::update(&mut *tx, ShopSettingsModel)
            .set(ShopSettingsModel.pickup_weekday, settings.pickup_weekday)
            .set(
                ShopSettingsModel.deadline_offset_days,
                settings.deadline_offset_days,
            )
            .set(ShopSettingsModel.deadline_time, settings.deadline_time)
            .set(ShopSettingsModel.imprint_url, settings.imprint_url.clone())
            .set(ShopSettingsModel.privacy_url, settings.privacy_url.clone())
            .condition(ShopSettingsModel.uuid.equals(SETTINGS_UUID))
            .await?;

        if affected == 0 {
            rorm::insert(&mut *tx, ShopSettingsModel)
                .single(&ShopSettingsInsertPatch {
                    uuid: SETTINGS_UUID,
                    pickup_weekday: settings.pickup_weekday,
                    deadline_offset_days: settings.deadline_offset_days,
                    deadline_time: settings.deadline_time,
                    imprint_url: settings.imprint_url,
                    privacy_url: settings.privacy_url,
                })
                .await?;
        }

        Ok(())
    }
}

impl From<ShopSettingsModel> for ShopSettings {
    fn from(value: ShopSettingsModel) -> Self {
        Self {
            pickup_weekday: value.pickup_weekday,
            deadline_offset_days: value.deadline_offset_days,
            deadline_time: value.deadline_time,
            imprint_url: value.imprint_url,
            privacy_url: value.privacy_url,
        }
    }
}
