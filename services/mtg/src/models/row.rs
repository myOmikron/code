//! Reading rows of raw queries

use galvyn::rorm;
use galvyn::rorm::db::row::RowError;

/// Turns a row error into the error the raw reads return
pub(in crate::models) fn decode(error: RowError<'_>) -> rorm::Error {
    rorm::Error::RowError(error.into_owned())
}
