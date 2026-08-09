import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "src/components/route-error";
import { AccountProvider } from "src/context/account";
import { ErrorContext } from "src/context/error-context";

export const Route = createRootRoute({
    component: RootLayout,
    errorComponent: (err) => <RouteError {...err} />,
});

function RootLayout() {
    return (
        <AccountProvider>
            <ErrorContext />
            <Outlet />
        </AccountProvider>
    );
}
