import { createFileRoute, useRouter } from "@tanstack/react-router";

import React, { Suspense } from "react";
import { Api } from "src/api/api";
import { useTranslation } from "react-i18next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import { Badge } from "src/components/base/badge";
import { Button } from "src/components/base/button";
import { AtSymbolIcon, EllipsisVerticalIcon, LinkSlashIcon } from "@heroicons/react/20/solid";
import AssociateDomainDialog from "src/components/dialogs/admin-associate-domain";
import {
    Dropdown,
    DropdownButton,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "src/components/base/dropdown";
import AdminUnlinkDomainDialog from "src/components/dialogs/admin-unlink-domain";

/**
 * The properties for {@link AdminClubDomains}
 */
export type AdminClubDomainsProps = {};

/**
 * Domains for a single club
 */
export default function AdminClubDomains(props: AdminClubDomainsProps) {
    const [t] = useTranslation("admin-club-view");
    const [tg] = useTranslation();

    const params = Route.useParams();
    const { associated, unassociated } = Route.useLoaderData();
    const router = useRouter();

    const [openAssociateDomain, setOpenAssociateDomain] = React.useState(false);
    const [openUnlinkDomain, setOpenUnlinkDomain] = React.useState<string>();

    return (
        <div className={"flex flex-col gap-3"}>
            <Button outline={true} className={"self-end"} onClick={() => setOpenAssociateDomain(true)}>
                <AtSymbolIcon />
                <span>{t("button.associate-domain")}</span>
            </Button>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.domain")}</TableHeader>
                        <TableHeader className={"w-0"}>
                            <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                        </TableHeader>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {associated
                        .sort((a, b) => (a.is_primary && -1) || (b.is_primary && 1) || 0)
                        .map((item) => (
                            <TableRow key={item.uuid}>
                                <TableCell>
                                    <div className={"flex gap-12"}>
                                        <span>{item.domain}</span>
                                        {item.is_primary && <Badge color={"green"}>{t("label.primary-domain")}</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Dropdown>
                                        <DropdownButton plain={true}>
                                            <EllipsisVerticalIcon />
                                        </DropdownButton>
                                        <DropdownMenu anchor={"bottom end"}>
                                            <DropdownSection>
                                                <DropdownHeading>{tg("heading.danger-zone")}</DropdownHeading>
                                                <DropdownItem
                                                    disabled={item.is_primary}
                                                    onClick={() => setOpenUnlinkDomain(item.uuid)}
                                                >
                                                    <LinkSlashIcon />
                                                    <DropdownLabel>{t("button.unlink-domain")}</DropdownLabel>
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
                <AssociateDomainDialog
                    club_uuid={params.clubId}
                    onClose={() => setOpenAssociateDomain(false)}
                    open={openAssociateDomain}
                    unassociatedDomains={unassociated}
                    onAssociate={async () => {
                        setOpenAssociateDomain(false);
                        await router.invalidate({ sync: true });
                    }}
                />

                <AdminUnlinkDomainDialog
                    open={!!openUnlinkDomain}
                    club={params.clubId}
                    domain={openUnlinkDomain ?? ""}
                    onClose={() => setOpenUnlinkDomain(undefined)}
                    onUnlink={async () => {
                        setOpenUnlinkDomain(undefined);
                        await router.invalidate({ sync: true });
                    }}
                />
            </Suspense>
        </div>
    );
}

export const Route = createFileRoute("/_menu/a/clubs/$clubId/_club/domains")({
    component: AdminClubDomains,
    loader: async ({ params }) => ({
        associated: await Api.admin.clubs.associatedDomains(params.clubId),
        unassociated: await Api.admin.domains.unassociated(),
    }),
});
