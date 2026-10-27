import { Input } from "../../components/base/input";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the standard `text` Wizard Field Type */
export type TextFieldConfig = {
    /** The HTML input type, `text` by default */
    inputType?: "text" | "email" | "url" | "tel";
};

/**
 * The control of the `text` Field Type
 */
function TextField(props: WizardFieldComponentProps<string, TextFieldConfig>) {
    return (
        <Input
            type={props.config.inputType ?? "text"}
            value={props.value}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(e) => props.onChange(e.target.value)}
        />
    );
}

/** The standard `text` Wizard Field Type: single-line text */
export const textFieldType: WizardFieldType<string, TextFieldConfig> = {
    component: TextField,
    defaultValue: "",
    /**
     * Any text is valid
     *
     * @returns No errors
     */
    validate: () => [],
    /**
     * Shows the text as is
     *
     * @param value The text
     * @returns The text
     */
    renderReview: (value) => value,
    secret: false,
};
