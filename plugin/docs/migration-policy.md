# Artifact Migration Policy

SEAL artifacts declare a `schema_version` so users can tell whether MAP, IMPACT, PROVE, evidence, and debt records match the validator that is reading them.

## Current Version

- Current artifact schema version: `0.2.0`.
- Supported artifact schema versions in this build: `0.2.0`.
- `seal-validate` treats older, newer, or malformed `schema_version` values as blocking validation issues.

## Compatibility Rules

SEAL does not silently rewrite artifacts during validation. A version mismatch means the artifact may not mean what the current code thinks it means, so the validator stops and prints a concrete upgrade action.

Older artifacts must be reviewed against the current schema before their `schema_version` is changed. Future artifacts must be opened with a newer SEAL build instead of edited by this one.

## Ontology v1 Bootstrap

Repositories that already have MAP, PROVE, and evidence artifacts but do not yet have `.seal/ontology.yaml` can run:

```bash
seal validate <directory> --bootstrap-ontology
```

Normal `seal validate <directory>` is read-only. It reports a missing ontology with this bootstrap command instead of silently creating files.

The bootstrap writes `.seal/ontology.yaml` only when it is missing. If a human-edited ontology already exists, SEAL leaves it untouched. The generated ontology preserves discovered component, file, claim, evidence, and gap IDs in migration metadata, and any legacy fields without an ontology v1 mapping are recorded as explicit migration gaps.

After bootstrap, rerun validation and review `.seal/ontology.yaml` before treating ontology-derived reports as release evidence.

## No-Op Migration

`0.0.0` to `0.2.0` is the only documented no-op migration. Use it only when the artifact already has the fields required by the current schemas.

1. Run `seal-validate <workspace>` and read every version diagnostic.
2. Compare the artifact with the current schema in `plugin/schemas/`.
3. If the structure already matches, update `schema_version` to `0.2.0`.
4. Rerun `seal-validate <workspace>`.

If the structure does not match, add a real migration or file a bead with the exact missing mapping.

## Changing Schemas

Any release that changes artifact shape must update this document, add fixtures for old and current versions, and describe the migration in `plugin/docs/release-checklist.md`.
