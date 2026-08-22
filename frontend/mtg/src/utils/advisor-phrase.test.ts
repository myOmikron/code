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

    it("keeps a key for every phrase family the service emits", () => {
        // Guards the rename that would silently drop a family: if these
        // prefixes stop existing, `say()` is falling back to English for all
        // of them and nobody would see a failure.
        const all = keys(de);
        for (const prefix of ["label.cut-", "label.why-", "description.note-"]) {
            expect(
                [...all].some((k) => k.startsWith(prefix)),
                prefix,
            ).toBe(true);
        }
    });
});
