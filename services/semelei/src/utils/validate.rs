//! Validation of what customers type into the public order form
//!
//! Everything here guards one specific danger: an order is placed by an
//! anonymous request, and it turns into an email the shop sends from its own
//! domain to an address the same request chose. Without these checks a
//! stranger can make the bakery deliver text of their choosing to anybody —
//! so the recipient has to be a plain address, and the name that goes into
//! the mail body must not be able to open a new paragraph.

use url::Url;

/// Whether the text contains no control characters at all
///
/// Newlines are the interesting case: the customer's name is rendered into a
/// plain-text mail, and a name containing `\n\n` lets its owner write their
/// own message above the actual order.
pub fn is_single_line(text: &str) -> bool {
    !text.chars().any(char::is_control)
}

/// Whether the text is free of control characters except newline and tab
///
/// For the order note, which is a textarea and legitimately has line breaks.
pub fn is_plain_text(text: &str) -> bool {
    !text
        .chars()
        .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
}

/// Whether the text is a bare email address the shop is willing to send to
///
/// Deliberately narrow: exactly one `@`, no display name, no angle brackets,
/// no separators that another mail library might read as a second recipient,
/// and a dot in the domain. Anything fancier is refused rather than
/// interpreted — the address is only ever used as a recipient, never parsed
/// for meaning.
pub fn is_bare_email(text: &str) -> bool {
    /// Characters that could split one address into several, or smuggle a
    /// display name past a lenient parser
    const FORBIDDEN: &[char] = &[
        '<', '>', ',', ';', ':', '"', '\'', '(', ')', '[', ']', '\\', ' ',
    ];

    if text.len() < 3 || !is_single_line(text) {
        return false;
    }
    if text
        .chars()
        .any(|c| FORBIDDEN.contains(&c) || c.is_whitespace())
    {
        return false;
    }

    let Some((local, domain)) = text.split_once('@') else {
        return false;
    };
    if local.is_empty() || domain.contains('@') {
        return false;
    }

    // A domain without a dot is either a local alias or a typo; neither is
    // something the shop should mail into.
    domain.contains('.')
        && !domain.starts_with(['.', '-'])
        && !domain.ends_with(['.', '-'])
        && !domain.contains("..")
}

/// Whether the text is a url the shop may link to from its footer
///
/// Only `http`/`https` with a real host. The value is rendered into an
/// `href` on every public page, so a `javascript:` or `data:` url would turn
/// an admin's typo — or a compromised admin account — into script execution
/// in every visitor's browser.
pub fn is_web_url(text: &str) -> bool {
    let Ok(url) = Url::parse(text) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https") && url.host().is_some()
}

/// Whether the text looks like a phone number
///
/// Same shape the order form accepts, checked again here: the frontend's
/// regex is a convenience, not a guarantee.
pub fn is_phone_number(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && text
            .chars()
            .all(|c| c.is_ascii_digit() || " +-/()".contains(c))
        && text.chars().any(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn plain_names_pass() {
        assert!(is_single_line("Anna Müller"));
        assert!(is_single_line("O'Brien-Schmidt"));
    }

    #[test]
    fn a_name_cannot_start_a_new_paragraph() {
        // The attack this exists for: the name is rendered into the mail body
        assert!(!is_single_line(
            "Kunde\n\nIhre Zahlung ist fehlgeschlagen: https://evil.example"
        ));
        assert!(!is_single_line("Kunde\rBitte hier zahlen"));
        assert!(!is_single_line("Kunde\u{0}"));
    }

    #[test]
    fn notes_may_have_line_breaks() {
        assert!(is_plain_text("Bitte gut durchgebacken.\nDanke!"));
        assert!(!is_plain_text("Bitte\u{0}gut"));
    }

    #[test]
    fn ordinary_addresses_pass() {
        assert!(is_bare_email("anna@example.com"));
        assert!(is_bare_email("anna.mueller+shop@mail.example.co.uk"));
    }

    #[test]
    fn a_second_recipient_cannot_be_smuggled_in() {
        assert!(!is_bare_email("anna@example.com, opfer@example.org"));
        assert!(!is_bare_email("anna@example.com opfer@example.org"));
        assert!(!is_bare_email("Bäckerei <anna@example.com>"));
        assert!(!is_bare_email("anna@example.com\nBcc: opfer@example.org"));
    }

    #[test]
    fn malformed_addresses_are_refused() {
        assert!(!is_bare_email("anna"));
        assert!(!is_bare_email("@example.com"));
        assert!(!is_bare_email("anna@localhost"));
        assert!(!is_bare_email("anna@@example.com"));
        assert!(!is_bare_email("anna@.example.com"));
        assert!(!is_bare_email("anna@example..com"));
    }

    #[test]
    fn ordinary_links_pass() {
        assert!(is_web_url(
            "https://nachbarschaftshilfe-sindelsdorf.de/impressum/"
        ));
        assert!(is_web_url("http://example.com"));
    }

    #[test]
    fn script_urls_are_refused() {
        assert!(!is_web_url("javascript:alert(document.cookie)"));
        assert!(!is_web_url("data:text/html;base64,PHNjcmlwdD4="));
        assert!(!is_web_url("file:///etc/passwd"));
        assert!(!is_web_url("/impressum"));
        assert!(!is_web_url("example.com"));
        assert!(!is_web_url(""));
    }

    #[test]
    fn phone_numbers_are_digits_and_punctuation() {
        assert!(is_phone_number("+49 8856 91970"));
        assert!(is_phone_number("08856/919-70"));
        assert!(!is_phone_number("ruft mich an"));
        assert!(!is_phone_number("+++"));
        assert!(!is_phone_number("0885\n6"));
    }
}
