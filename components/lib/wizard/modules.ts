import { type WizardDefinition, wizardNamespace } from "./definition";
import type { WizardFieldTypeRegistry, WizardIconRegistry } from "./field-types";
import { validateWizardDefinition } from "./validation";

/** The input of {@link validateWizardModules}, as produced by eager `import.meta.glob`s */
export type WizardModules = {
    /** The exports of each `<wizard-id>.wizard.ts`, by path */
    modules: Record<string, Record<string, unknown>>;
    /** The parsed `public/locales/<language>/<namespace>.json` files, by path */
    locales: Record<string, unknown>;
    /** The app's Field Type registry */
    fieldTypes: WizardFieldTypeRegistry;
    /** The app's icon registry */
    icons: WizardIconRegistry;
};

/** The errors of one `*.wizard.ts` module */
export type WizardModuleErrors = {
    /** The module's path */
    path: string;
    /** Every error, prefixed with the languages it occurs in where it depends on the language */
    errors: Array<string>;
};

/**
 * Validate TypeScript Wizard modules for CI (ADR-0003).
 *
 * Runs {@link validateWizardDefinition} for every exported definition and every language, and checks that each
 * module exports a definition named after its file. Errors that occur in several languages are merged.
 *
 * The i18n lookup is stricter than `<Wizard>`'s `i18n.exists`: each language must have the key itself (no fallback
 * language) and its value must be a string (not a nested object).
 *
 * @param input The modules, translations and registries
 * @returns The errors of each module, in glob order
 */
export function validateWizardModules(input: WizardModules): Array<WizardModuleErrors> {
    const languages = new Map<string, Map<string, unknown>>();
    for (const [path, resources] of Object.entries(input.locales)) {
        const [, language, file] = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
        if (language === undefined) continue;
        if (!languages.has(language)) languages.set(language, new Map());
        languages.get(language)?.set(file, resources);
    }

    return Object.entries(input.modules).map(([path, exports]) => {
        const definitions = Object.values(exports).filter(isWizardDefinition);
        if (definitions.length === 0) return { path, errors: ["The file exports no Wizard definition"] };

        const fileName = path.split("/").pop();
        const errors: Array<string> = [];
        for (const definition of definitions) {
            const expected = `${definition.id}.wizard.ts`;
            if (fileName !== expected) errors.push(`Wizard "${definition.id}" must be defined in "${expected}"`);

            const found = new Map<string, Array<string>>();
            for (const [language, namespaces] of languages) {
                const i18nNamespace = wizardNamespace(definition.id);
                const resources = namespaces.get(i18nNamespace);
                const messages = validateWizardDefinition(definition, {
                    fieldTypes: input.fieldTypes,
                    icons: input.icons,
                    hasTranslation: (key) => resources === undefined || typeof lookup(resources, key) === "string",
                }).map((error) => error.message);
                if (resources === undefined) messages.push(`The i18n namespace "${i18nNamespace}" is missing`);
                for (const message of messages) found.set(message, [...(found.get(message) ?? []), language]);
            }
            errors.push(...[...found].map(([message, langs]) => `[${langs.join(", ")}] ${message}`));
        }
        return { path, errors };
    });
}

/**
 * Whether a module export looks like a Wizard definition
 *
 * @param value The export
 * @returns `true` for an object with `id`, `version` and `steps`
 */
function isWizardDefinition(value: unknown): value is WizardDefinition {
    return (
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        "version" in value &&
        "steps" in value &&
        Array.isArray(value.steps)
    );
}

/**
 * Resolve an i18n key in a namespace's resources the way i18next does (`.` separates nesting levels)
 *
 * @param resources The parsed namespace JSON
 * @param key The i18n key
 * @returns The value at the key, `undefined` if absent
 */
function lookup(resources: unknown, key: string): unknown {
    return key
        .split(".")
        .reduce<unknown>(
            (node, part) =>
                typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined,
            resources,
        );
}
