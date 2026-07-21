import {
    ArrowRightStartOnRectangleIcon,
    ClipboardDocumentListIcon,
    CubeIcon,
    KeyIcon,
    TagIcon,
    UsersIcon,
} from "@heroicons/react/20/solid";
import { Outlet, useNavigate } from "@tanstack/react-router";
import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
    Navbar,
    NavbarItem,
    NavbarLabel,
    Sidebar,
    SidebarBody,
    SidebarFooter,
    SidebarHeader,
    SidebarHeading,
    SidebarItem,
    SidebarLabel,
    SidebarLayout,
    SidebarSection,
} from "components";
import { Api } from "src/api/api";
import Logo from "src/assets/logo.svg?react";
import { LOGIN_CONTEXT } from "src/context/login";

/**
 * One flat navigation shell shared by the sales and admin routes.
 * Admin links and order insight stay visible side by side instead of
 * introducing another nested navigation layout below `/admin`.
 *
 * @returns the staff application shell
 */
export function StaffLayout() {
    const [tg] = useTranslation();
    const { me } = React.useContext(LOGIN_CONTEXT);
    const navigate = useNavigate();

    /** Log out and return to the public shop. */
    async function logout() {
        await Api.auth.logout();
        await navigate({ to: "/" });
    }

    const brand = (
        <Navbar>
            <NavbarItem href={"/"} activeOptions={{ exact: true }}>
                <Logo className={"size-6"} />
                <NavbarLabel>{tg("label.app-name")}</NavbarLabel>
            </NavbarItem>
        </Navbar>
    );

    const sidebar = (
        <Sidebar>
            <SidebarHeader>
                <SidebarSection>
                    <SidebarItem href={"/"} activeOptions={{ exact: true }}>
                        <Logo className={"size-6"} />
                        <SidebarLabel>{tg("label.app-name")}</SidebarLabel>
                    </SidebarItem>
                </SidebarSection>
            </SidebarHeader>

            <SidebarBody>
                <SidebarSection>
                    <SidebarHeading>{tg("heading.order-insight")}</SidebarHeading>
                    <SidebarItem href={"/verkauf"}>
                        <ClipboardDocumentListIcon />
                        <SidebarLabel>{tg("button.order-overview")}</SidebarLabel>
                    </SidebarItem>
                </SidebarSection>

                {me.role === "Admin" && (
                    <SidebarSection>
                        <SidebarHeading>{tg("heading.administration")}</SidebarHeading>
                        <SidebarItem href={"/admin/items"}>
                            <CubeIcon />
                            <SidebarLabel>{tg("button.items")}</SidebarLabel>
                        </SidebarItem>
                        <SidebarItem href={"/admin/categories"}>
                            <TagIcon />
                            <SidebarLabel>{tg("button.categories")}</SidebarLabel>
                        </SidebarItem>
                        <SidebarItem href={"/admin/staff"}>
                            <UsersIcon />
                            <SidebarLabel>{tg("button.staff")}</SidebarLabel>
                        </SidebarItem>
                    </SidebarSection>
                )}
            </SidebarBody>

            <SidebarFooter>
                <SidebarSection>
                    <SidebarItem href={"/verkauf/passkeys"}>
                        <KeyIcon />
                        <SidebarLabel>{tg("button.passkeys")}</SidebarLabel>
                    </SidebarItem>
                    <SidebarItem onClick={() => void logout()}>
                        <ArrowRightStartOnRectangleIcon />
                        <SidebarLabel>{tg("button.logout")}</SidebarLabel>
                    </SidebarItem>
                </SidebarSection>
            </SidebarFooter>
        </Sidebar>
    );

    return (
        <SidebarLayout navbar={brand} sidebar={sidebar}>
            <Suspense>
                <Outlet />
            </Suspense>
        </SidebarLayout>
    );
}
