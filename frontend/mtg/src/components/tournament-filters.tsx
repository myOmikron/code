import { Combobox, ComboboxLabel, ComboboxOption, Input, Listbox, ListboxLabel, ListboxOption } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormatRulesResponse } from "src/api/generated";
import { Timeframe } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/** How long typing has to pause before the location filter applies */
const LOCATION_DEBOUNCE_MS = 300;

/** The timeframes offered, "All" standing for no timeframe filter */
export type TimeframeChoice = Timeframe | "All";

/** What the public Tournament overview is narrowed down to */
export type TournamentFilter = {
    /** Upcoming, past or all Tournaments */
    timeframe: TimeframeChoice;
    /** Only this format, by its slug */
    format?: string;
    /** Only locations containing this text */
    location?: string;
};

/** One entry of the format filter, the empty slug standing for all of them */
type FormatChoice = {
    /** The format's slug, empty for "every format" */
    slug: string;
    /** What it is called */
    name: string;
};

/**
 * The properties for {@link TournamentFilters}
 */
export type TournamentFiltersProps = {
    /** The filter in force */
    filter: TournamentFilter;
    /** The formats on offer */
    formats: Array<FormatRulesResponse>;
    /** Called with the changed filter */
    onChange: (filter: TournamentFilter) => void;
};

/**
 * The filter controls of the Tournament overview: timeframe, format and location text.
 *
 * @returns the controls
 */
export function TournamentFilters({ filter, formats, onChange }: TournamentFiltersProps) {
    const [t] = useTranslation("tournament");
    const deckLabels = useDeckLabels();
    const [location, setLocation] = useState(filter.location ?? "");

    const choices: Array<FormatChoice> = [
        { slug: "", name: t("label.every-format") },
        ...formats.map((format) => ({ slug: format.slug, name: deckLabels.format(format.slug) })),
    ];

    useEffect(() => {
        if (location === (filter.location ?? "")) return;
        const timer = setTimeout(
            () => onChange({ ...filter, location: location.trim() === "" ? undefined : location }),
            LOCATION_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [location, filter.location]);

    return (
        <div className={"flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"}>
            <Input
                type={"search"}
                value={location}
                placeholder={t("label.filter-location")}
                aria-label={t("label.filter-location")}
                onChange={(event) => setLocation(event.target.value)}
                className={"w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-64"}
            />
            <div className={"flex min-w-0 shrink items-center gap-2"}>
                <Combobox<FormatChoice | null>
                    options={choices}
                    by={"slug"}
                    value={choices.find((choice) => choice.slug === (filter.format ?? "")) ?? null}
                    displayValue={(choice) => choice?.name}
                    placeholder={t("label.format")}
                    aria-label={t("label.format")}
                    onChange={(choice) =>
                        onChange({ ...filter, format: choice == null || choice.slug === "" ? undefined : choice.slug })
                    }
                    className={"min-w-0 flex-1 sm:w-48 sm:flex-none"}
                >
                    {(choice) => (
                        <ComboboxOption value={choice}>
                            <ComboboxLabel>{choice.name}</ComboboxLabel>
                        </ComboboxOption>
                    )}
                </Combobox>
                <Listbox<TimeframeChoice>
                    value={filter.timeframe}
                    aria-label={t("label.timeframe")}
                    onChange={(timeframe) => onChange({ ...filter, timeframe })}
                    className={"min-w-0 flex-1 sm:w-44 sm:flex-none"}
                >
                    <ListboxOption value={Timeframe.Upcoming}>
                        <ListboxLabel>{t("label.timeframe-upcoming")}</ListboxLabel>
                    </ListboxOption>
                    <ListboxOption value={Timeframe.Past}>
                        <ListboxLabel>{t("label.timeframe-past")}</ListboxLabel>
                    </ListboxOption>
                    <ListboxOption value={"All"}>
                        <ListboxLabel>{t("label.timeframe-all")}</ListboxLabel>
                    </ListboxOption>
                </Listbox>
            </div>
        </div>
    );
}
