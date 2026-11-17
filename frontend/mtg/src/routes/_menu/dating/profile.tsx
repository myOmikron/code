import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { Button, Heading, Subheading, Text, notify } from "components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DatingProfileForm } from "src/components/dating-profile-form";
import { ManaCost } from "src/components/mana-cost";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";
import { manaSymbols } from "src/utils/dating";
import { formatCurrency } from "src/utils/format";

export const Route = createFileRoute("/_menu/dating/profile")({
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
        return Api.dating.profile();
    },
    component: RouteComponent,
});

/**
 * What Commanders see of the account, and the answers that stand in for missing decks.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("dating");
    const profile = Route.useLoaderData();
    const navigate = useNavigate();

    const stats: { label: string; value: ReactNode }[] = [
        {
            label: t("label.colors"),
            value: profile.colors.length > 0 ? <ManaCost value={manaSymbols(profile.colors.join(""))} /> : "–",
        },
        { label: t("label.bracket"), value: profile.bracket != null ? profile.bracket.toFixed(1) : "–" },
        { label: t("label.budget"), value: profile.budget_eur != null ? formatCurrency(profile.budget_eur) : "–" },
        { label: t("label.salt"), value: profile.salt != null ? profile.salt.toFixed(2) : "–" },
    ];

    return (
        <RequireAccount>
            <div className={"mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6"}>
                <div className={"flex items-center gap-2"}>
                    <Button plain={true} href={"/dating"} aria-label={t("button.swipe")}>
                        <ArrowLeftIcon />
                    </Button>
                    <Heading>{t("heading.profile")}</Heading>
                </div>

                <section className={"flex flex-col gap-3"}>
                    {profile.decks > 0 && <Text>{t("description.decks", { count: profile.decks })}</Text>}
                    <dl className={"grid grid-cols-2 gap-2 sm:grid-cols-4"}>
                        {stats.map((stat) => (
                            <div
                                key={stat.label}
                                className={"rounded-(--radius-control) bg-zinc-100 p-3 dark:bg-zinc-800"}
                            >
                                <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>{stat.label}</dt>
                                <dd className={"mt-1 font-bold text-zinc-950 dark:text-white"}>{stat.value}</dd>
                            </div>
                        ))}
                    </dl>
                    {profile.themes.length > 0 && (
                        <div className={"flex flex-col gap-2"}>
                            <Subheading>{t("heading.themes")}</Subheading>
                            <div className={"flex flex-wrap gap-1.5"}>
                                {profile.themes.map((theme) => (
                                    <span
                                        key={theme.theme}
                                        className={clsx(
                                            "rounded-full px-2.5 py-1 text-sm font-semibold ring-1",
                                            theme.strength >= 0.66
                                                ? "bg-lime-400/25 text-lime-900 ring-lime-500/60 dark:text-lime-100"
                                                : "bg-zinc-100 text-zinc-700 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10",
                                        )}
                                    >
                                        {theme.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <section className={"flex flex-col gap-4"}>
                    <Subheading>{t("heading.questions")}</Subheading>
                    <DatingProfileForm
                        answers={profile.answers}
                        onSave={async (answers) => {
                            await Api.dating.answer(answers);
                            await navigate({ to: "/dating" });
                        }}
                    />
                </section>

                <section>
                    <Button
                        outline={true}
                        onClick={async () => {
                            await Api.dating.resetPasses();
                            notify.success(t("toast.passes-reset"));
                        }}
                    >
                        {t("button.reset-passes")}
                    </Button>
                </section>
            </div>
        </RequireAccount>
    );
}
