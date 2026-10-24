import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Benchwatch frontend build config. The dashboard talks to the FastAPI
// backend over a WebSocket; the dev server proxies /ws to the backend.
export default defineConfig({
    // GitHub Pages project-site base path: the repo is JAMESBOTENG/hackaton, so
    // Pages serves the build at https://jamesboteng.github.io/hackaton/. All
    // asset references are emitted relative to this base.
    base: "/hackaton/",
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/ws": {
                target: "ws://localhost:8000",
                ws: true,
            },
            // REST endpoints (protocol list + parsed protocol) live on the backend.
            "/protocols": { target: "http://localhost:8000" },
            "/healthz": { target: "http://localhost:8000" },
        },
    },
});
