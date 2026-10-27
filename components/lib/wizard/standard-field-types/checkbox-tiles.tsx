import { CheckboxTile, CheckboxTileGroup } from "../../components/base/checkbox-tile";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";
import { checkboxGroupFieldType } from "./checkbox-group";
import { type OptionsFieldConfig, nonEmptyOptions } from "./options";

/**
 * The control of the `checkbox-tiles` Field Type
 */
function CheckboxTilesField(props: WizardFieldComponentProps<Array<string>, OptionsFieldConfig>) {
    return (
        <CheckboxTileGroup>
            {nonEmptyOptions(props.config).map((option) => {
                const Icon = option.icon === undefined ? undefined : props.icons[option.icon];
                return (
                    <CheckboxTile
                        key={option.value}
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
                        icon={Icon && <Icon />}
                        label={props.i18n.t(option.label)}
                        disabled={props.disabled}
                    />
                );
            })}
        </CheckboxTileGroup>
    );
}

/**
 * The standard `checkbox-tiles` Wizard Field Type: like `checkbox-group`, but its options are tiles showing the
 * icon each one names
 */
export const checkboxTilesFieldType: WizardFieldType<Array<string>, OptionsFieldConfig> = {
    ...checkboxGroupFieldType,
    component: CheckboxTilesField,
};
