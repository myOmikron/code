import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [TanStackRouterVite(), react(), svgr(), tailwindcss()],
    resolve: {
        alias: {
            src: "/src",
        },
    },
    server: {
        allowedHosts: true,
    },
});
