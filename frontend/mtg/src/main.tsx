import ReactDOM from "react-dom/client";
import "./index.css";
import { StrictMode } from "react";
import { ToastContainer } from "react-toastify";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "react-toastify/dist/ReactToastify.css";
import { registerSW } from "virtual:pwa-register";

// How often an app that stays open looks for a new release
const UPDATE_INTERVAL = 30 * 60 * 1000;

// Silently keep the PWA up to date (registerType: autoUpdate). Activating a new
// worker reloads the page on its own — the part that needs help is noticing
// that there is one: the browser only re-fetches the worker on a navigation,
// and a router that never leaves the document does not make any. An installed
// app left open for days would otherwise keep serving the release it started
// with until someone reloads by hand.
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

// Importing the module is what catches the browser's install offer: the event
// fires early and only once, so a listener set up inside a component misses it.
import "src/utils/install-prompt";

// Import i18n to initialize it
import "src/i18n";

import { watchSystemTheme } from "src/utils/theme";
import { watchFoilTilt } from "src/utils/foil-tilt";

// The class itself is already on `<html>` — the inline script in index.html put
// it there before the first paint. This only keeps it in step with the
// operating system afterwards, for as long as the choice is "system".
watchSystemTheme();

// Lets the foil sheen follow the phone, where there is a phone to follow and
// the setting says to. Set up here rather than in a component because it writes
// to `<html>` and has to survive every navigation.
watchFoilTilt();

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
