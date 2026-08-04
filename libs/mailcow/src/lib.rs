//! # mailcow
//!
//! A Rust client for interacting with the Mailcow API.
//!
//! This module provides a structured way to communicate with Mailcow's REST API
//! using HTTP requests. It handles authentication via API keys and provides
//! a clean interface for making API calls.
//!
//! # Example
//!
//! ```no_run
//! use mailcow::MailcowClient;
//! use reqwest::Url;
//!
//! fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let base_url = Url::parse("https://mailcow.example.com")?;
//!     let client = MailcowClient::new(base_url, "your-api-key".to_string())?;
//!     // Use client to make API calls
//!     Ok(())
//! }
//! ```
//!
//! # Features
//!
//! - HTTP client with timeout configuration
//! - Automatic API key header injection
//! - Async/await support
//! - Error handling through `MailcowResult`
//! - Tracing instrumentation for debugging
//!
//! # Modules
//!
//! * `error` - Contains error types and result definitions for the Mailcow client

#![warn(missing_docs)]

use std::time::Duration;

use reqwest::Client;
use reqwest::Url;
use reqwest::header::HeaderMap;
use reqwest::header::HeaderValue;
use tracing::instrument;

use crate::error::MailcowResult;

pub mod domain_admins;
pub mod domains;
pub mod error;
pub mod mailboxes;
pub mod status;
mod utils;

/// A client for interacting with the Mailcow API
///
/// This struct provides methods to communicate with a Mailcow mail server API,
/// handling HTTP requests and responses with proper error handling.
#[derive(Debug, Clone)]
pub struct MailcowClient {
    client: Client,
    base_url: Url,
}

impl MailcowClient {
    /// Creates a new instance of `MailcowClient` with the specified base URL and API key.
    ///
    /// This function initializes an HTTP client with a 10-second timeout and sets up the necessary
    /// headers for API authentication. The API key is added as a custom header named "X-API-Key".
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the Mailcow API server as a `Url` type
    /// * `api_key` - The API key string used for authentication with the Mailcow API
    #[instrument(name = "MailcowClient::new", skip(api_key))]
    pub fn new(base_url: Url, api_key: String) -> MailcowResult<Self> {
        let mut headers = HeaderMap::new();
        headers.insert("X-API-Key", HeaderValue::try_from(api_key)?);
        Ok(Self {
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .default_headers(headers)
                .build()?,
            base_url,
        })
    }
}
