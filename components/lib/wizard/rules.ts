import type { WizardFieldDefinition, WizardFieldRules } from "./definition";
import type { AnyWizardFieldType } from "./field-types";
import { valueToValidate } from "./secret";

/** A translatable message of a Wizard, e.g. a validation or submit error: an i18n key and its namespace */
export type WizardMessage = {
    /** The i18n key of the message */
    key: string;
    /** `general` (the `tg` namespace) or `wizard` (the Wizard's own namespace) */
    namespace: "general" | "wizard";
    /** Interpolation values of the message, e.g. a rule's bound */
    values?: Record<string, string | number>;
};

/**
 * Whether a value counts as empty: `required` rejects it, and neither the rules nor the Field Type's `validate`
 * see it.
 *
 * `false` is empty for every boolean Field Type, custom ones included: a required boolean field must be on, and a
 * boolean type's `validate` is never called with `false`. Likewise `[]` for list types: a required one needs an entry.
 *
 * @param value The field's value
 * @returns `true` for `undefined`, `null`, `""`, `false` and `[]`
 */
export function isEmptyValue(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === "" ||
        value === false ||
        (Array.isArray(value) && value.length === 0)
    );
}

/**
 * Validate one Wizard Field's value: the declarative rules first, then the Field Type's own `validate`.
 *
 * Empty values are only checked by `required`; the other checks only see non-empty values. Secrets are checked by
 * their newly entered value; an unchanged Secret is always valid.
 *
 * @param field The field's definition
 * @param fieldType The field's type from the registry
 * @param value The field's current value
 * @returns All errors, empty when the value is valid
 */
export async function validateWizardField(
    field: WizardFieldDefinition,
    fieldType: AnyWizardFieldType,
    value: unknown,
): Promise<Array<WizardMessage>> {
    const checked = valueToValidate(fieldType, value);
    return checked ? validateValue(field, fieldType, checked.value) : [];
}

/**
 * Validate a plain (non-Secret or newly entered) value of a Wizard Field
 *
 * @param field The field's definition
 * @param fieldType The field's type from the registry
 * @param value The value
 * @returns All errors, empty when the value is valid
 */
async function validateValue(
    field: WizardFieldDefinition,
    fieldType: AnyWizardFieldType,
    value: unknown,
): Promise<Array<WizardMessage>> {
    if (isEmptyValue(value)) {
        return field.required ? [{ key: "error.required", namespace: "general" }] : [];
    }
    const keys = await fieldType.validate(value, field.config ?? {});
    return [
        ...checkRules(field as WizardFieldRules, value),
        ...keys.map((key): WizardMessage => ({ key, namespace: "general" })),
    ];
}

/**
 * Check the declarative rules of a field against a non-empty value
 *
 * @param rules The field's rules
 * @param value The field's value
 * @returns The errors of the violated rules
 */
function checkRules(rules: WizardFieldRules, value: unknown): Array<WizardMessage> {
    const errors: Array<WizardMessage> = [];
    if (typeof value === "string") {
        const length = [...value].length;
        if (rules.minLength !== undefined && length < rules.minLength) {
            errors.push({ key: "error.min-length", namespace: "general", values: { min: rules.minLength } });
        }
        if (rules.maxLength !== undefined && length > rules.maxLength) {
            errors.push({ key: "error.max-length", namespace: "general", values: { max: rules.maxLength } });
        }
        if (rules.pattern && !new RegExp(rules.pattern.regex, "u").test(value)) {
            errors.push({ key: rules.pattern.message, namespace: "wizard" });
        }
    }
    if (typeof value === "number") {
        if (rules.min !== undefined && value < rules.min) {
            errors.push({ key: "error.min", namespace: "general", values: { min: rules.min } });
        }
        if (rules.max !== undefined && value > rules.max) {
            errors.push({ key: "error.max", namespace: "general", values: { max: rules.max } });
        }
    }
    return errors;
}
