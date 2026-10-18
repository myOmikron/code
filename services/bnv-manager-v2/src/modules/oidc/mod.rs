//! The OpenID provider's signing key and the keys derived from it

use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;
use std::path::PathBuf;

use base64ct::Base64UrlUnpadded;
use base64ct::Encoding;
use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use jsonwebtoken::Algorithm;
use jsonwebtoken::DecodingKey;
use jsonwebtoken::EncodingKey;
use jsonwebtoken::Header;
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::pkcs8::DecodePrivateKey;
use rsa::pkcs8::EncodePrivateKey;
use rsa::traits::PublicKeyParts;
use sha2::Digest;
use sha2::Sha256;
use tracing::info;
use tracing::instrument;

use crate::config::STATE_DIR;

/// The OpenID provider's signing key, ready to sign and verify tokens
pub struct Oidc {
    /// Key signing ID tokens and access tokens
    pub encoding_key: EncodingKey,
    /// Key verifying tokens signed by [`Oidc::encoding_key`]
    pub decoding_key: DecodingKey,
    /// The JSON Web Key Set publishing the public key
    pub jwks: serde_json::Value,
    /// Id of the signing key, in the JWKS and in every token header
    pub kid: String,
}

impl Oidc {
    /// Header for a token signed by [`Oidc::encoding_key`]
    pub fn jwt_header(&self) -> Header {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(self.kid.clone());
        header
    }
}

/// Where the signing key lives
#[derive(Debug)]
pub struct OidcSetup {
    /// Path of the RSA signing key, generated on first start
    pub key_path: PathBuf,
}

impl Default for OidcSetup {
    /// The key file `bnv.key` in the configured [`STATE_DIR`]
    fn default() -> Self {
        Self {
            key_path: STATE_DIR.get().join("bnv.key"),
        }
    }
}

impl Module for Oidc {
    type Setup = OidcSetup;
    type PreInit = OidcSetup;

    async fn pre_init(setup: Self::Setup) -> Result<Self::PreInit, PreInitError> {
        Ok(setup)
    }

    type Dependencies = ();

    #[instrument(name = "Oidc::init", skip_all)]
    async fn init(
        OidcSetup { key_path }: Self::PreInit,
        _dependencies: &mut Self::Dependencies,
    ) -> Result<Self, InitError> {
        let private_key = load_or_generate_key(&key_path)?;

        let n = Base64UrlUnpadded::encode_string(&private_key.n().to_bytes_be());
        let e = Base64UrlUnpadded::encode_string(&private_key.e().to_bytes_be());
        let kid = jwk_thumbprint(&n, &e);

        let jwks = serde_json::json!({
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": kid,
                    "n": n,
                    "e": e,
                }
            ]
        });

        Ok(Self {
            encoding_key: EncodingKey::from_rsa_der(private_key.to_pkcs1_der()?.as_bytes()),
            decoding_key: DecodingKey::from_rsa_raw_components(
                &private_key.n().to_bytes_be(),
                &private_key.e().to_bytes_be(),
            ),
            jwks,
            kid,
        })
    }
}

/// Load the PKCS#8 PEM key at `path`, or generate one and write it there owner-only (`0600`)
fn load_or_generate_key(path: &Path) -> Result<RsaPrivateKey, InitError> {
    if path.exists() {
        info!("RSA key exists, loading from disk ..");
        let pem = fs::read_to_string(path)?;
        return Ok(RsaPrivateKey::from_pkcs8_pem(&pem)?);
    }

    info!("Generating new 2048-bit RSA signing key ..");
    let key = RsaPrivateKey::new(&mut rsa::rand_core::OsRng, 2048)?;
    let pem = key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?
        .write_all(pem.as_bytes())?;
    Ok(key)
}

/// JWK Thumbprint (RFC 7638) of the RSA public key with the base64url encoded `n` and `e`
///
/// RFC 7638 §3: "Construct a JSON object \[RFC7159\] containing only the required members
/// of a JWK representing the key and with no whitespace or line breaks before or after
/// any syntactic elements and with the required members ordered lexicographically by the
/// Unicode \[UNICODE\] code points of the member names." The required members of an RSA
/// key are `e`, `kty` and `n` (§3.2); base64url values need no escaping. The hash is
/// SHA-256, base64url encoded.
fn jwk_thumbprint(n: &str, e: &str) -> String {
    let jwk = format!(r#"{{"e":"{e}","kty":"RSA","n":"{n}"}}"#);
    Base64UrlUnpadded::encode_string(&Sha256::digest(jwk.as_bytes()))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    use uuid::Uuid;

    use super::jwk_thumbprint;
    use super::load_or_generate_key;

    #[test]
    fn thumbprint_matches_rfc_7638_example() {
        let n = "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw";
        let e = "AQAB";
        assert_eq!(
            jwk_thumbprint(n, e),
            "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
        );
    }

    #[test]
    fn generated_key_is_owner_only_and_stable() {
        let path = std::env::temp_dir().join(format!("bnv-oidc-{}.key", Uuid::new_v4().simple()));

        let generated = load_or_generate_key(&path).expect("generate key");
        let mode = fs::metadata(&path).expect("key file").permissions().mode();
        let loaded = load_or_generate_key(&path).expect("load key");
        fs::remove_file(&path).expect("remove key file");

        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(generated, loaded);
    }
}
