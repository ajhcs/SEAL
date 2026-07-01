# seal-impact-ontology-traversal Closure Evidence

Status: ready to close

Acceptance coverage:

- `seal impact` computes affected records by traversing ontology-defined relationships:
  - `src/impact/change-scope.mjs`
  - `tests/impact-change-scope.test.mjs`
- Multi-hop component/file/interface/test/claim/evidence/gap paths are covered:
  - `tests/impact-change-scope.test.mjs`
- Cycle safety and depth/scope behavior are covered:
  - `src/impact/change-scope.mjs`
  - `tests/impact-change-scope.test.mjs`
- Unknown relationship types become visible impact gaps:
  - `src/impact/change-scope.mjs`
  - `tests/impact-change-scope.test.mjs`
- Existing proof obligations and context-pack behavior remain compatible:
  - `tests/impact-proof-obligations.test.mjs`
  - `tests/context-pack.test.mjs`

Verification run on 2026-07-01:

- `node tests/impact-change-scope.test.mjs`
- `node tests/impact-proof-obligations.test.mjs`
- `node tests/context-pack.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run smoke:plugin`
- `bd dep cycles`
