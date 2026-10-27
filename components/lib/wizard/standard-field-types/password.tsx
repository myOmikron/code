import { useEffect, useRef } from "react";
import { Input } from "../../components/base/input";
import type { WizardFieldComponentProps, WizardFieldType } from "../field-types";

/** Config of the standard `password` Wizard Field Type; it has none */
export type PasswordFieldConfig = Record<string, never>;

/**
 * The control of the `password` Field Type.
 *
 * Uncontrolled, so the password never ends up in the DOM's `value` attribute where CSS selectors, session
 * replay or extensions could read it (ADR-0004). The value given on mount is set as the input's
 * property only; `value` changing later has no effect, so callers remount the control to reset it.
 */
function PasswordField(props: WizardFieldComponentProps<string, PasswordFieldConfig>) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.value = props.value;
    }, []);
    return (
        <Input
            ref={ref}
            type={"password"}
            autoComplete={"new-password"}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(e) => props.onChange(e.target.value)}
        />
    );
}

/** The standard `password` Wizard Field Type: a Secret entered as single-line text (ADR-0004) */
export const passwordFieldType: WizardFieldType<string, PasswordFieldConfig, true> = {
    component: PasswordField,
    defaultValue: "",
    /**
     * Any password is valid
     *
     * @returns No errors
     */
    validate: () => [],
    secret: true,
};
