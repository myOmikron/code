import { HeartIcon } from "@heroicons/react/24/solid";
import { Button } from "components";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { RejectReason } from "src/api/generated";
import { ManaCost } from "src/components/mana-cost";
import { PrimaryButton } from "src/components/primary-button";
import { manaSymbols, matchKey, rejectionKey } from "src/utils/dating";
import type { StartMode } from "src/utils/use-start-deck";

/** How a match came about */
export type MatchKind = "like" | "super" | "comeback";

/** What the overlay shows */
export type Verdict =
    { kind: "match"; how: MatchKind; shared: string | null } | { kind: "reject"; reason: RejectReason | null };

/**
 * The properties for {@link DatingVerdict}
 */
export type DatingVerdictProps = {
    /** The Commander's oracle id, which picks the line */
    commander: string;
    /** Card name */
    name: string;
    /** Art crop url */
    art: string | null;
    /** The verdict */
    verdict: Verdict;
    /** Whether a button's request is running */
    busy: boolean;
    /** Close and go on */
    onKeepSwiping: () => void;
    /** Create a deck with the Commander, planned on a date or not */
    onStartDeck: (mode: StartMode) => void;
    /** "No, come back" */
    onComeBack: () => void;
};

/**
 * The full-screen answer to a like: a match, or a rejection with its reason.
 *
 * @returns the overlay
 */
export function DatingVerdict(props: DatingVerdictProps) {
    const { commander, name, art, verdict, busy, onKeepSwiping, onStartDeck, onComeBack } = props;
    const [t] = useTranslation("dating");
    const match = verdict.kind === "match";

    let title: string;
    let line: string;
    if (verdict.kind === "match") {
        title =
            verdict.how === "super"
                ? t("heading.super-match")
                : verdict.how === "comeback"
                  ? t("heading.second-chance")
                  : t("heading.match");
        line = verdict.how === "comeback" ? t("description.second-chance", { name }) : t(matchKey(commander), { name });
    } else {
        title = t("heading.passed", { name });
        line =
            verdict.reason === null
                ? ""
                : t(rejectionKey(verdict.reason, commander), { detail: verdict.reason.detail ?? "" });
    }

    return (
        <motion.div
            role={"dialog"}
            aria-modal={true}
            aria-label={title}
            className={
                "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-950/95 px-6 py-10 text-center text-white"
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className={"flex items-center"}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
                {match && (
                    <span
                        className={
                            "flex size-28 items-center justify-center rounded-full border-4 border-zinc-950 bg-zinc-800"
                        }
                    >
                        <HeartIcon className={"size-12 text-lime-400"} />
                    </span>
                )}
                <span
                    className={
                        match
                            ? "-ml-5 size-28 overflow-hidden rounded-full border-4 border-lime-400 bg-zinc-800"
                            : "size-28 overflow-hidden rounded-full border-4 border-zinc-600 bg-zinc-800 grayscale"
                    }
                >
                    {art !== null && (
                        <img
                            src={art}
                            alt={t("accessibility.art", { name })}
                            crossOrigin={"anonymous"}
                            className={"size-full object-cover object-[center_35%]"}
                        />
                    )}
                </span>
            </motion.div>

            <h2 className={match ? "text-4xl font-extrabold text-lime-400" : "text-3xl font-extrabold"}>{title}</h2>
            {line !== "" && <p className={"max-w-xs text-lg leading-snug text-zinc-100"}>{line}</p>}

            {verdict.kind === "match" && verdict.shared !== null && (
                <p className={"text-sm text-zinc-400"}>{t("description.shared", { shared: verdict.shared })}</p>
            )}
            {verdict.kind === "reject" && verdict.reason !== null && (
                <p className={"flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm"}>
                    <span className={"font-bold text-amber-400"}>
                        {t(`label.dimension-${verdict.reason.dimension.toLowerCase()}`)}
                    </span>
                    {verdict.reason.dimension === "Colors" && verdict.reason.detail ? (
                        <ManaCost value={manaSymbols(verdict.reason.detail)} />
                    ) : (
                        verdict.reason.detail && <span className={"text-zinc-300"}>{verdict.reason.detail}</span>
                    )}
                </p>
            )}

            <div className={"flex w-full max-w-xs flex-col gap-3"}>
                {match ? (
                    <>
                        <PrimaryButton onClick={() => onStartDeck("date")} disabled={busy}>
                            {t("button.plan-date")}
                        </PrimaryButton>
                        <button
                            type={"button"}
                            onClick={() => onStartDeck("build")}
                            disabled={busy}
                            className={
                                "h-11 rounded-(--radius-control) border border-white/30 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:opacity-50"
                            }
                        >
                            {t("button.just-build")}
                        </button>
                    </>
                ) : (
                    <button
                        type={"button"}
                        onClick={onComeBack}
                        disabled={busy}
                        className={
                            "h-11 rounded-(--radius-control) border-2 border-lime-400 font-semibold text-lime-400 transition-colors hover:bg-lime-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:opacity-50"
                        }
                    >
                        {t("button.come-back")}
                    </button>
                )}
                <Button plain={true} onClick={onKeepSwiping} disabled={busy} className={"text-white!"}>
                    {t("button.keep-swiping")}
                </Button>
            </div>
        </motion.div>
    );
}
