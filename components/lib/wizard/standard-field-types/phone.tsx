import type { CountryCode } from "libphonenumber-js";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import { PhoneInput } from "../../components/base/phone-input";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the standard `phone` Wizard Field Type */
export type PhoneFieldConfig = {
    /** The country selected for a new number, `DE` by default */
    defaultCountry?: CountryCode;
};

/**
 * The control of the `phone` Field Type
 */
function PhoneField(props: WizardFieldComponentProps<string, PhoneFieldConfig>) {
    return (
        <PhoneInput
            value={props.value}
            onChange={props.onChange}
            defaultCountry={props.config.defaultCountry}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
        />
    );
}

/** The standard `phone` Wizard Field Type: a phone number with its country's calling code, in E.164 */
export const phoneFieldType: WizardFieldType<string, PhoneFieldConfig> = {
    component: PhoneField,
    defaultValue: "",
    /**
     * Rejects numbers that can't exist in their country
     *
     * @param value The number in E.164
     * @returns `error.invalid-phone` for an invalid number
     */
    validate: (value) => (isValidPhoneNumber(value) ? [] : ["error.invalid-phone"]),
    /**
     * Shows the number in international format
     *
     * @param value The number in E.164
     * @returns The formatted number, e.g. `+49 151 12345678`
     */
    renderReview: (value) => parsePhoneNumberFromString(value)?.formatInternational() ?? value,
    secret: false,
};
