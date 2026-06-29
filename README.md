# SEAL

SEAL is a Codex plugin workspace for turning plans and repositories into visible MAP, IMPACT, and PROVE artifacts.

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

The supported invocation is the SEAL skill in Codex. For local smoke tests, run `npm run smoke:plugin` to check plugin discovery, command metadata, starter invocation, generated artifacts, and validation. For direct commands, run `seal-invoke <path>` against a repository or Markdown plan to write starter `.seal` artifacts and `.seal/reports/gap-review.md`, run `seal-inventory <path>` to write `.seal/map.yaml`, `.seal/reports/map.md`, `.seal/reports/map.mmd`, and `.seal/reports/gap-review.md`, run `seal-gap-review <path>` to regenerate the ranked ingestion gap review from existing artifacts, run `seal-impact <path> <target> [summary]` to write a change impact record with proof and approval obligations, run `seal-context-pack <path> <target> [summary]` to write `.seal/reports/context-pack.json`, run `seal-proof-report <path>` to write `.seal/reports/proof-gaps.md`, then run `seal-validate <path>` to check artifact structure, references, file coverage, and source authority.

## Layout

- `plugin/` - Codex plugin product root.
- `plugin/manifest.json` - Validated plugin metadata for the local Codex plugin scaffold.
- `plugin/skills/seal/SKILL.md` - Initial SEAL skill entrypoint.
- `plugin/schemas/` - Authoritative artifact schema placeholders for MAP, IMPACT, PROOF, and evidence index files.
- `plugin/fixtures/` - Small artifact examples used by tests and future validators.
- `plugin/docs/` - Product contract, plain-language glossary, contributor, first-run, artifact template, reference, source authority, proof taxonomy, and gate criteria notes.
- `src/cli/seal-gap-review.mjs` - Local ingestion gap review entrypoint for writing `.seal/reports/gap-review.md`.
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
