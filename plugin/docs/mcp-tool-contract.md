# SEAL MCP Tool Contract

This document defines the candidate MCP tool surface for a future ChatGPT App or MCP adapter. The contract is intentionally a thin wrapper over the current local Codex plugin commands and library modules. No app-only logic belongs in the adapter.

The adapter must keep SEAL local-first:

- Read only the workspace paths the caller provides.
- Write only `.seal/` artifacts and reports in that workspace unless a caller supplies an explicit output root.
- Require no network access for MAP, IMPACT, PROVE, VALIDATE, or LAUNCH workflows.
- Return structured data plus a concise `user_summary` that explains the result in plain language.
- Preserve source authority, approval state, confidence, evidence limitations, and visible gaps instead of converting unknowns into passing claims.

The adapter must not claim ChatGPT App availability, marketplace installation, remote publishing, or replacement of human launch approval until those capabilities exist and are proven separately.

## Response Shape

Successful tools return:

```json
{
  "ok": true,
  "data": {},
  "artifact_paths": [],
  "user_summary": "Plain-language summary for a non-expert."
}
```

Failed tools return:

```json
{
  "ok": false,
  "error": {
    "code": "artifact_validation_failed",
    "message": "A concise actionable error.",
    "diagnostics": []
  },
  "user_summary": "What the user can do next."
}
```

Common error codes:

- `input_not_found`: the supplied path does not exist or is outside the allowed workspace.
- `unsupported_input`: the supplied target is not a repository, Markdown plan, or SEAL artifact root supported by the backing command.
- `artifact_validation_failed`: generated or supplied `.seal` artifacts failed schema, reference, coverage, authority, or version checks.
- `missing_artifact`: a required `.seal` artifact is absent for the requested tool.
- `write_failed`: the adapter could not create or update the expected `.seal` output.
- `execution_failed`: the backing command or library function threw an unexpected error.

## Tools

### `seal.ingest_plan`

Purpose: convert a Markdown plan into starter SEAL MAP, IMPACT, PROVE, evidence, debt, and gap-review artifacts.

Backing surface: `seal-invoke` and `invokeSeal(target, options)` from `src/invocation/invoke.mjs`.

Input:

```json
{
  "target_path": "tests/fixtures/markdown-plans/gstack-style.md",
  "output_root": null,
  "dry_run": false
}
```

Output data:

- `target_path`: resolved plan path.
- `target_kind`: `markdown_plan`.
- `output_root`: directory where `.seal/` artifacts were or would be written.
- `artifact_set`: expected artifact names.
- `artifact_paths`: paths for generated MAP, IMPACT, PROVE, evidence, debt, and gap-review files when `dry_run` is false.
- `gaps`: visible ingestion gaps and next actions.
- `user_summary`: what SEAL mapped, what impact and proof records were started, and what still needs authority.

Fixture review:

```bash
node src/cli/seal-invoke.mjs tests/fixtures/markdown-plans/gstack-style.md
```

### `seal.map_project`

Purpose: map repository truth into `.seal/map.yaml` and readable map views.

Backing surface: `seal-inventory`, `seal-map-views`, and repository ingestion used by `seal-invoke`.

Input:

```json
{
  "target_path": "tests/fixtures/repo-tiny",
  "output_root": null,
  "include_views": true
}
```

Output data:

- `target_path`: resolved repository path.
- `target_kind`: `repository`.
- `artifact_paths`: `.seal/map.yaml`, `.seal/reports/map.md`, and `.seal/reports/map.mmd` when views are requested.
- `map_summary`: counts for sources, components, files, dependencies, tests, and visible gaps.
- `coverage_summary`: unmapped files and ignored paths when available.
- `user_summary`: the main components, files, dependencies, and map gaps in plain language.

Fixture review:

```bash
node src/cli/seal-invoke.mjs tests/fixtures/repo-tiny
node src/cli/seal-map-views.mjs tests/fixtures/full-workflow/pass
```

### `seal.validate_artifacts`

Purpose: validate `.seal` artifacts before they are trusted by an adapter or shown as launch evidence.

Backing surface: `seal-validate` and `validateSealArtifacts(rootPath)` from `src/validation/validate.mjs`.

Input:

```json
{
  "root_path": "plugin/fixtures/minimal"
}
```

Output data:

- `valid`: overall boolean.
- `validated`: per-artifact results including artifact type, path, validity, and schema version.
- `diagnostics`: actionable records with file, artifact type, path, message, expected, actual, and fix fields when available.
- `user_summary`: whether the artifact set is usable and the top fix when it is not.

Fixture review:

```bash
node src/cli/seal-validate.mjs plugin/fixtures/minimal
```

### `seal.analyze_impact`

Purpose: explain what a proposed change affects and what proof, approval, or gap work must happen before launch.

Backing surface: `seal-impact` and `writeImpactRecord(rootPath, change)` from `src/impact/change-scope.mjs`.

Input:

```json
{
  "root_path": "tests/fixtures/full-workflow/pass",
  "target": "src/app.mjs",
  "summary": "Assess a change to the app entrypoint."
}
```

Output data:

- `impact_id`: generated `IMPACT-*` artifact id.
- `artifact_paths`: written impact artifact path.
- `affected`: affected components, files, tests, requirements, risks, proof claims, gates, and unknowns.
- `proof_required`: proof obligations with evidence type, validation method, status, and next action.
- `approval_needed`: human approvals required for gates, risks, or unknown authority.
- `gaps`: impact gaps that must be resolved or explicitly accepted.
- `user_summary`: the highest-risk affected areas and next proof action.

Fixture review:

```bash
node src/cli/seal-impact.mjs tests/fixtures/full-workflow/pass src/app.mjs "Assess app entrypoint change."
```

### `seal.generate_launch_report`

Purpose: turn validation, MAP, IMPACT, PROVE, evidence, and gate policy into a launch decision that a non-expert can inspect.

Backing surface: `seal-launch-report` and `writeLaunchReadinessReport(rootPath)` from `src/launch/readiness-report.mjs`.

Input:

```json
{
  "root_path": "tests/fixtures/full-workflow/pass"
}
```

Output data:

- `decision`: launch status, label, and reason.
- `readiness_level`: SRL id, label, drivers, and next action.
- `blockers`: hard launch blockers from validation, proof, impact, approval, and gate policy.
- `known_unknowns`: unresolved map, proof, or policy unknowns.
- `high_risk_assumptions`: accepted or inferred assumptions that still need visibility.
- `artifact_paths`: `.seal/reports/launch-readiness.md`.
- `user_summary`: whether launch is ready, blocked, failed, or needs inspection, with the first next action.

Fixture review:

```bash
node src/cli/seal-launch-report.mjs tests/fixtures/full-workflow/pass
```

### `seal.context_pack`

Purpose: create a compact context pack for an implementation or review agent using only relevant map, impact, proof, evidence, gap, and test records.

Backing surface: `seal-context-pack` and `writeContextPack(rootPath, change)` from `src/context/pack.mjs`.

Input:

```json
{
  "root_path": "tests/fixtures/full-workflow/pass",
  "target": "src/app.mjs",
  "summary": "Prepare implementation context for the app entrypoint change."
}
```

Output data:

- `context_id`: generated context artifact id.
- `artifact_paths`: `.seal/reports/context-pack.json`.
- `scope`: selected components, files, interfaces, tests, impacts, claims, evidence, gaps, and unknowns.
- `omitted_counts`: how much unrelated context was intentionally left out.
- `guardrails`: reminders that inferred records are prompts for inspection and that missing evidence must stay visible.
- `user_summary`: what context is included and which unknowns or gaps remain.

Fixture review:

```bash
node src/cli/seal-context-pack.mjs tests/fixtures/full-workflow/pass src/app.mjs "Prepare implementation context."
```

## Adapter Invariants

- Every tool must call the current command or library module listed above, then shape the result for MCP. Duplicating SEAL domain logic in the adapter would create drift.
- Every generated artifact path must be passed through `seal.validate_artifacts` or the same `validateSealArtifacts` library before it is treated as launch evidence.
- User-facing summaries must use SEAL terms consistently: MAP repo truth, IMPACT proposed changes, PROVE claims with evidence or visible gaps, and LAUNCH readiness with blockers and unknowns.
- A tool may report that authority is missing, but it must not approve missing authority.
- Privacy-sensitive evidence should stay in the local `.seal/evidence/` index with limitations or redaction fields; the MCP response should return references and summaries, not bulk file contents.
- Network permissions are not part of this contract. Publishing, remote sync, and marketplace submission are separate workflows.
