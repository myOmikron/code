import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/admin/")({
    beforeLoad: () => {
        throw redirect({ to: "/admin/accounts" });
    },
});
