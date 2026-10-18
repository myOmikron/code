//! Handlers of the authorization endpoint and the login steps around it

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Query;
use galvyn::core::session::Session;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use galvyn::post;
use galvyn::rorm::Database;
use time::OffsetDateTime;
use tracing::info;
use tracing::instrument;
use tracing::warn;

use crate::http::extractors::session_user::SESSION_USER;
use crate::http::extractors::session_user::SessionUser;
use crate::http::handler_auth::AUTHORIZATION_PATH;
use crate::http::handler_auth::FINISH_AUTH_PATH;
use crate::http::handler_auth::SIGN_IN_PATH;
use crate::http::handler_auth::SIGN_OUT_PATH;
use crate::http::handler_auth::auth::pending;
use crate::http::handler_auth::auth::redirect;
use crate::http::handler_auth::auth::redirect::AuthErrorCode;
use crate::http::handler_auth::auth::redirect::Found;
use crate::http::handler_auth::auth::request::AuthRequest;
use crate::http::handler_auth::auth::request::AuthRequestError;
use crate::http::handler_auth::auth::request::AuthRequestParams;
use crate::http::handler_auth::auth::schema::FinishAuthQuery;
use crate::http::handler_auth::auth::schema::SignInRequest;
use crate::models::account::Account;
use crate::models::account::ClubAccount;
use crate::models::oidc_client::CreateOidcAuthenticationToken;
use crate::models::oidc_client::OidcAuthenticationToken;
use crate::models::oidc_client::OidcClient;
use crate::utils::links::Link;
use crate::utils::links::OidcErrorCode;

/// Scopes a client may request
pub const ALLOWED_SCOPES: &[&str] = &["openid", "profile", "email", "mailcow_template"];

/// Bcrypt hash verified when the username is unknown, so the response takes as long as for a known one
const DUMMY_BCRYPT_HASH: &str = "$2b$12$YtivXzIrL86Uhnk5pXF5oOwNemHmre4qFeTGNPmFUFZlJE8kcv3a2";

/// The authorization endpoint
///
/// Stores the authorization request in the session and sends the user to the login page,
/// or straight on to finishing the authorization when they are signed in already and the
/// login is recent enough for `prompt` and `max_age`. With `prompt=none` the user never
/// sees the login page, the client gets `login_required` instead.
///
/// An unknown client or `redirect_uri` sends the user to the error page and never to the
/// client. RFC 6749 §4.1.2.1: "the authorization server SHOULD inform the resource owner
/// of the error and MUST NOT automatically redirect the user-agent to the invalid
/// redirection URI." Every other error goes back to the client.
#[get(AUTHORIZATION_PATH)]
#[instrument(name = "Api::auth::auth", skip(params, session))]
pub async fn auth(params: AuthRequestParams, session: Session) -> ApiResult<Found> {
    let mut tx = Database::global().start_transaction().await?;
    let client = match params.client_id() {
        None => None,
        Some(client_id) => OidcClient::find_by_client_id(&mut tx, client_id).await?,
    };
    tx.commit().await?;
    let Some(client) = client else {
        warn!("Authorization request of an unknown client");
        return Ok(error_page(OidcErrorCode::UnknownClient));
    };

    let request = match params.validate(client.client_id, &client.redirect_uri) {
        Ok(request) => request,
        Err(AuthRequestError::InvalidRedirectUri) => {
            warn!(
                expected = client.redirect_uri.as_str(),
                "Invalid redirect_uri"
            );
            return Ok(error_page(OidcErrorCode::InvalidRedirectUri));
        }
        Err(AuthRequestError::UnsupportedResponseMode) => {
            return Err(ApiError::bad_request("Unsupported response_mode"));
        }
        Err(AuthRequestError::Redirect(error)) => {
            info!(
                error = ?error.error,
                error.description, "Invalid authorization request"
            );
            return Ok((*error).into());
        }
    };

    let user = session.get::<SessionUser>(SESSION_USER).await?;
    let signed_in = user.is_some_and(|user| request.accepts_login(user.auth_time));
    if !signed_in && request.prompt_none {
        return Ok(login_required(&request));
    }

    let request_id = pending::insert(&session, request).await?;

    if !signed_in {
        return Ok(Found::to(Link::oidc_auth(request_id).as_str()));
    }

    Ok(Found::to(Link::oidc_finish(request_id).as_str()))
}

/// The error redirect of a `prompt=none` request that needs the login page
///
/// OpenID Connect Core §3.1.2.1: "The Authorization Server MUST NOT display any
/// authentication or consent user interface pages. An error is returned if an End-User is
/// not already authenticated".
fn login_required(request: &AuthRequest) -> Found {
    request
        .error(
            AuthErrorCode::LoginRequired,
            "The user has to sign in, prompt is none",
        )
        .into()
}

/// Sends the user to the provider's error page showing `error`
fn error_page(error: OidcErrorCode) -> Found {
    Found::to(Link::oidc_failed(error).as_str())
}

/// Sign in with username (or email) and password
///
/// An unknown username and a wrong password fail alike, so the response does not tell
/// which usernames exist. On success the session gets a new id, so an id planted or seen
/// before the login does not become a signed in session (session fixation).
#[post(SIGN_IN_PATH)]
#[instrument(name = "Api::auth::sign_in", skip(session, password))]
pub async fn sign_in(
    session: Session,
    ApiJson(SignInRequest { username, password }): ApiJson<SignInRequest>,
) -> ApiResult<()> {
    let mut tx = Database::global().start_transaction().await?;

    let lookup_result = match Account::get_by_username(&mut tx, &username).await? {
        Some(account) => Some(account),
        None => ClubAccount::get_by_email(&mut tx, &username)
            .await?
            .map(Account::ClubMember),
    };

    tx.commit().await?;

    let password_matches = match &lookup_result {
        Some(account) => account.check_password(&password)?,
        None => {
            bcrypt::verify("foo", DUMMY_BCRYPT_HASH)
                .map_err(ApiError::map_server_error("Bcrypt error in dummy check"))?;
            false
        }
    };
    let (Some(account), true) = (lookup_result, password_matches) else {
        return Err(ApiError::bad_request("Invalid username or password"));
    };

    session.cycle_id().await?;
    session
        .insert(
            SESSION_USER,
            SessionUser {
                uuid: match &account {
                    Account::ClubMember(club_member) => club_member.uuid(),
                    Account::ClubAdmin(club_admin) => club_admin.uuid(),
                    Account::Superadmin(superadmin) => superadmin.uuid(),
                },
                auth_time: Some(OffsetDateTime::now_utc()),
            },
        )
        .await?;

    Ok(())
}

/// Issue the authorization code for the pending authorization request and redirect to the client
///
/// Sends the user back to the login page when they are not signed in yet or their login is
/// too old for the request (`login_required` with `prompt=none`), and to the error page
/// when this session has no pending request with that id. An account that is no club
/// member, or no longer exists, gets `access_denied`.
#[get(FINISH_AUTH_PATH)]
#[instrument(name = "Api::auth::finish_auth", skip(session))]
pub async fn finish_auth(
    Query(FinishAuthQuery { request_id }): Query<FinishAuthQuery>,
    session: Session,
) -> ApiResult<Found> {
    let Some(request) = pending::get(&session, request_id).await? else {
        return Ok(error_page(OidcErrorCode::UnknownRequest));
    };
    let Some((account_uuid, auth_time)) = session
        .get::<SessionUser>(SESSION_USER)
        .await?
        .filter(|user| request.accepts_login(user.auth_time))
        .and_then(|user| Some((user.uuid, user.auth_time?)))
    else {
        if request.prompt_none {
            pending::take(&session, request_id).await?;
            return Ok(login_required(&request));
        }
        return Ok(Found::to(Link::oidc_auth(request_id).as_str()));
    };
    let Some(request) = pending::take(&session, request_id).await? else {
        return Ok(error_page(OidcErrorCode::UnknownRequest));
    };

    let mut tx = Database::global().start_transaction().await?;

    let Some(client) = OidcClient::find_by_client_id(&mut tx, request.client_id).await? else {
        tx.commit().await?;
        return Ok(error_page(OidcErrorCode::UnknownClient));
    };
    if client.redirect_uri != request.redirect_uri {
        tx.commit().await?;
        return Ok(error_page(OidcErrorCode::InvalidRedirectUri));
    }

    let Some(Account::ClubMember(_)) = Account::get_by_uuid(&mut tx, account_uuid).await? else {
        tx.commit().await?;
        return Ok(request
            .error(
                AuthErrorCode::AccessDenied,
                "Only members of a club can sign in",
            )
            .into());
    };

    let auth_token = OidcAuthenticationToken::create(
        &mut tx,
        CreateOidcAuthenticationToken {
            client_id: client.client_id,
            redirect_uri: client.redirect_uri,
            account: account_uuid,
            nonce: request.nonce,
            scopes: request.scopes,
            code_challenge: request.code_challenge,
            auth_time,
        },
    )
    .await?;

    tx.commit().await?;

    Ok(redirect::success(
        request.redirect_uri,
        &auth_token.code,
        request.state.as_deref(),
    ))
}

/// Sign out of the current session
#[post(SIGN_OUT_PATH)]
#[instrument(name = "Api::auth::sign_out", skip(session))]
pub async fn sign_out(session: Session) -> ApiResult<()> {
    session.remove::<SessionUser>(SESSION_USER).await?;
    Ok(())
}
