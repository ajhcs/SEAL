# seal-guided-e2e closure evidence

Status: ready to close

## Dogfood workflow

- `npm exec -- seal -- guide --profile launch . "seal-guided-e2e" "Dogfood the guided product layer against the SEAL repository."`
- `npm exec -- seal -- map .`
- `npm exec -- seal -- docs human .`
- `npm exec -- seal -- docs ai .`
- `npm exec -- seal -- dashboard . --profile launch`
- `npm exec -- seal -- proof . --profile launch`
- `npm exec -- seal -- launch . --profile launch`
- `npm exec -- seal -- validate .`

## Generated evidence

- Canonical artifacts: `.seal/sources.yaml`, `.seal/ontology.yaml`, `.seal/map.yaml`, `.seal/plan.yaml`, `.seal/trace.yaml`, `.seal/proof.yaml`, `.seal/evidence/index.yaml`, `.seal/debt.yaml`, `.seal/impacts/IMPACT-initial.yaml`, `.seal/fly/FLY-generated.yaml`.
- Generated non-authoritative outputs: `.seal/index.yaml`, `.seal/context-pack.yaml`, `.seal/views/dashboard.md`, `.seal/views/repo-map.md`, `.seal/views/system-map.mmd`, `.seal/views/component-graph.mmd`, `.seal/views/interface-data-flow.mmd`, `.seal/views/debt.md`, `.seal/reports/docs-proposal.md`, `.seal/ai-docs/context.yaml`, `.seal/reports/context-pack.json`, `.seal/reports/proof-gaps.md`, `.seal/reports/launch-readiness.md`, `.seal/reports/gap-review.md`.
- Skill-quality audit evidence: `.seal/reports/skill-quality-audit.md`, verified by `node tests/skill-quality-audit-report.test.mjs`.

## Acceptance coverage

- The SEAL-repo dogfood path exercised guide, map, separate human docs and AI docs, artifact index, context pack, dashboard, Mermaid views, proof gaps, launch readiness, skill-quality audit, validation, closure gates, plugin smoke, and bead dependency checks.
- Generated reports and views state their derived status and preserve canonical artifact IDs, source refs, evidence refs, gaps, or not-recorded markers.
- `.seal/context-pack.yaml` keeps a bounded record selection and does not include full canonical artifact dumps.
- Human docs and AI/machine docs remain separate through `.seal/reports/docs-proposal.md` and `.seal/ai-docs/context.yaml`.
- Launch readiness remains blocked because pending approval and explicit gaps are still visible; the E2E proves the product layer surfaces those blockers instead of hiding them.

## Dogfood improvements found

- Hidden dot directories produced duplicate component IDs, so `.beads` and `.github` now receive stable component IDs instead of collapsing to `cmp.*.root`.
- Ontology YAML generation emitted colon-bearing descriptions that could parse incorrectly; generated ontology descriptions now avoid unquoted YAML colon syntax.
- Public `seal map` now refreshes canonical `.seal/map.yaml` with the same guided source/component IDs and refreshes the gap-review report after the canonical MAP update.
- AI docs now write `.seal/index.yaml` through the shared artifact-index helper so context consumers can resolve compact records without full artifact dumps.

## Verification

- `node tests/artifact-index.test.mjs`
- `node tests/ontology-migration-fixtures.test.mjs`
- `node tests/validation.test.mjs`
- `node tests/invocation.test.mjs`
- `node tests/full-workflow-fixtures.test.mjs`
- `node tests/rc-command-surface.test.mjs`
- `node tests/example-workflows-docs.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run closure:enforce`
- `npm run smoke:plugin`
- `bd dep cycles`
