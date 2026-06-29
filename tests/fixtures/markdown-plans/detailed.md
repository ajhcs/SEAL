# Evidence-backed Launch

## Requirements

- Capture every source document with authority state.
- Map each component to files and proof gaps.

## Decisions

- Decision: use YAML artifacts for reviewable state.

## Acceptance Criteria

- Done when schema validation passes on every generated artifact.
- Verify that trace links point to real extracted records.

## Assumptions

- Assume launch approval will be provided by a human reviewer.
- Unknown: external audit evidence is not attached yet.

## Risks

- Risk: stale generated artifacts could hide missing proof.

## Launch Gates

- Ship when proof claims have evidence or explicit gaps.
- Launch gate: no hidden unknowns remain outside .seal artifacts.
