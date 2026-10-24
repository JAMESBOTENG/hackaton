import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ReplayApp from "./demo/ReplayApp";
import "./index.css";

/**
 * Mode switch. The deployed demo defaults to the fully offline, browser-only
 * REPLAY dashboard (ReplayApp) which opens no WebSocket and makes no API calls.
 * The real live product flow (App — the WebSocket dashboard that talks to the
 * FastAPI backend) is preserved and reachable with ?live=1 so it is never
 * deleted.
 */
const isLive =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("live");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isLive ? <App /> : <ReplayApp />}</React.StrictMode>
);
