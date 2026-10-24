import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPlayer, type PlayerState } from "./engine/player";
import { scoreConditions } from "./engine/score";
import { suggestNextQuestion } from "./engine/nextQuestion";
import { evidenceCoverage } from "./engine/confidence";
import { runEngineSelfCheck } from "./engine/selfcheck";
import type { ConsultationTurn } from "./data/consultation";
import { scenarios, scenariosById, defaultScenarioId, type Scenario } from "./data/scenarios";
import { conditions } from "./data/conditions";
import { buildInvestigationPlan } from "./engine/investigationPlan";
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
import PatientProfile from "./components/PatientProfile";
import InvestigationPlan, { InvestigationControl } from "./components/InvestigationPlan";
import { startRecognition, stopRecognition, type MicState, type SpeechRecognitionLike } from "./engine/speech";

export default function TaoApp() {
  const [scenarioId, setScenarioId] = useState(defaultScenarioId);
  const scenario = scenariosById[scenarioId] ?? scenariosById[defaultScenarioId];
  return <ScenarioCockpit key={scenario.id} scenario={scenario} scenarioId={scenarioId} onScenarioChange={setScenarioId} />;
}

function ScenarioCockpit({ scenario, scenarioId, onScenarioChange }: { scenario: Scenario; scenarioId: string; onScenarioChange: (id: string) => void }) {
  const player = useMemo(() => new TranscriptPlayer(scenario.consultation), [scenario]);
  const [state, setState] = useState<PlayerState>(() => player.getState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [manual, setManual] = useState<Record<string, ManualEvidenceAnswer>>({});
  const manualRevisionRef = useRef(0);
  const [micSupported, setMicSupported] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [micTurns, setMicTurns] = useState<ConsultationTurn[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(true);
  const elapsedRef = useRef(0);
  elapsedRef.current = state.elapsedMs;

  useEffect(() => { runEngineSelfCheck(); }, []);
  useEffect(() => { const unsubscribe = player.onChange(setState); return () => { unsubscribe(); player.dispose(); }; }, [player]);
  useEffect(() => { try { const w = window as any; setMicSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)); } catch { setMicSupported(false); } }, []);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; stopRecognition(recognitionRef); }; }, []);

  const conditionPool = scenario.conditionPool ?? conditions;
  const resolvedEvidence = useMemo(
    () => resolveEvidence(state.transcript, manual, scenario.initialEvidence),
    [state.transcript, manual, scenario.initialEvidence]
  );
  const findingState = resolvedEvidence.state;
  const evidenceItems = resolvedEvidence.items;

  const scored = useMemo(() => scoreConditions(findingState, conditionPool), [findingState, conditionPool]);
  const suggestion = useMemo(() => suggestNextQuestion(scored, findingState, { pool: conditionPool }), [scored, findingState, conditionPool]);
  const coverage = useMemo(() => evidenceCoverage(scored, findingState, conditionPool), [scored, findingState, conditionPool]);
  const investigationPlan = useMemo(() => buildInvestigationPlan(scored, conditionPool), [scored, conditionPool]);
  const allInvestigationOptions = useMemo(() => buildInvestigationPlan(scored, conditionPool, { leaderCount: scored.length }), [scored, conditionPool]);
  const topFive = scored.slice(0, 5);
  const topIds = new Set(topFive.map((item) => item.conditionId));
  const safety = scored.filter((item) => item.cantMiss);
  const remaining = scored.filter((item) => !item.cantMiss && !topIds.has(item.conditionId));
  const lastEvidenceFindings = resolvedEvidence.latestChange?.findingIds ?? [];
  const transcript = [...state.transcript, ...micTurns].sort((a, b) => a.atMs - b.atMs);

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
    stopRecognition(recognitionRef); setMicState("idle"); setMicTurns([]); setManual({}); manualRevisionRef.current = 0; setSelectedId(null); setProfileOpen(false); setPlanOpen(false); player.restart(true);
  };
  const toggleMic = () => {
    if (micState === "listening" || micState === "requesting") { stopRecognition(recognitionRef); setMicState("idle"); return; }
    setMicState("requesting");
    startRecognition(recognitionRef, activeRef, (text) => setMicTurns((turns) => [...turns, { atMs: elapsedRef.current, speaker: "patient", text, source: "microphone", unreviewed: true }]), setMicState);
  };

  return <div className="tao-shell">
    <header className="tao-topbar"><div className="tao-brand"><div>TAO</div><span><strong>Clinical reasoning cockpit</strong><small>Transparent decision support</small></span></div><label className="tao-scenario"><span>Scenario</span><select value={scenarioId} onChange={(event) => { stopRecognition(recognitionRef); onScenarioChange(event.target.value); }} aria-label="Select consultation scenario">{scenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{micSupported && <button className={`tao-mic-button is-${micState}`} onClick={toggleMic} title="Optional transcript-only microphone"><Icon name="mic" size={16}/>{micState === "idle" ? "Mic optional" : micState}</button>}</header>
    <div className="tao-disclaimer"><strong>Illustrative model</strong><span>Decision support, not a diagnosis. Never a substitute for clinical judgment.</span></div>
    <div className="tao-workspace">
      <CaseHeader scenario={scenario} state={state} evidenceCount={evidenceItems.length} onOpenProfile={() => setProfileOpen(true)}/>
      <PlaybackControls state={state} onPlayPause={() => state.started && !state.paused ? player.pause() : player.play()} onRate={() => player.setPlaybackRate(state.playbackRate === 1 ? 2 : 1)} onStep={() => player.stepToNextFinding()} onRestart={restart}/>
      <SafetyWatch items={safety} onSelect={setSelectedId}/>
      <main className="tao-main">
        <div className="tao-analysis">
          <div className="tao-insight-row"><NextQuestion suggestion={suggestion} onAnswer={answerQuestion} emptyMessage={scored[0]?.totalPoolScore === 0 ? "No positive pool score; normalized contrast is unavailable." : undefined}/><ConfidenceMeter coverage={coverage}/></div>
          <FindingsRail items={evidenceItems} onReapplyClinician={answerQuestion}/>
          <ProbabilityBoard scored={topFive} lastTurnFindings={lastEvidenceFindings} onSelect={setSelectedId} resetKey={scenario.id}/>
          <div className="tao-bottom-controls"><RemainingDifferential items={remaining} onSelect={setSelectedId}/><InvestigationControl plan={investigationPlan} onOpen={() => setPlanOpen(true)}/></div>
        </div>
        <aside><TranscriptPanel transcript={transcript} scenario={scenario} status={status} micListening={micState === "listening"}/></aside>
      </main>
    </div>
    {profileOpen && <PatientProfile scenario={scenario} onClose={() => setProfileOpen(false)}/>}
    {planOpen && <InvestigationPlan plan={investigationPlan} onClose={() => setPlanOpen(false)} onCondition={(id) => { setPlanOpen(false); setSelectedId(id); }}/>}
    {selected && <ConditionDetail scored={selected} plan={allInvestigationOptions} onClose={closeDetail}/>}
  </div>;
}
