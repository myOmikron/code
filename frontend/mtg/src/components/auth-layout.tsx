import type { ReactNode } from "react";

/**
 * The properties for {@link AuthLayout}
 */
export type AuthLayoutProps = {
    /** The steps of the page, stacked */
    children: ReactNode;
};

/**
 * The narrow column the signup and login pages stack in, centred in the page's panel
 *
 * @returns the column
 */
export function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div className={"flex h-full w-full items-center justify-center py-4 sm:py-8"}>
            <div className={"flex w-full max-w-sm flex-col gap-8"}>{children}</div>
        </div>
    );
}
