# SEAL Gate Criteria

SEAL gates define when a plan can move from plan to build to prove to launch. The gates are conservative about launch confidence and permissive about early discovery: exploration can continue with visible warnings, but false certainty must fail.

Each gate decision must link back to structured artifacts. A passing gate is not a checklist item; it is a claim supported by evidence, with any remaining gap still visible.

## Plan Gates

| Gate | Level | Plain rule | Validator signal |
| --- | --- | --- | --- |
| `gate.plan.schema-valid` | Hard fail | A missing, unparsable, or schema-invalid SEAL artifact blocks progress. | `seal-validate` diagnostic for MAP, IMPACT, PROOF, or evidence index artifacts. |
| `gate.plan.source-authority-visible` | Hard fail | Approved facts cannot rest on inferred or unknown authority. | `seal-validate` authority diagnostic. |
| `gate.plan.low-confidence-warning` | Warn | Low-confidence plan facts can be explored, but they must remain visible. | MAP source, requirement, risk, assumption, or gap confidence below `0.5`. |

## Build Gates

| Gate | Level | Plain rule | Validator signal |
| --- | --- | --- | --- |
| `gate.build.references-intact` | Hard fail | Broken traceability blocks build confidence. | `seal-validate` reference diagnostic. |
| `gate.build.file-coverage-complete` | Hard fail | Every non-ignored repository file must be mapped to a component or an explicit ownership gap. | `seal-validate` coverage diagnostic. |
| `gate.build.open-map-gaps-warning` | Warn | Open map gaps can remain during build only when they are visible. | MAP gap with status `open` or no status. |

## Prove Gates

| Gate | Level | Plain rule | Validator signal |
| --- | --- | --- | --- |
| `gate.prove.claim-has-evidence-or-gap` | Hard fail | A proof claim with neither evidence nor a gap is not proof. | PROOF claim with empty `evidence_refs` and empty `gap_refs`. |
| `gate.prove.no-failed-evidence` | Hard fail | Failed evidence blocks proof. | Evidence index record with status `failed`. |
| `gate.prove.stale-evidence-warning` | Warn | Stale evidence must not be treated as fresh launch proof. | Evidence index record with status `stale`. |
| `gate.prove.accepted-gap-warning` | Warn | Accepted proof gaps are assumptions, not proven claims. | PROOF gap with status `accepted`. |

## Launch Gates

| Gate | Level | Plain rule | Validator signal |
| --- | --- | --- | --- |
| `gate.launch.unmapped-files-block-launch` | Hard fail | Launch reports cannot hide unmapped launch files or file coverage failures. | Launch blocker with kind `unmapped_file`, or an unmapped-file coverage diagnostic. |
| `gate.launch.known-unknowns-visible` | Hard fail | Every open MAP or PROOF gap must appear in launch known unknowns. | Open gap id missing from launch report `known_unknowns`. |
| `gate.launch.pending-approval-warning` | Warn | Pending approvals must stay visible in launch decisions. | Launch gate, proof claim, or evidence record with `approval_state: pending`. |
| `gate.launch.weak-authority-warning` | Warn | Launch decisions depending on inferred or unknown authority must say so plainly. | Launch blocker or known unknown with `authority_state: inferred` or `unknown`. |

## Evaluation Contract

Gate policy evaluation consumes:

- `validation`: the result of `seal-validate`.
- `map`: parsed `.seal/map.yaml`.
- `proof`: parsed `.seal/proof.yaml`.
- `evidenceIndex`: parsed `.seal/evidence/index.yaml`.
- `launchReport`: the launch readiness report model once generated.

The dependent policy engine should report `pass`, `fail`, `warn`, `blocked`, or `needs_evidence` for each criterion, and every non-pass decision should include the artifact path, record id, or diagnostic that caused it.
