import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { RequireAdmin } from "src/components/require-admin";

export const Route = createFileRoute("/_menu/admin")({
    component: RouteComponent,
});

/**
 * The admin dashboard, one tab per area.
 *
 * The pages below load their data themselves instead of in a loader, so the Role check
 * here runs before anything asks the admin API.
 *
 * @returns the dashboard around the current tab
 */
function RouteComponent() {
    const [t] = useTranslation("admin");

    return (
        <RequireAdmin>
            <TabLayout
                heading={t("heading.admin")}
                tabs={
                    <TabMenu>
                        <Tab href={"/admin/accounts"}>{t("heading.accounts")}</Tab>
                        <Tab href={"/admin/syncs"}>{t("heading.syncs")}</Tab>
                    </TabMenu>
                }
            >
                <Outlet />
            </TabLayout>
        </RequireAdmin>
    );
}
