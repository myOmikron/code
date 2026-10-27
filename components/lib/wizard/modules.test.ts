import { describe, expect, it } from "vitest";
import type { WizardDefinition } from "./definition";
import { standardWizardFieldTypes } from "./field-types";
import { validateWizardModules } from "./modules";

const greeting: WizardDefinition = {
    id: "greeting",
    version: 1,
    steps: [
        {
            id: "hello",
            label: "label.step-hello",
            sections: [{ id: "hello-name", fields: [{ id: "name", type: "text", label: "label.name" }] }],
        },
    ],
};

const translations = { label: { "step-hello": "Hello", name: "Name" } };

describe("validateWizardModules", () => {
    it("accepts a module whose file is named after its valid Wizard", () => {
        expect(
            validateWizardModules({
                modules: { "/src/wizards/greeting.wizard.ts": { greetingWizard: greeting } },
                locales: {
                    "/public/locales/en/wizard-greeting.json": translations,
                    "/public/locales/de/wizard-greeting.json": translations,
                },
                fieldTypes: standardWizardFieldTypes,
                icons: {},
            }),
        ).toEqual([{ path: "/src/wizards/greeting.wizard.ts", errors: [] }]);
    });

    it("reports a module that exports no Wizard definition", () => {
        expect(
            validateWizardModules({
                modules: { "/src/wizards/greeting.wizard.ts": { helper: 42 } },
                locales: { "/public/locales/en/wizard-greeting.json": translations },
                fieldTypes: standardWizardFieldTypes,
                icons: {},
            }),
        ).toEqual([{ path: "/src/wizards/greeting.wizard.ts", errors: ["The file exports no Wizard definition"] }]);
    });

    it("reports a Wizard whose ID doesn't match the file name", () => {
        expect(
            validateWizardModules({
                modules: { "/src/wizards/hello.wizard.ts": { greetingWizard: greeting } },
                locales: { "/public/locales/en/wizard-greeting.json": translations },
                fieldTypes: standardWizardFieldTypes,
                icons: {},
            }),
        ).toEqual([
            {
                path: "/src/wizards/hello.wizard.ts",
                errors: ['Wizard "greeting" must be defined in "greeting.wizard.ts"'],
            },
        ]);
    });

    it("reports a missing namespace once per language, and missing keys per key, merging equal messages", () => {
        expect(
            validateWizardModules({
                modules: { "/src/wizards/greeting.wizard.ts": { greetingWizard: greeting } },
                locales: {
                    "/public/locales/en/wizard-greeting.json": { label: { "step-hello": "Hello" } },
                    "/public/locales/de/translation.json": {},
                    "/public/locales/fr/wizard-greeting.json": { label: { "step-hello": "Bonjour" } },
                },
                fieldTypes: {},
                icons: {},
            }),
        ).toEqual([
            {
                path: "/src/wizards/greeting.wizard.ts",
                errors: [
                    '[en, de, fr] Wizard Field "name" has the unknown Wizard Field Type "text"',
                    '[en, fr] Wizard Field "name" uses the missing i18n key "label.name"',
                    '[de] The i18n namespace "wizard-greeting" is missing',
                ],
            },
        ]);
    });
});
