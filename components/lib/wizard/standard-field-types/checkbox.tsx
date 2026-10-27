import type React from "react";
import { Checkbox } from "../../components/base/checkbox";
import { type BooleanFieldConfig, booleanFieldType } from "./boolean";

/** Config of the standard `checkbox` Wizard Field Type */
export type CheckboxFieldConfig = BooleanFieldConfig;

/** The standard `checkbox` Wizard Field Type: yes or no; a required one must be checked */
export const checkboxFieldType = booleanFieldType(BlueCheckbox, { on: "label.yes", off: "label.no" });

/**
 * The checkbox in the Wizards' blue
 */
function BlueCheckbox(props: React.ComponentProps<typeof Checkbox>) {
    return <Checkbox color={"blue"} {...props} />;
}
