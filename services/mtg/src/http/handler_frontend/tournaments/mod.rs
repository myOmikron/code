//! Tournament endpoints
//!
//! The actor block has no `AuthRequiredLayer` on purpose: guests are not accounts, so each
//! handler guards access itself via `TournamentActor` and the model-layer viewer checks.

use galvyn::core::GalvynRouter;

use crate::http::middleware::auth_required::AuthRequiredLayer;

pub mod handler;
pub mod schema;

/// Initialize the tournament routes
pub fn initialize_routes() -> GalvynRouter {
    GalvynRouter::new()
        .merge(
            GalvynRouter::new()
                .handler(handler::list_tournaments)
                .handler(handler::get_tournament)
                .handler(handler::list_tournament_participants)
                .handler(handler::get_tournament_state)
                .handler(handler::list_tournament_rounds)
                .handler(handler::list_round_tables)
                .handler(handler::get_tournament_standings)
                .handler(handler::get_my_tournament_match)
                .handler(handler::report_match_result)
                .handler(handler::drop_tournament_participant)
                .handler(handler::get_participant_decklist)
                .handler(handler::set_participant_decklist),
        )
        .merge(
            GalvynRouter::new()
                .handler(handler::create_tournament)
                .handler(handler::update_tournament)
                .handler(handler::delete_tournament)
                .handler(handler::set_tournament_status)
                .handler(handler::set_tournament_visibility)
                .handler(handler::rotate_tournament_join_code)
                .handler(handler::revoke_tournament_join_code)
                .handler(handler::lock_tournament_decklists)
                .handler(handler::unlock_tournament_decklists)
                .handler(handler::list_tournament_organizers)
                .handler(handler::add_tournament_organizer)
                .handler(handler::remove_tournament_organizer)
                .handler(handler::check_in_tournament_participant)
                .handler(handler::create_tournament_round)
                .handler(handler::start_tournament_round)
                .handler(handler::complete_tournament_round)
                .handler(handler::delete_tournament_round)
                .handler(handler::set_tournament_round_timer)
                .handler(handler::pair_tournament_round)
                .handler(handler::arrange_tournament_round)
                .handler(handler::list_round_meetings)
                .handler(handler::set_match_result)
                .handler(handler::clear_match_result)
                .handler(handler::search_tournament_players)
                .handler(handler::add_tournament_participant)
                .handler(handler::update_tournament_participant)
                .handler(handler::set_participant_fixed_table)
                .handler(handler::delete_tournament_participant)
                .handler(handler::get_participant_claim_token)
                .handler(handler::claim_tournament_participant)
                .handler(handler::list_tournament_audit)
                .handler(handler::list_tournament_venues)
                .handler(handler::delete_tournament_venue)
                .wrap(AuthRequiredLayer),
        )
}
