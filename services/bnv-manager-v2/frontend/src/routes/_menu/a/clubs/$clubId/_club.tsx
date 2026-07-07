import { createFileRoute, Outlet } from "@tanstack/react-router";
import ADMIN_SINGLE_CLUB, { AdminSingleClubProvider } from "src/context/admin-single-club";
import { Tab, TabMenu } from "src/components/base/tab-menu";
import { BackButton } from "src/components/base/button";
import { useTranslation } from "react-i18next";
import TabLayout from "src/components/base/tab-layout";

/**
 * Props for {@link AdminClubLayout}
 */
export type AdminClubLayoutProps = {};

/**
 * The layout for a single club in the admin view
 */
function AdminClubLayout(props: AdminClubLayoutProps) {
    const [t] = useTranslation("admin-club-view");

    const { clubId } = Route.useParams();

    return (
        <AdminSingleClubProvider uuid={clubId}>
            <ADMIN_SINGLE_CLUB.Consumer>
                {(ctx) => (
                    <div className={"flex flex-col gap-3"}>
                        <BackButton className={"self-start"} href={"/a/clubs"}>
                            {t("button.back-to-overview")}
                        </BackButton>

                        <TabLayout
                            heading={t("heading.club", { club: ctx.data.name })}
                            tabs={
                                <TabMenu>
                                    <Tab href={"/a/clubs/$clubId/dashboard"}>{t("heading.dashboard")}</Tab>
                                    <Tab href={"/a/clubs/$clubId/members"}>{t("heading.members")}</Tab>
                                    <Tab href={"/a/clubs/$clubId/admins"}>{t("heading.admins")}</Tab>
                                    <Tab href={"/a/clubs/$clubId/domains"}>{t("heading.domains")}</Tab>
                                </TabMenu>
                            }
                        >
                            <Outlet />
                        </TabLayout>
                    </div>
                )}
            </ADMIN_SINGLE_CLUB.Consumer>
        </AdminSingleClubProvider>
    );
}

export const Route = createFileRoute("/_menu/a/clubs/$clubId/_club")({
    component: AdminClubLayout,
});
