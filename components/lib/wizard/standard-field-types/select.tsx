import { Select } from "../../components/base/select";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";
import { type OptionsFieldConfig, nonEmptyOptions, optionLabel, validateOption } from "./options";

/**
 * The control of the `select` Field Type
 */
function SelectField(props: WizardFieldComponentProps<string | null, OptionsFieldConfig>) {
    return (
        <Select
            value={props.value ?? ""}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(e) => props.onChange(e.target.value === "" ? null : e.target.value)}
        >
            <option value={""} />
            {nonEmptyOptions(props.config).map((option) => (
                <option key={option.value} value={option.value}>
                    {props.i18n.t(option.label)}
                </option>
            ))}
        </Select>
    );
}

/** The standard `select` Wizard Field Type: one of static options in a dropdown, `null` while none is chosen */
export const selectFieldType: WizardFieldType<string | null, OptionsFieldConfig> = {
    component: SelectField,
    defaultValue: null,
    validate: validateOption,
    /**
     * Shows the chosen option's label
     *
     * @param value The chosen value
     * @param config The config with the options
     * @param i18n The i18n context
     * @returns The translated label
     */
    renderReview: (value, config, i18n) => optionLabel(value, config, i18n.t),
    secret: false,
};
