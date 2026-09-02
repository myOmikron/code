import { ChevronRightIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeckAdvisorCockpit, DeckAdvisorCockpitProps } from "src/components/deck-advisor-cockpit";

/**
 * The properties for {@link DeckAdvisorShapeSummary} — exactly what today's
 * {@link DeckAdvisorCockpit} already takes, since this wraps it verbatim.
 */
export type DeckAdvisorShapeSummaryProps = DeckAdvisorCockpitProps;

/**
 * The one-word verdict a type reads as, once it is already known to be off target
 *
 * @param status the type's own status string
 *
 * @returns the translation key for "too little" or "too much"
 */
function statusKey(status: string): string {
    return status === "low" ? "label.shape-status-low" : "label.shape-status-high";
}

/**
 * The cEDH cockpit's demoted shape panel: today's curve/quotas/types/themes
 * cockpit, collapsed to one summary row that expands to the exact same
 * `DeckAdvisorCockpit` a casual deck sees at full size.
 *
 * Wraps rather than re-renders — per the task's own instruction, a second,
 * simplified reader of `types`/`buckets` would drift from the real one the
 * first time either changed. The summary line reads only `analysis.data.types`
 * (mirroring the approved mockup's own derivation), because the full view one
 * click away already covers curve and role coverage in detail; this line
 * exists to answer "is anything off" before the reader commits to opening it.
 *
 * The disclosure itself is the app's own idiom (`DeckAdvisorNotesDisclosure`,
 * `src/components/deck-advisor-notes-disclosure.tsx`): closed by default, one
 * button with `aria-expanded` and a rotating chevron.
 *
 * @returns the panel
 */
export function DeckAdvisorShapeSummary(props: DeckAdvisorShapeSummaryProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState(false);

    const types = props.analysis.data?.types ?? [];
    const off = types.filter((type) => type.status !== "ok");
    const summary =
        off.length === 0
            ? t("label.shape-all-ok")
            : t("label.shape-off", {
                  list: off
                      .map((type) => {
                          const label = t(`label.type-${type.type.toLowerCase()}`, { defaultValue: type.type });
                          return `${label} (${t(statusKey(type.status))})`;
                      })
                      .join(", "),
              });

    return (
        <div
            className={
                "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.shape")}</h3>
            <button
                type={"button"}
                aria-expanded={open}
                onClick={() => setOpen((held) => !held)}
                className={
                    "mt-2 flex items-center justify-between gap-2 rounded-(--radius-control) py-1 text-left text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                }
            >
                <span>{summary}</span>
                <ChevronRightIcon
                    className={clsx("size-4 shrink-0 transition-transform", open && "rotate-90")}
                    aria-hidden={true}
                />
            </button>
            {open && (
                <div className={"mt-4"}>
                    <DeckAdvisorCockpit {...props} />
                </div>
            )}
        </div>
    );
}
