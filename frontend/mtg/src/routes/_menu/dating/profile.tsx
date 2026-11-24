import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Heading, Text, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DatingProfileResponse } from "src/api/generated";
import { DatingPreferences } from "src/components/dating-preferences";
import { PrimaryButton } from "src/components/primary-button";
import { RequireAccount } from "src/components/require-account";
import i18n from "src/i18n";

export const Route = createFileRoute("/_menu/dating/profile")({
    loader: async () => {
        await i18n.loadNamespaces(["dating"]);
        return Api.dating.profile();
    },
    component: RouteComponent,
});

/**
 * What Commanders see of the account, every part of it editable.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("dating");
    const loaded = Route.useLoaderData();
    const [profile, setProfile] = useState<DatingProfileResponse>(loaded);

    return (
        <RequireAccount>
            <div className={"mx-auto flex w-full max-w-2xl flex-col gap-6 px-2 py-4 sm:p-6"}>
                <div className={"flex items-center gap-2"}>
                    <Button plain={true} href={"/dating"} aria-label={t("button.swipe")}>
                        <ArrowLeftIcon />
                    </Button>
                    <Heading className={"min-w-0 flex-1 truncate"}>{t("heading.profile")}</Heading>
                </div>

                {profile.decks > 0 && <Text>{t("description.decks", { count: profile.decks })}</Text>}

                <DatingPreferences profile={profile} onChange={setProfile} themes={true} />

                <section className={"flex flex-wrap gap-2"}>
                    <PrimaryButton href={"/dating"}>{t("button.swipe")}</PrimaryButton>
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
