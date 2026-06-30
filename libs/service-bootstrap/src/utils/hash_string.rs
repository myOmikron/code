//! NewType wrapper for a valid file hash string (MD5, SHA-1, or SHA-256)

use thiserror::Error;

const MD5_LEN: usize = 32;
const SHA1_LEN: usize = 40;
const SHA256_LEN: usize = 64;

/// A validated hex hash string identifying a file.
///
/// Accepts MD5 (32 hex chars), SHA-1 (40 hex chars), or SHA-256 (64 hex chars).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HashString(String);

/// Error returned when constructing a [`HashString`] fails
#[derive(Debug, Error)]
pub enum HashStringError {
    /// The string contains non-hexadecimal characters
    #[error("Hash contains non-hexadecimal characters")]
    NonHexCharacters,
    /// The length does not match MD5 (32), SHA-1 (40), or SHA-256 (64)
    #[error("Hash length {0} is invalid; expected 32 (MD5), 40 (SHA-1), or 64 (SHA-256)")]
    InvalidLength(usize),
}

impl HashString {
    /// Validate and wrap `hash`.
    ///
    /// Returns [`HashStringError::NonHexCharacters`] if any character is not a
    /// lowercase or uppercase ASCII hex digit, and [`HashStringError::InvalidLength`]
    /// if the length is not 32, 40, or 64.
    pub fn new(hash: String) -> Result<Self, HashStringError> {
        if !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(HashStringError::NonHexCharacters);
        }

        match hash.len() {
            MD5_LEN | SHA1_LEN | SHA256_LEN => Ok(Self(hash)),
            len => Err(HashStringError::InvalidLength(len)),
        }
    }

    /// Returns the inner hash string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for HashString {
    type Error = HashStringError;

    fn try_from(hash: String) -> Result<Self, Self::Error> {
        Self::new(hash)
    }
}

impl From<HashString> for String {
    fn from(h: HashString) -> Self {
        h.0
    }
}

impl std::fmt::Display for HashString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
