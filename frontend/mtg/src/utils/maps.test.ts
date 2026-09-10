import { describe, expect, it } from "vitest";
import type { MapsPlatform } from "src/utils/maps";
import { mapsUrl } from "src/utils/maps";

const IPHONE: MapsPlatform = {
    platform: "iPhone",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    maxTouchPoints: 5,
};

/** A real desktop Mac, no touch — still Apple */
const MACOS: MapsPlatform = {
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    maxTouchPoints: 0,
};

/** iPadOS 13+, which disguises itself as a Mac and is only told apart by its touch point */
const IPADOS: MapsPlatform = {
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    maxTouchPoints: 5,
};

const WINDOWS: MapsPlatform = {
    platform: "Win32",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    maxTouchPoints: 0,
};

const ANDROID: MapsPlatform = {
    platform: "Linux armv8l",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
    maxTouchPoints: 5,
};

describe("mapsUrl", () => {
    it("routes an iPhone to Apple Maps", () => {
        expect(mapsUrl("Spielekiste", "Hauptstraße 1, Berlin", IPHONE)).toBe(
            `https://maps.apple.com/?q=Spielekiste&address=${encodeURIComponent("Hauptstraße 1, Berlin")}`,
        );
    });

    it("routes a real Mac to Apple Maps too", () => {
        expect(mapsUrl("Spielekiste", null, MACOS)).toBe("https://maps.apple.com/?q=Spielekiste");
    });

    it("routes iPadOS's disguised-as-Mac user agent to Apple Maps", () => {
        expect(mapsUrl("Spielekiste", null, IPADOS)).toBe("https://maps.apple.com/?q=Spielekiste");
    });

    it("routes a non-Apple platform to Google Maps with api=1", () => {
        const url = mapsUrl("Spielekiste", "Hauptstraße 1, Berlin", WINDOWS);
        expect(url).toBe(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Hauptstraße 1, Berlin")}`,
        );
    });

    it("routes Android to Google Maps as well", () => {
        expect(mapsUrl("Spielekiste", null, ANDROID)).toBe(
            "https://www.google.com/maps/search/?api=1&query=Spielekiste",
        );
    });

    it("encodes spaces and an umlaut in the name", () => {
        const url = mapsUrl("Spielekiste Nürnberg", null, WINDOWS);
        expect(url).toBe(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Spielekiste Nürnberg")}`,
        );
        expect(url).not.toContain(" ");
        expect(url).not.toContain("ü");
    });

    it("falls back to the name when there is no address, on both platforms", () => {
        expect(mapsUrl("Spielekiste", null, IPHONE)).toBe("https://maps.apple.com/?q=Spielekiste");
        expect(mapsUrl("Spielekiste", null, WINDOWS)).toBe(
            "https://www.google.com/maps/search/?api=1&query=Spielekiste",
        );
    });

    it("falls back to the name when the address is blank rather than null", () => {
        expect(mapsUrl("Spielekiste", "   ", WINDOWS)).toBe(
            "https://www.google.com/maps/search/?api=1&query=Spielekiste",
        );
    });

    it("treats a missing navigator as non-Apple", () => {
        expect(mapsUrl("Spielekiste", null, undefined)).toBe(
            "https://www.google.com/maps/search/?api=1&query=Spielekiste",
        );
    });
});
