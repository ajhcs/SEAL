# SEAL Launch Readiness

Launch decision: **Blocked**

Required proof, approval, or impact work is still open.

## Snapshot

- Map coverage: 8 component(s), 202 file(s), 31 visible gap(s).
- Impact scope: 1 impact record(s), 0 open proof obligation(s), 1 pending approval(s).
- Proof status: blocked; 0 proven, 0 assumed, 0 stale, 0 blocked, 0 failed.
- Gate policy: blocked (0 fail, 1 blocked, 1 unknown, 2 warn).
- Readiness level: SRL-3 - Proof developing.
- Rigor profile: Launch (launch).

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


## Readiness Level

**SRL-3 - Proof developing**

SEAL can see proof work, but blockers or unknowns still prevent launch confidence.

This level is a plain-language summary only. The gate policy, evidence links, blockers, and unknowns remain the launch authority.

- PROVE has claims or evidence, but launch gates still block or need inspection. [proof:claims]
- Next step: Resolve the listed blockers or unknowns before treating the work as launch-ready.

## Rigor Profile

**Launch** - Release-readiness mode: require impact records, proof coverage, and launch-owner review.

- Required artifacts: map, impact, proof, evidence, launch-readiness.
- Evidence: Current proof is expected for launch claims. Failed evidence and open proof obligations block launch.
- Approvals: Launch-owner approval must be recorded when release risk or impact records require it.
- Launch gates: Open impact records, missing proof, pending approvals, and unmapped launch files block launch.

- No profile escalation recommendation was found.

## Top Blockers

- Required approval is not complete. [impact.approval_needed:approval.generated-impact-scope]

## Known Unknowns

- File classification is unknown for .beads/.local_version. [map.gap:gap.unknown-file.beads-local-version]
- File classification is unknown for .beads/bd.sock. [map.gap:gap.unknown-file.beads-bd]
- File classification is unknown for .beads/beads.db-wal. [map.gap:gap.unknown-file.beads-beads]
- File classification is unknown for .beads/daemon.pid. [map.gap:gap.unknown-file.beads-daemon]
- File classification is unknown for .beads/interactions.jsonl. [map.gap:gap.unknown-file.beads-interactions]
- File classification is unknown for .beads/issues.jsonl. [map.gap:gap.unknown-file.beads-issues]
- File classification is unknown for .beads/last-touched. [map.gap:gap.unknown-file.beads-last-touched]
- Repository component boundaries still need review. [map.gap:gap.repo-component-boundaries]
- Business requirements were not recovered from code alone. [map.gap:gap.repo-business-requirements]
- Product code is not yet linked to specific test evidence. [map.gap:gap.repo-test-proof-links]
- No direct test or proof evidence is linked for src/cli/seal-context-pack.mjs. [map.gap:gap.file-proof.src-cli-seal-context-pack]
- No direct test or proof evidence is linked for src/cli/seal-dashboard.mjs. [map.gap:gap.file-proof.src-cli-seal-dashboard]
- No direct test or proof evidence is linked for src/cli/seal-gap-review.mjs. [map.gap:gap.file-proof.src-cli-seal-gap-review]
- No direct test or proof evidence is linked for src/cli/seal-impact.mjs. [map.gap:gap.file-proof.src-cli-seal-impact]
- No direct test or proof evidence is linked for src/cli/seal-inventory.mjs. [map.gap:gap.file-proof.src-cli-seal-inventory]
- No direct test or proof evidence is linked for src/cli/seal-invoke.mjs. [map.gap:gap.file-proof.src-cli-seal-invoke]
- No direct test or proof evidence is linked for src/cli/seal-launch-report.mjs. [map.gap:gap.file-proof.src-cli-seal-launch-report]
- No direct test or proof evidence is linked for src/cli/seal-map-views.mjs. [map.gap:gap.file-proof.src-cli-seal-map-views]
- No direct test or proof evidence is linked for src/cli/seal-proof-report.mjs. [map.gap:gap.file-proof.src-cli-seal-proof-report]
- No direct test or proof evidence is linked for src/cli/seal-validate.mjs. [map.gap:gap.file-proof.src-cli-seal-validate]
- No direct test or proof evidence is linked for src/cli/seal.mjs. [map.gap:gap.file-proof.src-cli-seal]
- No direct test or proof evidence is linked for src/ingestion/markdown-plan.mjs. [map.gap:gap.file-proof.src-ingestion-markdown-plan]
- No direct test or proof evidence is linked for src/inventory/classify.mjs. [map.gap:gap.file-proof.src-inventory-classify]
- No direct test or proof evidence is linked for src/launch/readiness-levels.mjs. [map.gap:gap.file-proof.src-launch-readiness-levels]
- No direct test or proof evidence is linked for src/ontology/view-model.mjs. [map.gap:gap.file-proof.src-ontology-view-model]
- No direct test or proof evidence is linked for src/proof/bindings.mjs. [map.gap:gap.file-proof.src-proof-bindings]
- No external services or cost-bearing dependencies were proven. [map.gap:gap.service-cost-discovery]
- gap.generated-proof-evidence remains unresolved. [proof.gap:gap.generated-proof-evidence]
- Impact analysis has a visible unresolved gap. [impact.gap:gap.generated-impact-evidence]

## High-Risk Assumptions

- No high-risk assumptions were found.

## Gate Decisions

| Gate | Status | Artifact links | Meaning |
| --- | --- | --- | --- |
| gate.impact.approval.IMPACT-initial.approval.generated-impact-scope | blocked | impact.approval_needed:approval.generated-impact-scope | Required approval is not complete. |
| gate.impact.gap.IMPACT-initial.gap.generated-impact-evidence | unknown | impact.gap:gap.generated-impact-evidence | Impact analysis has a visible unresolved gap. |
| gate.build.open-map-gaps-warning | warn | map.gap:gap.unknown-file.beads-local-version, map.gap:gap.unknown-file.beads-bd, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-interactions, map.gap:gap.unknown-file.beads-issues, map.gap:gap.unknown-file.beads-last-touched, map.gap:gap.repo-component-boundaries, map.gap:gap.repo-business-requirements, map.gap:gap.repo-test-proof-links, map.gap:gap.file-proof.src-cli-seal-context-pack, map.gap:gap.file-proof.src-cli-seal-dashboard, map.gap:gap.file-proof.src-cli-seal-gap-review, map.gap:gap.file-proof.src-cli-seal-impact, map.gap:gap.file-proof.src-cli-seal-inventory, map.gap:gap.file-proof.src-cli-seal-invoke, map.gap:gap.file-proof.src-cli-seal-launch-report, map.gap:gap.file-proof.src-cli-seal-map-views, map.gap:gap.file-proof.src-cli-seal-proof-report, map.gap:gap.file-proof.src-cli-seal-validate, map.gap:gap.file-proof.src-cli-seal, map.gap:gap.file-proof.src-ingestion-markdown-plan, map.gap:gap.file-proof.src-inventory-classify, map.gap:gap.file-proof.src-launch-readiness-levels, map.gap:gap.file-proof.src-ontology-view-model, map.gap:gap.file-proof.src-proof-bindings, map.gap:gap.service-cost-discovery | Open map gaps can remain during build, but the user must see what is still unknown. |
| gate.launch.pending-approval-warning | warn | proof.claim:claim.generated-readable | Pending approvals should remain visible in the launch decision even when they do not block exploration. |

## Next Actions

- Complete or explicitly gap the required proof, approval, or impact work. Required approval is not complete. [impact.approval_needed:approval.generated-impact-scope]
- Inspect the unknown and either map it, prove it, or carry it as an accepted gap. Impact analysis has a visible unresolved gap. [impact.gap:gap.generated-impact-evidence]
- Get launch-owner acceptance or replace the caution with stronger evidence. Open map gaps can remain during build, but the user must see what is still unknown. [map.gap:gap.unknown-file.beads-local-version, map.gap:gap.unknown-file.beads-bd, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-beads, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-daemon, map.gap:gap.unknown-file.beads-interactions, map.gap:gap.unknown-file.beads-issues, map.gap:gap.unknown-file.beads-last-touched, map.gap:gap.repo-component-boundaries, map.gap:gap.repo-business-requirements, map.gap:gap.repo-test-proof-links, map.gap:gap.file-proof.src-cli-seal-context-pack, map.gap:gap.file-proof.src-cli-seal-dashboard, map.gap:gap.file-proof.src-cli-seal-gap-review, map.gap:gap.file-proof.src-cli-seal-impact, map.gap:gap.file-proof.src-cli-seal-inventory, map.gap:gap.file-proof.src-cli-seal-invoke, map.gap:gap.file-proof.src-cli-seal-launch-report, map.gap:gap.file-proof.src-cli-seal-map-views, map.gap:gap.file-proof.src-cli-seal-proof-report, map.gap:gap.file-proof.src-cli-seal-validate, map.gap:gap.file-proof.src-cli-seal, map.gap:gap.file-proof.src-ingestion-markdown-plan, map.gap:gap.file-proof.src-inventory-classify, map.gap:gap.file-proof.src-launch-readiness-levels, map.gap:gap.file-proof.src-ontology-view-model, map.gap:gap.file-proof.src-proof-bindings, map.gap:gap.service-cost-discovery]
- Get launch-owner acceptance or replace the caution with stronger evidence. Pending approvals should remain visible in the launch decision even when they do not block exploration. [proof.claim:claim.generated-readable]

## Trace

- Launch status includes schema, reference, coverage, and authority validation. [validation:diagnostics]
- Map coverage contributes component, file, dependency, and gap counts. [map:summary]
- Impact records contribute proof obligations, approvals, affected unknowns, and impact gaps. [impact:records]
- Proof claims and evidence decide whether claims are proven, stale, assumed, failed, or blocked. [proof:claims]
- Gate policy turns evidence into the launch decision. [gate.policy:blocked]
- Rigor profile sets proportional artifacts, evidence, approvals, and launch gates. [rigor.profile:launch]
