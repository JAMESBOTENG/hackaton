---
inclusion: always
---

# TAO — load-bearing invariants

TAO is the public, browser-only diagnostic decision-support co-pilot. These
rules keep it demo-proof and honest. Honor them in every TAO feature.

1. **Decision support, not a diagnosis.** TAO ranks possibilities and shows the
   evidence; it never diagnoses and never replaces the clinician. The UI must
   keep a visible disclaimer.
2. **The scoring engine is deterministic plain code.** Ranking is pure
   arithmetic over priors and finding weights (`frontend/src/tao/engine/`), never
   an LLM. Identical input always yields identical output.
3. **Every probability is explainable.** Each condition's score must be
   traceable to specific findings and weights, surfaced as the "why" when a
   condition is selected. No black box.
4. **Zero-key, zero-backend, offline-first.** The default route works with no API
   key, no backend, no microphone, fully offline in Chrome, driven by a bundled
   curated DEMO dataset (fictional patient, no real PII).
5. **PubMed is progressive enhancement only.** Live PubMed citations layer on top
   of bundled references; any failure resolves to an empty list and falls back to
   the bundled references. Rendering never blocks on the network.
6. **Speech is optional and guarded.** Web Speech mic input is strictly optional
   and wrapped in try/catch, so a missing or blocked API never throws.
7. **Benchwatch stays intact.** TAO is additive under `frontend/src/tao/`. Keep
   Benchwatch reachable via `?benchwatch=1` and `?live=1`; never remove or alter
   it. Keep the Vite base `/hackaton/` and ship `docs/.nojekyll`.
