import {
    Sidebar,
    SidebarBody,
    SidebarDivider,
    SidebarItem,
    SidebarLabel,
    SidebarSection,
    SidebarSpacer,
} from "components";
import { useClose } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveBoxIcon, QueueListIcon } from "@heroicons/react/24/solid";
import {
    ArrowLeftStartOnRectangleIcon,
    GlobeAltIcon,
    HomeIcon,
    RectangleStackIcon,
    UserIcon,
} from "@heroicons/react/20/solid";
import { useAccount } from "src/context/account";

/**
 * The navigation shown in the mobile slide-over.
 *
 * Its own component rather than inline JSX in the layout route, because
 * `useClose` only reaches the enclosing dialog from inside it — the layout
 * merely creates the element, it does not render within the sheet.
 *
 * @returns the sidebar
 */
export function AppSidebar() {
    const [t] = useTranslation("menu");
    const navigate = useNavigate();
    const me = useAccount();
    const loggedIn = !!me.account;

    // The sheet's open state lives in `StackedLayout` and navigating does not
    // reset it — without this the panel stays draped over the page just opened.
    const close = useClose();

    return (
        <Sidebar>
            <SidebarBody>
                <SidebarSection>
                    <SidebarItem href={"/home"} onClick={close}>
                        <HomeIcon />
                        <SidebarLabel>{t("label.home")}</SidebarLabel>
                    </SidebarItem>
                    <SidebarItem href={"/global/decks"} onClick={close}>
                        <GlobeAltIcon />
                        <SidebarLabel>{t("label.decks")}</SidebarLabel>
                    </SidebarItem>
                </SidebarSection>

                {loggedIn && (
                    <>
                        <SidebarDivider />
                        <SidebarSection>
                            <SidebarItem href={"/decks"} onClick={close}>
                                <RectangleStackIcon />
                                <SidebarLabel>{t("label.my-decks")}</SidebarLabel>
                            </SidebarItem>
                            <SidebarItem href={"/collections"} onClick={close}>
                                <ArchiveBoxIcon />
                                <SidebarLabel>{t("label.collection")}</SidebarLabel>
                            </SidebarItem>
                            <SidebarItem href={"/watch-lists"} onClick={close}>
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
                            <SidebarItem href={"/profile"} onClick={close}>
                                <UserIcon />
                                <SidebarLabel>{t("label.profile-settings")}</SidebarLabel>
                            </SidebarItem>
                            <SidebarItem
                                onClick={async () => {
                                    close();
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
                            <SidebarItem href={"/auth/login"} onClick={close}>
                                <SidebarLabel>{t("label.login")}</SidebarLabel>
                            </SidebarItem>
                            <SidebarItem href={"/auth/signup"} onClick={close}>
                                <SidebarLabel>{t("label.sign-up")}</SidebarLabel>
                            </SidebarItem>
                        </>
                    )}
                </SidebarSection>
            </SidebarBody>
        </Sidebar>
    );
}
