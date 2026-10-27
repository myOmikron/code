import { RadioTile, RadioTileGroup } from "../../components/base/radio-tile";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";
import { type OptionsFieldConfig, nonEmptyOptions } from "./options";
import { radioFieldType } from "./radio";

/**
 * The control of the `radio-tiles` Field Type
 */
function RadioTilesField(props: WizardFieldComponentProps<string | null, OptionsFieldConfig>) {
    return (
        <RadioTileGroup value={props.value} onChange={props.onChange} disabled={props.disabled}>
            {nonEmptyOptions(props.config).map((option) => {
                const Icon = option.icon === undefined ? undefined : props.icons[option.icon];
                return (
                    <RadioTile
                        key={option.value}
                        value={option.value}
                        icon={Icon && <Icon />}
                        label={props.i18n.t(option.label)}
                    />
                );
            })}
        </RadioTileGroup>
    );
}

/**
 * The standard `radio-tiles` Wizard Field Type: like `radio`, but its options are tiles showing the icon each one
 * names
 */
export const radioTilesFieldType: WizardFieldType<string | null, OptionsFieldConfig> = {
    ...radioFieldType,
    component: RadioTilesField,
};
