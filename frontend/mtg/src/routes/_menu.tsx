import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
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
    ArrowDownTrayIcon,
    ArrowLeftStartOnRectangleIcon,
    GlobeAltIcon,
    HeartIcon,
    HomeIcon,
    RectangleStackIcon,
    QuestionMarkCircleIcon,
    UserIcon,
} from "@heroicons/react/20/solid";
import { Suspense, useState } from "react";
import { useInstall } from "src/context/install-context";
import { AppFooter } from "src/components/app-footer";
import { ShortcutHelpDialog } from "src/components/shortcut-help-dialog";
import { ShortcutHelpProvider } from "src/context/shortcut-help-context";
import { useFullscreen } from "src/utils/use-fullscreen";
import { useShortcuts } from "src/utils/use-shortcuts";

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
    const [tg] = useTranslation();
    const [td] = useTranslation("deck");
    const [tc] = useTranslation("collection");
    const [helping, setHelping] = useState(false);

    const navigate = useNavigate();

    const me = useAccount();
    const loggedIn = me.account !== null;
    const known = !me.loading;

    const install = useInstall();
    // A page that has taken the whole screen keeps it: the navbar would be a
    // strip of browser back in the middle of a game.
    const { active: fullscreen } = useFullscreen();

    // Workspaces get the whole window: the deck builder needs room for a
    // hundred cards, while the table counter divides every available
    // centimetre between its players. Reading pages stay in a bounded column.
    const path = useRouterState({ select: (state) => state.location.pathname });
    const building = /^\/decks\/[^/]+/.test(path) || /^\/game-utils(?:\/|$)/.test(path);
    const shortcuts = shortcutsFor(path, td, tc);

    useShortcuts({ "?": () => setHelping((open) => !open) }, true, true);

    return (
        <ShortcutHelpProvider value={helping}>
            <StackedLayout
                navCollapseBelow={"sm"}
                contentWidth={building ? "full" : "wide"}
                bare={fullscreen}
                footer={<AppFooter />}
                navbar={
                    <Navbar className={"max-lg:gap-2"}>
                        {/* Three tiers, because the app is used half-screen and as an installed
                        pwa far more often than full-width: from `lg` the sections carry their
                        labels, between `sm` and `lg` they shrink to icons (the labels stay for
                        screen readers and as tooltips), and only below `sm` do they move into
                        the slide-over. The labelled row waits for `lg` rather than `md` because
                        german, the longer locale, needs ~665px for it alone, and a tablet held
                        upright — an ipad mini is 768px across — has the help entry, the install
                        prompt and the avatar to fit beside it. The tighter gaps below `lg` are
                        what keeps the icon row roomy for those. */}
                        <NavbarSection className={"max-lg:gap-1 max-sm:hidden"}>
                            <NavbarItem href={"/home"} title={t("label.home")}>
                                <HomeIcon />
                                <NavbarLabel className={"max-lg:sr-only"}>{t("label.home")}</NavbarLabel>
                            </NavbarItem>
                            <NavbarItem href={"/global/decks"} title={t("label.decks")}>
                                <GlobeAltIcon />
                                <NavbarLabel className={"max-lg:sr-only"}>{t("label.decks")}</NavbarLabel>
                            </NavbarItem>
                            <NavbarItem href={"/game-utils"} title={t("label.game-utils")}>
                                <HeartIcon />
                                <NavbarLabel className={"max-lg:sr-only"}>{t("label.game-utils")}</NavbarLabel>
                            </NavbarItem>
                        </NavbarSection>
                        {known && loggedIn && (
                            <>
                                <NavbarDivider className={"max-sm:hidden"} />
                                <NavbarSection className={"max-lg:gap-1 max-sm:hidden"}>
                                    <NavbarItem href={"/decks"} title={t("label.my-decks")}>
                                        <RectangleStackIcon />
                                        <NavbarLabel className={"max-lg:sr-only"}>{t("label.my-decks")}</NavbarLabel>
                                    </NavbarItem>
                                    <NavbarItem href={"/collections"} title={t("label.collection")}>
                                        <ArchiveBoxIcon />
                                        <NavbarLabel className={"max-lg:sr-only"}>{t("label.collection")}</NavbarLabel>
                                    </NavbarItem>
                                    <NavbarItem href={"/watch-lists"} title={t("label.watch-lists")}>
                                        <QueueListIcon />
                                        <NavbarLabel className={"max-lg:sr-only"}>{t("label.watch-lists")}</NavbarLabel>
                                    </NavbarItem>
                                </NavbarSection>
                            </>
                        )}
                        <NavbarSpacer />
                        <NavbarSection>
                            <NavbarItem onClick={() => setHelping(true)} title={td("heading.shortcuts")}>
                                <QuestionMarkCircleIcon />
                                <NavbarLabel className={"sr-only"}>{td("heading.shortcuts")}</NavbarLabel>
                            </NavbarItem>
                        </NavbarSection>
                        {/* Labelled and on every width, unlike the sections next to it: the entry
                        is the only place offering the install, and an icon alone does not say
                        what it does. It disappears once the app runs from the home screen. */}
                        {install.canInstall && (
                            <NavbarSection>
                                <NavbarItem onClick={install.install} title={tg("button.install-app")}>
                                    <ArrowDownTrayIcon />
                                    <NavbarLabel className={"whitespace-nowrap"}>
                                        {tg("button.install-app")}
                                    </NavbarLabel>
                                </NavbarItem>
                            </NavbarSection>
                        )}
                        {!known ? null : loggedIn ? (
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
                                <SidebarItem href={"/game-utils"}>
                                    <HeartIcon />
                                    <SidebarLabel>{t("label.game-utils")}</SidebarLabel>
                                </SidebarItem>
                            </SidebarSection>

                            {known && loggedIn && (
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
                                <SidebarItem onClick={() => setHelping(true)}>
                                    <QuestionMarkCircleIcon />
                                    <SidebarLabel>{td("heading.shortcuts")}</SidebarLabel>
                                </SidebarItem>
                                {!known ? null : loggedIn ? (
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
            <ShortcutHelpDialog open={helping} shortcuts={shortcuts} onClose={() => setHelping(false)} />
        </ShortcutHelpProvider>
    );
}

/**
 * The shortcuts available on the current page
 *
 * @param path the pathname being looked at
 * @param t the deck namespace's translator, which names the actions
 * @param tc the collection namespace's translator, for the shelf's own pages
 *
 * @returns the rows the help dialog lists, empty for a page without shortcuts
 */
function shortcutsFor(
    path: string,
    t: (key: string, options?: Record<string, unknown>) => string,
    tc: (key: string, options?: Record<string, unknown>) => string,
) {
    if (/^\/decks\/?$/.test(path)) {
        return [
            { keys: "Ctrl/⌘ F", description: t("label.search-decks") },
            { keys: "A", description: t("button.create-deck") },
            { keys: "E", description: t("button.edit-deck") },
            { keys: "S", description: t("button.share-deck") },
            { keys: "Entf", description: t("button.delete-deck") },
            { keys: "?", description: t("heading.shortcuts") },
        ];
    }
    if (/^\/decks\/[^/]+\/cards/.test(path)) {
        return [
            { keys: "A", description: t("button.add-cards") },
            { keys: "Ctrl/⌘ F", description: t("label.search-cards") },
            { keys: "V", description: t("label.view") },
            { keys: "G", description: t("label.grouping") },
            { keys: "T", description: t("button.manage-tags") },
            { keys: "1-9", description: t("description.quick-tag") },
            { keys: "P", description: t("button.change-printing") },
            { keys: "F", description: t("button.use-foil") },
            { keys: "?", description: t("heading.shortcuts") },
        ];
    }
    if (/^\/collections\/?$/.test(path)) {
        return [
            { keys: "Enter", description: tc("button.open-collection") },
            { keys: "A", description: tc("button.create-collection") },
            { keys: "E", description: tc("button.edit-collection") },
            { keys: "S", description: tc("button.share-collection") },
            { keys: "Entf", description: tc("button.delete-collection") },
            { keys: "?", description: t("heading.shortcuts") },
        ];
    }
    if (/^\/collections\/[^/]+\/cards/.test(path)) {
        return [
            { keys: "Enter", description: tc("button.inspect-card") },
            { keys: "+ -", description: tc("description.shortcut-quantity") },
            { keys: "Entf", description: tc("button.delete-entry") },
            { keys: "A", description: tc("button.add-cards") },
            { keys: "Ctrl/⌘ F", description: tc("label.filter-cards") },
            { keys: "P", description: tc("button.change-printing") },
            { keys: "T", description: tc("button.manage-tags") },
            { keys: "V", description: tc("label.view") },
            { keys: "O", description: tc("description.shortcut-sort") },
            { keys: "E", description: tc("button.edit-collection") },
            { keys: "S", description: tc("button.share-collection") },
            { keys: "1 2 3", description: tc("description.shortcut-tabs") },
            { keys: "?", description: t("heading.shortcuts") },
        ];
    }
    return [{ keys: "?", description: t("heading.shortcuts") }];
}
