import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { lineVariant } from "src/utils/dating";

/** A Commander's own dating lines, written for the most popular ones */
export type CommanderLines = {
    /** What it is looking for, shown in its bio */
    tagline: string;
    /** Said on a match */
    match: Array<string>;
    /** Said on a rejection; the measured reason is shown next to it */
    reject: Array<string>;
    /** Said after "No, come back" */
    comeback: string;
};

/** Every Commander with lines, by card name */
export type DatingLines = Record<string, CommanderLines>;

/** The line files, one chunk per language */
const FILES: Record<string, () => Promise<{ default: DatingLines }>> = {
    de: () => import("src/assets/dating-lines/de.json"),
    en: () => import("src/assets/dating-lines/en.json"),
};

/**
 * The dating lines of the current language, `null` while they load.
 *
 * @returns card name to lines
 */
export function useDatingLines(): DatingLines | null {
    const [, i18n] = useTranslation();
    const language = i18n.resolvedLanguage === "de" ? "de" : "en";
    const query = useQuery({
        queryKey: ["dating-lines", language],
        queryFn: async () => (await FILES[language]()).default,
        staleTime: Infinity,
    });
    return query.data ?? null;
}

/**
 * Picks one of a Commander's lines, the same one every time for the same seed.
 *
 * @param list the variants, if the Commander has any
 * @param seed what keeps the pick stable, usually the oracle id
 * @returns a line, or `null` to fall back to the generic one
 */
export function pickLine(list: Array<string> | undefined, seed: string): string | null {
    if (list === undefined || list.length === 0) return null;
    return list[(lineVariant(seed) - 1) % list.length];
}
