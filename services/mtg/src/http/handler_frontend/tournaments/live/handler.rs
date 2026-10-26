use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::get;
use galvyn::rorm::Database;

use crate::http::handler_frontend::tournaments::handler::denied;
use crate::http::handler_frontend::tournaments::live::hub::follow;
use crate::http::handler_frontend::tournaments::live::schema::EventStream;
use crate::models::account::extractor::Viewer;
use crate::models::tournament::Tournament;
use crate::models::tournament::TournamentUuid;

/// Follow what changes in a Tournament the reader may see, as Server-Sent Events
///
/// Each event names what changed; the reader fetches that again. Organizers
/// also hear about the previewed Round.
#[get("/{tournament}/events")]
pub async fn follow_tournament(
    viewer: Viewer,
    Path(tournament): Path<TournamentUuid>,
) -> ApiResult<EventStream> {
    let mut tx = Database::global().start_transaction().await?;

    let Some(tournament) = Tournament::get_visible(&mut tx, tournament, viewer.account()).await?
    else {
        tx.rollback().await?;
        return Err(denied());
    };
    let organizer = match viewer.account() {
        Some(account) => tournament.organizer_role(&mut tx, account).await?.is_some(),
        None => false,
    };

    tx.commit().await?;

    Ok(EventStream::new(follow(tournament.uuid, organizer)))
}
