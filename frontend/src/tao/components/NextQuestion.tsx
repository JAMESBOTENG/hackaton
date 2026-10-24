import { useState } from "react";
import type { NextQuestionSuggestion } from "../engine/nextQuestion";
import Icon from "./Icon";

interface Props { suggestion: NextQuestionSuggestion | null; onAnswer: (findingId: string, present: boolean) => void; }
const formatSigned = (weight: number) => weight === 0 ? "0.0" : `${weight > 0 ? "+" : ""}${weight.toFixed(1)}`;

export default function NextQuestion({ suggestion, onAnswer }: Props) {
  const [open, setOpen] = useState(false);
  return <section className="tao-gap" aria-label="Highest-value information gap">
    <div className="tao-gap-icon"><Icon name="question" size={19}/></div>
    <div className="tao-gap-copy"><span>Highest-value information gap</span>{suggestion ? <><h2>{suggestion.prompt}</h2><button className="tao-disclosure" onClick={() => setOpen(!open)} aria-expanded={open}>Expected score contribution · both answers <Icon name="chevron" size={14}/></button>{open && <div className="tao-impact">{suggestion.separates.map((leader) => <div key={leader.conditionId}><b>{leader.name}</b><span><small>If present</small><em className={leader.presentWeight >= 0 ? "is-positive" : "is-negative"}>{formatSigned(leader.presentWeight)}</em></span><span><small>If absent</small><em className={leader.absentWeight >= 0 ? "is-positive" : "is-negative"}>{formatSigned(leader.absentWeight)}</em></span></div>)}</div>}</> : <h2>All high-contrast findings have been answered.</h2>}</div>
    {suggestion && <div className="tao-answer-actions"><button onClick={() => onAnswer(suggestion.findingId, true)} className="is-present">Present</button><button onClick={() => onAnswer(suggestion.findingId, false)} className="is-absent">Absent</button></div>}
  </section>;
}
