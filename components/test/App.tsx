import { useState } from "react";
import {
    Avatar,
    Button,
    Checkbox,
    Dropdown,
    DropdownButton,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    Navbar,
    Sidebar,
    SidebarBody,
    SidebarDivider,
    SidebarFooter,
    SidebarHeader,
    SidebarHeading,
    SidebarItem,
    SidebarLabel,
    SidebarLayout,
    SidebarSection,
} from "../lib/main";
import {
    BuildingOffice2Icon,
    BellSlashIcon,
    CogIcon,
    ChevronUpIcon,
    UserIcon,
    ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/20/solid";
import { Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

function App() {
    const [t] = useTranslation("menu");

    return (
        <div>
            <Avatar className="size-16" initials="A" />
        </div>
    );
}

export default App;
