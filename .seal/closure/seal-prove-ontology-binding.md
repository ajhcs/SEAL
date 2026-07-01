# seal-prove-ontology-binding closure evidence

Closed: 2026-07-01T16:46:08.6748011-04:00

## Implementation

- Added cross-artifact PROVE ontology binding validation in `src/proof/bindings.mjs`.
- Wired proof binding diagnostics into `validateSealArtifacts` and launch gate/report surfaces as proof validation failures.
- Added explicit `ontology_type`, `ontology_id`, and `object_refs` schema fields for proof and evidence-index records.
- Updated generated proof artifacts, invocation output, minimal fixtures, and full workflow fixtures to bind claims/evidence/gaps to known ontology objects.
- Updated proof gap reports to show claim object refs alongside evidence and gap bindings.

## Acceptance coverage

- Missing proof object refs fail validation.
- Unknown proof object refs fail validation.
- Proven claims fail with stale, failed, incomplete, missing, or unresolved blocking evidence/gap state.
- Accepted gaps remain visible and valid when carried as assumptions.
- Human approval evidence remains visible and can support a proven launch claim.
- Proof reports include ontology object refs, evidence refs, and gap refs for each claim.

## Verification

- `node tests/validation.test.mjs`
- `node tests/proof-gap-report.test.mjs`
- `node tests/schema.test.mjs`
- `node tests/scaffold.test.mjs`
- `node tests/templates.test.mjs`
- `node tests/plugin-smoke.test.mjs`
- `node tests/launch-readiness-report.test.mjs`
- `node tests/full-workflow-fixtures.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run smoke:plugin`
- `bd dep cycles`
