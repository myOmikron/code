// PROTOTYPE, wipe me: floating variant switcher (branch prototype/semmelei-news-placement)
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { useNavigate } from "@tanstack/react-router";
import React from "react";

/** The props for {@link PrototypeSwitcher} */
export type PrototypeSwitcherProps = {
    /** Variant keys with their names */
    variants: Array<{ key: string; name: string }>;
    /** Current key */
    current: string;
};

/**
 * Bottom bar cycling `?variant=`, also via ← / →
 *
 * @param props the props
 *
 * @returns the bar, or nothing in production
 */
export function PrototypeSwitcher(props: PrototypeSwitcherProps) {
    const navigate = useNavigate();
    const index = Math.max(
        0,
        props.variants.findIndex((v) => v.key === props.current),
    );

    const go = React.useCallback(
        (delta: number) => {
            const next = props.variants[(index + delta + props.variants.length) % props.variants.length];
            void navigate({ to: ".", search: (s: Record<string, unknown>) => ({ ...s, variant: next.key }) });
        },
        [index, navigate, props.variants],
    );

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
            if (el instanceof HTMLElement && el.isContentEditable) return;
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [go]);

    if (import.meta.env.PROD) return null;

    const current = props.variants[index];
    return (
        <div
            className={
                "fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm font-semibold text-white shadow-xl"
            }
        >
            <button type={"button"} onClick={() => go(-1)} className={"cursor-pointer rounded-full p-1.5"}>
                <ChevronLeftIcon className={"size-5"} />
            </button>
            <span className={"whitespace-nowrap"}>
                {current.key} ({current.name})
            </span>
            <button type={"button"} onClick={() => go(1)} className={"cursor-pointer rounded-full p-1.5"}>
                <ChevronRightIcon className={"size-5"} />
            </button>
        </div>
    );
}

/** The placement variants of the News Post prototype */
export const NEWS_VARIANTS = [
    { key: "A", name: "Nur Startseite" },
    { key: "B", name: "Eigene Seite" },
    { key: "C", name: "Teaser + Seite" },
    { key: "D", name: "Hinweisleiste" },
];
