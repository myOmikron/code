import ReactDOM from "react-dom/client";
import "./index.css";
import { ToastContainer } from "react-toastify";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import "react-toastify/dist/ReactToastify.css";

// Import i18n to initialize it
import "src/i18n";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({
    routeTree,
    // Since 1.170.45 the router reports a render after every load, a
    // `router.invalidate()` after an edit included, and without a remembered
    // scroll position its handler takes that for a fresh navigation and goes
    // to the top. Restoration notes the position before the load and puts it
    // back after it.
    scrollRestoration: true,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    // eslint-disable-next-line
    interface Register {
        // eslint-disable-next-line
        router: typeof router;
    }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
        <ToastContainer toastClassName={"toast-message"} closeOnClick={true} />
        <RouterProvider router={router} />
    </>,
);
