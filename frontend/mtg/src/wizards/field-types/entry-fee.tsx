import {
    Input,
    Listbox,
    ListboxLabel,
    ListboxOption,
    type WizardFieldComponentProps,
    type WizardFieldType,
} from "components";
import { useTranslation } from "react-i18next";
import { CURRENCIES, formatEntryFee, toMinorUnits } from "src/utils/entry-fee";

/** An entry fee as the `entry-fee` Wizard Field Type holds it */
export type EntryFeeValue = {
    /** The amount as typed, e.g. `5,50`; `""` for no entry fee */
    amount: string;
    /** The ISO 4217 code of the currency */
    currency: string;
};

/**
 * The control of the `entry-fee` Field Type: the amount beside its currency
 */
function EntryFeeField(props: WizardFieldComponentProps<EntryFeeValue, object>) {
    const { value, onChange, disabled } = props;
    const [t] = useTranslation("tournament");
    return (
        <div data-slot={"control"} className={"flex items-start gap-2"}>
            <Input
                className={"min-w-0 flex-1"}
                inputMode={"decimal"}
                placeholder={t("label.entry-fee-none")}
                disabled={disabled}
                value={value.amount}
                invalid={props.errors.length > 0}
                onChange={(event) => onChange({ ...value, amount: event.target.value })}
            />
            <div className={"w-28 shrink-0"}>
                <Listbox<string>
                    aria-label={t("label.currency")}
                    disabled={disabled}
                    value={value.currency}
                    onChange={(currency) => onChange({ ...value, currency })}
                >
                    {CURRENCIES.map((currency) => (
                        <ListboxOption key={currency} value={currency}>
                            <ListboxLabel>{currency}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </div>
        </div>
    );
}

/**
 * The properties for {@link EntryFeeReview}
 */
type EntryFeeReviewProps = {
    /** The entry fee to show */
    value: EntryFeeValue;
};

/**
 * The entry fee on the Review Step
 */
function EntryFeeReview({ value }: EntryFeeReviewProps) {
    const [t, i18n] = useTranslation("tournament");
    const amount = entryFeeAmount(value);
    return (
        <>
            {amount === null
                ? t("label.entry-fee-none")
                : formatEntryFee({ amount, currency: value.currency }, i18n.language)}
        </>
    );
}

/**
 * The amount of an entry fee in the currency's smallest unit
 *
 * @param value the entry fee
 *
 * @returns the amount, `null` for no entry fee or one that can't be read
 */
export function entryFeeAmount(value: EntryFeeValue): number | null {
    return value.amount.trim() === "" ? null : toMinorUnits(value.amount, value.currency);
}

/** The `entry-fee` Wizard Field Type: an optional amount with its currency */
export const entryFeeFieldType: WizardFieldType<EntryFeeValue, object> = {
    component: EntryFeeField,
    defaultValue: { amount: "", currency: CURRENCIES[0] },
    /**
     * Rejects an amount that is no positive number in the currency
     *
     * @param value the entry fee
     *
     * @returns `error.invalid-entry-fee` for an amount that is typed but unusable
     */
    validate: (value) => {
        if (value.amount.trim() === "") return [];
        const amount = entryFeeAmount(value);
        return amount === null || amount <= 0 ? ["error.invalid-entry-fee"] : [];
    },
    /**
     * Shows the amount with its currency, or that there is none
     *
     * @param value the entry fee
     *
     * @returns the review
     */
    renderReview: (value) => <EntryFeeReview value={value} />,
    secret: false,
};
