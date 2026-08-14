import ReactDOM from "react-dom/client";
import "./index.css";
import { ToastContainer } from "react-toastify";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "react-toastify/dist/ReactToastify.css";
import { registerSW } from "virtual:pwa-register";

import "src/utils/install-prompt";

// How often an app that stays open looks for a new release
const UPDATE_INTERVAL = 30 * 60 * 1000;

// Silently keep the PWA up to date (registerType: autoUpdate). Activating a new
// worker reloads the page on its own — the part that needs help is noticing
// that there is one: the browser only re-fetches the worker on a navigation,
// and a router that never leaves the document does not make any. A tablet left
// open all day would otherwise keep serving the release it started with.
registerSW({
    immediate: true,
    onRegisteredSW: (_swUrl, registration) => {
        if (registration === undefined) return;

        const check = () => void registration.update();

        setInterval(check, UPDATE_INTERVAL);
        // Coming back to the app is the moment a new release is most likely to
        // be waiting, and the cheapest one to check on.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") check();
        });
        window.addEventListener("online", check);
    },
});

// Import i18n to initialize it
import "src/i18n";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    // eslint-disable-next-line
    interface Register {
        router: typeof router;
    }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
        <ToastContainer toastClassName={"toast-message"} closeOnClick={true} />
        <RouterProvider router={router} />
    </>,
);
