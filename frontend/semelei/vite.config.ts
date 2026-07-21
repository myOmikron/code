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
                name: "Semelei",
                short_name: "Semelei",
                description: "Vorbestellungen für die Semelei",
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
                navigateFallback: "/index.html",
                navigateFallbackDenylist: [/^\/api\//, /^\/docs\//],
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
