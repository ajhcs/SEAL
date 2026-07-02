# SEAL Artifact Layout And Write Policy

SEAL centralizes `.seal` paths and write behavior in `src/artifacts/store.mjs`.
The store is the contract for artifact readers and writers.

## Canonical Artifacts

Canonical artifacts are the authoritative YAML records users may review and edit:

- `.seal/sources.yaml`
- `.seal/ontology.yaml`
- `.seal/plan.yaml`
- `.seal/map.yaml`
- `.seal/trace.yaml`
- `.seal/debt.yaml`
- `.seal/impacts/IMPACT-*.yaml`
- `.seal/proof.yaml`
- `.seal/evidence/index.yaml`
- `.seal/fly/FLY-*.yaml`
- `.seal/context-pack.yaml`

Default canonical writes preserve existing files. A command must opt in to
overwrite canonical YAML when it is explicitly updating or migrating that
artifact.

## Derived Artifacts

Derived artifacts are generated views, reports, indexes, or migration notes.
They are non-authoritative and safe to overwrite:

- `.seal/index.yaml`
- `.seal/reports/*.md`
- `.seal/reports/*.json`
- `.seal/views/*`
- `.seal/ai-docs/context.yaml`
- `.seal/migrations/*.md`

Derived files should be regenerated from canonical artifacts rather than edited
as source of truth.

## Reads And Diagnostics

Required reads may fail fast for commands that update or validate artifacts.
Inspection and reporting flows may use diagnostic reads so optional missing or
invalid artifacts are reported without hiding the rest of the artifact set.

## Audit Records

ArtifactStore writes JSONL audit records to
`.seal/audit/artifact-writes.jsonl`. Each record includes the artifact key,
canonical or derived kind, action, relative path, reason, and overwrite policy.
