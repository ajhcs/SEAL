# SEAL Dashboard

Generated from .seal/*.yaml. Do not edit by hand.

This is a non-authoritative generated view. Canonical SEAL artifacts remain under `.seal/*.yaml`; use linked reports for detailed evidence. [artifact:.seal/index.yaml artifact:.seal/map.yaml artifact:.seal/proof.yaml]

## Project

- Purpose: Observed repository map generated from direct file inventory and lightweight static inspection. [source:src.repo-seal map:purpose]
- Boundary: root `C:\Users\colet\OneDrive\Documents\SEAL`; includes 1 path(s); excludes 4 path(s). [source:src.repo-seal map:boundary]

## Ontology Model

- Ontology: ontology.seal.v1 [ontology:ontology.seal.v1]
- Generated from: .seal/ontology.yaml [artifact:.seal/ontology.yaml]
- Entity types used: assumption, claim, component, data_store, debt, dependency, evidence, file, fly_cycle, gap, generated_view, impact, interface, map, ontology, plan, proof, requirement, risk, service, source, state_transition, test, trace_relation, validation_result [ontology:entity_types]
- Relationship types used: approved_by, blocks, calls, configured_by, conflicts_with, consumes, contains, depends_on, evidences, exposes, gapped_by, gates, generated_by, impacts, implements, informs, mitigates, observed_in, owned_by, produces, proven_by, reads, requires_approval, satisfies, supersedes, tests, verifies, writes [ontology:relationship_types]
- Proof states: gapped, incomplete, open [ontology:proof_state]
- Approval states: pending [ontology:approval_state]
- Gap states: open [ontology:gap_state]
- Risk states: not recorded [ontology:risk_state]
- Not recorded markers: risk_state [gap:ontology.not_recorded]


## Readiness

- Launch decision: Blocked (blocked). [launch:launch.readiness gate-policy:blocked]
- Readiness level: SRL-3 - Proof developing. [launch:launch.readiness readiness:SRL-3]
- Rigor profile: Launch (launch). [rigor.profile:launch]

## Unknowns And Gaps

- gap.unknown-file.beads-local-version: File classification is unknown for .beads/.local_version. [source:src.repo-seal gap:gap.unknown-file.beads-local-version]
- gap.unknown-file.beads-bd: File classification is unknown for .beads/bd.sock. [source:src.repo-seal gap:gap.unknown-file.beads-bd]
- gap.unknown-file.beads-beads: File classification is unknown for .beads/beads.db. [source:src.repo-seal gap:gap.unknown-file.beads-beads]
- gap.unknown-file.beads-beads: File classification is unknown for .beads/beads.db-shm. [source:src.repo-seal gap:gap.unknown-file.beads-beads]
- gap.unknown-file.beads-beads: File classification is unknown for .beads/beads.db-wal. [source:src.repo-seal gap:gap.unknown-file.beads-beads]
- gap.unknown-file.beads-daemon: File classification is unknown for .beads/daemon.lock. [source:src.repo-seal gap:gap.unknown-file.beads-daemon]
- gap.unknown-file.beads-daemon: File classification is unknown for .beads/daemon.log. [source:src.repo-seal gap:gap.unknown-file.beads-daemon]
- gap.unknown-file.beads-daemon: File classification is unknown for .beads/daemon.pid. [source:src.repo-seal gap:gap.unknown-file.beads-daemon]

## Proof Health

- Claims: proven 0; stale 0; failed 0; blocked 0; assumed 0; gapped 1; invalid 1. [proof:claims evidence:index]
- claim.generated-readable: invalid - Generated artifacts are present and structurally valid. [source:src.repo-seal evidence:ev.generated-gap gap:gap.generated-proof-evidence proof:claim.generated-readable]

## Blockers And Approvals

- Blocker gate.impact.approval.IMPACT-initial.approval.generated-impact-scope: Required approval is not complete. [artifact:impact.approval_needed:approval.generated-impact-scope source:gate.impact.approval.IMPACT-initial.approval.generated-impact-scope blocker:gate.impact.approval.IMPACT-initial.approval.generated-impact-scope]
- Approval approval.generated-impact-scope: A human owner must replace the scaffold with a real change scope before relying on it. [source:src.repo-seal impact:IMPACT-initial]

## Risks

- Services: unknown - risk recorded; 1 more record(s). [risk:services]
- Dependencies: dep.src-artifacts-generate - src/artifacts/generate.mjs imports external package yaml.; 1299 more record(s). [source:src.repo-seal risk:dependencies]
- Cost: debt.gap-service-cost-discovery - No external services or cost-bearing dependencies were proven.; 1 more record(s). [source:src.repo-seal gap:gap.service-cost-discovery risk:cost]
- Data: data.tests-fixtures-repo-inventory-migrations-001-init - Observed migration or data-store change at tests/fixtures/repo-inventory/migrations/001-init.sql.. [source:src.repo-seal risk:data]
- Security: debt.unlinked-test.tests-adapter-security-privacy-docs-test-mjs - Test file tests/adapter-security-privacy-docs.test.mjs is not linked to a product file.. [source:src.repo-seal risk:security]

## Recent Changes

- Impact IMPACT-initial: Generated scaffold impact placeholder. [source:src.repo-seal impact:IMPACT-initial]

## Next Actions

- action.gate.impact.approval.IMPACT-initial.approval.generated-impact-scope: Complete or explicitly gap the required proof, approval, or impact work. [gate-policy:blocked artifact:impact.approval_needed:approval.generated-impact-scope launch:launch.readiness]
- action.gate.impact.gap.IMPACT-initial.gap.generated-impact-evidence: Inspect the unknown and either map it, prove it, or carry it as an accepted gap. [gate-policy:blocked artifact:impact.gap:gap.generated-impact-evidence launch:launch.readiness]
- action.gate.build.open-map-gaps-warning: Get launch-owner acceptance or replace the caution with stronger evidence. [gate-policy:blocked artifact:map.gap:gap.unknown-file.beads-local-version artifact:map.gap:gap.unknown-file.beads-bd artifact:map.gap:gap.unknown-file.beads-beads artifact:map.gap:gap.unknown-file.beads-daemon artifact:map.gap:gap.unknown-file.beads-interactions artifact:map.gap:gap.unknown-file.beads-issues artifact:map.gap:gap.unknown-file.beads-last-touched artifact:map.gap:gap.repo-component-boundaries artifact:map.gap:gap.repo-business-requirements artifact:map.gap:gap.repo-test-proof-links artifact:map.gap:gap.file-proof.src-cli-seal-context-pack artifact:map.gap:gap.file-proof.src-cli-seal-dashboard artifact:map.gap:gap.file-proof.src-cli-seal-gap-review artifact:map.gap:gap.file-proof.src-cli-seal-impact artifact:map.gap:gap.file-proof.src-cli-seal-inventory artifact:map.gap:gap.file-proof.src-cli-seal-invoke artifact:map.gap:gap.file-proof.src-cli-seal-launch-report artifact:map.gap:gap.file-proof.src-cli-seal-map-views artifact:map.gap:gap.file-proof.src-cli-seal-proof-report artifact:map.gap:gap.file-proof.src-cli-seal-validate artifact:map.gap:gap.file-proof.src-cli-seal artifact:map.gap:gap.file-proof.src-ingestion-markdown-plan artifact:map.gap:gap.file-proof.src-inventory-classify artifact:map.gap:gap.file-proof.src-launch-readiness-levels artifact:map.gap:gap.file-proof.src-ontology-view-model artifact:map.gap:gap.file-proof.src-proof-bindings artifact:map.gap:gap.service-cost-discovery launch:launch.readiness]
- action.gate.launch.pending-approval-warning: Get launch-owner acceptance or replace the caution with stronger evidence. [gate-policy:blocked artifact:proof.claim:claim.generated-readable launch:launch.readiness]

## Links

- Repo map: `.seal/views/repo-map.md`. [artifact:.seal/views/repo-map.md]
- System map: `.seal/views/system-map.mmd`. [artifact:.seal/views/system-map.mmd]
- Component graph: `.seal/views/component-graph.mmd`. [artifact:.seal/views/component-graph.mmd]
- Interface/data-flow map: `.seal/views/interface-data-flow.mmd`. [artifact:.seal/views/interface-data-flow.mmd]
- Artifact index: `.seal/index.yaml`. [artifact:.seal/index.yaml]
- Proof gap report: `.seal/reports/proof-gaps.md`. [artifact:.seal/reports/proof-gaps.md]
- Launch readiness: `.seal/reports/launch-readiness.md`. [artifact:.seal/reports/launch-readiness.md]
