import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Where the vite dev server proxies API requests to.
// The compose dev stack sets this to the webserver service.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

// Opt-in HTTPS for testing the live camera on a phone: getUserMedia only runs in a secure
// context, and a phone reaching the dev server over the LAN by IP is plain http (insecure). Set
// HTTPS=1 (see `pnpm dev:mobile`) to serve over TLS with the self-signed cert in .cert/ and bind
// all interfaces. The default `pnpm dev` stays http on 127.0.0.1 so the test harnesses keep working.
const useHttps = Boolean(process.env.HTTPS);
const https = useHttps ? { key: readFileSync(".cert/key.pem"), cert: readFileSync(".cert/cert.pem") } : undefined;

// https://vitejs.dev/config/
export default defineConfig({
    // tanstackRouter must come before react(): it generates routeTree.gen.ts from src/routes/.
    plugins: [
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        react(),
        svgr(),
        tailwindcss(),
        VitePWA({
            // The scanner should silently stay current, no update prompt
            registerType: "autoUpdate",
            // Nothing to generate while vitest loads this config for its unit tests
            disable: Boolean(process.env.VITEST),
            includeAssets: ["icon.svg"],
            manifest: {
                name: "CardLens – MTG Collection",
                short_name: "CardLens",
                description: "MTG-Karten visuell erkennen und verwalten.",
                lang: "de",
                display: "standalone",
                start_url: "/",
                theme_color: "#10110f",
                background_color: "#10110f",
                icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
            },
            workbox: {
                // Precache the app shell only. The card index (public/data, ~430 MB) and the
                // self-hosted OCR runtime (public/tesseract) are far too large to precache —
                // they are cached on demand by the runtime rules below.
                globPatterns: ["**/*.{js,css,html,svg,woff2}"],
                globIgnores: ["data/**", "tesseract/**"],
                navigateFallback: "/index.html",
                // Card data must never be answered from the service worker cache
                navigateFallbackDenylist: [/^\/api\//, /^\/docs\//],
                runtimeCaching: [
                    {
                        // Index entry points change with every index build — take the network
                        // when it is there, fall back to the cache when offline.
                        urlPattern: /\/data\/all-card-index\/(manifest\.json|routing\.json\.gz|names\.json\.gz)$/,
                        handler: "NetworkFirst",
                        options: { cacheName: "card-index-entry" },
                    },
                    {
                        // Set shards and the OCR runtime are content-addressed by the index
                        // version, so a hit is always valid.
                        urlPattern: /\/(data\/all-card-index|tesseract)\/.*/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "card-index-shards",
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
            // Serve a real manifest + service worker on the vite dev server too, so the app is
            // installable against the dev stack (not just the built nginx image).
            devOptions: { enabled: true, navigateFallback: "/index.html" },
        }),
    ],
    resolve: {
        alias: {
            src: "/src",
        },
    },
    server: {
        allowedHosts: true,
        host: useHttps ? true : "127.0.0.1",
        https,
        proxy: {
            "/api": apiProxyTarget,
            "/docs": apiProxyTarget,
        },
    },
});
