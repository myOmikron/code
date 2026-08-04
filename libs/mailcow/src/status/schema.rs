//! Schema of the status endpoints

use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(missing_docs)]
pub struct Version {
    pub version: String,
}
