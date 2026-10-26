use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::tournaments::live::hub::follow;
use crate::http::handler_frontend::tournaments::live::schema::EventStream;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::TournamentUuid;
use crate::models::tournament::access::TournamentGrant;

/// Follow what changes in a Tournament the reader may see, as Server-Sent Events
///
/// Each event names what changed; the reader fetches that again. Organizers
/// also hear about the previewed Round.
#[get("/{tournament}/events")]
pub async fn follow_tournament(
    viewer: Viewer,
    grant: TournamentGrant,
    Path(_): Path<TournamentUuid>,
) -> ApiResult<EventStream> {
    let mut tx = Database::global().start_transaction().await?;

    let tournament = grant.tournament;
    let organizer = match viewer.account() {
        Some(account) => tournament.organizer_role(&mut tx, account).await?.is_some(),
        None => false,
    };

    tx.commit().await?;

    Ok(EventStream::new(follow(tournament.uuid, organizer)))
}
