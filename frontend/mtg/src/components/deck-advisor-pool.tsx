import { XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Description, Field, Input } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GraphApi } from "src/api/graph";
import { InlineError } from "src/components/inline-error";
import { GRAPH_DEBOUNCE_MS } from "src/utils/use-graph-query";

/**
 * The properties for {@link DeckAdvisorPool}
 */
export type DeckAdvisorPoolProps = {
    /** The restriction currently in effect, or null while the whole pool is searched */
    applied: string | null;
    /** Applies a restriction, or clears it with null */
    onApply: (query: string | null) => void;
};

/**
 * Restrictions worth one click.
 *
 * A query box for a syntax the reader has never seen is a dead end: the
 * grammar lives in the service and nowhere the builder is looking. Three real
 * restrictions cover most of why anyone narrows a pool at all — money, era,
 * rarity — and each one doubles as an example of the syntax.
 */
const PRESETS: Array<{ slug: string; query: string }> = [
    { slug: "budget", query: "eur<5" },
    { slug: "modern-printings", query: "year>=2015" },
    { slug: "no-mythics", query: "-r:mythic" },
];

/** What the service last said about the text in the box */
type Check = { state: "unchecked" | "checking" | "valid" } | { state: "invalid"; message: string };

/**
 * Which cards the advisor may draw from at all.
 *
 * A Scryfall-flavoured query, checked by the service while it is typed and
 * applied only once it compiles. Two rules make it usable rather than
 * annoying: an unparseable query never becomes the restriction — the last
 * working one stands until a new one earns the slot — and clearing the box is
 * a valid state, not an error, because "no restriction" is where every deck
 * starts.
 *
 * Bare, with no surface of its own: it lives inside the assumptions dialog
 * beside the bracket and the ignore list, which brings its own heading and
 * its own section rule.
 *
 * @returns the control
 */
export function DeckAdvisorPool({ applied, onApply }: DeckAdvisorPoolProps) {
    const [t] = useTranslation("advisor");
    const [draft, setDraft] = useState(applied ?? "");
    const [check, setCheck] = useState<Check>({ state: "unchecked" });

    // Re-seeded when the deck changes underneath the component: the route
    // component holds the applied value, and switching decks replaces it.
    useEffect(() => setDraft(applied ?? ""), [applied]);

    // Checked on the same rhythm the graph itself is asked on, so a query is
    // validated once someone stops typing rather than per keystroke.
    useEffect(() => {
        const query = draft.trim();
        if (query === "" || query === applied) {
            setCheck({ state: "unchecked" });
            return;
        }
        setCheck({ state: "checking" });
        let cancelled = false;
        const abort = new AbortController();
        const timer = setTimeout(() => {
            GraphApi.poolQuery({ query }, { signal: abort.signal })
                .then((answer) => {
                    if (cancelled) return;
                    setCheck(
                        answer.ok
                            ? { state: "valid" }
                            : { state: "invalid", message: answer.error ?? t("error.pool-query-invalid") },
                    );
                })
                .catch(() => {
                    // An unreachable advisor must not read as a bad query: the
                    // service decides that, and it did not answer. The apply
                    // button stays available and the request itself will fail
                    // visibly where the suggestions are.
                    if (!cancelled) setCheck({ state: "unchecked" });
                });
        }, GRAPH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            abort.abort();
            clearTimeout(timer);
        };
    }, [draft, applied]);

    const query = draft.trim();
    const changed = query !== (applied ?? "");

    return (
        <div className={"mt-1"}>
            <div className={"flex w-full flex-col gap-2"}>
                <Field>
                    <Description>{t("description.pool-query")}</Description>
                    <Input
                        value={draft}
                        placeholder={t("label.pool-query-placeholder")}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" || check.state === "invalid") return;
                            onApply(query === "" ? null : query);
                        }}
                    />
                </Field>
                {/* Below the box rather than in a help panel: they fill it in,
                    and they are the only documentation of this syntax anyone
                    is going to read. */}
                <div className={"flex flex-wrap gap-1"}>
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.slug}
                            type={"button"}
                            onClick={() => setDraft(preset.query)}
                            className={
                                "rounded-(--radius-pill) px-2 py-0.5 text-xs/5 text-zinc-500 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:ring-white/15 dark:hover:bg-white/10 dark:hover:text-white"
                            }
                        >
                            {t(`label.pool-preset-${preset.slug}`)}
                        </button>
                    ))}
                </div>
                {check.state === "invalid" && <InlineError>{check.message}</InlineError>}
                <div className={"flex flex-wrap items-center gap-2"}>
                    <Button
                        color={"blue"}
                        disabled={!changed || check.state === "invalid" || check.state === "checking"}
                        onClick={() => onApply(query === "" ? null : query)}
                    >
                        {t("button.pool-apply")}
                    </Button>
                    {applied !== null && (
                        <Button
                            plain
                            aria-label={t("accessibility.pool-clear")}
                            onClick={() => {
                                setDraft("");
                                onApply(null);
                            }}
                        >
                            <XMarkIcon />
                            {t("button.pool-clear")}
                        </Button>
                    )}
                </div>
                {applied !== null && (
                    <p className={"flex flex-wrap items-center gap-2 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("label.pool-active-prefix")}
                        <code
                            className={
                                "rounded-(--radius-control) bg-zinc-950/5 px-1.5 py-0.5 font-mono text-xs text-zinc-950 dark:bg-white/10 dark:text-white"
                            }
                        >
                            {applied}
                        </code>
                    </p>
                )}
            </div>
        </div>
    );
}
