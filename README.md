# TAO + Benchwatch

This repository hosts two products that share one `frontend/` build:

- **TAO** — the browser-only clinical decision-support co-pilot and the **public demo**
  deployed to GitHub Pages (the default route). Described first, below.
- **Benchwatch** — the original protocol-aware lab-bench co-pilot (React
  frontend + FastAPI/Python backend). **Unchanged**, and documented in full
  after the TAO section.

The deployed site at **https://jamesboteng.github.io/hackaton/** serves TAO by
default. Benchwatch is still reachable from the same build via `?benchwatch=1`
(offline replay) and `?live=1` (live WebSocket dashboard).

---

# TAO — Diagnostic Co-pilot

**A compact, browser-only clinical reasoning cockpit. A deterministic scripted consultation reveals evidence while TAO continuously ranks leading considerations, keeps every can't-miss condition visible, and exposes the complete signed-weight calculation behind each evidence share. Clinicians can pause, accelerate, step to the next finding, and answer the highest-value information gap directly.**

> ⚠️ **Decision support, not a diagnosis.** TAO is a demo/educational tool that
> surfaces possibilities and their supporting evidence for a clinician to weigh.
> It does not diagnose, and it never replaces clinical judgment. A disclaimer to
> this effect is visible in the UI.

## What TAO is

As the consultation unfolds, each spoken finding (chest pain, radiation to the
arm, leg swelling, a recent long-haul flight, and so on) feeds a scoring engine
that reshuffles the evidence-alignment board in real time. Emergencies that must not be
missed stay on the radar even when another condition leads. Selecting a
condition opens a detail view with:

- the **findings that moved it** (the explainable "why", strongest first), and
- **sources** — curated references bundled with the app, augmented by live
  PubMed citations when the network allows.

## Premium clinical cockpit

TAO uses a scoped light consulting/clinical design system: warm white and pale-blue surfaces, navy typography, one cobalt accent, emergency red, and accessible green/purple evidence states. It is data-dense but calm, with thin dividers, restrained elevation, compact tabular metrics, and bounded panel scrolling designed to keep the core workflow inside a 1440×900 viewport.

The hierarchy is deliberate: five leading considerations occupy the main board, a persistent **Safety watch** always shows every can't-miss condition, and non-emergency long-tail items remain available in a collapsed **Remaining differential** drawer. Only can't-miss rows receive a minimum visible bar; benign zero scores remain zero.

## Decision-support features

Layered on top of the deterministic engine, the board column reads as headline
intelligence:

- **Highest-value information gap** — a deterministic, authored clinician-ready question chosen with pairwise leader contrast `Σ pᵢpⱼ|wᵢ-wⱼ|`. **Present** and **Absent** actions write to a separate clinician evidence layer and immediately update ranking, coverage, evidence history, and the next gap. Expected score contribution clearly exposes both branches for every leader: the authored signed weight if present and its exact sign reversal if absent.
- **Evidence coverage** — an honest low/medium/high demo heuristic based on scenario-relevant answered findings and explicitly authored `safetyCue` metadata, supported by evidence count and top-two margin. Safety cues are conservative can't-miss screens, never inferred from every feature used by an emergency condition, and the metric is explicitly not clinical certainty.
- **Visible evidence supersession** — scripted and clinician answers resolve by chronology. A later contradictory script becomes current for scoring and is labeled `scripted · overrides clinician`; a clinician answer entered afterward becomes current and is labeled `clinician · overrides scripted`. A superseded clinician answer can be explicitly reapplied from the source-trail chip. The transcript and source trail remain visible, so disagreement is never silently discarded.
- **Multiple scenarios** — a clean scenario selector in the header switches
  between three scripted consultations: **chest pain → ACS**, **headache →
  migraine vs. subarachnoid hemorrhage** (the can't-miss red flag stays on the
  radar then recedes as it is denied), and a **late-twist anti-anchoring** case
  where a late finding dramatically reshuffles the board. Switching a scenario
  rebuilds the player, resets playback, and scores against that scenario's
  condition pool.
- **Findings chips rail** — a live strip that fills in as the consultation
  streams, splitting findings into **present** (green) and **ruled out** (muted
  rose) so the accumulated evidence is legible at a glance.
- **Cinematic live reshuffle** — the board animates with a smooth hand-rolled
  FLIP reorder (no animation library), a brief highlight **pulse** on cards that
  changed meaningfully, a signed **delta badge** (e.g. "▲ +12%" / "▼ -8%"), and a
  brief visual **link** between the triggering transcript line on the right and
  the card that moved on the left. All motion respects `prefers-reduced-motion`.

## How to run

```bash
cd frontend
npm install
npm run dev     # local dev server; the default route is TAO
npm run build   # production build into frontend/dist/ (base /hackaton/)
```

Routes (all served by the same build):

| URL / flag        | App                                                        |
| ----------------- | ---------------------------------------------------------- |
| *(default)*       | **TAO** diagnostic co-pilot (offline, no key, no backend)  |
| `?benchwatch=1`   | Benchwatch offline **replay** dashboard                    |
| `?live=1`         | Benchwatch **live** WebSocket dashboard (needs the backend)|

## No-key, no-backend design

TAO is built to demo flawlessly with **zero API keys, zero backend, zero
microphone, fully offline in Chrome**:

- **Bundled curated DEMO medical dataset** — fictional patient, conditions,
  findings and references live in `frontend/src/tao/data/` (no real PII).
- **Deterministic, explainable scoring engine** — `frontend/src/tao/engine/`
  is pure arithmetic, not an LLM. Each condition starts from a prior, adds the
  signed weight of every asserted finding, applies the opposite sign for denied
  findings, clamps to non-negative, and normalizes to an **illustrative evidence
  share**. The compatibility field is named `probability`, but the UI never
  presents it as calibrated medical probability or risk. Identical input always
  yields identical output, and every share is traceable to the baseline, signed
  findings, raw/clamped score, pool total, and final equation.
- **PubMed E-utilities as progressive enhancement** — `frontend/src/tao/pubmed.ts`
  layers a few live PubMed citations on top of the bundled references using the
  public NCBI `esearch`/`esummary` endpoints with **no API key**. Every call is
  wrapped so any failure (offline, CORS, timeout, rate-limit) resolves to an
  empty list and the UI falls back to the **bundled references**. Rendering
  never blocks on the network.
- **Scripted consultation playback** — `frontend/src/tao/engine/player.ts`
  runs the bundled consultation with pause/resume, 1×/2× speed, next-evidence
  stepping, restart, progress, and clean timer disposal.
- **Optional Web Speech mic** — live microphone transcription is strictly
  optional and fully guarded. Recognized text is labeled **unreviewed** and is
  transcript-only; it never silently changes the evidence score.

## Demo scenarios

Three scripted, fictional (PII-free) consultations are selectable from the
header, each demonstrating a different strength of the board:

- **Chest pain → ACS** — "Alex Rivera" (58) presents with chest pain over
  roughly a two-minute consultation. Undifferentiated exertional chest pain with
  risk factors puts acute coronary syndrome and stable angina ahead while
  can't-miss emergencies stay visible; radiation to the arm, sweating, nausea
  and breathlessness pull acute coronary syndrome clearly ahead; then
  pulmonary-embolism features (leg swelling, a recent flight) are explored, the
  board narrows, and reflux is explicitly ruled out.
- **Headache → migraine vs. subarachnoid hemorrhage** — a headache trending
  toward migraine while the doctor explicitly probes the red-flag features
  (thunderclap onset, worst-headache-of-life, neck stiffness, fever). As the
  patient denies them, the can't-miss subarachnoid hemorrhage and meningitis
  stay on the radar and then recede — showing safe exclusion, not anchoring.
- **Late-twist (anti-anchoring)** — an early picture that looks like reflux
  (burning retrosternal pain, worse after meals) that a **late** finding
  (exertional onset, radiation to the arm, diaphoresis) dramatically reshuffles
  toward acute coronary syndrome, demonstrating that TAO does not anchor on the
  first impression.

Throughout any scenario, the bounded transcript updates alongside the top-five evidence board, persistent Safety watch, interactive information gap, Evidence coverage meter, and findings history. Clicking a condition opens its complete live score equation plus bundled and optional live sources.

## How TAO coexists with Benchwatch

TAO is additive. All TAO code lives under `frontend/src/tao/`, and
`frontend/src/main.tsx` is a small mode switch that defaults to TAO while
keeping Benchwatch reachable at `?benchwatch=1` and `?live=1`. **Nothing in
Benchwatch was removed or altered**: the Benchwatch backend (`backend/`), its
live dashboard and its offline replay all remain intact and buildable. The
sections below document Benchwatch unchanged.

---

# Benchwatch

**A protocol-aware co-pilot that watches and listens at the lab bench, catches
mistakes as they happen, and writes the experiment record automatically.**

Voice lab assistants have existed since 2019 and never took off, because they
made scientists talk to a machine. Benchwatch flips that. It watches the bench,
follows along with the protocol, and only speaks up when something is about to
go wrong. When you are done, your methods section is already written.

## Why

Wet-lab work is long chains of manual steps where one silent error (a skipped
wash, reagents added in the wrong order, an incubation that ran ten minutes
long) can ruin days of work. Nobody notices until the result looks wrong, and by
then nobody can say what happened. Existing voice assistants focus on dictation
and commands; none of them watch what the scientist is physically doing and
compare it against the protocol.

## How it works

A camera mounted above the bench watches a printed mat with labeled zones and
corner ArUco markers. Each reagent bottle has a distinct colored cap and a home
zone; a clear sample tube sits in the target zone. Benchwatch tracks which
bottle leaves its home zone and moves over the target zone and treats that as
"reagent X was added." A microphone transcribes whatever the scientist says
naturally, with no wake words. A deterministic protocol engine tracks which step
you are on, checks off matching actions, warns the moment you reach for the
wrong bottle, and owns all the timers. An LLM is used only for language:
interpreting casual remarks, resolving spoken corrections, and writing the final
report.

## Architecture

Four services communicate through a single FastAPI backend over WebSockets.

```
   camera ─▶ vision service ─┐
                             │  events (bottle_lifted / bottle_over_target / bottle_returned)
   mic ───▶ audio service ──┼──▶  PROTOCOL ENGINE (deterministic state machine)
                             │        │ owns all timers
                             │        │ emits step_completed / deviation /
                             │        │        timer_warning / timer_overrun
   LLM (Anthropic) ◀────────┘        ▼
   classify speech / write report   SESSION LOG (JSON, single source of truth)
                                        │
                                        ▼
                             FastAPI + WebSocket  ◀──▶  React dashboard
                                                        (feed + overlays, checklist,
                                                         timer, alert banner, timeline,
                                                         speechSynthesis alerts)
```

- **Vision** (`backend/app/vision.py`) — OpenCV ArUco mat detection +
  rectification + per-zone HSV color detection. Emits `bottle_lifted`,
  `bottle_over_target`, `bottle_returned`. Device behind an injectable interface.
- **Audio** (`backend/app/audio.py`) — local faster-whisper transcription (runs
  offline so it does not depend on venue wifi). Emits transcript segments.
- **Engine** (`backend/app/engine.py`) — deterministic plain-code state machine.
  Consumes events, matches them to steps, owns timers, emits deviations and
  timer warnings. The LLM never drives matching, ordering or timers.
- **Language layer** (`backend/app/llm.py`) — Anthropic SDK to classify free
  speech and write the report, with a deterministic canned fallback.
- **Report** (`backend/app/report.py`) — methods section + deviation report from
  the event log, exported as Markdown.
- **Server** (`backend/app/server.py`) — FastAPI app wiring all services over
  WebSockets.
- **Frontend** (`frontend/src/`) — React + Vite + Tailwind dashboard.

> The `backend/app/events.py` model and `backend/app/protocol.py` loader plus
> the demo protocol are the foundational pieces shipped in the scaffold. The
> vision, audio, engine, llm, report and server modules are implemented in later
> features.

## Setup

Requirements: Python 3.11 and Node 18+ (Node 22 recommended).

### Backend

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

> We use `opencv-contrib-python-headless` so the ArUco module is available with
> no display/GL libraries required. This base install is fully **headless** and
> is all the core vision + engine + server flow needs.

#### Optional: MediaPipe Hands

Hand detection (to reduce vision false positives) is **optional** and lives in a
separate file so the base install stays headless:

```bash
# Only on a machine with system GL libraries (NOT the headless sandbox):
backend/.venv/bin/pip install -r backend/requirements-optional.txt
```

> `mediapipe` pulls in the **non-headless** `opencv-contrib-python`, whose native
> libraries shadow the headless build and require `libGL.so.1`. Installing it in
> a headless environment will break `import cv2`. `app/vision.py` guards the
> import, so the whole system works with MediaPipe absent.

### Frontend

```bash
cd frontend
npm install
```

## Run

```bash
# Backend (from repo root)
backend/.venv/bin/uvicorn app.server:app --app-dir backend --reload

# Frontend (in another terminal)
cd frontend && npm run dev
```

The Anthropic API key is optional:

```bash
export ANTHROPIC_API_KEY=sk-...   # optional
```

Without a key (or without network), Benchwatch uses a deterministic **canned
report fallback** so the core flow never breaks. Transcription runs locally via
faster-whisper, which downloads its model (`base.en` / `small.en`) on first use;
the vision + engine flow works without it.

## Testing

```bash
backend/.venv/bin/python -m pytest backend/tests -q
```

The deterministic protocol engine is the most testable component and is covered
by pytest unit tests and Hypothesis property-based tests driven by fake events.
No camera, microphone or network is required for the suite to pass.

## Demo script

The demo protocol (`backend/protocols/demo_assay.yaml`) is a simplified fake
colorimetric assay using colored water, compressed to about three minutes. Three
reagent bottles (blue cap "Buffer A", yellow cap "Reagent B", red cap "Stop
Solution") and one clear sample tube in the target zone. Five steps: add Buffer
A, swirl to mix, add Reagent B, incubate 60 s, add Stop Solution.

The presenter deliberately makes two mistakes:

1. After adding Buffer A, they reach for the **red Stop Solution** instead of
   Reagent B. Benchwatch says *"That's the stop solution, you're on step three,
   Reagent B"* the moment the red bottle is lifted.
2. They let the incubation run long while talking to the judges. Benchwatch
   warns at **50 seconds** and flags the **overrun**.

During the run the presenter casually says *"the yellow looks a little paler than
last time,"* and that remark appears as an **observation on step three**. At the
end, the presenter clicks finish and the generated methods section and deviation
report appear on screen.

## Protocol YAML format

Each protocol lists reagents and steps. Reagents map a name to a cap color and a
home zone. Steps have an `id`, a `type` (`add`, `mix`, `incubate` or `manual`),
the `reagent` for add steps, the `duration_s` (and optional `warn_at_s`) for
incubate steps, and a short `description` used in alerts and the report.

```yaml
name: Demo colorimetric assay
reagents:
  buffer_a:   { label: "Buffer A",      cap_color: blue,   zone: 1 }
  reagent_b:  { label: "Reagent B",     cap_color: yellow, zone: 2 }
  stop:       { label: "Stop Solution", cap_color: red,    zone: 3 }
target_zone: 4
steps:
  - { id: 1, type: add,      reagent: buffer_a, description: "Add Buffer A to the sample" }
  - { id: 2, type: mix,      description: "Swirl to mix" }
  - { id: 3, type: add,      reagent: reagent_b, description: "Add Reagent B" }
  - { id: 4, type: incubate, duration_s: 60, warn_at_s: 50, description: "Incubate" }
  - { id: 5, type: add,      reagent: stop, description: "Add Stop Solution" }
```

Mix and manual steps cannot be detected reliably by vision in v1, so they are
auto-advanced when the next detectable action happens, or completed by a spoken
remark such as "mixed."

## Backend API

REST (served by `backend/app/server.py`):

- `GET /protocols` → `{ "protocols": ["demo_assay", ...] }`
- `GET /protocols/{name}` → parsed protocol for the checklist (`name`,
  `target_zone`, `reagents`, `steps`).
- `GET /healthz` → `{ "status": "ok" }`.

All four services communicate through a single WebSocket at `/ws/session`.
Messages are JSON objects with a `type` field.

**Client → server**

| type | fields | meaning |
| --- | --- | --- |
| `start_session` | `protocol` | load the protocol and begin a session |
| `stop_session` | — | end the session, save the log, return a report |
| `calibrate` | — | run color calibration on the latest frame |
| `correction` | `step_id`, `reagent`, `text` | apply a deterministic correction (the LLM resolves `text` into `step_id`/`reagent` first) |
| `vision_event` | `event` | inject a vision `Event` (used for tests/replay) |
| `audio_event` | `event` | inject an audio/user `Event` (FEAT-005 transcript/corrections) |

**Server → client**

| type | fields | meaning |
| --- | --- | --- |
| `session_started` | `protocol` | ack with the parsed protocol |
| `event` | `event` | mirrors an `Event` for the timeline (every vision/audio/engine event) |
| `step_state` | `current_step_index`, `current_step_id`, `completed[]`, `finished` | checklist state |
| `timer` | `step_id`, `remaining_s`, `duration_s`, `warn_at_s`, `running` | live incubation countdown (~1/s) |
| `alert` | `text`, `severity` (`deviation`/`warning`/`overrun`) | short spoken alert; the frontend speaks `text` via `speechSynthesis` |
| `status` | `state`, `detail`, `mat_detected`, `all_home`, `can_start` | mat/calibration/camera status and the start gate |
| `frame` | `jpeg_b64` | latest rectified frame as base64 JPEG (omitted when no frame) |
| `report` | `markdown`, `log_path`, `log` | sent on finish; the session log is the single source of truth |
| `error` | `message` | a problem with a client request |

The deterministic engine decides step matching, ordering and timers; the
`alert` messages are derived from the engine's `deviation` / `timer_warning` /
`timer_overrun` events (their `message` field is spoken verbatim). The first
step is blocked until `status.can_start` is true (mat detected **and** every
reagent home). On finish the `SessionLog` is written to `backend/sessions/` as
replayable JSON. The report is a placeholder summary until the report generator
(a later feature) is wired in.

## Non-goals / What's next

**Non-goals for the hackathon:** recognizing arbitrary real lab tubes/bottles
without colored caps, measuring volumes, controlling instruments, integrating
with commercial ELNs, multi-user labs, and any regulatory validation (21 CFR
Part 11 or GMP).

**What's next (stretch):** barcode/QR labels instead of colored caps (works with
real reagents); multiple sample tubes with per-tube tracking; a protocol
importer that turns a pasted protocol from a paper or protocols.io into the YAML
format using the LLM with a human review screen; and a post-session replay view
that scrubs through the video with events marked on the timeline.

## Spec-driven development (`.kiro/`)

This project is built spec-first. See `.kiro/specs/benchwatch/`
(`requirements.md`, `design.md`, `tasks.md`), the steering doc
`.kiro/steering/benchwatch-invariants.md`, and the hook
`.kiro/hooks/run-backend-tests.kiro.hook`. TAO's story — its deterministic,
explainable scoring engine and its no-key design — is captured in
`.kiro/specs/tao/tao.md` and the steering doc `.kiro/steering/tao-invariants.md`.
The `.kiro/` directory is committed on purpose and must stay that way.
