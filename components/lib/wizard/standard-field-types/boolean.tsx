import type React from "react";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the boolean standard Field Types (`checkbox`, `switch`) */
export type BooleanFieldConfig = {};

/**
 * The properties of a boolean control, e.g. `Checkbox` or `Switch`
 */
type BooleanControlProps = {
    /** Whether it is on */
    checked: boolean;
    /** It can't be changed right now */
    disabled: boolean;
    /** Report a new state */
    onChange: (checked: boolean) => void;
};

/** General i18n keys a boolean Field Type shows on the Review Step */
type BooleanReviewKeys = {
    /** Shown when on */
    on: string;
    /** Shown when off */
    off: string;
};

/**
 * Build a boolean Field Type around a control; a required one must be on
 *
 * @param Control The control
 * @param reviewKeys The keys shown on the Review Step
 * @returns The Field Type
 */
export function booleanFieldType(
    Control: React.ComponentType<BooleanControlProps>,
    reviewKeys: BooleanReviewKeys,
): WizardFieldType<boolean, BooleanFieldConfig> {
    /**
     * The Field Type's control
     */
    function BooleanField(props: WizardFieldComponentProps<boolean, BooleanFieldConfig>) {
        return <Control checked={props.value} disabled={props.disabled} onChange={props.onChange} />;
    }

    return {
        component: BooleanField,
        defaultValue: false,
        /**
         * Both values are valid
         *
         * @returns No errors
         */
        validate: () => [],
        /**
         * Shows the translated state
         *
         * @param value Whether it is on
         * @param _config The config
         * @param i18n The i18n context
         * @returns The translated state
         */
        renderReview: (value, _config, i18n) => i18n.tg(value ? reviewKeys.on : reviewKeys.off),
        secret: false,
    };
}
