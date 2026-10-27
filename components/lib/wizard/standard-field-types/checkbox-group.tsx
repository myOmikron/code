import { Checkbox, CheckboxField, CheckboxGroup } from "../../components/base/checkbox";
import { Label } from "../../components/base/fieldset";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";
import { type OptionsFieldConfig, nonEmptyOptions, optionLabel } from "./options";

/**
 * The control of the `checkbox-group` Field Type
 */
function CheckboxGroupField(props: WizardFieldComponentProps<Array<string>, OptionsFieldConfig>) {
    return (
        <CheckboxGroup className={"grid space-y-0! gap-x-6 gap-y-3 sm:grid-cols-2"}>
            {nonEmptyOptions(props.config).map((option) => (
                <CheckboxField key={option.value} disabled={props.disabled}>
                    <Checkbox
                        color={"blue"}
                        checked={props.value.includes(option.value)}
                        onChange={(checked) =>
                            props.onChange(
                                props.config.options
                                    .map((o) => o.value)
                                    .filter((value) =>
                                        value === option.value ? checked : props.value.includes(value),
                                    ),
                            )
                        }
                    />
                    <Label>{props.i18n.t(option.label)}</Label>
                </CheckboxField>
            ))}
        </CheckboxGroup>
    );
}

/**
 * The standard `checkbox-group` Wizard Field Type: any number of static options as checkboxes, in the options'
 * order; a required one needs at least one
 */
export const checkboxGroupFieldType: WizardFieldType<Array<string>, OptionsFieldConfig> = {
    component: CheckboxGroupField,
    defaultValue: [],
    /**
     * Rejects values that are not options
     *
     * @param value The chosen values
     * @param config The config with the options
     * @returns `error.invalid-option` when a value is not an option
     */
    validate: (value, config) =>
        value.every((v) => config.options.some((option) => option.value === v)) ? [] : ["error.invalid-option"],
    /**
     * Shows the chosen options' labels
     *
     * @param value The chosen values
     * @param config The config with the options
     * @param i18n The i18n context
     * @returns The translated labels, comma separated
     */
    renderReview: (value, config, i18n) => value.map((v) => optionLabel(v, config, i18n.t)).join(", "),
    secret: false,
};
