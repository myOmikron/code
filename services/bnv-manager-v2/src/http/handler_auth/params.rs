//! Request parameters of the authorization and the token endpoint
//!
//! RFC 6749 §3.1 and §3.2: "Parameters sent without a value MUST be treated as if they were
//! omitted from the request. [...] Request and response parameters MUST NOT be included
//! more than once."

use std::collections::HashMap;
use std::collections::hash_map::Entry;

/// The `application/x-www-form-urlencoded` parameters of a request, the empty ones dropped
#[derive(Debug, Clone)]
pub struct Params(Vec<(String, String)>);

/// A parameter was sent more than once
#[derive(Debug, Clone, Copy)]
pub struct Repeated;

impl Params {
    /// Parses a query string or form body
    pub fn parse(input: &[u8]) -> Self {
        Self(
            url::form_urlencoded::parse(input)
                .filter(|(_, value)| !value.is_empty())
                .map(|(name, value)| (name.into_owned(), value.into_owned()))
                .collect(),
        )
    }

    /// The value of the parameter `name`, `None` when it is missing or empty
    pub fn single(&self, name: &str) -> Result<Option<&str>, Repeated> {
        let mut values = self
            .0
            .iter()
            .filter(|(key, _)| key == name)
            .map(|(_, value)| value.as_str());
        let first = values.next();
        if values.next().is_some() {
            return Err(Repeated);
        }
        Ok(first)
    }

    /// Every parameter by its name, failing when any of them is repeated
    pub fn into_unique(self) -> Result<HashMap<String, String>, Repeated> {
        let mut parameters = HashMap::with_capacity(self.0.len());
        for (name, value) in self.0 {
            match parameters.entry(name) {
                Entry::Occupied(_) => return Err(Repeated),
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
            }
        }
        Ok(parameters)
    }
}
