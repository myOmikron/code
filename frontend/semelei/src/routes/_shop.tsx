import { ArrowRightEndOnRectangleIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link, Switch } from "components";
import Logo from "src/assets/logo.svg?react";
import { CartButton } from "src/components/cart-button";
import { CartProvider } from "src/context/cart";

/** The languages offered in the footer switcher */
const LANGUAGES: Array<{ code: string; label: string }> = [
    { code: "de", label: "DE" },
    { code: "en", label: "EN" },
];

/**
 * Public shop layout: header with logo + cart, footer with staff login
 *
 * @returns the layout
 */
function ShopLayout() {
    const [t, i18n] = useTranslation("shop");
    const [tg] = useTranslation();
    const [darkMode, setDarkMode] = React.useState(() => document.documentElement.classList.contains("dark"));

    const activeLang = i18n.language.startsWith("en") ? "en" : "de";

    /**
     * Persist and apply the selected color scheme.
     *
     * @param enabled whether dark mode is enabled
     */
    function changeTheme(enabled: boolean) {
        document.documentElement.classList.toggle("dark", enabled);
        document.documentElement.style.colorScheme = enabled ? "dark" : "light";
        localStorage.setItem("theme", enabled ? "dark" : "light");
        setDarkMode(enabled);
    }

    return (
        <CartProvider>
            <div className={"mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8"}>
                <header className={"flex items-center justify-between py-4"}>
                    <Link href={"/"} className={"flex items-center gap-3"}>
                        <Logo className={"size-9"} />
                        <span className={"text-lg font-semibold text-zinc-950 dark:text-white"}>
                            {tg("label.app-name")}
                        </span>
                    </Link>
                    <CartButton />
                </header>
                <main className={"flex-1 pb-12"}>
                    <Outlet />
                </main>
                <footer
                    className={
                        "mt-8 flex flex-col items-start gap-4 border-t border-zinc-950/10 py-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/10"
                    }
                >
                    <Link
                        href={"/login"}
                        className={
                            "inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                        }
                    >
                        <ArrowRightEndOnRectangleIcon className={"size-5"} />
                        {t("button.staff-login")}
                    </Link>
                    <div className={"flex items-center gap-2"}>
                        <div
                            className={
                                "inline-flex shrink-0 items-center rounded-xl border border-zinc-950/10 bg-[var(--surface-card)] p-1 dark:border-white/10"
                            }
                            role={"group"}
                            aria-label={t("accessibility.language-switcher")}
                        >
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.code}
                                    type={"button"}
                                    aria-pressed={activeLang === lang.code}
                                    onClick={() => void i18n.changeLanguage(lang.code)}
                                    className={[
                                        "min-h-11 min-w-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                                        activeLang === lang.code
                                            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                                            : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                                    ].join(" ")}
                                >
                                    {lang.label}
                                </button>
                            ))}
                        </div>
                        <div
                            className={
                                "flex min-h-13 items-center gap-2 rounded-xl border border-zinc-950/10 bg-[var(--surface-card)] px-3 dark:border-white/10"
                            }
                        >
                            {darkMode ? (
                                <MoonIcon className={"size-5 text-zinc-200"} aria-hidden={true} />
                            ) : (
                                <SunIcon className={"size-5 text-zinc-700"} aria-hidden={true} />
                            )}
                            <Switch
                                color={"dark/white"}
                                checked={darkMode}
                                onChange={changeTheme}
                                aria-label={t("accessibility.dark-mode")}
                            />
                        </div>
                    </div>
                </footer>
            </div>
        </CartProvider>
    );
}

export const Route = createFileRoute("/_shop")({
    component: ShopLayout,
});
