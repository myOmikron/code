import type React from "react";

/**
 * The properties for {@link AuthLayout}
 */
export type AuthLayoutProps = {
    /** The page content */
    children: React.ReactNode;
};

/**
 * A full-page layout for authentication screens (login, register, etc.).
 * Centers its children in a card-like surface on large screens.
 */
export function AuthLayout(props: AuthLayoutProps) {
    const { children } = props;
    return (
        <main className="flex min-h-dvh flex-col p-2">
            <div className="flex grow items-center justify-center p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
                {children}
            </div>
        </main>
    );
}
