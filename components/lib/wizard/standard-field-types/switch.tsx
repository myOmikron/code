import type React from "react";
import { Switch } from "../../components/base/switch";
import { type BooleanFieldConfig, booleanFieldType } from "./boolean";

/** Config of the standard `switch` Wizard Field Type */
export type SwitchFieldConfig = BooleanFieldConfig;

/** The standard `switch` Wizard Field Type: on or off; a required one must be on */
export const switchFieldType = booleanFieldType(BlueSwitch, { on: "label.on", off: "label.off" });

/**
 * The switch in the Wizards' blue
 */
function BlueSwitch(props: React.ComponentProps<typeof Switch>) {
    return <Switch color={"blue"} {...props} />;
}
