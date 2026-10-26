//! The in-process hub that hands each Tournament's events to its followers
//!
//! One broadcast channel per followed Tournament, made when the first reader
//! follows it and forgotten once nobody does. Events are not stored: a reader
//! that connects later fetches the current state anyway, and one that falls
//! behind gets [`TournamentEvent::Resync`].

use std::collections::HashMap;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::sync::PoisonError;
use std::time::Duration;

use futures_util::Stream;
use futures_util::stream;
use galvyn::core::re_exports::axum::body::Bytes;
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;
use tokio::time::timeout;

use crate::http::handler_frontend::tournaments::live::schema::TournamentEvent;
use crate::models::tournament::TournamentUuid;

/// How many events a follower may fall behind before it gets [`TournamentEvent::Resync`]
const CAPACITY: usize = 64;

/// How long a stream stays silent before it sends a comment, so proxies keep it open
const KEEP_ALIVE: Duration = Duration::from_secs(25);

/// The hub the service runs on
static HUB: LazyLock<Hub> = LazyLock::new(|| Hub::new(CAPACITY, KEEP_ALIVE));

/// Tell everybody following `tournament` what changed in it
///
/// Call it once the change is committed.
pub fn emit(tournament: TournamentUuid, event: TournamentEvent) {
    HUB.emit(tournament, event);
}

/// Follow the events of `tournament`, as Server-Sent Event frames
///
/// Only an `organizer` hears the events about a previewed Round.
pub fn follow(
    tournament: TournamentUuid,
    organizer: bool,
) -> impl Stream<Item = Bytes> + Send + 'static {
    HUB.follow(tournament, organizer)
}

/// Hands each Tournament's events to whoever follows it
pub struct Hub {
    channels: Mutex<HashMap<TournamentUuid, broadcast::Sender<TournamentEvent>>>,
    capacity: usize,
    keep_alive: Duration,
}

impl Hub {
    /// A hub without followers
    pub fn new(capacity: usize, keep_alive: Duration) -> Self {
        Self {
            channels: Mutex::new(HashMap::new()),
            capacity,
            keep_alive,
        }
    }

    /// Hand `event` to everybody following `tournament`
    pub fn emit(&self, tournament: TournamentUuid, event: TournamentEvent) {
        let mut channels = self.channels.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(sender) = channels.get(&tournament)
            && sender.send(event).is_err()
        {
            channels.remove(&tournament);
        }
    }

    /// Follow the events of `tournament`, as Server-Sent Event frames
    ///
    /// Only an `organizer` hears the events about a previewed Round.
    pub fn follow(
        &self,
        tournament: TournamentUuid,
        organizer: bool,
    ) -> impl Stream<Item = Bytes> + Send + 'static {
        let receiver = {
            let mut channels = self.channels.lock().unwrap_or_else(PoisonError::into_inner);
            channels.retain(|_, sender| sender.receiver_count() > 0);
            channels
                .entry(tournament)
                .or_insert_with(|| broadcast::channel(self.capacity).0)
                .subscribe()
        };
        let keep_alive = self.keep_alive;
        stream::unfold(receiver, move |mut receiver| async move {
            loop {
                let event = match timeout(keep_alive, receiver.recv()).await {
                    Err(_) => return Some((Bytes::from_static(b": keep-alive\n\n"), receiver)),
                    Ok(Ok(event)) => event,
                    Ok(Err(RecvError::Lagged(_))) => TournamentEvent::Resync,
                    Ok(Err(RecvError::Closed)) => return None,
                };
                if organizer || !event.for_organizers_only() {
                    return Some((frame(&event), receiver));
                }
            }
        })
    }
}

/// One Server-Sent Event carrying `event` as json
fn frame(event: &TournamentEvent) -> Bytes {
    let json = serde_json::to_string(event).expect("an event serializes");
    Bytes::from(format!("data: {json}\n\n"))
}

#[cfg(test)]
mod tests {
    use std::pin::pin;

    use futures_util::StreamExt;
    use uuid::Uuid;

    use super::*;

    fn tournament() -> TournamentUuid {
        serde_json::from_value(serde_json::json!(Uuid::new_v4())).expect("a uuid")
    }

    fn hub() -> Hub {
        Hub::new(4, Duration::from_secs(60))
    }

    async fn next(stream: impl Stream<Item = Bytes>) -> Option<String> {
        let mut stream = pin!(stream);
        timeout(Duration::from_millis(200), stream.next())
            .await
            .ok()
            .flatten()
            .map(|bytes| String::from_utf8(bytes.to_vec()).expect("utf-8"))
    }

    #[tokio::test]
    async fn a_follower_hears_what_is_emitted_for_its_tournament() {
        let hub = hub();
        let followed = tournament();
        let mut stream = Box::pin(hub.follow(followed, false));

        hub.emit(followed, TournamentEvent::RoundStarted { round: 2 });

        assert_eq!(
            next(&mut stream).await.as_deref(),
            Some("data: {\"kind\":\"RoundStarted\",\"round\":2}\n\n")
        );
    }

    #[tokio::test]
    async fn a_follower_hears_nothing_of_other_tournaments() {
        let hub = hub();
        let followed = tournament();
        let mut stream = Box::pin(hub.follow(followed, true));

        hub.emit(tournament(), TournamentEvent::ParticipantsChanged);

        assert_eq!(next(&mut stream).await, None);
    }

    #[tokio::test]
    async fn only_organizers_hear_of_a_previewed_round() {
        let hub = hub();
        let followed = tournament();
        let mut organizer = Box::pin(hub.follow(followed, true));
        let mut reader = Box::pin(hub.follow(followed, false));

        hub.emit(followed, TournamentEvent::RoundPaired { round: 1 });
        hub.emit(followed, TournamentEvent::StandingsChanged);

        assert_eq!(
            next(&mut organizer).await.as_deref(),
            Some("data: {\"kind\":\"RoundPaired\",\"round\":1}\n\n")
        );
        assert_eq!(
            next(&mut reader).await.as_deref(),
            Some("data: {\"kind\":\"StandingsChanged\"}\n\n")
        );
    }

    #[tokio::test]
    async fn a_follower_that_fell_behind_is_told_to_resync() {
        let hub = hub();
        let followed = tournament();
        let mut stream = Box::pin(hub.follow(followed, false));

        for _ in 0..10 {
            hub.emit(followed, TournamentEvent::ParticipantsChanged);
        }

        assert_eq!(
            next(&mut stream).await.as_deref(),
            Some("data: {\"kind\":\"Resync\"}\n\n")
        );
    }

    #[tokio::test]
    async fn a_silent_stream_keeps_alive() {
        let hub = Hub::new(4, Duration::from_millis(10));
        let mut stream = Box::pin(hub.follow(tournament(), false));

        assert_eq!(next(&mut stream).await.as_deref(), Some(": keep-alive\n\n"));
    }

    #[tokio::test]
    async fn emitting_without_followers_does_nothing() {
        let hub = hub();
        let followed = tournament();
        drop(hub.follow(followed, false));

        hub.emit(followed, TournamentEvent::TournamentChanged);
        let mut stream = Box::pin(hub.follow(followed, false));
        hub.emit(followed, TournamentEvent::TournamentChanged);

        assert_eq!(
            next(&mut stream).await.as_deref(),
            Some("data: {\"kind\":\"TournamentChanged\"}\n\n")
        );
    }
}
