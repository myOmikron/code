use std::convert::Infallible;

use futures_util::Stream;
use futures_util::StreamExt;
use galvyn::core::handler::context::EndpointContext;
use galvyn::core::handler::response_body::ResponseBody;
use galvyn::core::handler::response_body::ShouldBeResponseBody;
use galvyn::core::re_exports::axum::body::Body;
use galvyn::core::re_exports::axum::body::Bytes;
use galvyn::core::re_exports::axum::http::StatusCode;
use galvyn::core::re_exports::axum::http::header;
use galvyn::core::re_exports::axum::response::IntoResponse;
use galvyn::core::re_exports::axum::response::Response;
use galvyn::core::re_exports::mime;
use galvyn::core::re_exports::mime::Mime;
use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::re_exports::schemars::schema::Schema;
use serde::Deserialize;
use serde::Serialize;

use crate::models::tournament::round::MatchUuid;

/// Something changed in a Tournament; the reader fetches again what it shows of it
///
/// Sent as the `data` of one Server-Sent Event, as json.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind")]
pub enum TournamentEvent {
    /// Its settings or its state changed, or it was deleted
    TournamentChanged,
    /// Participants joined, left or Dropped
    ParticipantsChanged,
    /// Co-organizers were named or removed, or a handover was offered,
    /// withdrawn, accepted or declined
    OrganizersChanged,
    /// A Registered deck was registered, swapped or removed, or its list
    /// sharing changed
    DecksChanged,
    /// A Round was paired as a preview, or its preview was edited; only Organizers hear it
    RoundPaired {
        /// The Round's number
        round: i16,
    },
    /// A previewed Round was thrown away; only Organizers hear it
    RoundDiscarded {
        /// The Round's number
        round: i16,
    },
    /// A change to the Participants threw the previewed Round away, since it
    /// no longer fits them; only Organizers hear it
    PreviewOutdated {
        /// The Round's number
        round: i16,
    },
    /// A Round started and shows to everybody
    RoundStarted {
        /// The Round's number
        round: i16,
    },
    /// A Round ended
    RoundEnded {
        /// The Round's number
        round: i16,
    },
    /// An ended Round was taken back and runs again
    RoundTakenBack {
        /// The Round's number
        round: i16,
    },
    /// A Participant reported a Result
    ResultReported {
        /// The Round of the Match
        round: i16,
        /// The Match
        match_uuid: MatchUuid,
    },
    /// A Participant disputed a Result
    ResultDisputed {
        /// The Round of the Match
        round: i16,
        /// The Match
        match_uuid: MatchUuid,
    },
    /// An Organizer set or corrected a Result
    ResultSet {
        /// The Round of the Match
        round: i16,
        /// The Match
        match_uuid: MatchUuid,
    },
    /// The standings changed
    StandingsChanged,
    /// The stream missed events; the reader fetches everything again
    Resync,
}

impl TournamentEvent {
    /// Whether only the Tournament's Organizers hear it, because it is about a previewed Round
    pub fn for_organizers_only(&self) -> bool {
        matches!(
            self,
            Self::RoundPaired { .. } | Self::RoundDiscarded { .. } | Self::PreviewOutdated { .. }
        )
    }
}

/// A stream of [`TournamentEvent`]s as `text/event-stream`
pub struct EventStream(Body);

impl EventStream {
    /// The response streaming `frames`, each one or more whole Server-Sent Events
    pub fn new(frames: impl Stream<Item = Bytes> + Send + 'static) -> Self {
        Self(Body::from_stream(frames.map(Ok::<_, Infallible>)))
    }
}

impl IntoResponse for EventStream {
    fn into_response(self) -> Response {
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, mime::TEXT_EVENT_STREAM.as_ref()),
                (header::CACHE_CONTROL, "no-cache"),
                (header::HeaderName::from_static("x-accel-buffering"), "no"),
            ],
            self.0,
        )
            .into_response()
    }
}

impl ShouldBeResponseBody for EventStream {}
impl ResponseBody for EventStream {
    fn body(ctx: &mut EndpointContext) -> Vec<(StatusCode, Option<(Mime, Option<Schema>)>)> {
        vec![(
            StatusCode::OK,
            Some((
                mime::TEXT_EVENT_STREAM,
                Some(ctx.generator.generate::<TournamentEvent>()),
            )),
        )]
    }
}
