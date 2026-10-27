import { useTranslation } from "react-i18next";
import { Text } from "./text";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * The properties for {@link StepBar}
 */
export type StepBarProps = {
    /** A list of currently active steps */
    steps: Array<Step>;
    /** The space between the steps, should be specified as pb-[] */
    space?: string;
    /** Optional classname to set on the outer element */
    className?: string;
    /** Show only "Step x of y" instead of the list below the `lg` breakpoint, while a step is active */
    collapseOnMobile?: boolean;
    /** Light on dark: for a StepBar on a saturated brand surface */
    inverted?: boolean;
};

/** Representation of a step */
export type Step = {
    /** Stable identifier of the step, used as key; falls back to the label */
    id?: string;
    /** The label of the step */
    label: string;
    /** The description of the step */
    description?: string;
    /** The current state of the step */
    state: "finished" | "active" | "pending" | "error";
    /** Makes the step clickable; called when the user selects it */
    onSelect?: () => void;
};

/**
 * A bar which has defined steps with explanation text for each step
 */
export default function StepBar(props: StepBarProps) {
    const [tg] = useTranslation();

    const { space, steps, inverted } = props;
    const activeIndex = steps.findIndex((step) => step.state === "active");
    const collapsed = props.collapseOnMobile && activeIndex !== -1;

    return (
        <nav aria-label={tg("accessibility.progress")} className={props.className}>
            {collapsed && (
                <Text className={clsx("lg:hidden", inverted && "text-white/80!")}>
                    {tg("label.step-x-of-y", { current: activeIndex + 1, total: steps.length })}
                </Text>
            )}
            <ol role={"list"} className={clsx("overflow-hidden", collapsed && "max-lg:hidden")}>
                {steps.map((step, idx) => (
                    <li
                        key={step.id ?? step.label}
                        data-state={step.state}
                        aria-current={step.state === "active" ? "step" : undefined}
                        className={clsx("relative", idx !== steps.length - 1 && space === undefined ? "pb-10" : space)}
                    >
                        {idx !== steps.length - 1 && (
                            <div
                                className={clsx(
                                    "absolute left-4 -ml-px w-0.5",
                                    inverted ? "top-11 h-[calc(100%-3.5rem)] rounded-full" : "top-4 mt-0.5 h-full",
                                    inverted
                                        ? step.state === "finished"
                                            ? "bg-white/80"
                                            : "bg-white/20"
                                        : step.state === "finished"
                                          ? "bg-blue-600"
                                          : "bg-zinc-400 dark:bg-zinc-700",
                                )}
                                aria-hidden={"true"}
                            />
                        )}

                        <StepContent step={step} inverted={inverted}>
                            <span className={"flex h-9 items-center"}>
                                <span
                                    className={clsx(
                                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full",
                                        inverted ? step.state === "finished" && "bg-white" : "bg-blue-600",
                                    )}
                                >
                                    {step.state === "finished" ? (
                                        <CheckIcon
                                            className={clsx(
                                                "h-5 w-5",
                                                inverted ? "text-(--color-brand-800)" : "text-white",
                                            )}
                                        />
                                    ) : step.state === "error" ? (
                                        <span
                                            className={
                                                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-600"
                                            }
                                        >
                                            <ExclamationTriangleIcon
                                                className={"h-5 w-5 text-white"}
                                                aria-hidden={"true"}
                                            />
                                            <span className={"sr-only"}>{tg("accessibility.step-error")}</span>
                                        </span>
                                    ) : step.state === "active" ? (
                                        <span
                                            className={clsx(
                                                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
                                                inverted
                                                    ? "border-white bg-white/15"
                                                    : "border-blue-600 bg-white dark:bg-zinc-900",
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    "h-2.5 w-2.5 animate-pulse rounded-full",
                                                    inverted ? "bg-white" : "bg-blue-600",
                                                )}
                                            />
                                        </span>
                                    ) : (
                                        <span
                                            className={clsx(
                                                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
                                                inverted
                                                    ? "border-white/35 bg-transparent"
                                                    : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
                                            )}
                                        >
                                            <span className={"h-2.5 w-2.5 rounded-full bg-transparent"} />
                                        </span>
                                    )}
                                </span>
                            </span>

                            <span className={"ml-4 flex min-w-0 flex-col justify-center"}>
                                <Text
                                    className={clsx(
                                        "!text-sm font-medium group-hover:underline",
                                        inverted
                                            ? step.state === "pending"
                                                ? "!text-white/70"
                                                : "!text-white"
                                            : "!text-zinc-800 dark:!text-zinc-50",
                                    )}
                                >
                                    {step.label}
                                </Text>
                                {step.description && (
                                    <span
                                        className={clsx(
                                            "text-sm",
                                            inverted ? "text-white/65" : "text-zinc-600 dark:text-zinc-400",
                                        )}
                                    >
                                        {step.description}
                                    </span>
                                )}
                            </span>
                        </StepContent>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/**
 * The properties for {@link StepContent}
 */
type StepContentProps = {
    /** The step */
    step: Step;
    /** Bubble and text of the step */
    children: ReactNode;
    /** See {@link StepBarProps.inverted} */
    inverted?: boolean;
};

/**
 * Bubble and text of a step, as a button when the step is selectable
 */
function StepContent(props: StepContentProps) {
    const { step } = props;
    if (!step.onSelect) return <div className={"relative flex items-center"}>{props.children}</div>;
    return (
        <button
            type={"button"}
            onClick={step.onSelect}
            className={clsx(
                "group relative flex w-full cursor-pointer items-center rounded-md text-left focus-visible:outline-2",
                props.inverted ? "focus-visible:outline-white" : "focus-visible:outline-blue-600",
            )}
        >
            {props.children}
        </button>
    );
}
