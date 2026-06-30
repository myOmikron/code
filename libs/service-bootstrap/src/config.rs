//! Helpers for loading env vars with upfront validation.

use std::env;
use std::env::VarError;
use std::fmt;

use galvyn::core::misc::serde_parse::StringParseDeserializer;
use serde::de::DeserializeOwned;

/// Collect errors from multiple env var lookups, then report them all at once.
#[derive(Default)]
pub struct EnvLoader {
    errors: Vec<String>,
}

impl EnvLoader {
    /// Constructs a new `EnvLoader`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Load a required env var. Returns `None` and records an error if missing or empty.
    pub fn require(&mut self, name: &str) -> Option<String> {
        match env::var(name) {
            Ok(val) if !val.is_empty() => Some(val),
            Ok(_) => {
                self.errors.push(format!("{name}: must not be empty"));
                None
            }
            Err(VarError::NotPresent) => {
                self.errors.push(format!("{name}: required but not set"));
                None
            }
            Err(VarError::NotUnicode(_)) => {
                self.errors.push(format!("{name}: invalid unicode"));
                None
            }
        }
    }

    /// Load an optional env var with a default.
    pub fn optional(&self, name: &str, default: &str) -> String {
        env::var(name).unwrap_or_else(|_| default.to_string())
    }

    /// Load a required env var and parse it into `T`.
    pub fn require_parse<T: std::str::FromStr>(&mut self, name: &str) -> Option<T>
    where
        T::Err: fmt::Display,
    {
        match self.require(name) {
            Some(val) => match val.parse() {
                Ok(parsed) => Some(parsed),
                Err(err) => {
                    self.errors.push(format!("{name}: {err}"));
                    None
                }
            },
            None => None,
        }
    }

    /// Load a required env var and deserialize it into `T`.
    pub fn require_deserialize<T: DeserializeOwned>(&mut self, name: &str) -> Option<T> {
        let val = self.require(name)?;
        T::deserialize(StringParseDeserializer::new(val))
            .inspect_err(|err| {
                self.errors.push(format!("{name}: {err}"));
            })
            .ok()
    }

    /// Load an optional env var with a default and parse it into `T`.
    pub fn optional_parse<T: std::str::FromStr>(&mut self, name: &str, default: &str) -> Option<T>
    where
        T::Err: fmt::Display,
    {
        let val = self.optional(name, default);
        match val.parse() {
            Ok(parsed) => Some(parsed),
            Err(err) => {
                self.errors.push(format!("{name}: {err}"));
                None
            }
        }
    }

    /// Load an optional env var with a default, converting to the target type.
    pub fn optional_into<T: From<String>>(&self, name: &str, default: &str) -> T {
        self.optional(name, default).into()
    }

    /// Finish loading. Returns `Ok(())` if no errors, or `Err` with all collected errors.
    pub fn finish(self) -> Result<(), ConfigError> {
        if self.errors.is_empty() {
            Ok(())
        } else {
            Err(ConfigError(self.errors))
        }
    }
}

/// Error containing all missing/invalid env var messages.
pub struct ConfigError(Vec<String>);

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "missing or invalid environment variables:")?;
        for err in &self.0 {
            writeln!(f, "  - {err}")?;
        }
        Ok(())
    }
}

impl fmt::Debug for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl std::error::Error for ConfigError {}
