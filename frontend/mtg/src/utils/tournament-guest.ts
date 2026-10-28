import type {
    ClaimGuestSeatErrors,
    FormErrorResponseForRecoverGuestSeatErrors,
    RedeemSeatLinkErrors,
    RedeemTournamentSeatLink200Response,
    SeatLinkErrors,
    GuestSignUpErrors,
    ListParticipantsResponse,
    RecoverGuestSeatRequest,
    TournamentResponse,
} from "src/api/generated";
import { TournamentState, Visibility } from "src/api/generated";
import { isFormError } from "src/utils/error";

/**
 * What this device keeps of a Guest it signed up as: enough to restore the Guest seat into a fresh session.
 *
 * The session holds the seat; this is only the Recovery code for when the session is gone (ADR 0007).
 */
export type StoredGuestSeat = {
    /** The Tournament */
    tournament: string;
    /** The Guest's Participant */
    participant: string;
    /** The Recovery code the sign-up answered */
    recoveryCode: string;
};

/** Where the kept Guest seats live in localStorage */
const STORAGE_KEY = "mtg.tournament-guest-seats.v1";

/** How many Guest seats this device keeps at most, like a session; the oldest goes first */
const MAX_STORED = 16;

/**
 * Whether a value read from storage is a kept Guest seat
 *
 * @param value what was read
 * @returns whether it has the shape of one
 */
function isStoredGuestSeat(value: unknown): value is StoredGuestSeat {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<StoredGuestSeat>;
    return (
        typeof candidate.tournament === "string" &&
        typeof candidate.participant === "string" &&
        typeof candidate.recoveryCode === "string"
    );
}

/**
 * Every Guest seat this device keeps
 *
 * @returns the kept seats, oldest first; none where storage is unavailable
 */
export function storedGuestSeats(): Array<StoredGuestSeat> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isStoredGuestSeat) : [];
    } catch {
        return [];
    }
}

/**
 * The Guest seat this device keeps for one Tournament
 *
 * @param tournament the Tournament
 * @returns the kept seat, or `null`
 */
export function storedGuestSeat(tournament: string): StoredGuestSeat | null {
    return storedGuestSeats().find((seat) => seat.tournament === tournament) ?? null;
}

/**
 * Writes the kept Guest seats
 *
 * @param seats what to keep
 * @returns whether storage took them
 */
function store(seats: Array<StoredGuestSeat>): boolean {
    try {
        if (seats.length === 0) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(seats.slice(-MAX_STORED)));
        return true;
    } catch {
        return false;
    }
}

/**
 * Keeps a Guest seat, replacing the one kept for the same Tournament
 *
 * @param seat the seat and its Recovery code
 * @returns whether storage took it
 */
export function keepGuestSeat(seat: StoredGuestSeat): boolean {
    const others = storedGuestSeats().filter((kept) => kept.tournament !== seat.tournament);
    return store([...others, seat]);
}

/**
 * Forgets the Guest seat kept for one Tournament
 *
 * @param tournament the Tournament
 * @returns whether storage took it
 */
export function forgetGuestSeat(tournament: string): boolean {
    const seats = storedGuestSeats();
    const others = seats.filter((kept) => kept.tournament !== tournament);
    return others.length === seats.length || store(others);
}

/**
 * Whether a Tournament is over, so its Recovery codes are gone
 *
 * @param tournament the Tournament
 * @returns whether it is Finished or Cancelled
 */
function over(tournament: TournamentResponse): boolean {
    return tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;
}

/**
 * Whether visitors without an Account may sign up as Guests right now
 *
 * @param tournament the Tournament as the reader sees it
 * @returns whether Guest sign-up is open
 */
export function guestSignUpOpen(tournament: TournamentResponse): boolean {
    return (
        tournament.guest_sign_up &&
        tournament.self_sign_up &&
        tournament.visibility !== Visibility.Private &&
        tournament.state === TournamentState.Registration
    );
}

/** Tournaments whose kept Guest seat this page load already tried to restore */
const attempted = new Set<string>();

/**
 * Restores the Guest seat this device keeps for a Tournament, once per page load, where the session holds none
 *
 * Quiet: a refused code is forgotten, a failed request is kept for the next page load. Once the Tournament is over
 * its codes are gone, so the kept seat is forgotten instead.
 *
 * @param tournament the Tournament
 * @param me who the reader plays as there, `null` for nobody
 * @param recover restores the seat, by id or by share link; `null` where the request failed
 * @returns whether a seat was restored
 */
export async function restoreGuestSeat(
    tournament: TournamentResponse,
    me: string | null,
    recover: (request: RecoverGuestSeatRequest) => Promise<FormErrorResponseForRecoverGuestSeatErrors | null>,
): Promise<boolean> {
    if (over(tournament)) {
        forgetGuestSeat(tournament.uuid);
        return false;
    }
    const kept = storedGuestSeat(tournament.uuid);
    if (me !== null || kept === null || attempted.has(tournament.uuid)) return false;
    attempted.add(tournament.uuid);
    const result = await recover({ participant: kept.participant, code: kept.recoveryCode });
    if (result === null) return false;
    if (isFormError(result)) {
        forgetGuestSeat(tournament.uuid);
        return false;
    }
    return true;
}

/** The message of each reason a Guest sign-up was refused */
const GUEST_SIGN_UP_ERRORS: Record<keyof GuestSignUpErrors, string> = {
    empty_name: "error.guest-name-empty",
    closed: "error.sign-up-closed",
    full: "error.sign-up-full",
    already_participant: "error.sign-up-already",
    busy: "error.guest-sign-up-busy",
};

/**
 * Explains why a Guest sign-up was refused
 *
 * @param error the service's refusal flags, `null` where the request itself was refused
 * @returns the Tournament translation key
 */
export function guestSignUpErrorKey(error: GuestSignUpErrors | null): string {
    if (error === null) return "error.guest-sign-up-failed";
    const reasons = Object.entries(GUEST_SIGN_UP_ERRORS) as Array<[keyof GuestSignUpErrors, string]>;
    return reasons.find(([flag]) => error[flag])?.[1] ?? "error.guest-sign-up-failed";
}

/**
 * Lets every kept Guest seat be restored again, as on a new page load
 */
export function resetRestoreAttempts(): void {
    attempted.clear();
}

/** Who the reader plays as in a Tournament, as the pages around it need it */
export type OwnSeat = {
    /** The reader's Participant, `null` for none */
    me: string | null;
    /** Whether the reader plays as a Guest through its Guest seat */
    asGuest: boolean;
    /** Whether the reader is checked in, `null` where it plays not */
    checkedIn: boolean | null;
    /** Whether the reader dropped */
    dropped: boolean;
};

/**
 * Who the reader plays as, read off the participant list
 *
 * @param list the Participants as the reader reads them, `null` where it sees none
 * @returns the reader's own seat
 */
export function ownSeat(list: ListParticipantsResponse | null): OwnSeat {
    const me = list?.me ?? null;
    const mine = list?.participants.find((participant) => participant.uuid === me) ?? null;
    return {
        me,
        asGuest: mine?.guest ?? false,
        checkedIn: mine?.checked_in ?? null,
        dropped: mine?.dropped_after_round != null,
    };
}

/** The key of a Seat link's secret in the fragment of the link */
const SEAT_LINK_KEY = "seat";

/**
 * The link the desk shows a Guest whose device lost its Guest seat
 *
 * The secret goes into the fragment, which the browser never sends to a server.
 *
 * @param tournament the Tournament as an Organizer reads it
 * @param secret the Seat link's secret
 * @returns the link to the Tournament's page carrying the secret
 */
export function seatLinkUrl(tournament: TournamentResponse, secret: string): string {
    const page =
        tournament.visibility === Visibility.Unlisted && tournament.share_token != null
            ? `/shared/tournaments/${tournament.share_token}`
            : `/tournaments/${tournament.uuid}`;
    return `${window.location.origin}${page}#${SEAT_LINK_KEY}=${encodeURIComponent(secret)}`;
}

/**
 * Takes a Seat link's secret out of the page's fragment, so it is neither redeemed twice nor kept in the history
 *
 * @returns the secret, `null` when the page carries none
 */
export function takeSeatLinkSecret(): string | null {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const secret = fragment.get(SEAT_LINK_KEY);
    if (secret === null || secret === "") return null;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    return secret;
}

/** The message of each reason a Seat link was refused */
const REDEEM_ERRORS: Record<keyof RedeemSeatLinkErrors, string> = {
    unknown_link: "error.seat-link-unknown",
    expired: "error.seat-link-expired",
};

/**
 * Redeems the Seat link in the page's fragment, if any, and keeps the Recovery code it answers
 *
 * @param redeem redeems a secret; `null` where the request failed
 * @returns `null` without a Seat link or once redeemed, else the Tournament translation key of why it was refused
 */
export async function redeemSeatLinkOfPage(
    redeem: (secret: string) => Promise<RedeemTournamentSeatLink200Response | null>,
): Promise<string | null> {
    const secret = takeSeatLinkSecret();
    if (secret === null) return null;
    const result = await redeem(secret);
    if (result === null) return "error.seat-link-failed";
    if (isFormError(result)) {
        const reasons = Object.entries(REDEEM_ERRORS) as Array<[keyof RedeemSeatLinkErrors, string]>;
        return reasons.find(([flag]) => result.error[flag])?.[1] ?? "error.seat-link-failed";
    }
    keepGuestSeat({
        tournament: result.tournament,
        participant: result.participant.uuid,
        recoveryCode: result.recovery_code,
    });
    return null;
}

/** The message of each reason claiming a Guest seat was refused */
const CLAIM_ERRORS: Record<keyof ClaimGuestSeatErrors, string> = {
    already_participant: "error.sign-up-already",
    no_seat: "error.claim-no-seat",
};

/**
 * Explains why claiming a Guest seat was refused
 *
 * @param error the service's refusal flags
 * @returns the Tournament translation key
 */
export function claimErrorKey(error: ClaimGuestSeatErrors): string {
    const reasons = Object.entries(CLAIM_ERRORS) as Array<[keyof ClaimGuestSeatErrors, string]>;
    return reasons.find(([flag]) => error[flag])?.[1] ?? "error.claim-no-seat";
}

/** The message of each reason issuing a Seat link was refused */
const SEAT_LINK_ERRORS: Record<keyof SeatLinkErrors, string> = {
    not_a_guest: "error.seat-link-not-a-guest",
    tournament_over: "error.tournament-over",
};

/**
 * Explains why issuing a Seat link was refused
 *
 * @param error the service's refusal flags
 * @returns the Tournament translation key
 */
export function seatLinkErrorKey(error: SeatLinkErrors): string {
    const reasons = Object.entries(SEAT_LINK_ERRORS) as Array<[keyof SeatLinkErrors, string]>;
    return reasons.find(([flag]) => error[flag])?.[1] ?? "error.tournament-over";
}
