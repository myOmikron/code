import { Textarea } from "../../components/base/textarea";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the standard `textarea` Wizard Field Type */
export type TextareaFieldConfig = {
    /** Visible lines of text */
    rows?: number;
};

/**
 * The control of the `textarea` Field Type
 */
function TextareaField(props: WizardFieldComponentProps<string, TextareaFieldConfig>) {
    return (
        <Textarea
            rows={props.config.rows}
            value={props.value}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(e) => props.onChange(e.target.value)}
        />
    );
}

/** The standard `textarea` Wizard Field Type: multi-line text */
export const textareaFieldType: WizardFieldType<string, TextareaFieldConfig> = {
    component: TextareaField,
    defaultValue: "",
    /**
     * Any text is valid
     *
     * @returns No errors
     */
    validate: () => [],
    /**
     * Shows the text, keeping its line breaks
     *
     * @param value The text
     * @returns The text
     */
    renderReview: (value) => <span className={"whitespace-pre-line"}>{value}</span>,
    secret: false,
};
