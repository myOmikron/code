import { describe, expect, it } from "vitest";
import de from "../../public/locales/de/advisor.json";
import en from "../../public/locales/en/advisor.json";

/**
 * The graph service names its sentences; this app words them. Nothing checks
 * the join at build time — a code with no key renders as English rather than
 * failing — so the two ends are compared here instead.
 */
describe("phrase keys", () => {
    const keys = (bundle: Record<string, Record<string, string>>) =>
        new Set(Object.entries(bundle).flatMap(([cat, v]) => Object.keys(v).map((k) => `${cat}.${k}`)));

    it("says the same things in both languages", () => {
        expect([...keys(de)].sort()).toEqual([...keys(en)].sort());
    });

    it("interpolates the same placeholders in both languages", () => {
        // A German string reaching for a param the English one does not send
        // renders the placeholder verbatim at the reader.
        const params = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
        for (const [cat, entries] of Object.entries(de)) {
            for (const [key, value] of Object.entries(entries)) {
                const other = (en as Record<string, Record<string, string>>)[cat]?.[key];
                if (other === undefined) continue;
                expect(params(value), `${cat}.${key}`).toEqual(params(other));
            }
        }
    });

    // The five reason codes `score_cuts` (cuts.py) can emit. `say()` builds
    // the key as `label.${kind}-${code}` with kind "cut", so each of these
    // must exist verbatim in both bundles — a code that itself carried the
    // `cut-` prefix would double up into a key nothing here holds, silently
    // falling back to English (the bug this test guards against).
    const cutCodes = ["bucket-crowded", "improves-shape", "rarely-played", "staple", "supplies-scarce"];

    it("has a label for every cut reason code the service emits", () => {
        for (const code of cutCodes) {
            const key = `label.cut-${code}`;
            expect(keys(de).has(key), key).toBe(true);
            expect(keys(en).has(key), key).toBe(true);
        }
    });

    it("keeps a key for every phrase family the service emits", () => {
        // Guards the rename that would silently drop a family: if these
        // prefixes stop existing, `say()` is falling back to English for all
        // of them and nobody would see a failure.
        const all = keys(de);
        for (const prefix of ["label.why-", "description.note-"]) {
            expect(
                [...all].some((k) => k.startsWith(prefix)),
                prefix,
            ).toBe(true);
        }
    });
});
