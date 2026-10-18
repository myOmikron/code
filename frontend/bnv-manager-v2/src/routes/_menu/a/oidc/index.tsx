import { createFileRoute, useRouter } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import HeadingLayout from "src/components/base/heading-layout";
import { Button, PrimaryButton } from "src/components/base/button";
import React, { Suspense } from "react";
import { Api } from "src/api/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/base/table";
import { Text } from "src/components/base/text";
import {
    Dropdown,
    DropdownButton,
    DropdownHeading,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
} from "src/components/base/dropdown";
import { EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/20/solid";
import AdminCreateOidcClientDialog from "src/components/dialogs/admin-create-oidc-client";
import AdminDeleteOidcClientDialog from "src/components/dialogs/admin-delete-oidc-client";
import { OidcClientSchema } from "src/api/generated/admin";
import { toast } from "react-toastify";
import { ClipboardIcon } from "@heroicons/react/16/solid";

/**
 * Props for {@link OidcClients}
 */
export type OidcClientsProps = {};

/**
 * View to manage OIDC clients
 */
export default function OidcClients(props: OidcClientsProps) {
    const [t] = useTranslation("oidc-client");
    const [tg] = useTranslation();

    const data = Route.useLoaderData();
    const router = useRouter();

    const [openCreateClient, setOpenCreateClient] = React.useState(false);
    const [openDeleteClient, setOpenDeleteClient] = React.useState<OidcClientSchema>();

    return (
        <HeadingLayout
            heading={t("heading.oidc-clients")}
            headingChildren={
                <PrimaryButton onClick={() => setOpenCreateClient(true)}>{t("button.create-client")}</PrimaryButton>
            }
        >
            {data.length === 0 ? (
                <Text>{t("label.no-clients-found")}</Text>
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader>{t("label.name")}</TableHeader>
                            <TableHeader>{t("label.client-id")}</TableHeader>
                            <TableHeader>{t("label.redirect-uri")}</TableHeader>
                            <TableHeader className={"w-0"}>
                                <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                            </TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((client) => (
                            <TableRow key={client.client_id}>
                                <TableCell>{client.name}</TableCell>
                                <TableCell>
                                    <div className={"flex items-center gap-2"}>
                                        <span>{client.client_id}</span>
                                        <Button
                                            plain={true}
                                            onClick={async () => {
                                                await navigator.clipboard.writeText(client.client_id);
                                                toast.success(tg("toast.copied-to-clipboard"));
                                            }}
                                        >
                                            <ClipboardIcon />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>{client.redirect_uri}</TableCell>
                                <TableCell>
                                    <Dropdown>
                                        <DropdownButton plain={true}>
                                            <EllipsisVerticalIcon />
                                        </DropdownButton>
                                        <DropdownMenu anchor={"bottom end"}>
                                            <DropdownSection>
                                                <DropdownHeading>{tg("heading.danger-zone")}</DropdownHeading>
                                                <DropdownItem onClick={() => setOpenDeleteClient(client)}>
                                                    <TrashIcon />
                                                    <DropdownLabel>{t("button.delete-oidc-client")}</DropdownLabel>
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
                <AdminCreateOidcClientDialog
                    open={openCreateClient}
                    onClose={() => setOpenCreateClient(false)}
                    onCreate={async () => {
                        setOpenCreateClient(false);
                        await router.invalidate({ sync: true });
                    }}
                />
                <AdminDeleteOidcClientDialog
                    open={!!openDeleteClient}
                    client={openDeleteClient}
                    onClose={() => setOpenDeleteClient(undefined)}
                    onDelete={async () => {
                        setOpenDeleteClient(undefined);
                        await router.invalidate({ sync: true });
                    }}
                />
            </Suspense>
        </HeadingLayout>
    );
}

export const Route = createFileRoute("/_menu/a/oidc/")({
    component: OidcClients,
    loader: async () => await Api.admin.oidcClients.all(),
});
