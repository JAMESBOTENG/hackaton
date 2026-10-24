# TAO — Diagnostic Co-pilot (spec)

TAO is a live diagnostic **decision-support** co-pilot that rides along with a
real doctor-patient conversation. The clinician talks naturally; TAO transcribes
the conversation on the right of the screen and, on the left, shows a
graphically clear, continuously-updating board of the conditions the patient
might have. Clicking a condition reveals *why* it is ranked where it is and the
research sources behind it.

> ⚠️ **Decision support, not a diagnosis.** TAO surfaces possibilities and their
> supporting evidence for a clinician to weigh. It does not diagnose and never
> replaces clinical judgment. A disclaimer is visible in the UI.

## Goals

1. A doctor and patient talk; the transcript streams on the right.
2. A probability board on the left shows, graphically, the likely conditions and
   reshuffles as findings are revealed.
3. Clicking a condition shows the explainable "why" (the findings that moved it)
   plus research sources.
4. "Research on all the medical data out there, the bigger the pool the better":
   curated bundled references, augmented live by PubMed when the network allows.
5. Ship with **zero API keys**, **zero backend**, offline-capable in the browser.

## Deterministic, explainable scoring engine

The ranking is pure plain-code arithmetic in `frontend/src/tao/engine/score.ts`,
never an LLM. For each condition:

1. Start from the condition's `prior` (baseline weight).
2. Add the signed weight of every **asserted** finding the condition cares about.
3. For every explicitly **negated** (denied) finding, add the opposite-sign
   weight, so negation is symmetric and inspectable.
4. Clamp the raw score to be non-negative.
5. Normalize scores across all conditions by simple division (not softmax) so a
   condition's probability is literally its share of the total evidence weight.

The function is pure and deterministic: identical input always yields identical
output, every probability is traceable to specific findings and weights, and
can't-miss emergencies are flagged so they stay on the radar.

## No-key design

- **Bundled curated DEMO dataset** (`frontend/src/tao/data/`): fictional patient,
  conditions, findings, and references. No real PII.
- **PubMed E-utilities as progressive enhancement** (`frontend/src/tao/pubmed.ts`):
  unauthenticated `esearch`/`esummary`, short timeout, every failure resolves to
  an empty list so the UI falls back to the bundled references. Rendering never
  blocks on the network.
- **Scripted consultation playback** (`frontend/src/tao/engine/player.ts`): a
  timed transcript drives the full demo offline with no live input.
- **Optional Web Speech mic**: guarded in try/catch; a missing or blocked API
  never throws.

## Coexistence with Benchwatch

TAO is additive and lives entirely under `frontend/src/tao/`.
`frontend/src/main.tsx` defaults to TAO and keeps Benchwatch reachable at
`?benchwatch=1` (offline replay) and `?live=1` (live WebSocket dashboard). The
Benchwatch backend and frontend are unchanged.

## Deployment

TAO is the committed GitHub Pages artifact in `docs/`, served under the Vite base
`/hackaton/` at https://jamesboteng.github.io/hackaton/. See `docs/DEPLOY.md`.
