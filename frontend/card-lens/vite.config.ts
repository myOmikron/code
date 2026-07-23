import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Opt-in HTTPS for testing the live camera on a phone: getUserMedia only runs in a secure
// context, and a phone reaching the dev server over the LAN by IP is plain http (insecure). Set
// HTTPS=1 (see `pnpm dev:mobile`) to serve over TLS with the self-signed cert in .cert/ and bind
// all interfaces. The default `pnpm dev` stays http on 127.0.0.1 so the test harnesses keep working.
const useHttps = Boolean(process.env.HTTPS);
const https = useHttps
  ? { key: readFileSync(".cert/key.pem"), cert: readFileSync(".cert/cert.pem") }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: useHttps ? true : "127.0.0.1",
    port: 4173,
    https,
  },
});
