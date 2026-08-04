import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import TabLayout from "src/components/base/tab-layout";
import { Tab, TabMenu } from "src/components/base/tab-menu";

/**
 * Props for {@link ProfileMenu}
 */
export type ProfileMenuProps = {};

/**
 * Menu for the profile settings
 */
export default function ProfileMenu(props: ProfileMenuProps) {
    const [t] = useTranslation("profile");

    return (
        <TabLayout
            heading={t("heading.profile")}
            tabs={
                <TabMenu>
                    <Tab href={"/profile/general"}>{t("heading.general")}</Tab>
                    <Tab href={"/profile/security"}>{t("heading.security")}</Tab>
                </TabMenu>
            }
        >
            <Outlet />
        </TabLayout>
    );
}

export const Route = createFileRoute("/_menu/profile/_profile")({
    component: ProfileMenu,
});
