import { Label } from "../../components/base/fieldset";
import { Radio, RadioField, RadioGroup } from "../../components/base/radio";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";
import { type OptionsFieldConfig, nonEmptyOptions, optionLabel, validateOption } from "./options";

/**
 * The control of the `radio` Field Type
 */
function RadioFieldControl(props: WizardFieldComponentProps<string | null, OptionsFieldConfig>) {
    return (
        <RadioGroup
            value={props.value ?? ""}
            disabled={props.disabled}
            onChange={(value: string) => props.onChange(value)}
        >
            {nonEmptyOptions(props.config).map((option) => (
                <RadioField key={option.value}>
                    <Radio value={option.value} color={"blue"} />
                    <Label>{props.i18n.t(option.label)}</Label>
                </RadioField>
            ))}
        </RadioGroup>
    );
}

/** The standard `radio` Wizard Field Type: one of static options as radio buttons, `null` while none is chosen */
export const radioFieldType: WizardFieldType<string | null, OptionsFieldConfig> = {
    component: RadioFieldControl,
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
