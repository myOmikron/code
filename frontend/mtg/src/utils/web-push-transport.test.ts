import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_STORE } from "src/context/error-context";
import { SESSION_STORE } from "src/api/session";
import { ResponseError } from "src/api/generated";

const globalErrors = vi.fn();
const sessionEnded = vi.fn();
let activate: typeof import("src/utils/web-push").activateTournamentPushes;
let deviceSubscribed: typeof import("src/utils/web-push").deviceSubscribed;
let api: typeof import("src/api/api").Api;

beforeAll(async () => {
    vi.stubGlobal("window", { location: { origin: "https://mtg.example", pathname: "/tournaments" } });
    const push = await import("src/utils/web-push");
    activate = push.activateTournamentPushes;
    deviceSubscribed = push.deviceSubscribed;
    api = (await import("src/api/api")).Api;
    ERROR_STORE.subscribe(globalErrors);
    SESSION_STORE.subscribe(sessionEnded);
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
        location: { origin: "https://mtg.example", pathname: "/tournaments" },
        PushManager: {},
        Notification: {},
    });
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("navigator", {
        serviceWorker: {
            ready: Promise.resolve({
                pushManager: {
                    getSubscription: async () => ({
                        endpoint: "https://push.example/device",
                        toJSON: () => ({
                            endpoint: "https://push.example/device",
                            keys: { p256dh: "key", auth: "auth" },
                        }),
                    }),
                },
            }),
        },
    });
});

afterEach(() => vi.unstubAllGlobals());

describe("optional Tournament push transport failures", () => {
    it.each(["subscription", "preference"])("keeps a failed %s request local to activation", async (failure) => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(async (url: string) => {
                const fails = failure === "subscription" ? url.endsWith("/push/devices") : url.endsWith("/push");
                return new Response(fails ? JSON.stringify({ trace_id: "unavailable" }) : "null", {
                    status: fails ? 503 : 200,
                    headers: { "Content-Type": "application/json" },
                });
            }),
        );
        await expect(activate("key", "En", false)).rejects.toBeInstanceOf(ResponseError);
        expect(globalErrors).not.toHaveBeenCalled();
        expect(sessionEnded).not.toHaveBeenCalled();
    });

    it("keeps failed settings and device checks local and allows a fresh retry", async () => {
        const transport = vi
            .fn()
            .mockResolvedValueOnce(new Response("{}", { status: 503 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ public_key: "key", tournament_pushes: false }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            )
            .mockResolvedValueOnce(new Response("{}", { status: 503 }));
        vi.stubGlobal("fetch", transport);
        await expect(api.accounts.push.contextual.settings()).rejects.toBeInstanceOf(ResponseError);
        expect(await api.accounts.push.contextual.settings()).toEqual({ public_key: "key", tournament_pushes: false });
        await expect(deviceSubscribed(true)).rejects.toBeInstanceOf(ResponseError);
        expect(globalErrors).not.toHaveBeenCalled();
        expect(sessionEnded).not.toHaveBeenCalled();
    });

    it("keeps network failures local without claiming activation succeeded", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
        await expect(activate("key", "En", false)).rejects.toThrow();
        expect(globalErrors).not.toHaveBeenCalled();
        expect(sessionEnded).not.toHaveBeenCalled();
    });

    it("preserves session expiration for authentication refusals", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
        await expect(activate("key", "En", false)).rejects.toBeDefined();
        expect(sessionEnded).toHaveBeenCalledWith("expired");
        expect(globalErrors).not.toHaveBeenCalled();
    });
});
