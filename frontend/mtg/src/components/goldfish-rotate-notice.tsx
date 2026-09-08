import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { motion } from "motion/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link GoldfishRotateNotice}
 */
export type GoldfishRotateNoticeProps = {
    /** Leaves the table, for someone who did not mean to be here */
    onBack: () => void;
};

/**
 * Asking for the phone to be turned.
 *
 * The table is wider than it is tall, and a phone held upright shows a third
 * of it. Rather than squeezing the table into that, the page waits.
 *
 * @returns the notice
 */
export function GoldfishRotateNotice({ onBack }: GoldfishRotateNoticeProps) {
    const [t] = useTranslation("goldfish");

    useEffect(() => {
        const root = document.documentElement;
        const previous = root.style.overflow;
        root.style.overflow = "hidden";
        return () => {
            root.style.overflow = previous;
        };
    }, []);

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={
                "fixed inset-0 z-50 flex touch-none flex-col items-center justify-center gap-6 overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_50%_30%,#1b4332_0%,#0b2a1e_70%)] p-8 text-center text-white"
            }
        >
            <motion.div
                animate={{ rotate: [0, 0, -90, -90, 0] }}
                transition={{ duration: 3, times: [0, 0.2, 0.5, 0.8, 1], repeat: Infinity, ease: "easeInOut" }}
                className={"rounded-2xl bg-white/10 p-5 ring-1 ring-white/20"}
            >
                <DevicePhoneMobileIcon className={"size-16 text-amber-200"} />
            </motion.div>
            <div className={"flex flex-col gap-2"}>
                <span className={"text-[11px]/4 font-semibold tracking-[0.3em] text-amber-200/80 uppercase"}>
                    {t("heading.rotate")}
                </span>
                <span className={"max-w-xs text-sm text-white/70"}>{t("description.rotate")}</span>
            </div>
            <button
                type={"button"}
                onClick={onBack}
                className={
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white ring-1 ring-white/25 transition hover:bg-white/10"
                }
            >
                <ArrowLeftIcon className={"size-4"} />
                {t("button.back-to-deck")}
            </button>
        </motion.div>,
        document.body,
    );
}
