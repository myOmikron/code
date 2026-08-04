//! This module provides error handling for the mailcow crate.

use thiserror::Error;

/// Result type for the mailcow crate.
pub type MailcowResult<T> = Result<T, MailcowError>;

/// Errors for the mailcow crate.
#[derive(Debug, Error)]
#[allow(missing_docs)]
pub enum MailcowError {
    #[error("Invalid header value")]
    InvalidHeaderValue(#[from] reqwest::header::InvalidHeaderValue),
    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("Access denied for this action")]
    Unauthorized,
    #[error("Error deserializing response, {error}, {original}")]
    Deserialize {
        error: serde_json::Error,
        original: String,
    },
    #[error("Got invalid and unexpected data")]
    UnknownError,
}
