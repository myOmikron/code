import { useEffect, useState } from "react";
import { Input } from "../../components/base/input";
import type { WizardInvalidInput } from "../definition";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the standard `number` Wizard Field Type */
export type NumberFieldConfig = {
    /** Only whole numbers are valid */
    readonly integer?: boolean;
};

/** The value of a `number` field: the number, `null` while empty, the raw text while unparsable */
type NumberValue = number | null | WizardInvalidInput;

/**
 * The control of the `number` Field Type
 */
function NumberField(props: WizardFieldComponentProps<NumberValue, NumberFieldConfig>) {
    const [text, setText] = useState(() => toText(props.value));

    useEffect(() => {
        setText((current) => (sameValue(parseNumber(current), props.value) ? current : toText(props.value)));
    }, [props.value]);

    return (
        <Input
            type={"text"}
            inputMode={props.config.integer ? "numeric" : "decimal"}
            value={text}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(e) => {
                setText(e.target.value);
                props.onChange(parseNumber(e.target.value));
            }}
        />
    );
}

/**
 * Parse the text of a number input.
 *
 * Accepts only a plain decimal: optional sign, digits, optionally one decimal separator and more digits. No
 * grouping, no exponent, no hex. The decimal separator is `.` or `,` in every language, since admins mix up the
 * notations; so "1,000" is 1, which the review step makes visible.
 *
 * @param text The input's text
 * @returns The number, `null` for empty text, {@link WizardInvalidInput} for anything else
 */
function parseNumber(text: string): NumberValue {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const match = trimmed.match(/^([+-]?\d+)(?:[.,](\d+))?$/u);
    if (!match) return { invalid: text };
    const [, integer, fraction] = match;
    const parsed = Number(fraction === undefined ? integer : `${integer}.${fraction}`);
    return Number.isFinite(parsed) ? parsed : { invalid: text };
}

/**
 * The text a value is shown as in the input
 *
 * @param value The value
 * @returns The text
 */
function toText(value: NumberValue): string {
    if (value === null) return "";
    return typeof value === "number" ? String(value) : value.invalid;
}

/**
 * Whether two values are the same
 *
 * @param a One value
 * @param b The other value
 * @returns `true` for the same number or `null`, or the same invalid text
 */
function sameValue(a: NumberValue, b: NumberValue): boolean {
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") return a.invalid === b.invalid;
    return a === b;
}

/** The standard `number` Wizard Field Type: a number, `null` while empty */
export const numberFieldType: WizardFieldType<NumberValue, NumberFieldConfig> = {
    component: NumberField,
    defaultValue: null,
    /**
     * Rejects unparsable input, and fractions where only whole numbers are valid
     *
     * @param value The value
     * @param config The config
     * @returns `error.invalid-number` for {@link WizardInvalidInput}, `error.invalid-integer` for a fraction
     */
    validate: (value, config) => {
        if (typeof value !== "number") return ["error.invalid-number"];
        return config.integer && !Number.isInteger(value) ? ["error.invalid-integer"] : [];
    },
    /**
     * Shows the number in the i18n language with every fraction digit
     *
     * @param value The value
     * @param _config The config
     * @param i18n The i18n context
     * @returns The formatted number
     */
    renderReview: (value, _config, i18n) =>
        typeof value === "number"
            ? new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 20 }).format(value)
            : toText(value),
    secret: false,
};
