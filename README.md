# SEAL

SEAL is a Codex plugin workspace for turning plans and repositories into visible ONTOLOGY, MAP, IMPACT, and PROVE artifacts.

The product contract is in `plugin/docs/product-contract.md`: SEAL accepts a repository, Markdown plan, or existing `.seal` workspace and returns traceable artifacts that expose mapped project state, change impact, proof, validation errors, and launch readiness without hiding weak authority or unknowns. The public UX copy map is in `plugin/docs/glossary.md`: it keeps internal artifact names like MAP, IMPACT, and PROVE while using plain labels such as "what exists", "what changes", "what would prove it", and "what blocks launch".

The P0 workflow is:

1. Initialize a `.seal` workspace.
2. Ingest a plan or repository.
3. Map components, files, interfaces, sources, and unknowns.
4. Review assumptions and launch-impact gaps.
5. Render readable views of the map.
6. Analyze change impact.
7. Attach proof as claim, evidence, and gap records.
8. Validate artifact structure, references, file coverage, and source authority.
9. Evaluate plan, build, prove, and launch gates.
10. Produce a launch readiness report.

The supported invocation is the SEAL skill in Codex. For local smoke tests, run `npm run smoke:plugin` to check plugin discovery, command metadata, starter invocation, generated artifacts, and validation.

From a cloned checkout, install dependencies with `npm install` or `npm ci`, then run package binaries with `npm exec -- <command> ...`. Use the short `seal` command for the RC workflow:

```bash
npm exec -- seal repo map <directory>
npm exec -- seal plan ingest <plan.md>
npm exec -- seal impact <directory> <target> [summary]
npm exec -- seal proof <directory>
npm exec -- seal launch <directory>
npm exec -- seal validate <directory>
```

`seal repo map <directory>` initializes repo-backed `.seal` artifacts and rendered map views. `seal plan ingest <plan.md>` initializes plan-backed `.seal` artifacts in the plan file's containing directory and records sibling workspace files as visible context with review gaps. When `<plan.md>` is used, follow-up commands should use the containing workspace directory, not the Markdown file path.

For a full repository workflow:

```bash
npm exec -- seal repo map <directory>
npm exec -- seal impact <directory> <target> [summary]
npm exec -- seal-context-pack <directory> <target> [summary]
npm exec -- seal proof <directory>
npm exec -- seal launch <directory>
npm exec -- seal validate <directory>
```

The legacy `seal-*` binaries remain available for focused maintenance: `seal-invoke <path>` starts the supported workflow for a plan file or repository path; `seal-inventory <directory>` refreshes `.seal/map.yaml`, `.seal/reports/map.md`, `.seal/reports/map.mmd`, and `.seal/reports/gap-review.md`, but it does not create proof or evidence artifacts by itself; `seal-gap-review <directory>` regenerates the ranked ingestion gap review; and `seal-validate <directory>` checks artifact structure, references, file coverage, and source authority.

## Layout

- `plugin/` - Installable Codex plugin root for skills and plugin archive metadata.
- `plugin/.codex-plugin/plugin.json` - Codex ingestion manifest. Paths stay inside `plugin/`.
- `plugin/manifest.json` - SEAL-owned product metadata for the wider repo-local scaffold.
- `plugin/skills/seal/SKILL.md` - Initial SEAL skill entrypoint.
- `plugin/schemas/` - Authoritative artifact schema placeholders for ONTOLOGY, MAP, IMPACT, PROOF, and evidence index files.
- `plugin/fixtures/` - Small artifact examples used by tests and future validators.
- `plugin/docs/` - Product contract, plain-language glossary, contributor, first-run, artifact template, reference, source authority, proof taxonomy, and gate criteria notes.
- `plugin/docs/example-workflows.md` - Runnable examples for plain Markdown plans, gstack-style plans, and existing repositories.
- `plugin/docs/release-checklist.md` - Versioning, quality gate, bead closeout, and git landing checklist for releases.
- `src/cli/seal-gap-review.mjs` - Local ingestion gap review entrypoint for writing `.seal/reports/gap-review.md`.
- `src/cli/seal.mjs` - Short RC workflow command for `repo map`, `plan ingest`, `impact`, `proof`, `launch`, and `validate`.
- `src/cli/seal-invoke.mjs` - Local smokeable entrypoint for the supported skill workflow.
- `src/cli/seal-inventory.mjs` - Local repository inventory entrypoint for writing `.seal/map.yaml`, rendered map views, and ingestion gap review.
- `src/cli/seal-map-views.mjs` - Local map view entrypoint for rendering existing `.seal/map.yaml` artifacts.
- `src/cli/seal-impact.mjs` - Local change impact entrypoint for writing `.seal/impacts/IMPACT-*.yaml`.
- `src/cli/seal-context-pack.mjs` - Local context-pack entrypoint for writing `.seal/reports/context-pack.json`.
- `src/cli/seal-proof-report.mjs` - Local proof report entrypoint for writing `.seal/reports/proof-gaps.md`.
- `src/cli/seal-validate.mjs` - Local artifact validator with actionable diagnostics.
- `tests/` - Local scaffold and regression checks.

## Local Check

```bash
npm test
```

```bash
npm run smoke:plugin
```
