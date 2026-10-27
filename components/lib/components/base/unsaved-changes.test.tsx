import { createBrowserHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BlockUnsavedChanges from "./unsaved-changes";

/**
 * Render the guard inside a router
 *
 * @param condition Whether there are unsaved changes
 */
async function renderGuard(condition: boolean) {
    const rootRoute = createRootRoute({ component: () => <BlockUnsavedChanges condition={condition} /> });
    const router = createRouter({ routeTree: rootRoute, history: createBrowserHistory() });
    await act(async () => {
        render(<RouterProvider router={router} />);
        await router.load();
    });
}

/**
 * Dispatch a `beforeunload` event, like closing or reloading the tab
 *
 * @returns Whether the browser would ask before leaving
 */
function unload() {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

describe("BlockUnsavedChanges", () => {
    it("asks before closing the tab with unsaved changes", async () => {
        await renderGuard(true);
        expect(unload()).toBe(true);
    });

    it("lets the tab close without unsaved changes", async () => {
        await renderGuard(false);
        expect(unload()).toBe(false);
    });
});
