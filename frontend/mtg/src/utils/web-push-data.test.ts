import { describe, expect, it } from "vitest";
import { base64UrlToBytes, pushLanguage } from "src/utils/web-push-data";

describe("base64UrlToBytes", () => {
    it("reads base64url without padding", () => {
        expect(Array.from(base64UrlToBytes("_-8"))).toEqual([0xff, 0xef]);
    });

    it("reads a VAPID public key as an uncompressed point", () => {
        const key = base64UrlToBytes(
            "BNB80mDISlqPPdZN5BIzx1nYSDBRP7fy-a-54JnNeMZ7GayuJVc5hGeKPjLGil58Zuae4JJYvk87CdcpGJ6QmKk",
        );
        expect(key.length).toBe(65);
        expect(key[0]).toBe(4);
    });
});

describe("pushLanguage", () => {
    it("writes English pushes for an English app", () => {
        expect(pushLanguage("en")).toBe("En");
        expect(pushLanguage("en-US")).toBe("En");
    });

    it("writes German pushes otherwise", () => {
        expect(pushLanguage("de")).toBe("De");
        expect(pushLanguage(undefined)).toBe("De");
    });
});
