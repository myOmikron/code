import { ArrowRightIcon, CheckIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import BrandSurface from "../components/base/brand-surface";
import { Button } from "../components/base/button";
import StepBar from "../components/base/step-bar";
import type { WizardLayoutParts, WizardScreen } from "./wizard";

/** Exponential ease-out shared by every movement of the stage */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The properties for {@link WizardStageLayout}
 */
export type WizardStageLayoutProps = {
    /** What to arrange */
    parts: WizardLayoutParts;
    /** The page's title on the brand panel */
    heading?: string;
    /** A sentence below it */
    description?: string;
    /** The texts of the greeting or done screen, while one is shown */
    screen: WizardScreen | undefined;
    /** Called by the screen's button */
    onLeaveScreen: () => void;
};

/**
 * The default layout of a Wizard, filling all of its page.
 *
 * The brand panel takes the whole page for the greeting and the done screen, and shrinks to a column with the
 * page's title and the steps beside the form while the user works through them.
 *
 * Marked `data-full-bleed`, so a page frame can drop its padding around it (see `SidebarLayout`).
 */
export default function WizardStageLayout(props: WizardStageLayoutProps) {
    const { parts, screen } = props;
    const reducedMotion = useReducedMotion();
    const steps = screen ? parts.steps.map((s) => ({ ...s, onSelect: undefined })) : parts.steps;

    /** Eases in from an already visible state */
    const enter = {
        initial: reducedMotion ? false : { opacity: 0.4, y: 16, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE },
    };

    return (
        <div
            data-full-bleed={""}
            className={clsx(
                "grid flex-1",
                !screen &&
                    "grid-rows-[auto_1fr] lg:grid-cols-[minmax(20rem,1fr)_minmax(0,50rem)_minmax(0,1fr)] lg:grid-rows-1",
            )}
        >
            <motion.div
                layout={!reducedMotion}
                transition={{ duration: 0.7, ease: EASE }}
                className={"relative min-w-0"}
            >
                <BrandSurface className={"h-full"}>
                    <motion.div
                        layout={reducedMotion ? false : "position"}
                        key={screen ? parts.screen : "steps"}
                        className={clsx(
                            "flex h-full flex-col px-6 py-10 sm:px-10",
                            screen
                                ? "justify-center gap-12 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[1fr_minmax(14rem,18rem)] lg:items-center lg:gap-20 lg:px-20 lg:py-24"
                                : "gap-10 lg:ml-auto lg:w-full lg:max-w-md lg:px-12 lg:py-14",
                        )}
                        {...enter}
                    >
                        {screen ? (
                            <div className={"flex max-w-2xl flex-col items-start gap-6"}>
                                {parts.screen === "done" && (
                                    <motion.span
                                        className={
                                            "flex size-14 items-center justify-center rounded-full bg-white text-(--color-brand-700) shadow-(--color-brand-950)/60 shadow-[0_10px_30px_-8px]"
                                        }
                                        initial={reducedMotion ? false : { scale: 0.6, rotate: -12 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
                                    >
                                        <CheckIcon className={"size-7"} aria-hidden={"true"} />
                                    </motion.span>
                                )}
                                <h2
                                    className={
                                        "text-4xl/tight font-semibold tracking-tight text-balance sm:text-5xl/tight lg:text-6xl/[1.05]"
                                    }
                                >
                                    {screen.heading}
                                </h2>
                                <p className={"max-w-xl text-base/7 text-pretty text-white/80 sm:text-lg/8"}>
                                    {screen.description}
                                </p>
                                <Button color={"white"} className={"mt-4"} onClick={props.onLeaveScreen}>
                                    {screen.button}
                                    <ArrowRightIcon data-slot={"icon"} />
                                </Button>
                            </div>
                        ) : (
                            (props.heading || props.description) && (
                                <div className={"flex flex-col gap-3"}>
                                    {props.heading && (
                                        <h1
                                            className={
                                                "text-2xl/tight font-semibold tracking-tight text-balance lg:text-4xl/tight"
                                            }
                                        >
                                            {props.heading}
                                        </h1>
                                    )}
                                    {props.description && (
                                        <p className={"max-w-sm text-base/7 text-pretty text-white/75"}>
                                            {props.description}
                                        </p>
                                    )}
                                </div>
                            )
                        )}
                        <StepBar steps={steps} inverted={true} collapseOnMobile={!screen} />
                    </motion.div>
                </BrandSurface>
            </motion.div>

            {!screen && (
                <div className={"flex px-6 py-10 sm:px-10 lg:px-16 lg:py-16"}>
                    <div className={"flex w-full max-w-2xl flex-col gap-10"}>
                        <motion.h2
                            key={parts.title}
                            className={
                                "text-3xl/tight font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl/tight dark:text-white"
                            }
                            {...enter}
                        >
                            {parts.title}
                        </motion.h2>
                        {parts.form}
                    </div>
                </div>
            )}
        </div>
    );
}
