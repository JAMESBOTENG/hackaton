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

const metadata = mode === "tao"
  ? {
      title: "TAO — Clinical Reasoning Cockpit",
      favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231e4ed8'/%3E%3Cpath d='M13 19h38v8H36v24h-8V27H13z' fill='white'/%3E%3C/svg%3E",
    }
  : {
      title: "Benchwatch — Protocol-Aware Lab Co-pilot",
      favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Cpath d='M18 14h17c10 0 16 4 16 12 0 5-3 8-7 10 5 1 8 5 8 11 0 9-7 13-18 13H18zm10 8v10h7c5 0 7-2 7-5s-2-5-7-5zm0 18v12h8c5 0 8-2 8-6s-3-6-8-6z' fill='%2338bdf8'/%3E%3C/svg%3E",
    };

document.title = metadata.title;
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement("link");
favicon.rel = "icon";
favicon.href = metadata.favicon;
if (!favicon.parentNode) document.head.appendChild(favicon);

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
