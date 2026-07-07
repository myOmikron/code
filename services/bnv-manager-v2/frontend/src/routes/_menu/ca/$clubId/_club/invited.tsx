import { createFileRoute, useRouter } from "@tanstack/react-router";
import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import { EllipsisVerticalIcon, LinkIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Dropdown,
    DropdownButton,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "src/components/base/dropdown";
import { toast } from "react-toastify";
import ClubAdminRetractInviteDialog from "src/components/dialogs/ca-retract-invite";

/**
 * The properties for {@link InvitedClubMembers}
 */
export type InvitedClubMembersProps = {};

/**
 * Overview over club members
 */
export default function InvitedClubMembers(props: InvitedClubMembersProps) {
    const [t] = useTranslation("ca-club-view");
    const [tg] = useTranslation();

    const data = Route.useLoaderData();
    const params = Route.useParams();
    const router = useRouter();

    const [openRetractInvite, setOpenRetractInvite] = React.useState<string>();

    return (
        <div className={"flex flex-col gap-6"}>
            <Table dense={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.username")}</TableHeader>
                        <TableHeader>{t("label.display-name")}</TableHeader>
                        <TableHeader>{t("label.expires-at")}</TableHeader>
                        <TableHeader className={"w-0"}>
                            <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                        </TableHeader>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map((item) => (
                        <TableRow key={item.uuid}>
                            <TableCell>{item.username}</TableCell>
                            <TableCell>{item.display_name}</TableCell>
                            <TableCell>{new Date(item.expires_at).toLocaleDateString("de-de")}</TableCell>
                            <TableCell>
                                <Dropdown>
                                    <DropdownButton plain={true}>
                                        <EllipsisVerticalIcon />
                                    </DropdownButton>
                                    <DropdownMenu anchor={"bottom end"}>
                                        <DropdownSection>
                                            <DropdownItem
                                                onClick={async () => {
                                                    await navigator.clipboard.writeText(item.link);
                                                    toast.success(tg("toast.copied-to-clipboard"));
                                                }}
                                            >
                                                <LinkIcon />
                                                <DropdownLabel>{t("button.copy-invite-link")}</DropdownLabel>
                                            </DropdownItem>
                                        </DropdownSection>
                                        <DropdownSection>
                                            <DropdownHeading>{tg("heading.danger-zone")}</DropdownHeading>
                                            <DropdownItem onClick={() => setOpenRetractInvite(item.uuid)}>
                                                <TrashIcon />
                                                <DropdownLabel>{t("button.retract-invite")}</DropdownLabel>
                                            </DropdownItem>
                                        </DropdownSection>
                                    </DropdownMenu>
                                </Dropdown>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Suspense>
                <ClubAdminRetractInviteDialog
                    open={!!openRetractInvite}
                    invite={openRetractInvite ?? ""}
                    club={params.clubId}
                    onClose={() => setOpenRetractInvite(undefined)}
                    onRetract={async () => {
                        setOpenRetractInvite(undefined);
                        await router.invalidate({ sync: true });
                    }}
                />
            </Suspense>
        </div>
    );
}

export const Route = createFileRoute("/_menu/ca/$clubId/_club/invited")({
    component: InvitedClubMembers,
    loader: async ({ params }) => await Api.clubAdmins.club.getInvitedMembers(params.clubId),
});
