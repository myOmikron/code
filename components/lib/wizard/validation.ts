import {
    WIZARD_REVIEW_STEP_ID,
    type WizardCondition,
    type WizardDefinition,
    type WizardFieldDefinition,
    type WizardFieldRules,
    type WizardPatternRule,
    wizardFields,
} from "./definition";
import type { WizardFieldTypeRegistry, WizardIconRegistry } from "./field-types";
import type { WizardFieldOption } from "./standard-field-types/options";

/** What a Wizard definition is validated against */
export type WizardDefinitionEnvironment = {
    /** The Field Type registry the Wizard runs with */
    fieldTypes: WizardFieldTypeRegistry;
    /** The icon registry the Wizard runs with */
    icons: WizardIconRegistry;
    /** Whether a key exists in the Wizard's i18n namespace */
    hasTranslation: (key: string) => boolean;
};

/** The name of a check of a Wizard definition; extend it when adding a check */
export type WizardDefinitionCheckName =
    | "no-steps"
    | "unknown-field-type"
    | "duplicate-step-or-section-id"
    | "reserved-review-step-id"
    | "duplicate-field-id"
    | "missing-translation"
    | "invalid-pattern"
    | "empty-option-value"
    | "unknown-icon"
    | "visible-when-reference";

/** One problem of a Wizard definition */
export type WizardDefinitionError = {
    /** The check that found it */
    check: WizardDefinitionCheckName;
    /** Developer-facing description naming the offending step, field or key */
    message: string;
};

/** One check of a Wizard definition; reports every problem it finds, not just the first */
type WizardDefinitionCheck = (
    definition: WizardDefinition,
    environment: WizardDefinitionEnvironment,
) => Array<WizardDefinitionError>;

/** A Wizard without Wizard Steps, which has nothing to render */
const noSteps: WizardDefinitionCheck = (definition) =>
    definition.steps.length === 0 ? [{ check: "no-steps", message: "The Wizard has no Wizard Steps" }] : [];

/** Fields whose Wizard Field Type is not in the registry */
const unknownFieldTypes: WizardDefinitionCheck = (definition, environment) =>
    wizardFields(definition)
        .filter((field) => !Object.hasOwn(environment.fieldTypes, field.type))
        .map((field) => ({
            check: "unknown-field-type",
            message: `Wizard Field "${field.id}" has the unknown Wizard Field Type "${field.type}"`,
        }));

/**
 * IDs that occur more than once
 *
 * @param ids The IDs in definition order
 * @returns Each duplicated ID with its count, in order of first occurrence
 */
function duplicates(ids: ReadonlyArray<string>): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].filter(([, count]) => count > 1);
}

/** IDs used more than once among steps and sections, which share one ID space */
const duplicateStepOrSectionIds: WizardDefinitionCheck = (definition) =>
    duplicates(definition.steps.flatMap((step) => [step.id, ...step.sections.map((section) => section.id)])).map(
        ([id, count]) => ({
            check: "duplicate-step-or-section-id",
            message: `Wizard Step/Section ID "${id}" is used ${count} times`,
        }),
    );

/**
 * Steps and sections using the Review Step's reserved ID, which would collide with the Review Step;
 * reported even when the Wizard opts out of the Review Step, as the ID stays reserved
 */
const reservedReviewStepIds: WizardDefinitionCheck = (definition) =>
    definition.steps
        .flatMap((step) => [
            { what: "Wizard Step", id: step.id },
            ...step.sections.map((section) => ({ what: "Wizard Section", id: section.id })),
        ])
        .filter(({ id }) => id === WIZARD_REVIEW_STEP_ID)
        .map(({ what, id }) => ({
            check: "reserved-review-step-id",
            message: `${what} "${id}" uses the reserved Review Step ID`,
        }));

/** Field IDs used more than once anywhere in the Wizard */
const duplicateFieldIds: WizardDefinitionCheck = (definition) =>
    duplicates(wizardFields(definition).map((field) => field.id)).map(([id, count]) => ({
        check: "duplicate-field-id",
        message: `Wizard Field ID "${id}" is used ${count} times`,
    }));

/**
 * The static options of a field of an option-based standard Field Type
 *
 * @param field The field
 * @returns Its options; empty for every other Field Type
 */
function fieldOptions(field: WizardFieldDefinition): ReadonlyArray<WizardFieldOption> {
    return field.type === "select" ||
        field.type === "radio" ||
        field.type === "checkbox-group" ||
        field.type === "checkbox-tiles" ||
        field.type === "radio-tiles"
        ? field.config.options
        : [];
}

/**
 * The `pattern` rule of a field
 *
 * @param field The field
 * @returns Its pattern; `undefined` when it has none or its Field Type takes no text rules
 */
function fieldPattern(field: WizardFieldDefinition): WizardPatternRule | undefined {
    return (field as WizardFieldRules).pattern;
}

/** i18n keys of steps, sections, fields, options and pattern messages that are missing from the Wizard's namespace */
const missingTranslations: WizardDefinitionCheck = (definition, environment) => {
    const errors: Array<WizardDefinitionError> = [];
    /**
     * Report the keys of one step, section or field that are missing
     *
     * @param what What uses the keys, e.g. `Wizard Step "a"`
     * @param keys The keys it uses; `undefined` for an omitted optional key
     */
    const reportMissing = (what: string, keys: Array<string | undefined>) => {
        for (const key of keys) {
            if (key !== undefined && !environment.hasTranslation(key)) {
                errors.push({ check: "missing-translation", message: `${what} uses the missing i18n key "${key}"` });
            }
        }
    };
    for (const step of definition.steps) {
        reportMissing(`Wizard Step "${step.id}"`, [step.label, step.description]);
        for (const section of step.sections) {
            reportMissing(`Wizard Section "${section.id}"`, [section.label, section.description]);
            for (const field of section.fields) {
                reportMissing(`Wizard Field "${field.id}"`, [
                    field.label,
                    field.description,
                    ...fieldOptions(field).map((option) => option.label),
                    fieldPattern(field)?.message,
                ]);
            }
        }
    }
    return errors;
};

/** Patterns whose regex doesn't compile with the `u` flag, as it is compiled at runtime */
const invalidPatterns: WizardDefinitionCheck = (definition) =>
    wizardFields(definition).flatMap((field): Array<WizardDefinitionError> => {
        const pattern = fieldPattern(field);
        if (pattern === undefined) return [];
        try {
            new RegExp(pattern.regex, "u");
            return [];
        } catch (error) {
            return [
                {
                    check: "invalid-pattern",
                    message: `Wizard Field "${field.id}" has a pattern that doesn't compile: ${String(error)}`,
                },
            ];
        }
    });

/** Options with the value `""`, which is the empty choice and counts as empty for `required` */
const emptyOptionValues: WizardDefinitionCheck = (definition) =>
    wizardFields(definition)
        .filter((field) => fieldOptions(field).some((option) => option.value === ""))
        .map((field) => ({
            check: "empty-option-value",
            message: `Wizard Field "${field.id}" has an option with the value "", which means "nothing chosen"`,
        }));

/** Options naming an icon the app hasn't registered */
const unknownIcons: WizardDefinitionCheck = (definition, environment) =>
    wizardFields(definition).flatMap((field) =>
        fieldOptions(field)
            .filter((option) => option.icon !== undefined && !Object.hasOwn(environment.icons, option.icon))
            .map((option) => ({
                check: "unknown-icon",
                message: `Wizard Field "${field.id}" uses the unknown icon "${option.icon}" for option "${option.value}"`,
            })),
    );

/** `visibleWhen` conditions that reference unknown, later or their own fields (ADR-0003) */
const visibleWhenReferences: WizardDefinitionCheck = (definition) => {
    const errors: Array<WizardDefinitionError> = [];
    const known = new Set(wizardFields(definition).map((field) => field.id));
    const earlier = new Set<string>();
    /**
     * Report the condition of one step, section or field if it doesn't reference an earlier field
     *
     * @param what What has the condition, e.g. `Wizard Step "a"`
     * @param condition Its condition, if any
     * @param self The node's own ID if it is a field
     */
    const check = (what: string, condition: WizardCondition | undefined, self?: string) => {
        if (condition === undefined || earlier.has(condition.field)) return;
        const problem =
            condition.field === self
                ? "itself"
                : known.has(condition.field)
                  ? `the Wizard Field "${condition.field}", which is not earlier`
                  : `the unknown Wizard Field "${condition.field}"`;
        errors.push({ check: "visible-when-reference", message: `${what} has a visibleWhen referencing ${problem}` });
    };
    for (const step of definition.steps) {
        check(`Wizard Step "${step.id}"`, step.visibleWhen);
        for (const section of step.sections) {
            check(`Wizard Section "${section.id}"`, section.visibleWhen);
            for (const field of section.fields) {
                check(`Wizard Field "${field.id}"`, field.visibleWhen, field.id);
                earlier.add(field.id);
            }
        }
    }
    return errors;
};

/**
 * Every check a Wizard definition must pass, in reporting order.
 *
 * A new check is a {@link WizardDefinitionCheck} added here, with its name added to
 * {@link WizardDefinitionCheckName}; it then runs both before rendering and in CI.
 */
const wizardDefinitionChecks: ReadonlyArray<WizardDefinitionCheck> = [
    noSteps,
    unknownFieldTypes,
    duplicateStepOrSectionIds,
    reservedReviewStepIds,
    duplicateFieldIds,
    missingTranslations,
    invalidPatterns,
    emptyOptionValues,
    unknownIcons,
    visibleWhenReferences,
];

/**
 * Validate a whole Wizard definition (ADR-0003)
 *
 * @param definition The Wizard definition
 * @param environment The registry and translations it is validated against
 * @returns Every error found by any check; empty when the definition is valid
 */
export function validateWizardDefinition(
    definition: WizardDefinition,
    environment: WizardDefinitionEnvironment,
): Array<WizardDefinitionError> {
    return wizardDefinitionChecks.flatMap((check) => check(definition, environment));
}
