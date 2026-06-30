import React from "react";
import clsx from "clsx";
import { ClipboardIcon, CheckIcon } from "@heroicons/react/16/solid";
import { useTranslation } from "react-i18next";
import { notify } from "./toast";
import * as Headless from "@headlessui/react";

/**
 * The properties for {@link CopyButton}
 */
export type CopyButtonProps = {
    /** Value to copy to the clipboard. */
    value: string;
    /** Optional aria-label override. Defaults to the i18n string `notice.copy`. */
    label?: string;
    /** Additional CSS classes */
    className?: string;
    /** Visual size — matches the icon-only icon-button density. */
    size?: "sm" | "md";
};

/**
 * An icon button that copies a value to the clipboard and shows a success toast.
 *
 * @example
 * ```tsx
 * <CopyButton value={apiKey} />
 * ```
 */
export function CopyButton(props: CopyButtonProps) {
    const { value, label, className, size = "md" } = props;
    const [tg] = useTranslation();
    const [copied, setCopied] = React.useState(false);

    /** Copies value to clipboard and shows a success or error toast. */
    const onClick = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            notify.success(tg("notice.copied", { defaultValue: "Copied to clipboard" }));
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            notify.error(tg("notice.copy-failed", { defaultValue: "Could not copy to clipboard" }));
        }
    };

    const dim = size === "sm" ? "size-7" : "size-8";
    const iconDim = size === "sm" ? "size-3.5" : "size-4";

    return (
        <Headless.Button
            type="button"
            onClick={onClick}
            aria-label={label ?? tg("notice.copy", { defaultValue: "Copy" })}
            className={clsx(
                className,
                dim,
                "inline-flex items-center justify-center rounded-(--radius-control) text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 focus:outline-2 focus:outline-offset-2 focus:outline-(--color-brand-500) dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white",
            )}
        >
            {copied ? (
                <CheckIcon className={clsx(iconDim, "text-(--color-success)")} />
            ) : (
                <ClipboardIcon className={iconDim} />
            )}
        </Headless.Button>
    );
}
