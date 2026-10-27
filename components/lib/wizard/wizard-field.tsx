import { Button } from "../components/base/button";
import { Description, ErrorMessage, Field, Label, RequiredLabel } from "../components/base/fieldset";
import { Text } from "../components/base/text";
import type { WizardFieldDefinition } from "./definition";
import type { AnyWizardFieldType, WizardFieldI18n, WizardIconRegistry } from "./field-types";
import { asSecret, enteredSecret } from "./secret";

/**
 * The properties for {@link WizardField}
 */
export type WizardFieldProps = {
    /** The field's definition */
    field: WizardFieldDefinition;
    /** The field's type from the registry */
    fieldType: AnyWizardFieldType;
    /** The current value; a `WizardSecretValue` for Secrets */
    value: unknown;
    /** Report a new value */
    onChange: (value: unknown) => void;
    /** Return a Secret that is being replaced to its stored value; `undefined` when there is none to return to */
    onCancelReplace: (() => void) | undefined;
    /** Translated error messages */
    errors: Array<string>;
    /** The field can't be edited right now */
    disabled: boolean;
    /** The i18n context, also passed to the Field Type's control */
    i18n: WizardFieldI18n;
    /** The app's icons, passed to the Field Type's control */
    icons: WizardIconRegistry;
};

/**
 * One Wizard Field: label, description, the Field Type's control and the error messages
 */
export function WizardField(props: WizardFieldProps) {
    const { field, fieldType } = props;
    const { t } = props.i18n;
    return (
        <Field>
            {field.required ? <RequiredLabel>{t(field.label)}</RequiredLabel> : <Label>{t(field.label)}</Label>}
            {field.description && <Description>{t(field.description)}</Description>}
            {fieldType.secret ? (
                <SecretControl {...props} />
            ) : (
                <fieldType.component
                    value={props.value}
                    onChange={props.onChange}
                    errors={props.errors}
                    disabled={props.disabled}
                    config={field.config ?? {}}
                    i18n={props.i18n}
                    icons={props.icons}
                />
            )}
            {props.errors.map((error, index) => (
                <ErrorMessage key={index}>{error}</ErrorMessage>
            ))}
        </Field>
    );
}

/**
 * The control of a Secret: "set" with a "Replace" action while it is unchanged, so its value is never shown
 * (ADR-0004); the Field Type's control once it is newly entered, with a "Cancel" back to the stored value
 */
function SecretControl(props: WizardFieldProps) {
    const { field, fieldType, onCancelReplace } = props;
    const secret = asSecret(props.value);
    if (secret.status === "unchanged") {
        return (
            <div data-slot={"control"} className={"flex items-center gap-4"}>
                <Text>{props.i18n.tg("label.secret-set")}</Text>
                <Button
                    outline={true}
                    disabled={props.disabled}
                    onClick={() => props.onChange(enteredSecret(fieldType.defaultValue))}
                >
                    {props.i18n.tg("button.replace")}
                </Button>
            </div>
        );
    }
    const control = (
        <fieldType.component
            value={secret.value}
            onChange={(value) => props.onChange(enteredSecret(value))}
            errors={props.errors}
            disabled={props.disabled}
            config={field.config ?? {}}
            i18n={props.i18n}
            icons={props.icons}
        />
    );
    if (!onCancelReplace) return control;
    return (
        <div data-slot={"control"} className={"flex items-center gap-4"}>
            <div className={"flex-1"}>{control}</div>
            <Button plain={true} disabled={props.disabled} onClick={onCancelReplace}>
                {props.i18n.tg("button.cancel")}
            </Button>
        </div>
    );
}
