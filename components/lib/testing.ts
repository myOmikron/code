import { describe, expect, it } from "vitest";
import type { WizardFieldTypeRegistry, WizardIconRegistry } from "./wizard/field-types";
import { validateWizardModules } from "./wizard/modules";

/**
 * The options for {@link testWizardDefinitions}
 */
export type TestWizardDefinitionsOptions = {
    /** The app's Field Type registry, the same one it passes to `WizardFieldTypesProvider` */
    fieldTypes: WizardFieldTypeRegistry;
    /** The app's icon registry, the same one it passes to `WizardFieldTypesProvider`; none by default */
    icons?: WizardIconRegistry;
};

/**
 * Validate every TypeScript Wizard of the app (ADR-0003), one test per `*.wizard.ts`.
 *
 * Globs `src/wizards/<wizard-id>.wizard.ts` and the translations in `public/locales/<language>/*.json`, both
 * relative to the app's Vite root, and runs the same checks as `<Wizard>` for every language. Each file must export
 * a definition whose ID matches its name. The i18n lookup is stricter than at runtime: no fallback language, and a
 * key must resolve to a string (see `validateWizardModules`).
 *
 * @param options The app's registries
 */
export function testWizardDefinitions(options: TestWizardDefinitionsOptions) {
    const modules = import.meta.glob<Record<string, unknown>>("/src/wizards/*.wizard.ts", { eager: true });
    const locales = import.meta.glob<unknown>("/public/locales/*/*.json", { eager: true, import: "default" });
    const results = validateWizardModules({
        modules,
        locales,
        fieldTypes: options.fieldTypes,
        icons: options.icons ?? {},
    });

    describe("Wizard definitions", () => {
        it("finds the Wizards and their translations", () => {
            expect(results.length, "no files match src/wizards/*.wizard.ts").toBeGreaterThan(0);
            expect(Object.keys(locales).length, "no translations in public/locales/<language>/").toBeGreaterThan(0);
        });

        it.each(results)("$path is valid", ({ errors }) => {
            expect(errors).toEqual([]);
        });
    });
}
