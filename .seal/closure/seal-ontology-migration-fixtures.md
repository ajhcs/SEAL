# seal-ontology-migration-fixtures closure evidence

Status: ready to close

## Implementation

- Added `src/ontology/bootstrap.mjs` as the explicit ontology v1 bootstrap path.
- Wired `seal validate <directory> --bootstrap-ontology` and `seal-validate <directory> --bootstrap-ontology` to create `.seal/ontology.yaml` only when missing.
- Kept default validation read-only; missing ontology diagnostics point to the bootstrap flag and `plugin/docs/migration-policy.md`.
- Reused the bootstrap helper from `invokeSeal` so guided MAP/PLAN artifact creation never overwrites an existing ontology.
- Documented ontology v1 bootstrap, no-overwrite behavior, preserved IDs, and unmapped-field migration gaps in `plugin/docs/migration-policy.md`.

## Acceptance coverage

- Legacy workspaces can bootstrap ontology v1 from existing MAP, PROVE, and evidence artifacts.
- Existing `.seal/ontology.yaml` files are preserved byte-for-byte.
- Migration metadata preserves component, file, claim, evidence, and gap IDs.
- Legacy fields without ontology v1 mappings become explicit migration gaps.
- Full workflow fixtures either already carry ontology v1 or remain compatible.

## Verification

- `node tests/ontology-migration-fixtures.test.mjs`
- `node tests/validation.test.mjs`
- `node tests/invocation.test.mjs`
- `node tests/full-workflow-fixtures.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run smoke:plugin`
- `bd dep cycles`
