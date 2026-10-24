# TAO — Clinical Reasoning Cockpit (generation 2)

TAO is a browser-only diagnostic **decision-support** demonstration. It ranks possibilities and exposes the arithmetic behind each rank; it does not diagnose or replace clinical judgment. The visible product disclaimer is permanent.

## Product contract

- Default route works with no API key, backend, microphone, or network in Chrome.
- All patients and scenarios are fictional. The three bundled scenarios are chest pain, headache, and late-twist anti-anchoring.
- `?benchwatch=1` and `?live=1` remain Benchwatch routes. Vite base remains `/hackaton/`.
- The main cockpit is optimized for a 1440×900 viewport: compact case context and controls, persistent safety watch, five leading considerations, a collapsed remaining differential, and a sticky bounded transcript.

## Honest evidence language

The deterministic scorer starts from an illustrative baseline, adds each applicable signed finding weight, reverses that sign for explicitly absent evidence, clamps at zero, and divides by the total clamped pool score. The compatibility field remains named `probability`, but every user-facing value is called **evidence alignment**, **relative evidence**, or **normalized evidence share**. Whole-number percent bars are an illustrative mental model, not calibrated medical probability or clinical risk.

Every `ScoredCondition` includes baseline, every applied signed contribution, raw score, clamped score, total pool score, and normalized share. The condition detail dialog renders the complete equation and separates Raised by from Lowered by. Identical evidence always gives identical output; no LLM or network participates.

## Differential hierarchy and safety

`ProbabilityBoard` renders the top five current leaders. `SafetyWatch` independently renders every can't-miss condition, including emergencies outside the top five. `RemainingDifferential` contains non-emergency conditions outside the leading board and is collapsed by default. Only can't-miss conditions receive a 2% minimum visual bar; a benign zero remains visually zero.

## Deterministic information gap

Every finding carries an authored clinician-ready `questionPrompt`. Answered findings are excluded. For each candidate finding among the leading conditions, the engine computes:

`Σ(i<j) p_i × p_j × |w_i − w_j|`

where `p` is current normalized evidence share and `w` is the signed authored finding weight. The highest score wins, with stable finding-id tie-breaking. The card exposes two score-contribution branches for each leader: the authored signed weight if the finding is Present and the exact reversed sign if it is Absent. Present/Absent actions write to a separate clinician-entered evidence layer.

Scripted and clinician evidence resolve deterministically by chronology. A contradictory scripted assertion delivered after an earlier manual answer becomes current for scoring and is visibly labeled `scripted · overrides clinician`; a later clinician answer becomes current and is labeled `clinician · overrides scripted`. A superseded clinician answer can be explicitly reapplied from its source-trail chip. The transcript retains the authored dialogue, and the findings rail retains the supersession trail, so contradictory claims are never silently hidden.

## Evidence coverage

Evidence coverage replaces confidence language. It is a deterministic demo heuristic over the fraction of scenario-relevant findings answered plus the fraction of scenario-relevant findings explicitly authored with `safetyCue: true` that have been checked. Safety metadata is conservative and independent of condition weights: a benign discriminator does not become a safety cue merely because a can't-miss condition uses it. It reports low/medium/high and visibly supports that label with answered count, explicit safety-cue count, and top-two evidence-share margin. It is explicitly not clinical certainty.

## Playback and transcript

`TranscriptPlayer` is presentation-agnostic deterministic code with elapsed and total time, pause/resume, 1×/2× speed, next-evidence stepping, restart, and timer disposal. Next-evidence reveals all dialogue through the next finding-bearing turn and pauses. Once no later evidence exists, it consumes any trailing dialogue, advances elapsed time and progress to 100%, and enters Complete with controls disabled. Before playback the transcript presents the case briefing; during playback it identifies itself as a scripted demo, highlights the latest turn, and shows evidence chips.

The optional Web Speech path is fully guarded and has idle/requesting/listening/error lifecycle states. Recognized speech is appended as **unreviewed, transcript-only** text and never changes ranking. This deliberately avoids silent extraction errors.

## Citations and offline behavior

Bundled citation metadata always renders. Opening external sources requires a connection. Live PubMed is progressive enhancement only: requests are cached by query, use short timeouts, never block rendering, and resolve to `[]` on every failure. No network response affects scoring or control flow.

## Accessibility and motion

The detail dialog has labelled/described relationships, Escape handling, focus containment/restoration, backdrop close, and body scroll lock. Rank changes are announced through a concise polite live region. Changed-card and microphone-recording animations use separate classes. All motion is disabled under `prefers-reduced-motion`.

## Design system

TAO uses a scoped light consulting/clinical system under `.tao-shell`: warm white and pale blue surfaces, strong navy typography, one cobalt accent, emergency red, and distinct green/purple evidence states. Thin rules, restrained elevation, compact tabular metrics, and bounded panel scrolling replace the previous vertically expanded dark dashboard. The shared HTML uses neutral fallback metadata. `frontend/src/main.tsx` assigns a local data-URI favicon and title by route before rendering: TAO for the default route, and Benchwatch for both query routes. No browser branding depends on the network.

## Source map

- Orchestration: `frontend/src/tao/TaoApp.tsx`
- Scoring: `frontend/src/tao/engine/score.ts`
- Information gap: `frontend/src/tao/engine/nextQuestion.ts`
- Coverage: `frontend/src/tao/engine/confidence.ts`
- Playback: `frontend/src/tao/engine/player.ts`
- Curated data: `frontend/src/tao/data/`
- Progressive PubMed layer: `frontend/src/tao/pubmed.ts`
- TAO-scoped visual system: `frontend/src/index.css`
