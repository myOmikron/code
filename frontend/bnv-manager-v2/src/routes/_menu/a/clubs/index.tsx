import { createFileRoute, useRouter } from "@tanstack/react-router";

import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import HeadingLayout from "src/components/base/heading-layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import { PrimaryButton } from "src/components/base/button";
import { EllipsisVerticalIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import AdminCreateClubDialog from "src/components/dialogs/admin-create-club";
import {
    Dropdown,
    DropdownButton,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "src/components/base/dropdown";
import AdminDeleteClubDialog from "src/components/dialogs/admin-delete-club";
import { Text } from "src/components/base/text";
import { ClubSchema } from "src/api/generated/admin";

/**
 * The properties for {@link AdminClubOverview}
 */
export type AdminClubOverviewProps = {};

/**
 * The overview of clubs for admins
 */
function AdminClubOverview(props: AdminClubOverviewProps) {
    const [t] = useTranslation("admin-clubs");
    const [tg] = useTranslation();

    const router = useRouter();
    const clubs = Route.useLoaderData();

    const [openCreateClub, setOpenCreateClub] = React.useState(false);
    const [openDeleteClub, setOpenDeleteClub] = React.useState<ClubSchema>();

    return (
        <HeadingLayout
            heading={t("heading.clubs-overview")}
            headingChildren={
                <PrimaryButton onClick={() => setOpenCreateClub(true)}>
                    <PlusIcon />
                    <span>{t("button.create-club")}</span>
                </PrimaryButton>
            }
        >
            {clubs.length === 0 ? (
                <Text>{t("label.no-clubs-created-yet")}</Text>
            ) : (
                <Table dense={true}>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.club-name")}</TableHeader>
                            <TableHeader className={"max-lg:hidden"}>{t("label.member-count")}</TableHeader>
                            <TableHeader className={"max-lg:hidden"}>{t("label.created-at")}</TableHeader>
                            <TableHeader className={"w-0"}>
                                <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                            </TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {clubs.map((club) => (
                            <TableRow
                                key={club.uuid}
                                href={"/a/clubs/$clubId/dashboard"}
                                params={{ clubId: club.uuid }}
                            >
                                <TableCell>{club.name}</TableCell>
                                <TableCell className={"max-lg:hidden"}>{club.member_count}</TableCell>
                                <TableCell className={"max-lg:hidden"}>
                                    {new Date(club.created_at).toLocaleDateString("de-de")}
                                </TableCell>
                                <TableCell>
                                    <Dropdown>
                                        <DropdownButton plain={true}>
                                            <EllipsisVerticalIcon />
                                        </DropdownButton>
                                        <DropdownMenu anchor={"bottom end"}>
                                            <DropdownSection>
                                                <DropdownHeading>{tg("heading.danger-zone")}</DropdownHeading>

                                                <DropdownItem onClick={() => setOpenDeleteClub(club)}>
                                                    <TrashIcon />
                                                    <DropdownLabel>{t("button.delete-club")}</DropdownLabel>
                                                </DropdownItem>
                                            </DropdownSection>
                                        </DropdownMenu>
                                    </Dropdown>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <Suspense>
                <AdminCreateClubDialog
                    open={openCreateClub}
                    onClose={() => setOpenCreateClub(false)}
                    onCreate={async () => {
                        setOpenCreateClub(false);
                        await router.invalidate({ sync: true });
                    }}
                />
                <AdminDeleteClubDialog
                    open={!!openDeleteClub}
                    club={openDeleteClub}
                    onClose={() => setOpenDeleteClub(undefined)}
                    onDelete={async () => {
                        setOpenDeleteClub(undefined);
                        await router.invalidate({ sync: false });
                    }}
                />
            </Suspense>
        </HeadingLayout>
    );
}

export const Route = createFileRoute("/_menu/a/clubs/")({
    component: AdminClubOverview,
    loader: async () => await Api.admin.clubs.getAll(),
});
