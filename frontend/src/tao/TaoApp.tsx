import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPlayer, type PlayerState } from "./engine/player";
import { scoreConditions } from "./engine/score";
import { suggestNextQuestion } from "./engine/nextQuestion";
import { evidenceCoverage } from "./engine/confidence";
import { runEngineSelfCheck } from "./engine/selfcheck";
import type { ConsultationTurn } from "./data/consultation";
import { scenarios, scenariosById, defaultScenarioId, type Scenario } from "./data/scenarios";
import ProbabilityBoard from "./components/ProbabilityBoard";
import ConditionDetail from "./components/ConditionDetail";
import TranscriptPanel from "./components/TranscriptPanel";
import NextQuestion from "./components/NextQuestion";
import ConfidenceMeter from "./components/ConfidenceMeter";
import FindingsRail from "./components/FindingsRail";
import { resolveEvidence, type ManualEvidenceAnswer } from "./engine/evidence";
import CaseHeader from "./components/CaseHeader";
import PlaybackControls from "./components/PlaybackControls";
import SafetyWatch from "./components/SafetyWatch";
import RemainingDifferential from "./components/RemainingDifferential";
import Icon from "./components/Icon";

type MicState = "idle" | "requesting" | "listening" | "error";

export default function TaoApp() {
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const scenario = scenariosById[scenarioId] ?? scenariosById[defaultScenarioId];
  return <ScenarioCockpit key={scenario.id} scenario={scenario} scenarioId={scenarioId} onScenarioChange={setScenarioId} />;
}

function ScenarioCockpit({ scenario, scenarioId, onScenarioChange }: { scenario: Scenario; scenarioId: string; onScenarioChange: (id: string) => void }) {
  const player = useMemo(() => new TranscriptPlayer(scenario.consultation), [scenario]);
  const [state, setState] = useState<PlayerState>(() => player.getState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, ManualEvidenceAnswer>>({});
  const manualRevisionRef = useRef(0);
  const [micSupported, setMicSupported] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [micTurns, setMicTurns] = useState<ConsultationTurn[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { runEngineSelfCheck(); }, []);
  useEffect(() => { const unsubscribe = player.onChange(setState); return () => { unsubscribe(); player.dispose(); }; }, [player]);
  useEffect(() => { try { const w = window as any; setMicSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)); } catch { setMicSupported(false); } }, []);
  useEffect(() => () => stopRecognition(recognitionRef), []);

  const resolvedEvidence = useMemo(
    () => resolveEvidence(state.transcript, manual),
    [state.transcript.length, manual]
  );
  const findingState = resolvedEvidence.state;
  const evidenceItems = resolvedEvidence.items;

  const scored = useMemo(() => scoreConditions(findingState, scenario.conditionPool), [findingState, scenario.conditionPool]);
  const suggestion = useMemo(() => suggestNextQuestion(scored, findingState, { pool: scenario.conditionPool }), [scored, findingState, scenario.conditionPool]);
  const coverage = useMemo(() => evidenceCoverage(scored, findingState, scenario.conditionPool ?? []), [scored, findingState, scenario.conditionPool]);
  const topFive = scored.slice(0, 5);
  const topIds = new Set(topFive.map((item) => item.conditionId));
  const safety = scored.filter((item) => item.cantMiss);
  const remaining = scored.filter((item) => !item.cantMiss && !topIds.has(item.conditionId));
  const lastTurnFindings = state.lastTurn ? [...(state.lastTurn.revealsFindings ?? []), ...(state.lastTurn.negatesFindings ?? [])] : [];
  const transcript = [...state.transcript, ...micTurns];

  const answerQuestion = (findingId: string, present: boolean) => {
    manualRevisionRef.current += 1;
    setManual((current) => ({
      ...current,
      [findingId]: {
        status: present ? "present" : "absent",
        afterTurnIndex: state.nextTurnIndex,
        revision: manualRevisionRef.current,
      },
    }));
  };
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const selected = selectedId ? scored.find((item) => item.conditionId === selectedId) : undefined;
  const status = state.finished ? "complete" : !state.started ? "ready" : state.paused ? "paused" : "playing";

  const restart = () => {
    stopRecognition(recognitionRef); setMicState("idle"); setMicTurns([]); setManual({}); manualRevisionRef.current = 0; setSelectedId(null); player.restart(true);
  };
  const toggleMic = () => {
    if (micState === "listening" || micState === "requesting") { stopRecognition(recognitionRef); setMicState("idle"); return; }
    setMicState("requesting");
    startRecognition(recognitionRef, (text) => setMicTurns((turns) => [...turns, { atMs: Date.now(), speaker: "patient", text, source: "microphone", unreviewed: true }]), setMicState);
  };

  return <div className="tao-shell">
    <header className="tao-topbar"><div className="tao-brand"><div>TAO</div><span><strong>Clinical reasoning cockpit</strong><small>Transparent decision support</small></span></div><label className="tao-scenario"><span>Scenario</span><select value={scenarioId} onChange={(event) => { stopRecognition(recognitionRef); onScenarioChange(event.target.value); }} aria-label="Select consultation scenario">{scenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{micSupported && <button className={`tao-mic-button is-${micState}`} onClick={toggleMic} title="Optional transcript-only microphone"><Icon name="mic" size={16}/>{micState === "idle" ? "Mic optional" : micState}</button>}</header>
    <div className="tao-disclaimer"><strong>Illustrative model</strong><span>Decision support, not a diagnosis. Never a substitute for clinical judgment.</span></div>
    <div className="tao-workspace">
      <CaseHeader scenario={scenario} state={state} evidenceCount={evidenceItems.length}/>
      <PlaybackControls state={state} onPlayPause={() => state.started && !state.paused ? player.pause() : player.play()} onRate={() => player.setPlaybackRate(state.playbackRate === 1 ? 2 : 1)} onStep={() => player.stepToNextFinding()} onRestart={restart}/>
      <SafetyWatch items={safety} onSelect={setSelectedId}/>
      <main className="tao-main">
        <div className="tao-analysis">
          <div className="tao-insight-row"><NextQuestion suggestion={suggestion} onAnswer={answerQuestion}/><ConfidenceMeter coverage={coverage}/></div>
          <FindingsRail items={evidenceItems} onReapplyClinician={answerQuestion}/>
          <ProbabilityBoard scored={topFive} lastTurnFindings={lastTurnFindings} onSelect={setSelectedId} resetKey={scenario.id}/>
          <RemainingDifferential items={remaining} onSelect={setSelectedId}/>
        </div>
        <aside><TranscriptPanel transcript={transcript} scenario={scenario} status={status} micListening={micState === "listening"}/></aside>
      </main>
    </div>
    {selected && <ConditionDetail scored={selected} onClose={closeDetail}/>}
  </div>;
}

function startRecognition(ref: React.MutableRefObject<any>, onText: (text: string) => void, onState: (state: MicState) => void) {
  try {
    const w = window as any; const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { onState("error"); return; }
    const recognition = new Ctor(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onstart = () => onState("listening");
    recognition.onresult = (event: any) => { try { for (let i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) { const text = String(event.results[i][0]?.transcript ?? "").trim(); if (text) onText(text); } } catch { onState("error"); } };
    recognition.onerror = () => { ref.current = null; onState("error"); };
    recognition.onend = () => { ref.current = null; onState("idle"); };
    ref.current = recognition; recognition.start();
  } catch { ref.current = null; onState("error"); }
}
function stopRecognition(ref: React.MutableRefObject<any>) { try { ref.current?.stop?.(); } catch { /* optional API */ } ref.current = null; }
