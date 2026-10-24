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

You can read the normalization as a transparent, offline analogue of Bayesian
updating: each condition's `prior` is its baseline plausibility, each signed
finding weight behaves like a log-likelihood-ratio nudge for or against the
condition, and the final share-of-total normalization turns the accumulated
evidence into a posterior-style probability. The important part is that this is
**plain arithmetic in code, not a model** — there is no softmax, no LLM, and no
network — so the "Bayesian" framing is only a reading of the math, never a
change to it.

### Suggested next question (deterministic)

`frontend/src/tao/engine/nextQuestion.ts` adds a pure
`suggestNextQuestion(scored, state, opts?)` that recommends the single
highest-value **unasked** finding — the one that would most **separate** the
current leading conditions. It is plain arithmetic, never an LLM:

1. Take the current top-K leaders (default `DEFAULT_TOP_K = 4`) by probability.
2. For every finding not already asserted or negated, compute a **separation
   score** = the max-minus-min of each leader's `(signed finding weight × that
   leader's current probability)`. Large, opposing weights across the leaders
   score high because asking about that finding pulls them apart.
3. Pick the highest-separation finding; ties break deterministically by finding
   id (smaller id wins) so identical input yields identical output.
4. Return the finding id, a human-readable `prompt`, the `separation` value, and
   the `separates` leaders so the UI can explain *why* it is worth asking.
   Return `null` when there are fewer than two leaders or no discriminating
   finding remains.

### Confidence / certainty (deterministic)

`frontend/src/tao/engine/confidence.ts` adds a pure
`evidenceConfidence(scored, state)` that reports how much evidence has
accumulated rather than how high the top probability is. The primary signal is
the **count of asserted + negated findings**, mapped through named thresholds
(`CONFIDENCE_THRESHOLDS`: low `< 3`, medium `3–5`, high `>= 6`). A clear top-two
margin (`>= CLEAR_LEADER_MARGIN`) may promote `medium → high` but never rescues a
thin `low` state. It returns `{ findingsCount, level, topMargin, caption }`, with
`caption` of the form "based on N findings — low/medium/high confidence". The
effect: an early high probability on one or two findings deliberately reads as
**low** confidence, reinforcing "decision support, not a diagnosis".

### DEV self-check

`frontend/src/tao/engine/selfcheck.ts` exports `runEngineSelfCheck()`, a
DEV-only (`import.meta.env?.DEV`, `console.warn` on failure, never throws)
assertion of the new invariants: `suggestNextQuestion` is deterministic and
never returns an already-asked finding, and a one-finding state reads lower
confidence than a fully-played one. It is wired to run once from `TaoApp`.

## No-key design

- **Bundled curated DEMO dataset** (`frontend/src/tao/data/`): fictional patient,
  conditions, findings, and references. No real PII.
- **PubMed E-utilities as progressive enhancement** (`frontend/src/tao/pubmed.ts`):
  unauthenticated `esearch`/`esummary`, short timeout, every failure resolves to
  an empty list so the UI falls back to the bundled references. Rendering never
  blocks on the network.
- **Scripted consultation playback** (`frontend/src/tao/engine/player.ts`): a
  timed transcript drives the full demo offline with no live input. The player's
  duration is derived generically from the loaded script so any scenario runs to
  completion.
- **Optional Web Speech mic**: guarded in try/catch; a missing or blocked API
  never throws.

## Scenarios registry

`frontend/src/tao/data/scenarios.ts` exports a typed `Scenario { id, title,
description, consultation, conditionPool? }`, the list `scenarios`, a
`defaultScenarioId` (`chest_pain`), a `scenariosById` lookup, and a generic
`scenarioDurationMs(turns)`. Three scenarios ship:

- **`chest_pain`** — reuses the existing `consultation.ts` chest-pain → ACS
  script (left intact for backward compatibility).
- **`headache`** — a headache trending to migraine while the doctor probes and
  the patient denies the red-flag features, so the can't-miss subarachnoid
  hemorrhage and meningitis stay on the radar then recede. Scores against a
  headache-specific `conditionPool` (migraine, tension headache, subarachnoid
  hemorrhage, meningitis, giant cell arteritis), each with ≥2 real references.
- **`late_twist`** — an anti-anchoring case that looks like reflux early, then a
  late finding (exertional onset, radiation to the arm, diaphoresis) reshuffles
  the board toward ACS.

New conditions and findings were added to `data/conditions.ts` and
`data/findings.ts` consistent with the existing model; every
`revealsFindings` / `negatesFindings` id resolves in `findings.ts` (enforced by
`tsc -b` strict and the DEV unknown-id check).

## UI surfaces

The board column reads top-to-bottom as headline intelligence, with the
transcript in the right column:

- **Suggested next question** (`components/NextQuestion.tsx`) — renders the
  `suggestNextQuestion` result prominently with its why-explanation, updates
  live, and shows a calm null state when nothing discriminating remains.
- **Confidence / certainty meter** (`components/ConfidenceMeter.tsx`) — renders
  the `evidenceConfidence` result as "based on N findings — low/medium/high"
  with a small graphical scale colored via the semantic tokens.
- **Findings chips rail** (`components/FindingsRail.tsx`) — a live two-column
  strip of **present** (green) vs **ruled out** (muted rose) findings derived
  from the player's asserted/negated sets (plus any live-mic asserted).
- **Probability board + cards** (`components/ProbabilityBoard.tsx`,
  `ProbabilityCard.tsx`) — the cinematic live reshuffle: a hand-rolled FLIP
  reorder (no animation library), a one-shot highlight **pulse** on cards that
  changed meaningfully, a signed **delta badge**, and a brief visual **link**
  between the triggering transcript line and the moved card. The card still
  floors the bar width at `Math.max(2, prob*100)` and forces a distinct
  critical/red accent + can't-miss badge so emergencies never visually vanish.
- **Condition detail** (`components/ConditionDetail.tsx`) — the explainable
  "why" (Raised by / Lowered by) plus sources, with the live PubMed layer shown
  behind a tasteful shimmer while loading and still falling back to bundled
  references (and `[]` on any failure).
- **Scenario selector** (in `TaoApp.tsx`) — a clean header dropdown that
  switches scenarios, rebuilds the player, resets playback, and scores against
  the selected scenario's condition pool.

## Design system

A single disciplined direction, **"Boardroom Navy"**, is defined as Tailwind
design tokens in `frontend/tailwind.config.js` (documented in a top-of-file
comment) and applied consistently to every surface. It is a refined deep-navy
executive-analytics palette: calm, authoritative, data-dense but uncluttered,
with strong typographic hierarchy and restrained color.

Color **encodes meaning, never decoration**, via semantic token ramps:

- `brand` (sapphire) — the primary ranked signal / focus; the leading condition
  and near-leaders read hottest, long-shots recede into muted `ink`.
- `critical` (red) — reserved for can't-miss / emergency risk tier so it stays
  visually distinct and prominent.
- `present` (green) vs `denied` (muted rose) — asserted vs ruled-out findings.
- `ink` foundation ramp + `surface` / `hairline` / `content` semantic aliases
  for the canvas, cards, borders, and text.

Typography uses an intentional Inter + system/ui sans stack (no network
`@import` web font, offline-first), a mono stack and tabular numerals for all
numeric/probability figures, a `stat` size for headline figures, subtle
elevation (no neon glows), and short, purposeful animations — `pulse` (card
change), `shimmer` (PubMed loading), and `rise-in` (new findings/cards).
`frontend/src/index.css` applies the foundation background + text via
`@layer base`, a brand focus-visible ring, and a `prefers-reduced-motion` block
that neutralizes all animation/transition durations.

## Coexistence with Benchwatch

TAO is additive and lives entirely under `frontend/src/tao/`.
`frontend/src/main.tsx` defaults to TAO and keeps Benchwatch reachable at
`?benchwatch=1` (offline replay) and `?live=1` (live WebSocket dashboard). The
Benchwatch backend and frontend are unchanged.

## Deployment

TAO is the committed GitHub Pages artifact in `docs/`, served under the Vite base
`/hackaton/` at https://jamesboteng.github.io/hackaton/. See `docs/DEPLOY.md`.
