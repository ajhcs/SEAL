# seal-ontology-schema-validator Closure Evidence

Status: ready to close

Acceptance coverage:

- Ontology schema validation is registered with existing artifact validation:
  - `plugin/schemas/ontology.schema.json`
  - `src/artifacts/schema-registry.mjs`
  - `src/validation/validate.mjs`
- `.seal/ontology.yaml` validates in normal SEAL validation:
  - `.seal/ontology.yaml`
  - `tests/scaffold.test.mjs`
  - `tests/validation.test.mjs`
- Unknown entity type, relationship type, state, action, duplicate IDs, malformed version metadata, and missing required registry sections fail:
  - `src/artifacts/ontology.mjs`
  - `tests/schema.test.mjs`
- Ontology references are checked without RDF/OWL tooling:
  - `src/artifacts/ontology.mjs`
  - `tests/validation.test.mjs`

Verification run on 2026-07-01:

- `node tests/schema.test.mjs`
- `node tests/validation.test.mjs`
- `node tests/scaffold.test.mjs`
- `node tests/reference-integrity.test.mjs`
- `node tests/plugin-smoke.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run smoke:plugin`
- `bd dep cycles`
