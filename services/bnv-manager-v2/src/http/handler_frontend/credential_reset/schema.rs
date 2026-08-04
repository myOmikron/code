use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

/// Response for verifying a reset code
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VerifyResetCodeResponse {
    /// Display name of the account
    pub display_name: MaxStr<255>,
}

/// Request to reset a password using a code
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResetPasswordRequest {
    /// The new password
    pub password: MaxStr<72>,
}

/// Errors that can occur while resetting a password
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, Default)]
pub struct ResetPasswordError {
    /// The code is invalid or not found
    pub invalid_code: bool,
    /// The code has expired
    pub expired: bool,
    /// The password entropy is too low
    pub low_entropy: bool,
}
