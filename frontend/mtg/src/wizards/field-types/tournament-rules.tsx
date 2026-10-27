import {
    Combobox,
    ComboboxHeading,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Field,
    FieldGroup,
    Label,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    type WizardFieldComponentProps,
    type WizardFieldType,
} from "components";
import { createContext, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { BestOf, Ruleset, TopCut } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { useTournamentLabels } from "src/components/tournament-labels";
import { type FormatEntry, formatEntries } from "src/utils/format-groups";
import { TABLE_SIZES, rulesetFits, rulesetsFor, topCutsFor, withFormatDefaults } from "src/utils/tournament-settings";

/** The rules a Tournament is played by, as the `tournament-rules` Wizard Field Type holds them */
export type TournamentRulesValue = {
    /** The format's slug, `null` when every format is allowed */
    format: string | null;
    /** How many Participants a full Match seats */
    tableSize: number;
    /** The Ruleset, one that fits the Table size */
    ruleset: Ruleset;
    /** How many Games a one-on-one Match is played to; ignored at a larger Table size */
    bestOf: BestOf;
    /** The Top cut, `null` for none; one that fits the Table size */
    topCut: TopCut | null;
    /** How many Games a one-on-one Top cut Match is played to; ignored without one */
    topCutBestOf: BestOf;
    /** The settings the Organizer picked deliberately, which a newly picked format leaves alone */
    chosen: {
        /** The Table size was picked */
        tableSize: boolean;
        /** The Ruleset was picked */
        ruleset: boolean;
    };
};

/** The deck formats a Tournament can be played in, provided by the page running the Wizard */
export const TournamentFormatsContext = createContext<Array<string>>([]);

/**
 * Apply a newly picked format: its suggested Table size and Ruleset, unless picked deliberately
 *
 * @param value the current rules
 * @param format the picked format
 *
 * @returns the rules with the format and whatever it changes
 */
function withFormat(value: TournamentRulesValue, format: string | null): TournamentRulesValue {
    const next = withFormatDefaults({ tableSize: value.tableSize, ruleset: value.ruleset }, format, value.chosen);
    return withTableSize({ ...value, format, ruleset: next.ruleset }, next.tableSize);
}

/**
 * Apply a Table size, dropping a Ruleset and a Top cut that don't fit it
 *
 * @param value the current rules
 * @param tableSize the new Table size
 *
 * @returns the rules at the new Table size
 */
function withTableSize(value: TournamentRulesValue, tableSize: number): TournamentRulesValue {
    return {
        ...value,
        tableSize,
        ruleset: rulesetFits(value.ruleset, tableSize) ? value.ruleset : (rulesetsFor(tableSize)[0] ?? Ruleset.Mtr),
        topCut: value.topCut !== null && topCutsFor(tableSize).includes(value.topCut) ? value.topCut : null,
    };
}

/**
 * The control of the `tournament-rules` Field Type: the format first, then what it suggests and what follows
 * from the Table size
 */
function TournamentRulesField(props: WizardFieldComponentProps<TournamentRulesValue, object>) {
    const { value, onChange, disabled } = props;
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();
    const formats = useContext(TournamentFormatsContext);
    const [query, setQuery] = useState("");
    const choices = formatEntries(formats, deckLabels.format, query);
    const duel = value.tableSize === 2;

    return (
        <FieldGroup>
            <Combobox<FormatEntry | null>
                options={choices}
                by={"slug"}
                optionDisabled={(entry) => entry?.kind === "heading"}
                filter={() => true}
                onQueryChange={setQuery}
                value={choices.find((entry) => entry.kind === "format" && entry.slug === value.format) ?? null}
                displayValue={(entry) => (entry?.kind === "format" ? entry.name : "")}
                placeholder={t("label.format-any")}
                disabled={disabled}
                invalid={props.errors.length > 0}
                onChange={(entry) => onChange(withFormat(value, entry?.kind === "format" ? entry.slug : null))}
            >
                {(entry) =>
                    entry.kind === "heading" ? (
                        <ComboboxHeading value={entry}>
                            {entry.group === "popular" ? t("label.formats-popular") : t("label.formats-rare")}
                        </ComboboxHeading>
                    ) : (
                        <ComboboxOption value={entry}>
                            <ComboboxLabel>{entry.name}</ComboboxLabel>
                        </ComboboxOption>
                    )
                }
            </Combobox>

            <Field>
                <Label>{t("label.table-size")}</Label>
                <Description>{t("description.format-defaults")}</Description>
                <Listbox<number>
                    disabled={disabled}
                    value={value.tableSize}
                    onChange={(tableSize) =>
                        onChange(withTableSize({ ...value, chosen: { ...value.chosen, tableSize: true } }, tableSize))
                    }
                >
                    {TABLE_SIZES.map((size) => (
                        <ListboxOption key={size} value={size}>
                            <ListboxLabel>{labels.tableSize(size)}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </Field>

            <Field>
                <Label>{t("label.ruleset")}</Label>
                <Description>{labels.rulesetDescription(value.ruleset)}</Description>
                <Listbox<Ruleset>
                    disabled={disabled}
                    value={value.ruleset}
                    onChange={(ruleset) => onChange({ ...value, ruleset, chosen: { ...value.chosen, ruleset: true } })}
                >
                    {rulesetsFor(value.tableSize).map((ruleset) => (
                        <ListboxOption key={ruleset} value={ruleset}>
                            <ListboxLabel>{labels.ruleset(ruleset)}</ListboxLabel>
                            <ListboxDescription>{labels.rulesetDescription(ruleset)}</ListboxDescription>
                        </ListboxOption>
                    ))}
                </Listbox>
            </Field>

            {duel && (
                <Field>
                    <Label>{t("label.best-of")}</Label>
                    <BestOfListbox
                        disabled={disabled}
                        value={value.bestOf}
                        onChange={(bestOf) => onChange({ ...value, bestOf })}
                    />
                </Field>
            )}

            <Field>
                <Label>{t("label.top-cut")}</Label>
                <Description>{duel ? t("description.top-cut") : t("description.top-cut-final")}</Description>
                <Listbox<TopCut | null>
                    disabled={disabled}
                    value={value.topCut}
                    onChange={(topCut) => onChange({ ...value, topCut })}
                >
                    <ListboxOption value={null}>
                        <ListboxLabel>{labels.topCut(null)}</ListboxLabel>
                    </ListboxOption>
                    {topCutsFor(value.tableSize).map((topCut) => (
                        <ListboxOption key={topCut} value={topCut}>
                            <ListboxLabel>{labels.topCut(topCut)}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </Field>

            {duel && value.topCut !== null && (
                <Field>
                    <Label>{t("label.top-cut-best-of")}</Label>
                    <BestOfListbox
                        disabled={disabled}
                        value={value.topCutBestOf}
                        onChange={(topCutBestOf) => onChange({ ...value, topCutBestOf })}
                    />
                </Field>
            )}
        </FieldGroup>
    );
}

/**
 * The properties for {@link BestOfListbox}
 */
type BestOfListboxProps = {
    /** The chosen number of Games */
    value: BestOf;
    /** Called with the newly chosen one */
    onChange: (value: BestOf) => void;
    /** It can't be changed right now */
    disabled: boolean;
};

/**
 * A pick between best of one and best of three
 */
function BestOfListbox(props: BestOfListboxProps) {
    const labels = useTournamentLabels();
    return (
        <Listbox<BestOf> disabled={props.disabled} value={props.value} onChange={props.onChange}>
            {[BestOf.One, BestOf.Three].map((bestOf) => (
                <ListboxOption key={bestOf} value={bestOf}>
                    <ListboxLabel>{labels.bestOf(bestOf)}</ListboxLabel>
                </ListboxOption>
            ))}
        </Listbox>
    );
}

/**
 * The properties for {@link TournamentRulesReview}
 */
type TournamentRulesReviewProps = {
    /** The rules to show */
    value: TournamentRulesValue;
};

/**
 * The rules on the Review Step in one line, leaving out what the Table size makes irrelevant
 */
function TournamentRulesReview({ value }: TournamentRulesReviewProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();
    const duel = value.tableSize === 2;
    const parts = [
        value.format === null ? t("label.format-any") : deckLabels.format(value.format),
        labels.tableSize(value.tableSize),
        labels.ruleset(value.ruleset),
        duel ? labels.bestOf(value.bestOf) : null,
        labels.topCut(value.topCut),
        duel && value.topCut !== null ? `${t("label.top-cut-best-of")}: ${labels.bestOf(value.topCutBestOf)}` : null,
    ];
    return <>{parts.filter((part) => part !== null).join(" · ")}</>;
}

/**
 * The `tournament-rules` Wizard Field Type: format, Table size, Ruleset, best of and Top cut in one control, since
 * the format suggests the Table size and the Table size decides what else fits
 */
export const tournamentRulesFieldType: WizardFieldType<TournamentRulesValue, object> = {
    component: TournamentRulesField,
    defaultValue: {
        format: null,
        tableSize: 4,
        ruleset: Ruleset.TopDeck,
        bestOf: BestOf.Three,
        topCut: null,
        topCutBestOf: BestOf.Three,
        chosen: { tableSize: false, ruleset: false },
    },
    /**
     * The control only offers combinations the service accepts, so every value is valid
     *
     * @returns No errors
     */
    validate: () => [],
    /**
     * Shows each setting that applies at the Table size
     *
     * @param value the rules
     *
     * @returns the review
     */
    renderReview: (value) => <TournamentRulesReview value={value} />,
    secret: false,
};
