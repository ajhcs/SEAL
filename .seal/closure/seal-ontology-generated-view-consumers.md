# seal-ontology-generated-view-consumers closure evidence

Closed: 2026-07-01T18:32:28.2750979-04:00

## Implementation

- Added `src/ontology/view-model.mjs` to derive ontology IDs, entity/relationship/action/state registries, observed proof/approval/gap states, canonical record links, and `not recorded` markers from canonical artifacts.
- Wired ontology view consumption into generated MAP views, Mermaid notes, dashboard, docs shaper, launch readiness report, and context pack output.
- Kept generated outputs derived/non-authoritative and linked ontology data back to `.seal/ontology.yaml` and canonical MAP/TRACE/PROVE/DEBT/IMPACT/FLY/evidence records.
- Added generated-view consumer regression coverage and scaffold/package integration.

## Acceptance coverage

- Dashboard, Mermaid, docs, context-pack, and readiness outputs render ontology IDs and states.
- Generated outputs keep existing generated/non-authoritative notices.
- Unsupported risk state renders as `not recorded` instead of an invented claim.
- Outputs include canonical ontology/model references and generated-view regression coverage.

## Verification

- `node tests/ontology-generated-view-consumers.test.mjs`
- `npm test`
- `npm run test:closure`
- `npm run smoke:plugin`
- `bd dep cycles`
