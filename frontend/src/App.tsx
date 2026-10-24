/**
 * Benchwatch dashboard.
 *
 * A single page that opens one WebSocket to the FastAPI backend, holds the
 * session state derived from the event log (the single source of truth), and
 * renders the live rectified camera feed with zone overlays, the self-ticking
 * checklist, the live incubation timer, the alert banner and the event
 * timeline. Alerts are spoken via the browser speechSynthesis API (no extra TTS
 * service), short and rare, with duplicate debouncing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AlertBanner from "./components/AlertBanner";
import CameraView from "./components/CameraView";
import Checklist from "./components/Checklist";
import Timeline from "./components/Timeline";
import Timer from "./components/Timer";
import type {
  AlertState,
  BenchEvent,
  ProtocolView,
  ServerMessage,
  SessionStatus,
  TimerState,
} from "./types";

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  window.speechSynthesis.cancel(); // keep it snappy: drop any queued speech
  window.speechSynthesis.speak(utterance);
}

export default function App() {
  const [protocolNames, setProtocolNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [protocol, setProtocol] = useState<ProtocolView | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const [events, setEvents] = useState<BenchEvent[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [currentStepId, setCurrentStepId] = useState<number | null>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSpokenRef = useRef<string>("");
  // Tracks whether we've confirmed the start precondition for this session, so
  // the `ready` gate-open message is sent exactly once.
  const readySentRef = useRef<boolean>(false);

  // Load the available protocols on mount.
  useEffect(() => {
    fetch("/protocols")
      .then((r) => r.json())
      .then((d: { protocols: string[] }) => {
        setProtocolNames(d.protocols);
        if (d.protocols.length > 0) setSelected(d.protocols[0]);
      })
      .catch(() => setProtocolNames([]));
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "session_started":
        setProtocol(msg.protocol);
        setSessionActive(true);
        setReport(null);
        break;
      case "event":
        setEvents((prev) => [...prev, msg.event]);
        break;
      case "step_state":
        setCompleted(msg.completed);
        setCurrentStepId(msg.current_step_id);
        break;
      case "timer":
        setTimer({
          stepId: msg.step_id,
          remainingS: msg.remaining_s,
          durationS: msg.duration_s,
          warnAtS: msg.warn_at_s,
          running: msg.running,
        });
        break;
      case "alert": {
        setAlert({ text: msg.text, severity: msg.severity, at: Date.now() });
        // Debounce duplicate spoken alerts.
        if (msg.text !== lastSpokenRef.current) {
          lastSpokenRef.current = msg.text;
          speak(msg.text);
        }
        break;
      }
      case "status":
        setStatus({
          state: msg.state,
          detail: msg.detail,
          matDetected: msg.mat_detected,
          allHome: msg.all_home,
          canStart: msg.can_start,
          started: msg.started ?? false,
        });
        // Once the bench is confirmed ready (mat detected + every reagent
        // home) but the server has not yet latched the start gate, confirm
        // readiness so the first step is allowed. Sent once per session.
        if (
          msg.mat_detected &&
          msg.all_home &&
          !msg.started &&
          !readySentRef.current
        ) {
          readySentRef.current = true;
          send({ type: "ready" });
        }
        break;
      case "frame":
        setFrame(msg.jpeg_b64);
        break;
      case "report":
        setReport(msg.markdown);
        setSessionActive(false);
        break;
      case "error":
        // Surface server errors on the timeline for visibility.
        setEvents((prev) => [
          ...prev,
          {
            source: "engine",
            type: "error",
            step_id: null,
            payload: { message: msg.message },
            timestamp: Date.now() / 1000,
          },
        ]);
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return wsRef.current;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/session`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setSessionActive(false);
      wsRef.current = null;
    };
    ws.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    wsRef.current = ws;
    return ws;
  }, [handleMessage]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const send = (obj: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  const startSession = () => {
    const ws = connect();
    const begin = () => {
      setEvents([]);
      setCompleted([]);
      setCurrentStepId(null);
      setAlert(null);
      setTimer(null);
      lastSpokenRef.current = "";
      readySentRef.current = false;
      send({ type: "start_session", protocol: selected });
    };
    if (ws.readyState === WebSocket.OPEN) begin();
    else ws.addEventListener("open", begin, { once: true });
  };

  const finishSession = () => send({ type: "stop_session" });
  const calibrate = () => send({ type: "calibrate" });

  const canStart = status?.canStart ?? false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Benchwatch</h1>
          <p className="text-sm text-slate-400">
            A protocol-aware co-pilot that watches and listens at the lab bench.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={sessionActive}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          >
            {protocolNames.length === 0 && <option value="">No protocols</option>}
            {protocolNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={calibrate}
            disabled={!sessionActive}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-40"
          >
            Calibrate
          </button>
          {!sessionActive ? (
            <button
              onClick={startSession}
              disabled={!selected}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"
            >
              Start
            </button>
          ) : (
            <button
              onClick={finishSession}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium hover:bg-rose-500"
            >
              Finish
            </button>
          )}
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <AlertBanner alert={alert} />
          <CameraView
            jpegB64={frame}
            protocol={protocol}
            statusDetail={status?.detail ?? ""}
          />
          {sessionActive && !canStart && (
            <div className="rounded-lg border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Waiting for the mat to be detected and every reagent to be in its
              home zone before the first step can begin.
              {status?.detail ? ` (${status.detail})` : ""}
            </div>
          )}
          <Timer timer={timer} />
          {report && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-2 text-lg font-medium">Session report</h2>
              <pre className="whitespace-pre-wrap text-sm text-slate-300">
                {report}
              </pre>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-500">
            {connected ? "Connected" : "Disconnected"}
            {status ? ` · ${status.state}` : ""}
          </div>
          <Checklist
            protocol={protocol}
            completed={completed}
            currentStepId={currentStepId}
          />
          <div className="min-h-[16rem] flex-1">
            <Timeline events={events} />
          </div>
        </div>
      </main>
    </div>
  );
}
