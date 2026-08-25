import { FunnelIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Description, Field, Input, Label } from "components";
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
 * Zinc rather than amber, like the Rule 0 banner above it: a narrowed pool is
 * a deliberate choice, and the panel says what is in effect rather than
 * warning about it.
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
        <div
            className={
                "mb-4 flex gap-3 rounded-(--radius-lg) bg-zinc-100 p-4 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10"
            }
        >
            <FunnelIcon className={"size-5 shrink-0 text-zinc-500 dark:text-zinc-400"} aria-hidden={"true"} />
            <div className={"flex w-full flex-col gap-2"}>
                <Field>
                    <Label>{t("heading.pool")}</Label>
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
                    <p className={"text-sm/6 text-zinc-600 dark:text-zinc-400"}>
                        {t("label.pool-active", { query: applied })}
                    </p>
                )}
            </div>
        </div>
    );
}
