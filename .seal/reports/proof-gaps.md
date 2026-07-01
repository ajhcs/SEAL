# SEAL Proof Gap Report

Launch proof status: **blocked**

## Summary

- Rigor profile: Launch (launch)
- Evidence expectation: Current proof is expected for launch claims. Failed evidence and open proof obligations block launch.
- Total claims: 1
- Proven: 0
- Assumed: 0
- Stale: 0
- Blocked: 0
- Failed: 0
- Invalid: 1

## Top Proof Gaps

- **invalid** claim.generated-readable: Unsupported evidence type for launch: ev.generated-gap:gap_record. Next: Attach one accepted evidence type: canary_result, telemetry, human_approval, unit_test, integration_test, e2e_test, contract_test, schema_validation, migration_dry_run, typecheck, lint, security_scan, performance_measurement, load_test, test_result, command_output.

## Claim Details

| Claim | Type | Status | Statement | Object refs | Source refs | Evidence refs | Gap refs | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claim.generated-readable | launch | invalid | Generated artifacts are present and structurally valid. | cmp.seal, .beads/.gitignore | src.repo-seal | ev.generated-gap (gap_record, incomplete) | gap.generated-proof-evidence (open) - undefined | Attach one accepted evidence type: canary_result, telemetry, human_approval, unit_test, integration_test, e2e_test, contract_test, schema_validation, migration_dry_run, typecheck, lint, security_scan, performance_measurement, load_test, test_result, command_output. |
