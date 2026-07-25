import { createFileRoute, redirect } from "@tanstack/react-router";

/** The app opens on the scanner. Scanning starts by choosing what to search (/scan), which then
 *  leads to the camera — so the root only decides the default section and holds no UI itself. */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/scan" });
  },
});
