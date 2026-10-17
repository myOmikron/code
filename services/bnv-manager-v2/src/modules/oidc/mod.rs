//! Holds static information for OIDC

use std::fs;
use std::path::PathBuf;

use base64ct::Base64UrlUnpadded;
use base64ct::Encoding;
use galvyn::core::InitError;
use galvyn::core::Module;
use galvyn::core::PreInitError;
use rsa::RsaPrivateKey;
use rsa::RsaPublicKey;
use rsa::pkcs8::DecodePrivateKey;
use rsa::pkcs8::EncodePrivateKey;
use rsa::traits::PublicKeyParts;
use sha2::Digest;
use sha2::Sha256;
use tracing::info;
use tracing::instrument;

/// Holds static information for OIDC
pub struct Oidc {
    /// Private key
    pub private_key: RsaPrivateKey,
    /// jwks.json
    pub jwks: serde_json::Value,
    /// key id
    pub kid: String,
}

/// Where the signing key lives
#[derive(Debug)]
pub struct OidcSetup {
    /// Path of the RSA signing key, generated on first start
    pub key_path: PathBuf,
}

impl Default for OidcSetup {
    fn default() -> Self {
        Self {
            key_path: PathBuf::from("/var/lib/bnv-manager/bnv.key"),
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
        let private_key = if key_path.exists() {
            info!("RSA key exists, loading from disk ..");
            let pem = fs::read_to_string(&key_path)?;
            RsaPrivateKey::from_pkcs8_pem(&pem)?
        } else {
            info!("Generating new 2048-bit RSA signing key ..");
            let key = RsaPrivateKey::new(&mut rsa::rand_core::OsRng, 2048)?;
            let pem = key.to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)?;
            fs::write(&key_path, pem.as_bytes())?;
            key
        };

        let public_key: RsaPublicKey = private_key.to_public_key();

        let n_bytes = public_key.n().to_bytes_be();
        let mut hasher = Sha256::new();
        hasher.update(&n_bytes);
        let kid_bytes = hasher.finalize();
        let kid = Base64UrlUnpadded::encode_string(&kid_bytes);
        let e_bytes = public_key.e().to_bytes_be();
        let n_b64 = Base64UrlUnpadded::encode_string(&n_bytes);
        let e_b64 = Base64UrlUnpadded::encode_string(&e_bytes);

        let jwks = serde_json::json!({
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": kid.clone(),
                    "n": n_b64,
                    "e": e_b64
                }
            ]
        });

        Ok(Self {
            private_key,
            jwks,
            kid,
        })
    }
}
