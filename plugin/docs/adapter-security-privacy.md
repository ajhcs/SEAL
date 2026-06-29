# Adapter Security and Privacy Boundaries

This document defines the security and privacy constraints for a future ChatGPT App, MCP adapter, or hosted wrapper around SEAL. The current Codex plugin is local-first: it reads user-selected workspace files, writes local `.seal/` artifacts, and requires no network access for MAP, IMPACT, PROVE, validation, context, or launch-readiness workflows.

The adapter must preserve that product contract. App presentation can summarize SEAL results, but it must not broaden data access, transmit raw project content, hide evidence limitations, or imply human approval.

## Trust Boundaries

### Local Codex Plugin

- Runs against a local workspace selected by the user.
- Reads only the target path, existing `.seal/` artifacts, and referenced local files needed to MAP repo truth, IMPACT proposed changes, and PROVE claims.
- Writes only `.seal/` artifacts and reports in the selected workspace unless an explicit output root is supplied.
- Requires no network access for supported local workflows.
- Returns local file references, summaries, diagnostics, limitations, and next actions.

### Future ChatGPT App or MCP Adapter

- Must call the existing command or library surfaces documented in `mcp-tool-contract.md`; no app-only launch logic belongs in the adapter.
- Must treat hosted model, app UI, MCP server, and local workspace as separate trust zones.
- Must minimize data returned across the boundary: send structured summaries, counts, statuses, local artifact references, and redaction notes instead of bulk source files.
- Must not claim ChatGPT App availability, marketplace installation, remote publishing, or replacement of human launch approval until those surfaces exist and are separately proven.

## Data Classes

| Class | Examples | Default handling |
| --- | --- | --- |
| Workspace locator | User-supplied repository path, Markdown plan path, explicit output root | Accept only when supplied by the caller; reject missing or out-of-scope paths with `input_not_found` or `unsupported_input`. |
| Source content | Application code, docs, plans, requirements, launch notes | Inspect locally as needed; do not return bulk source files in App or MCP responses. |
| SEAL artifacts | `.seal/map.yaml`, `.seal/impacts/IMPACT-*.yaml`, `.seal/proof.yaml`, `.seal/evidence/index.yaml`, `.seal/reports/*.md`, `.seal/reports/*.json` | Validate before trusting; return artifact paths, selected refs, status, limitations, and next actions. |
| Evidence records | Command output refs, screenshots, transcripts, external links, manual notes | Return evidence status, capture date, limitation, and redaction state; do not return secret values or transcript bodies by default. |
| Diagnostics | Validation errors, missing authority, malformed schema versions, unresolved blockers | Return file, artifact type, path, message, expected, actual, and fix fields when available. |
| User prompts and summaries | Change summary, review goal, launch question | Store only inside requested `.seal/` outputs when needed for traceability. |
| Secrets and credentials | API keys, tokens, passwords, private keys, cookies, auth headers | Never intentionally collect, store, echo, or transmit; if detected, report a redacted diagnostic and path only. |

## Read Policy

- Read only caller-provided targets and local files referenced by those targets or existing `.seal/` artifacts.
- Do not crawl the user's home directory, cloud drive, browser state, shell history, environment variables, credential stores, or unrelated repositories.
- Obey repository ignore rules and SEAL's existing file classification behavior when mapping a project.
- Treat missing authority as a visible gap. Do not fetch outside sources or network evidence unless a future workflow explicitly requires it and documents the user approval path.

## Write Policy

- Write generated artifacts only under `.seal/` in the selected workspace, or under an explicit output root supplied by the caller.
- Do not modify product source files, tests, dependency manifests, git metadata, issue trackers, or remote services from adapter tools.
- Generated reports must keep blockers, unknowns, approval state, source authority, evidence limitations, and SRL drivers visible.
- Failed or partial writes must return `write_failed` or `execution_failed` with an actionable summary and must not imply the artifact set is valid.

## Return Policy

Adapter responses should follow `mcp-tool-contract.md` and `app-output-schemas.md`:

- Return `ok`, `data`, `artifact_paths`, and `user_summary`.
- Put UI-ready cards under `data.ui` when an App surface needs a compact display.
- Include source refs, counts, statuses, limitations, and next actions.
- Do not include bulk source files, evidence payloads, transcript bodies, secret values, private keys, cookies, auth headers, or unrelated local paths.
- Use `unknown`, `blocked`, or `fail` when evidence, authority, validation, or approval is missing.
- Preserve redaction fields such as `redacted: true`, `redaction_reason`, and `safe_reference` when a future evidence record requires them.

## Transmission Policy

- The current local plugin requires no network access for core workflows.
- A hosted App or MCP adapter must document exactly what leaves the local workspace before submission or release.
- Network transmission must be limited to the minimum structured result needed for the requested App interaction.
- Remote publishing, marketplace submission, telemetry, support upload, or evidence synchronization are separate workflows and require explicit product, privacy, and user-approval review.
- Authentication and session identifiers must stay outside SEAL artifacts unless a future security review approves a redacted reference format.

## Secret Handling

- Secret-like values must be redacted before display, logging, storage, or transmission.
- Diagnostics should report the local path, artifact field, and reason, not the secret value.
- Evidence records should prefer stable references to captured proof over raw command output when output could contain credentials.
- App cards must describe secret-related blockers in plain language without exposing the secret.

## Review Checklist

Before an adapter release, verify:

- MAP, IMPACT, PROVE, validation, context, and launch report commands still pass without network access.
- App or MCP responses contain summaries and artifact references, not raw source or secret values.
- Validation failures, unsupported schema versions, missing authority, unknowns, and blocked approvals remain visible.
- Generated cards preserve evidence limitations and redaction state.
- Hosted submission materials include privacy policy, support path, data retention statement, and current platform-specific review requirements.

## Fixture Review Commands

Use these local commands to review the privacy boundary before adapter work:

```bash
node src/cli/seal-invoke.mjs tests/fixtures/markdown-plans/gstack-style.md
node src/cli/seal-context-pack.mjs tests/fixtures/full-workflow/pass src/app.mjs "Prepare implementation context."
node src/cli/seal-launch-report.mjs tests/fixtures/full-workflow/pass
node src/cli/seal-validate.mjs plugin/fixtures/minimal
npm run smoke:plugin
```
