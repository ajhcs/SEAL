# App-Friendly Output Schemas

This document defines the candidate output schemas for a future ChatGPT App or MCP adapter. These schemas are presentation contracts only. They must be derived from existing SEAL artifacts and command results, not from app-only launch logic.

The adapter should return compact cards for non-experts while preserving traceable artifact references for reviewers. A card can simplify language, but it must not hide blockers, unknowns, evidence limitations, approval state, or source authority.

The output layer must not claim ChatGPT App availability, marketplace installation, remote publishing, or replacement of human launch approval until those capabilities exist and are proven separately.

## Shared Envelope

Every app-friendly response should use the MCP tool response envelope from `mcp-tool-contract.md` and put UI-ready content under `data.ui`.

```json
{
  "ok": true,
  "data": {
    "ui": {
      "schema_version": "0.2.0",
      "kind": "launch_readiness_card",
      "title": "Launch readiness",
      "status": "blocked",
      "summary": "Launch is blocked because proof and approval work is still open.",
      "primary_action": "Complete or explicitly gap the required proof, approval, or impact work.",
      "sections": [],
      "trace": []
    }
  },
  "artifact_paths": [".seal/reports/launch-readiness.md"],
  "user_summary": "Launch is blocked. Start with the listed proof and approval items."
}
```

Required shared fields:

- `schema_version`: the app-output schema version, currently `0.2.0`.
- `kind`: one of `map_summary_card`, `impact_summary_card`, `proof_summary_card`, `launch_readiness_card`, `context_pack_card`, or `validation_result_card`.
- `title`: short label for the card.
- `status`: one of `pass`, `warn`, `unknown`, `blocked`, `fail`, or `info`.
- `summary`: plain-language result in one or two sentences.
- `primary_action`: the first useful next step, or `null` when no immediate action is required.
- `sections`: ordered display sections.
- `trace`: artifact references that let a reviewer inspect the source.

## Section Shape

Sections group visible facts without exposing raw internal structure.

```json
{
  "id": "top_blockers",
  "title": "Top blockers",
  "items": [
    {
      "label": "Required proof is still open",
      "detail": "Complete or gap the proof obligation before launch.",
      "severity": "blocked",
      "refs": [
        {
          "artifact": "impact.proof_required",
          "ref": "proof.checkout-smoke",
          "path": ".seal/impacts/IMPACT-pass.yaml"
        }
      ]
    }
  ]
}
```

Required section item fields:

- `label`: short readable fact.
- `detail`: the reason, limitation, or next action.
- `severity`: one of `pass`, `warn`, `unknown`, `blocked`, `fail`, or `info`.
- `refs`: source artifact references. Empty refs are allowed only for pure explanatory text.

Do not include bulk source files, evidence payloads, transcript bodies, or secrets in section items. Return references, summaries, limitations, and redaction notes instead.

## Schema Kinds

### `map_summary_card`

Derived from MAP artifacts and map views.

Expected sections:

- `components`: important components, entrypoints, and responsibilities.
- `coverage`: mapped files, unmapped files, ignored paths, and visible MAP gaps.
- `dependencies`: internal or external dependencies that affect launch reasoning.
- `assumptions`: inferred or weak-authority records that need review.

Trace requirements:

- Include refs to `map.summary`, `map.component`, `map.file`, and `map.gap` records where available.
- Preserve `authority_state`, `approval_state`, and `confidence` when a displayed fact depends on inference.

### `impact_summary_card`

Derived from IMPACT artifacts.

Expected sections:

- `affected_scope`: affected components, files, tests, requirements, risks, and unknowns.
- `proof_required`: proof obligations with status and next action.
- `approval_needed`: required approval records.
- `gaps`: open impact gaps and accepted gaps.

Trace requirements:

- Include refs to `impact.affected`, `impact.proof_required`, `impact.approval_needed`, and `impact.gap` records.
- Keep unknown affected areas visible instead of translating them into low-risk impact.

### `proof_summary_card`

Derived from PROVE artifacts and the evidence index.

Expected sections:

- `claim_status`: proven, assumed, stale, blocked, failed, and invalid claim counts.
- `evidence`: evidence references, status, capture date, limitations, and redaction state.
- `gaps`: open or accepted proof gaps.
- `next_actions`: the proof work needed to move claims toward launch-ready evidence.

Trace requirements:

- Include refs to `proof.claim`, `proof.gap`, and `evidence` records.
- Display stale, assumed, blocked, failed, and invalid proof as visible risk, not as passing proof.

### `launch_readiness_card`

Derived from `seal-launch-report` and gate policy evaluation.

Expected sections:

- `snapshot`: MAP, IMPACT, PROVE, gate policy, and SRL summary counts.
- `readiness_level`: SRL id, label, drivers, and next action.
- `top_blockers`: hard launch blockers.
- `known_unknowns`: unresolved unknowns carried from MAP, PROVE, validation, or gate policy.
- `high_risk_assumptions`: accepted or inferred assumptions that still need launch-owner visibility.
- `next_actions`: ordered actions from the gate policy.

Trace requirements:

- Include refs to `validation`, `map`, `impact`, `proof`, and `gate.policy` records.
- The card status must follow the gate decision first. SRL explains maturity but does not override gates.

### `context_pack_card`

Derived from `.seal/reports/context-pack.json`.

Expected sections:

- `scope`: selected components, files, interfaces, tests, claims, evidence, gaps, and unknowns.
- `omitted_context`: counts of omitted components, files, claims, evidence, and gaps.
- `guardrails`: reminders for inferred records and missing evidence.
- `next_actions`: implementation or review steps implied by the context pack.

Trace requirements:

- Include refs to selected artifacts and the generated context pack.
- Preserve omitted counts so the user knows the card is focused rather than complete.

### `validation_result_card`

Derived from `seal-validate`.

Expected sections:

- `artifact_status`: per-artifact validity and schema version.
- `diagnostics`: file, artifact type, path, message, expected, actual, and fix fields.
- `version_policy`: current, migrated, unsupported, missing, or malformed artifact version state.
- `next_actions`: exact fixes needed before adapter outputs can be trusted.

Trace requirements:

- Include refs to validation diagnostics and artifact paths.
- A validation failure must produce `status: "fail"` or `status: "blocked"` for any launch-facing card that depends on the failed artifact set.

## Beginner Readability Rules

- Start with the answer: ready, blocked, failed, needs inspection, or ready with cautions.
- Use SEAL terms consistently: MAP repo truth, IMPACT proposed changes, PROVE claims with evidence or visible gaps, and LAUNCH readiness with blockers and unknowns.
- Explain one next action before listing secondary details.
- Keep artifact links close to claims so reviewers can inspect the source.
- Use `unknown` when SEAL lacks evidence or authority. Do not soften unknowns into neutral wording.
- Prefer counts and short labels over raw artifact dumps.

## Drift Controls

- App-output cards must be generated from current command/library results: `seal-invoke`, `seal-map-views`, `seal-impact`, `seal-proof-report`, `seal-launch-report`, `seal-context-pack`, and `seal-validate`.
- Output schemas must be covered by fixture or contract tests before adapter implementation starts.
- If a future adapter adds UI-only fields, those fields must stay presentational and must not change MAP, IMPACT, PROVE, validation, gate, or launch semantics.
- The adapter may redact or summarize evidence details, but it must preserve evidence status, limitations, and a local artifact reference.
