# SEAL Documentation Proposal

Generated from .seal/*.yaml. Do not edit by hand.

## README Quick Orientation

<!-- seal-claim id="doc.quick-orientation" refs="cmp.seal" -->
This project currently centers on Repository.
<!-- /seal-claim -->

## Architecture From MAP And TRACE

- cmp.seal: Repository - Repository-level summary for observed component classification. Files: .beads/.gitignore, .beads/.local_version, .beads/bd.sock, .beads/beads.db.
- cmp.seal.beads: .beads module - Observed documentation component inferred from files under .beads. Files: .beads/.gitignore, .beads/.local_version, .beads/bd.sock, .beads/beads.db.
- cmp.seal.github: .github module - Observed repository area inferred from files under .github. Files: .github/workflows/ci-smoke.yml.
- cmp.seal.plugin: plugin module - Observed documentation component inferred from files under plugin. Files: plugin/.codex-plugin/plugin.json, plugin/docs/adapter-security-privacy.md, plugin/docs/app-output-schemas.md, plugin/docs/app-submission-readiness.md.
- cmp.seal.root: Repository root - Observed documentation component inferred from files under root. Files: .gitattributes, .gitignore, AGENTS.md, package-lock.json.
- cmp.seal.src: src module - Observed implementation component inferred from files under src. Files: src/artifacts/authority.mjs, src/artifacts/generate.mjs, src/artifacts/index.mjs, src/artifacts/ontology.mjs.
- cmp.seal.tests: tests module - Observed validation component inferred from files under tests. Files: tests/adapter-security-privacy-docs.test.mjs, tests/app-output-schemas-docs.test.mjs, tests/app-submission-readiness-docs.test.mjs, tests/artifact-index.test.mjs.
- cmp.seal.tools: tools module - Observed repository area inferred from files under tools. Files: tools/seed-seal-beads.ps1.

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


## Important Files

- .beads/.gitignore: config; Observed config file for .beads/.gitignore.
- .beads/.local_version: unknown; Observed file with unknown purpose: .beads/.local_version.
- .beads/bd.sock: unknown; Observed file with unknown purpose: .beads/bd.sock.
- .beads/beads.db: unknown; Observed file with unknown purpose: .beads/beads.db.
- .beads/beads.db-shm: unknown; Observed file with unknown purpose: .beads/beads.db-shm.
- .beads/beads.db-wal: unknown; Observed file with unknown purpose: .beads/beads.db-wal.
- .beads/config.yaml: config; Observed config file for .beads/config.yaml.
- .beads/daemon.lock: unknown; Observed file with unknown purpose: .beads/daemon.lock.
- .beads/daemon.log: unknown; Observed file with unknown purpose: .beads/daemon.log.
- .beads/daemon.pid: unknown; Observed file with unknown purpose: .beads/daemon.pid.
- .beads/interactions.jsonl: unknown; Observed file with unknown purpose: .beads/interactions.jsonl.
- .beads/issues.jsonl: unknown; Observed file with unknown purpose: .beads/issues.jsonl.

## Testing And Proof

- claim.generated-readable: gapped; Generated artifacts are present and structurally valid.

## Known Gaps And Debt

- debt.gap-file-proof-src-cli-seal: open; No direct test or proof evidence is linked for src/cli/seal.mjs.
- debt.gap-file-proof-src-cli-seal-context-pack: open; No direct test or proof evidence is linked for src/cli/seal-context-pack.mjs.
- debt.gap-file-proof-src-cli-seal-dashboard: open; No direct test or proof evidence is linked for src/cli/seal-dashboard.mjs.
- debt.gap-file-proof-src-cli-seal-gap-review: open; No direct test or proof evidence is linked for src/cli/seal-gap-review.mjs.
- debt.gap-file-proof-src-cli-seal-impact: open; No direct test or proof evidence is linked for src/cli/seal-impact.mjs.
- debt.gap-file-proof-src-cli-seal-inventory: open; No direct test or proof evidence is linked for src/cli/seal-inventory.mjs.
- debt.gap-file-proof-src-cli-seal-invoke: open; No direct test or proof evidence is linked for src/cli/seal-invoke.mjs.
- debt.gap-file-proof-src-cli-seal-launch-report: open; No direct test or proof evidence is linked for src/cli/seal-launch-report.mjs.
- debt.gap-file-proof-src-cli-seal-map-views: open; No direct test or proof evidence is linked for src/cli/seal-map-views.mjs.
- debt.gap-file-proof-src-cli-seal-proof-report: open; No direct test or proof evidence is linked for src/cli/seal-proof-report.mjs.

## Canonical Artifact Links

- `.seal/map.yaml`
- `.seal/trace.yaml`
- `.seal/proof.yaml`
- `.seal/evidence/index.yaml`
- `.seal/debt.yaml`
- `.seal/context-pack.yaml`

## Source Authority

- src.repo-seal

Generated mode: human
