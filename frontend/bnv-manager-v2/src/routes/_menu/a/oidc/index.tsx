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
import DialogCreateOidcClient from "src/components/dialogs/admin-create-oidc-client";
import { toast } from "react-toastify";
import { ClipboardIcon } from "@heroicons/react/16/solid";

/**
 * Props for {@link OidcProvider}
 */
export type OidcProviderProps = {};

/**
 * View to manager oidc provider
 */
export default function OidcProvider(props: OidcProviderProps) {
    const [t] = useTranslation("oidc-client");
    const [tg] = useTranslation();

    const data = Route.useLoaderData();
    const router = useRouter();

    const [openCreateProvider, setOpenCreateProvider] = React.useState(false);

    return (
        <HeadingLayout
            heading={t("heading.oidc-clients")}
            headingChildren={
                <PrimaryButton onClick={() => setOpenCreateProvider(true)}>{t("button.create-client")}</PrimaryButton>
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
                            <TableHeader>{t("label.client-secret")}</TableHeader>
                            <TableHeader className={"w-0"}>
                                <span className={"sr-only"}>{tg("accessibility.actions")}</span>
                            </TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((provider) => (
                            <TableRow key={provider.client_id}>
                                <TableCell>{provider.name}</TableCell>
                                <TableCell>
                                    <div className={"flex items-center gap-2"}>
                                        <span>{provider.client_id}</span>
                                        <Button
                                            plain={true}
                                            onClick={async () => {
                                                await navigator.clipboard.writeText(provider.client_id);
                                                toast.success(tg("toast.copied-to-clipboard"));
                                            }}
                                        >
                                            <ClipboardIcon />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className={"flex items-center gap-2"}>
                                        <span className={"max-w-[30ch] truncate"}>{provider.client_secret}</span>
                                        <Button
                                            plain={true}
                                            onClick={async () => {
                                                await navigator.clipboard.writeText(provider.client_secret);
                                                toast.success(tg("toast.copied-to-clipboard"));
                                            }}
                                        >
                                            <ClipboardIcon />
                                        </Button>
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
                                                <DropdownItem>
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
                <DialogCreateOidcClient
                    open={openCreateProvider}
                    onClose={() => setOpenCreateProvider(false)}
                    onCreate={async () => {
                        setOpenCreateProvider(false);
                        await router.invalidate({ sync: true });
                    }}
                />
            </Suspense>
        </HeadingLayout>
    );
}

export const Route = createFileRoute("/_menu/a/oidc/")({
    component: OidcProvider,
    loader: async () => await Api.admin.oidcProvider.all(),
});
