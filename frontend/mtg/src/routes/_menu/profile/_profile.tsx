import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Tab, TabLayout, TabMenu } from "components";

export const Route = createFileRoute("/_menu/profile/_profile")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t] = useTranslation("profile");

    return (
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
    );
}
