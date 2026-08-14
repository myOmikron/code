import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Where the vite dev server proxies API requests to.
// The compose dev stack sets this to the webserver service.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        tanstackRouter(),
        react(),
        svgr(),
        tailwindcss(),
        VitePWA({
            // Staff tablets should silently stay current, no update prompt
            registerType: "autoUpdate",
            includeAssets: ["logo.svg", "apple-touch-icon.png"],
            // Serve a real manifest + service worker on the vite dev server too,
            // so the app is installable against the dev stack (not just the
            // built nginx image).
            devOptions: { enabled: true },
            manifest: {
                name: "Semmelei",
                short_name: "Semmelei",
                description: "Vorbestellungen für die Semmelei",
                lang: "de",
                display: "standalone",
                start_url: "/",
                theme_color: "#ffffff",
                background_color: "#ffffff",
                icons: [
                    { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
                    { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
                    {
                        src: "pwa-512x512-maskable.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                // Precache the app shell and translations only. No
                // runtimeCaching for /api — order data must never come
                // from the service worker cache (NetworkOnly).
                globPatterns: ["**/*.{js,css,html,svg,png,woff2}", "locales/**/*.json"],
                // The plugin defaults this to index.html, hence turning it off by
                // hand: it registers a route that answers every navigation out of
                // the precache, ahead of everything below, and that is what makes a
                // deploy invisible — the reload meant to pick up the new release is
                // served by the old one, and only a reload that bypasses the worker
                // entirely shows it. The rule below asks the network first instead;
                // the precached shell is still there for when there is none.
                navigateFallback: undefined,
                runtimeCaching: [
                    {
                        // The app shell. A navigation to a route nobody has opened
                        // while offline still lands on the precached index.html,
                        // which is what the router needs — it resolves the path
                        // itself.
                        urlPattern: ({ request, url }) =>
                            request.mode === "navigate" &&
                            !url.pathname.startsWith("/api/") &&
                            !url.pathname.startsWith("/docs/"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "app-shell",
                            networkTimeoutSeconds: 3,
                            cacheableResponse: { statuses: [200] },
                            expiration: { maxEntries: 32 },
                            plugins: [
                                {
                                    handlerDidError: async () =>
                                        // The precache stores it under a url carrying
                                        // its revision, hence the ignored search string.
                                        caches.match("/index.html", { ignoreSearch: true }),
                                },
                            ],
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            src: "/src",
        },
    },
    server: {
        allowedHosts: true,
        proxy: {
            "/api": apiProxyTarget,
            "/docs": apiProxyTarget,
        },
    },
});
