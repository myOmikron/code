import { describe, expect, it } from "vitest";
import { conservativeScanner } from "./runtime-policy";

describe("scanner runtime policy", () => {
    it.each([
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130 Mobile Safari/604.1",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    ])("uses plain WASM for WebKit: %s", (agent) => {
        expect(conservativeScanner(agent)).toBe(true);
    });

    it.each([
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
        "Mozilla/5.0 Firefox/130.0",
        "",
    ])("keeps WebGPU available elsewhere: %s", (agent) => {
        expect(conservativeScanner(agent)).toBe(false);
    });
});
