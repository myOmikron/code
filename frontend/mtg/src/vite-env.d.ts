/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The app's version from package.json, baked in by vite's `define` */
declare const __APP_VERSION__: string;
/** Runtime version for invalidating old WebGPU failures without importing ONNX on the main thread. */
declare const __SCANNER_RUNTIME_VERSION__: string;
