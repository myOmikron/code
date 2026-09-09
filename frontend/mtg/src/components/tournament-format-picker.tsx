import {
    Description,
    ErrorMessage,
    Field,
    Fieldset,
    Label,
    Legend,
    Radio,
    RadioField,
    RadioGroup,
    Select,
} from "components";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { FormatRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import type { LimitedFormat } from "src/utils/tournament-format";
import {
    DEFAULT_CONSTRUCTED_FORMAT,
    DEFAULT_LIMITED_FORMAT,
    LIMITED_FORMATS,
    formatKind,
} from "src/utils/tournament-format";
import type { Translate } from "src/utils/translate";

/**
 * The properties for {@link TournamentFormatPicker}
 */
export type TournamentFormatPickerProps = {
    /** The chosen format's slug */
    value: string;
    /** Called with the slug once a format is picked */
    onChange: (slug: string) => void;
    /** The constructed formats on offer */
    formats: Array<FormatRulesResponse>;
    /** Disables the controls, e.g. while `formats` has not loaded yet */
    disabled?: boolean;
    /** What is wrong with the current pick, shown under the format */
    errors?: Array<string>;
    /**
     * A field that belongs to the format, laid out beside the second step
     *
     * The dialog puts best-of here while the format seats two: how long a match is follows from
     * what is played, so it reads as part of the format rather than as a rule of its own.
     */
    aside?: ReactNode;
};

/**
 * The tournament dialog's format field, in two steps: constructed or limited first, then which
 * one of those.
 *
 * Two steps because they are two different questions. Limited is what an evening at the store
 * usually is, and Draft and Sealed are nowhere in the format catalog — the catalog lists what a
 * deck is built for in advance, and a limited deck is not. Putting them at the top of a list of
 * two dozen constructed formats would have hidden the one choice most organizers make first.
 *
 * The second step is a native select, not the anchored popover the rest of the form uses. Two
 * dozen entries are taller than the dialog, and an anchored list that tall floats over whatever
 * the dialog scrolls to while it is open; the browser's own menu handles a long list and a
 * scrolling parent on its own, and reads well on a phone.
 *
 * @returns the fieldset
 */
export function TournamentFormatPicker({
    value,
    onChange,
    formats,
    disabled,
    errors = [],
    aside,
}: TournamentFormatPickerProps) {
    const [t] = useTranslation("tournament");
    const labels = useDeckLabels();
    const kind = formatKind(value);

    return (
        <Fieldset disabled={disabled}>
            <Legend>{t("label.format")}</Legend>
            <RadioGroup
                value={kind}
                onChange={(next: string) => {
                    onChange(next === "limited" ? DEFAULT_LIMITED_FORMAT : DEFAULT_CONSTRUCTED_FORMAT);
                }}
            >
                <RadioField>
                    <Radio value={"constructed"} color={"blue"} />
                    <Label>{t("label.format-kind-constructed")}</Label>
                    <Description>{t("description.format-kind-constructed")}</Description>
                </RadioField>
                <RadioField>
                    <Radio value={"limited"} color={"blue"} />
                    <Label>{t("label.format-kind-limited")}</Label>
                    <Description>{t("description.format-kind-limited")}</Description>
                </RadioField>
            </RadioGroup>
            <div
                className={clsx(
                    "mt-4 grid grid-cols-1 gap-4",
                    Boolean(aside) && "sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
                )}
            >
                <Field>
                    <Label>{kind === "limited" ? t("label.limited-format") : t("label.constructed-format")}</Label>
                    <Select
                        value={value}
                        invalid={errors.length > 0}
                        onChange={(event) => onChange(event.target.value)}
                    >
                        {kind === "limited"
                            ? LIMITED_FORMATS.map((slug) => (
                                  <option key={slug} value={slug}>
                                      {limitedFormatName(t, slug)}
                                  </option>
                              ))
                            : formats.map((format) => (
                                  <option key={format.slug} value={format.slug}>
                                      {labels.format(format.slug)}
                                  </option>
                              ))}
                    </Select>
                    {errors.map((error) => (
                        <ErrorMessage key={error}>{error}</ErrorMessage>
                    ))}
                </Field>
                {aside}
            </div>
        </Fieldset>
    );
}

/**
 * What a limited format is called
 *
 * Spelled out per case like `deck-labels.ts` does, so the translation scanner sees the keys.
 *
 * @param t the tournament namespace's translate function
 * @param slug the format
 *
 * @returns its name
 */
function limitedFormatName(t: Translate, slug: LimitedFormat): string {
    switch (slug) {
        case "draft":
            return t("label.format-draft");
        case "sealed":
            return t("label.format-sealed");
    }
}
