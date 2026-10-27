import type { WizardTranslate } from "../field-types";

/** One option of an option-based Wizard Field (`select`, `radio`, `checkbox-group`, `checkbox-tiles`, `radio-tiles`) */
export type WizardFieldOption = {
    /** The value the field yields when this option is chosen; never `""`, which means nothing is chosen */
    readonly value: string;
    /** i18n key of the option's label (in the Wizard's namespace) */
    readonly label: string;
    /** Name of an icon in the app's icon registry, shown by the tile Field Types */
    readonly icon?: string;
};

/** Config of the option-based standard Field Types */
export type OptionsFieldConfig = {
    /** The static options to choose from */
    readonly options: ReadonlyArray<WizardFieldOption>;
};

/**
 * Rejects values that are not one of the options
 *
 * @param value The chosen value
 * @param config The config with the options
 * @returns `error.invalid-option` when the value is not an option
 */
export function validateOption(value: string | null, config: OptionsFieldConfig): Array<string> {
    return config.options.some((option) => option.value === value) ? [] : ["error.invalid-option"];
}

/**
 * The options of a config, rejecting the value `""`: it is the empty choice and counts as empty for `required`
 *
 * The definition validation reports this for the option-based standard Field Types before rendering; this is the backstop
 * for the controls registered under another Field Type name, which the validation doesn't recognize.
 *
 * @param config The config with the options
 * @returns The options
 * @throws {Error} when an option has the value `""`
 */
export function nonEmptyOptions(config: OptionsFieldConfig): ReadonlyArray<WizardFieldOption> {
    if (config.options.some((option) => option.value === "")) {
        throw new Error('Wizard Field options must not have the value "", it means "nothing chosen"');
    }
    return config.options;
}

/**
 * The translated label of the chosen option
 *
 * @param value The chosen value
 * @param config The config with the options
 * @param t Translate a key of the Wizard's namespace
 * @returns The label, or the raw value when it is not an option
 */
export function optionLabel(value: string | null, config: OptionsFieldConfig, t: WizardTranslate): string {
    const option = config.options.find((o) => o.value === value);
    return option ? t(option.label) : (value ?? "");
}
