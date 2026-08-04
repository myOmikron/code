import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import TablePagination from "src/components/table-pagination";
import { Text } from "src/components/base/text";
import { Button } from "src/components/base/button";
import { EllipsisVerticalIcon, LinkIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import React, { Suspense } from "react";
import DialogCreateClubAdmin from "src/components/dialogs/admin-create-club-admin";
import { Subheading } from "src/components/base/heading";
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
import AdminRetractInviteDialog from "src/components/dialogs/admin-retract-invite";
import AdminDeleteClubAdmin from "src/components/dialogs/admin-delete-club-admin";
import { KeyIcon } from "@heroicons/react/24/outline";
import { SimpleAccountSchema } from "src/api/generated/admin";
import AdminResetCredentialsDialog from "src/components/dialogs/admin-reset-credentials";

/**
 * Props for {@link ClubAdmins}
 */
export type ClubAdminProps = {};

/**
 * Admins of the club
 */
export function ClubAdmins(props: ClubAdminProps) {
    const [t] = useTranslation("admin-club-view");
    const [tg] = useTranslation();

    const params = Route.useParams();
    const data = Route.useLoaderData();
    const search = Route.useSearch();
    const router = useRouter();

    const [openCreateClubAdmin, setOpenCreateClubAdmin] = React.useState(false);
    const [openRetractInvite, setOpenRetractInvite] = React.useState<string>();
    const [openDeleteClubAdmin, setOpenDeleteClubAdmin] = React.useState<string>();
    const [openResetCredentials, setOpenResetCredentials] = React.useState<SimpleAccountSchema>();

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex justify-end"}>
                <Button outline={true} onClick={() => setOpenCreateClubAdmin(true)}>
                    <PlusIcon />
                    <span>{t("button.create-club-admin")}</span>
                </Button>
            </div>
            {data.invites.length > 0 && (
                <>
                    <Subheading>{t("heading.invited")}</Subheading>
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
                            {data.invites.map((item) => (
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
                </>
            )}

            <Subheading className={"mt-8"}>{t("heading.admins")}</Subheading>
            {data.admins.total > 0 ? (
                <>
                    <Table dense={true}>
                        <TableHead>
                            <TableRow>
                                <TableHeader>{t("label.username")}</TableHeader>
                                <TableHeader>{t("label.display-name")}</TableHeader>
                                <TableHeader className={"w-0"}>
                                    <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                                </TableHeader>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.admins.items.map((item) => (
                                <TableRow key={item.uuid}>
                                    <TableCell>{item.username}</TableCell>
                                    <TableCell>{item.display_name}</TableCell>
                                    <TableCell>
                                        <Dropdown>
                                            <DropdownButton plain={true}>
                                                <EllipsisVerticalIcon />
                                            </DropdownButton>
                                            <DropdownMenu anchor={"bottom end"}>
                                                <DropdownSection>
                                                    <DropdownItem onClick={() => setOpenResetCredentials(item)}>
                                                        <KeyIcon />
                                                        <DropdownLabel>{t("button.reset-credentials")}</DropdownLabel>
                                                    </DropdownItem>
                                                </DropdownSection>
                                                <DropdownSection>
                                                    <DropdownHeading>{tg("heading.danger-zone")}</DropdownHeading>
                                                    <DropdownItem onClick={() => setOpenDeleteClubAdmin(item.uuid)}>
                                                        <TrashIcon />
                                                        <DropdownLabel>{t("button.delete-admin")}</DropdownLabel>
                                                    </DropdownItem>
                                                </DropdownSection>
                                            </DropdownMenu>
                                        </Dropdown>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <TablePagination
                        href={"/a/clubs/$clubId/admins"}
                        params={params}
                        maxPages={Math.ceil(data.admins.total / LIMIT)}
                        currentPage={search.page}
                        getSearchParams={(newPage) => ({ page: newPage, search: search.search })}
                    />
                </>
            ) : (
                <Text>{t("label.no-members")}</Text>
            )}

            <Suspense>
                <DialogCreateClubAdmin
                    open={openCreateClubAdmin}
                    club={params.clubId}
                    onClose={() => setOpenCreateClubAdmin(false)}
                    onCreate={async () => {
                        setOpenCreateClubAdmin(false);
                        await router.invalidate({ sync: true });
                    }}
                />

                <AdminRetractInviteDialog
                    onClose={() => setOpenRetractInvite(undefined)}
                    open={!!openRetractInvite}
                    invite={openRetractInvite ?? ""}
                    onRetract={async () => {
                        setOpenRetractInvite(undefined);
                        await router.invalidate({ sync: true });
                    }}
                />

                <AdminDeleteClubAdmin
                    onClose={() => setOpenDeleteClubAdmin(undefined)}
                    open={!!openDeleteClubAdmin}
                    clubAdmin={openDeleteClubAdmin ?? ""}
                    onDelete={async () => {
                        setOpenDeleteClubAdmin(undefined);
                        await router.invalidate({ sync: true });
                    }}
                />

                <AdminResetCredentialsDialog
                    open={!!openResetCredentials}
                    onClose={() => setOpenResetCredentials(undefined)}
                    account={openResetCredentials ?? { uuid: "", display_name: "", username: "" }}
                />
            </Suspense>
        </div>
    );
}

const LIMIT = 20;

/**
 * Parameter for this endpoint
 */
type SearchParams = {
    /** Current page that should be displayed */
    page: number;
    /** Search for a user */
    search?: string;
};

export const Route = createFileRoute("/_menu/a/clubs/$clubId/_club/admins")({
    component: ClubAdmins,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const page = Number(search?.page ?? 1);

        return {
            page: page <= 0 ? 1 : page,
            search: search?.search as string | undefined,
        };
    },
    loaderDeps: ({ search: { page, search } }) => ({ page, search }),

    loader: async ({ params, deps }) => ({
        admins: await Api.admin.clubs.clubAdmins({
            uuid: params.clubId,
            limit: LIMIT,
            offset: (deps.page - 1) * LIMIT,
            search: deps.search,
        }),
        invites: await Api.admin.clubs.invitedClubAdmins(params.clubId),
    }),
});
