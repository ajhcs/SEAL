---
name: seal-map
description: Map a repository, Markdown plan, or existing .seal workspace into SEAL MAP artifacts with visible components, files, tests, dependencies, source authority, and gaps. Use when the user asks what exists, what is unknown, how a project is structured, or how to make a repo or plan inspectable.
---

# SEAL Map

Use SEAL Map to make a project, plan, or `.seal` workspace inspectable. The result should show what exists, what is connected, what is unknown, and what evidence supports those conclusions.

## Operating Rules

- Inspect the real workspace before summarizing it.
- Prefer repo files, docs, tests, schemas, package metadata, existing `.seal` artifacts, and user-provided plans as source authority.
- Ask only for authority gaps after inspection.
- Label generated inferences separately from observed facts.
- Keep beginner explanations plain while preserving file paths, artifact ids, and command evidence for expert users.
- Do not claim an artifact was generated or validated unless the command ran successfully.

## Workflow

### 1. Choose The Mapping Source

Determine whether the user is mapping:

- A repository or directory.
- A Markdown plan.
- Existing `.seal` artifacts.
- A mixed workspace with code, plans, and generated SEAL files.

If the user does not name a path, use the current workspace after confirming it is the intended project through local inspection.

### 2. Inspect Before Writing

Look for:

- Top-level project files, package metadata, build files, configs, and docs.
- Source directories, tests, schemas, scripts, and generated assets.
- Existing `.seal/map.yaml`, `.seal/proof.yaml`, `.seal/impacts`, `.seal/evidence`, and `.seal/reports`.
- Product plans, issues, or decision records that explain intent.

### 3. Generate Or Refresh MAP Artifacts

Use the supported SEAL commands when artifact generation is requested or useful:

```bash
seal repo map <directory>
seal plan ingest <plan.md>
seal validate <directory>
```

Expected map outputs may include:

- `.seal/map.yaml`
- `.seal/reports/map.md`
- `.seal/reports/map.mmd`
- `.seal/reports/gap-review.md`

If the command surface is unavailable, continue with manual inspection and state that no SEAL command was run.

### 4. Explain The Map

Report the map in user-centered language:

- Components: major areas of the project or plan.
- Files: important files and why they matter.
- Dependencies: services, packages, generated outputs, or runtime assumptions.
- Tests and proof hooks: where confidence can be built.
- Gaps: missing docs, missing tests, unknown ownership, stale artifacts, or unverifiable claims.

Use precise file paths for expert users and plain labels for beginners.

### 5. Validate Connections

When `.seal` artifacts exist, check whether references point to real files and whether schemas validate:

```bash
seal validate <directory>
```

Report failed references as gaps. Do not hide missing files, stale ids, or schema drift.

## Output Format

Use this structure unless the user asks for another format:

```markdown
## SEAL Map

### What Exists
Observed components, files, docs, tests, and artifacts.

### Source Authority
Evidence used to build the map.

### Connections
Dependencies, ownership links, tests, schemas, and artifact references.

### What Is Unknown
Gaps that could not be resolved from local evidence.

### Artifacts
Generated or inspected SEAL files, with validation status.

### Recommended Next Actions
Smallest next steps to close gaps or prepare impact/proof work.
```

## User Modes

- Beginner: explain "map" as "what exists and what is missing".
- Builder: include paths, commands, test locations, dependencies, and likely edit surfaces.
- Reviewer: emphasize stale references, untested areas, and missing authority.
- Expert: include schema validation status, artifact ids, and reference integrity details.

## Handoff

End by stating whether the map is current, what was validated, what remains unknown, and whether the workspace is ready for SEAL Impact or SEAL Proof.
