import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ReplayApp from "./demo/ReplayApp";
import TaoApp from "./tao/TaoApp";
import "./index.css";

/**
 * Mode switch. The deployed demo defaults to TAO — the fully offline,
 * browser-only diagnostic co-pilot (no WebSocket, no API key, no mic required).
 *
 * The Benchwatch product is preserved and reachable:
 *   • ?benchwatch=1 — the offline Benchwatch REPLAY dashboard (ReplayApp).
 *   • ?live=1       — the live Benchwatch WebSocket dashboard (App) that talks
 *                     to the FastAPI backend.
 * Neither is deleted, so Benchwatch stays intact and buildable.
 */
const params =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

const mode = params.has("live")
  ? "live"
  : params.has("benchwatch")
  ? "benchwatch"
  : "tao";

function Root() {
  if (mode === "live") return <App />;
  if (mode === "benchwatch") return <ReplayApp />;
  return <TaoApp />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
