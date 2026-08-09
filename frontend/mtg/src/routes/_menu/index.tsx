import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/")({
    beforeLoad: () => {
        throw redirect({ to: "/home" });
    },
});
