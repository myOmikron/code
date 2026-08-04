import React from "react";
import { useTranslation } from "react-i18next";
import { Text } from "src/components/base/text";
import { CheckIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";

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
};

/** Representation of a step */
export type Step = {
    /** The label of the step */
    label: string;
    /** The description of the step */
    description?: string;
    /** The current state of the step */
    state: "finished" | "active" | "pending";
};

/**
 * A bar which has defined steps with explanation text for each step
 */
export default function StepBar(props: StepBarProps) {
    const [tg] = useTranslation();

    const { space, steps } = props;

    return (
        <nav aria-label={tg("accessibility.progress")} className={props.className}>
            <ol role={"list"} className={"overflow-hidden"}>
                {steps.map((step, idx) => (
                    <li
                        key={step.label}
                        className={clsx("relative", idx !== steps.length - 1 && space === undefined ? "pb-10" : space)}
                    >
                        {/* connection */}
                        {idx !== steps.length - 1 && (
                            <div
                                className={clsx(
                                    "absolute top-4 left-4 mt-0.5 -ml-px h-full w-0.5",
                                    step.state === "finished" ? "bg-blue-600" : "bg-zinc-400 dark:bg-zinc-700",
                                )}
                                aria-hidden={"true"}
                            />
                        )}

                        <div className={"relative flex items-center"}>
                            {/* Bubble */}
                            <span className={"flex h-9 items-center"}>
                                <span
                                    className={
                                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600"
                                    }
                                >
                                    {step.state === "finished" ? (
                                        <CheckIcon className={"h-5 w-5 text-white"} />
                                    ) : step.state === "active" ? (
                                        <span
                                            className={
                                                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white dark:bg-zinc-900"
                                            }
                                        >
                                            <span className={"h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600"} />
                                        </span>
                                    ) : (
                                        <span
                                            className={
                                                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
                                            }
                                        >
                                            <span className={"h-2.5 w-2.5 rounded-full bg-transparent"} />
                                        </span>
                                    )}
                                </span>
                            </span>

                            {/* Text */}
                            <span className={"ml-4 flex min-w-0 flex-col justify-center"}>
                                <Text className={"!text-sm font-medium !text-zinc-800 dark:!text-zinc-50"}>
                                    {step.label}
                                </Text>
                                {step.description && (
                                    <span className={"text-sm text-zinc-600 dark:text-zinc-400"}>
                                        {step.description}
                                    </span>
                                )}
                            </span>
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
