import { createFileRoute, Outlet } from "@tanstack/react-router";

import React from "react";
import { Navbar, Sidebar, SidebarBody, SidebarHeader, SidebarHeading, SidebarItem, SidebarLabel, SidebarLayout, SidebarSection } from "components";

/**
 * The properties for {@link Menu}
 */
export type MenuProps = {};

/**
 * Menu of the alerting tool
 */
export default function Menu(props: MenuProps) {
    return (
        <SidebarLayout
            sidebar={
                <Sidebar>
                    <SidebarHeader>
                    </SidebarHeader>
                    <SidebarBody>
                        <SidebarSection>
                            <SidebarItem href="/">
                                <SidebarLabel>Dashboard</SidebarLabel>
                            </SidebarItem>
                        </SidebarSection>
                        <SidebarSection>
                            <SidebarHeading>Alerts</SidebarHeading>
                        </SidebarSection>
                        <SidebarSection>
                            <SidebarHeading>Settings</SidebarHeading>
                        </SidebarSection>
                    </SidebarBody>
                </Sidebar>
            }
            navbar={<Navbar></Navbar>}
        >
            <Outlet />
        </SidebarLayout>
    );
}

export const Route = createFileRoute("/_menu")({
    component: Menu
});
