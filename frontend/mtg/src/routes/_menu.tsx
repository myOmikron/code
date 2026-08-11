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
    SidebarBody,
    SidebarDivider,
    SidebarItem,
    SidebarLabel,
    SidebarSection,
    SidebarSpacer,
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
            navCollapseBelow={"sm"}
            navbar={
                <Navbar className={"max-lg:gap-2"}>
                    {/* Three tiers, because the app is used half-screen and as an installed
                        pwa far more often than full-width: from `md` the sections carry their
                        labels, between `sm` and `md` they shrink to icons (the labels stay for
                        screen readers and as tooltips), and only below `sm` do they move into
                        the slide-over. The tighter gaps below `lg` are headroom for the
                        labelled row — german, the longer locale, needs ~665px of the 768px. */}
                    <NavbarSection className={"max-lg:gap-1 max-sm:hidden"}>
                        <NavbarItem href={"/home"} title={t("label.home")}>
                            <HomeIcon />
                            <NavbarLabel className={"max-md:sr-only"}>{t("label.home")}</NavbarLabel>
                        </NavbarItem>
                        <NavbarItem href={"/global/decks"} title={t("label.decks")}>
                            <GlobeAltIcon />
                            <NavbarLabel className={"max-md:sr-only"}>{t("label.decks")}</NavbarLabel>
                        </NavbarItem>
                    </NavbarSection>
                    {loggedIn && (
                        <>
                            <NavbarDivider className={"max-sm:hidden"} />
                            <NavbarSection className={"max-lg:gap-1 max-sm:hidden"}>
                                <NavbarItem href={"/decks"} title={t("label.my-decks")}>
                                    <RectangleStackIcon />
                                    <NavbarLabel className={"max-md:sr-only"}>{t("label.my-decks")}</NavbarLabel>
                                </NavbarItem>
                                <NavbarItem href={"/collections"} title={t("label.collection")}>
                                    <ArchiveBoxIcon />
                                    <NavbarLabel className={"max-md:sr-only"}>{t("label.collection")}</NavbarLabel>
                                </NavbarItem>
                                <NavbarItem href={"/watch-lists"} title={t("label.watch-lists")}>
                                    <QueueListIcon />
                                    <NavbarLabel className={"max-md:sr-only"}>{t("label.watch-lists")}</NavbarLabel>
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
            sidebar={
                <Sidebar>
                    <SidebarBody>
                        <SidebarSection>
                            <SidebarItem href={"/home"}>
                                <HomeIcon />
                                <SidebarLabel>{t("label.home")}</SidebarLabel>
                            </SidebarItem>
                            <SidebarItem href={"/global/decks"}>
                                <GlobeAltIcon />
                                <SidebarLabel>{t("label.decks")}</SidebarLabel>
                            </SidebarItem>
                        </SidebarSection>

                        {loggedIn && (
                            <>
                                <SidebarDivider />
                                <SidebarSection>
                                    <SidebarItem href={"/decks"}>
                                        <RectangleStackIcon />
                                        <SidebarLabel>{t("label.my-decks")}</SidebarLabel>
                                    </SidebarItem>
                                    <SidebarItem href={"/collections"}>
                                        <ArchiveBoxIcon />
                                        <SidebarLabel>{t("label.collection")}</SidebarLabel>
                                    </SidebarItem>
                                    <SidebarItem href={"/watch-lists"}>
                                        <QueueListIcon />
                                        <SidebarLabel>{t("label.watch-lists")}</SidebarLabel>
                                    </SidebarItem>
                                </SidebarSection>
                            </>
                        )}

                        <SidebarSpacer />

                        <SidebarSection>
                            {loggedIn ? (
                                <>
                                    <SidebarItem href={"/profile"}>
                                        <UserIcon />
                                        <SidebarLabel>{t("label.profile-settings")}</SidebarLabel>
                                    </SidebarItem>
                                    <SidebarItem
                                        onClick={async () => {
                                            await me.logout();
                                            await navigate({ to: "/" });
                                        }}
                                    >
                                        <ArrowLeftStartOnRectangleIcon />
                                        <SidebarLabel>{t("label.logout")}</SidebarLabel>
                                    </SidebarItem>
                                </>
                            ) : (
                                <>
                                    <SidebarItem href={"/auth/login"}>
                                        <SidebarLabel>{t("label.login")}</SidebarLabel>
                                    </SidebarItem>
                                    <SidebarItem href={"/auth/signup"}>
                                        <SidebarLabel>{t("label.sign-up")}</SidebarLabel>
                                    </SidebarItem>
                                </>
                            )}
                        </SidebarSection>
                    </SidebarBody>
                </Sidebar>
            }
        >
            <Suspense>
                <Outlet />
            </Suspense>
        </StackedLayout>
    );
}
