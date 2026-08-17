import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Tab, TabLayout, TabMenu } from "components";

export const Route = createFileRoute("/_menu/profile/_profile")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t] = useTranslation("profile");

    // A reading width of its own: the app's chrome grows to fill a wide screen
    // for the sake of card grids, and a settings form stretched to that width
    // is a row of labels a hand's width from their inputs.
    return (
        <div className={"max-w-4xl"}>
            <TabLayout
                heading={t("heading.profile")}
                tabs={
                    <TabMenu>
                        <Tab href={"/profile/settings"}>{t("heading.settings")}</Tab>
                        <Tab href={"/profile/security"}>{t("heading.security")}</Tab>
                    </TabMenu>
                }
            >
                <Outlet />
            </TabLayout>
        </div>
    );
}
