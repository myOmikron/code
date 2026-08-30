import { ReactNode } from "react";

/**
 * Props for {@link DeckAdvisorPhaseHeadline}
 */
export type DeckAdvisorPhaseHeadlineProps = {
    /** The headline content */
    heading: ReactNode;
    /** Description text below the heading */
    description: string;
};

/**
 * Phase-specific heading and description block for Trim, Build, and Refine phases.
 *
 * @returns the headline
 */
export function DeckAdvisorPhaseHeadline({ heading, description }: DeckAdvisorPhaseHeadlineProps) {
    return (
        <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{heading}</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
    );
}
