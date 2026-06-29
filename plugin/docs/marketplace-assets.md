# Marketplace And Launch Assets

SEAL is currently packaged as a local Codex plugin and terminal command set. These assets are for release preparation, README copy, internal launch notes, and later adapter work. They must not be used as ChatGPT App or marketplace submission proof until a supported adapter exists.

Route new users to `plugin/docs/first-run.md` before asking them to judge the artifact files directly.

## Listing Copy

Name: SEAL

Short description: Map repository truth, explain impact, and prove launch readiness with local artifacts that name evidence, gaps, and blockers.

Long description:

SEAL helps Codex inspect a repository or Markdown plan and produce a local `.seal` evidence package. It maps what exists, records what a proposed change affects, links claims to proof, and writes a plain-language launch-readiness report. SEAL is useful when a non-expert needs to understand whether a project is ready, what is still unknown, and which evidence or authority is missing.

Primary promise:

- MAP repo truth.
- IMPACT proposed changes.
- PROVE claims with evidence or visible gaps.
- Guide non-experts with plain language.

Do not claim:

- ChatGPT App availability.
- Marketplace installation.
- Remote publishing.
- Replacement of human approval, source authority, tests, security review, legal review, or launch ownership.

## Supported Inputs

- A repository path that SEAL can inspect locally.
- A Markdown plan, ticket, or launch note.
- A gstack-style Markdown plan with goals, implementation notes, risks, assumptions, and gates.
- Existing `.seal` artifacts that need validation, proof-gap review, launch reporting, or context packaging.

## Supported Outputs

- `.seal/map.yaml`
- `.seal/debt.yaml`
- `.seal/impacts/IMPACT-*.yaml`
- `.seal/proof.yaml`
- `.seal/evidence/index.yaml`
- `.seal/reports/gap-review.md`
- `.seal/reports/map.md`
- `.seal/reports/map.mmd`
- `.seal/reports/proof-gaps.md`
- `.seal/reports/launch-readiness.md`
- `.seal/reports/context-pack.json`

## Terminal Capture Recipes

Use these commands from the repository root to capture release screenshots or terminal transcripts. Capture the command, exit status, and the generated report path.

Plugin smoke:

```bash
npm run smoke:plugin
```

Expected summary: plugin manifest validation passes, `seal-invoke` runs on a fixture repository, starter artifacts are generated, and `seal-validate` passes on the generated set.

Markdown plan import:

```bash
node src/cli/seal-invoke.mjs tests/fixtures/markdown-plans/gstack-style.md
```

Expected summary: SEAL writes starter artifacts under `.seal`, extracts plan items where possible, and records unresolved review work in `.seal/reports/gap-review.md`.

Launch readiness:

```bash
node src/cli/seal-launch-report.mjs tests/fixtures/full-workflow/pass
```

Expected summary: `.seal/reports/launch-readiness.md` gives a beginner-readable decision, SEAL readiness level, evidence status, blockers, warnings, and next actions.

Artifact validation:

```bash
node src/cli/seal-validate.mjs plugin/fixtures/minimal
```

Expected summary: the minimal MAP, IMPACT, PROOF, and evidence fixture validates without schema, reference, authority, or file coverage errors.

## Example Output Talking Points

- The map shows observed files, components, requirements, source authority, and visible unknowns.
- The impact record names affected scope and proof obligations for a specific target.
- The proof report separates supported claims from claims that still need evidence.
- The launch report says pass, warn, or block, then explains the evidence and gaps behind that decision in plain language.
- Validation diagnostics name the artifact file, path, expected value shape, actual value, and suggested fix.

## Limitations

- SEAL is local-first. Network access is not required for P0 artifact generation.
- SEAL reports what it can inspect. Missing files, missing authority, and missing evidence remain explicit gaps.
- Valid artifacts do not automatically mean a launch is approved.
- Marketplace and ChatGPT App metadata are intentionally separate future adapter work.
- Support routing depends on the repository publication path. Until a remote is configured, use the local bead tracker and the release owner channel for support triage.

## Support Path

For local development, file issues with `bd` in this repository and include the command, input path, generated `.seal` report, and validation output. For published releases, route users to the configured repository issue tracker or owner support channel once `seal-publish-remote` is resolved.
