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
const router = createRouter({ routeTree });

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
