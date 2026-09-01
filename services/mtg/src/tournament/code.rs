//! The human-typeable join code of a tournament
//!
//! Unlike a share token, this code is read off a whiteboard and typed on a
//! phone, so it is short and its alphabet is chosen so that misreadings are
//! recoverable: every letter that looks like a digit is excluded, and
//! [`normalize_join_code`] maps the excluded letters onto the digit they are
//! confused with. A code read as `OI5` under bad light resolves to `015` and
//! works.

use galvyn::rorm::fields::types::MaxStr;
use rand::RngExt;

/// Length of a join code
pub const JOIN_CODE_LEN: usize = 6;

/// The alphabet join codes are minted from
///
/// The ten digits plus the latin letters without `B I L O S U Z`: each of the
/// excluded letters is confusable with exactly one digit (`U` is dropped to
/// keep the space free of accidental profanity), which is what makes the
/// normalizer below unambiguous.
const ALPHABET: &[u8] = b"0123456789ACDEFGHJKMNPQRTVWXY";

/// Mint a fresh join code
///
/// Uniqueness is the database's job — the column is unique and the caller
/// retries on a collision.
pub fn generate_join_code() -> MaxStr<8> {
    let mut rng = rand::rng();
    let code: String = (0..JOIN_CODE_LEN)
        .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
        .collect();
    MaxStr::new(code).unwrap_or_else(|_| unreachable!("{JOIN_CODE_LEN} is below 8"))
}

/// Read a typed or scanned code leniently
///
/// Uppercases, strips separators and folds every excluded letter onto the
/// digit it is misread as. Returns `None` when what remains is not exactly
/// [`JOIN_CODE_LEN`] characters of the alphabet — there is no code it could
/// have meant.
pub fn normalize_join_code(input: &str) -> Option<MaxStr<8>> {
    let mut code = String::with_capacity(JOIN_CODE_LEN);
    for char in input.chars() {
        let char = match char.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            'S' => '5',
            'B' => '8',
            'Z' => '2',
            other if other.is_ascii_alphanumeric() => other,
            _ => continue,
        };
        if !ALPHABET.contains(&(char as u8)) {
            return None;
        }
        code.push(char);
        if code.len() > JOIN_CODE_LEN {
            return None;
        }
    }
    if code.len() != JOIN_CODE_LEN {
        return None;
    }
    Some(MaxStr::new(code).unwrap_or_else(|_| unreachable!("{JOIN_CODE_LEN} is below 8")))
}

/// A join code the way a person reads it: two groups of three
pub fn display_join_code(code: &str) -> String {
    match code.len() {
        JOIN_CODE_LEN => format!("{}-{}", &code[..3], &code[3..]),
        _ => code.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mints_codes_of_the_alphabet() {
        for _ in 0..100 {
            let code = generate_join_code();
            assert_eq!(code.len(), JOIN_CODE_LEN);
            assert!(code.bytes().all(|byte| ALPHABET.contains(&byte)));
        }
    }

    #[test]
    fn a_minted_code_survives_its_own_normalization() {
        for _ in 0..100 {
            let code = generate_join_code();
            assert_eq!(normalize_join_code(&code).as_deref(), Some(&*code));
        }
    }

    #[test]
    fn folds_confusable_letters_onto_their_digits() {
        assert_eq!(normalize_join_code("OI5bzL").as_deref(), Some("015821"));
    }

    #[test]
    fn ignores_case_and_separators() {
        assert_eq!(normalize_join_code("h7k-3pq").as_deref(), Some("H7K3PQ"));
        assert_eq!(normalize_join_code(" H7K 3PQ ").as_deref(), Some("H7K3PQ"));
    }

    #[test]
    fn rejects_the_wrong_length() {
        assert_eq!(normalize_join_code("H7K3P"), None);
        assert_eq!(normalize_join_code("H7K3PQ7"), None);
        assert_eq!(normalize_join_code(""), None);
    }

    #[test]
    fn rejects_characters_no_code_contains() {
        // `U` is not confusable with a digit — it is simply not in the alphabet.
        assert_eq!(normalize_join_code("U7K3PQ"), None);
    }

    #[test]
    fn displays_as_two_groups() {
        assert_eq!(display_join_code("H7K3PQ"), "H7K-3PQ");
        assert_eq!(display_join_code("H7K"), "H7K");
    }
}
