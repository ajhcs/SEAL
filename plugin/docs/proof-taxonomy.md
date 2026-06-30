# SEAL Proof Taxonomy

SEAL proof records use a small claim taxonomy so reports can explain what is proven, what evidence supports it, and what remains a gap.

| Claim type | Plain label | Accepted evidence types |
| --- | --- | --- |
| `functional` | It does what it should do | `unit_test`, `integration_test`, `e2e_test`, `contract_test`, `property_based_test`, `test_result`, `command_output`, `static_inspection`, `repo_observation` |
| `safety` | It avoids unacceptable harm | `unit_test`, `integration_test`, `fault_injection`, `property_based_test`, `model_check`, `static_analysis`, `human_approval`, `test_result`, `static_inspection` |
| `reliability` | It keeps working under expected conditions | `integration_test`, `e2e_test`, `load_test`, `fault_injection`, `telemetry`, `canary_result`, `test_result`, `command_output` |
| `security` | It protects access, data, or trust boundaries | `security_scan`, `static_analysis`, `accessibility_check`, `repo_observation`, `external_source_snapshot`, `static_inspection`, `test_result`, `external_reference` |
| `performance` | It meets speed or capacity expectations | `performance_measurement`, `load_test`, `cost_calculation`, `mathematical_analysis`, `telemetry`, `test_result`, `command_output` |
| `usability` | People can use it correctly | `accessibility_check`, `visual_review`, `screenshot`, `browser_recording`, `human_approval`, `external_reference`, `test_result` |
| `launch` | It is ready for a release decision | `canary_result`, `telemetry`, `human_approval`, `unit_test`, `integration_test`, `e2e_test`, `contract_test`, `schema_validation`, `migration_dry_run`, `typecheck`, `lint`, `security_scan`, `performance_measurement`, `load_test`, `test_result`, `command_output` |
| `operational` | It can be run, observed, and recovered | `telemetry`, `canary_result`, `fault_injection`, `load_test`, `command_output`, `static_inspection`, `external_reference`, `test_result` |
| `data` | It preserves and validates data correctly | `schema_validation`, `migration_dry_run`, `contract_test`, `static_analysis`, `repo_observation`, `test_result` |
| `cost` | It accounts for cost and resource impact | `cost_calculation`, `mathematical_analysis`, `performance_measurement`, `external_source_snapshot`, `telemetry` |
| `accessibility` | It remains accessible to intended users | `accessibility_check`, `visual_review`, `screenshot`, `browser_recording`, `human_approval` |
| `architecture` | It matches the approved architecture boundary | `repo_observation`, `static_inspection`, `contract_test`, `schema_validation`, `external_source_snapshot`, `human_approval` |

Every claim still needs either linked evidence or an explicit gap. A claim type does not make a claim true; it only defines which evidence can support it.

## Evidence Store

Recorded evidence lives in `.seal/evidence/index.yaml`. Large or sensitive output should not be copied into the index; store a short summary in `.seal/evidence/files/` and link it from the evidence record.

Each evidence record must include:

- `claim_ids`: the claims this evidence supports.
- `source`: provenance for the record, such as `command`, `static_inspection`, `external_source`, `human_review`, or `gap_record`.
- `captured_at`: when the evidence summary was captured.
- `artifact_path`, `artifact_hash`, and `hash_algorithm` when a local evidence artifact is stored.
- `limitations`: the scope and weakness of the evidence.
- `redaction`: whether the stored artifact is complete, summary-only, or not applicable.

Proof remains a claim + evidence + gap model. If a claim has no supporting evidence yet, keep an explicit `gap_refs` link instead of treating a checklist item as proof.
