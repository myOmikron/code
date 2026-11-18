//! Handlers of Command Zone Dating

use std::collections::HashMap;
use std::collections::HashSet;
use std::hash::DefaultHasher;
use std::hash::Hash;
use std::hash::Hasher;

use galvyn::core::Module;
use galvyn::core::re_exports::axum::extract::Path;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::core::re_exports::time::Time;
use galvyn::core::stuff::api_error::ApiError;
use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::delete;
use galvyn::get;
use galvyn::post;
use galvyn::put;
use galvyn::rorm::Database;
use galvyn::rorm::fields::types::MaxStr;
use tracing::warn;
use uuid::Uuid;

use crate::http::handler_frontend::dating::schema::AnswerDateRequest;
use crate::http::handler_frontend::dating::schema::BringThemeRequest;
use crate::http::handler_frontend::dating::schema::DateResponse;
use crate::http::handler_frontend::dating::schema::DateSessionResponse;
use crate::http::handler_frontend::dating::schema::DateThemeResponse;
use crate::http::handler_frontend::dating::schema::DateTurnResponse;
use crate::http::handler_frontend::dating::schema::DatesResponse;
use crate::http::handler_frontend::dating::schema::DatingAnswers;
use crate::http::handler_frontend::dating::schema::DatingCardResponse;
use crate::http::handler_frontend::dating::schema::DatingProfileResponse;
use crate::http::handler_frontend::dating::schema::DatingSetResponse;
use crate::http::handler_frontend::dating::schema::DatingStackRequest;
use crate::http::handler_frontend::dating::schema::DatingStackResponse;
use crate::http::handler_frontend::dating::schema::InterestResponse;
use crate::http::handler_frontend::dating::schema::LeanDirection;
use crate::http::handler_frontend::dating::schema::RejectDimension;
use crate::http::handler_frontend::dating::schema::RejectReason;
use crate::http::handler_frontend::dating::schema::RewindResponse;
use crate::http::handler_frontend::dating::schema::StartDateRequest;
use crate::http::handler_frontend::dating::schema::SwipeKind;
use crate::http::handler_frontend::dating::schema::SwipeRequest;
use crate::http::handler_frontend::dating::schema::SwipeResponse;
use crate::http::handler_frontend::dating::schema::ThemeStrength;
use crate::models::account::Account;
use crate::models::account::AccountUuid;
use crate::models::dating::CommanderPrinting;
use crate::models::dating::DateStatus;
use crate::models::dating::DatingProfile;
use crate::models::dating::GraphProfile;
use crate::models::dating::ProfileAnswers;
use crate::models::dating::Swipe;
use crate::models::dating::SwipeInsert;
use crate::models::dating::date::COME_BACK_CHEMISTRY;
use crate::models::dating::date::DateMoveError;
use crate::models::dating::date::DateProgress;
use crate::models::dating::date::DateState;
use crate::models::dating::date::DateTheme;
use crate::models::dating::date::DatingDate;
use crate::models::dating::date::palette;
use crate::models::dating::legends::legends;
use crate::models::dating::profile_key;
use crate::models::dating::read_commander_printings;
use crate::models::dating::read_profile_decks;
use crate::models::dating::remote;
use crate::models::deck::DeckAccess;
use crate::models::deck::DeckUuid;

/// How many Commanders one stack request returns
const STACK_SIZE: usize = 10;

/// How many unswiped Commanders a client may hold
const MAX_PENDING: usize = 60;

/// After this many rejections in a row, the next like matches
const PITY_AFTER: u64 = 2;

/// How many sets one stack request may filter by
const MAX_FILTER_SETS: usize = 100;

/// Super likes per day
const SUPER_LIKES_PER_DAY: i64 = 1;

fn advisor_error(error: anyhow::Error) -> ApiError {
    warn!(%error, "The advisor did not answer a dating request");
    ApiError::server_error("The advisor did not answer")
}

fn catalog_error(error: anyhow::Error) -> ApiError {
    warn!(%error, "Reading the legendary printings failed");
    ApiError::server_error("The catalog could not be read")
}

fn letters_only(colors: &str) -> bool {
    colors.chars().all(|c| "WUBRG".contains(c))
}

/// The account's profile, rebuilt when its decks or answers changed; `None` with nothing to build from
async fn current_profile(owner: AccountUuid) -> ApiResult<Option<GraphProfile>> {
    let mut tx = Database::global().start_transaction().await?;
    let decks = read_profile_decks(&mut tx, owner).await?;
    let row = DatingProfile::get(&mut tx, owner).await?;
    tx.commit().await?;

    let answers = row.as_ref().and_then(|row| row.answers.clone());
    if decks.is_empty() && answers.is_none() {
        return Ok(None);
    }

    let key = profile_key(&decks, answers.as_ref());
    if let Some(row) = &row
        && row.snapshot_key.as_deref() == Some(key.as_str())
        && let Some(snapshot) = &row.snapshot
    {
        return Ok(Some(snapshot.clone()));
    }

    let profile = remote::build_profile(&decks, answers.as_ref())
        .await
        .map_err(advisor_error)?;

    let mut tx = Database::global().start_transaction().await?;
    DatingProfile::save_snapshot(&mut tx, owner, profile.clone(), &key).await?;
    tx.commit().await?;
    Ok(Some(profile))
}

async fn super_likes_left(
    tx: &mut galvyn::rorm::db::transaction::Transaction,
    owner: AccountUuid,
) -> ApiResult<i64> {
    let midnight = OffsetDateTime::now_utc().replace_time(Time::MIDNIGHT);
    let spent = Swipe::super_likes_since(tx, owner, midnight).await?;
    Ok((SUPER_LIKES_PER_DAY - spent).max(0))
}

fn reason(
    swipe_dimension: Option<&str>,
    direction: Option<&str>,
    detail: Option<String>,
) -> Option<RejectReason> {
    let dimension = match swipe_dimension? {
        "themes" => RejectDimension::Themes,
        "colors" => RejectDimension::Colors,
        "bracket" => RejectDimension::Bracket,
        "budget" => RejectDimension::Budget,
        "salt" => RejectDimension::Salt,
        _ => return None,
    };
    let direction = match direction {
        Some("more") => Some(LeanDirection::More),
        Some("less") => Some(LeanDirection::Less),
        _ => None,
    };
    Some(RejectReason {
        dimension,
        direction,
        detail,
    })
}

fn date_response(swipe: Swipe, printing: Option<&CommanderPrinting>) -> DateResponse {
    DateResponse {
        commander: swipe.commander,
        printing: printing.map(|p| p.printing),
        name: printing.map(|p| p.name.clone()).unwrap_or_default(),
        color_identity: printing
            .map(|p| p.color_identity.clone())
            .unwrap_or_default(),
        image_art_crop: printing.and_then(|p| p.image_art_crop.clone()),
        image_normal: printing.and_then(|p| p.image_normal.clone()),
        status: swipe.status,
        super_like: swipe.super_like,
        came_back: swipe.came_back,
        reason: match swipe.status {
            DateStatus::Rejected => reason(
                swipe.dimension.as_deref(),
                swipe.direction.as_deref(),
                swipe.detail.clone(),
            ),
            _ => None,
        },
        shared: swipe.shared,
        created_at: SchemaDateTime(swipe.created_at),
        open_date: None,
    }
}

/// The next Commanders to swipe
#[post("/stack")]
pub async fn get_dating_stack(
    account: Account,
    ApiJson(request): ApiJson<DatingStackRequest>,
) -> ApiResult<ApiJson<DatingStackResponse>> {
    if request.pending.len() > MAX_PENDING {
        return Err(ApiError::bad_request("Too many pending Commanders"));
    }
    let colors = request.colors.map(MaxStr::into_inner);
    if colors
        .as_deref()
        .is_some_and(|colors| !letters_only(colors))
    {
        return Err(ApiError::bad_request("Colors must be letters of WUBRG"));
    }
    if request.sets.len() > MAX_FILTER_SETS {
        return Err(ApiError::bad_request("Too many sets"));
    }
    let only = if request.sets.is_empty() && request.rarities.is_empty() {
        None
    } else {
        let sets: HashSet<String> = request
            .sets
            .iter()
            .map(|code| code.to_uppercase())
            .collect();
        Some(
            legends()
                .await
                .map_err(catalog_error)?
                .matching(&sets, &request.rarities),
        )
    };

    let Some(profile) = current_profile(account.uuid).await? else {
        return Ok(ApiJson(DatingStackResponse {
            commanders: Vec::new(),
            remaining: 0,
            super_likes_left: SUPER_LIKES_PER_DAY,
            profile_needed: true,
        }));
    };

    let mut tx = Database::global().start_transaction().await?;
    let mut exclude = Swipe::swiped(&mut tx, account.uuid).await?;
    let super_likes_left = super_likes_left(&mut tx, account.uuid).await?;
    tx.commit().await?;

    let seen: HashSet<Uuid> = exclude.iter().copied().collect();
    exclude.extend(request.pending.iter().filter(|id| !seen.contains(id)));

    let mut hasher = DefaultHasher::new();
    account.uuid.into_inner().hash(&mut hasher);
    OffsetDateTime::now_utc().date().hash(&mut hasher);

    let stack = remote::stack(
        &profile,
        &exclude,
        colors.as_deref(),
        only.as_deref(),
        STACK_SIZE,
        hasher.finish() >> 11,
    )
    .await
    .map_err(advisor_error)?;

    let ids: Vec<Uuid> = stack.commanders.iter().map(|c| c.oracle_id).collect();
    let mut tx = Database::global().start_transaction().await?;
    let printings = read_commander_printings(&mut tx, &ids).await?;
    tx.commit().await?;

    let commanders = stack
        .commanders
        .into_iter()
        .map(|commander| {
            let printing = printings.get(&commander.oracle_id);
            DatingCardResponse {
                commander: commander.oracle_id,
                printing: printing.map(|p| p.printing),
                name: commander.name,
                color_identity: commander.color_identity.concat(),
                image_art_crop: printing.and_then(|p| p.image_art_crop.clone()),
                image_normal: printing.and_then(|p| p.image_normal.clone()),
                type_line: commander.type_line,
                oracle_text: commander.oracle_text,
                edhrec_rank: commander.edhrec_rank,
                price_eur: commander.price_eur,
                interests: commander
                    .interests
                    .into_iter()
                    .map(|interest| InterestResponse {
                        label: interest.label,
                        theme: interest.theme,
                    })
                    .collect(),
                your_type: commander.your_type,
            }
        })
        .collect();

    Ok(ApiJson(DatingStackResponse {
        commanders,
        remaining: stack.remaining,
        super_likes_left,
        profile_needed: false,
    }))
}

/// Swipe on a Commander; a like is answered by the Commander
#[post("/swipes")]
pub async fn swipe_commander(
    account: Account,
    ApiJson(request): ApiJson<SwipeRequest>,
) -> ApiResult<ApiJson<SwipeResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let left = super_likes_left(&mut tx, account.uuid).await?;
    let snapshot = DatingProfile::get(&mut tx, account.uuid)
        .await?
        .and_then(|row| row.snapshot);
    let recent = Swipe::recent_likes(&mut tx, account.uuid, PITY_AFTER).await?;
    tx.commit().await?;
    let denied = pity_due(&recent);

    if request.kind == SwipeKind::SuperLike && left <= 0 {
        return Err(ApiError::bad_request("No super like left today"));
    }

    let mut pity = false;
    let insert = match request.kind {
        SwipeKind::Pass => SwipeInsert {
            commander: request.commander,
            status: DateStatus::Passed,
            super_like: false,
            score: 0.0,
            dimension: None,
            direction: None,
            detail: None,
            shared: None,
        },
        SwipeKind::Like | SwipeKind::SuperLike => {
            let profile = match snapshot {
                Some(snapshot) => snapshot,
                None => current_profile(account.uuid).await?.unwrap_or_default(),
            };
            let Some(verdict) = remote::verdict(&profile, request.commander)
                .await
                .map_err(advisor_error)?
            else {
                return Err(ApiError::bad_request("Commander is not in the dating pool"));
            };
            let super_like = request.kind == SwipeKind::SuperLike;
            pity = denied && !super_like && !verdict.is_match;
            let matched = super_like || verdict.is_match || pity;
            SwipeInsert {
                commander: request.commander,
                status: if matched {
                    DateStatus::Matched
                } else {
                    DateStatus::Rejected
                },
                super_like,
                score: verdict.score,
                dimension: verdict.dimension.filter(|_| !matched),
                direction: verdict.direction.filter(|_| !matched),
                detail: verdict.detail.filter(|_| !matched),
                shared: verdict.shared,
            }
        }
    };

    let mut tx = Database::global().start_transaction().await?;
    let swipe = Swipe::record(&mut tx, account.uuid, insert).await?;
    let super_likes_left = super_likes_left(&mut tx, account.uuid).await?;
    tx.commit().await?;

    Ok(ApiJson(SwipeResponse {
        status: swipe.status,
        reason: reason(
            swipe.dimension.as_deref(),
            swipe.direction.as_deref(),
            swipe.detail.clone(),
        ),
        shared: swipe.shared,
        super_likes_left,
        pity,
    }))
}

/// Whether the newest likes were all rejected, enough of them for a pity match
fn pity_due(recent: &[DateStatus]) -> bool {
    recent.len() as u64 == PITY_AFTER && recent.iter().all(|status| *status == DateStatus::Rejected)
}

/// Undo the newest swipe
#[delete("/swipes/last")]
pub async fn rewind_swipe(account: Account) -> ApiResult<ApiJson<RewindResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let commander = Swipe::rewind(&mut tx, account.uuid).await?;
    tx.commit().await?;
    Ok(ApiJson(RewindResponse { commander }))
}

/// Matches and the Commanders that said no
#[get("/dates")]
pub async fn get_dates(account: Account) -> ApiResult<ApiJson<DatesResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let dates = Swipe::dates(&mut tx, account.uuid).await?;
    let open: HashMap<Uuid, Uuid> = DatingDate::open(&mut tx, account.uuid)
        .await?
        .into_iter()
        .map(|date| (date.commander, date.deck.into_inner()))
        .collect();
    let ids: Vec<Uuid> = dates.iter().map(|date| date.commander).collect();
    let printings: HashMap<Uuid, CommanderPrinting> =
        read_commander_printings(&mut tx, &ids).await?;
    tx.commit().await?;

    let mut matches = Vec::new();
    let mut shots = Vec::new();
    for date in dates {
        let printing = printings.get(&date.commander);
        let matched = date.status == DateStatus::Matched;
        let open_date = open.get(&date.commander).copied();
        let mut response = date_response(date, printing);
        response.open_date = open_date;
        if matched {
            matches.push(response);
        } else {
            shots.push(response);
        }
    }
    Ok(ApiJson(DatesResponse { matches, shots }))
}

async fn move_date(
    account: Account,
    commander: Uuid,
    status: DateStatus,
    came_back: bool,
) -> ApiResult<ApiJson<DateResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let Some(date) = Swipe::set_status(&mut tx, account.uuid, commander, status, came_back).await?
    else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Request was denied"));
    };
    let printings = read_commander_printings(&mut tx, &[commander]).await?;
    tx.commit().await?;
    Ok(ApiJson(date_response(date, printings.get(&commander))))
}

/// "No, come back": a rejection or unmatch becomes a match
#[post("/dates/{commander}/come-back")]
pub async fn come_back_date(
    account: Account,
    Path(commander): Path<Uuid>,
) -> ApiResult<ApiJson<DateResponse>> {
    move_date(account, commander, DateStatus::Matched, true).await
}

/// End a match
#[post("/dates/{commander}/unmatch")]
pub async fn unmatch_date(
    account: Account,
    Path(commander): Path<Uuid>,
) -> ApiResult<ApiJson<DateResponse>> {
    move_date(account, commander, DateStatus::Unmatched, false).await
}

/// The sets the stack can be filtered by
#[get("/sets")]
pub async fn get_dating_sets() -> ApiResult<ApiJson<Vec<DatingSetResponse>>> {
    Ok(ApiJson(
        legends()
            .await
            .map_err(catalog_error)?
            .sets()
            .iter()
            .map(|set| DatingSetResponse {
                code: set.code.clone(),
                name: set.name.clone(),
                legends: set.legends,
            })
            .collect(),
    ))
}

/// Forget every pass
#[delete("/passes")]
pub async fn reset_dating_passes(account: Account) -> ApiResult<ApiJson<()>> {
    let mut tx = Database::global().start_transaction().await?;
    Swipe::reset_passes(&mut tx, account.uuid).await?;
    tx.commit().await?;
    Ok(ApiJson(()))
}

async fn profile_response(owner: AccountUuid) -> ApiResult<DatingProfileResponse> {
    let profile = current_profile(owner).await?.unwrap_or_default();
    let mut tx = Database::global().start_transaction().await?;
    let answers = DatingProfile::get(&mut tx, owner)
        .await?
        .and_then(|row| row.answers);
    tx.commit().await?;

    let labels = profile.labels;
    let mut themes: Vec<ThemeStrength> = profile
        .themes
        .into_iter()
        .map(|(theme, strength)| ThemeStrength {
            label: labels.get(&theme).cloned().unwrap_or_else(|| theme.clone()),
            theme,
            strength,
        })
        .collect();
    themes.sort_by(|a, b| b.strength.total_cmp(&a.strength));
    let mut colors: Vec<(String, f64)> = profile.colors.into_iter().collect();
    colors.sort_by(|a, b| b.1.total_cmp(&a.1));

    Ok(DatingProfileResponse {
        answers: answers.map(|answers| DatingAnswers {
            colors: MaxStr::new(answers.colors).unwrap_or_default(),
            bracket: answers.bracket,
            budget_eur: answers.budget_eur,
        }),
        decks: profile.decks,
        themes,
        colors: colors.into_iter().map(|(color, _)| color).collect(),
        bracket: profile.bracket,
        budget_eur: profile.budget_eur,
        salt: profile.salt,
    })
}

/// What Commanders see of the account
#[get("/profile")]
pub async fn get_dating_profile(account: Account) -> ApiResult<ApiJson<DatingProfileResponse>> {
    Ok(ApiJson(profile_response(account.uuid).await?))
}

/// Answer the dating-profile questions
#[put("/profile")]
pub async fn update_dating_profile(
    account: Account,
    ApiJson(request): ApiJson<DatingAnswers>,
) -> ApiResult<ApiJson<DatingProfileResponse>> {
    if !letters_only(&request.colors) {
        return Err(ApiError::bad_request("Colors must be letters of WUBRG"));
    }
    if request
        .bracket
        .is_some_and(|bracket| !(1..=5).contains(&bracket))
    {
        return Err(ApiError::bad_request("Bracket must be between 1 and 5"));
    }
    if request
        .budget_eur
        .is_some_and(|budget| !(0..=100_000).contains(&budget))
    {
        return Err(ApiError::bad_request("Budget is out of range"));
    }

    let answers = ProfileAnswers {
        colors: request.colors.into_inner(),
        bracket: request.bracket,
        budget_eur: request.budget_eur,
    };
    let mut tx = Database::global().start_transaction().await?;
    DatingProfile::save_answers(&mut tx, account.uuid, &answers).await?;
    tx.commit().await?;
    Ok(ApiJson(profile_response(account.uuid).await?))
}

fn session_response(date: DatingDate, printing: Option<&CommanderPrinting>) -> DateSessionResponse {
    let theme = |theme: &DateTheme| DateThemeResponse {
        theme: theme.theme.clone(),
        label: theme.label.clone(),
    };
    let next = match date.status {
        DateProgress::Active => date.state.next(),
        _ => None,
    };
    DateSessionResponse {
        deck: date.deck.into_inner(),
        commander: date.commander,
        name: printing.map(|p| p.name.clone()).unwrap_or_default(),
        image_art_crop: printing.and_then(|p| p.image_art_crop.clone()),
        status: date.status,
        chemistry: date.state.chemistry,
        next,
        round: (date.state.turns.len() / 2 + 1).min(3) as i32,
        proposal: next.and(date.state.proposal()).map(theme),
        palette: date.state.open_palette().into_iter().map(theme).collect(),
        turns: date
            .state
            .turns
            .iter()
            .map(|turn| DateTurnResponse {
                by: turn.by,
                theme: turn.theme.theme.clone(),
                label: turn.theme.label.clone(),
                level: turn.level,
                delta: turn.delta,
            })
            .collect(),
    }
}

fn move_error(error: DateMoveError) -> ApiError {
    ApiError::bad_request(match error {
        DateMoveError::NotActive => "The date is over",
        DateMoveError::NotYourTurn => "It is not your turn",
        DateMoveError::UnknownTheme => "That theme is not on the table",
        DateMoveError::AvoidNotAllowed => "Bring a theme you want",
    })
}

/// Plan a deck's themes on a date with its Commander
#[post("/dates/{commander}/plan")]
pub async fn start_date(
    account: Account,
    Path(commander): Path<Uuid>,
    ApiJson(request): ApiJson<StartDateRequest>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    let profile = current_profile(account.uuid).await?.unwrap_or_default();
    let Some(plan) = remote::date_plan(commander).await.map_err(advisor_error)? else {
        return Err(ApiError::bad_request("Commander is not in the dating pool"));
    };

    let rated = |theme: &remote::RatedTheme| DateTheme {
        theme: theme.theme.clone(),
        label: theme.label.clone(),
        tier: theme.tier,
    };
    let proposals: Vec<DateTheme> = plan.proposals.iter().map(rated).collect();
    let themes: Vec<DateTheme> = plan.themes.iter().map(rated).collect();
    let mut own: Vec<(String, f64)> = profile.themes.into_iter().collect();
    own.sort_by(|a, b| b.1.total_cmp(&a.1));
    let own: Vec<String> = own.into_iter().map(|(theme, _)| theme).collect();
    let state = DateState::new(proposals.clone(), palette(&proposals, &themes, &own));

    let mut tx = Database::global().start_transaction().await?;
    let DeckAccess::Granted(date) =
        DatingDate::start(&mut tx, account.uuid, request.deck, commander, state).await?
    else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Request was denied"));
    };
    let printings = read_commander_printings(&mut tx, &[commander]).await?;
    tx.commit().await?;
    Ok(ApiJson(session_response(date, printings.get(&commander))))
}

/// The date planning a deck
#[get("/date/{deck}")]
pub async fn get_date(
    account: Account,
    Path(deck): Path<DeckUuid>,
) -> ApiResult<ApiJson<Option<DateSessionResponse>>> {
    let mut tx = Database::global().start_transaction().await?;
    let Some(date) = DatingDate::get(&mut tx, account.uuid, deck).await? else {
        tx.commit().await?;
        return Ok(ApiJson(None));
    };
    let printings = read_commander_printings(&mut tx, &[date.commander]).await?;
    tx.commit().await?;
    let printing = printings.get(&date.commander);
    Ok(ApiJson(Some(session_response(date, printing))))
}

/// The bracket a finished date gives the deck: the account's, rounded
fn profile_bracket(profile: Option<&GraphProfile>) -> Option<i16> {
    let bracket = profile?.bracket?;
    Some((bracket.round() as i16).clamp(1, 5))
}

async fn date_move(
    account: Account,
    deck: DeckUuid,
    apply: impl FnOnce(&mut DatingDate) -> Result<DateProgress, DateMoveError>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    let mut tx = Database::global().start_transaction().await?;
    let Some(mut date) = DatingDate::get(&mut tx, account.uuid, deck).await? else {
        tx.rollback().await?;
        return Err(ApiError::bad_request("Request was denied"));
    };
    let progress = match apply(&mut date) {
        Ok(progress) => progress,
        Err(error) => {
            tx.rollback().await?;
            return Err(move_error(error));
        }
    };
    date.status = progress;
    let profile = DatingProfile::get(&mut tx, account.uuid)
        .await?
        .and_then(|row| row.snapshot);
    date.save(&mut tx, account.uuid, profile_bracket(profile.as_ref()))
        .await?;
    let printings = read_commander_printings(&mut tx, &[date.commander]).await?;
    tx.commit().await?;
    let printing = printings.get(&date.commander);
    Ok(ApiJson(session_response(date, printing)))
}

fn active(date: &DatingDate) -> Result<(), DateMoveError> {
    if date.status == DateProgress::Active {
        Ok(())
    } else {
        Err(DateMoveError::NotActive)
    }
}

/// Answer the Commander's proposal with a level
#[post("/date/{deck}/answer")]
pub async fn answer_date(
    account: Account,
    Path(deck): Path<DeckUuid>,
    ApiJson(request): ApiJson<AnswerDateRequest>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    date_move(account, deck, |date| {
        active(date)?;
        date.state.answer(request.level)
    })
    .await
}

/// Bring a theme from the palette
#[post("/date/{deck}/bring")]
pub async fn bring_theme(
    account: Account,
    Path(deck): Path<DeckUuid>,
    ApiJson(request): ApiJson<BringThemeRequest>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    date_move(account, deck, |date| {
        active(date)?;
        date.state.bring(&request.theme, request.level)
    })
    .await
}

/// "That's all, date night": finish with the themes so far
#[post("/date/{deck}/date-night")]
pub async fn date_night(
    account: Account,
    Path(deck): Path<DeckUuid>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    date_move(account, deck, |date| {
        active(date)?;
        date.state.date_night()
    })
    .await
}

/// "No, come back": the Commander returns to a date it left
#[post("/date/{deck}/come-back")]
pub async fn come_back_to_date(
    account: Account,
    Path(deck): Path<DeckUuid>,
) -> ApiResult<ApiJson<DateSessionResponse>> {
    date_move(account, deck, |date| {
        if date.status != DateProgress::Left {
            return Err(DateMoveError::NotActive);
        }
        date.state.chemistry = COME_BACK_CHEMISTRY;
        Ok(if date.state.next().is_some() {
            DateProgress::Active
        } else {
            DateProgress::Done
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_rejections_in_a_row_earn_a_pity_match() {
        use DateStatus::*;
        assert!(pity_due(&[Rejected, Rejected]));
        assert!(!pity_due(&[Rejected, Matched]));
        assert!(!pity_due(&[Matched, Rejected]));
        assert!(!pity_due(&[Rejected]));
        assert!(!pity_due(&[]));
    }
}
