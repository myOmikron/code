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
    StackedLayout,
} from "components";
import { useTranslation } from "react-i18next";
import { useAccount } from "src/context/account.tsx";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ArchiveBoxIcon, QueueListIcon } from "@heroicons/react/24/solid";
import {
    ArrowLeftStartOnRectangleIcon,
    GlobeAltIcon,
    HomeIcon,
    RectangleStackIcon,
    UserIcon,
} from "@heroicons/react/20/solid";
import { AppSidebar } from "src/components/app-sidebar";
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
                    {/* Below `lg` these live in the slide-over instead — the navbar
                        keeps only the account control, so the avatar stays reachable
                        at the top without the sections crowding it off screen. */}
                    <NavbarSection className={"max-lg:hidden"}>
                        <NavbarItem href={"/home"}>
                            <HomeIcon />
                            <NavbarLabel>{t("label.home")}</NavbarLabel>
                        </NavbarItem>
                        <NavbarItem href={"/global/decks"}>
                            <GlobeAltIcon />
                            <NavbarLabel>{t("label.decks")}</NavbarLabel>
                        </NavbarItem>
                    </NavbarSection>
                    {loggedIn && (
                        <>
                            <NavbarDivider className={"max-lg:hidden"} />
                            <NavbarSection className={"max-lg:hidden"}>
                                <NavbarItem href={"/decks"}>
                                    <RectangleStackIcon />
                                    <NavbarLabel>{t("label.my-decks")}</NavbarLabel>
                                </NavbarItem>
                                <NavbarItem href={"/collections"}>
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
            sidebar={<AppSidebar />}
        >
            <Suspense>
                <Outlet />
            </Suspense>
        </StackedLayout>
    );
}
