import React from "react";
import clsx from "clsx";

/**
 * The properties for {@link EmptyState}
 */
export type EmptyStateProps = {
    /** Optional leading icon (heroicon component or any svg). Sized 48px. */
    icon?: React.ReactNode;
    /** Headline — usually a single short sentence. */
    title: string;
    /** Description — supportive text under the title. */
    description?: string;
    /** Optional CTA — typically a `<Button>` or `<Link>`. */
    action?: React.ReactNode;
    /** Variant: `card` is enclosed in a surface card; `bare` is a transparent block. */
    variant?: "card" | "bare";
    /** Additional CSS classes */
    className?: string;
};

/**
 * A consistent empty-state slot used in lists, tables and detail views when
 * the loaded data is empty.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<FolderIcon />}
 *   title="No items found"
 *   description="Create your first item to get started."
 *   action={<Button>Create item</Button>}
 * />
 * ```
 */
export function EmptyState(props: EmptyStateProps) {
    const { icon, title, description, action, variant = "card", className } = props;
    return (
        <div
            className={clsx(
                className,
                "flex flex-col items-center justify-center gap-3 p-10 text-center",
                variant === "card" &&
                    "rounded-(--radius-card) border border-dashed border-zinc-950/10 bg-(--surface-muted)/40 dark:border-white/10",
            )}
        >
            {icon && (
                <div className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-(--color-brand-50) text-(--color-brand-600) *:size-6 dark:bg-(--color-brand-900)/40 dark:text-(--color-brand-300)">
                    {icon}
                </div>
            )}
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
            {description && <p className="max-w-md text-sm/6 text-zinc-600 dark:text-zinc-400">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
