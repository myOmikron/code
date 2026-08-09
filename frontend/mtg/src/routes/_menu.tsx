import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import {
    Avatar,
    Button,
    Dropdown,
    DropdownButton,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    Navbar,
    NavbarDivider,
    NavbarItem,
    NavbarLabel,
    NavbarSection,
    NavbarSpacer,
    PrimaryButton,
    Sidebar,
    StackedLayout,
} from "components";
import { useTranslation } from "react-i18next";
import { ArchiveBoxIcon, QueueListIcon } from "@heroicons/react/24/solid";
import { useAccount } from "src/context/account.tsx";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ArrowLeftStartOnRectangleIcon, HomeIcon, UserIcon } from "@heroicons/react/20/solid";
import { Suspense } from "react";

export const Route = createFileRoute("/_menu")({
    component: RouteComponent,
});

/**
 * The app chrome: top navbar on desktop, slide-out on mobile.
 *
 * Pathless, so it adds no url segment — only the sections nested under it get the chrome.
 *
 * @returns the chrome around the current section
 */
function RouteComponent() {
    const [t] = useTranslation("menu");

    const navigate = useNavigate();

    const me = useAccount();
    const loggedIn = !!me.account;

    return (
        <StackedLayout
            navbar={
                <Navbar>
                    <NavbarSection>
                        <NavbarItem href={"/home"}>
                            <HomeIcon />
                            <NavbarLabel>{t("label.home")}</NavbarLabel>
                        </NavbarItem>
                    </NavbarSection>
                    <NavbarDivider />
                    <NavbarSection>
                        <NavbarItem href={"/global/decks"}>
                            <NavbarLabel>{t("label.decks")}</NavbarLabel>
                        </NavbarItem>
                    </NavbarSection>
                    {loggedIn && (
                        <>
                            <NavbarDivider />
                            <NavbarSection>
                                <NavbarItem href={"/decks"}>
                                    <NavbarLabel>{t("label.my-decks")}</NavbarLabel>
                                </NavbarItem>
                                <NavbarItem href={"/collection"}>
                                    <ArchiveBoxIcon />
                                    <NavbarLabel>{t("label.collection")}</NavbarLabel>
                                </NavbarItem>
                                <NavbarItem href={"/watch-lists"}>
                                    <QueueListIcon />
                                    <NavbarLabel>{t("label.watch-lists")}</NavbarLabel>
                                </NavbarItem>
                            </NavbarSection>
                        </>
                    )}
                    <NavbarSpacer />
                    {loggedIn ? (
                        <NavbarSection>
                            <Dropdown>
                                <DropdownButton plain={true}>
                                    <Avatar
                                        className={"size-6"}
                                        initials={me.account?.username.substring(0, 2)}
                                        alt={`Avatar of ${me.account?.username}`}
                                    />
                                    <ChevronDownIcon className={"size-3"} />
                                </DropdownButton>
                                <DropdownMenu anchor={"bottom end"}>
                                    <DropdownItem href={"/profile"}>
                                        <UserIcon />
                                        <DropdownLabel>{t("label.profile-settings")}</DropdownLabel>
                                    </DropdownItem>
                                    <DropdownItem
                                        onClick={async () => {
                                            await me.logout();
                                            await navigate({ to: "/" });
                                        }}
                                    >
                                        <ArrowLeftStartOnRectangleIcon />
                                        <DropdownLabel>{t("label.logout")}</DropdownLabel>
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        </NavbarSection>
                    ) : (
                        <NavbarSection>
                            <Button outline={true} href={"/auth/login"}>
                                {t("label.login")}
                            </Button>
                            <PrimaryButton href={"/auth/signup"}>{t("label.sign-up")}</PrimaryButton>
                        </NavbarSection>
                    )}
                </Navbar>
            }
            sidebar={<Sidebar></Sidebar>}
        >
            <Suspense>
                <Outlet />
            </Suspense>
        </StackedLayout>
    );
}
