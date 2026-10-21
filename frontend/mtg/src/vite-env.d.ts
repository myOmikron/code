/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The app's version from package.json, baked in by vite's `define` */
declare const __APP_VERSION__: string;
/** Runtime version for invalidating old WebGPU failures without importing ONNX on the main thread. */
declare const __SCANNER_RUNTIME_VERSION__: string;

/** The Releases the "What's new" page shows, parsed at build time by `scripts/release-notes.ts` */
declare module "virtual:release-notes" {
    const releases: Array<import("src/utils/release-notes").Release>;
    export default releases;
}
