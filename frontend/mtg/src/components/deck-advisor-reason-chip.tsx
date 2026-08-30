import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/16/solid";
import { Badge } from "components";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CutPhrase } from "src/api/graph-generated";
import { say } from "src/utils/advisor-phrase";
import { resourceLabel } from "src/utils/graph-vocabulary";

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
 * The items one reason splits into, one chip each.
 *
 * Two codes carry a list rather than a single fact: the buckets this card is
 * crowding, and the scarce resources it supplies. "Over on mana sources and
 * card draw" is two separate things wrong with the deck, and a reader fixes
 * them separately, so each gets its own chip.
 *
 * A single `undefined` for every other code — and for a service too old to
 * send the slugs behind its prose, which keeps the unsplit sentence rather
 * than picking an English list apart.
 *
 * @param reason the reason to lay out
 *
 * @returns one entry per chip: a vocabulary slug, or `undefined` to word the
 *   chip from the phrase itself
 */
export function reasonItems(reason: CutPhrase): Array<string | undefined> {
    const listed =
        reason.code === "bucket-crowded"
            ? reason.params?.bucket_slugs
            : reason.code === "supplies-scarce"
              ? reason.params?.listed
              : undefined;
    const items = (listed ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");
    return items.length > 0 ? items : [undefined];
}

/**
 * Words one item of a split reason in the reader's language.
 *
 * Buckets are this app's own vocabulary and have translations; resources are
 * the graph's, and stay in its words the way card names do.
 *
 * @param t the advisor namespace's translator
 * @param reason the reason being split
 * @param item the slug this chip is about
 *
 * @returns the parameters that word this chip
 */
function named(t: TFunction, reason: CutPhrase, item: string): Record<string, string> {
    if (reason.code === "bucket-crowded") {
        const key = `label.bucket-${item.replace(/_/g, "-")}`;
        return { buckets: t(key, { defaultValue: item.replace(/_/g, " ") }) };
    }
    return { listed: resourceLabel(item) };
}

/**
 * The properties for {@link DeckAdvisorReasonChip}
 */
export type DeckAdvisorReasonChipProps = {
    /** One reason the service gave for cutting — or for not cutting — this card */
    reason: CutPhrase;
    /** Which item of a split reason this chip is about, from {@link reasonItems} */
    item?: string;
};

/**
 * One cut reason as a chip: which way it argues, in a word.
 *
 * The list this replaces was six sentences of the same weight and colour, and
 * a reader scanning ten exchanges had to parse each one to learn whether it
 * was for or against. A red chip pointing down and a blue chip pointing up
 * answer that before the word is read; the word says which argument it is; the
 * service's full sentence stays one hover away.
 *
 * A code this app has no colour for renders grey and unarrowed, saying the
 * sentence in full rather than guessing at a direction — the same instinct as
 * `say`'s English fallback, applied to the claim instead of the wording.
 *
 * @returns the chip
 */
export function DeckAdvisorReasonChip({ reason, item }: DeckAdvisorReasonChipProps) {
    const [t] = useTranslation("advisor");

    const sentence = say(t, "cut", reason);
    const out = ARGUES_OUT.has(reason.code);
    const keep = ARGUES_KEEP.has(reason.code);

    if (!out && !keep) {
        return <Badge color={"zinc"}>{sentence}</Badge>;
    }

    // The params the sentence interpolates are the same ones the word wants —
    // which bucket is crowded, what the card supplies — and the service always
    // sends them for these codes. A split chip overrides the list with the one
    // item it is about.
    const word = t(`label.cut-word-${reason.code}`, {
        ...reason.params,
        ...(item === undefined ? {} : named(t, reason, item)),
        defaultValue: sentence,
    });
    const Arrow = out ? ArrowDownIcon : ArrowUpIcon;

    return (
        <Badge color={out ? "red" : "blue"} title={sentence}>
            <Arrow className={"size-3 shrink-0"} aria-hidden={"true"} />
            <span aria-hidden={"true"}>{word}</span>
            {/* What the colour and the arrow say without words, said in them —
                and the whole sentence where this chip is the whole reason,
                since a split chip's share of it is just the word. */}
            <span className={"sr-only"}>
                {`${item === undefined ? sentence : word} — ${t(
                    out ? "accessibility.cut-argues-out" : "accessibility.cut-argues-keep",
                )}`}
            </span>
        </Badge>
    );
}
