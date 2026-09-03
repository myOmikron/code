import { Combobox, ComboboxDescription, ComboboxLabel, ComboboxOption } from "components";
import { useTranslation } from "react-i18next";
import type { FormatRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/**
 * The properties for {@link FormatCombobox}
 */
export type FormatComboboxProps = {
    /** The chosen format's slug */
    value: string;
    /** Called with the full rules record once a format is picked — never with `null` */
    onChange: (format: FormatRulesResponse) => void;
    /** The formats on offer */
    formats: Array<FormatRulesResponse>;
    /** Disables the control, e.g. while `formats` has not loaded yet */
    disabled?: boolean;
};

/**
 * A combobox over the format catalog: `DeckDialog`'s format field, extracted so a second caller
 * (the tournament dialog) does not have to reassemble it. `DeckDialog` itself is left untouched —
 * folding it onto this component is a follow-up, out of scope here.
 *
 * Hands the caller the whole {@link FormatRulesResponse} rather than just the slug: a caller that
 * derives other settings from the format's rules (pod size from whether it wants a commander, say)
 * gets them for free instead of looking the slug back up in `formats`.
 *
 * @returns the combobox
 */
export function FormatCombobox({ value, onChange, formats, disabled }: FormatComboboxProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    return (
        // A combobox rather than a list: the catalog tracks every format Scryfall reports, and
        // two dozen entries are typed for faster than they are scrolled through.
        <Combobox<FormatRulesResponse | null>
            options={formats}
            by={"slug"}
            value={formats.find((format) => format.slug === value) ?? null}
            displayValue={(format) => (format == null ? "" : labels.format(format.slug))}
            placeholder={t("label.format")}
            aria-label={t("label.format")}
            disabled={disabled}
            onChange={(format) => {
                if (format !== null) onChange(format);
            }}
        >
            {(format) => (
                <ComboboxOption value={format}>
                    <ComboboxLabel>{labels.format(format.slug)}</ComboboxLabel>
                    <ComboboxDescription>{labels.shape(format)}</ComboboxDescription>
                </ComboboxOption>
            )}
        </Combobox>
    );
}
