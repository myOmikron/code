//! Cutting a streamed json array into its top-level objects
//!
//! Scryfall's bulk files are a single array holding every printing — the
//! largest is measured in gigabytes. Handing that to `serde_json` in one piece
//! would mean holding all of it in memory at once, so the bytes are split as
//! they arrive and each object is deserialized on its own.
//!
//! The split is done by counting braces rather than by reading lines, which
//! makes it indifferent to what separates the objects. Scryfall has moved from
//! a json array to one object per line since this was written, and that change
//! cost this nothing: commas, newlines and the enclosing brackets are all just
//! bytes outside a brace.

/// Splits a stream of json array bytes into the objects it contains
#[derive(Debug, Default)]
pub struct JsonObjects {
    /// Bytes of the object currently being read
    current: Vec<u8>,
    /// How deep into nested objects and arrays the cursor is
    depth: usize,
    /// Whether the cursor sits inside a string, where braces mean nothing
    in_string: bool,
    /// Whether the previous byte was a backslash inside a string
    escaped: bool,
}

impl JsonObjects {
    /// Feeds the next bytes and returns whatever objects they completed
    ///
    /// Anything outside a top-level object — the enclosing brackets, the commas
    /// between elements, whitespace — is dropped.
    ///
    /// # Returns
    /// The complete objects, each as its own byte vector
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Vec<u8>> {
        let mut finished = Vec::new();

        for byte in bytes {
            if self.depth > 0 {
                self.current.push(*byte);
            }

            if self.in_string {
                if self.escaped {
                    self.escaped = false;
                } else if *byte == b'\\' {
                    self.escaped = true;
                } else if *byte == b'"' {
                    self.in_string = false;
                }
                continue;
            }

            match *byte {
                b'"' => self.in_string = true,
                b'{' | b'[' => {
                    // The array's own opening bracket starts nothing: only a
                    // brace at depth zero begins an object worth keeping.
                    if self.depth == 0 {
                        if *byte == b'{' {
                            self.current.push(*byte);
                            self.depth = 1;
                        }
                    } else {
                        self.depth += 1;
                    }
                }
                b'}' | b']' => {
                    if self.depth > 0 {
                        self.depth -= 1;
                        if self.depth == 0 {
                            finished.push(std::mem::take(&mut self.current));
                        }
                    }
                }
                _ => {}
            }
        }

        finished
    }
}

#[cfg(test)]
mod tests {
    use super::JsonObjects;

    /// Collects every object a whole input produces
    fn split(input: &str) -> Vec<String> {
        let mut splitter = JsonObjects::default();
        splitter
            .feed(input.as_bytes())
            .into_iter()
            .map(|bytes| String::from_utf8(bytes).unwrap())
            .collect()
    }

    #[test]
    fn splits_a_flat_array() {
        assert_eq!(
            split(r#"[{"a":1},{"b":2}]"#),
            vec![r#"{"a":1}"#, r#"{"b":2}"#]
        );
    }

    #[test]
    fn keeps_nested_structures_together() {
        assert_eq!(
            split(r#"[{"a":{"b":[1,2]},"c":3}]"#),
            vec![r#"{"a":{"b":[1,2]},"c":3}"#]
        );
    }

    #[test]
    fn ignores_braces_inside_strings() {
        assert_eq!(split(r#"[{"a":"}{"}]"#), vec![r#"{"a":"}{"}"#]);
    }

    #[test]
    fn ignores_an_escaped_quote() {
        assert_eq!(split(r#"[{"a":"\"}"}]"#), vec![r#"{"a":"\"}"}"#]);
    }

    #[test]
    fn survives_a_split_between_any_two_bytes() {
        let input = r#"[{"a":{"b":"}"}},{"c":2}]"#;
        for at in 0..input.len() {
            let mut splitter = JsonObjects::default();
            let mut objects = splitter.feed(&input.as_bytes()[..at]);
            objects.extend(splitter.feed(&input.as_bytes()[at..]));
            let objects: Vec<String> = objects
                .into_iter()
                .map(|bytes| String::from_utf8(bytes).unwrap())
                .collect();
            assert_eq!(
                objects,
                vec![r#"{"a":{"b":"}"}}"#, r#"{"c":2}"#],
                "split at {at}"
            );
        }
    }

    #[test]
    fn yields_nothing_for_an_empty_array() {
        assert!(split("[]").is_empty());
    }
}
