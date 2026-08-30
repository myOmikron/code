import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/16/solid";
import { Badge } from "components";
import { useTranslation } from "react-i18next";
import { CutPhrase } from "src/api/graph-generated";
import { say } from "src/utils/advisor-phrase";

/**
 * The codes that argue for letting the card go.
 *
 * Read as sentences the service's cut reasons are all the same shape, but they
 * are not the same *claim*: four of them are arguments for the cut and two are
 * arguments against it — a staple says "cut something else first". That split
 * is the first thing a reader needs and the last thing prose gave them, so it
 * is what the colour and the arrow carry here.
 */
const ARGUES_OUT: ReadonlySet<string> = new Set([
    "bucket-crowded",
    "excluded-theme",
    "improves-shape",
    "rarely-played",
]);

/** The codes that defend the card against the cut */
const ARGUES_KEEP: ReadonlySet<string> = new Set(["staple", "supplies-scarce"]);

/**
 * The properties for {@link DeckAdvisorReasonChip}
 */
export type DeckAdvisorReasonChipProps = {
    /** One reason the service gave for cutting — or for not cutting — this card */
    reason: CutPhrase;
};

/**
 * One cut reason as a chip: which way it argues, in a word.
 *
 * The list this replaces was six sentences of the same weight and colour, and
 * a reader scanning ten exchanges had to parse each one to learn whether it
 * was for or against. A red chip pointing down and a blue chip pointing up
 * answer that before the word is read; the word says which argument it is; the
 * full sentence stays one hover away and is what a screen reader hears, so
 * nothing the service said is lost.
 *
 * A code this app has no colour for renders grey and unarrowed, saying the
 * sentence in full rather than guessing at a direction — the same instinct as
 * `say`'s English fallback, applied to the claim instead of the wording.
 *
 * @returns the chip
 */
export function DeckAdvisorReasonChip({ reason }: DeckAdvisorReasonChipProps) {
    const [t] = useTranslation("advisor");

    const sentence = say(t, "cut", reason);
    const out = ARGUES_OUT.has(reason.code);
    const keep = ARGUES_KEEP.has(reason.code);

    if (!out && !keep) {
        return <Badge color={"zinc"}>{sentence}</Badge>;
    }

    // The params the sentence interpolates are the same ones the word wants —
    // which bucket is crowded, what the card supplies — and the service always
    // sends them for these codes.
    const word = t(`label.cut-word-${reason.code}`, { ...reason.params, defaultValue: sentence });
    const Arrow = out ? ArrowDownIcon : ArrowUpIcon;

    return (
        <Badge color={out ? "red" : "blue"} title={sentence}>
            <Arrow className={"size-3 shrink-0"} aria-hidden={"true"} />
            <span aria-hidden={"true"}>{word}</span>
            {/* The chip is a summary; the sentence is the actual claim, and it
                is what gets read out rather than a word with no direction. */}
            <span className={"sr-only"}>{sentence}</span>
        </Badge>
    );
}
