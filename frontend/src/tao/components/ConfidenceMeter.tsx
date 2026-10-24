import type { EvidenceCoverage } from "../engine/confidence";

export default function ConfidenceMeter({ coverage }: { coverage: EvidenceCoverage }) {
  return <section className="tao-coverage" aria-label={coverage.caption}>
    <div><span>Evidence coverage</span><strong>{coverage.level}</strong></div>
    <div className="tao-coverage-track" aria-hidden><i style={{ width: `${Math.min(100, coverage.ratio * 100)}%` }} /></div>
    <dl><div><dt>Answered</dt><dd>{coverage.findingsCount} / {coverage.relevantCount}</dd></div><div><dt>Explicit safety cues checked</dt><dd>{coverage.safetyCuesAnswered} / {coverage.safetyCuesTotal}</dd></div><div><dt>Top-two margin</dt><dd>{Math.round(coverage.topMargin * 100)} pts</dd></div></dl>
    <p>Coverage counts authored scenario-relevant safety screens; it is not clinical certainty.</p>
  </section>;
}
