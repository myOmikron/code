import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentResponse } from "src/api/generated";
import { TournamentState, Visibility } from "src/api/generated";
import {
    forgetGuestSeat,
    guestSignUpErrorKey,
    guestSignUpOpen,
    keepGuestSeat,
    resetRestoreAttempts,
    restoreGuestSeat,
    storedGuestSeat,
    storedGuestSeats,
} from "src/utils/tournament-guest";

/**
 * A minimal localStorage backed by the supplied map
 *
 * @param values the mutable key/value backing store
 * @returns a Storage-compatible wrapper
 */
function storage(values: Map<string, string>): Storage {
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        key: (index) => [...values.keys()][index] ?? null,
        /** @returns number of keys currently stored */
        get length() {
            return values.size;
        },
    };
}

/**
 * A Tournament in `state` that takes Guest sign-ups
 *
 * @param state where it stands
 * @returns the Tournament as a visitor reads it
 */
function tournament(state: TournamentState = TournamentState.Registration): TournamentResponse {
    return {
        uuid: "t1",
        name: "Friday Night Commander",
        starts_at: "2026-11-07T18:30:00Z",
        table_size: 4,
        ruleset: "TopDeck",
        visibility: Visibility.Public,
        state,
        self_sign_up: true,
        guest_sign_up: true,
        entered_afterwards: false,
        check_in: "Required",
    } as TournamentResponse;
}

const ok = { result: "Ok", value: null } as never;
const refused = { result: "Err", error: { unknown_code: true, tournament_over: false } } as never;

beforeEach(() => {
    vi.stubGlobal("localStorage", storage(new Map()));
    resetRestoreAttempts();
});
afterEach(() => vi.unstubAllGlobals());

describe("kept Guest seats", () => {
    it("keeps one seat per Tournament, the latest", () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });
        keepGuestSeat({ tournament: "t1", participant: "p2", recoveryCode: "b" });

        expect(storedGuestSeats()).toEqual([{ tournament: "t1", participant: "p2", recoveryCode: "b" }]);
    });

    it("forgets the seat of one Tournament only", () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });
        keepGuestSeat({ tournament: "t2", participant: "p2", recoveryCode: "b" });

        forgetGuestSeat("t1");

        expect(storedGuestSeat("t1")).toBeNull();
        expect(storedGuestSeat("t2")?.participant).toBe("p2");
    });

    it("keeps at most sixteen seats, dropping the oldest", () => {
        for (let index = 0; index < 17; index++) {
            keepGuestSeat({ tournament: `t${index}`, participant: "p", recoveryCode: "c" });
        }

        expect(storedGuestSeats()).toHaveLength(16);
        expect(storedGuestSeat("t0")).toBeNull();
    });

    it("reads nothing where storage is broken", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("blocked");
            },
        });

        expect(storedGuestSeats()).toEqual([]);
        expect(keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" })).toBe(false);
    });
});

describe("restoring a kept Guest seat", () => {
    it("restores once when the session holds no seat", async () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });
        const recover = vi.fn().mockResolvedValue(ok);

        expect(await restoreGuestSeat(tournament(), null, recover)).toBe(true);
        expect(await restoreGuestSeat(tournament(), null, recover)).toBe(false);
        expect(recover).toHaveBeenCalledTimes(1);
        expect(recover).toHaveBeenCalledWith({ participant: "p1", code: "a" });
    });

    it("leaves a reader that plays already alone", async () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });
        const recover = vi.fn();

        expect(await restoreGuestSeat(tournament(), "p1", recover)).toBe(false);
        expect(recover).not.toHaveBeenCalled();
    });

    it("forgets a refused code", async () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });

        expect(await restoreGuestSeat(tournament(), null, vi.fn().mockResolvedValue(refused))).toBe(false);
        expect(storedGuestSeat("t1")).toBeNull();
    });

    it("keeps the code when the request failed", async () => {
        keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });

        expect(await restoreGuestSeat(tournament(), null, vi.fn().mockResolvedValue(null))).toBe(false);
        expect(storedGuestSeat("t1")).not.toBeNull();
    });

    it("forgets the seat of a Tournament that is over, without asking", async () => {
        for (const state of [TournamentState.Finished, TournamentState.Cancelled]) {
            keepGuestSeat({ tournament: "t1", participant: "p1", recoveryCode: "a" });
            const recover = vi.fn();

            expect(await restoreGuestSeat(tournament(state), "p1", recover)).toBe(false);
            expect(storedGuestSeat("t1")).toBeNull();
            expect(recover).not.toHaveBeenCalled();
        }
    });
});

describe("Guest sign-up", () => {
    it("is open in Registration only", () => {
        expect(guestSignUpOpen(tournament())).toBe(true);
        expect(guestSignUpOpen(tournament(TournamentState.Swiss))).toBe(false);
    });

    it("is closed without the Owner's consent", () => {
        expect(guestSignUpOpen({ ...tournament(), guest_sign_up: false })).toBe(false);
        expect(guestSignUpOpen({ ...tournament(), self_sign_up: false })).toBe(false);
    });

    it("explains every refusal with its own message", () => {
        const none = { empty_name: false, closed: false, full: false, already_participant: false, busy: false };
        const keys = (Object.keys(none) as Array<keyof typeof none>).map((flag) =>
            guestSignUpErrorKey({ ...none, [flag]: true }),
        );

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain("error.guest-sign-up-failed");
        expect(guestSignUpErrorKey(null)).toBe("error.guest-sign-up-failed");
    });
});
