import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Benchwatch frontend build config. The dashboard talks to the FastAPI
// backend over a WebSocket; the dev server proxies /ws to the backend.
export default defineConfig({
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
