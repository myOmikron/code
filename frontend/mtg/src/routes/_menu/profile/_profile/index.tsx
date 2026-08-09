import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/profile/_profile/")({
    beforeLoad: () => {
        throw redirect({ to: "/profile/settings" });
    },
});
