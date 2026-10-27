import type {
    WizardCondition,
    WizardDefinition,
    WizardFieldDefinition,
    WizardSectionDefinition,
    WizardStepDefinition,
} from "./definition";

/**
 * The Wizard Steps that are currently visible, each with only its visible Sections and Fields.
 *
 * A step, section or field is visible while its `visibleWhen` condition holds; a condition on a hidden field never
 * holds. Pure, so navigation, the StepBar and submit all derive visibility the same way.
 *
 * @param definition The Wizard definition (validated: conditions only reference earlier fields)
 * @param values The current values `{ [fieldId]: value }`
 * @returns The visible steps in order, pruned to their visible sections and fields
 */
export function visibleSteps(
    definition: WizardDefinition,
    values: Readonly<Record<string, unknown>>,
): Array<WizardStepDefinition> {
    const visible = new Set<string>();
    const holds = (condition: WizardCondition | undefined) =>
        condition === undefined ||
        (visible.has(condition.field) && jsonEqual(values[condition.field], condition.equals));

    const steps: Array<WizardStepDefinition> = [];
    for (const step of definition.steps) {
        if (!holds(step.visibleWhen)) continue;
        const sections: Array<WizardSectionDefinition> = [];
        for (const section of step.sections) {
            if (!holds(section.visibleWhen)) continue;
            const fields: Array<WizardFieldDefinition> = [];
            for (const field of section.fields) {
                if (!holds(field.visibleWhen)) continue;
                visible.add(field.id);
                fields.push(field);
            }
            sections.push({ ...section, fields });
        }
        steps.push({ ...step, sections });
    }
    return steps;
}

/**
 * Structural equality of JSON values
 *
 * @param a One value
 * @param b The other value
 * @returns Whether both hold the same JSON data
 */
function jsonEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aEntries = Object.entries(a);
    if (aEntries.length !== Object.keys(b).length) return false;
    return aEntries.every(
        ([key, value]) => Object.hasOwn(b, key) && jsonEqual(value, (b as Record<string, unknown>)[key]),
    );
}
