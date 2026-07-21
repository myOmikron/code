import React from "react";

/**
 * The properties for {@link InlineError}
 */
export type InlineErrorProps = {
    /** The error text */
    children: React.ReactNode;
};

/**
 * Standalone error text, styled like the lib's `ErrorMessage`.
 *
 * Use this outside of forms: `ErrorMessage` wraps Headless UI's
 * `Description` and throws when rendered outside a `Field`.
 *
 * @param props {@link InlineErrorProps}
 *
 * @returns the error paragraph
 */
export function InlineError(props: InlineErrorProps) {
    return <p className={"text-base/6 text-red-600 sm:text-sm/6 dark:text-red-500"}>{props.children}</p>;
}
