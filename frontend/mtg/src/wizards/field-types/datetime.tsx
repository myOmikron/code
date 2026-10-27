import { Input, type WizardFieldComponentProps, type WizardFieldType } from "components";
import { fromLocalInput } from "src/utils/tournament-settings";

/**
 * The control of the `datetime` Field Type
 */
function DatetimeField(props: WizardFieldComponentProps<string, object>) {
    return (
        <Input
            type={"datetime-local"}
            value={props.value}
            disabled={props.disabled}
            invalid={props.errors.length > 0}
            onChange={(event) => props.onChange(event.target.value)}
        />
    );
}

/**
 * The `datetime` Wizard Field Type: a date and time in the reader's time zone, as a `datetime-local` input holds
 * it (`YYYY-MM-DDTHH:mm`), `""` while empty
 */
export const datetimeFieldType: WizardFieldType<string, object> = {
    component: DatetimeField,
    defaultValue: "",
    /**
     * Rejects what is no point in time
     *
     * @param value the entered date and time
     *
     * @returns `error.invalid-datetime` when it can't be read
     */
    validate: (value) => (Number.isNaN(fromLocalInput(value).getTime()) ? ["error.invalid-datetime"] : []),
    /**
     * Shows the date and time in the i18n language
     *
     * @param value the entered date and time
     * @param _config the config
     * @param i18n the i18n context
     *
     * @returns the formatted date and time
     */
    renderReview: (value, _config, i18n) =>
        new Intl.DateTimeFormat(i18n.language, { dateStyle: "full", timeStyle: "short" }).format(fromLocalInput(value)),
    secret: false,
};
