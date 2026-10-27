import * as Headless from "@headlessui/react";
import clsx from "clsx";
import * as FLAGS from "country-flag-icons/react/3x2";
import {
    AsYouType,
    type CountryCode,
    getCountries,
    getCountryCallingCode,
    parsePhoneNumberFromString,
} from "libphonenumber-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** Countries listed first, before all others in alphabetical order */
const PREFERRED_COUNTRIES: ReadonlyArray<CountryCode> = ["DE", "AT", "CH"];

/** A country to choose the calling code of */
type CountryOption = {
    /** ISO 3166-1 alpha-2 code */
    code: CountryCode;
    /** Calling code without the `+` */
    callingCode: string;
    /** Name in the current language */
    name: string;
};

/** A phone number split into what the user sees */
type PhoneParts = {
    /** The selected country */
    country: CountryCode;
    /** The national number as shown in the input */
    national: string;
};

/**
 * The properties for {@link PhoneInput}
 */
export type PhoneInputProps = {
    /** The phone number in E.164 (`+4915112345678`), `""` while empty; incomplete numbers stay as they were typed */
    value: string;
    /** Called with the number in E.164, or `""` once it is cleared */
    onChange: (value: string) => void;
    /** The country selected while the value doesn't tell one, `DE` by default */
    defaultCountry?: CountryCode;
    /** The input can't be edited right now */
    disabled?: boolean;
    /** Marks the input as invalid */
    invalid?: boolean;
    /** Additional CSS classes */
    className?: string;
};

/**
 * The properties for {@link Flag}
 */
type FlagProps = {
    /** The country */
    code: CountryCode;
    /** Additional CSS classes */
    className?: string;
};

/**
 * The flag of a country, or an empty box for one without a flag
 */
function Flag(props: FlagProps) {
    const Component = FLAGS[props.code as keyof typeof FLAGS];
    const className = clsx(props.className, "h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]");
    return Component ? <Component aria-hidden={"true"} className={className} /> : <span className={className} />;
}

/**
 * Split a value into its country and the national number as the user sees it
 *
 * @param value The value in E.164
 * @param fallback The country when the value doesn't tell one
 * @returns The country and the national number, formatted
 */
function splitValue(value: string, fallback: CountryCode): PhoneParts {
    const parsed = value === "" ? undefined : parsePhoneNumberFromString(value);
    if (!parsed?.country) return { country: fallback, national: value.replace(/^\+\d*/, "") };
    return { country: parsed.country, national: parsed.formatNational() };
}

/**
 * The national number in E.164 for a country
 *
 * @param country The country
 * @param national The national number as typed
 * @returns The number in E.164, `""` without any digits
 */
function toValue(country: CountryCode, national: string): string {
    const formatter = new AsYouType(country);
    formatter.input(national);
    return formatter.getNumberValue() ?? "";
}

/**
 * A phone number input: the country's calling code with its flag on the left (searchable), the number on the right.
 *
 * Pasting or typing an international number (`+43 …` or `0043 …`) selects its country. The number is formatted
 * for the country once the input loses focus.
 */
export function PhoneInput(props: PhoneInputProps) {
    const { value, onChange } = props;
    const [tg, i18n] = useTranslation();
    const fallback = props.defaultCountry ?? "DE";

    const [initial] = useState(() => splitValue(value, fallback));
    const [country, setCountry] = useState<CountryCode>(initial.country);
    const [national, setNational] = useState(initial.national);
    const [query, setQuery] = useState("");
    const reported = useRef(value);

    useEffect(() => {
        if (value === reported.current) return;
        reported.current = value;
        const next = splitValue(value, fallback);
        setCountry(next.country);
        setNational(next.national);
    }, [value]);

    const countries = useMemo(() => {
        const names = new Intl.DisplayNames([i18n.language], { type: "region" });
        const all = getCountries().map((code): CountryOption => ({
            code,
            callingCode: getCountryCallingCode(code),
            name: names.of(code) ?? code,
        }));
        /**
         * Sort key of a country: the preferred ones first, in their order
         *
         * @param code The country
         * @returns Its rank
         */
        const rank = (code: CountryCode) => {
            const index = PREFERRED_COUNTRIES.indexOf(code);
            return index === -1 ? PREFERRED_COUNTRIES.length : index;
        };
        return all.sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, i18n.language));
    }, [i18n.language]);

    const search = query.trim().toLowerCase().replace(/^\+/, "");
    const filtered =
        search === ""
            ? countries
            : countries.filter(
                  (c) =>
                      c.name.toLowerCase().includes(search) ||
                      c.code.toLowerCase() === search ||
                      c.callingCode.startsWith(search),
              );
    const selected = countries.find((c) => c.code === country) ?? null;

    /**
     * Take over a new country and national number, reporting the resulting value
     *
     * @param nextCountry The country
     * @param nextNational The national number as typed
     */
    const update = (nextCountry: CountryCode, nextNational: string) => {
        setCountry(nextCountry);
        setNational(nextNational);
        const next = toValue(nextCountry, nextNational);
        reported.current = next;
        onChange(next);
    };

    /**
     * Handle typing in the number: an international number selects its country
     *
     * @param text The input's text
     */
    const changeNumber = (text: string) => {
        const international = text.trimStart().replace(/^00/, "+");
        if (international.startsWith("+")) {
            const parsed = parsePhoneNumberFromString(international);
            if (parsed?.country) {
                update(parsed.country, parsed.nationalNumber);
                return;
            }
        }
        update(country, text);
    };

    return (
        <span
            data-slot="control"
            className={clsx([
                props.className,
                "relative flex w-full",
                "before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm",
                "dark:before:hidden",
                "after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2 sm:focus-within:after:ring-blue-500",
                "has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none",
            ])}
        >
            <span
                className={clsx(
                    "relative flex w-full rounded-lg border bg-transparent dark:bg-white/5",
                    props.invalid
                        ? "border-red-500 dark:border-red-500"
                        : "border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20",
                )}
            >
                <Headless.Field disabled={props.disabled} className={"relative shrink-0"}>
                    <Headless.Combobox
                        value={selected}
                        by={"code"}
                        onChange={(option: CountryOption | null) => {
                            if (option) update(option.code, national);
                        }}
                        onClose={() => setQuery("")}
                        virtual={{ options: filtered }}
                    >
                        <Flag
                            code={country}
                            className={"pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2"}
                        />
                        <Headless.ComboboxInput
                            aria-label={tg("accessibility.country-code")}
                            displayValue={(option: CountryOption | null) => (option ? `+${option.callingCode}` : "")}
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={(event) => event.target.select()}
                            className={clsx(
                                "relative block w-[6.75rem] appearance-none rounded-l-lg bg-transparent tabular-nums",
                                "py-[calc(--spacing(2.5)-1px)] pr-7 pl-10 sm:w-[6.25rem] sm:py-[calc(--spacing(1.5)-1px)]",
                                "text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white",
                                "border-r border-zinc-950/10 focus:outline-hidden dark:border-white/10",
                            )}
                        />
                        <Headless.ComboboxButton
                            aria-label={tg("accessibility.country-code")}
                            className={"group absolute inset-y-0 right-0 flex items-center pr-2"}
                        >
                            <svg
                                className={
                                    "size-4 stroke-zinc-500 group-data-hover:stroke-zinc-700 dark:stroke-zinc-400 dark:group-data-hover:stroke-zinc-300"
                                }
                                viewBox={"0 0 16 16"}
                                aria-hidden={"true"}
                                fill={"none"}
                            >
                                <path
                                    d={"M5.75 6.5L8 8.75L10.25 6.5"}
                                    strokeWidth={1.5}
                                    strokeLinecap={"round"}
                                    strokeLinejoin={"round"}
                                />
                            </svg>
                        </Headless.ComboboxButton>
                        <Headless.ComboboxOptions
                            anchor={"bottom start"}
                            transition={true}
                            className={clsx(
                                "[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)]",
                                "isolate z-50 max-h-72 w-80 max-w-[calc(100vw-2rem)] scroll-py-1 rounded-xl p-1 select-none empty:invisible",
                                "overflow-y-auto overscroll-contain outline outline-transparent focus:outline-hidden",
                                "bg-white/90 backdrop-blur-xl dark:bg-zinc-800/90",
                                "shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset",
                                "transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0",
                            )}
                        >
                            {({ option }) => (
                                <Headless.ComboboxOption
                                    value={option}
                                    className={clsx(
                                        "group/option flex w-full cursor-default items-center gap-3 rounded-lg px-3 py-2 sm:py-1.5",
                                        "text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white",
                                        "data-focus:bg-blue-500 data-focus:text-white",
                                    )}
                                >
                                    <Flag code={option.code} />
                                    <span className={"min-w-0 flex-1 truncate"}>{option.name}</span>
                                    <span
                                        className={
                                            "text-zinc-500 tabular-nums group-data-focus/option:text-white dark:text-zinc-400"
                                        }
                                    >
                                        +{option.callingCode}
                                    </span>
                                </Headless.ComboboxOption>
                            )}
                        </Headless.ComboboxOptions>
                    </Headless.Combobox>
                </Headless.Field>
                <Headless.Input
                    type={"tel"}
                    autoComplete={"tel-national"}
                    value={national}
                    disabled={props.disabled}
                    invalid={props.invalid}
                    onChange={(event) => changeNumber(event.target.value)}
                    onBlur={() => {
                        const parsed = value === "" ? undefined : parsePhoneNumberFromString(value);
                        if (parsed?.isValid()) setNational(parsed.formatNational());
                    }}
                    className={clsx(
                        "relative block w-full min-w-0 appearance-none rounded-r-lg bg-transparent tabular-nums",
                        "px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]",
                        "text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white",
                        "focus:outline-hidden",
                    )}
                />
            </span>
        </span>
    );
}
