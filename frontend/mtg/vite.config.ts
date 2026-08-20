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

// The app's own version, baked in at build time. What the 0.x warning banner
// reads — it disappears on its own the day this turns 1.0.0.
//
// A release is a `mtg/v1.2.3` tag, and the workflow hands its semver down as
// `APP_VERSION`, so what the banner says is what was actually released. The
// `v` goes: the version is 1.2.3, the tag is what spells it with a prefix.
// Outside a release — dev server, local docker build — package.json answers,
// which is why that one stays on a 0.x number.
const { version } = JSON.parse(readFileSync("package.json", "utf-8")) as { version: string };
const appVersion = process.env.APP_VERSION?.replace(/^v/, "") || version;

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
                name: "Planarium – MTG Collection",
                short_name: "Planarium",
                description: "MTG-Karten visuell erkennen und verwalten.",
                lang: "de",
                display: "standalone",
                start_url: "/",
                theme_color: "#10110f",
                background_color: "#10110f",
                icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
            },
            workbox: {
                // Precache the app shell only. The card index (public/data), the self-hosted OCR
                // runtime (public/tesseract) and the OpenCV worker bundle (~11 MB of WASM glue)
                // are far too large to precache — they are cached on demand by the runtime rules
                // below.
                globPatterns: ["**/*.{js,css,html,svg,woff2}"],
                globIgnores: ["data/**", "tesseract/**", "**/frame-detect-worker*"],
                // The plugin defaults this to index.html, hence turning it off by hand:
                // it registers a route that answers every
                // navigation out of the precache, ahead of everything below, and that is
                // what makes a deploy invisible — the reload meant to pick up the new
                // release is served by the old one, and only a reload that bypasses the
                // worker entirely shows it. The rule below asks the network first
                // instead; the precached shell is still there for when there is none.
                navigateFallback: undefined,
                runtimeCaching: [
                    {
                        // The app shell. A navigation to a route nobody has opened while
                        // offline still lands on the precached index.html, which is what
                        // the router needs — it resolves the path itself.
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
                                        // The precache stores it under a url carrying its
                                        // revision, hence the search string being ignored.
                                        caches.match("/index.html", { ignoreSearch: true }),
                                },
                            ],
                        },
                    },
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
                            plugins: [
                                {
                                    // While these files do not exist yet (index not built, OCR
                                    // assets not set up), the SPA fallback answers their urls
                                    // with index.html and status 200 — which CacheFirst would
                                    // then serve FOREVER, long after the real file appeared.
                                    // Never cache an HTML answer for a data url.
                                    cacheWillUpdate: async ({ response }) =>
                                        response.headers.get("content-type")?.includes("text/html")
                                            ? null
                                            : response,
                                },
                            ],
                        },
                    },
                    {
                        // The OpenCV worker bundle, kept out of the precache above for its size.
                        // Content-hashed like every asset, so a hit is always valid; caching it on
                        // first camera use keeps the live scanner's frame detection working offline.
                        urlPattern: /\/assets\/frame-detect-worker-[^/]+\.js$/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "opencv-worker",
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        // Card artwork. Scryfall already sends a year of max-age, so this is
                        // not about the browser forgetting — it is about surviving a cache
                        // eviction and about the collection working offline. A printing's
                        // artwork never changes, so a hit is always valid.
                        //
                        // The entry cap is what keeps an 11k collection from filling the
                        // origin's quota; least-recently-used goes first, which is the page
                        // you are not looking at.
                        //
                        // Every card <img> asks for the artwork with `crossOrigin`, so the
                        // response always carries CORS headers and never comes back opaque.
                        // An opaque one (status 0) would be poison here: the cache ignores the
                        // request mode when it matches, so a single artwork fetched without
                        // CORS makes every later CORS request for that card fail outright with
                        // net::ERR_FAILED, permanently. Hence not storing them, and dropping
                        // the ones an earlier version of the app already stored.
                        urlPattern: /^https:\/\/cards\.scryfall\.io\/.*/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "scryfall-card-images",
                            cacheableResponse: { statuses: [200] },
                            expiration: { maxEntries: 3000, purgeOnQuotaError: true },
                            plugins: [
                                {
                                    cachedResponseWillBeUsed: async ({ cacheName, request, cachedResponse }) => {
                                        if (cachedResponse === undefined || cachedResponse.type !== "opaque") {
                                            return cachedResponse;
                                        }
                                        const cache = await caches.open(cacheName);
                                        await cache.delete(request);
                                        return undefined;
                                    },
                                },
                            ],
                        },
                    },
                    {
                        // Mana symbols. Unlike the artwork these come back with no
                        // `cache-control` at all, so without this the browser is left to
                        // guess — and there are only a few dozen of them.
                        urlPattern: /^https:\/\/svgs\.scryfall\.io\/.*/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "scryfall-symbols",
                            cacheableResponse: { statuses: [0, 200] },
                            expiration: { maxEntries: 200, purgeOnQuotaError: true },
                        },
                    },
                ],
            },
            // Do not register a service worker in development. Vite's dev-dist has no precache
            // entries, so a dev worker can intercept / and retain stale scanner chunks without
            // being able to provide an offline app shell. The production build still registers
            // the full worker above.
            devOptions: { enabled: false },
        }),
    ],
    resolve: {
        alias: {
            src: "/src",
        },
    },
    optimizeDeps: {
        // Prebundle the ~11 MB CommonJS OpenCV module once, instead of vite discovering it on the
        // dev server when the frame-detection worker first loads — that discovery transform takes
        // long enough to keep the live scanner in its fallback, and can trigger a full page reload
        // mid-scan.
        include: ["@techstark/opencv-js"],
    },
    define: {
        __APP_VERSION__: JSON.stringify(appVersion),
    },
    server: {
        allowedHosts: true,
        host: useHttps ? true : "127.0.0.1",
        https,
        proxy: {
            "/api": apiProxyTarget,
            "/docs": apiProxyTarget,
        },
        watch: {
            // The card index (thousands of shards), the index builder's caches (hundreds of
            // thousands of downloaded card images + the bulk data) and the OCR runtime would
            // each eat an inotify watch — enough to blow the kernel's watcher limit (ENOSPC)
            // the moment the index is built. None of them ever change while the dev server runs.
            ignored: ["**/public/data/**", "**/public/tesseract/**", "**/.cache/**"],
        },
    },
});
