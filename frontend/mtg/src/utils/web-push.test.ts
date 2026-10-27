import { afterEach, describe, expect, it, vi } from "vitest";
import { Api } from "src/api/api";
import { activateTournamentPushes } from "src/utils/web-push";

vi.mock("src/api/api", () => ({
    Api: { accounts: { push: { subscribe: vi.fn(), setTournamentPushes: vi.fn() } } },
}));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe("contextual Tournament push activation", () => {
    it("asks permission synchronously from the activation tap, then reuses the browser subscription", async () => {
        const permission = vi.fn().mockResolvedValue("granted");
        vi.stubGlobal("Notification", { requestPermission: permission });
        const subscribe = vi.fn();
        vi.stubGlobal("navigator", {
            serviceWorker: {
                ready: Promise.resolve({
                    pushManager: {
                        getSubscription: async () => ({
                            toJSON: () => ({
                                endpoint: "https://push.example/device",
                                keys: { p256dh: "key", auth: "auth" },
                            }),
                        }),
                        subscribe,
                    },
                }),
            },
        });
        const activation = activateTournamentPushes("public-key", "En", false);
        expect(permission).toHaveBeenCalledOnce();
        expect(await activation).toBe("subscribed");
        expect(subscribe).not.toHaveBeenCalled();
        expect(Api.accounts.push.subscribe).toHaveBeenCalledWith({
            endpoint: "https://push.example/device",
            p256dh: "key",
            auth: "auth",
            language: "En",
        });
        expect(Api.accounts.push.setTournamentPushes).toHaveBeenCalledWith(true);
    });

    it("keeps an existing device subscription when restoring the Account preference", async () => {
        vi.stubGlobal("Notification", { requestPermission: vi.fn() });
        expect(await activateTournamentPushes("public-key", "De", true)).toBe("subscribed");
        expect(Notification.requestPermission).not.toHaveBeenCalled();
        expect(Api.accounts.push.setTournamentPushes).toHaveBeenCalledWith(true);
    });

    it("does not enable the Account preference when permission is declined", async () => {
        vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
        expect(await activateTournamentPushes("public-key", "En", false)).toBe("denied");
        expect(Api.accounts.push.subscribe).not.toHaveBeenCalled();
        expect(Api.accounts.push.setTournamentPushes).not.toHaveBeenCalled();
    });

    it("reports a failed Account preference update instead of claiming activation succeeded", async () => {
        vi.mocked(Api.accounts.push.setTournamentPushes).mockRejectedValue(new Error("offline"));
        await expect(activateTournamentPushes("public-key", "En", true)).rejects.toThrow("offline");
    });
});
