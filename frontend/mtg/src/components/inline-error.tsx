import type { ReactNode } from "react";

/**
 * The properties for {@link InlineError}
 */
export type InlineErrorProps = {
    /** The error text */
    children: ReactNode;
};

/**
 * Standalone error text, styled like the library's `ErrorMessage`.
 *
 * Use this outside of forms: `ErrorMessage` wraps Headless UI's `Description` and throws when
 * rendered outside a `Field`.
 *
 * @returns the error paragraph
 */
export function InlineError({ children }: InlineErrorProps) {
    return <p className={"text-base/6 text-red-600 sm:text-sm/6 dark:text-red-500"}>{children}</p>;
}
