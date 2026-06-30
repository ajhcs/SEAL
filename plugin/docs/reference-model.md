# SEAL Artifact ID and Reference Model

SEAL IDs are stable, human-readable identifiers owned by the artifact record that defines them. A generated artifact set must not contain duplicate IDs across sources, components, gaps, impacts, claims, or evidence.

## ID Ownership

- `sources[].id` owns source authority records in `.seal/map.yaml`.
- `components[].id` owns mapped system components in `.seal/map.yaml`.
- `files[].path` owns mapped file records in `.seal/map.yaml`.
- `gaps[].id` owns visible unknowns or missing proof records in the artifact where the gap is declared.
- `claims[].id` owns proof claims in `.seal/proof.yaml`.
- `evidence[].id` owns evidence records in `.seal/evidence/index.yaml`.
- `IMPACT-*.yaml` owns its top-level `id`.

## Reference Rules

- Every `source_refs[]` value must point to a mapped source.
- Approved baseline records cannot be backed only by `inferred` or `unknown` source authority.
- `files[].component_id` must point to a mapped component when present.
- Impact `affected` records currently support `component` and `file` targets. Other affected kinds must be represented as explicit gaps until their artifacts exist.
- Impact `proof_needed[].claim_id` must point to a proof claim.
- Proof `claims[].evidence_refs[]` must point to evidence records.
- Proof `claims[].gap_refs[]` must point to declared gaps.
- Evidence `claim_ids[]` must point to proof claims.

Unknowns are valid when they are visible as gaps. Dangling references are not valid because they hide authority and proof gaps from the user.

## Generated Artifact Index

`.seal/index.yaml` is a generated lookup artifact for product-layer workflows. It is not canonical truth and should not be edited by hand. The source `.seal` artifacts remain authoritative; regenerate the index after changing MAP, IMPACT, PROOF, evidence, debt, FLY, or context-pack artifacts.

Index records carry stable lookup fields such as `id`, `kind`, `artifact_type`, `artifact_path`, `json_pointer`, `summary`, `source_refs`, `hash`, `byte_count`, and `freshness`. Records summarize canonical artifacts and intentionally omit full artifact bodies. Stale hashes, missing hashes, oversized summaries, dangling relation endpoints, or missing canonical records mean the generated index is invalid and must be regenerated after correcting the canonical references.
