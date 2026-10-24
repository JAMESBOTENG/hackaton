import { useEffect, useRef } from "react";
import type { ConsultationTurn } from "../data/consultation";
import type { Scenario } from "../data/scenarios";
import { findingsById } from "../data/findings";

interface Props { transcript: ConsultationTurn[]; scenario: Scenario; status: "ready" | "playing" | "paused" | "complete"; micListening?: boolean; }
export default function TranscriptPanel({ transcript, scenario, status, micListening }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  useEffect(() => { const el = scrollRef.current; if (el && followRef.current) el.scrollTop = el.scrollHeight; }, [transcript.length]);
  return <section className="tao-transcript">
    <header><div><span>Consultation</span><h2>Case transcript</h2></div><strong className={`is-${status}`}><i />Scripted demo · {status}</strong></header>
    <div ref={scrollRef} className="tao-transcript-scroll" onScroll={(event) => { const el = event.currentTarget; followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}>
      {transcript.length === 0 ? <div className="tao-briefing"><span>Case briefing</span><h3>{scenario.complaint}</h3><p>{scenario.briefing}</p><dl><div><dt>Format</dt><dd>Scripted, deterministic</dd></div><div><dt>Preview</dt><dd>{scenario.consultation.length} dialogue turns</dd></div></dl><small>Use Play, 2×, or Next evidence to move quickly.</small></div> : transcript.map((turn, index) => <Turn key={`${turn.atMs}-${index}-${turn.source ?? "scripted"}`} turn={turn} latest={index === transcript.length - 1} />)}
    </div>
    {micListening && <footer className="tao-mic-note">Microphone text is transcript-only and remains unreviewed; it never changes scoring.</footer>}
  </section>;
}

function Turn({ turn, latest }: { turn: ConsultationTurn; latest: boolean }) {
  const chips = [...(turn.revealsFindings ?? []).map((id) => ({ id, absent: false })), ...(turn.negatesFindings ?? []).map((id) => ({ id, absent: true }))];
  return <article className={`tao-turn is-${turn.speaker} ${latest ? "is-latest" : ""}`}><div><span>{turn.speaker === "doctor" ? "Clinician" : "Patient"}</span>{turn.unreviewed && <em>Unreviewed mic</em>}</div><p>{turn.text}</p>{chips.length > 0 && <footer>{chips.map((chip) => <span key={`${chip.id}-${chip.absent}`} className={chip.absent ? "is-absent" : "is-present"}>{chip.absent ? findingsById[chip.id]?.negationLabel ?? `No ${findingsById[chip.id]?.label}` : findingsById[chip.id]?.label}</span>)}</footer>}</article>;
}
