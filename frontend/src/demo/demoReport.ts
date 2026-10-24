/**
 * The final session report shown at the end of the replay.
 *
 * Copied verbatim from backend/app/fixtures/canned_report.md (the deterministic
 * canned report the language layer emits when the Anthropic API is
 * unavailable). The browser-only demo bundles this string so no backend call is
 * needed to render the methods + deviation report.
 */
export const demoReport = `# Benchwatch report: Demo colorimetric assay

## Methods

Following the Demo colorimetric assay protocol, Buffer A was added to the sample; then the sample was mixed; then Reagent B was added to the sample; then the sample was incubated for approximately 66 s (nominal 60 s); then Stop Solution was added to the sample.

## Deviation report

### Deviations
- \`2023-11-14T22:13:31+00:00\` (step 3): That's the Stop Solution, you're on step 3, Reagent B.

### Timing
- \`2023-11-14T22:14:28+00:00\` (step 4): warning - Incubation reached 50s of 60s.
- \`2023-11-14T22:14:43+00:00\` (step 4): overrun - Incubation overran by 6.0s.

### Observations
- \`2023-11-14T22:13:33+00:00\` (step 3): "the yellow looks a little paler than last time"
`;
