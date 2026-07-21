import { createRootRoute, ErrorComponentProps, Outlet } from "@tanstack/react-router";
import React from "react";
import { ErrorContext } from "src/context/error-context";
import { Button, Heading, PrimaryButton, Text } from "components";

/**
 * The root error component
 */
function ErrorComponent(props: ErrorComponentProps) {
    return (
        <div className={"flex h-screen w-full items-center justify-center"}>
            <div
                className={
                    "flex min-w-sm flex-col gap-6 rounded-lg border border-zinc-300 bg-white p-12 dark:border-zinc-800 dark:bg-zinc-900"
                }
            >
                <Heading>{props.error.toString()}</Heading>
                <Text>{props.info?.componentStack}</Text>

                <PrimaryButton className={"w-full"} onClick={() => props.reset()}>
                    Try again
                </PrimaryButton>

                <Button onClick={() => history.back()}>Back</Button>
            </div>
        </div>
    );
}

export const Route = createRootRoute({
     
    component: () => (
        <>
            <ErrorContext />
            <Outlet />
        </>
    ),
     
    errorComponent: (err) => <ErrorComponent {...err} />,
});
