---
name: seal
description: Plan new features or inspect a plan or repository and produce SEAL MAP, IMPACT, and PROVE artifacts with explicit source authority, evidence, and gaps.
---

# SEAL

Use this skill when the user asks to plan a new feature, map a project, inspect unknowns, analyze impact, attach proof, or prepare launch readiness artifacts.

## Operating Rules

1. Inspect first. Prefer repo files, user-provided plans, command output, and recorded evidence over inference.
2. Infer cautiously. If a conclusion is not directly supported, mark it as an inference and record the source of the inference.
3. Ask only for authority gaps. Do not ask broad setup questions when local inspection can make progress.
4. Make unknowns visible. Missing source authority, unmapped files, absent tests, unclear ownership, and unsupported claims become gap records.
5. Treat proof as claim plus evidence plus gap. A checklist item is not proof unless it has linked evidence or an explicit unresolved gap.
6. Use beginner-safe labels from `plugin/docs/glossary.md` in public workflow copy. Keep MAP, IMPACT, PROVE, evidence, gaps, and gates as internal artifact names.

## P0 Workflow

1. Establish the feature, plan, or repository intent from available source authority.
2. Initialize `.seal` artifacts when artifact work is requested or useful.
3. Ingest the plan or repository.
4. Build or update the map.
5. Review assumptions, missing proof, and launch-impact gaps.
6. Render readable map views.
7. Analyze proposed change impact.
8. Record proof claims, evidence, and gaps.
9. Validate schemas, references, and file coverage.
10. Produce a launch readiness report.

## Invocation

The supported Codex invocation is skill-based: ask Codex to use the SEAL skill on a plan file, gstack-style Markdown output, or repository path. For local validation and smoke tests, use the short RC workflow command: `seal guide <directory|plan.md> [change target] [summary]`, `seal repo map <directory>`, `seal plan ingest <plan.md>`, `seal impact <directory> <target> [summary]`, `seal proof <directory>`, `seal launch <directory>`, and `seal validate <directory>`. `seal guide` writes a beginner-facing guide report with validation-backed next steps, creates missing canonical `.seal/*.yaml` artifacts, preserves existing canonical records, and refreshes generated non-authoritative reports, views, context packs, and indexes. `seal repo map` writes starter artifacts, ingestion gaps, and rendered map views for a repository. `seal plan ingest` writes starter artifacts for a Markdown plan in its containing directory.

Focused maintenance binaries remain available. Run `seal-invoke <path>` to start the same P0 workflow by writing schema-valid starter artifacts for `.seal/map.yaml`, `.seal/impacts/IMPACT-initial.yaml`, `.seal/proof.yaml`, `.seal/evidence/index.yaml`, and `.seal/reports/gap-review.md`. Run `seal-inventory <path>` to walk a repository and write `.seal/map.yaml`, `.seal/reports/map.md`, `.seal/reports/map.mmd`, and `.seal/reports/gap-review.md`. Run `seal-gap-review <path>` to regenerate the ranked ingestion gap review from existing MAP, debt, PROOF, and evidence artifacts. Run `seal-map-views <path>` to re-render readable map views from an existing `.seal/map.yaml`. Run `seal-impact <path> <target> [summary]` to write a change-specific `.seal/impacts/IMPACT-*.yaml` from the current MAP and PROOF artifacts before validating. Run `seal-proof-report <path>` to write `.seal/reports/proof-gaps.md` from proof claims, evidence records, and gap records.

Do not promise alternate command surfaces unless this repository implements and tests them. Non-expert users should provide a target path and a plain request, not internal artifact file names.

## Routing

Start useful work from local inspection. Do not open with a long questionnaire. The routing policy is to ask only for authority gaps after repo files, user text, existing `.seal` artifacts, and command output have been inspected.

### Beginner repo request

Use this route for requests like "Use SEAL to map this repo and tell me what is unknown."

1. Inspect the repository and existing `.seal` artifacts.
2. Initialize `.seal` if it is missing.
3. Ingest observed files, plans, and user-provided facts.
4. Build or update `.seal/map.yaml`.
5. Generate `.seal/reports/gap-review.md` so missing requirements, unclear interfaces, proof gaps, risks, and launch blockers are ranked by impact and confidence.
6. Render `.seal/reports/map.md` and `.seal/reports/map.mmd` so components, file ownership, dependencies, tests, and unknowns are reviewable.
7. Report unknowns as visible gaps, not dropped files or hidden assumptions.
8. Validate schemas, references, and file coverage.

### Plan request

Use this route when the user asks to plan, scope, de-risk, or prepare a new feature, product change, implementation plan, roadmap item, or gstack-style plan.

1. Inspect available repo files, docs, issues, plans, tests, and existing `.seal` artifacts before asking questions.
2. Identify source authority, assumptions, gaps, target users, constraints, and non-goals.
3. Draft traceable requirements and acceptance criteria with source or assumption labels.
4. Seed likely MAP components, files, dependencies, tests, docs, and artifact surfaces.
5. Identify IMPACT questions: what could break, who is affected, and what decisions are still missing.
6. Define PROOF needs: tests, manual checks, evidence records, review signoff, metrics, and launch gates.
7. Ask only for missing authority or decisions that cannot be inferred from local materials.

### Impact request

Use this route when the user asks what a proposed change affects or what could break.

1. Inspect the current map and repo evidence.
2. Update the map if repo coverage is stale.
3. Create or update an impact record.
4. Link affected requirements, components, files, tests, schemas, risks, launch gates, proof needs, proof obligations, approval obligations, and visible gaps.
5. Ask only for missing change intent or source authority.

### Proof request

Use this route when the user asks for proof, evidence, validation, gates, or launch readiness.

1. Inspect map, impact records, proof claims, and evidence index.
2. Link each claim to evidence or an explicit gap.
3. Treat unsupported claims as gaps.
4. Generate a proof gap report when the user needs a readable distinction between proven, assumed, blocked, stale, failed, and invalid claims.
5. Validate launch gates with claim, evidence, and gap status.

### Advanced artifact request

Use this route when the user names `.seal` files, schemas, reference integrity, validators, or file coverage directly.

1. Inspect the named artifacts first.
2. Validate schemas and references.
3. Report exact invalid links, missing authority, and coverage gaps.
4. Edit artifacts or validators only as narrowly as the request requires.
