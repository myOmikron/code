import ReactDOM from "react-dom/client";
import "./index.css";
import { StrictMode } from "react";
import { ToastContainer } from "react-toastify";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "react-toastify/dist/ReactToastify.css";
import { registerSW } from "virtual:pwa-register";

// Silently keep the PWA up to date (registerType: autoUpdate)
registerSW({ immediate: true });

// Import i18n to initialize it
import "src/i18n";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({
    routeTree,
    // Hovering (or touching) a link runs the target's loader and pulls its code
    // chunk, so the click lands on data that is already there.
    defaultPreload: "intent",
    // How long a preloaded loader result counts as fresh. Zero would make the
    // loader run again on the actual navigation and undo the whole point; 30s
    // is long enough to cover hover-then-click and short enough that a stale
    // list is not what you land on.
    defaultPreloadStaleTime: 30_000,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    // eslint-disable-next-line
    interface Register {
        router: typeof router;
    }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ToastContainer position={"bottom-right"} toastClassName={"toast-message"} closeOnClick={true} />
        <RouterProvider router={router} />
    </StrictMode>,
);
