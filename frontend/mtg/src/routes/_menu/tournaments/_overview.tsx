import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "@heroicons/react/20/solid";
import { Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { PrimaryButton } from "src/components/primary-button";
import { useAccount } from "src/context/account";
import i18n from "src/i18n";

export const Route = createFileRoute("/_menu/tournaments/_overview")({
    loader: async () => {
        const [offered] = await Promise.all([Api.decks.formats(), i18n.loadNamespaces(["tournament", "deck"])]);
        return { formats: offered.formats };
    },
    component: RouteComponent,
});

/**
 * The frame around the lists of Tournaments: the public ones and the reader's own.
 *
 * A logged-in reader creates a Tournament from here and lands on its page.
 *
 * @returns the tabbed frame around the current list
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { account } = useAccount();

    return (
        <TabLayout
            heading={t("heading.tournaments")}
            headingChildren={
                account !== null && (
                    <PrimaryButton href={"/tournaments/create"}>
                        <PlusIcon />
                        {t("button.create-tournament")}
                    </PrimaryButton>
                )
            }
            tabs={
                <TabMenu>
                    <Tab href={"/tournaments"} activeOptions={{ exact: true }}>
                        {t("heading.public-tournaments")}
                    </Tab>
                    {account !== null && <Tab href={"/tournaments/mine"}>{t("heading.my-tournaments")}</Tab>}
                </TabMenu>
            }
        >
            <Outlet />
        </TabLayout>
    );
}
