# SEAL Source Authority

SEAL treats source authority as artifact data, not narration. The P0 source registry is `map.sources` in `.seal/map.yaml`; other artifacts point back to it through `source_refs`.

## Shared Fields

Meaningful MAP, IMPACT, PROOF, and evidence records can carry:

- `source_refs` - source IDs from `map.sources`.
- `authority_state` - the strongest authority currently backing the record.
- `approval_state` - whether the record is approved baseline truth, pending, rejected, or does not require approval.
- `confidence` - a numeric confidence score from `0` to `1`.

## Authority States

- `human_approved` - a human approved the record as baseline truth.
- `repo_observed` - the record was observed directly from repository files or local inspection.
- `externally_sourced` - the record came from a named external source.
- `execution_evidence` - the record is backed by command output, test output, or runtime evidence.
- `mathematically_proven` - the record is backed by a deterministic proof or calculation.
- `inferred` - the record is a useful inference that still needs stronger authority.
- `unknown` - the record is intentionally unresolved.

## Approval Boundary

`inferred` and `unknown` records may guide investigation, but they cannot become approved baseline truth. Validation fails when an `approved` record has only `inferred` or `unknown` authority, either directly through `authority_state` or indirectly through all of its `source_refs`.

When authority is missing, preserve the uncertainty as a visible gap instead of promoting it into baseline truth.
