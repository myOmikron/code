import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { Button } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link DeckAdvisorSetupBanner}
 */
export type DeckAdvisorSetupBannerProps = {
    /** Opens the setup dialog */
    onSetup: () => void;
    /** Dismisses the offer for good, on this deck */
    onNotNow: () => void;
};

/**
 * The quiet cousin of {@link DeckAdvisorSetup}'s self-opening dialog: a deck
 * that already has cards in it has a detector with an opinion, and
 * interrupting to confirm that opinion is rude. This says the setup exists
 * and leaves taking it up to the reader.
 *
 * `Not now` is a decision, not a deferral — it writes `setup_done` the same
 * way finishing the dialog does, and the assumptions dialog is the way back
 * in either case.
 *
 * @returns the banner
 */
export function DeckAdvisorSetupBanner({ onSetup, onNotNow }: DeckAdvisorSetupBannerProps) {
    const [t] = useTranslation("advisor");

    return (
        <div
            className={
                "flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:flex-row sm:items-center dark:ring-white/10"
            }
        >
            <InformationCircleIcon
                className={"size-5 shrink-0 text-zinc-400 dark:text-zinc-500"}
                aria-hidden={"true"}
            />
            <div className={"min-w-0 flex-1"}>
                <p className={"text-sm font-medium text-zinc-950 dark:text-white"}>{t("heading.setup-banner")}</p>
                <p className={"text-xs text-zinc-600 dark:text-zinc-400"}>{t("description.setup-banner")}</p>
            </div>
            <div className={"flex shrink-0 items-center gap-2"}>
                <Button plain onClick={onNotNow}>
                    {t("button.setup-later")}
                </Button>
                <Button outline onClick={onSetup}>
                    {t("button.setup-open")}
                </Button>
            </div>
        </div>
    );
}
