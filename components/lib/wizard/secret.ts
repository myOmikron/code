import type { JsonValue, WizardEnteredSecret, WizardSecretValue, WizardUnchangedSecret } from "./definition";
import type { AnyWizardFieldType } from "./field-types";
import { isEmptyValue } from "./rules";
import type { WizardLoadedValue, WizardStoredValue } from "./store";

/**
 * A Secret that is not set yet, or that is being replaced
 *
 * @param value The Field Type's value to start the entry with, usually its default
 * @returns A newly entered Secret carrying `value`
 */
export function enteredSecret<V>(value: V): WizardEnteredSecret<V> {
    return { status: "entered", value };
}

/**
 * A Secret that is already set and kept as it is
 *
 * @returns An unchanged Secret, carrying no value
 */
export function unchangedSecret(): WizardUnchangedSecret {
    return { status: "unchanged" };
}

/**
 * Whether a Secret has a value, either already stored or newly entered
 *
 * @param secret The Secret
 * @returns `false` only for a newly entered, empty Secret
 */
export function isSecretSet(secret: WizardSecretValue<unknown>): boolean {
    return secret.status === "unchanged" || !isEmptyValue(secret.value);
}

/**
 * A Secret field's form value
 *
 * @param value The form value of a field whose Field Type is a Secret
 * @returns The value as a Secret
 */
export function asSecret(value: unknown): WizardSecretValue<unknown> {
    return value as WizardSecretValue<unknown>;
}

/**
 * Whether a field's form value is a Secret that is already set and kept as it is
 *
 * @param fieldType The field's type
 * @param value The field's form value
 * @returns `true` for an unchanged Secret
 */
export function isUnchangedSecret(fieldType: AnyWizardFieldType, value: unknown): boolean {
    return fieldType.secret && asSecret(value).status === "unchanged";
}

/**
 * The form value a field starts a Wizard Run with.
 *
 * A loaded Secret only ever comes back as `unchanged`, even from a store that wrongly hands back its value.
 *
 * @param fieldType The field's type
 * @param loaded The value loaded from the store, if any
 * @returns The loaded value or the type's default; a {@link WizardSecretValue} for Secrets
 */
export function initialFieldValue(fieldType: AnyWizardFieldType, loaded: WizardLoadedValue | undefined): unknown {
    if (!fieldType.secret) return loaded ? loaded.value : fieldType.defaultValue;
    if (loaded?.secret && isSecretSet(asSecret(loaded.value))) return unchangedSecret();
    return enteredSecret(fieldType.defaultValue);
}

/** A plain value to validate */
type ValueToValidate = {
    /** The value; a Secret's entered value */
    value: unknown;
};

/**
 * The plain value to validate a field by
 *
 * @param fieldType The field's type
 * @param value The field's form value
 * @returns The value, the entered value of a Secret, or `undefined` for an unchanged Secret, which is always valid
 */
export function valueToValidate(fieldType: AnyWizardFieldType, value: unknown): ValueToValidate | undefined {
    if (!fieldType.secret) return { value };
    const secret = asSecret(value);
    return secret.status === "entered" ? { value: secret.value } : undefined;
}

/**
 * A field's form value as the store's `save` receives it
 *
 * @param fieldType The field's type
 * @param value The field's form value
 * @returns The value with its Secret flag
 */
export function toStoredValue(fieldType: AnyWizardFieldType, value: unknown): WizardStoredValue {
    return fieldType.secret
        ? { value: value as WizardSecretValue<JsonValue>, secret: true }
        : { value: value as JsonValue, secret: false };
}

/**
 * A saved value as a store may hand it back on `load`
 *
 * @param stored The value as `save` received it
 * @returns The value; a set Secret as `unchanged`; `undefined` for a Secret that is not set
 */
export function toLoadedValue(stored: WizardStoredValue): WizardLoadedValue | undefined {
    if (!stored.secret) return stored;
    return isSecretSet(stored.value) ? { value: unchangedSecret(), secret: true } : undefined;
}

/**
 * The general-namespace i18n key showing a Secret on the Review Step
 *
 * @param value The Secret field's form value
 * @returns "set" or "not set", never anything about the value itself
 */
export function secretReviewKey(value: unknown): string {
    return isSecretSet(asSecret(value)) ? "label.secret-set" : "label.secret-not-set";
}
