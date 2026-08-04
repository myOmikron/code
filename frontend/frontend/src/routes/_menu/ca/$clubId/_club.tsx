import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";

import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import CLUB_ADMIN_SINGLE_CLUB, { ClubAdminSingleClubProvider } from "src/context/club-admin-single-club";
import TabLayout from "src/components/base/tab-layout";
import { Tab, TabMenu } from "src/components/base/tab-menu";
import { Button } from "src/components/base/button";
import { PlusIcon } from "@heroicons/react/20/solid";
import ClubAdminCreateMemberInviteDialog from "src/components/dialogs/ca-create-member";

/**
 * The properties for {@link ClubAdminClub}
 */
export type ClubAdminClubProps = {};

/**
 * Wrapper to provider the context for the club admin view
 */
export default function ClubAdminClub(props: ClubAdminClubProps) {
    const [t] = useTranslation("ca-club-view");

    const params = Route.useParams();
    const router = useRouter();

    const [openCreateMember, setOpenCreateMember] = React.useState(false);

    return (
        <>
            <ClubAdminSingleClubProvider uuid={params.clubId}>
                <CLUB_ADMIN_SINGLE_CLUB.Consumer>
                    {(ctx) => (
                        <TabLayout
                            heading={t("heading.club", { club: ctx.data.name })}
                            headingChildren={
                                <Button outline={true} onClick={() => setOpenCreateMember(true)}>
                                    <PlusIcon />
                                    <span>{t("button.create-member")}</span>
                                </Button>
                            }
                            tabs={
                                <TabMenu>
                                    <Tab href={"/ca/$clubId/dashboard"} params={{ clubId: params.clubId }}>
                                        {t("heading.club-dashboard")}
                                    </Tab>
                                    <Tab href={"/ca/$clubId/members"} params={{ clubId: params.clubId }}>
                                        {t("heading.members")}
                                    </Tab>
                                    <Tab href={"/ca/$clubId/invited"} params={{ clubId: params.clubId }}>
                                        {t("heading.invited-members")}
                                    </Tab>
                                </TabMenu>
                            }
                        >
                            <Outlet />

                            <Suspense>
                                <ClubAdminCreateMemberInviteDialog
                                    open={openCreateMember}
                                    club={ctx.data}
                                    onClose={() => setOpenCreateMember(false)}
                                    onCreate={async () => {
                                        setOpenCreateMember(false);
                                        await router.invalidate({ sync: true });
                                    }}
                                />
                            </Suspense>
                        </TabLayout>
                    )}
                </CLUB_ADMIN_SINGLE_CLUB.Consumer>
            </ClubAdminSingleClubProvider>
        </>
    );
}

export const Route = createFileRoute("/_menu/ca/$clubId/_club")({
    component: ClubAdminClub,
});
