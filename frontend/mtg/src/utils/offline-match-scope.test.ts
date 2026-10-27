import { afterEach, expect, it, vi } from "vitest";
import { FetchError, ResponseError } from "src/api/generated";
import { isMatchTransportFailure, readOfflineMatchScope, setOfflineMatchAccount } from "src/utils/offline-match-scope";

afterEach(() => vi.unstubAllGlobals());

it("allows generated transport errors but never authorization or visibility responses", () => {
    expect(isMatchTransportFailure(new FetchError(new TypeError("offline")))).toBe(true);
    for (const status of [401, 403, 404, 500])
        expect(isMatchTransportFailure(new ResponseError(new Response(null, { status }), "refused"))).toBe(false);
});

it("revokes offline scope on sign-out and scopes later access to a newly verified Account", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", new EventTarget());
    setOfflineMatchAccount("account-a");
    expect(readOfflineMatchScope()?.account).toBe("account-a");
    setOfflineMatchAccount(null);
    expect(readOfflineMatchScope()).toBeNull();
    setOfflineMatchAccount("account-b");
    expect(readOfflineMatchScope()?.account).toBe("account-b");
});
