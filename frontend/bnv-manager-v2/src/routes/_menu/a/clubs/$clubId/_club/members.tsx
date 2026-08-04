import { createFileRoute } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import TablePagination from "src/components/table-pagination";
import { Text } from "src/components/base/text";
import React, { Suspense } from "react";
import { SimpleAccountSchema } from "src/api/generated/admin";
import {
    Dropdown,
    DropdownButton,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "src/components/base/dropdown";
import { EllipsisVerticalIcon } from "@heroicons/react/20/solid";
import { KeyIcon } from "@heroicons/react/24/outline";
import AdminResetCredentialsDialog from "src/components/dialogs/admin-reset-credentials";

/**
 * Props for {@link ClubMembers}
 */
export type ClubMembersProps = {};

/**
 * Members of the club
 */
export default function ClubMembers(props: ClubMembersProps) {
    const [t] = useTranslation("admin-club-view");
    const [tg] = useTranslation();

    const params = Route.useParams();
    const data = Route.useLoaderData();
    const search = Route.useSearch();

    const [openResetCredentials, setOpenResetCredentials] = React.useState<SimpleAccountSchema>();

    return (
        <>
            {data.total > 0 ? (
                <div className={"flex flex-col gap-6"}>
                    <Table>
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
                            {data.items.map((item) => (
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
                                            </DropdownMenu>
                                        </Dropdown>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <TablePagination
                        href={"/a/clubs/$clubId/members"}
                        params={params}
                        maxPages={Math.ceil(data.total / LIMIT)}
                        currentPage={search.page}
                        getSearchParams={(newPage) => ({ page: newPage, search: search.search })}
                    />

                    <Suspense>
                        <AdminResetCredentialsDialog
                            open={!!openResetCredentials}
                            onClose={() => setOpenResetCredentials(undefined)}
                            account={openResetCredentials ?? { uuid: "", display_name: "", username: "" }}
                        />
                    </Suspense>
                </div>
            ) : (
                <Text>{t("label.no-members")}</Text>
            )}
        </>
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

export const Route = createFileRoute("/_menu/a/clubs/$clubId/_club/members")({
    component: ClubMembers,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const page = Number(search?.page ?? 1);

        return {
            page: page <= 0 ? 1 : page,
            search: search?.search as string | undefined,
        };
    },
    loaderDeps: ({ search: { page, search } }) => ({ page, search }),

    loader: async ({ params, deps }) =>
        await Api.admin.clubs.clubMembers({
            uuid: params.clubId,
            limit: LIMIT,
            offset: (deps.page - 1) * LIMIT,
            search: deps.search,
        }),
});
